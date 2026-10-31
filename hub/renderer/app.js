// Chef d'orchestre de l'interface : thème (couleur, verre), réglages d'Atelier, petit mot d'accueil,
// et démarrage des différentes parties (outils, notes).

const App = (() => {
  let config = {};
  let configPath = '';

  // --- Thème ---
  const ACCENTS = ['#5fd4a8', '#5ec8ff', '#b9a8ff', '#e0a526', '#ff7aa8', '#ff8a4c', '#f5f5f5'];
  async function applyTheme(c) {
    document.documentElement.style.setProperty('--accent', c.accentColor);
    document.body.classList.toggle('glass', Boolean(c.glass));
    const { blur, needsRestart } = await window.atelier.setWindowTheme({ glass: c.glass, blur: c.windowBlur });
    document.body.classList.toggle('window-blur', blur);
    return needsRestart;
  }

  // --- Widgets affichés (Réglages › Widgets) ---
  // Chaque widget est un <article id="widget-…"> dans index.html. Un nouveau widget se décrit aussi à
  // Loki dans ../claude.js (WIDGETS), pour qu'il sache ce qu'il fait.
  const WIDGETS = [
    ['notes', 'Notes', 'widget-notes'],
    ['projets', 'Projets récents', 'widget-projets'],
    ['pressePapiers', 'Presse-papiers et couleurs', 'widget-presse-papiers'],
    ['minuteurs', 'Minuteurs', 'widget-minuteurs'],
    ['calendrier', 'Calendrier', 'widget-calendrier'],
    ['calculatrice', 'Calculatrice', 'widget-calculatrice'],
    ['claude', 'Loki', 'widget-claude'],
  ];
  const FAMILLES = [['notes', 'Les notes'], ['calendrier', 'Le calendrier'], ['minuteurs', 'Les minuteurs'], ['projets', 'Ouvrir un projet, lancer un outil'], ['memoire', 'Retenir ou oublier des infos sur mes projets'], ['installation', 'Installer, mettre à jour ou désinstaller un outil']];
  const LANGUES = [['fr', 'Français'], ['fr+en', 'Français et anglais'], ['en', 'Anglais']];
  // Pour Loki, dans Atelier (chaque outil a son propre choix, en haut de son panneau Loki).
  const MOTEURS = [['auto', 'Auto : Claude, et l\'IA locale quand Claude n\'est pas là'], ['claude', 'Toujours Claude'], ['local', 'Toujours l\'IA locale (Ollama)']];
  const MODELES = [['', 'Celui de Claude Code (par défaut)'], ['haiku', 'Haiku (rapide)'], ['sonnet', 'Sonnet'], ['opus', 'Opus (le plus fort)']];
  function applyWidgets(c) {
    for (const [key, , id] of WIDGETS) $(`#${id}`).hidden = c.widgets?.[key] === false;
  }

  // --- Réglages ---
  async function openSettings() {
    const blurOk = await window.atelier.blurSupported();
    const version = await window.atelier.version();
    const swatches = el('div', { className: 'accent-swatches' });
    // Bouton « Parcourir… » sous le dossier des projets.
    const parcourir = el('div', { className: 'field-actions' }, el('button', { type: 'button', className: 'button small', textContent: 'Parcourir…' }));
    const v = await Dialogs.form({
      title: 'Réglages d\'Atelier',
      okLabel: 'Enregistrer',
      width: 480,
      fields: [
        { key: 'accentColor', label: 'Couleur d\'accent', type: 'color', value: config.accentColor },
        { type: 'element', element: swatches },
        { key: 'glass', label: 'Verre dépoli (glassmorphism)', type: 'checkbox', value: config.glass },
        { key: 'windowBlur', label: blurOk ? 'Flou de Windows 11 derrière la fenêtre' : 'Flou de Windows 11 (non disponible ici)', type: 'checkbox', value: config.windowBlur },
        { key: 'checkToolUpdates', label: 'Au démarrage, chercher les nouvelles versions de mes outils', type: 'checkbox', value: config.checkToolUpdates },
        { key: 'dossierProjets', label: 'Dossier des projets', type: 'text', value: config.dossierProjets },
        { type: 'element', element: parcourir },
        { key: 'orthographe', label: 'Correction d\'orthographe (mots soulignés, corrections au clic droit)', type: 'checkbox', value: config.orthographe !== false },
        { key: 'languesOrthographe', label: 'Langue de la correction', type: 'select', choices: LANGUES, value: config.languesOrthographe || 'fr' },
        { key: 'surveillerPressePapiers', label: 'Retenir ce que je copie (historique du presse-papiers)', type: 'checkbox', value: config.surveillerPressePapiers },
        { key: 'garderPressePapiers', label: 'Garder cet historique après la fermeture d\'Atelier', type: 'checkbox', value: config.garderPressePapiers },
        { type: 'info', text: 'Widget Loki :' },
        { key: 'lokiMoteur', label: 'Qui répond', type: 'select', choices: MOTEURS, value: config.lokiMoteur || 'auto' },
        { key: 'claudeModel', label: 'Modèle Claude', type: 'select', choices: MODELES, value: config.claudeModel || '' },
        { key: 'claudeCommand', label: 'Commande', type: 'text', value: config.claudeCommand || 'claude' },
        { key: 'claudeLitProjets', label: 'Loki peut aussi lire les fichiers de mes projets (pas seulement leur état Git)', type: 'checkbox', value: config.claudeLitProjets !== false },
        { key: 'claudeActions', label: 'Loki peut agir dans Atelier (notes, calendrier, minuteurs, projets, installer un outil…)', type: 'checkbox', value: config.claudeActions !== false },
        { type: 'info', text: 'Sans me demander la permission, pour :' },
        ...FAMILLES.map(([key, label]) => ({ key: `sansDemander-${key}`, label, type: 'checkbox', value: Boolean(config.claudeSansDemander?.[key]) })),
        { type: 'info', text: 'Widgets affichés :' },
        ...WIDGETS.map(([key, label]) => ({ key: `widget-${key}`, label, type: 'checkbox', value: config.widgets?.[key] !== false })),
        { type: 'info', text: `Atelier ${version}. Réglages enregistrés dans ${configPath}.` },
      ],
      buttons: [
        { label: 'IA locale…', run: () => IaLocale.ouvrir() },
        { label: 'Dossier des notes', run: () => window.atelier.montrerNotes() },
        { label: 'Dossier partagé', title: 'Ouvrir le dossier partagé avec les outils (mémoire des projets, notes, projet en cours)', run: () => window.atelier.ouvrirCommun() },
      ],
      onInput(values, f) {
        parcourir.firstChild.onclick = async () => {
          const dossier = await window.atelier.choisirDossierProjets();
          if (dossier) f.setValue('dossierProjets', dossier);
        };
        if (!swatches.childElementCount) {
          for (const c of ACCENTS) {
            const b = el('button', { type: 'button', className: 'mini-swatch', title: c });
            b.style.background = c;
            b.onclick = () => f.setValue('accentColor', c);
            swatches.append(b);
          }
        }
        // Aperçu immédiat de la couleur et du verre.
        document.documentElement.style.setProperty('--accent', values.accentColor);
        document.body.classList.toggle('glass', values.glass);
      },
    });
    if (!v) return applyTheme(config);
    // Les cases « widget-… » deviennent config.widgets = { notes: true, … }.
    const widgets = {};
    for (const [key] of WIDGETS) { widgets[key] = v[`widget-${key}`]; delete v[`widget-${key}`]; }
    v.claudeSansDemander = {};
    for (const [key] of FAMILLES) { v.claudeSansDemander[key] = v[`sansDemander-${key}`]; delete v[`sansDemander-${key}`]; }
    const dossierChange = v.dossierProjets !== config.dossierProjets;
    config = await window.atelier.writeConfig({ ...v, widgets: { ...config.widgets, ...widgets } });
    applyWidgets(config);
    if (dossierChange) Projets.refresh();
    window.atelier.reglagesPressePapiers();
    if (await applyTheme(config)) notify('Le flou de Windows 11 sera actif au prochain démarrage d\'Atelier.', 'info', 6000);
  }
  $('#btn-settings').onclick = openSettings;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === ',') { e.preventDefault(); openSettings(); }
  });

  // --- Accueil : « Bonsoir Ragna · lundi 20 octobre » ---
  function salut() {
    const h = new Date().getHours();
    const mot = h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
    const jour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#salut').textContent = `${mot} Ragna · ${jour}`;
  }
  setInterval(salut, 60_000);

  // Avant une fermeture voulue (mise à jour d'Atelier) : enregistre les notes en attente.
  async function prepareQuit() {
    await Notes.enregistrer();
    return true;
  }

  async function start() {
    ({ config, path: configPath } = await window.atelier.readConfig());
    await applyTheme(config);
    applyWidgets(config);
    Outils.reglages(config);
    salut();
    await Notes.start();
    Projets.refresh();
    await PressePapiers.start();
    await Minuteurs.start();
    await Calendrier.start();
    await Calculatrice.start();
    await ClaudeWidget.start();
    // Les versions installées s'affichent tout de suite ; GitHub n'est contacté au démarrage que si
    // le réglage est coché (sinon seulement quand tu cliques ↻).
    try {
      const outils = await Outils.refresh({ github: config.checkToolUpdates, silencieux: true });
      const dispo = outils.filter((o) => o.miseAJour);
      if (dispo.length) notify(`Mise(s) à jour disponible(s) : ${dispo.map((o) => `${o.nom} ${o.derniere}`).join(', ')}`, 'info', 10000);
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }

  return { start, prepareQuit };
})();

App.start();
