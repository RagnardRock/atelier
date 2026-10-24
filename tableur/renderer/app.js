// L'interface de Reikna : le classeur ouvert (fichier, enregistrement), la barre d'outils, les menus,
// les onglets des feuilles, la barre d'état et les raccourcis clavier.
// La grille elle-même est dans grille.js, les données dans classeur.js, les fichiers dans fichiers.js.

const App = (() => {
  let config = null;
  let configPath = '';
  // Le document ouvert : chemin (null = jamais enregistré), format d'enregistrement, modifié ?
  let doc = { chemin: null, nom: 'Classeur1', format: 'xlsx', modifie: false };
  let numeroNouveau = 1;

  const sel = () => Grille.selection();
  const feuille = () => Grille.feuille();

  // ===============================================================================================
  // Thème et réglages
  // ===============================================================================================
  const ACCENTS = ['#34d399', '#2dd4bf', '#5ec8ff', '#b9a8ff', '#ff7aa8', '#e0a526', '#f5f5f5'];
  async function appliquerTheme(c) {
    document.documentElement.style.setProperty('--accent', c.accentColor);
    document.body.classList.toggle('glass', Boolean(c.glass));
    document.body.classList.toggle('grille-claire', Boolean(c.grilleClaire));
    Formules.setLangue(c.langueFormules);
    Grille.setOptions({ quadrillage: c.quadrillage !== false });
    Grille.lireCouleurs();
    majZoom();
    const { blur, needsRestart } = await window.reikna.setWindowTheme({ glass: c.glass, blur: c.windowBlur });
    document.body.classList.toggle('window-blur', blur);
    return needsRestart;
  }

  async function ouvrirReglages() {
    const blurOk = await window.reikna.blurSupported();
    const version = await window.reikna.version();
    const swatches = el('div', { className: 'accent-swatches' });
    const familles = ((await window.claude.autorisations?.().catch(() => [])) || []).filter((f) => f.gardable);
    const v = await Dialogs.form({
      title: 'Réglages de Reikna',
      okLabel: 'Enregistrer',
      width: 500,
      fields: [
        { key: 'accentColor', label: 'Couleur d\'accent', type: 'color', value: config.accentColor },
        { type: 'element', element: swatches },
        { key: 'glass', label: 'Verre dépoli (glassmorphism)', type: 'checkbox', value: config.glass },
        { key: 'windowBlur', label: blurOk ? 'Flou de Windows 11 derrière la fenêtre' : 'Flou de Windows 11 (non disponible ici)', type: 'checkbox', value: config.windowBlur },
        { key: 'grilleClaire', label: 'Grille claire (fond blanc, comme sur papier)', type: 'checkbox', value: Boolean(config.grilleClaire) },
        { key: 'quadrillage', label: 'Quadrillage des cellules', type: 'checkbox', value: config.quadrillage !== false },
        { key: 'langueFormules', label: 'Formules', type: 'select', value: config.langueFormules, choices: [['fr', 'En français : =SOMME(A1:A3; 2,5)'], ['en', 'En anglais : =SUM(A1:A3, 2.5)']] },
        { key: 'csvSeparateur', label: 'CSV : séparateur', type: 'select', value: config.csvSeparateur, choices: [[';', 'Point-virgule ; (Excel français)'], [',', 'Virgule , (international)'], ['\t', 'Tabulation']] },
        { key: 'csvDecimale', label: 'CSV : décimales', type: 'select', value: config.csvDecimale, choices: [[',', '12,5 (français)'], ['.', '12.5 (anglais)']] },
        { key: 'claudeModel', label: 'Modèle de Loki (propulsé par Claude)', type: 'select', value: config.claudeModel || '', choices: [['', 'Par défaut (celui de Claude Code)'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']] },
        { key: 'claudeCommand', label: 'Commande Claude Code', type: 'text', value: config.claudeCommand || 'claude' },
        { key: 'claudeCommandes', label: 'Loki peut lancer des commandes (PowerShell, Python…) : plus lent, rarement utile', type: 'checkbox', value: Boolean(config.claudeCommandes) },
        ...(familles.length ? [
          { type: 'info', text: 'Loki fait sans me demander la permission, pour de bon :' },
          ...familles.map((f) => ({ key: `sansDemander-${f.id}`, label: f.libelle, type: 'checkbox', value: f.toujours })),
          { type: 'info', text: 'Lire et regarder ne demande jamais. Ce qui est permis seulement pour la conversation en cours se voit et se retire avec le bouclier, en haut du panneau Loki.' },
        ] : []),
        { type: 'info', text: `Le CSV lu est reconnu tout seul (séparateur et encodage) ; ces deux réglages servent à « Enregistrer en CSV ».\n\nReikna ${version}. Réglages enregistrés dans ${configPath}.` },
      ],
      onInput(values, f) {
        if (!swatches.childElementCount) {
          for (const c of ACCENTS) swatches.append(el('button', { type: 'button', className: 'mini-swatch', style: `background:${c}`, onclick: () => f.setValue('accentColor', c) }));
        }
        document.documentElement.style.setProperty('--accent', values.accentColor);
        document.body.classList.toggle('glass', values.glass);
        document.body.classList.toggle('grille-claire', values.grilleClaire);
        Grille.lireCouleurs();
      },
    });
    if (!v) return appliquerTheme(config);
    if (familles.length) {
      v.claudeSansDemander = {};
      for (const f of familles) { if (v[`sansDemander-${f.id}`]) v.claudeSansDemander[f.id] = true; delete v[`sansDemander-${f.id}`]; }
    }
    config = await window.reikna.writeConfig(v);
    if (await appliquerTheme(config)) notify('Le flou de Windows 11 sera actif au prochain démarrage de Reikna.', 'info', 6000);
    rafraichirTout();
  }

  // ===============================================================================================
  // Fichiers
  // ===============================================================================================
  function majTitre() {
    $('#doc-nom').textContent = doc.nom;
    $('#doc-nom').title = doc.chemin || 'Pas encore enregistré';
    $('#doc-modifie').hidden = !doc.modifie;
    window.reikna.titre(`${doc.nom}${doc.modifie ? ' •' : ''} — Reikna`);
    window.reikna.nonEnregistre(doc.modifie);
  }
  function marquer(modifie) {
    if (doc.modifie === modifie) return;
    doc.modifie = modifie;
    majTitre();
  }

  function demarrerClasseur(donnees) {
    Classeur.charger(donnees);
    Grille.afficherFeuille(Classeur.feuilles()[0].id);
    rendreOnglets();
    rafraichirTout();
  }

  async function nouveau() {
    if (!(await avantDeFermer())) return;
    numeroNouveau += 1;
    doc = { chemin: null, nom: `Classeur${numeroNouveau}`, format: 'xlsx', modifie: false };
    demarrerClasseur(null);
    majTitre();
  }

  async function ouvrir(chemin = null) {
    if (!(await avantDeFermer())) return;
    const c = chemin || await window.reikna.choisirFichier();
    if (!c) return;
    let fichier;
    try {
      fichier = await window.reikna.lireFichier(c);
    } catch (err) {
      notify(cleanError(err), 'error');
      return;
    }
    $('#status-info').textContent = `Ouverture de ${fichier.nom}…`;
    try {
      const donnees = await Fichiers.lire(fichier.nom, fichier.bytes);
      const ext = Fichiers.extension(fichier.nom);
      demarrerClasseur(donnees);
      // On réenregistre dans le même format (xlsm → xlsx : les macros ne sont pas gardées).
      doc = { chemin: ext === 'xlsm' ? null : fichier.chemin, nom: fichier.nom, format: ext === 'txt' ? 'csv' : ext === 'xlsm' ? 'xlsx' : ext, modifie: false };
      majTitre();
      const nbFeuilles = Classeur.feuilles().length;
      $('#status-info').textContent = donnees.info || `${nbFeuilles} feuille${nbFeuilles > 1 ? 's' : ''}`;
      if (donnees.avertissement) notify(donnees.avertissement, 'warning', 8000);
      if (ext === 'xls') notify('Ancien format Excel (.xls) : pour garder les formules et la mise en forme, enregistre-le en .xlsx (Fichier › Enregistrer sous).', 'info', 9000);
      if (ext === 'xlsm') notify('Les macros de ce fichier ne sont pas gardées : Reikna l\'enregistrera en .xlsx.', 'warning', 9000);
    } catch (err) {
      $('#status-info').textContent = '';
      notify(`Impossible de lire ${fichier.nom} : ${cleanError(err)}`, 'error');
    }
  }

  async function enregistrer({ sous = false, format = null } = {}) {
    if (Grille.enEdition()) Grille.valider();
    const fmt = format || doc.format || 'xlsx';
    let chemin = !sous && !format && doc.chemin ? doc.chemin : null;
    // Un format qui perd des choses : on prévient avant d'écraser (une seule fois par document).
    if (!chemin) {
      const base = doc.nom.replace(/\.[^.]+$/, '');
      chemin = await window.reikna.enregistrerSous(`${base}.${fmt}`, fmt);
      if (!chemin) return false;
    }
    if ((fmt === 'csv' || fmt === 'tsv') && Classeur.feuilles().length > 1 && !doc.avertiCsv) {
      const ok = await Dialogs.ask('Enregistrer en CSV', `Un fichier ${fmt.toUpperCase()} ne contient qu'une feuille : seule « ${Classeur.nomFeuille(feuille())} » sera enregistrée, sans formules ni mise en forme.`, [
        { label: 'Annuler', value: false },
        { label: 'Enregistrer cette feuille', value: true, primary: true },
      ]);
      if (!ok) return false;
      doc.avertiCsv = true;
    }
    try {
      const bytes = await Fichiers.ecrire(fmt, { feuilleActive: feuille(), csvSeparateur: config.csvSeparateur, csvDecimale: config.csvDecimale });
      const res = await window.reikna.ecrireFichier(chemin, bytes);
      doc = { ...doc, chemin: res.chemin, nom: res.nom, format: fmt, modifie: false };
      majTitre();
      const garde = Fichiers.FORMATS[fmt]?.garde;
      notify(`Enregistré : ${res.nom}${garde && garde !== 'tout' ? ` (${garde})` : ''}`, 'success', 3500);
      return true;
    } catch (err) {
      notify(`Enregistrement impossible : ${cleanError(err)}`, 'error');
      return false;
    }
  }

  // Avant de fermer le classeur (nouveau, ouvrir, quitter, mise à jour) : Enregistrer ?
  async function avantDeFermer() {
    if (Grille.enEdition()) Grille.valider();
    if (!doc.modifie) return true;
    const choix = await Dialogs.ask('Enregistrer les modifications ?', `« ${doc.nom} » a des modifications non enregistrées.`, [
      { label: 'Annuler', value: 'annuler' },
      { label: 'Ne pas enregistrer', value: 'non' },
      { label: 'Enregistrer', value: 'oui', primary: true },
    ]);
    if (choix === 'oui') return enregistrer();
    return choix === 'non';
  }

  function menuEnregistrerSous(ancre) {
    Fenetres.menu(ancre, Object.entries(Fichiers.FORMATS).map(([fmt, f]) => [f.nom, () => enregistrer({ format: fmt }), null, { icone: fmt === 'xlsx' ? 'file' : 'file-text' }]));
  }

  async function menuFichier() {
    const recents = (await window.reikna.fichiersRecents()).filter((c) => c !== doc.chemin).slice(0, 10);
    const nom = (c) => c.split(/[\\/]/).pop();
    Fenetres.menu($('#menu-fichier'), [
      ['Nouveau classeur', nouveau, 'Ctrl+N', { icone: 'new-file' }],
      ['Ouvrir…', () => ouvrir(), 'Ctrl+O', { icone: 'folder-opened' }],
      null,
      ['Enregistrer', () => enregistrer(), 'Ctrl+S', { icone: 'save' }],
      ['Enregistrer sous…', () => menuEnregistrerSous($('#menu-fichier')), 'Ctrl+Maj+S', { icone: 'save-as' }],
      ['Montrer dans l\'Explorateur', () => window.reikna.montrer(doc.chemin), null, { icone: 'folder', desactive: !doc.chemin }],
      ...(recents.length ? [null, ...recents.map((c) => [nom(c), () => ouvrir(c), null, { icone: 'history' }])] : []),
    ]);
  }

  // ===============================================================================================
  // Actions sur la sélection
  // ===============================================================================================
  // Essayer une action ; une erreur devient une notification (au lieu d'une fenêtre d'erreur).
  function essayer(fn) {
    try { return fn(); } catch (err) { notify(cleanError(err), 'error'); return null; }
  }
  const styleActif = () => Classeur.style(feuille(), sel().actif.r, sel().actif.c) || {};
  const styler = (patch, nom) => essayer(() => Classeur.styler(feuille(), sel().plage, patch, nom));
  const basculer = (cle, nom) => styler({ [cle]: !styleActif()[cle] }, nom);

  // --- Presse-papiers ---
  let dernierTexteCopie = null;
  async function copier(couper = false) {
    const { plage } = sel();
    const p = colonnesEntieresBornees(plage);
    if (taillePlage(p) > 2e6) { notify('Sélection trop grande pour la copier.', 'warning'); return; }
    Classeur.copier(feuille(), p, couper);
    // Pour Excel, Word, un mail… : du texte en colonnes séparées par des tabulations, et un tableau HTML.
    const lignes = [], html = ['<table>'];
    for (let r = p.r1; r <= p.r2; r++) {
      const l = [];
      html.push('<tr>');
      for (let c = p.c1; c <= p.c2; c++) {
        const t = Classeur.texte(feuille(), r, c);
        l.push(/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
        const s = Classeur.style(feuille(), r, c) || {};
        const css = [s.gras && 'font-weight:bold', s.italique && 'font-style:italic', s.couleur && `color:${s.couleur}`, s.fond && `background:${s.fond}`].filter(Boolean).join(';');
        html.push(`<td${css ? ` style="${css}"` : ''}>${escapeHtml(t)}</td>`);
      }
      html.push('</tr>');
      lignes.push(l.join('\t'));
    }
    html.push('</table>');
    dernierTexteCopie = `${lignes.join('\r\n')}\r\n`;
    await window.reikna.ecrirePressePapiers({ text: dernierTexteCopie, html: html.join('') });
    Grille.redessiner();
  }
  // Des colonnes ou lignes entières → seulement la partie remplie.
  function colonnesEntieresBornees(p) {
    const { width, height } = Classeur.dimensions(feuille());
    return { r1: p.r1, c1: p.c1, r2: p.r2 === MAX_LIGNES - 1 ? Math.max(p.r1, height - 1) : p.r2, c2: p.c2 === MAX_COLONNES - 1 ? Math.max(p.c1, width - 1) : p.c2 };
  }

  async function coller({ valeursSeules = false, formatsSeuls = false } = {}) {
    const { actif } = sel();
    const { text } = await window.reikna.lirePressePapiers();
    const interne = Classeur.copieEnCours();
    // Ce qu'on vient de copier dans Reikna : on garde les formules et la mise en forme.
    if (interne && (text === dernierTexteCopie || text.replace(/\r/g, '') === (dernierTexteCopie || '').replace(/\r/g, ''))) {
      const cible = essayer(() => Classeur.coller(feuille(), actif.r, actif.c, { valeursSeules, formatsSeuls }));
      if (cible) Grille.selectionner(cible, actif);
      return;
    }
    if (!text) return;
    // Sinon (Excel, une page web…) : du texte en colonnes (tabulations), lu comme si tu le tapais.
    const lignes = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => decouperTsv(l));
    if (lignes.length * Math.max(...lignes.map((l) => l.length)) > 1e6) { notify('Trop de cellules à coller d\'un coup.', 'warning'); return; }
    const largeur = Math.max(...lignes.map((l) => l.length));
    const matrice = lignes.map((l) => Array.from({ length: largeur }, (_v, i) => l[i] ?? ''));
    essayer(() => Classeur.saisir(feuille(), actif.r, actif.c, matrice, 'coller'));
    Grille.selectionner({ r1: actif.r, c1: actif.c, r2: actif.r + matrice.length - 1, c2: actif.c + largeur - 1 }, actif);
  }
  const decouperTsv = (l) => {
    const out = [];
    let champ = '', guillemets = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (guillemets) { if (ch === '"' && l[i + 1] === '"') { champ += '"'; i++; } else if (ch === '"') guillemets = false; else champ += ch; } else if (ch === '"' && champ === '') guillemets = true;
      else if (ch === '\t') { out.push(champ); champ = ''; } else champ += ch;
    }
    out.push(champ);
    return out;
  };

  // --- Reproduire la mise en forme (pinceau) ---
  let pinceau = null;
  function prendrePinceau() {
    const { r, c } = sel().actif;
    pinceau = { ...(Classeur.style(feuille(), r, c) || {}) };
    $('[data-action=pinceau]').classList.add('actif');
    notify('Sélectionne maintenant les cellules à mettre en forme pareil.', 'info', 3000);
  }
  function poserPinceau() {
    if (!pinceau) return;
    const s = pinceau;
    pinceau = null;
    $('[data-action=pinceau]').classList.remove('actif');
    const vide = { gras: null, italique: null, souligne: null, barre: null, taille: null, police: null, couleur: null, fond: null, alignH: null, alignV: null, retour: null, format: null, bordures: null };
    styler({ ...vide, ...s }, 'reproduire la mise en forme');
  }

  // --- Nombres ---
  function changerDecimales(delta) {
    const s = styleActif();
    const v = Classeur.valeur(feuille(), sel().actif.r, sel().actif.c);
    let fmt = s.format || '';
    if (!fmt || fmt === 'General') {
      // Sans format : on part du nombre de décimales affichées.
      const dec = typeof v === 'number' ? (String(Number(v.toPrecision(10))).split('.')[1] || '').length : 0;
      fmt = dec ? `0.${'0'.repeat(dec)}` : '0';
    }
    const changer = (partie) => {
      const m = partie.match(/(0|#)(\.0*)?/);
      if (!m) return partie;
      const dec = Math.max(0, ((m[2] || '.').length - 1) + delta);
      return partie.replace(/(0|#)(\.0*)?(?!.*0)/, `$1${dec ? `.${'0'.repeat(dec)}` : ''}`);
    };
    styler({ format: fmt.split(';').map(changer).join(';') }, 'décimales');
  }

  // --- Somme automatique (Σ) ---
  function sommeAuto(fonction = 'SUM') {
    const { actif, plage } = sel();
    const f = feuille();
    const nom = Fonctions.nom(Fonctions.parNom(fonction, 'en'), Formules.getLangue());
    const plein = (r, c) => typeof Classeur.valeur(f, r, c) === 'number';
    if (taillePlage(plage) > 1 && !(plage.r1 === 0 && plage.r2 === MAX_LIGNES - 1)) {
      // Une plage sélectionnée : le total de chaque colonne juste en dessous.
      const contenus = [];
      const ligne = [];
      for (let c = plage.c1; c <= plage.c2; c++) ligne.push(`=${nom}(${adressePlage({ r1: plage.r1, c1: c, r2: plage.r2, c2: c })})`);
      contenus.push(ligne);
      essayer(() => Classeur.saisir(f, plage.r2 + 1, plage.c1, contenus, 'somme automatique'));
      Grille.selectionner({ r1: plage.r2 + 1, c1: plage.c1, r2: plage.r2 + 1, c2: plage.c2 });
      return;
    }
    // Une cellule : on devine la plage au-dessus (ou à gauche), comme Excel, et on laisse modifier.
    let r = actif.r - 1;
    while (r >= 0 && !plein(r, actif.c) && actif.r - r < 2) r--;
    let p = null;
    if (r >= 0 && plein(r, actif.c)) {
      let r1 = r;
      while (r1 > 0 && plein(r1 - 1, actif.c)) r1--;
      p = { r1, c1: actif.c, r2: r, c2: actif.c };
    } else {
      let c = actif.c - 1;
      if (c >= 0 && plein(actif.r, c)) {
        let c1 = c;
        while (c1 > 0 && plein(actif.r, c1 - 1)) c1--;
        p = { r1: actif.r, c1, r2: actif.r, c2: c };
      }
    }
    Grille.commencer(`=${nom}(${p ? adressePlage(p) : ''})`, { mode: 'edition' });
  }

  // --- Lignes, colonnes, cellules ---
  function insererMenu(ancre) {
    const { plage } = sel();
    const nbL = plage.r2 - plage.r1 + 1, nbC = plage.c2 - plage.c1 + 1;
    Fenetres.menu(ancre, [
      [`Insérer ${nbL > 1 && nbL < MAX_LIGNES ? `${nbL} lignes` : 'une ligne'} au-dessus`, () => inserer('lignes'), 'Ctrl++', { icone: 'arrow-up' }],
      [`Insérer ${nbC > 1 && nbC < MAX_COLONNES ? `${nbC} colonnes` : 'une colonne'} à gauche`, () => inserer('colonnes'), null, { icone: 'arrow-left' }],
      ['Insérer des cellules (décaler vers le bas)', () => essayer(() => Classeur.decalerCellules(feuille(), plage, 'bas')), null, { icone: 'arrow-down' }],
      ['Insérer des cellules (décaler vers la droite)', () => essayer(() => Classeur.decalerCellules(feuille(), plage, 'droite')), null, { icone: 'arrow-right' }],
      null,
      ['Nouvelle feuille', () => ajouterFeuille(), 'Maj+F11', { icone: 'add' }],
    ]);
  }
  function supprimerMenu(ancre) {
    Fenetres.menu(ancre, [
      ['Supprimer les lignes', () => supprimer('lignes'), 'Ctrl+-', { icone: 'remove' }],
      ['Supprimer les colonnes', () => supprimer('colonnes'), null, { icone: 'remove' }],
      null,
      ['Supprimer la feuille', () => supprimerFeuille(feuille()), null, { icone: 'trash' }],
    ]);
  }
  function inserer(axe) {
    const { plage } = sel();
    const lignes = axe === 'lignes';
    const n = lignes ? Math.min(plage.r2 - plage.r1 + 1, 1000) : Math.min(plage.c2 - plage.c1 + 1, 200);
    const nombre = (lignes ? plage.r2 === MAX_LIGNES - 1 && plage.r1 === 0 : plage.c2 === MAX_COLONNES - 1 && plage.c1 === 0) ? 1 : n;
    essayer(() => Classeur.inserer(feuille(), axe, lignes ? plage.r1 : plage.c1, nombre));
  }
  function supprimer(axe) {
    const { plage } = sel();
    const lignes = axe === 'lignes';
    const debut = lignes ? plage.r1 : plage.c1;
    const n = lignes ? plage.r2 - plage.r1 + 1 : plage.c2 - plage.c1 + 1;
    const max = lignes ? Classeur.dimensions(feuille()).height : Classeur.dimensions(feuille()).width;
    essayer(() => Classeur.supprimer(feuille(), axe, debut, Math.max(1, Math.min(n, Math.max(1, max - debut)))));
  }
  function effacer(quoi = 'contenu') {
    essayer(() => Classeur.effacer(feuille(), sel().plage, quoi));
  }

  // --- Couleurs ---
  async function choisirCouleur(cle, bouton) {
    const c = await Fenetres.palette(bouton, { libelleAuto: cle === 'fond' ? 'Aucun remplissage' : 'Automatique' });
    if (!c) return;
    styler({ [cle]: c === 'auto' ? null : c }, cle === 'fond' ? 'couleur de fond' : 'couleur du texte');
    if (c !== 'auto') $(cle === 'fond' ? '#trait-fond' : '#trait-couleur').style.background = c;
  }

  // --- Bordures ---
  function bordures(ancre) {
    const b = (type) => () => essayer(() => Classeur.bordures(feuille(), sel().plage, type));
    Fenetres.menu(ancre, [
      ['Toutes les bordures', b('toutes'), null, { icone: 'symbol-numeric' }],
      ['Bordure extérieure', b('contour'), null, { icone: 'primitive-square' }],
      ['Bordure extérieure épaisse', b('contour_epais'), null, { icone: 'debug-stop' }],
      null,
      ['Bordure du bas', b('bas'), null, { icone: 'arrow-down' }],
      ['Double bordure en bas (total)', b('double_bas'), null, { icone: 'arrow-down' }],
      ['Bordure du haut', b('haut'), null, { icone: 'arrow-up' }],
      ['Bordure de gauche', b('gauche'), null, { icone: 'arrow-left' }],
      ['Bordure de droite', b('droite'), null, { icone: 'arrow-right' }],
      null,
      ['Aucune bordure', b('aucune'), null, { icone: 'close' }],
    ]);
  }

  // --- Figer les volets ---
  // Un graphique sur la sélection (ou sur le tableau autour de la cellule active).
  function insererGraphique() {
    if (Grille.enEdition()) Grille.valider();
    const plage = zoneDonnees();
    if (!plage) { notify('Choisis d\'abord les données du graphique (par exemple A1:C10).', 'error'); return; }
    Graphiques.inserer(plage).then(() => Grille.focus());
  }

  function figerMenu(ancre) {
    const { actif } = sel();
    const m = Classeur.meta(feuille());
    const fige = m.figer.lignes || m.figer.colonnes;
    Fenetres.menu(ancre, [
      [fige ? 'Libérer les volets' : `Figer au-dessus et à gauche de ${adresse(actif.r, actif.c)}`, () => essayer(() => Classeur.figer(feuille(), fige ? 0 : actif.r, fige ? 0 : actif.c)), null, { icone: fige ? 'pinned-dirty' : 'pinned' }],
      ['Figer la première ligne', () => essayer(() => Classeur.figer(feuille(), 1, 0)), null, { icone: 'arrow-up' }],
      ['Figer la première colonne', () => essayer(() => Classeur.figer(feuille(), 0, 1)), null, { icone: 'arrow-left' }],
    ]);
  }

  // --- Trier ---
  // La zone à trier : la sélection, ou (une seule cellule) le bloc de données autour d'elle.
  function zoneDonnees() {
    const { actif, plage } = sel();
    if (taillePlage(plage) > 1) return colonnesEntieresBornees(plage);
    const f = feuille();
    const plein = (r, c) => r >= 0 && c >= 0 && Classeur.valeur(f, r, c) !== null;
    let p = { r1: actif.r, c1: actif.c, r2: actif.r, c2: actif.c };
    let change = true;
    // On agrandit tant qu'une case voisine du bord est remplie (comme Excel avec Ctrl+A).
    while (change) {
      change = false;
      for (let c = p.c1; c <= p.c2 && !change; c++) { if (plein(p.r1 - 1, c)) { p.r1--; change = true; } else if (plein(p.r2 + 1, c)) { p.r2++; change = true; } }
      for (let r = p.r1; r <= p.r2 && !change; r++) { if (plein(r, p.c1 - 1)) { p.c1--; change = true; } else if (plein(r, p.c2 + 1)) { p.c2++; change = true; } }
      if (taillePlage(p) > 5e6) break;
    }
    return p;
  }
  // La 1re ligne ressemble-t-elle à des titres ? (du texte au-dessus de nombres)
  function enteteProbable(p) {
    const f = feuille();
    let textes = 0, nombresDessous = 0;
    for (let c = p.c1; c <= p.c2; c++) {
      if (typeof Classeur.valeur(f, p.r1, c) === 'string') textes++;
      if (typeof Classeur.valeur(f, p.r1 + 1, c) !== 'string') nombresDessous++;
    }
    return textes === p.c2 - p.c1 + 1 && (nombresDessous > 0 || p.r2 > p.r1 + 1);
  }
  function trierRapide(croissant) {
    const p = zoneDonnees();
    const m = Classeur.meta(feuille());
    const entete = m.filtre ? true : enteteProbable(p);
    essayer(() => Classeur.trier(feuille(), p, [{ colonne: sel().actif.c, croissant }], entete));
    if (m.filtre) Classeur.filtrerColonne(feuille(), -1, []);
  }
  async function trierAvance() {
    const p = zoneDonnees();
    const entete = enteteProbable(p);
    const colonnes = [];
    for (let c = p.c1; c <= p.c2; c++) {
      const titre = entete ? Classeur.texte(feuille(), p.r1, c) : '';
      colonnes.push({ index: c, nom: `Colonne ${lettreColonne(c)}${titre ? ` (${titre})` : ''}` });
    }
    Grille.selectionner(p, sel().actif, { defiler: false });
    const v = await Fenetres.trier(colonnes, entete);
    if (v?.cles.length) essayer(() => Classeur.trier(feuille(), p, v.cles, v.entete));
  }

  // --- Filtre ---
  function basculerFiltre() {
    const m = Classeur.meta(feuille());
    if (m.filtre) { Classeur.basculerFiltre(feuille()); notify('Filtre retiré : toutes les lignes sont visibles.', 'info', 2500); return; }
    const p = zoneDonnees();
    essayer(() => Classeur.basculerFiltre(feuille(), p));
    notify('Filtre posé : clique sur les flèches des titres pour choisir ce qui s\'affiche.', 'info', 4000);
  }
  async function ouvrirFiltre(c, rect) {
    const f = feuille();
    const m = Classeur.meta(f);
    const zr = $('#grille').getBoundingClientRect();
    const valeurs = Classeur.valeursColonne(f, c);
    const caches = await Fenetres.filtre({ x: zr.left + rect.x, y: zr.top + rect.y + rect.h }, {
      valeurs,
      cachees: m.filtre.criteres[c] || [],
      surTrier: (croissant) => {
        const fin = Math.max(m.filtre.plage.r2, Classeur.dimensions(f).height - 1);
        essayer(() => Classeur.trier(f, { ...m.filtre.plage, r2: fin }, [{ colonne: c, croissant }], true));
        Classeur.filtrerColonne(f, -1, []);
      },
    });
    if (caches) Classeur.filtrerColonne(f, c, caches);
  }

  // --- Rechercher / remplacer ---
  async function chercher(remplacer = false) {
    let resultats = [];
    let index = -1;
    const info = el('p', { className: 'modal-info' });
    const v = await Dialogs.form({
      title: remplacer ? 'Rechercher et remplacer' : 'Rechercher',
      okLabel: remplacer ? 'Tout remplacer' : 'Fermer',
      cancelLabel: remplacer ? 'Fermer' : '',
      width: 460,
      fields: [
        { key: 'texte', label: 'Rechercher', type: 'text', value: dernierRecherche },
        ...(remplacer ? [{ key: 'par', label: 'Remplacer par', type: 'text', value: '' }] : [{ key: 'remplacer', label: '', type: 'text', hidden: true }]),
        { key: 'casse', label: 'Respecter les majuscules', type: 'checkbox', value: false },
        { key: 'entier', label: 'Cellule entière seulement', type: 'checkbox', value: false },
        { key: 'partout', label: 'Dans tout le classeur (sinon : cette feuille)', type: 'checkbox', value: false },
        { type: 'element', element: info },
      ],
      buttons: [{
        label: 'Suivant',
        run: (api) => {
          const val = api.values();
          dernierRecherche = val.texte;
          if (!val.texte) return;
          resultats = Classeur.chercher(val.texte, { feuille: val.partout ? null : feuille(), casse: val.casse, entier: val.entier });
          if (!resultats.length) { info.textContent = 'Rien trouvé.'; return; }
          index = (index + 1) % resultats.length;
          const res = resultats[index];
          if (res.feuille !== feuille()) changerFeuille(res.feuille);
          Grille.allerA(res.r, res.c);
          info.textContent = `${index + 1} sur ${resultats.length} : ${Classeur.nomFeuille(res.feuille)}!${adresse(res.r, res.c)}`;
        },
      }],
    });
    if (!v || !remplacer || !v.texte) return;
    dernierRecherche = v.texte;
    const trouves = Classeur.chercher(v.texte, { feuille: v.partout ? null : feuille(), casse: v.casse, entier: v.entier });
    if (!trouves.length) { notify('Rien à remplacer.', 'info'); return; }
    const re = new RegExp(v.texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), v.casse ? 'g' : 'gi');
    const parFeuille = new Map();
    for (const t of trouves) {
      if (!parFeuille.has(t.feuille)) parFeuille.set(t.feuille, []);
      parFeuille.get(t.feuille).push(t);
    }
    Classeur.faire(`remplacer « ${v.texte} »`, {
      moteur: (h) => {
        for (const [f, liste] of parFeuille) {
          for (const { r, c } of liste) {
            const avant = Classeur.texteEdition(f, r, c);
            const apres = v.entier ? v.par : avant.replace(re, v.par);
            const { contenu } = Formules.lireSaisie(apres);
            h.setCellContents({ sheet: f, row: r, col: c }, [[contenu]]);
          }
        }
      },
    });
    notify(`${trouves.length} cellule${trouves.length > 1 ? 's' : ''} modifiée${trouves.length > 1 ? 's' : ''}.`, 'success');
  }
  let dernierRecherche = '';

  // --- Aller à (case du nom) ---
  $('#nom-case').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { Grille.focus(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    let t = e.target.value.trim();
    let f = feuille();
    const m = t.match(/^(?:'([^']+)'|([^!]+))!(.+)$/);
    if (m) {
      const id = Classeur.idFeuille(m[1] || m[2]);
      if (id === undefined) { notify(`Pas de feuille « ${m[1] || m[2]} ».`, 'warning'); return; }
      f = id;
      t = m[3];
    }
    const p = lirePlage(t);
    if (!p) { notify(`Adresse non reconnue : ${t} (exemples : B12, A1:C20, D:D)`, 'warning'); return; }
    if (f !== feuille()) changerFeuille(f);
    Grille.selectionner(p, { r: p.r1, c: p.c1 });
    Grille.focus();
  });
  $('#nom-case').addEventListener('focus', (e) => e.target.select());

  // --- Format de cellule ---
  async function formatCellule() {
    const { r, c } = sel().actif;
    const fmt = await Fenetres.formatCellule(styleActif().format || '', Classeur.valeur(feuille(), r, c));
    if (fmt !== null) styler({ format: fmt || null }, 'format des nombres');
  }

  // --- Lien hypertexte ---
  async function lien() {
    const s = styleActif();
    const v = await Dialogs.form({
      title: 'Lien hypertexte',
      okLabel: 'Appliquer',
      width: 460,
      fields: [{ key: 'url', label: 'Adresse', type: 'text', value: s.lien || 'https://', placeholder: 'https://…' }, { type: 'info', text: 'Ctrl+clic sur la cellule ouvre le lien dans ton navigateur. Laisse vide pour retirer le lien.' }],
    });
    if (!v) return;
    const url = v.url.trim();
    if (url && !/^https?:\/\/|^mailto:/i.test(url)) { notify('Le lien doit commencer par https://, http:// ou mailto:', 'warning'); return; }
    styler({ lien: url && url !== 'https://' ? url : null }, 'lien');
  }

  // --- Largeur / hauteur ---
  async function demanderTaille(axe) {
    const { plage } = sel();
    const col = axe === 'colonnes';
    const actuelle = col ? Classeur.largeur(feuille(), plage.c1) : Classeur.hauteur(feuille(), plage.r1);
    const v = await Dialogs.form({
      title: col ? 'Largeur des colonnes' : 'Hauteur des lignes',
      width: 380,
      fields: [{ key: 'px', label: col ? 'Largeur' : 'Hauteur', type: 'number', value: actuelle, min: 1, max: 2000, unit: 'px' }],
    });
    if (!v) return;
    if (col) essayer(() => Classeur.changerLargeurs(feuille(), plage.c1, plage.c2, v.px));
    else essayer(() => Classeur.changerHauteurs(feuille(), plage.r1, plage.r2, v.px));
  }
  function masquer(axe, afficher = false) {
    const { plage } = sel();
    if (axe === 'colonnes') {
      if (afficher) essayer(() => Classeur.afficherTout(feuille(), 'colonnes', plage.c1 - 1, plage.c2 + 1));
      else essayer(() => Classeur.changerLargeurs(feuille(), plage.c1, plage.c2, 0));
    } else if (afficher) essayer(() => Classeur.afficherTout(feuille(), 'lignes', plage.r1 - 1, plage.r2 + 1));
    else essayer(() => Classeur.changerHauteurs(feuille(), plage.r1, plage.r2, 0));
  }

  // ===============================================================================================
  // Menus du haut et menu du clic droit
  // ===============================================================================================
  function menuEdition() {
    Fenetres.menu($('#menu-edition'), [
      [Classeur.peutAnnuler() ? `Annuler : ${Classeur.peutAnnuler()}` : 'Annuler', annuler, 'Ctrl+Z', { icone: 'discard', desactive: !Classeur.peutAnnuler() }],
      [Classeur.peutRefaire() ? `Rétablir : ${Classeur.peutRefaire()}` : 'Rétablir', refaire, 'Ctrl+Y', { icone: 'redo', desactive: !Classeur.peutRefaire() }],
      null,
      ['Couper', () => copier(true), 'Ctrl+X'],
      ['Copier', () => copier(), 'Ctrl+C', { icone: 'copy' }],
      ['Coller', () => coller(), 'Ctrl+V', { icone: 'clippy' }],
      ['Coller les valeurs seulement', () => coller({ valeursSeules: true }), 'Ctrl+Maj+V', { icone: 'symbol-number' }],
      ['Coller la mise en forme seulement', () => coller({ formatsSeuls: true }), null, { icone: 'paintcan' }],
      null,
      ['Recopier vers le bas', () => recopierVers('bas'), 'Ctrl+D', { icone: 'arrow-down' }],
      ['Recopier vers la droite', () => recopierVers('droite'), 'Ctrl+R', { icone: 'arrow-right' }],
      null,
      ['Effacer le contenu', () => effacer('contenu'), 'Suppr', { icone: 'clear-all' }],
      ['Effacer la mise en forme', () => effacer('formats'), null, { icone: 'symbol-color' }],
      ['Tout effacer', () => effacer('tout'), null, { icone: 'trash' }],
      null,
      ['Rechercher…', () => chercher(), 'Ctrl+F', { icone: 'search' }],
      ['Remplacer…', () => chercher(true), 'Ctrl+H', { icone: 'replace' }],
      ['Aller à une cellule…', () => $('#nom-case').focus(), 'Ctrl+G', { icone: 'go-to-file' }],
    ]);
  }
  function menuInsertion() {
    Fenetres.menu($('#menu-insertion'), [
      ['Fonction…', toutesLesFonctions, 'Maj+F3', { icone: 'symbol-method' }],
      ['Somme automatique', () => sommeAuto('SUM'), 'Alt+=', { icone: 'symbol-operator' }],
      ['Date du jour', () => saisirDansActive(Formules.texteValeur(Formules.dateVersSerie(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()), 'dd/mm/yyyy')), 'Ctrl+;', { icone: 'calendar' }],
      ['Heure actuelle', () => saisirDansActive(new Date().toTimeString().slice(0, 5)), 'Ctrl+Maj+:', { icone: 'clock' }],
      ['Lien hypertexte…', lien, 'Ctrl+K', { icone: 'link' }],
      ['Graphique…', insererGraphique, 'Alt+F1', { icone: 'graph' }],
      null,
      ['Lignes au-dessus', () => inserer('lignes'), 'Ctrl++', { icone: 'arrow-up' }],
      ['Colonnes à gauche', () => inserer('colonnes'), null, { icone: 'arrow-left' }],
      ['Nouvelle feuille', () => ajouterFeuille(), 'Maj+F11', { icone: 'add' }],
    ]);
  }
  function menuDonnees() {
    const m = Classeur.meta(feuille());
    Fenetres.menu($('#menu-donnees'), [
      ['Trier de A à Z', () => trierRapide(true), null, { icone: 'arrow-down' }],
      ['Trier de Z à A', () => trierRapide(false), null, { icone: 'arrow-up' }],
      ['Trier sur plusieurs colonnes…', trierAvance, null, { icone: 'list-ordered' }],
      null,
      [m.filtre ? 'Retirer le filtre' : 'Filtrer', basculerFiltre, 'Ctrl+Maj+L', { icone: 'filter', coche: Boolean(m.filtre) }],
      null,
      ['Mise en forme conditionnelle', null, null, { icone: 'color-mode', sous: [
        ['Règles toutes prêtes…', () => Regles.menu($('#menu-donnees')), null, { icone: 'symbol-color' }],
        ['Nouvelle règle…', () => Regles.nouvelle({}), null, { icone: 'add' }],
        ['Gérer les règles…', () => Regles.gerer(), null, { icone: 'list-unordered' }],
      ] }],
      ['Format des nombres…', formatCellule, 'Ctrl+1', { icone: 'symbol-numeric' }],
      ['Fusionner et centrer', () => fusionner(), null, { icone: 'merge' }],
      ['Annuler la fusion', () => essayer(() => Classeur.defusionner(feuille(), sel().plage)), null, { icone: 'split-horizontal' }],
    ]);
  }
  function menuAffichage() {
    const m = Classeur.meta(feuille());
    Fenetres.menu($('#menu-affichage'), [
      ['Grille claire (fond blanc)', () => changerReglage({ grilleClaire: !config.grilleClaire }), null, { coche: Boolean(config.grilleClaire) }],
      ['Quadrillage', () => changerReglage({ quadrillage: config.quadrillage === false }), null, { coche: config.quadrillage !== false }],
      ['Formules en français', () => changerReglage({ langueFormules: config.langueFormules === 'fr' ? 'en' : 'fr' }), null, { coche: config.langueFormules === 'fr' }],
      null,
      [m.figer.lignes || m.figer.colonnes ? 'Libérer les volets' : 'Figer les volets ici', () => essayer(() => Classeur.figer(feuille(), m.figer.lignes || m.figer.colonnes ? 0 : sel().actif.r, m.figer.lignes || m.figer.colonnes ? 0 : sel().actif.c)), null, { icone: 'pinned' }],
      ['Figer la première ligne', () => essayer(() => Classeur.figer(feuille(), 1, 0)), null, { icone: 'arrow-up' }],
      null,
      ['Zoom avant', () => zoomer(10), 'Ctrl+molette', { icone: 'zoom-in' }],
      ['Zoom arrière', () => zoomer(-10), null, { icone: 'zoom-out' }],
      ['Zoom 100 %', () => zoomer(0, 100), null, { icone: 'screen-normal' }],
      null,
      ['Panneau Loki', () => ClaudePanneau.toggle(), 'Ctrl+Maj+K', { icone: 'sparkle' }],
    ]);
  }
  async function changerReglage(changes) {
    config = await window.reikna.writeConfig(changes);
    await appliquerTheme(config);
    rafraichirTout();
  }

  function menuContextuel(e) {
    e.preventDefault();
    if (Grille.enEdition()) return;
    const { plage } = sel();
    const colonnes = plage.r1 === 0 && plage.r2 === MAX_LIGNES - 1;
    const lignes = plage.c1 === 0 && plage.c2 === MAX_COLONNES - 1;
    const point = { x: e.clientX, y: e.clientY };
    const f = Classeur.fusionDe(feuille(), sel().actif.r, sel().actif.c);
    Fenetres.menu(point, [
      ['Couper', () => copier(true), 'Ctrl+X'],
      ['Copier', () => copier(), 'Ctrl+C', { icone: 'copy' }],
      ['Coller', () => coller(), 'Ctrl+V', { icone: 'clippy' }],
      ['Coller les valeurs', () => coller({ valeursSeules: true }), 'Ctrl+Maj+V', { icone: 'symbol-number' }],
      null,
      ...(colonnes ? [
        ['Insérer des colonnes', () => inserer('colonnes'), null, { icone: 'diff-added' }],
        ['Supprimer les colonnes', () => supprimer('colonnes'), null, { icone: 'diff-removed' }],
        ['Largeur des colonnes…', () => demanderTaille('colonnes'), null, { icone: 'arrow-both' }],
        ['Ajuster la largeur au contenu', () => Grille.ajusterColonnes(Array.from({ length: plage.c2 - plage.c1 + 1 }, (_v, i) => plage.c1 + i)), null, { icone: 'whole-word' }],
        ['Masquer', () => masquer('colonnes'), null, { icone: 'eye-closed' }],
        ['Afficher', () => masquer('colonnes', true), null, { icone: 'eye' }],
      ] : lignes ? [
        ['Insérer des lignes', () => inserer('lignes'), null, { icone: 'diff-added' }],
        ['Supprimer les lignes', () => supprimer('lignes'), null, { icone: 'diff-removed' }],
        ['Hauteur des lignes…', () => demanderTaille('lignes'), null, { icone: 'arrow-both' }],
        ['Masquer', () => masquer('lignes'), null, { icone: 'eye-closed' }],
        ['Afficher', () => masquer('lignes', true), null, { icone: 'eye' }],
      ] : [
        ['Insérer…', () => insererMenu(point), null, { icone: 'diff-added' }],
        ['Supprimer…', () => supprimerMenu(point), null, { icone: 'diff-removed' }],
      ]),
      ['Effacer le contenu', () => effacer('contenu'), 'Suppr', { icone: 'clear-all' }],
      null,
      ['Trier de A à Z', () => trierRapide(true), null, { icone: 'arrow-down' }],
      ['Trier de Z à A', () => trierRapide(false), null, { icone: 'arrow-up' }],
      null,
      ['Mise en forme conditionnelle', null, null, { icone: 'color-mode', sous: [
        ['Règles toutes prêtes…', () => Regles.menu($('#menu-donnees')), null, { icone: 'symbol-color' }],
        ['Nouvelle règle…', () => Regles.nouvelle({}), null, { icone: 'add' }],
        ['Gérer les règles…', () => Regles.gerer(), null, { icone: 'list-unordered' }],
      ] }],
      ['Format des nombres…', formatCellule, 'Ctrl+1', { icone: 'symbol-numeric' }],
      f ? ['Annuler la fusion', () => essayer(() => Classeur.defusionner(feuille(), f)), null, { icone: 'split-horizontal' }] : ['Fusionner et centrer', () => fusionner(), null, { icone: 'merge', desactive: taillePlage(plage) < 2 || colonnes || lignes }],
      ['Lien hypertexte…', lien, 'Ctrl+K', { icone: 'link' }],
    ]);
  }

  function fusionner() {
    const { plage } = sel();
    const f = Classeur.fusionDe(feuille(), plage.r1, plage.c1);
    if (f && memePlage(f, plage)) { essayer(() => Classeur.defusionner(feuille(), plage)); return; }
    // Comme Excel : seule la valeur en haut à gauche reste ; on prévient si d'autres seraient perdues.
    let autres = 0;
    for (let r = plage.r1; r <= plage.r2 && r < plage.r1 + 500; r++) for (let c = plage.c1; c <= plage.c2 && c < plage.c1 + 100; c++) if ((r !== plage.r1 || c !== plage.c1) && Classeur.valeur(feuille(), r, c) !== null) autres++;
    if (autres) notify(`Fusion : seule la valeur en haut à gauche est gardée (${autres} autre${autres > 1 ? 's' : ''} effacée${autres > 1 ? 's' : ''}). Ctrl+Z pour revenir.`, 'warning', 6000);
    essayer(() => Classeur.fusionner(feuille(), plage));
  }

  function recopierVers(sens) {
    const { plage } = sel();
    if (sens === 'bas') {
      const source = plage.r1 === plage.r2 ? { ...plage, r1: plage.r1 - 1, r2: plage.r1 - 1 } : { ...plage, r2: plage.r1 };
      if (source.r1 < 0) return;
      essayer(() => Classeur.recopier(feuille(), source, { ...plage, r1: source.r2 + 1 }, { serie: false }));
    } else {
      const source = plage.c1 === plage.c2 ? { ...plage, c1: plage.c1 - 1, c2: plage.c1 - 1 } : { ...plage, c2: plage.c1 };
      if (source.c1 < 0) return;
      essayer(() => Classeur.recopier(feuille(), source, { ...plage, c1: source.c2 + 1 }, { serie: false }));
    }
  }
  function saisirDansActive(texte) {
    const { r, c } = sel().actif;
    essayer(() => Classeur.saisir(feuille(), r, c, [[texte]]));
  }

  function annuler() {
    if (Grille.enEdition()) { Grille.annulerEdition(); return; }
    const e = Classeur.defaire();
    if (!e) notify('Rien à annuler.', 'info', 1500);
  }
  function refaire() {
    const e = Classeur.refaire();
    if (!e) notify('Rien à rétablir.', 'info', 1500);
  }

  function toutesLesFonctions() {
    Fenetres.fonctions({ langue: Formules.getLangue(), surInserer: (f) => Grille.insererFonction(f) });
  }

  // ===============================================================================================
  // Onglets des feuilles
  // ===============================================================================================
  function changerFeuille(id) {
    // Pendant une formule, on peut aller pointer une cellule d'une autre feuille.
    if (Grille.enEdition() && !Grille.editionFormule()) Grille.valider();
    Grille.afficherFeuille(id);
    rendreOnglets();
    rafraichirTout();
    if (!Grille.enEdition()) Grille.focus();
  }

  function rendreOnglets() {
    const zone = $('#onglets');
    zone.innerHTML = '';
    for (const f of Classeur.feuilles()) {
      const b = el('button', { className: `onglet${f.id === feuille() ? ' actif' : ''}`, draggable: true, title: `${f.nom}\nDouble-clic pour renommer, clic droit pour plus` },
        f.couleur ? el('span', { className: 'pastille', style: `background:${f.couleur}` }) : null,
        el('span', { textContent: f.nom }));
      b.onmousedown = (e) => { if (Grille.enEdition()) e.preventDefault(); };
      b.onclick = () => changerFeuille(f.id);
      b.ondblclick = () => renommerFeuille(f.id, b);
      b.oncontextmenu = (e) => { e.preventDefault(); menuOnglet(f.id, { x: e.clientX, y: e.clientY - 4 }); };
      b.ondragstart = (e) => { e.dataTransfer.setData('reikna/feuille', String(f.id)); };
      b.ondragover = (e) => { if (e.dataTransfer.types.includes('reikna/feuille')) { e.preventDefault(); b.classList.add('glisse-avant'); } };
      b.ondragleave = () => b.classList.remove('glisse-avant');
      b.ondrop = (e) => {
        b.classList.remove('glisse-avant');
        const id = Number(e.dataTransfer.getData('reikna/feuille'));
        if (Number.isNaN(id) || id === f.id) return;
        e.preventDefault();
        const position = Classeur.feuilles().filter((x) => x.id !== id).findIndex((x) => x.id === f.id);
        Classeur.deplacerFeuille(id, position);
      };
      zone.append(b);
    }
    zone.querySelector('.actif')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renommerFeuille(id, bouton = null) {
    const b = bouton || $$('.onglet').find((x) => x.textContent === Classeur.nomFeuille(id));
    if (!b) return;
    const input = el('input', { type: 'text', value: Classeur.nomFeuille(id) });
    b.replaceChildren(input);
    input.focus();
    input.select();
    let fini = false;
    const finir = (garder) => {
      if (fini) return;
      fini = true;
      if (garder && input.value.trim() && input.value.trim() !== Classeur.nomFeuille(id)) essayer(() => Classeur.renommerFeuille(id, input.value.trim()));
      rendreOnglets();
      Grille.focus();
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finir(true); if (e.key === 'Escape') finir(false); });
    input.addEventListener('blur', () => finir(true));
  }

  function menuOnglet(id, point) {
    const liste = Classeur.feuilles();
    const i = liste.findIndex((f) => f.id === id);
    Fenetres.menu(point, [
      ['Renommer', () => renommerFeuille(id), null, { icone: 'edit' }],
      ['Dupliquer', () => { const n = essayer(() => Classeur.dupliquerFeuille(id)); if (n !== null && n !== undefined) changerFeuille(n); }, null, { icone: 'copy' }],
      ['Nouvelle feuille', () => ajouterFeuille(i + 1), null, { icone: 'add' }],
      ['Couleur de l\'onglet…', async () => { const c = await Fenetres.palette(point, { libelleAuto: 'Aucune' }); if (c) Classeur.couleurOnglet(id, c === 'auto' ? null : c); }, null, { icone: 'symbol-color' }],
      null,
      ['Déplacer à gauche', () => Classeur.deplacerFeuille(id, i - 1), null, { icone: 'arrow-left', desactive: i === 0 }],
      ['Déplacer à droite', () => Classeur.deplacerFeuille(id, i + 1), null, { icone: 'arrow-right', desactive: i === liste.length - 1 }],
      null,
      ['Supprimer', () => supprimerFeuille(id), null, { icone: 'trash', desactive: liste.length < 2 }],
    ]);
  }
  function ajouterFeuille(position) {
    const id = essayer(() => Classeur.ajouterFeuille(null, position ?? Classeur.feuilles().findIndex((f) => f.id === feuille()) + 1));
    if (id !== null && id !== undefined) changerFeuille(id);
  }
  async function supprimerFeuille(id) {
    const d = Classeur.dimensions(id);
    if (d.width || d.height) {
      const ok = await Dialogs.ask('Supprimer la feuille', `Supprimer « ${Classeur.nomFeuille(id)} » et tout ce qu'elle contient ? (Ctrl+Z pour revenir en arrière)`, [
        { label: 'Annuler', value: false }, { label: 'Supprimer', value: true, primary: true },
      ]);
      if (!ok) return;
    }
    const liste = Classeur.feuilles();
    const i = liste.findIndex((f) => f.id === id);
    if (essayer(() => { Classeur.supprimerFeuille(id); return true; })) changerFeuille(Classeur.feuilles()[Math.max(0, i - 1)].id);
  }

  // ===============================================================================================
  // Barre d'outils : état et clics
  // ===============================================================================================
  const POLICES = ['Calibri', 'Aptos', 'Arial', 'Segoe UI', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Cambria', 'Consolas', 'Cascadia Code', 'Courier New', 'Comic Sans MS'];
  const TAILLES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72];
  for (const p of POLICES) $('#outil-police').add(new Option(p, p));
  for (const t of TAILLES) $('#outil-taille').add(new Option(String(t), String(t)));

  function majOutils() {
    if (feuille() === null) return;
    const s = styleActif();
    const actif = (action, oui) => $(`[data-action=${action}]`)?.classList.toggle('actif', Boolean(oui));
    actif('gras', s.gras);
    actif('italique', s.italique);
    actif('souligne', s.souligne);
    actif('barre', s.barre);
    actif('gauche', s.alignH === 'left');
    actif('centre', s.alignH === 'center');
    actif('droite', s.alignH === 'right');
    actif('retour', s.retour);
    actif('filtre', Classeur.meta(feuille()).filtre);
    actif('fusionner', Classeur.fusionDe(feuille(), sel().actif.r, sel().actif.c));
    const m = Classeur.meta(feuille());
    actif('figer', m.figer.lignes || m.figer.colonnes);
    const police = s.police || 'Calibri';
    if (![...$('#outil-police').options].some((o) => o.value === police)) $('#outil-police').add(new Option(police, police));
    $('#outil-police').value = police;
    const taille = String(s.taille || 11);
    if (![...$('#outil-taille').options].some((o) => o.value === taille)) $('#outil-taille').add(new Option(taille, taille));
    $('#outil-taille').value = taille;
    const fmt = s.format || '';
    const select = $('#outil-format');
    select.value = [...select.options].some((o) => o.value === fmt) ? fmt : fmt ? 'autre' : '';
    $('#btn-annuler').disabled = !Classeur.peutAnnuler();
    $('#btn-refaire').disabled = !Classeur.peutRefaire();
    $('#btn-annuler').title = Classeur.peutAnnuler() ? `Annuler : ${Classeur.peutAnnuler()} (Ctrl+Z)` : 'Annuler (Ctrl+Z)';
    $('#btn-refaire').title = Classeur.peutRefaire() ? `Rétablir : ${Classeur.peutRefaire()} (Ctrl+Y)` : 'Rétablir (Ctrl+Y)';
  }

  // Somme, moyenne et nombre des cellules sélectionnées (comme en bas d'Excel).
  function majCalcul() {
    if (feuille() === null) return;
    const p = colonnesEntieresBornees(sel().plage);
    const zone = $('#status-calcul');
    if (taillePlage(p) < 2 || taillePlage(p) > 300000) { zone.textContent = ''; return; }
    let somme = 0, nombres = 0, remplies = 0;
    for (let r = p.r1; r <= p.r2; r++) {
      for (let c = p.c1; c <= p.c2; c++) {
        const v = Classeur.valeur(feuille(), r, c);
        if (v === null) continue;
        remplies++;
        if (typeof v === 'number') { somme += v; nombres++; }
      }
    }
    zone.innerHTML = '';
    if (!remplies) return;
    const fmt = Classeur.style(feuille(), sel().actif.r, sel().actif.c)?.format;
    const t = (n) => Formules.texteValeur(n, fmt && !Formules.estDate(fmt) ? fmt : '');
    if (nombres) zone.append(el('b', { textContent: 'Moyenne ' }), t(somme / nombres), el('b', { textContent: 'Somme ' }), t(somme));
    zone.append(el('b', { textContent: 'Nombre ' }), String(remplies));
  }

  function rafraichirTout() {
    majOutils();
    majCalcul();
    Grille.redessiner();
  }

  // Les boutons ne prennent pas le clavier : la grille (ou la cellule en cours d'édition) le garde.
  $$('#optionsbar button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
  $('#optionsbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    if (Grille.enEdition()) Grille.valider();
    const a = b.dataset.action;
    switch (a) {
      case 'coller': coller(); break;
      case 'couper': copier(true); break;
      case 'copier': copier(); break;
      case 'pinceau': if (pinceau) { pinceau = null; b.classList.remove('actif'); } else prendrePinceau(); break;
      case 'gras': basculer('gras', 'gras'); break;
      case 'italique': basculer('italique', 'italique'); break;
      case 'souligne': basculer('souligne', 'souligné'); break;
      case 'barre': basculer('barre', 'barré'); break;
      case 'couleur': choisirCouleur('couleur', b); break;
      case 'fond': choisirCouleur('fond', b); break;
      case 'gauche': styler({ alignH: styleActif().alignH === 'left' ? null : 'left' }, 'alignement'); break;
      case 'centre': styler({ alignH: styleActif().alignH === 'center' ? null : 'center' }, 'alignement'); break;
      case 'droite': styler({ alignH: styleActif().alignH === 'right' ? null : 'right' }, 'alignement'); break;
      case 'vertical': {
        const ordre = [undefined, 'top', 'middle'];
        const suivant = ordre[(ordre.indexOf(styleActif().alignV) + 1) % ordre.length];
        styler({ alignV: suivant || null }, 'alignement vertical');
        notify(`Alignement vertical : ${{ top: 'en haut', middle: 'au milieu' }[suivant] || 'en bas'}`, 'info', 1500);
        break;
      }
      case 'retour': basculer('retour', 'renvoi à la ligne'); break;
      case 'fusionner': fusionner(); break;
      case 'euro': styler({ format: '#,##0.00 "€"' }, 'format monétaire'); break;
      case 'pourcent': styler({ format: '0%' }, 'format pourcentage'); break;
      case 'milliers': styler({ format: '#,##0.00' }, 'séparateur de milliers'); break;
      case 'plus-decimales': changerDecimales(1); break;
      case 'moins-decimales': changerDecimales(-1); break;
      case 'bordures': bordures(b); break;
      case 'inserer': insererMenu(b); break;
      case 'supprimer': supprimerMenu(b); break;
      case 'somme':
        Fenetres.menu(b, [['Somme', () => sommeAuto('SUM')], ['Moyenne', () => sommeAuto('AVERAGE')], ['Nombre', () => sommeAuto('COUNT')], ['Max', () => sommeAuto('MAX')], ['Min', () => sommeAuto('MIN')], null, ['Toutes les fonctions…', toutesLesFonctions, 'Maj+F3']]);
        break;
      case 'trier-az': trierRapide(true); break;
      case 'trier-za': trierRapide(false); break;
      case 'trier': trierAvance(); break;
      case 'filtre': basculerFiltre(); break;
      case 'figer': figerMenu(b); break;
      case 'mfc': Regles.menu(b); break;
      case 'graphique': insererGraphique(); break;
      default:
    }
    if (!['couleur', 'fond', 'bordures', 'inserer', 'supprimer', 'somme', 'figer', 'mfc', 'graphique'].includes(a)) Grille.focus();
  });
  $('#outil-police').onchange = (e) => { styler({ police: e.target.value === 'Calibri' ? null : e.target.value }, 'police'); Grille.focus(); };
  $('#outil-taille').onchange = (e) => { styler({ taille: Number(e.target.value) === 11 ? null : Number(e.target.value) }, 'taille du texte'); Grille.focus(); };
  $('#outil-format').onchange = async (e) => {
    if (e.target.value === 'autre') await formatCellule();
    else styler({ format: e.target.value || null }, 'format des nombres');
    majOutils();
    Grille.focus();
  };

  // ===============================================================================================
  // Raccourcis clavier (quand la grille a le clavier)
  // ===============================================================================================
  function raccourci(e) {
    const k = e.key.toLowerCase();
    if (e.altKey && !e.ctrlKey && (e.key === '=' || e.code === 'Equal')) { sommeAuto('SUM'); return true; }
    if (e.altKey && !e.ctrlKey && e.key === 'F1') { insererGraphique(); return true; }
    if (e.shiftKey && e.key === 'F3') { toutesLesFonctions(); return true; }
    if (e.shiftKey && e.key === 'F11') { ajouterFeuille(); return true; }
    if (!e.ctrlKey || e.altKey) return false;
    if (e.shiftKey) {
      if (k === 's') { enregistrer({ sous: true }); return true; }
      if (k === 'l') { basculerFiltre(); return true; }
      if (k === 'v') { coller({ valeursSeules: true }); return true; }
      if (e.key === ':' || e.key === '.' || e.code === 'Period') { saisirDansActive(new Date().toTimeString().slice(0, 5)); return true; }
      if (e.key === '+' || e.code === 'Equal') { inserer(sel().plage.c1 === 0 && sel().plage.c2 === MAX_COLONNES - 1 ? 'lignes' : sel().plage.r1 === 0 && sel().plage.r2 === MAX_LIGNES - 1 ? 'colonnes' : 'lignes'); return true; }
      return false;
    }
    switch (k) {
      case 'c': copier(); return true;
      case 'x': copier(true); return true;
      case 'v': coller(); return true;
      case 'z': annuler(); return true;
      case 'y': refaire(); return true;
      case 'b': basculer('gras', 'gras'); return true;
      case 'i': basculer('italique', 'italique'); return true;
      case 'u': basculer('souligne', 'souligné'); return true;
      case '5': basculer('barre', 'barré'); return true;
      case 's': enregistrer(); return true;
      case 'o': ouvrir(); return true;
      case 'n': nouveau(); return true;
      case 'f': chercher(); return true;
      case 'h': chercher(true); return true;
      case 'g': $('#nom-case').focus(); return true;
      case 'k': lien(); return true;
      case 'a': Grille.selectionner({ r1: 0, c1: 0, r2: MAX_LIGNES - 1, c2: MAX_COLONNES - 1 }, sel().actif, { defiler: false }); return true;
      case 'd': recopierVers('bas'); return true;
      case 'r': recopierVers('droite'); return true;
      case '1': case '&': formatCellule(); return true;
      case ';': case ',':
        if (e.key === ',') { ouvrirReglages(); return true; }
        saisirDansActive(Formules.texteValeur(Formules.dateVersSerie(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()), 'dd/mm/yyyy'));
        return true;
      case '+': case '=': inserer(sel().plage.r1 === 0 && sel().plage.r2 === MAX_LIGNES - 1 ? 'colonnes' : 'lignes'); return true;
      case '-': case '6': supprimer(sel().plage.r1 === 0 && sel().plage.r2 === MAX_LIGNES - 1 ? 'colonnes' : 'lignes'); return true;
      case 'pagedown': case 'pageup': {
        const liste = Classeur.feuilles();
        const i = liste.findIndex((f) => f.id === feuille()) + (k === 'pagedown' ? 1 : -1);
        if (liste[i]) changerFeuille(liste[i].id);
        return true;
      }
      default: return false;
    }
  }

  // Raccourcis valables partout (même quand un bouton ou la barre de formule a le clavier).
  window.addEventListener('keydown', (e) => {
    if (Dialogs.isOpen()) { if (e.key === 'Escape') Dialogs.close(null); return; }
    if (e.target === $('#defil') || e.target.closest?.('.claude-panneau')) return;
    if (!e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (['s', 'o', 'n'].includes(k) || e.key === ',') {
      if (k === 's' && e.shiftKey) { e.preventDefault(); enregistrer({ sous: true }); return; }
      e.preventDefault();
      if (Grille.enEdition()) Grille.valider();
      if (k === 's') enregistrer(); else if (k === 'o') ouvrir(); else if (k === 'n') nouveau(); else ouvrirReglages();
    }
  });

  // ===============================================================================================
  // Zoom
  // ===============================================================================================
  function majZoom() {
    const z = config?.zoom || 100;
    Grille.setZoom(z / 100);
    $('#zoom-valeur').textContent = `${z} %`;
  }
  let zoomTimer = null;
  function zoomer(delta, valeur = null) {
    const z = Math.max(30, Math.min(300, valeur ?? (config.zoom || 100) + delta));
    config.zoom = z;
    majZoom();
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => window.reikna.writeConfig({ zoom: z }), 500);
  }
  $('#zoom-moins').onclick = () => zoomer(-10);
  $('#zoom-plus').onclick = () => zoomer(10);
  $('#zoom-valeur').onclick = () => zoomer(0, 100);

  // ===============================================================================================
  // Glisser un classeur sur la fenêtre
  // ===============================================================================================
  let profondeur = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { profondeur++; document.body.classList.add('drop-target'); } });
  window.addEventListener('dragleave', () => { profondeur = Math.max(0, profondeur - 1); if (!profondeur) document.body.classList.remove('drop-target'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    profondeur = 0;
    document.body.classList.remove('drop-target');
    const f = e.dataTransfer.files?.[0];
    if (f) ouvrir(window.reikna.pathOfDropped(f));
  });

  // Ouvert depuis Atelier avec un dossier : la liste de ses classeurs.
  async function montrerDossier(dossier) {
    const fichiers = await window.reikna.classeursDuDossier(dossier);
    const liste = el('div', { className: 'liste-classeurs' });
    const nom = (c) => c.split(/[\\/]/).pop();
    for (const c of fichiers) {
      const b = el('button', { type: 'button', className: 'recent', onclick: () => { Dialogs.close(null); ouvrir(c); } },
        el('i', { className: `codicon codicon-${/\.csv|\.tsv|\.txt$/i.test(c) ? 'file-text' : 'table'}` }), el('span', { className: 'recent-name', textContent: nom(c) }), el('span', { className: 'recent-path', textContent: `‎${c.slice(dossier.length + 1)}` }));
      liste.append(b);
    }
    const v = await Dialogs.form({
      title: `Classeurs de ${nom(dossier)}`,
      okLabel: 'Ouvrir un autre fichier…',
      cancelLabel: 'Nouveau classeur',
      width: 560,
      fields: fichiers.length ? [{ type: 'element', element: liste }] : [{ type: 'info', text: 'Aucun classeur (xlsx, xls, ods, csv) dans ce dossier.' }],
    });
    if (v) {
      const c = await window.reikna.choisirFichier(dossier);
      if (c) ouvrir(c);
    }
  }

  // ===============================================================================================
  // Démarrage
  // ===============================================================================================
  $('#menu-fichier').onclick = menuFichier;
  $('#menu-edition').onclick = menuEdition;
  $('#menu-insertion').onclick = menuInsertion;
  $('#menu-donnees').onclick = menuDonnees;
  $('#menu-affichage').onclick = menuAffichage;
  $('#btn-annuler').onclick = annuler;
  $('#btn-refaire').onclick = refaire;
  $('#btn-chercher').onclick = () => chercher();
  $('#btn-reglages').onclick = ouvrirReglages;
  $('#btn-fx').onclick = toutesLesFonctions;
  $('#feuille-ajouter').onclick = () => ajouterFeuille(Classeur.feuilles().length);
  $('#grille').addEventListener('contextmenu', menuContextuel);

  Classeur.ecouter((evt) => {
    if (evt.type === 'modif') {
      marquer(true);
      // Une feuille supprimée par Ctrl+Z / Ctrl+Y : on revient sur une feuille qui existe.
      if (!Classeur.feuilles().some((f) => f.id === feuille())) Grille.afficherFeuille(Classeur.feuilles()[0].id);
      rendreOnglets();
      rafraichirTout();
    }
  });

  window.reikna.onDemandeFermeture(async () => {
    if (await avantDeFermer()) window.reikna.fermer();
  });

  return {
    avantDeFermer,
    // Pour Claude (claude-actions.js) : les mêmes fonctions que les boutons, sans fenêtres.
    claude: {
      doc: () => ({ ...doc }),
      feuille,
      selection: sel,
      changerFeuille,
      ouvrir: (chemin) => ouvrir(chemin),
      enregistrer: () => (doc.chemin ? enregistrer() : Promise.reject(new Error('Ce classeur n\'a jamais été enregistré : Ragna doit choisir où (Ctrl+S).'))),
      nouveau: async () => {
        if (doc.modifie) throw new Error('Le classeur ouvert a des modifications non enregistrées : demande à Ragna de l\'enregistrer d\'abord.');
        numeroNouveau += 1;
        doc = { chemin: null, nom: `Classeur${numeroNouveau}`, format: 'xlsx', modifie: false };
        demarrerClasseur(null);
        majTitre();
      },
      rafraichir: rafraichirTout,
      rendreOnglets,
    },
    async start() {
      const lu = await window.reikna.readConfig();
      config = lu.config;
      configPath = lu.path;
      Formules.preparer(HyperFormula, HyperFormula.languages.frFR);
      Grille.init({
        raccourci,
        effacer: () => effacer('contenu'),
        auChangementSelection: () => { majOutils(); majCalcul(); if (pinceau) poserPinceau(); },
        auChangementEdition: () => {},
        ouvrirFiltre,
        toutesLesFonctions,
        zoomer: (d) => zoomer(d),
        apresDessin: () => Graphiques.rafraichir(),
      });
      Graphiques.init();
      demarrerClasseur(null);
      await appliquerTheme(config);
      majTitre();
      Grille.focus();
      window.reikna.onExterne(({ fichier, dossier }) => (fichier ? ouvrir(fichier) : montrerDossier(dossier)));
      const { fichier, dossier } = await window.reikna.demarrage();
      if (fichier) await ouvrir(fichier);
      else if (dossier) await montrerDossier(dossier);
    },
  };
})();

App.start();
