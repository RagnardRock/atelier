// La bibliothèque : tes livres en couvertures (ou en liste), rangés en rayons (En cours, À lire,
// Terminés, tes collections, les langues), avec la recherche et le tri.
//
// Les fiches des livres sont gardées par main.js dans bibliotheque.json ; les fichiers restent où ils
// sont. Un livre ajouté (bouton, glisser-déposer, ou trouvé dans un dossier surveillé) est ouvert une
// fois en arrière-plan pour lire son titre, son auteur, sa langue et sa couverture (livre.js).

import { etat, ecrireConfig } from './etat.js';
import { ouvrirLivre, metadonnees, couvertureJpeg, formatDe, nomLangue } from './livre.js';

let livres = {};        // id → fiche
let collections = [];   // [{ id, nom }]
const introuvables = new Set(); // ids des livres dont le fichier n'est plus là
let rayon = { type: 'tous' };
let recherche = '';
let ouvrirLivreCb = () => {};
let importEnCours = null;

const K = window.kenning;

// --- Données ---

const liste = () => Object.values(livres);
const livre = (id) => livres[id] || null;
const parChemin = (chemin) => liste().find((l) => l.chemin.toLowerCase() === String(chemin).toLowerCase()) || null;

// Un identifiant court et stable pour chaque livre (tiré de son premier chemin, puis gardé même si le
// fichier est déplacé) : il nomme aussi sa couverture (couvertures/<id>.jpg).
async function nouvelId(chemin) {
  const h = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(String(chemin).toLowerCase()));
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function maj(id, changes) {
  if (!livres[id]) return;
  Object.assign(livres[id], changes);
  await K.majLivres({ [id]: changes });
}
async function majCollections(nouvelles) {
  collections = nouvelles;
  await K.majCollections(collections);
}

// --- Ajouter des livres ---

// Les fichiers qui n'ont pas pu être lus (abîmés, protégés par DRM) ne sont pas réessayés à chaque
// passage dans les dossiers, tant qu'ils ne changent pas.
const illisibles = () => etat.config.illisibles || {};

async function importer(chemins, { dire = true } = {}) {
  // Un seul import à la fois : les suivants attendent leur tour.
  const precedent = importEnCours;
  const tache = (async () => {
    await precedent;
    const ajoutes = [], erreurs = [];
    const aFaire = [...new Set(chemins.map(String))].filter((c) => !parChemin(c));
    let fait = 0;
    const majStatut = () => { $('#status-droite').textContent = aFaire.length > 1 && fait < aFaire.length ? `Ajout des livres : ${fait} sur ${aFaire.length}…` : ''; };
    for (const chemin of aFaire) {
      majStatut();
      try {
        const fiche = await importerUn(chemin);
        if (fiche) ajoutes.push(fiche);
      } catch (err) {
        erreurs.push(`${nomFichier(chemin)} : ${cleanError(err)}`);
        const infos = await K.infosFichier(chemin).catch(() => null);
        if (infos) await ecrireConfig({ illisibles: { ...illisibles(), [chemin]: infos.modifie } });
      }
      fait++;
      // On montre les livres au fur et à mesure (une grande bibliothèque prend un moment).
      if (fait % 8 === 0) rendre();
    }
    majStatut();
    rendre();
    if (dire && ajoutes.length) notify(ajoutes.length === 1 ? `« ${ajoutes[0].titre} » ajouté à la bibliothèque.` : `${ajoutes.length} livres ajoutés à la bibliothèque.`, 'success', 5000);
    if (erreurs.length) notify(`${erreurs.length === 1 ? 'Un fichier n\'a pas pu être ajouté' : `${erreurs.length} fichiers n'ont pas pu être ajoutés`} :\n${erreurs.slice(0, 5).join('\n')}${erreurs.length > 5 ? '\n…' : ''}`, 'warning', 15000);
    return ajoutes;
  })();
  importEnCours = tache.catch(() => {});
  return tache;
}

async function importerUn(chemin) {
  const doc = await K.lireLivre(chemin);
  // Un livre déplacé ou renommé (même nom et même taille qu'un livre introuvable) : on garde sa fiche,
  // sa progression et ses surlignages, et on note seulement son nouveau chemin.
  const deplace = liste().find((l) => introuvables.has(l.id) && nomFichier(l.chemin).toLowerCase() === doc.nom.toLowerCase() && l.taille === doc.taille);
  if (deplace) {
    introuvables.delete(deplace.id);
    await maj(deplace.id, { chemin: doc.chemin });
    return null;
  }
  const book = await ouvrirLivre({ bytes: doc.bytes, nom: doc.nom });
  const m = metadonnees(book, doc.nom);
  const id = await nouvelId(doc.chemin);
  const couverture = await couvertureJpeg(book);
  if (couverture) await K.ecrireCouverture(id, couverture);
  const fiche = {
    id,
    chemin: doc.chemin,
    taille: doc.taille,
    format: formatDe(doc.nom),
    ...m,
    couverture: couverture ? Date.now() : 0,
    ajoute: Date.now(),
    lu: 0,
    progression: 0,
    position: null,
    statut: 'a-lire',
    collections: rayon.type === 'collection' ? [rayon.valeur] : [],
    surlignages: [],
    marquePages: [],
    tempsLecture: 0,
    note: '',
  };
  livres[id] = fiche;
  await K.majLivres({ [id]: fiche });
  return fiche;
}

async function choisirEtAjouter() {
  try {
    const chemins = await K.choisirLivres();
    if (chemins.length) await importer(chemins);
  } catch (err) {
    notify(cleanError(err), 'error');
  }
}

// Les dossiers surveillés : on y cherche les livres pas encore dans la bibliothèque.
async function parcourirDossiers({ dire = true } = {}) {
  const dossiers = etat.config.dossiers || [];
  if (!dossiers.length) return;
  const fichiers = await K.scanner(dossiers);
  const ill = illisibles();
  const nouveaux = fichiers.filter((f) => !parChemin(f.chemin) && ill[f.chemin] !== f.modifie).map((f) => f.chemin);
  await verifierFichiers();
  if (nouveaux.length) await importer(nouveaux, { dire });
}

// Les livres dont le fichier a disparu sont grisés (et retrouvés s'ils réapparaissent ailleurs).
async function verifierFichiers() {
  const tous = liste();
  const existe = await K.existent(tous.map((l) => l.chemin));
  introuvables.clear();
  tous.forEach((l, i) => { if (!existe[i]) introuvables.add(l.id); });
  rendre();
}

// --- Rayons ---

const STATUTS = { 'a-lire': 'À lire', 'en-cours': 'En cours', termine: 'Terminé' };

function rayonsFixes() {
  const tous = liste();
  const r = [
    { type: 'tous', nom: 'Tous les livres', icone: 'library', compte: tous.length },
    { type: 'en-cours', nom: 'En cours', icone: 'book', compte: tous.filter((l) => l.statut === 'en-cours').length },
    { type: 'a-lire', nom: 'À lire', icone: 'bookmark', compte: tous.filter((l) => l.statut === 'a-lire').length },
    { type: 'termine', nom: 'Terminés', icone: 'pass', compte: tous.filter((l) => l.statut === 'termine').length },
    { type: 'surlignes', nom: 'Avec surlignages', icone: 'symbol-color', compte: tous.filter((l) => l.surlignages?.length).length },
  ];
  if (introuvables.size) r.push({ type: 'introuvables', nom: 'Fichiers introuvables', icone: 'warning', compte: introuvables.size, attention: true });
  return r;
}

const memeRayon = (a, b) => a.type === b.type && (a.valeur ?? null) === (b.valeur ?? null);

function rendreRayons() {
  const nav = $('#rayons-liste');
  nav.innerHTML = '';
  const ligne = (r) => {
    const b = el('button', { type: 'button', className: `rayon${memeRayon(r, rayon) ? ' actif' : ''}${r.attention ? ' attention' : ''}`, title: r.nom, onclick: () => { rayon = { type: r.type, valeur: r.valeur }; rendre(); $('#biblio-defile').scrollTop = 0; } },
      el('i', { className: `codicon codicon-${r.icone}` }),
      el('span', { className: 'rayon-nom', textContent: r.nom }),
      el('span', { className: 'rayon-compte', textContent: r.compte }));
    if (r.type === 'collection') {
      b.oncontextmenu = (e) => {
        e.preventDefault();
        Menu.ouvrir(e.clientX, e.clientY, [
          { libelle: 'Renommer la collection', icone: 'edit', run: () => renommerCollection(r.valeur) },
          { libelle: 'Supprimer la collection', icone: 'trash', run: () => supprimerCollection(r.valeur) },
        ]);
      };
      // Glisser un livre sur une collection l'y range.
      b.ondragover = (e) => { if (e.dataTransfer.types.includes('kenning/livre')) { e.preventDefault(); b.classList.add('cible-depot'); } };
      b.ondragleave = () => b.classList.remove('cible-depot');
      b.ondrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.remove('cible-depot');
        const id = e.dataTransfer.getData('kenning/livre');
        if (id) await ranger(id, r.valeur, true);
      };
    }
    nav.append(b);
  };
  rayonsFixes().forEach(ligne);

  nav.append(el('div', { className: 'rayon-titre' }, el('span', { textContent: 'Collections' }), bouton('add', 'Nouvelle collection', () => nouvelleCollection())));
  if (!collections.length) nav.append(el('p', { className: 'vide-texte', textContent: 'Crée des collections pour ranger tes livres (Polonais, Fantasy…). Glisse un livre sur une collection pour l\'y ranger.' }));
  for (const c of collections) ligne({ type: 'collection', valeur: c.id, nom: c.nom, icone: 'folder', compte: liste().filter((l) => l.collections?.includes(c.id)).length });

  // Les langues, dès qu'il y en a deux (pratique pour retrouver ses livres en polonais).
  const langues = new Map();
  for (const l of liste()) langues.set(l.langue || '', (langues.get(l.langue || '') || 0) + 1);
  if (langues.size > 1) {
    nav.append(el('div', { className: 'rayon-titre' }, el('span', { textContent: 'Langues' })));
    for (const [code, n] of [...langues].sort((a, b) => b[1] - a[1])) {
      const nom = code ? nomLangue(code) : 'Langue inconnue';
      ligne({ type: 'langue', valeur: code, nom: nom.charAt(0).toUpperCase() + nom.slice(1), icone: 'globe', compte: n });
    }
  }
}

async function nouvelleCollection(pourLivre) {
  const v = await Dialogs.form({ title: 'Nouvelle collection', okLabel: 'Créer', fields: [{ key: 'nom', label: 'Nom', type: 'text', value: '', placeholder: 'Polonais, Fantasy nordique…' }] });
  const nom = v?.nom?.trim();
  if (!nom) return null;
  const c = { id: `c${Date.now().toString(36)}`, nom };
  await majCollections([...collections, c]);
  if (pourLivre) await ranger(pourLivre, c.id, true);
  rendre();
  return c;
}
async function renommerCollection(id) {
  const c = collections.find((x) => x.id === id);
  const v = await Dialogs.form({ title: 'Renommer la collection', okLabel: 'Renommer', fields: [{ key: 'nom', label: 'Nom', type: 'text', value: c.nom }] });
  if (!v?.nom?.trim()) return;
  await majCollections(collections.map((x) => (x.id === id ? { ...x, nom: v.nom.trim() } : x)));
  rendre();
}
async function supprimerCollection(id) {
  const c = collections.find((x) => x.id === id);
  const n = liste().filter((l) => l.collections?.includes(id)).length;
  const ok = await Dialogs.ask('Supprimer la collection', `Supprimer la collection « ${c.nom} » ? ${n ? `Ses ${n} livre(s) restent dans la bibliothèque.` : ''}`, [{ label: 'Annuler', value: false }, { label: 'Supprimer', value: true, primary: true }]);
  if (!ok) return;
  await majCollections(collections.filter((x) => x.id !== id));
  for (const l of liste()) if (l.collections?.includes(id)) await maj(l.id, { collections: l.collections.filter((x) => x !== id) });
  if (rayon.type === 'collection' && rayon.valeur === id) rayon = { type: 'tous' };
  rendre();
}
async function ranger(id, collectionId, dedans) {
  const l = livre(id);
  if (!l) return;
  const actuelles = new Set(l.collections || []);
  if (dedans) actuelles.add(collectionId); else actuelles.delete(collectionId);
  await maj(id, { collections: [...actuelles] });
  rendre();
  if (dedans) notify(`« ${l.titre} » rangé dans ${collections.find((c) => c.id === collectionId)?.nom}.`, 'success', 3000);
}

// --- Filtre, recherche, tri ---

const normaliser = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function livresAffiches() {
  let l = liste();
  switch (rayon.type) {
    case 'en-cours': case 'a-lire': case 'termine': l = l.filter((x) => x.statut === rayon.type); break;
    case 'collection': l = l.filter((x) => x.collections?.includes(rayon.valeur)); break;
    case 'langue': l = l.filter((x) => (x.langue || '') === rayon.valeur); break;
    case 'introuvables': l = l.filter((x) => introuvables.has(x.id)); break;
    case 'surlignes': l = l.filter((x) => x.surlignages?.length); break;
    default: break;
  }
  if (recherche) {
    const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
    l = l.filter((x) => { const t = normaliser(`${x.titre} ${x.auteur} ${x.serie} ${x.editeur} ${nomFichier(x.chemin)}`); return mots.every((m) => t.includes(m)); });
  }
  const tri = etat.config.tri;
  const cles = {
    lu: (a, b) => (b.lu || 0) - (a.lu || 0) || (b.ajoute || 0) - (a.ajoute || 0),
    ajoute: (a, b) => (b.ajoute || 0) - (a.ajoute || 0),
    titre: (a, b) => collator.compare(a.titre, b.titre),
    auteur: (a, b) => collator.compare(a.auteur || '~', b.auteur || '~') || collator.compare(a.serie || '', b.serie || '') || (a.numeroSerie || 0) - (b.numeroSerie || 0) || collator.compare(a.titre, b.titre),
    progression: (a, b) => (b.progression || 0) - (a.progression || 0),
  };
  return l.sort(cles[tri] || cles.lu);
}

// --- Affichage ---

// La couverture d'un livre : son image, ou une couverture dessinée avec son titre.
function couverture(l) {
  const c = el('div', { className: 'couv' });
  if (l.couverture) {
    c.append(el('img', { src: `kenning://couvertures/${l.id}.jpg?v=${l.couverture}`, alt: '', loading: 'lazy', draggable: false }));
  } else {
    let h = 0;
    for (const ch of l.titre || '') h = (h * 31 + ch.charCodeAt(0)) % 360;
    c.classList.add('couv-generee');
    c.style.setProperty('--teinte', h);
    c.append(el('b', { textContent: l.titre }), el('i', { textContent: l.auteur || '' }));
  }
  c.append(el('span', { className: 'couv-format', textContent: l.format }));
  if (l.statut === 'termine') c.append(el('span', { className: 'couv-fini', title: 'Terminé' }, el('i', { className: 'codicon codicon-check' })));
  return c;
}

function etiquetteProgression(l) {
  if (introuvables.has(l.id)) return 'Introuvable';
  if (l.statut === 'termine') return 'Terminé';
  if (!l.progression) return l.lu ? 'Commencé' : 'Nouveau';
  return pourcent(l.progression);
}

function carte(l) {
  const ouvrir = () => ouvrirLivreCb(l.id);
  const c = el('div', { className: `livre${introuvables.has(l.id) ? ' introuvable' : ''}`, tabIndex: 0, title: `${l.titre}${l.auteur ? `\n${l.auteur}` : ''}`, draggable: true, onclick: ouvrir, onkeydown: (e) => { if (e.key === 'Enter') ouvrir(); }, oncontextmenu: (e) => { e.preventDefault(); menuLivre(l, e.clientX, e.clientY); } },
    couverture(l),
    l.progression && l.statut !== 'termine' ? el('div', { className: 'barre-prog-mini' }, el('div', { style: { width: pourcent(l.progression).replace(' ', '') } })) : null,
    el('span', { className: 'livre-titre', textContent: l.titre }),
    el('span', { className: 'livre-auteur', textContent: l.auteur || ' ' }));
  c.ondragstart = (e) => { e.dataTransfer.setData('kenning/livre', l.id); e.dataTransfer.effectAllowed = 'copy'; };
  return c;
}

function ligne(l) {
  const ouvrir = () => ouvrirLivreCb(l.id);
  const r = el('div', { className: `ligne-livre${introuvables.has(l.id) ? ' introuvable livre' : ''}`, tabIndex: 0, draggable: true, onclick: ouvrir, onkeydown: (e) => { if (e.key === 'Enter') ouvrir(); }, oncontextmenu: (e) => { e.preventDefault(); menuLivre(l, e.clientX, e.clientY); } },
    couverture(l),
    el('span', { className: 'ligne-titre', textContent: l.titre }),
    el('span', { className: 'ligne-muted', textContent: l.auteur }),
    el('span', { className: 'ligne-muted col-langue', textContent: nomLangue(l.langue) }),
    el('span', { className: 'ligne-muted', textContent: l.format }),
    el('span', { className: 'ligne-muted', textContent: etiquetteProgression(l) }),
    el('span', { className: 'ligne-muted col-lu', textContent: l.lu ? quand(l.lu) : '' }));
  r.ondragstart = (e) => { e.dataTransfer.setData('kenning/livre', l.id); };
  return r;
}

// Le temps qu'il reste pour finir un livre (vitesse de lecture mesurée, voir lecture.js).
function tempsRestant(l) {
  const vitesse = etat.config.vitesse || 1600; // octets de texte lus par minute
  return (l.tailleTexte || 0) * (1 - (l.progression || 0)) / vitesse;
}

function rendreReprendre() {
  const zone = $('#reprendre');
  const enCours = liste().filter((l) => l.statut === 'en-cours' && l.lu && !introuvables.has(l.id)).sort((a, b) => b.lu - a.lu)[0];
  const montrer = enCours && !recherche && (rayon.type === 'tous' || rayon.type === 'en-cours');
  zone.hidden = !montrer;
  if (!montrer) return;
  zone.innerHTML = '';
  zone.append(couverture(enCours),
    el('div', { className: 'reprendre-texte' },
      el('span', { className: 'reprendre-eyebrow', textContent: 'Reprendre la lecture' }),
      el('span', { className: 'reprendre-titre', textContent: enCours.titre }),
      el('span', { className: 'reprendre-infos', textContent: [enCours.auteur, enCours.chapitre, `${pourcent(enCours.progression)} lus`, enCours.tailleTexte ? `environ ${duree(tempsRestant(enCours))} pour le finir` : '', `lu ${quand(enCours.lu)}`].filter(Boolean).join(' · ') }),
      el('div', { className: 'barre-prog-mini' }, el('div', { style: { width: `${Math.round((enCours.progression || 0) * 100)}%` } }))),
    el('button', { className: 'button primary', onclick: () => ouvrirLivreCb(enCours.id) }, el('i', { className: 'codicon codicon-play' }), el('span', { textContent: 'Reprendre' })));
}

function nomRayon() {
  if (rayon.type === 'collection') return collections.find((c) => c.id === rayon.valeur)?.nom || 'Collection';
  if (rayon.type === 'langue') { const n = rayon.valeur ? nomLangue(rayon.valeur) : 'Langue inconnue'; return n.charAt(0).toUpperCase() + n.slice(1); }
  return rayonsFixes().find((r) => r.type === rayon.type)?.nom || 'Tous les livres';
}

async function rendreVide() {
  const vide = $('#biblio-vide');
  vide.innerHTML = '';
  if (liste().length) {
    vide.append(el('p', { textContent: recherche ? `Aucun livre ne correspond à « ${recherche} ».` : 'Aucun livre dans ce rayon.' }));
    return;
  }
  // Bibliothèque vide : on propose d'ajouter des livres, ou un dossier (D:\Livres s'il existe).
  const actions = el('div', { className: 'actions' },
    el('button', { className: 'button primary', onclick: choisirEtAjouter }, el('i', { className: 'codicon codicon-add' }), el('span', { textContent: 'Ajouter des livres' })),
    el('button', { className: 'button', onclick: () => gererDossiers() }, el('i', { className: 'codicon codicon-folder-library' }), el('span', { textContent: 'Choisir un dossier de livres' })));
  const propose = 'D:\\Livres';
  if (K.platform === 'win32' && !(etat.config.dossiers || []).length && await K.dossierExiste(propose)) {
    actions.prepend(el('button', { className: 'button primary', onclick: () => ajouterDossier(propose) }, el('i', { className: 'codicon codicon-folder' }), el('span', { textContent: `Ajouter ${propose}` })));
  }
  vide.append(el('img', { className: 'welcome-logo', src: 'kenning.svg', alt: '' }), el('h1', { textContent: 'Ta bibliothèque est vide' }),
    el('p', { textContent: 'Ajoute tes livres EPUB, MOBI, AZW3 ou FB2, ou choisis le dossier où tu les ranges : Kenning le surveille et y prend chaque nouveau livre tout seul. Tu peux aussi glisser des fichiers sur la fenêtre.' }),
    actions);
}

function rendre() {
  rendreRayons();
  rendreReprendre();
  const affiches = livresAffiches();
  $('#biblio-titre').innerHTML = '';
  $('#biblio-titre').append(nomRayon(), el('span', { textContent: `${affiches.length} livre${affiches.length > 1 ? 's' : ''}` }));
  const zone = $('#biblio-livres');
  const grille = etat.config.vue !== 'liste';
  zone.className = grille ? 'grille' : 'liste';
  zone.style.setProperty('--couv', `${etat.config.tailleCouvertures || 150}px`);
  zone.innerHTML = '';
  if (!grille && affiches.length) {
    zone.append(el('div', { className: 'ligne-livre ligne-entete' }, el('span'), el('span', { textContent: 'Titre' }), el('span', { textContent: 'Auteur' }), el('span', { className: 'col-langue', textContent: 'Langue' }), el('span', { textContent: 'Format' }), el('span', { textContent: 'Progression' }), el('span', { className: 'col-lu', textContent: 'Lu' })));
  }
  const frag = document.createDocumentFragment();
  for (const l of affiches) frag.append(grille ? carte(l) : ligne(l));
  zone.append(frag);
  $('#biblio-vide').hidden = affiches.length > 0;
  $('#biblio-titre').hidden = !liste().length;
  if (!affiches.length) rendreVide();
  $('#vue-grille').classList.toggle('actif', grille);
  $('#vue-liste').classList.toggle('actif', !grille);
  $('#biblio-taille').hidden = !grille;
  const tous = liste();
  $('#status-gauche').textContent = tous.length ? `${tous.length} livre${tous.length > 1 ? 's' : ''} · ${tous.filter((l) => l.statut === 'en-cours').length} en cours · ${tous.filter((l) => l.statut === 'termine').length} terminé(s)` : '';
}

// --- Menu d'un livre (clic droit) ---

function menuLivre(l, x, y) {
  const absent = introuvables.has(l.id);
  Menu.ouvrir(x, y, [
    { libelle: l.progression ? 'Reprendre la lecture' : 'Lire', icone: 'book', desactive: absent, run: () => ouvrirLivreCb(l.id) },
    { libelle: 'Fiche du livre…', icone: 'info', run: () => fiche(l.id) },
    null,
    { libelle: 'Ranger dans une collection', icone: 'folder', sous: [
      ...collections.map((c) => ({ libelle: c.nom, coche: l.collections?.includes(c.id), run: () => ranger(l.id, c.id, !l.collections?.includes(c.id)) })),
      ...(collections.length ? [null] : []),
      { libelle: 'Nouvelle collection…', icone: 'add', run: () => nouvelleCollection(l.id) },
    ] },
    { libelle: 'Marquer comme', icone: 'tag', sous: Object.entries(STATUTS).map(([s, nom]) => ({ libelle: nom, coche: l.statut === s, run: () => marquer(l.id, s) })) },
    null,
    { libelle: 'Montrer dans l\'Explorateur', icone: 'folder-opened', desactive: absent, run: () => K.montrer(l.chemin) },
    { libelle: 'Retirer de la bibliothèque', icone: 'trash', run: () => retirer(l.id) },
  ]);
}

async function marquer(id, statut) {
  const changes = { statut };
  if (statut === 'termine') changes.termineLe = Date.now();
  if (statut === 'a-lire') Object.assign(changes, { progression: 0, position: null });
  await maj(id, changes);
  rendre();
}

async function retirer(id) {
  const l = livre(id);
  const n = l.surlignages?.length || 0;
  const ok = await Dialogs.ask('Retirer de la bibliothèque', `Retirer « ${l.titre} » de la bibliothèque ?${n ? ` Ses ${n} surlignage(s) seront perdus.` : ''}\n\nLe fichier n'est pas effacé du disque.${(etat.config.dossiers || []).some((d) => l.chemin.toLowerCase().startsWith(d.toLowerCase())) ? ' Comme il est dans un dossier surveillé, il reviendra au prochain passage : déplace-le ou efface-le si tu ne veux plus le voir.' : ''}`, [{ label: 'Annuler', value: false }, { label: 'Retirer', value: true, primary: true }]);
  if (!ok) return;
  delete livres[id];
  introuvables.delete(id);
  await K.majLivres({ [id]: null });
  rendre();
}

// --- Fiche du livre ---

const LANGUES = ['fr', 'pl', 'en', 'de', 'es', 'it', 'pt', 'ru', 'uk', 'cs', 'sv', 'no', 'da', 'is', 'fi', 'nl', 'ja', 'zh'];

async function fiche(id) {
  const l = livre(id);
  if (!l) return;
  const langues = [...new Set([...(l.langue ? [l.langue] : []), ...LANGUES])];
  const infos = el('dl', { className: 'fiche-infos' });
  const ajouterInfo = (k, v) => { if (v) infos.append(el('dt', { textContent: k }), el('dd', { textContent: v })); };
  ajouterInfo('Format', `${l.format} · ${formatSize(l.taille || 0)}`);
  ajouterInfo('Éditeur', l.editeur);
  ajouterInfo('Date', l.date);
  ajouterInfo('Chapitres', l.nbChapitres ? String(l.nbChapitres) : '');
  ajouterInfo('Lecture', l.tailleTexte ? `environ ${duree(l.tailleTexte / (etat.config.vitesse || 1600))} en tout${l.progression ? `, ${duree(tempsRestant(l))} restantes` : ''}` : '');
  ajouterInfo('Progression', `${pourcent(l.progression)} · ${STATUTS[l.statut] || ''}`);
  ajouterInfo('Temps passé', l.tempsLecture ? duree(l.tempsLecture / 60) : '');
  ajouterInfo('Surlignages', l.surlignages?.length ? String(l.surlignages.length) : '');
  ajouterInfo('Ajouté', quand(l.ajoute));
  ajouterInfo('Dernière lecture', l.lu ? quand(l.lu) : '');
  ajouterInfo('Fichier', l.chemin);
  const entete = el('div', { className: 'fiche' }, couverture(l), infos);
  const elements = [{ type: 'element', element: entete }];
  if (l.description) elements.push({ type: 'element', element: el('p', { className: 'fiche-description', textContent: l.description }) });
  const cases = el('div', { className: 'liste-cases' }, ...collections.map((c) => el('label', {}, el('input', { type: 'checkbox', checked: l.collections?.includes(c.id), dataset: { collection: c.id } }), el('span', { textContent: c.nom }))));
  const v = await Dialogs.form({
    title: 'Fiche du livre',
    okLabel: 'Enregistrer',
    width: 600,
    fields: [
      ...elements,
      { key: 'titre', label: 'Titre', type: 'text', value: l.titre },
      { key: 'auteur', label: 'Auteur', type: 'text', value: l.auteur || '' },
      { key: 'serie', label: 'Série', type: 'text', value: l.serie || '', placeholder: 'Le nom de la série, si le livre en fait partie' },
      { key: 'numeroSerie', label: 'Tome', type: 'number', value: l.numeroSerie ?? '', min: 0, step: 1 },
      { key: 'langue', label: 'Langue', type: 'select', value: l.langue || '', choices: [['', 'Inconnue'], ...langues.map((c) => [c, nomLangue(c)])] },
      { key: 'statut', label: 'Statut', type: 'select', value: l.statut, choices: Object.entries(STATUTS) },
      ...(collections.length ? [{ type: 'info', text: 'Collections' }, { type: 'element', element: cases }] : []),
      { key: 'note', label: 'Mes notes', type: 'textarea', value: l.note || '', rows: 3 },
    ],
    buttons: [
      { label: 'Montrer le fichier', run: () => K.montrer(l.chemin) },
    ],
  });
  if (!v) return;
  v.collections = $$('input[data-collection]', cases).filter((c) => c.checked).map((c) => c.dataset.collection);
  v.numeroSerie = v.numeroSerie || null;
  v.titre = v.titre.trim() || l.titre;
  await maj(id, v);
  rendre();
}

// --- Dossiers surveillés ---

async function ajouterDossier(dossier) {
  const dossiers = [...new Set([...(etat.config.dossiers || []), dossier])];
  await ecrireConfig({ dossiers, dossiersProposes: true });
  await K.surveiller(dossiers);
  notify(`Kenning cherche les livres de ${dossier}…`, 'info', 4000);
  await parcourirDossiers();
}

async function gererDossiers() {
  let dossiers = [...(etat.config.dossiers || [])];
  const zone = el('div', { className: 'dossiers' });
  const dessiner = () => {
    zone.innerHTML = '';
    if (!dossiers.length) zone.append(el('p', { className: 'modal-info', textContent: 'Aucun dossier surveillé pour l\'instant.' }));
    for (const d of dossiers) {
      zone.append(el('div', { className: 'dossier-ligne' }, el('i', { className: 'codicon codicon-folder' }), el('span', { textContent: `\u200e${d}`, title: d }),
        bouton('close', 'Ne plus surveiller ce dossier', () => { dossiers = dossiers.filter((x) => x !== d); dessiner(); })));
    }
    zone.append(el('button', { type: 'button', className: 'button', onclick: async () => { const d = await K.choisirDossier(); if (d && !dossiers.includes(d)) { dossiers.push(d); dessiner(); } } }, el('i', { className: 'codicon codicon-add' }), el('span', { textContent: 'Ajouter un dossier' })));
  };
  dessiner();
  const v = await Dialogs.form({
    title: 'Dossiers de livres',
    okLabel: 'Enregistrer',
    width: 560,
    fields: [
      { type: 'info', text: 'Kenning surveille ces dossiers (et leurs sous-dossiers) : chaque livre qui y arrive entre tout seul dans la bibliothèque. Les fichiers restent où ils sont.' },
      { type: 'element', element: zone },
      { type: 'info', text: 'Ne plus surveiller un dossier ne retire pas ses livres de la bibliothèque.' },
    ],
  });
  if (!v) return;
  await ecrireConfig({ dossiers, dossiersProposes: true });
  await K.surveiller(dossiers);
  await parcourirDossiers();
  rendre();
}

// --- Démarrage ---

export const Bibliotheque = {
  liste,
  livre,
  maj,
  collections: () => collections,
  introuvable: (id) => introuvables.has(id),
  importer,
  rendre,
  fiche,
  ranger,
  nouvelleCollectionNommee: async (nom) => {
    const existante = collections.find((c) => c.nom.toLowerCase() === nom.toLowerCase());
    if (existante) return existante;
    const c = { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, nom };
    await majCollections([...collections, c]);
    return c;
  },
  marquer,
  couverture,
  tempsRestant,
  choisirEtAjouter,
  STATUTS,
  async demarrer({ ouvrir }) {
    ouvrirLivreCb = ouvrir;
    const b = await K.biblio();
    livres = b.livres;
    collections = b.collections;
    $('#biblio-tri').value = etat.config.tri;
    $('#biblio-taille').value = etat.config.tailleCouvertures;
    $('#biblio-recherche').oninput = (e) => { recherche = e.target.value.trim(); rendre(); };
    $('#biblio-tri').onchange = async (e) => { await ecrireConfig({ tri: e.target.value }); rendre(); };
    $('#vue-grille').onclick = async () => { await ecrireConfig({ vue: 'grille' }); rendre(); };
    $('#vue-liste').onclick = async () => { await ecrireConfig({ vue: 'liste' }); rendre(); };
    $('#biblio-taille').oninput = (e) => { etat.config.tailleCouvertures = Number(e.target.value); $('#biblio-livres').style.setProperty('--couv', `${e.target.value}px`); };
    $('#biblio-taille').onchange = (e) => ecrireConfig({ tailleCouvertures: Number(e.target.value) });
    $('#btn-ajouter').onclick = choisirEtAjouter;
    $('#btn-dossiers').onclick = gererDossiers;
    rendre();
    await K.surveiller(etat.config.dossiers || []);
    K.onDossiersChanges(() => parcourirDossiers());
    // Au démarrage : les fichiers disparus, puis les nouveaux livres des dossiers (en arrière-plan).
    verifierFichiers().then(() => parcourirDossiers({ dire: true })).catch((err) => notify(cleanError(err), 'error'));
  },
  focusRecherche: () => $('#biblio-recherche').focus(),
};
