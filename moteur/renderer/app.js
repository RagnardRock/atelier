// L'interface de Saga autour du jeu : l'accueil (ouvrir un jeu), la scène (le canvas du moteur),
// le menu de pause, les réglages, le plein écran et les raccourcis.
//
// Raccourcis :
//   Ctrl+O  ouvrir un jeu          F5   recharger le jeu (après un enregistrement dans Tafl)
//   Échap   menu de pause          F3   montrer le passage, les zones, les téléporteurs
//   F11     plein écran            Ctrl+, réglages

const App = (() => {
  const moteur = Moteur.creer($('#ecran'), {
    carte: (carte) => montrerBandeau(carte.nom),
    message: (texte) => notify(texte, 'warning', 6000),
  });
  let config = {};
  let ouvert = null; // { dossier, jeu } : le jeu en cours

  // --- Réglages ---
  async function chargerConfig() {
    ({ config } = await window.saga.readConfig());
    moteur.regler(config);
  }

  async function reglages() {
    const etaitEnPause = !$('#pause').hidden;
    moteur.pause(true);
    const v = await Dialogs.form({
      title: 'Réglages de Saga',
      okLabel: 'Enregistrer',
      fields: [
        { key: 'zoom', label: 'Zoom', type: 'select', value: String(config.zoom), choices: [['0', 'Automatique'], ...[1, 2, 3, 4, 5, 6, 7, 8].map((z) => [String(z), `× ${z}`])] },
        { key: 'casesVisibles', label: 'Cases visibles', type: 'range', min: 7, max: 24, step: 1, value: config.casesVisibles, unit: 'en hauteur' },
        { type: 'info', text: 'En zoom automatique, Saga choisit le plus grand zoom entier qui montre au moins ce nombre de cases en hauteur. Un zoom entier garde le pixel art parfaitement net.' },
        { key: 'courirParDefaut', label: 'Courir sans tenir Maj (Maj fait alors marcher)', type: 'checkbox', value: config.courirParDefaut },
        { key: 'meteo', label: 'Montrer la météo des cartes', type: 'checkbox', value: config.meteo },
      ],
      onInput: (vals) => moteur.regler({ ...vals, zoom: Number(vals.zoom) }),
    });
    if (v) {
      config = await window.saga.writeConfig({ ...v, zoom: Number(v.zoom) });
    }
    moteur.regler(config);
    if (!etaitEnPause) moteur.pause(false);
  }

  // --- Ouvrir un jeu ---
  async function lancer(textes, depart) {
    if (!textes) return;
    let jeu;
    try {
      jeu = await Jeu.charger(textes);
    } catch (err) {
      notify(err instanceof Jeu.ErreurJeu ? err.message : `Impossible d'ouvrir ce jeu : ${cleanError(err)}`, 'error');
      return;
    }
    // Un départ demandé (« Jouer ici » de Tafl, ou F5) qui n'existe plus : on revient au départ du jeu.
    const d = depart && jeu.cartes.has(depart.carte) ? depart : null;
    ouvert = { dossier: textes.dossier, jeu };
    $('#accueil').hidden = true;
    $('#scene').hidden = false;
    $('#titre-jeu').textContent = jeu.titre;
    $('#titre-jeu').hidden = false;
    $('#pause-jeu').textContent = jeu.titre;
    for (const id of ['#btn-recharger', '#btn-debug']) $(id).hidden = false;
    document.title = `${jeu.titre} · Saga`;
    fermerPause();
    moteur.demarrer(jeu, d);
    for (const p of jeu.problemes) notify(`À savoir : ${p}.`, 'warning', 9000);
  }

  async function ouvrir() {
    try {
      await lancer(await window.saga.choisirJeu());
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }

  async function ouvrirDossier(dossier, depart) {
    try {
      await lancer(await window.saga.ouvrirJeu(dossier), depart);
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }

  // F5 : on relit le jeu sur le disque (ce que Tafl vient d'enregistrer) et on replace le joueur où il était.
  async function recharger() {
    if (!ouvert) return;
    const ici = moteur.position();
    await ouvrirDossier(ouvert.dossier, ici);
    notify('Jeu rechargé.', 'success', 1800);
  }

  function quitter() {
    moteur.arreter();
    ouvert = null;
    fermerPause();
    $('#scene').hidden = true;
    $('#accueil').hidden = false;
    $('#titre-jeu').hidden = true;
    for (const id of ['#btn-recharger', '#btn-debug']) $(id).hidden = true;
    $('#infos').hidden = true;
    document.title = 'Saga';
    afficherRecents();
  }

  async function afficherRecents() {
    const liste = $('#accueil-recents');
    liste.innerHTML = '';
    const recents = await window.saga.jeuxRecents();
    $('#accueil-recents-titre').hidden = !recents.length;
    for (const dossier of recents) {
      const nom = dossier.split(/[\\/]/).pop();
      const b = el('button', { className: 'recent', title: dossier },
        el('i', { className: 'codicon codicon-play-circle' }),
        el('span', { className: 'recent-name', textContent: nom }),
        el('span', { className: 'recent-path', textContent: dossier }));
      b.onclick = () => ouvrirDossier(dossier);
      liste.append(b);
    }
  }

  // --- Le bandeau du nom de la carte ---
  let minuterieBandeau = 0;
  function montrerBandeau(nom) {
    const b = $('#bandeau');
    $('#bandeau-nom').textContent = nom;
    b.classList.remove('visible');
    void b.offsetWidth; // relance l'animation
    b.classList.add('visible');
    clearTimeout(minuterieBandeau);
    minuterieBandeau = setTimeout(() => b.classList.remove('visible'), 2600);
  }

  // --- Pause ---
  function ouvrirPause() {
    if (!ouvert) return;
    moteur.pause(true);
    $('#pause').hidden = false;
    $('.pause-choix').focus();
  }
  function fermerPause() {
    $('#pause').hidden = true;
    moteur.pause(false);
  }
  $('#pause').addEventListener('click', async (e) => {
    const action = e.target.closest('.pause-choix')?.dataset.action;
    if (!action) { if (e.target.id === 'pause') fermerPause(); return; }
    if (action === 'reprendre') fermerPause();
    else if (action === 'recharger') recharger();
    else if (action === 'recommencer') { fermerPause(); moteur.demarrer(ouvert.jeu, null); }
    else if (action === 'reglages') reglages();
    else if (action === 'dossier') window.saga.montrerJeu(ouvert.dossier).catch((err) => notify(cleanError(err), 'error'));
    else if (action === 'quitter') quitter();
  });
  // Dans le menu de pause, les flèches passent d'un choix à l'autre.
  $('#pause').addEventListener('keydown', (e) => {
    const choix = $$('.pause-choix');
    const i = choix.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      choix[(i + (e.key === 'ArrowDown' ? 1 : -1) + choix.length) % choix.length].focus();
    }
  });

  // --- Infos (F3) ---
  function basculerDebug() {
    const oui = moteur.basculerDebug();
    $('#infos').hidden = !oui;
    $('#btn-debug').classList.toggle('actif', oui);
  }
  setInterval(() => {
    if ($('#infos').hidden) return;
    const i = moteur.infos();
    if (!i) return;
    $('#infos').textContent = `${i.nom} (${i.carte}) · case ${i.x}, ${i.y} · regarde ${i.direction} · ${i.fps} img/s · ${i.W}×${i.H} px × ${i.zoom}`;
  }, 250);

  // --- Plein écran ---
  const basculerPleinEcran = () => window.saga.pleinEcran();
  window.saga.onPleinEcran((oui) => {
    document.body.classList.toggle('plein-ecran', oui);
    $('#btn-plein .codicon').className = `codicon codicon-${oui ? 'screen-normal' : 'screen-full'}`;
    requestAnimationFrame(() => moteur.redimensionner());
  });

  // --- Raccourcis ---
  window.addEventListener('keydown', (e) => {
    if (Dialogs.isOpen()) {
      if (e.key === 'Escape') Dialogs.close(null);
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); ouvrir(); }
    else if (ctrl && e.key === ',') { e.preventDefault(); reglages(); }
    else if (e.key === 'F11') { e.preventDefault(); basculerPleinEcran(); }
    else if (e.key === 'F5' && ouvert) { e.preventDefault(); recharger(); }
    else if (e.key === 'F3' && ouvert) { e.preventDefault(); basculerDebug(); }
    else if (e.key === 'Escape' && ouvert) {
      e.preventDefault();
      if ($('#pause').hidden) ouvrirPause(); else fermerPause();
    }
  });
  // Manette : le bouton Start ouvre et ferme le menu de pause.
  let startAvant = false;
  setInterval(() => {
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
    const start = Boolean(pad?.buttons[9]?.pressed);
    if (start && !startAvant && ouvert && !Dialogs.isOpen()) ($('#pause').hidden ? ouvrirPause : fermerPause)();
    startAvant = start;
  }, 50);

  $('#accueil-ouvrir').onclick = ouvrir;
  $('#btn-recharger').onclick = recharger;
  $('#btn-debug').onclick = basculerDebug;
  $('#btn-plein').onclick = basculerPleinEcran;
  $('#btn-reglages').onclick = reglages;
  new ResizeObserver(() => { if (ouvert) moteur.redimensionner(); }).observe($('#scene'));

  // Un jeu lancé par Tafl (« Jouer ») ou Atelier alors que Saga est déjà ouvert.
  window.saga.onJeuExterne((l) => ouvrirDossier(l.dossier, l.depart));

  async function init() {
    await chargerConfig();
    const l = await window.saga.demarrage();
    if (l) await ouvrirDossier(l.dossier, l.depart);
    else afficherRecents();
  }
  init();

  return { ouvrir, ouvrirDossier, recharger, moteur };
})();
