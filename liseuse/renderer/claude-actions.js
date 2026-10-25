// Ce que Loki peut faire dans Kenning (panneau Loki, ../commun/claude-panneau.js).
//
// Lire ne demande jamais la permission (la bibliothèque, le livre ouvert, le texte d'un chapitre, la
// recherche, aller à un chapitre) : Loki peut résumer un chapitre ou expliquer un passage sans te
// déranger. Ce qui modifie quelque chose (surligner, ranger dans une collection, changer une fiche ou
// les réglages de lecture) affiche la carte Autoriser / Refuser.
//
// Un livre se désigne par son identifiant (donné par l'action bibliotheque), ou pas du tout (= le
// livre ouvert). Les chapitres sont numérotés à partir de 1, dans l'ordre du sommaire.

import { ouvrirLivre, chapitres, texteBrut, nomLangue } from './livre.js';
import { COULEURS } from './lecture.js';

const { Bibliotheque, Lecture } = window.Kenning;
const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) });
const refLivre = { type: 'string', description: 'Identifiant du livre (action bibliotheque). Sans : le livre ouvert.' };
const MAX_TEXTE = 120000;

const ficheDe = (id) => {
  if (!id) {
    const f = Lecture.fiche();
    if (!f) throw new Error('Aucun livre ouvert dans Kenning. Donne l\'identifiant d\'un livre (action bibliotheque) ou ouvre-en un avec ouvrir_livre.');
    return f;
  }
  const f = Bibliotheque.livre(id) || Bibliotheque.liste().find((l) => l.titre.toLowerCase() === String(id).toLowerCase());
  if (!f) throw new Error(`Pas de livre « ${id} » dans la bibliothèque. Les identifiants sont donnés par l'action bibliotheque.`);
  return f;
};

// Le livre (foliate-js) : celui affiché, ou ouvert en arrière-plan sans le montrer (gardé pour les
// appels suivants, le temps d'un résumé chapitre par chapitre).
let enArrierePlan = null;
async function livreDe(id) {
  const f = ficheDe(id);
  if (Lecture.fiche()?.id === f.id) return { fiche: f, book: Lecture.livre() };
  if (enArrierePlan?.id !== f.id) {
    if (Bibliotheque.introuvable(f.id)) throw new Error(`Le fichier de « ${f.titre} » est introuvable.`);
    const doc = await window.kenning.lireLivre(f.chemin);
    enArrierePlan = { id: f.id, book: await ouvrirLivre({ bytes: doc.bytes, nom: doc.nom }) };
  }
  return { fiche: f, book: enArrierePlan.book };
}

const STATUTS = Bibliotheque.STATUTS;
const resume = (l) => ({
  id: l.id,
  titre: l.titre,
  auteur: l.auteur || undefined,
  langue: l.langue ? nomLangue(l.langue) : undefined,
  format: l.format,
  statut: STATUTS[l.statut],
  progression: pourcent(l.progression),
  collections: (l.collections || []).map((c) => Bibliotheque.collections().find((x) => x.id === c)?.nom).filter(Boolean),
  serie: l.serie ? `${l.serie}${l.numeroSerie ? ` (${l.numeroSerie})` : ''}` : undefined,
  surlignages: l.surlignages?.length || undefined,
  derniere_lecture: l.lu ? quand(l.lu) : undefined,
  introuvable: Bibliotheque.introuvable(l.id) || undefined,
});

ClaudePanneau.actions({
  bibliotheque: {
    lecture: true,
    icone: 'library',
    libelle: ({ recherche }) => (recherche ? `Cherche « ${recherche} » dans la bibliothèque` : 'Regarde la bibliothèque'),
    description: 'Les livres de la bibliothèque de Kenning (au plus 200) : identifiant, titre, auteur, langue, format, statut (À lire, En cours, Terminé), progression, collections, série. Filtres facultatifs : recherche (titre, auteur, série), statut (a-lire, en-cours, termine), collection (nom), langue (code : fr, pl, en…). Donne aussi la liste des collections et le livre ouvert.',
    schema: obj({ recherche: { type: 'string' }, statut: { type: 'string', enum: ['a-lire', 'en-cours', 'termine'] }, collection: { type: 'string' }, langue: { type: 'string' } }),
    faire: async ({ recherche, statut, collection, langue } = {}) => {
      let l = Bibliotheque.liste();
      if (statut) l = l.filter((x) => x.statut === statut);
      if (langue) l = l.filter((x) => (x.langue || '') === langue.toLowerCase());
      if (collection) {
        const c = Bibliotheque.collections().find((x) => x.nom.toLowerCase() === collection.toLowerCase());
        if (!c) return `Pas de collection « ${collection} ». Collections : ${Bibliotheque.collections().map((x) => x.nom).join(', ') || 'aucune'}.`;
        l = l.filter((x) => x.collections?.includes(c.id));
      }
      if (recherche) {
        const t = recherche.toLowerCase();
        l = l.filter((x) => `${x.titre} ${x.auteur} ${x.serie}`.toLowerCase().includes(t));
      }
      l.sort((a, b) => (b.lu || 0) - (a.lu || 0) || collator.compare(a.titre, b.titre));
      const ouvert = Lecture.fiche();
      return [
        `${Bibliotheque.liste().length} livres dans la bibliothèque, ${l.length} correspondent.${l.length > 200 ? ' (200 premiers)' : ''}`,
        `Collections : ${Bibliotheque.collections().map((c) => c.nom).join(', ') || 'aucune'}.`,
        `Livre ouvert : ${ouvert ? `${ouvert.titre} (id ${ouvert.id})` : 'aucun'}.`,
        '',
        ...l.slice(0, 200).map((x) => JSON.stringify(resume(x))),
      ].join('\n');
    },
  },
  livre_ouvert: {
    lecture: true,
    icone: 'book',
    libelle: () => 'Regarde le livre ouvert',
    description: 'Le livre ouvert dans Kenning (ou un autre, par son identifiant) : sa fiche (titre, auteur, langue, description…), le chapitre et la position où Ragna en est, et la liste numérotée de ses chapitres.',
    schema: obj({ livre: refLivre }),
    faire: async ({ livre } = {}) => {
      const { fiche, book } = await livreDe(livre);
      const liste = await chapitres(book);
      const ouvert = Lecture.fiche()?.id === fiche.id;
      const courant = ouvert ? await Lecture.chapitreCourant() : null;
      return [
        JSON.stringify({ ...resume(fiche), editeur: fiche.editeur || undefined, date: fiche.date || undefined, description: fiche.description || undefined, note_de_ragna: fiche.note || undefined }, null, 1),
        ouvert ? `Ouvert à l'écran. Chapitre en cours : ${courant ? `${courant.numero}. ${courant.titre}` : 'inconnu'} · ${pourcent(Lecture.lieu()?.fraction)} du livre.` : 'Pas ouvert à l\'écran (lu en arrière-plan).',
        '',
        `Chapitres (${liste.length}) :`,
        ...liste.map((c) => `${'  '.repeat(c.niveau)}${c.numero}. ${c.titre}`),
      ].join('\n');
    },
  },
  lire_chapitre: {
    lecture: true,
    icone: 'book',
    libelle: ({ chapitre }) => (chapitre ? `Lit le chapitre ${chapitre}` : 'Lit le chapitre en cours'),
    description: 'Le texte d\'un chapitre (numéro à partir de 1, voir livre_ouvert ; sans numéro : le chapitre où Ragna en est). Un paragraphe par ligne, les titres précédés de « # ». Pour un autre livre que celui ouvert, donne son identifiant. Ne raconte pas la suite au-delà du chapitre en cours sauf si Ragna le demande.',
    schema: obj({ livre: refLivre, chapitre: { type: 'number' } }),
    faire: async ({ livre, chapitre } = {}) => {
      const { fiche, book } = await livreDe(livre);
      let n = chapitre;
      if (!n) {
        if (Lecture.fiche()?.id !== fiche.id) throw new Error('Donne le numéro du chapitre (ce livre n\'est pas ouvert à l\'écran).');
        n = (await Lecture.chapitreCourant())?.numero || 1;
      }
      const liste = await chapitres(book);
      const t = await texteBrut(book, n);
      const entete = `${fiche.titre}, chapitre ${n} sur ${liste.length} : ${liste[n - 1]?.titre || ''}\n\n`;
      return entete + (t.length > MAX_TEXTE ? `${t.slice(0, MAX_TEXTE)}\n\n(Texte coupé : le chapitre est trop long pour un seul appel.)` : t || '(Ce chapitre n\'a pas de texte : peut-être seulement des images.)');
    },
  },
  texte_visible: {
    lecture: true,
    icone: 'eye',
    libelle: () => 'Lit la page affichée',
    description: 'Le texte de la page (ou des colonnes) que Ragna a sous les yeux, et le passage sélectionné s\'il y en a un.',
    schema: obj({}),
    faire: async () => {
      if (!Lecture.ouvert()) return 'Aucun livre ouvert.';
      const sel = Lecture.selection();
      return `${Lecture.texteVisible() || '(page sans texte)'}${sel ? `\n\nPassage sélectionné : « ${sel} »` : ''}`;
    },
  },
  chercher: {
    lecture: true,
    icone: 'search',
    libelle: ({ texte }) => `Cherche « ${texte} » dans le livre`,
    description: 'Cherche un mot ou une phrase dans le livre ouvert (sans tenir compte des accents ni des majuscules) : le chapitre de chaque résultat et un extrait autour, le mot trouvé entre crochets. Au plus 40 résultats.',
    schema: obj({ texte: { type: 'string' } }, ['texte']),
    faire: async ({ texte }) => {
      if (!texte) throw new Error('Il faut le texte à chercher.');
      const r = await Lecture.chercherTexte(texte);
      if (!r.length) return `« ${texte} » n'apparaît pas dans le livre.`;
      return r.map((x) => `${x.chapitre} : ${x.extrait}`).join('\n');
    },
  },
  aller_chapitre: {
    lecture: true,
    icone: 'go-to-file',
    libelle: ({ chapitre, pourcentage }) => (chapitre ? `Montre le chapitre ${chapitre}` : `Va à ${pourcentage} % du livre`),
    description: 'Affiche à Ragna le début d\'un chapitre (numéro à partir de 1) ou un endroit du livre ouvert (pourcentage de 0 à 100).',
    schema: obj({ chapitre: { type: 'number' }, pourcentage: { type: 'number' } }),
    faire: async ({ chapitre, pourcentage } = {}) => {
      if (!Lecture.ouvert()) throw new Error('Aucun livre ouvert.');
      if (chapitre) { const c = await Lecture.allerChapitre(chapitre); return `Chapitre ${c.numero} affiché : ${c.titre}.`; }
      if (pourcentage !== undefined) { await Lecture.allerFraction(pourcentage / 100); return `${pourcentage} % du livre affiché.`; }
      throw new Error('Donne un chapitre ou un pourcentage.');
    },
  },
  ouvrir_livre: {
    lecture: true,
    icone: 'book',
    libelle: ({ livre }) => `Ouvre « ${Bibliotheque.livre(livre)?.titre || livre} »`,
    description: 'Ouvre un livre de la bibliothèque à l\'écran (par son identifiant), là où Ragna s\'était arrêté.',
    schema: obj({ livre: { type: 'string' } }, ['livre']),
    faire: async ({ livre }) => {
      const f = ficheDe(livre);
      await window.Kenning.ouvrirLivre(f.id);
      return `« ${f.titre} » ouvert${f.progression ? ` à ${pourcent(f.progression)}` : ''}.`;
    },
  },
  surlignages: {
    lecture: true,
    icone: 'symbol-color',
    libelle: () => 'Regarde les surlignages',
    description: 'Les passages surlignés d\'un livre (le livre ouvert, ou un autre par son identifiant), avec leur couleur, la note de Ragna et le chapitre.',
    schema: obj({ livre: refLivre }),
    faire: async ({ livre } = {}) => {
      const f = ficheDe(livre);
      const l = [...(f.surlignages || [])].sort((a, b) => (a.fraction || 0) - (b.fraction || 0));
      if (!l.length) return `Aucun surlignage dans « ${f.titre} ».`;
      return l.map((s) => `[${COULEURS[s.couleur]?.nom || s.couleur}] ${s.chapitre ? `(${s.chapitre}) ` : ''}« ${s.texte} »${s.note ? `\n  Note : ${s.note}` : ''}`).join('\n');
    },
  },
  surligner: {
    icone: 'symbol-color',
    libelle: ({ texte }) => `Surligne « ${String(texte || '').slice(0, 60)}${String(texte || '').length > 60 ? '…' : ''} »`,
    description: 'Surligne un passage du livre ouvert, comme Ragna le ferait. texte = le passage exact (copié du livre, une phrase de préférence), cherché d\'abord dans le chapitre affiché. couleur : jaune, vert, bleu ou rose. note : une note facultative attachée au passage (une traduction, une explication…). Ragna voit le passage s\'afficher surligné.',
    schema: obj({ texte: { type: 'string' }, couleur: { type: 'string', enum: Object.keys(COULEURS) }, note: { type: 'string' } }, ['texte']),
    faire: async ({ texte, couleur = 'jaune', note = '' }) => {
      const s = await Lecture.surlignerTexte(String(texte), couleur, String(note || ''));
      return `Passage surligné en ${COULEURS[s.couleur]?.nom.toLowerCase()}${s.chapitre ? ` (${s.chapitre})` : ''}.`;
    },
  },
  ranger: {
    icone: 'folder',
    libelle: ({ livres, collection, retirer }) => `${retirer ? 'Retire' : 'Range'} ${(livres || []).length} livre(s) ${retirer ? 'de' : 'dans'} « ${collection} »`,
    description: 'Range des livres dans une collection (créée si elle n\'existe pas), ou les en retire (retirer: true). livres = liste d\'identifiants (action bibliotheque).',
    schema: obj({ livres: { type: 'array', items: { type: 'string' } }, collection: { type: 'string' }, retirer: { type: 'boolean' } }, ['livres', 'collection']),
    faire: async ({ livres, collection, retirer = false }) => {
      const c = retirer ? Bibliotheque.collections().find((x) => x.nom.toLowerCase() === String(collection).toLowerCase()) : await Bibliotheque.nouvelleCollectionNommee(String(collection).trim());
      if (!c) throw new Error(`Pas de collection « ${collection} ».`);
      let n = 0;
      for (const id of livres || []) {
        const f = ficheDe(id);
        const actuelles = new Set(f.collections || []);
        if (retirer) actuelles.delete(c.id); else actuelles.add(c.id);
        await Bibliotheque.maj(f.id, { collections: [...actuelles] });
        n++;
      }
      Bibliotheque.rendre();
      return `${n} livre(s) ${retirer ? 'retiré(s) de' : 'rangé(s) dans'} « ${c.nom} ».`;
    },
  },
  modifier_fiche: {
    icone: 'edit',
    libelle: ({ livre }) => `Modifie la fiche de « ${Bibliotheque.livre(livre)?.titre || livre || 'ce livre'} »`,
    description: 'Corrige la fiche d\'un livre : titre, auteur, langue (code : fr, pl, en…), serie, tome, statut (a-lire, en-cours, termine). Seuls les champs donnés changent.',
    schema: obj({ livre: refLivre, titre: { type: 'string' }, auteur: { type: 'string' }, langue: { type: 'string' }, serie: { type: 'string' }, tome: { type: 'number' }, statut: { type: 'string', enum: ['a-lire', 'en-cours', 'termine'] } }),
    faire: async ({ livre, titre, auteur, langue, serie, tome, statut } = {}) => {
      const f = ficheDe(livre);
      const changes = {};
      if (titre) changes.titre = titre;
      if (auteur !== undefined) changes.auteur = auteur;
      if (langue !== undefined) changes.langue = langue.toLowerCase();
      if (serie !== undefined) changes.serie = serie;
      if (tome !== undefined) changes.numeroSerie = tome;
      if (statut) changes.statut = statut;
      if (!Object.keys(changes).length) throw new Error('Rien à changer.');
      await Bibliotheque.maj(f.id, changes);
      Bibliotheque.rendre();
      return `Fiche de « ${f.titre} » modifiée : ${Object.keys(changes).join(', ')}.`;
    },
  },
  reglages_lecture: {
    icone: 'text-size',
    libelle: () => 'Change les réglages de lecture',
    description: 'Change l\'affichage du livre : theme (sombre, nuit, sepia, clair), police (Literata, Atkinson Hyperlegible, OpenDyslexic, Georgia, Palatino Linotype, Cambria, Segoe UI, Verdana), taille (12 à 34 px), interligne (1.1 à 2.4), largeur des colonnes (420 à 1100 px), colonnes (auto, 1, 2, 3), mode (pages, defilement), filtreChaud (0 à 60). Sans rien : renvoie les réglages actuels.',
    schema: obj({ theme: { type: 'string', enum: ['sombre', 'nuit', 'sepia', 'clair'] }, police: { type: 'string' }, taille: { type: 'number' }, interligne: { type: 'number' }, largeur: { type: 'number' }, colonnes: { type: 'string', enum: ['auto', '1', '2', '3'] }, mode: { type: 'string', enum: ['pages', 'defilement'] }, filtreChaud: { type: 'number' } }),
    faire: async (args = {}) => {
      const changes = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined && v !== null));
      if (!Object.keys(changes).length) return JSON.stringify(Lecture.reglages());
      Lecture.changerReglages(changes);
      return `Réglages changés : ${Object.entries(changes).map(([k, v]) => `${k} = ${v}`).join(', ')}.`;
    },
  },
});
