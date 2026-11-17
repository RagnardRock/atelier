// Page « Nouveautés » : toutes les versions publiées de tous les outils (et d'Atelier), les plus
// récentes en tête, rangées par jour. Chaque version montre ses notes telles que GitHub les a écrites
// (les titres des PR fusionnées, avec un lien vers chaque PR).
// - Bouton de la barre de titre (toujours là) ; une pastille compte les versions sorties depuis ta
//   dernière visite. Raccourci : Ctrl+Shift+N.
// - Sur chaque carte d'outil, un petit bouton ouvre la page filtrée sur cet outil.
// - À gauche (en haut sur un écran étroit) : filtre par outil ; une recherche dans les notes.
// - « Nouveau » : sorti après ta dernière visite (config.json : nouveautesVuesLe, une date en ms).
//   Les versions restent marquées « Nouveau » tant que la page est ouverte ; la visite compte à la fermeture.
// La liste vient de main.js (nouveautes:liste), qui lit les Releases GitHub (commun/github.js › historique).

const Nouveautes = (() => {
  const bouton = $('#btn-nouveautes');
  const pastille = $('#btn-nouveautes .pastille');
  let vuesLe = null; // date de la dernière visite (ms), null = jamais
  let donnees = null; // { versions, depot, erreur } : la dernière lecture
  let ouvert = null; // { overlay, fermer }
  let filtre = 'tous';
  let recherche = '';

  const dateDe = (v) => (v.date ? Date.parse(v.date) : Infinity); // sans date = toute neuve
  const estNouvelle = (v) => vuesLe != null && dateDe(v) > vuesLe;

  function majPastille() {
    const n = donnees ? donnees.versions.filter(estNouvelle).length : 0;
    pastille.textContent = n > 99 ? '99+' : String(n);
    pastille.hidden = !n;
    bouton.title = n ? `Nouveautés : ${n} version(s) sortie(s) depuis ta dernière visite (Ctrl+Maj+N)` : 'Nouveautés : toutes les versions de tes outils (Ctrl+Maj+N)';
  }

  async function charger() {
    donnees = await window.atelier.nouveautes();
    // Première fois : les versions de la dernière semaine comptent comme nouvelles, pas tout l'historique.
    if (vuesLe == null && donnees.versions.length) {
      vuesLe = Date.now() - 7 * 24 * 3600_000;
      window.atelier.writeConfig({ nouveautesVuesLe: vuesLe });
    }
    majPastille();
    return donnees;
  }

  // « - Tafl 1.42.0 : un Nouveau jeu plus clair (#173) » : le numéro devient un lien vers la PR.
  function ligneNotes(texte, depot) {
    const li = el('li');
    let dernier = 0;
    for (const m of texte.matchAll(/#(\d+)\b/g)) {
      li.append(texte.slice(dernier, m.index));
      li.append(el('a', { href: `${depot}/pull/${m[1]}`, target: '_blank', textContent: m[0], title: `Ouvrir la PR ${m[0]} sur GitHub` }));
      dernier = m.index + m[0].length;
    }
    li.append(texte.slice(dernier));
    return li;
  }

  const jourDe = (v) => {
    if (!v.date) return 'À l\'instant';
    const d = new Date(v.date);
    const aujourdhui = new Date();
    const hier = new Date(); hier.setDate(hier.getDate() - 1);
    if (d.toDateString() === aujourdhui.toDateString()) return 'Aujourd\'hui';
    if (d.toDateString() === hier.toDateString()) return 'Hier';
    const texte = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== aujourdhui.getFullYear() ? { year: 'numeric' } : {}) });
    return texte[0].toUpperCase() + texte.slice(1);
  };

  function carteVersion(v, depot) {
    const icone = el('img', { className: 'nv-icone', src: v.id === 'atelier' ? 'atelier.svg' : `outils/${v.icone}`, alt: '' });
    const heure = v.date ? new Date(v.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    const lien = el('a', { className: 'nv-lien', href: v.url, target: '_blank', title: 'Ouvrir cette version sur GitHub' }, el('i', { className: 'codicon codicon-link-external' }));
    const notes = v.notes.length ? el('ul', { className: 'nv-notes' }, ...v.notes.map((n) => ligneNotes(n, depot)))
      : el('p', { className: 'discret nv-vide', textContent: 'Pas encore de notes (GitHub les donnera à la prochaine lecture).' });
    return el('article', { className: `nv-version${estNouvelle(v) ? ' nouvelle' : ''}` },
      icone,
      el('div', { className: 'nv-contenu' },
        el('header', { className: 'nv-titre' },
          el('span', { className: 'nv-nom', textContent: v.nom }),
          el('span', { className: 'nv-numero', textContent: v.version }),
          estNouvelle(v) ? el('span', { className: 'nv-badge', textContent: 'Nouveau' }) : null,
          el('span', { className: 'spacer' }),
          el('span', { className: 'discret', textContent: heure }),
          lien),
        notes));
  }

  function filtrees() {
    const mots = recherche.toLowerCase().split(/\s+/).filter(Boolean);
    return donnees.versions.filter((v) => (filtre === 'tous' || (filtre === 'nouveau' ? estNouvelle(v) : v.id === filtre))
      && mots.every((m) => `${v.nom} ${v.version} ${v.notes.join(' ')}`.toLowerCase().includes(m)));
  }

  function rendreFiltres(zone) {
    // Les outils dans l'ordre de leur dernière version (le plus actif en haut).
    const outils = [];
    for (const v of donnees.versions) if (!outils.some((o) => o.id === v.id)) outils.push(v);
    const nouv = donnees.versions.filter(estNouvelle).length;
    const choix = [
      { id: 'tous', nom: 'Tout', icone: el('i', { className: 'codicon codicon-list-unordered' }), n: donnees.versions.length },
      ...(nouv ? [{ id: 'nouveau', nom: 'Nouveau', icone: el('i', { className: 'codicon codicon-sparkle' }), n: nouv }] : []),
      ...outils.map((o) => ({
        id: o.id, nom: o.nom,
        icone: el('img', { src: o.id === 'atelier' ? 'atelier.svg' : `outils/${o.icone}`, alt: '' }),
        n: donnees.versions.filter((v) => v.id === o.id).length,
        nouv: donnees.versions.filter((v) => v.id === o.id && estNouvelle(v)).length,
      })),
    ];
    zone.replaceChildren(...choix.map((c) => {
      const b = el('button', { className: `nv-filtre${filtre === c.id ? ' actif' : ''}`, title: c.id === 'tous' ? 'Toutes les versions' : c.id === 'nouveau' ? 'Seulement les nouvelles versions' : `Seulement ${c.nom}` },
        c.icone, el('span', { className: 'nv-filtre-nom', textContent: c.nom }),
        c.nouv ? el('span', { className: 'nv-point', title: `${c.nouv} nouvelle(s)` }) : null,
        el('span', { className: 'compte', textContent: c.n }));
      b.onclick = () => { filtre = c.id; rendre(); };
      return b;
    }));
  }

  function rendre() {
    if (!ouvert) return;
    const { liste, filtres, info } = ouvert;
    if (!donnees.versions.some((v) => v.id === filtre) && !['tous', 'nouveau'].includes(filtre)) filtre = 'tous';
    if (filtre === 'nouveau' && !donnees.versions.some(estNouvelle)) filtre = 'tous';
    rendreFiltres(filtres);
    info.textContent = donnees.erreur ? `${donnees.erreur}. Les versions déjà lues restent affichées.` : '';
    info.hidden = !donnees.erreur;
    const versions = filtrees();
    const blocs = [];
    let jour = null;
    let groupe = null;
    for (const v of versions) {
      const j = jourDe(v);
      if (j !== jour) {
        jour = j;
        groupe = el('div', { className: 'nv-jour-versions' });
        blocs.push(el('section', { className: 'nv-jour' }, el('h3', { className: 'nv-jour-titre', textContent: j }), groupe));
      }
      groupe.append(carteVersion(v, donnees.depot));
    }
    if (!blocs.length) {
      blocs.push(el('p', { className: 'discret nv-rien', textContent: !donnees.versions.length ? (donnees.erreur ? 'Impossible de lire les versions pour l\'instant.' : 'Aucune version publiée.') : 'Aucune version ne correspond.' }));
    }
    liste.replaceChildren(...blocs);
    liste.scrollTop = 0;
  }

  async function ouvrir(outil = null) {
    if (ouvert) { if (outil) { filtre = outil; rendre(); } return; }
    Dialogs.close(null);
    filtre = outil || 'tous';
    recherche = '';
    const overlay = el('div', { className: 'modal-overlay nv-overlay' });
    const champ = el('input', { type: 'text', className: 'nv-recherche', placeholder: 'Chercher dans les notes (Ctrl+F)', spellcheck: false });
    const actualiser = el('button', { className: 'icon-button', title: 'Relire les versions sur GitHub' }, el('i', { className: 'codicon codicon-refresh' }));
    const fermerBtn = el('button', { className: 'icon-button', title: 'Fermer (Échap)' }, el('i', { className: 'codicon codicon-close' }));
    const filtres = el('nav', { className: 'nv-filtres' });
    const liste = el('div', { className: 'nv-liste' }, el('p', { className: 'discret nv-rien', textContent: 'Lecture des versions sur GitHub…' }));
    const info = el('p', { className: 'discret erreur nv-info', hidden: true });
    const panneau = el('div', { className: 'modal nv-panneau', role: 'dialog', ariaLabel: 'Nouveautés' },
      el('header', {},
        el('i', { className: 'codicon codicon-megaphone nv-titre-icone' }),
        el('span', { className: 'modal-title', textContent: 'Nouveautés' }),
        champ, actualiser, fermerBtn),
      el('div', { className: 'nv-corps' }, filtres, el('div', { className: 'nv-droite' }, info, liste)));
    overlay.append(panneau);
    $('#modal-root').append(overlay);

    const fermer = () => {
      overlay.remove();
      document.removeEventListener('keydown', clavier, true);
      ouvert = null;
      // La visite compte : ce qui est sorti jusqu'ici n'est plus « nouveau ».
      if (donnees?.versions.length) {
        vuesLe = Date.now();
        window.atelier.writeConfig({ nouveautesVuesLe: vuesLe });
        majPastille();
      }
    };
    const clavier = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); champ.focus(); champ.select(); }
    };
    document.addEventListener('keydown', clavier, true);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) fermer(); });
    fermerBtn.onclick = fermer;
    champ.oninput = () => { recherche = champ.value; rendre(); };
    ouvert = { overlay, liste, filtres, info, fermer };

    const lire = async () => {
      actualiser.querySelector('.codicon').classList.add('codicon-modifier-spin');
      try { await charger(); } catch (err) { donnees = { versions: donnees?.versions || [], depot: donnees?.depot, erreur: cleanError(err) }; }
      actualiser.querySelector('.codicon').classList.remove('codicon-modifier-spin');
      rendre();
    };
    actualiser.onclick = lire;
    if (donnees) rendre();
    await lire();
  }

  bouton.onclick = () => ouvrir();
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); ouvrir(); }
  });

  // Au démarrage (app.js), seulement si Atelier a le droit de contacter GitHub : la pastille.
  async function start(config, { github }) {
    vuesLe = typeof config.nouveautesVuesLe === 'number' ? config.nouveautesVuesLe : null;
    if (github) await charger().catch(() => {});
  }

  return { start, ouvrir, get nombreNouvelles() { return donnees ? donnees.versions.filter(estNouvelle).length : null; } };
})();
