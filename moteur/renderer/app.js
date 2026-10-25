// L'interface de Saga autour du jeu : l'accueil (ouvrir un jeu), la scène (le canvas du moteur),
// le menu de pause, les réglages, le plein écran et les raccourcis.
//
// Raccourcis :
//   Ctrl+O  ouvrir un jeu          F5   recharger le jeu (après un enregistrement dans Tafl)
//   Échap   menu de pause          F3   montrer le passage, les zones, les téléporteurs
//   F11     plein écran            Ctrl+, réglages

const App = (() => {
  // Le mode joueur (Saga 0.9) : un jeu exporté (.exe ou web). Le jeu seul, sans les outils de Saga.
  const joueur = window.saga.joueur || null;
  if (joueur) document.body.classList.add('joueur', ...(joueur.web ? ['web'] : []));
  if (joueur) $('#pause-quitter').textContent = 'Quitter le jeu';
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
    const themeAvant = config.theme;
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
        { key: 'theme', label: 'Interface en jeu', type: 'select', value: config.theme || 'jeu', choices: [['jeu', 'Celle choisie par le jeu'], ['verre', 'Verre (sombre, flou)'], ['pixel', 'Pixel (rétro)']] },
      ],
      onInput: (vals) => { moteur.regler({ ...vals, zoom: Number(vals.zoom) }); config = { ...config, theme: vals.theme }; appliquerTheme(); },
    });
    if (v) {
      config = await window.saga.writeConfig({ ...v, zoom: Number(v.zoom) });
    } else config = { ...config, theme: themeAvant };
    moteur.regler(config);
    appliquerTheme();
    if (!etaitEnPause) moteur.pause(false);
  }

  // Le thème de l'interface en jeu (Saga 0.4) : celui que le jeu choisit dans Tafl (Réglages >
  // Interface du jeu), sauf si les réglages de Saga en forcent un. La couleur d'accent du jeu remplace
  // celle de Saga dans toute la scène (dialogues, combat, carnet, pause).
  function appliquerTheme() {
    const ui = ouvert?.jeu.donnees.reglages?.reglages?.interface || {};
    const theme = config.theme === 'verre' || config.theme === 'pixel' ? config.theme : ui.theme === 'pixel' ? 'pixel' : 'verre';
    $('#scene').dataset.theme = theme;
    const accent = /^#[0-9a-f]{6}$/i.test(ui.accent || '') ? ui.accent : '';
    $('#scene').style.setProperty('--accent', accent || null);
  }

  // --- Ouvrir un jeu ---
  // depart : où commencer (« Jouer ici » de Tafl). partie : une partie à garder (F5).
  // Sans l'un ni l'autre, s'il y a une sauvegarde, Saga propose de la continuer.
  async function lancer(textes, depart, partie = null) {
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
    appliquerTheme();
    $('#accueil').hidden = true;
    $('#scene').hidden = false;
    $('#titre-jeu').textContent = jeu.titre;
    $('#titre-jeu').hidden = false;
    $('#pause-jeu').textContent = jeu.titre;
    for (const id of ['#btn-recharger', '#btn-debug']) $(id).hidden = false;
    document.title = joueur ? jeu.titre : `${jeu.titre} · Saga`;
    fermerPause();
    if (!partie && !d) {
      const sauvegarde = await window.saga.lireSauvegarde(textes.dossier).catch(() => null);
      if (sauvegarde?.partie) {
        const quand = new Date(sauvegarde.quand).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
        const suite = await Dialogs.ask(jeu.titre, `Une partie est sauvegardée (${quand}).`, [
          { label: 'Nouvelle partie', value: false },
          { label: 'Continuer', value: true, primary: true },
        ]);
        if (suite) partie = sauvegarde.partie;
      }
    }
    // Une partie dont la carte n'existe plus (supprimée dans Tafl) repart du départ du jeu.
    if (partie && !jeu.cartes.has(partie.position?.carte)) partie = { ...partie, position: { ...jeu.depart } };
    moteur.demarrer(jeu, d, partie);
    for (const p of jeu.problemes) notify(`À savoir : ${p}.`, 'warning', 9000);
  }

  async function sauvegarder() {
    if (!ouvert || moteur.enScript) return;
    try {
      await window.saga.ecrireSauvegarde(ouvert.dossier, { quand: Date.now(), partie: moteur.partie() });
      moteur.annoncer('Partie sauvegardée');
    } catch (err) {
      notify(`Sauvegarde impossible : ${cleanError(err)}`, 'error');
    }
  }

  async function ouvrir() {
    try {
      await lancer(await window.saga.choisirJeu());
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }

  async function ouvrirDossier(dossier, depart, partie) {
    try {
      await lancer(await window.saga.ouvrirJeu(dossier), depart, partie);
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }

  // F5 : on relit le jeu sur le disque (ce que Tafl vient d'enregistrer), sans perdre la partie :
  // le joueur reste où il était, avec ses objets, ses quêtes, ses interrupteurs.
  async function recharger() {
    if (!ouvert || moteur.enScript) return;
    const partie = moteur.partie();
    await ouvrirDossier(ouvert.dossier, partie?.position, partie);
    notify('Jeu rechargé.', 'success', 1800);
  }

  function quitter() {
    if (joueur) { window.close(); return; }
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
    // Les noms des menus et le Pokédex montré ou non : la forme des menus du jeu (Saga 0.6).
    const forme = moteur.formeMenus();
    $('#pause-dex').textContent = forme.dex;
    $('#pause-equipe').textContent = forme.equipe;
    $('.pause-choix[data-action="dex"]').hidden = !forme.dex_visible;
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
    else if (action === 'sauvegarder') { fermerPause(); sauvegarder(); }
    else if (action === 'carnet') ouvrirCarnet();
    else if (action === 'equipe' || action === 'dex') { fermerPause(); moteur.ouvrirEcran(action); }
    else if (action === 'reglages') reglages();
    else if (action === 'dossier') window.saga.montrerJeu(ouvert.dossier).catch((err) => notify(cleanError(err), 'error'));
    else if (action === 'exporter') { fermerPause(); exporter(); }
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

  // --- Le carnet (Tab) : l'équipe, le sac, l'argent et les quêtes ---
  function ouvrirCarnet() {
    if (!ouvert) return;
    const { jeu } = ouvert;
    const p = moteur.partie();
    const liste = (sorte) => jeu.donnees[sorte]?.[sorte] || [];
    const nom = (sorte, id) => liste(sorte).find((x) => x.id === id)?.nom || id;
    const corps = $('#carnet-corps');
    corps.innerHTML = '';
    const section = (titre, lignes, vide) => {
      corps.append(el('h3', { textContent: titre }));
      const ul = el('ul');
      for (const l of lignes) ul.append(l);
      if (!lignes.length) ul.append(el('li', { className: 'vide', textContent: vide }));
      corps.append(ul);
    };
    $('#carnet-titre').textContent = p.nom;
    const dex = p.dex || { vus: {}, pris: {} }, forme = moteur.formeMenus();
    $('#carnet-dex').textContent = `${forme.dex} · ${Regles.dex(jeu).especes.filter((e) => dex.pris[e.id]).length}`;
    $('#carnet-equipe').textContent = forme.equipe;
    $('.carnet-bouton[data-ecran="dex"]').hidden = !forme.dex_visible;
    $('#carnet-argent').textContent = `${p.argent} ${jeu.donnees.reglages?.reglages?.monnaie || '₽'}`;
    // L'équipe : sprite, nom, niveau, PV et statut (Saga 0.3).
    // Un clic sur une créature : son résumé (Saga 0.6).
    section(forme.equipe, p.equipe.map((c, i) => {
      const r = Regles.resume(jeu, c), k = r.pv / Math.max(1, r.pvMax);
      return el('li', { className: 'carnet-creature', title: 'Voir son résumé', onclick: () => { fermerCarnet(); moteur.ouvrirEcran('equipe', i); } },
        r.image ? el('img', { src: r.image, alt: '' }) : el('span', { className: 'carnet-img' }),
        el('span', { className: 'carnet-nom', textContent: `${r.nom}${r.statut ? `  ${r.statut}` : ''}` }),
        el('span', { className: 'carnet-pv' }, el('span', { style: `width: ${Math.round(k * 100)}%`, className: `niveau-${k > 0.5 ? 'haut' : k > 0.2 ? 'moyen' : 'bas'}` })),
        el('span', { className: 'discret', textContent: `N.${r.niveau} · ${r.pv > 0 ? `${r.pv}/${r.pvMax} PV` : 'K.O.'}` }));
    }), 'Pas encore de compagnon.');
    // Les badges du jeu (Tafl 0.16) : ceux reçus en couleur, les autres en ombre.
    const badges = jeu.donnees.reglages?.reglages?.badges || [];
    if (badges.length) {
      corps.append(el('h3', { textContent: `Badges · ${p.badges.filter((b) => badges.some((x) => x.id === b)).length}/${badges.length}` }));
      corps.append(el('div', { className: 'carnet-badges' }, ...badges.map((b) => {
        const recu = p.badges.includes(b.id);
        return el('div', { className: `carnet-badge${recu ? ' recu' : ''}`, title: recu ? b.nom : '???' },
          b.icone ? el('img', { src: b.icone, alt: '' }) : el('span', { className: 'carnet-badge-vide', textContent: '★' }));
      })));
    }
    // Le sac : un objet qui sert hors combat (soin, vitamine, menthe, capsule, pierre…) a son bouton « Utiliser ».
    section('Sac', Object.entries(p.sac).map(([id, n]) => el('li', {},
      el('span', { textContent: nom('objets', id) }),
      el('span', { className: 'carnet-sac-droite' },
        moteur.objetUtilisable(id) ? el('button', { className: 'carnet-utiliser', type: 'button', textContent: 'Utiliser', onclick: () => { fermerCarnet(); moteur.utiliserObjet(id); } }) : null,
        el('span', { className: 'discret', textContent: `×${n}` })))), 'Le sac est vide.');
    const quetes = Object.entries(p.quetes).sort(([, a], [, b]) => (a.etat === 'finie') - (b.etat === 'finie'));
    section('Quêtes', quetes.map(([id, q]) => {
      const def = liste('quetes').find((x) => x.id === id);
      const etape = def?.etapes?.[q.etape - 1]?.texte;
      return el('li', { className: q.etat === 'finie' ? 'finie' : '' },
        el('span', { textContent: `${def?.titre || id}${def?.secondaire ? ' (secondaire)' : ''}` }),
        el('span', { className: 'discret', textContent: q.etat === 'finie' ? 'terminée' : etape || `étape ${q.etape}` }));
    }), 'Aucune quête commencée.');
    fermerPause();
    moteur.pause(true);
    $('#carnet').hidden = false;
  }
  function fermerCarnet() {
    $('#carnet').hidden = true;
    moteur.pause(false);
  }
  $('#carnet').addEventListener('click', (e) => {
    const ecran = e.target.closest('.carnet-bouton')?.dataset.ecran;
    if (ecran) { fermerCarnet(); moteur.ouvrirEcran(ecran); }
    else if (e.target.id === 'carnet' || e.target.closest('.carnet-fermer')) fermerCarnet();
  });

  // --- Exporter le jeu (Saga 0.9) : une version web et/ou Windows à envoyer à des testeurs ---
  // Saga relit le jeu sur le disque (ce que Tafl a enregistré), pas la partie en cours.
  let attenteExport = null; // la notification qui dit où en est l'export
  window.saga.onExportProgres?.((texte) => { if (attenteExport) attenteExport.querySelector('.message').textContent = texte; });
  async function exporter() {
    if (!ouvert || joueur) return;
    moteur.pause(true);
    try {
      const v = await Dialogs.form({
        title: `Exporter « ${ouvert.jeu.titre} »`,
        okLabel: 'Choisir le dossier et exporter',
        fields: [
          { key: 'web', label: 'Version web (index.html, à ouvrir dans un navigateur ou à mettre sur itch.io)', type: 'checkbox', value: config.exportWeb ?? true },
          { key: 'exe', label: `Version ${window.saga.platform === 'win32' ? 'Windows (.exe, rien à installer)' : 'pour ce système (application)'}`, type: 'checkbox', value: config.exportExe ?? true },
          { type: 'info', text: 'Chaque version donne un dossier et un .zip à envoyer. L\'export reprend le jeu tel qu\'il est enregistré par Tafl. Les testeurs n\'ont besoin ni de Tafl ni de Saga.' },
        ],
      });
      if (!v) return;
      config = await window.saga.writeConfig({ exportWeb: v.web, exportExe: v.exe });
      const formats = [v.web && 'web', v.exe && 'exe'].filter(Boolean);
      if (!formats.length) return notify('Coche au moins une version.', 'info');
      attenteExport = notify('Export du jeu…', 'info', 600000);
      let r;
      try {
        r = await window.saga.exporter(ouvert.dossier, formats);
      } finally {
        attenteExport.remove();
        attenteExport = null;
      }
      if (!r) return;
      const lignes = [r.web && `• Web : ${r.web.zip}`, r.exe && `• ${window.saga.platform === 'win32' ? 'Windows' : 'Application'} : ${r.exe.zip}`].filter(Boolean);
      const voir = await Dialogs.ask('Jeu exporté', `« ${r.titre} » est prêt à envoyer :\n\n${lignes.join('\n')}\n\nChaque .zip a son dossier à côté, pour essayer avant d'envoyer.`, [
        { label: 'Fermer', value: null },
        { label: 'Montrer dans l\'explorateur', value: (r.web || r.exe).zip, primary: true },
      ]);
      if (voir) window.saga.montrerExport(voir).catch((err) => notify(cleanError(err), 'error'));
    } catch (err) {
      notify(`Export impossible : ${cleanError(err)}`, 'error');
    } finally {
      if ($('#pause').hidden) moteur.pause(false);
    }
  }

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
    // Mode joueur : pas d'autre jeu à ouvrir, pas de rechargement ni de vue de débogage.
    if (joueur && ((ctrl && e.key.toLowerCase() === 'o') || e.key === 'F5' || e.key === 'F3')) { e.preventDefault(); return; }
    if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); ouvrir(); }
    else if (ctrl && e.key === ',') { e.preventDefault(); reglages(); }
    else if (e.key === 'F11') { e.preventDefault(); basculerPleinEcran(); }
    else if (e.key === 'F5' && ouvert) { e.preventDefault(); recharger(); }
    else if (e.key === 'F3' && ouvert) { e.preventDefault(); basculerDebug(); }
    else if (ctrl && e.key.toLowerCase() === 's' && ouvert) { e.preventDefault(); sauvegarder(); }
    else if (e.key === 'Tab' && ouvert) {
      e.preventDefault();
      if (!$('#carnet').hidden) fermerCarnet(); else if (!moteur.enScript) ouvrirCarnet();
    }
    else if (e.key === 'Escape' && ouvert) {
      e.preventDefault();
      if (!$('#carnet').hidden) fermerCarnet();
      else if (moteur.enScript) return; // pendant un dialogue, Échap n'ouvre pas la pause
      else if ($('#pause').hidden) ouvrirPause(); else fermerPause();
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

  // Sauvegarder en quittant Saga ? Non : la sauvegarde reste un geste du joueur (Ctrl+S ou la pause),
  // comme dans les jeux Pokémon. F5 garde la partie en mémoire.

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
