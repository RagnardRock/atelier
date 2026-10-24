// L'interface de Mímir : les onglets (un par document ouvert), l'accueil avec les documents récents,
// la barre d'état, les réglages et les raccourcis clavier. Chaque document est affiché par son
// lecteur (renderer/lecteurs/) : l'application lui passe la main pour tout ce qui lui est propre.
//
// Où tu en es dans chaque document (page, zoom…) est gardé au fil de l'eau dans les réglages : à la
// prochaine ouverture, le document reprend là où tu l'avais laissé. Les onglets ouverts à la
// fermeture de Mímir se rouvrent au démarrage suivant.

const App = (() => {
  let config = null;
  let configPath = '';
  const onglets = [];     // { id, chemin, nom, type, lecteur, bouton, chargement }
  let actifId = null;
  const actif = () => onglets.find((o) => o.id === actifId) || null;
  const nouvelId = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  // --- Thème et réglages ---
  const ACCENTS = ['#8fb4ff', '#c9d6ff', '#5ec8ff', '#b9a8ff', '#ff7aa8', '#4ade80', '#ffc35c'];
  async function applyTheme(c) {
    document.documentElement.style.setProperty('--accent', c.accentColor);
    document.body.classList.toggle('glass', Boolean(c.glass));
    for (const l of ['sombre', 'sepia']) document.body.classList.toggle(`lecture-${l}`, c.lecture === l);
    const { blur, needsRestart } = await window.mimir.setWindowTheme({ glass: c.glass, blur: c.windowBlur });
    document.body.classList.toggle('window-blur', blur);
    return needsRestart;
  }
  async function ecrireConfig(changes) {
    config = await window.mimir.writeConfig(changes);
    return config;
  }

  async function ouvrirReglages() {
    const blurOk = await window.mimir.blurSupported();
    const version = await window.mimir.version();
    const swatches = el('div', { className: 'accent-swatches' });
    const familles = ((await window.claude.autorisations?.().catch(() => [])) || []).filter((f) => f.gardable);
    const v = await Dialogs.form({
      title: 'Réglages de Mímir',
      okLabel: 'Enregistrer',
      width: 520,
      fields: [
        { key: 'accentColor', label: 'Couleur d\'accent', type: 'color', value: config.accentColor },
        { type: 'element', element: swatches },
        { key: 'glass', label: 'Verre dépoli (glassmorphism)', type: 'checkbox', value: config.glass },
        { key: 'windowBlur', label: blurOk ? 'Flou de Windows 11 derrière la fenêtre' : 'Flou de Windows 11 (non disponible ici)', type: 'checkbox', value: config.windowBlur },
        { key: 'lecture', label: 'Couleur des pages', type: 'select', value: config.lecture, choices: [['normal', 'Normales (comme imprimées)'], ['sombre', 'Sombres (pages inversées, pour lire la nuit)'], ['sepia', 'Sépia (plus doux pour les yeux)']] },
        { key: 'zoom', label: 'Zoom des PDF', type: 'select', value: String(config.zoom), choices: [['page-width', 'Largeur de page'], ['page-fit', 'Page entière'], ['auto', 'Automatique'], ['1', '100 %']] },
        { key: 'reprendre', label: 'Rouvrir chaque document à la page où je m\'étais arrêté', type: 'checkbox', value: config.reprendre },
        { key: 'rouvrirOnglets', label: 'Au démarrage, rouvrir les documents restés ouverts', type: 'checkbox', value: config.rouvrirOnglets },
        { key: 'bdDoublePage', label: 'BD : deux pages côte à côte', type: 'checkbox', value: config.bdDoublePage },
        { key: 'bdSensManga', label: 'BD : lire de droite à gauche (mangas)', type: 'checkbox', value: config.bdSensManga },
        { key: 'auteur', label: 'Mon nom (signature tapée, auteur des annotations)', type: 'text', value: config.auteur || '' },
        { key: 'claudeModel', label: 'Modèle de Loki (propulsé par Claude)', type: 'select', value: config.claudeModel || '', choices: [['', 'Par défaut (celui de Claude Code)'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']] },
        { key: 'claudeCommand', label: 'Commande Claude Code', type: 'text', value: config.claudeCommand || 'claude' },
        { key: 'claudeCommandes', label: 'Loki peut lancer des commandes (PowerShell, Python…) : plus lent, rarement utile', type: 'checkbox', value: Boolean(config.claudeCommandes) },
        ...(familles.length ? [
          { type: 'info', text: 'Loki fait sans me demander la permission, pour de bon :' },
          ...familles.map((f) => ({ key: `sansDemander-${f.id}`, label: f.libelle, type: 'checkbox', value: f.toujours })),
          { type: 'info', text: 'Lire et regarder les documents ne demande jamais. Ce qui est permis seulement pour la conversation en cours se voit et se retire avec le bouclier, en haut du panneau Loki.' },
        ] : []),
        { type: 'info', text: `Mímir ${version}. Réglages enregistrés dans ${configPath}.` },
      ],
      onInput(values, f) {
        if (!swatches.childElementCount) {
          for (const c of ACCENTS) swatches.append(el('button', { type: 'button', className: 'mini-swatch', style: `background:${c}`, onclick: () => f.setValue('accentColor', c) }));
        }
        document.documentElement.style.setProperty('--accent', values.accentColor);
        document.body.classList.toggle('glass', values.glass);
      },
    });
    if (!v) return applyTheme(config);
    if (familles.length) {
      v.claudeSansDemander = {};
      for (const f of familles) { if (v[`sansDemander-${f.id}`]) v.claudeSansDemander[f.id] = true; delete v[`sansDemander-${f.id}`]; }
    }
    if (/^\d/.test(v.zoom)) v.zoom = Number(v.zoom);
    await ecrireConfig(v);
    for (const o of onglets) o.lecteur?.couleurs?.(config.lecture);
    if (await applyTheme(config)) notify('Le flou de Windows 11 sera actif au prochain démarrage de Mímir.', 'info', 6000);
  }

  // --- Ouvrir des documents ---
  async function choisirEtOuvrir() {
    try {
      const chemins = await window.mimir.choisir();
      await ouvrir(chemins);
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }

  async function ouvrir(chemins, { activer = true } = {}) {
    let dernier = null;
    for (const chemin of chemins) {
      const deja = onglets.find((o) => o.chemin.toLowerCase() === String(chemin).toLowerCase());
      if (deja) { dernier = deja; continue; }
      const onglet = { id: nouvelId(), chemin, nom: nomFichier(chemin), type: typeDe(chemin).type, lecteur: null, silencieux: !activer };
      onglets.push(onglet);
      creerBouton(onglet);
      dernier = onglet;
      if (activer) activerOnglet(onglet.id);
      onglet.chargement = charger(onglet);
      await onglet.chargement;
    }
    if (dernier && activer) activerOnglet(dernier.id);
    sauverOuverts();
    return dernier;
  }

  async function charger(onglet) {
    const attente = el('div', { className: 'vue chargement' }, el('i', { className: 'codicon codicon-loading codicon-modifier-spin' }), el('span', { textContent: `Ouverture de ${onglet.nom}…` }));
    $('#vues').append(attente);
    onglet.attente = attente;
    try {
      const doc = await window.mimir.lire(onglet.chemin);
      onglet.chemin = doc.chemin;
      const position = config.reprendre ? (config.documents[doc.chemin] || {}) : {};
      const ctx = {
        config,
        position,
        changement: () => changement(onglet),
        basculerCote: () => basculerCote(),
      };
      onglet.lecteur = await Lecteurs.creer(onglet.type, doc, ctx);
      // Les octets ne servent plus (chaque lecteur a pris ce qu'il lui faut) : on libère la mémoire.
      doc.bytes = null;
      attente.remove();
      onglet.lecteur.racine.hidden = onglet.id !== actifId;
      $('#vues').append(onglet.lecteur.racine);
      if (onglet.id === actifId) activerOnglet(onglet.id, { force: true });
    } catch (err) {
      attente.remove();
      if (!onglet.silencieux) notify(cleanError(err), 'error');
      log(`Ouverture impossible : ${onglet.chemin} : ${cleanError(err)}`);
      fermerOnglet(onglet.id, { sansDemander: true });
    }
  }
  const log = (m) => console.warn(m);

  function creerBouton(onglet) {
    const t = typeDe(onglet.chemin);
    const b = el('div', { className: 'onglet', title: onglet.chemin, onclick: () => activerOnglet(onglet.id), onauxclick: (e) => { if (e.button === 1) fermerOnglet(onglet.id); } },
      el('i', { className: `codicon codicon-${t.icone}` }),
      el('span', { className: 'onglet-nom', textContent: onglet.nom }),
      el('span', { className: 'onglet-modifie', textContent: '●', title: 'Pas encore enregistré' }),
      el('button', { className: 'onglet-fermer', title: 'Fermer (Ctrl+W)', onclick: (e) => { e.stopPropagation(); fermerOnglet(onglet.id); } }, el('i', { className: 'codicon codicon-close' })));
    onglet.bouton = b;
    $('#onglets').append(b);
  }

  function activerOnglet(id, { force = false } = {}) {
    if (id === actifId && !force) return;
    const avant = actif();
    if (avant && avant.id !== id) { avant.lecteur?.cacher(); if (avant.lecteur) avant.lecteur.racine.hidden = true; if (avant.attente) avant.attente.hidden = true; }
    actifId = id;
    const o = actif();
    $('#accueil').hidden = Boolean(o);
    $('#layout').hidden = !o;
    for (const x of onglets) x.bouton.classList.toggle('actif', x.id === id);
    if (!o) { document.title = 'Mímir'; majStatut(); return; }
    o.bouton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (o.attente) o.attente.hidden = false;
    const barre = $('#barre'), cote = $('#cote');
    barre.innerHTML = '';
    cote.innerHTML = '';
    if (o.lecteur) {
      o.lecteur.racine.hidden = false;
      barre.append(o.lecteur.barre);
      if (o.lecteur.cote) cote.append(o.lecteur.cote);
      o.lecteur.montrer();
    }
    $('#layout').classList.toggle('sans-cote', !o.lecteur?.cote || !config.miniatures);
    document.title = `${o.nom} · Mímir`;
    majStatut();
  }

  async function fermerOnglet(id, { sansDemander = false } = {}) {
    const o = onglets.find((x) => x.id === id);
    if (!o) return true;
    if (!sansDemander && o.lecteur?.modifie) {
      activerOnglet(id);
      const r = await Dialogs.ask('Modifications non enregistrées', `${o.nom} a des annotations, une signature ou des champs remplis qui ne sont pas encore enregistrés dans le fichier.`, [
        { label: 'Annuler', value: null },
        { label: 'Ne pas enregistrer', value: 'non' },
        { label: 'Enregistrer', value: 'oui', primary: true },
      ]);
      if (!r) return false;
      if (r === 'oui' && !(await o.lecteur.enregistrer().catch((err) => { notify(cleanError(err), 'error'); return false; }))) return false;
    }
    sauverPosition(o);
    const i = onglets.indexOf(o);
    onglets.splice(i, 1);
    o.bouton.remove();
    o.attente?.remove();
    try { o.lecteur?.detruire(); } catch { /* déjà détruit */ }
    if (actifId === id) activerOnglet(onglets[Math.min(i, onglets.length - 1)]?.id || null);
    sauverOuverts();
    compterNonEnregistres();
    if (!onglets.length) rendreAccueil();
    return true;
  }

  // --- Barre d'état, onglet modifié, reprise de lecture ---
  function changement(onglet) {
    onglet.bouton.classList.toggle('modifie', Boolean(onglet.lecteur?.modifie));
    if (onglet.id === actifId) majStatut();
    compterNonEnregistres();
    clearTimeout(onglet.delai);
    onglet.delai = setTimeout(() => sauverPosition(onglet), 800);
  }
  function majStatut() {
    const o = actif();
    const e = o?.lecteur?.etat() || {};
    $('#status-doc').textContent = o ? `\u200e${o.chemin}` : '';
    $('#status-info').textContent = e.info || '';
    $('#status-page').textContent = e.page !== undefined && e.pages ? `Page ${e.page} sur ${e.pages}` : (e.page || '');
    $('#status-zoom').textContent = e.zoom || '';
  }
  function sauverPosition(o) {
    if (!o.lecteur) return;
    window.mimir.position(o.chemin, o.lecteur.position()).catch(() => {});
  }
  let ouvertsDelai = null;
  function sauverOuverts() {
    clearTimeout(ouvertsDelai);
    ouvertsDelai = setTimeout(() => { ecrireConfig({ ouverts: onglets.map((o) => o.chemin), actif: actif()?.chemin || null }).catch(() => {}); }, 300);
  }
  function compterNonEnregistres() {
    window.mimir.nonEnregistres(onglets.filter((o) => o.lecteur?.modifie).length);
  }
  function basculerCote() {
    config.miniatures = !config.miniatures;
    $('#layout').classList.toggle('sans-cote', !actif()?.lecteur?.cote || !config.miniatures);
    ecrireConfig({ miniatures: config.miniatures });
    actif()?.lecteur?.montrer();
  }

  // Fermer Mímir avec des documents pas enregistrés : on demande pour chacun.
  window.mimir.onFermerDemande(async () => {
    for (const o of [...onglets]) {
      if (!o.lecteur?.modifie) continue;
      if (!(await fermerOnglet(o.id))) return;
    }
    for (const o of onglets) sauverPosition(o);
    await window.mimir.fermer();
  });
  window.addEventListener('beforeunload', () => { for (const o of onglets) sauverPosition(o); });

  // --- Accueil ---
  async function rendreAccueil() {
    const recents = await window.mimir.recents();
    const liste = $('#accueil-recents');
    liste.innerHTML = '';
    $('#accueil-recents-titre').hidden = !recents.length;
    for (const d of recents.slice(0, 12)) {
      const t = typeDe(d);
      const pos = config.documents[d];
      const b = el('div', { className: 'recent', role: 'button', tabIndex: 0, onclick: () => ouvrir([d]), onkeydown: (e) => { if (e.key === 'Enter') ouvrir([d]); } },
        el('i', { className: `codicon codicon-${t.icone}` }),
        el('span', { className: 'recent-name', textContent: nomFichier(d) }),
        el('span', { className: 'recent-path', textContent: `‎${dossierDe(d)}` }),
        el('span', { className: 'recent-page', textContent: pos?.page > 1 ? `p. ${pos.page}` : '' }),
        el('button', { className: 'icon-button recent-oublier', title: 'Retirer de la liste', onclick: async (e) => { e.stopPropagation(); await window.mimir.oublier(d); rendreAccueil(); } }, el('i', { className: 'codicon codicon-close' })));
      liste.append(b);
    }
  }

  // --- Glisser-déposer des fichiers sur la fenêtre ---
  let profondeur = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { profondeur++; document.body.classList.add('drop-target'); } });
  window.addEventListener('dragleave', () => { profondeur = Math.max(0, profondeur - 1); if (!profondeur) document.body.classList.remove('drop-target'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    profondeur = 0;
    document.body.classList.remove('drop-target');
    // Une image glissée sur une page PDF est prise par pdf.js (outil Image) : on ne l'ouvre pas en plus.
    if (e.defaultPrevented && e.target.closest?.('.annotationEditorLayer')) return;
    const chemins = [...(e.dataTransfer?.files || [])].map((f) => window.mimir.pathOfDropped(f)).filter(Boolean);
    if (chemins.length) ouvrir(chemins);
  });

  // --- Raccourcis clavier ---
  window.addEventListener('keydown', (e) => {
    if (Dialogs.isOpen()) { if (e.key === 'Escape') Dialogs.close(null); return; }
    const k = e.key.toLowerCase();
    const o = actif();
    const l = o?.lecteur;
    const saisie = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (e.key === 'F11') { e.preventDefault(); window.mimir.pleinEcran(); return; }
    if (e.ctrlKey && !e.altKey) {
      if (k === 'o') { e.preventDefault(); choisirEtOuvrir(); }
      else if (k === 'w' || k === 'f4') { e.preventDefault(); if (o) fermerOnglet(o.id); }
      else if (k === 'tab' && onglets.length > 1) {
        e.preventDefault();
        const i = onglets.indexOf(o);
        activerOnglet(onglets[(i + (e.shiftKey ? -1 : 1) + onglets.length) % onglets.length].id);
      } else if (e.key === ',') { e.preventDefault(); ouvrirReglages(); }
      else if (!l) return;
      else if (k === 'f') { e.preventDefault(); l.chercher(); }
      else if (k === 's') { e.preventDefault(); l.enregistrer({ sous: e.shiftKey }).catch((err) => notify(cleanError(err), 'error')); }
      else if (k === 'p') { e.preventDefault(); Promise.resolve(l.imprimer()).catch((err) => notify(cleanError(err), 'error')); }
      else if (k === 'g') { e.preventDefault(); $('.page-num', $('#barre'))?.focus(); }
      else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') { e.preventDefault(); l.zoomer(1); }
      else if (e.key === '-' || e.code === 'NumpadSubtract') { e.preventDefault(); l.zoomer(-1); }
      else if (e.key === '0' || e.key === 'à' || e.code === 'Numpad0') { e.preventDefault(); l.zoomer(0); }
      return;
    }
    if (!l || saisie) return;
    if (l.clavier(e)) e.preventDefault();
  });

  // --- Boutons ---
  $('#btn-ouvrir').onclick = choisirEtOuvrir;
  $('#accueil-ouvrir').onclick = choisirEtOuvrir;
  $('#btn-reglages').onclick = ouvrirReglages;

  return {
    config: () => config,
    ecrireConfig,
    // Pour Claude (claude-actions.js)
    claude: {
      onglets: () => onglets,
      actif,
      ouvrir: (chemin) => ouvrir([chemin]),
      activer: (onglet) => activerOnglet(onglet.id),
      attendre: async (onglet) => { await onglet.chargement; if (!onglet.lecteur) throw new Error(`${onglet.nom} n'a pas pu s'ouvrir.`); return onglet.lecteur; },
    },
    async start() {
      const lu = await window.mimir.readConfig();
      config = lu.config;
      configPath = lu.path;
      await applyTheme(config);
      await rendreAccueil();
      window.mimir.onDocumentsExternes((fichiers) => ouvrir(fichiers));
      const fichiers = await window.mimir.demarrage();
      // Les documents restés ouverts la dernière fois, puis ceux passés par Windows (double-clic).
      if (config.rouvrirOnglets && config.ouverts?.length) {
        const precedent = config.actif;
        await ouvrir(config.ouverts, { activer: false });
        const o = onglets.find((x) => x.chemin === precedent) || onglets[0];
        if (o && !fichiers.length) activerOnglet(o.id);
      }
      if (fichiers.length) await ouvrir(fichiers);
    },
  };
})();

App.start();
