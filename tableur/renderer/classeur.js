// Le classeur ouvert : ses feuilles, leurs cellules, leur mise en forme, et l'historique pour annuler.
//
// Les valeurs et les formules sont confiées au moteur de calcul HyperFormula (il recalcule tout seul
// ce qui dépend d'une cellule modifiée, et décale les formules quand on insère une ligne). Tout le
// reste vit ici, feuille par feuille (« meta ») : la mise en forme de chaque cellule, la largeur des
// colonnes, la hauteur des lignes, les cellules fusionnées, les volets figés et le filtre.
//
// Chaque modification passe par faire() : elle devient UNE étape d'annulation (Ctrl+Z), qui défait
// à la fois ce que le moteur a changé et ce qui a changé ici.

const Classeur = (() => {
  const LARGEUR = 92;  // largeur d'une colonne par défaut, en pixels (à 100 %)
  const HAUTEUR = 24;  // hauteur d'une ligne par défaut
  const MAX_HISTOIRE = 300;

  let hf = null;
  let ordre = [];               // les id des feuilles, dans l'ordre des onglets
  let metas = new Map();        // id de feuille → meta (voir nouvelleMeta)
  let annuler = [], refaire = [];
  const ecouteurs = new Set();
  let enCours = null;           // l'action en train de se faire (pour regrouper)

  const OPTIONS = {
    licenseKey: 'gpl-v3', // HyperFormula est sous licence GPL v3, comme le permet un dépôt public
    maxRows: MAX_LIGNES,
    maxColumns: MAX_COLONNES,
    undoLimit: MAX_HISTOIRE,
    // Les dates comme dans Excel : nombre de jours depuis le 30/12/1899, avec le faux 29/02/1900.
    nullDate: { year: 1899, month: 12, day: 30 },
    leapYear1900: true,
    dateFormats: ['DD/MM/YYYY', 'DD/MM/YY', 'YYYY-MM-DD'],
    timeFormats: ['hh:mm', 'hh:mm:ss.sss'],
    useArrayArithmetic: true,
    evaluateNullToZero: true,
    smartRounding: true,
    precisionRounding: 10,
  };

  function nouvelleMeta() {
    return {
      styles: new Map(),        // « ligne:colonne » → { gras, italique, souligne, barre, taille, police, couleur, fond, alignH, alignV, retour, format, bordures }
      stylesColonnes: new Map(), // colonne → style (une colonne entière mise en forme)
      stylesLignes: new Map(),   // ligne → style
      largeurs: new Map(),      // colonne → pixels (0 = masquée)
      hauteurs: new Map(),      // ligne → pixels (0 = masquée)
      fusions: [],              // plages fusionnées
      figer: { lignes: 0, colonnes: 0 },
      filtre: null,             // { plage, criteres: { colonne: [valeurs cachées] } }
      cachees: new Set(),       // lignes cachées par le filtre
      couleurOnglet: null,
    };
  }
  function clonerMeta(m) {
    return {
      styles: new Map([...m.styles].map(([k, s]) => [k, { ...s, ...(s.bordures ? { bordures: { ...s.bordures } } : {}) }])),
      stylesColonnes: new Map([...m.stylesColonnes].map(([k, s]) => [k, { ...s }])),
      stylesLignes: new Map([...m.stylesLignes].map(([k, s]) => [k, { ...s }])),
      largeurs: new Map(m.largeurs),
      hauteurs: new Map(m.hauteurs),
      fusions: m.fusions.map((p) => ({ ...p })),
      figer: { ...m.figer },
      filtre: m.filtre ? { plage: { ...m.filtre.plage }, criteres: JSON.parse(JSON.stringify(m.filtre.criteres)) } : null,
      cachees: new Set(m.cachees),
      couleurOnglet: m.couleurOnglet,
    };
  }

  // --- Ouvrir / créer ---
  // donnees = { feuilles: [{ nom, cellules: [[contenu, …], …], styles: [[r, c, style]], largeurs: [[c, px]],
  //   hauteurs: [[r, px]], fusions: [plage], figer, filtre, couleurOnglet }] }
  // Un contenu : nombre, booléen, '=formule' (en anglais) ou "'texte".
  function charger(donnees) {
    const feuilles = donnees?.feuilles?.length ? donnees.feuilles : [{ nom: 'Feuil1', cellules: [] }];
    const sheets = {};
    // Les cases jamais remplies d'une ligne (trous du tableau) deviennent des cellules vides.
    for (const f of feuilles) sheets[f.nom] = (f.cellules || []).map((l) => (l ? Array.from(l, (v) => (v === undefined ? null : v)) : []));
    hf?.destroy();
    hf = HyperFormula.buildFromSheets(sheets, OPTIONS);
    ordre = feuilles.map((f) => hf.getSheetId(f.nom));
    metas = new Map();
    feuilles.forEach((f, i) => {
      const m = nouvelleMeta();
      for (const [r, c, s] of f.styles || []) if (s && Object.keys(s).length) m.styles.set(`${r}:${c}`, s);
      for (const [c, px] of f.largeurs || []) m.largeurs.set(c, px);
      for (const [r, px] of f.hauteurs || []) m.hauteurs.set(r, px);
      for (const [c, s] of f.stylesColonnes || []) m.stylesColonnes.set(c, s);
      m.fusions = (f.fusions || []).filter(Boolean);
      if (f.figer) m.figer = { lignes: f.figer.lignes || 0, colonnes: f.figer.colonnes || 0 };
      if (f.filtre) m.filtre = { plage: f.filtre, criteres: {} };
      m.couleurOnglet = f.couleurOnglet || null;
      metas.set(ordre[i], m);
    });
    hf.clearUndoStack();
    annuler = [];
    refaire = [];
    signaler({ type: 'charge' });
  }

  // --- Les écouteurs (la grille se redessine, le titre montre « non enregistré »…) ---
  const ecouter = (fn) => { ecouteurs.add(fn); return () => ecouteurs.delete(fn); };
  function signaler(evt) { for (const fn of ecouteurs) fn(evt); }

  // --- Faire une modification (et pouvoir l'annuler) ---
  // nom : ce que dit « Annuler … ». moteur : fonction qui modifie le moteur (dans un lot unique).
  // feuilles : les id des feuilles dont la meta change (on garde une copie avant / après).
  // meta : fonction qui modifie les metas. ordreChange : l'ordre des onglets change.
  // moteurDirect : la fonction moteur fait elle-même UNE opération hors lot (coller).
  function faire(nom, { moteur, meta, feuilles = [], ordreChange = false, moteurDirect = false, selection } = {}) {
    const avant = { metas: new Map(feuilles.map((id) => [id, clonerMeta(metas.get(id))])), ordre: ordreChange ? [...ordre] : null };
    let etapesMoteur = 0;
    if (moteur) {
      if (moteurDirect) moteur(hf);
      else hf.batch(() => moteur(hf));
      etapesMoteur = 1;
    }
    if (meta) meta();
    const apres = { metas: new Map(feuilles.map((id) => [id, clonerMeta(metas.get(id))])), ordre: ordreChange ? [...ordre] : null };
    annuler.push({ nom, etapesMoteur, avant, apres, selection });
    if (annuler.length > MAX_HISTOIRE) annuler.shift();
    refaire = [];
    signaler({ type: 'modif', nom });
  }

  function restaurer(etat) {
    for (const [id, m] of etat.metas) metas.set(id, clonerMeta(m));
    if (etat.ordre) ordre = [...etat.ordre];
  }
  function defaire() {
    const e = annuler.pop();
    if (!e) return null;
    if (e.etapesMoteur && hf.isThereSomethingToUndo()) hf.undo();
    restaurer(e.avant);
    refaire.push(e);
    signaler({ type: 'modif', nom: e.nom, annule: true });
    return e;
  }
  function refaireAction() {
    const e = refaire.pop();
    if (!e) return null;
    if (e.etapesMoteur && hf.isThereSomethingToRedo()) hf.redo();
    restaurer(e.apres);
    annuler.push(e);
    signaler({ type: 'modif', nom: e.nom, refait: true });
    return e;
  }
  const peutAnnuler = () => (annuler.length ? annuler[annuler.length - 1].nom : null);
  const peutRefaire = () => (refaire.length ? refaire[refaire.length - 1].nom : null);

  // --- Feuilles ---
  const feuilles = () => ordre.map((id) => ({ id, nom: hf.getSheetName(id), couleur: metas.get(id)?.couleurOnglet || null }));
  const nomFeuille = (id) => hf.getSheetName(id);
  const idFeuille = (nom) => {
    if (nom === undefined || nom === null || nom === '') return undefined;
    if (typeof nom === 'number') return ordre[nom];
    const id = hf.getSheetId(String(nom));
    if (id !== undefined) return id;
    const bas = String(nom).toLowerCase();
    return ordre.find((i) => hf.getSheetName(i).toLowerCase() === bas);
  };
  const meta = (id) => metas.get(id);

  function nomLibre(base) {
    const noms = new Set(ordre.map((id) => hf.getSheetName(id).toLowerCase()));
    if (!noms.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) if (!noms.has(`${base} (${i})`.toLowerCase())) return `${base} (${i})`;
  }
  function nouveauNomFeuille() {
    const noms = new Set(ordre.map((id) => hf.getSheetName(id).toLowerCase()));
    for (let i = ordre.length + 1; ; i++) if (!noms.has(`feuil${i}`)) return `Feuil${i}`;
  }
  function verifierNom(nom, saufId) {
    const n = String(nom || '').trim();
    if (!n) throw new Error('Le nom de la feuille ne peut pas être vide.');
    if (n.length > 31) throw new Error('Un nom de feuille a au plus 31 caractères (limite d\'Excel).');
    if (/[\\/?*[\]:]/.test(n)) throw new Error('Un nom de feuille ne peut pas contenir \\ / ? * [ ] :');
    const existe = ordre.find((id) => id !== saufId && hf.getSheetName(id).toLowerCase() === n.toLowerCase());
    if (existe !== undefined) throw new Error(`Il y a déjà une feuille « ${n} ».`);
    return n;
  }

  function ajouterFeuille(nom, position = ordre.length) {
    const n = verifierNom(nom || nouveauNomFeuille());
    let id;
    faire(`ajouter la feuille ${n}`, {
      ordreChange: true,
      moteurDirect: true,
      moteur: (h) => { h.addSheet(n); id = h.getSheetId(n); },
      meta: () => { metas.set(id, nouvelleMeta()); ordre.splice(position, 0, id); },
    });
    return id;
  }
  function renommerFeuille(id, nom) {
    const n = verifierNom(nom, id);
    faire(`renommer la feuille en ${n}`, { moteurDirect: true, moteur: (h) => h.renameSheet(id, n) });
  }
  function supprimerFeuille(id) {
    if (ordre.length <= 1) throw new Error('Un classeur garde au moins une feuille.');
    const nom = hf.getSheetName(id);
    faire(`supprimer la feuille ${nom}`, {
      ordreChange: true,
      feuilles: [id],
      moteurDirect: true,
      moteur: (h) => h.removeSheet(id),
      meta: () => { ordre = ordre.filter((i) => i !== id); },
    });
  }
  function deplacerFeuille(id, position) {
    faire('déplacer la feuille', {
      ordreChange: true,
      meta: () => {
        ordre = ordre.filter((i) => i !== id);
        ordre.splice(Math.max(0, Math.min(ordre.length, position)), 0, id);
      },
    });
  }
  function dupliquerFeuille(id) {
    const nom = nomLibre(hf.getSheetName(id));
    const contenu = hf.getSheetSerialized(id);
    let nouvelId;
    faire(`dupliquer la feuille ${hf.getSheetName(id)}`, {
      ordreChange: true,
      moteur: (h) => { h.addSheet(nom); nouvelId = h.getSheetId(nom); h.setSheetContent(nouvelId, contenu); },
      meta: () => { metas.set(nouvelId, clonerMeta(metas.get(id))); ordre.splice(ordre.indexOf(id) + 1, 0, nouvelId); },
    });
    return nouvelId;
  }
  function couleurOnglet(id, couleur) {
    faire('changer la couleur de l\'onglet', { feuilles: [id], meta: () => { metas.get(id).couleurOnglet = couleur || null; } });
  }

  // --- Lire les cellules ---
  const cellule = (feuille, r, c) => ({ sheet: feuille, row: r, col: c });
  const valeur = (feuille, r, c) => hf.getCellValue(cellule(feuille, r, c));
  const brut = (feuille, r, c) => hf.getCellSerialized(cellule(feuille, r, c));
  const aFormule = (feuille, r, c) => hf.doesCellHaveFormula(cellule(feuille, r, c));
  const typeValeur = (feuille, r, c) => hf.getCellValueDetailedType(cellule(feuille, r, c));
  const dansTableauDebordant = (feuille, r, c) => hf.isCellPartOfArray(cellule(feuille, r, c)) && !hf.doesCellHaveFormula(cellule(feuille, r, c));
  const dimensions = (feuille) => hf.getSheetDimensions(feuille); // { width, height } des cellules non vides

  // Le style d'une cellule : celui de la colonne, puis de la ligne, puis de la cellule elle-même.
  function style(feuille, r, c) {
    const m = metas.get(feuille);
    const sc = m.stylesColonnes.get(c), sl = m.stylesLignes.get(r), s = m.styles.get(`${r}:${c}`);
    if (!sc && !sl) return s || null;
    return { ...sc, ...sl, ...s };
  }

  // Le texte affiché dans la cellule (valeur mise en forme).
  function texte(feuille, r, c) {
    const v = valeur(feuille, r, c);
    if (v === null || v === undefined) return '';
    const s = style(feuille, r, c);
    return Formules.texteValeur(v, s?.format, typeof v === 'number' && !s?.format ? typeValeur(feuille, r, c) : undefined);
  }

  // Ce qu'on montre quand tu édites la cellule : la formule (en français), sinon la valeur à retaper.
  function texteEdition(feuille, r, c) {
    if (aFormule(feuille, r, c)) return Formules.versAffichage(hf.getCellFormula(cellule(feuille, r, c)));
    if (dansTableauDebordant(feuille, r, c)) return '';
    const b = brut(feuille, r, c);
    if (typeof b === 'string' && b.startsWith('\'')) {
      const t = b.slice(1);
      return typeof Formules.lireSaisie(t).contenu === 'string' ? t : b;
    }
    const v = valeur(feuille, r, c);
    const s = style(feuille, r, c);
    return Formules.texteEdition(v, s?.format, typeof v === 'number' && !s?.format ? typeValeur(feuille, r, c) : undefined);
  }

  // --- Écrire ---
  // Ce que tu as tapé (texte), dans une plage de cellules (matrice de textes).
  // formulesAuto (pour Claude) : une formule peut être en anglais (=SUM(A1,A2)) ou en français.
  // Un nombre ou un booléen (pas un texte) va tel quel.
  function saisir(feuille, r, c, matrice, nom = 'saisir', { formulesAuto = false } = {}) {
    const contenus = [], formats = [];
    for (const ligne of matrice) {
      const lc = [], lf = [];
      for (const t of ligne) {
        const { contenu, format } = typeof t === 'number' || typeof t === 'boolean' ? { contenu: t }
          : t === null || t === undefined ? { contenu: null }
            : formulesAuto && String(t).startsWith('=') && t.length > 1 ? { contenu: Formules.versMoteur(String(t), { auto: true }) }
              : Formules.lireSaisie(t);
        lc.push(contenu ?? null);
        lf.push(format || null);
      }
      contenus.push(lc);
      formats.push(lf);
    }
    const aDesFormats = formats.some((l) => l.some(Boolean));
    faire(nom, {
      feuilles: aDesFormats ? [feuille] : [],
      moteur: (h) => h.setCellContents(cellule(feuille, r, c), contenus),
      meta: aDesFormats ? () => {
        const m = metas.get(feuille);
        formats.forEach((l, i) => l.forEach((f, j) => {
          if (!f) return;
          const actuel = style(feuille, r + i, c + j);
          // Un format déjà choisi (pourcentage, monétaire…) reste ; une date tapée met le format date.
          if (actuel?.format && Formules.estDate(actuel.format) === Formules.estDate(f)) return;
          const k = `${r + i}:${c + j}`;
          m.styles.set(k, { ...m.styles.get(k), format: f });
        }));
      } : null,
    });
  }

  // Des contenus déjà prêts pour le moteur (fichiers, collage, Claude) : nombre, booléen, '=…', "'texte".
  function ecrireContenus(feuille, r, c, contenus, nom = 'écrire', { styles } = {}) {
    faire(nom, {
      feuilles: styles ? [feuille] : [],
      moteur: (h) => h.setCellContents(cellule(feuille, r, c), contenus),
      meta: styles ? () => {
        const m = metas.get(feuille);
        styles.forEach((l, i) => l.forEach((s, j) => {
          const k = `${r + i}:${c + j}`;
          if (s && Object.keys(s).length) m.styles.set(k, { ...s }); else m.styles.delete(k);
        }));
      } : null,
    });
  }

  // Effacer : 'tout', 'contenu' (Suppr) ou 'formats'.
  function effacer(feuille, plage, quoi = 'contenu') {
    const p = bornerAuxDonnees(feuille, plage);
    const nom = quoi === 'formats' ? 'effacer les formats' : quoi === 'tout' ? 'tout effacer' : 'effacer';
    faire(nom, {
      feuilles: quoi === 'contenu' ? [] : [feuille],
      moteur: quoi === 'formats' || !p ? null : (h) => {
        const vide = Array.from({ length: p.r2 - p.r1 + 1 }, () => Array(p.c2 - p.c1 + 1).fill(null));
        h.setCellContents(cellule(feuille, p.r1, p.c1), vide);
      },
      meta: quoi === 'contenu' ? null : () => {
        const m = metas.get(feuille);
        for (const k of [...m.styles.keys()]) {
          const [r, c] = k.split(':').map(Number);
          if (dansPlage(plage, r, c)) m.styles.delete(k);
        }
        if (plage.r1 === 0 && plage.r2 === MAX_LIGNES - 1) for (let c = plage.c1; c <= plage.c2; c++) m.stylesColonnes.delete(c);
        if (plage.c1 === 0 && plage.c2 === MAX_COLONNES - 1) for (let r = plage.r1; r <= plage.r2; r++) m.stylesLignes.delete(r);
      },
    });
  }

  // Une plage de lignes ou de colonnes entières → seulement la partie qui contient des données.
  function bornerAuxDonnees(feuille, plage) {
    const { width, height } = dimensions(feuille);
    const p = { r1: plage.r1, c1: plage.c1, r2: Math.min(plage.r2, height - 1), c2: Math.min(plage.c2, width - 1) };
    return p.r2 < p.r1 || p.c2 < p.c1 ? null : p;
  }

  // --- Mise en forme ---
  // patch : { gras: true, couleur: '#ff0000', format: '0.00', … } ; une valeur null retire ce réglage.
  function styler(feuille, plage, patch, nom = 'mettre en forme') {
    faire(nom, { feuilles: [feuille], meta: () => appliquerStyle(feuille, plage, patch) });
  }
  function appliquerStyle(feuille, plage, patch) {
    const m = metas.get(feuille);
    const fusionner = (s) => {
      const out = { ...s };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === false) delete out[k]; else out[k] = v;
      }
      return Object.keys(out).length ? out : null;
    };
    const colonnesEntieres = plage.r1 === 0 && plage.r2 === MAX_LIGNES - 1;
    const lignesEntieres = plage.c1 === 0 && plage.c2 === MAX_COLONNES - 1;
    if (colonnesEntieres || lignesEntieres) {
      // Toute une colonne (ou ligne) : le style va sur la colonne, et sur les cellules qui ont déjà le leur.
      if (colonnesEntieres) for (let c = plage.c1; c <= plage.c2; c++) { const s = fusionner(m.stylesColonnes.get(c)); if (s) m.stylesColonnes.set(c, s); else m.stylesColonnes.delete(c); }
      else for (let r = plage.r1; r <= plage.r2; r++) { const s = fusionner(m.stylesLignes.get(r)); if (s) m.stylesLignes.set(r, s); else m.stylesLignes.delete(r); }
      for (const [k, s] of [...m.styles]) {
        const [r, c] = k.split(':').map(Number);
        if (dansPlage(plage, r, c)) { const n = fusionner(s); if (n) m.styles.set(k, n); else m.styles.delete(k); }
      }
      return;
    }
    if (taillePlage(plage) > 2e6) throw new Error('Plage trop grande pour la mettre en forme d\'un coup : choisis des colonnes entières (clic sur la lettre) ou une plage plus petite.');
    for (let r = plage.r1; r <= plage.r2; r++) {
      for (let c = plage.c1; c <= plage.c2; c++) {
        const k = `${r}:${c}`;
        const n = fusionner(m.styles.get(k));
        if (n) m.styles.set(k, n); else m.styles.delete(k);
      }
    }
  }

  // Bordures : 'toutes', 'contour', 'aucune', 'bas', 'haut', 'gauche', 'droite', 'contour_epais'.
  function bordures(feuille, plage, type, couleur = null) {
    faire('bordures', {
      feuilles: [feuille],
      meta: () => {
        const m = metas.get(feuille);
        const trait = (s = 'thin') => ({ s, c: couleur });
        for (let r = plage.r1; r <= plage.r2; r++) {
          for (let c = plage.c1; c <= plage.c2; c++) {
            const k = `${r}:${c}`;
            const s = { ...m.styles.get(k) };
            const b = { ...s.bordures };
            if (type === 'aucune') { delete s.bordures; if (Object.keys(s).length) m.styles.set(k, s); else m.styles.delete(k); continue; }
            if (type === 'toutes') Object.assign(b, { t: trait(), r: trait(), b: trait(), l: trait() });
            const epais = type === 'contour_epais' ? 'medium' : 'thin';
            if (type === 'contour' || type === 'contour_epais') {
              if (r === plage.r1) b.t = trait(epais);
              if (r === plage.r2) b.b = trait(epais);
              if (c === plage.c1) b.l = trait(epais);
              if (c === plage.c2) b.r = trait(epais);
            }
            if (type === 'bas' && r === plage.r2) b.b = trait();
            if (type === 'haut' && r === plage.r1) b.t = trait();
            if (type === 'gauche' && c === plage.c1) b.l = trait();
            if (type === 'droite' && c === plage.c2) b.r = trait();
            if (type === 'double_bas' && r === plage.r2) b.b = trait('double');
            if (Object.keys(b).length) s.bordures = b;
            if (Object.keys(s).length) m.styles.set(k, s);
          }
        }
      },
    });
  }

  // --- Tailles ---
  const largeur = (feuille, c) => metas.get(feuille).largeurs.get(c) ?? LARGEUR;
  const hauteur = (feuille, r) => (metas.get(feuille).cachees.has(r) ? 0 : metas.get(feuille).hauteurs.get(r) ?? HAUTEUR);
  function changerLargeurs(feuille, c1, c2, px) {
    faire(px === 0 ? 'masquer les colonnes' : 'largeur des colonnes', {
      feuilles: [feuille],
      meta: () => { for (let c = c1; c <= c2; c++) { if (px === null) metas.get(feuille).largeurs.delete(c); else metas.get(feuille).largeurs.set(c, Math.round(px)); } },
    });
  }
  function changerHauteurs(feuille, r1, r2, px) {
    faire(px === 0 ? 'masquer les lignes' : 'hauteur des lignes', {
      feuilles: [feuille],
      meta: () => { for (let r = r1; r <= r2; r++) { if (px === null) metas.get(feuille).hauteurs.delete(r); else metas.get(feuille).hauteurs.set(r, Math.round(px)); } },
    });
  }
  function afficherTout(feuille, axe, i1, i2) {
    faire(axe === 'colonnes' ? 'afficher les colonnes' : 'afficher les lignes', {
      feuilles: [feuille],
      meta: () => {
        const tailles = axe === 'colonnes' ? metas.get(feuille).largeurs : metas.get(feuille).hauteurs;
        for (const [i, px] of [...tailles]) if (i >= i1 && i <= i2 && px === 0) tailles.delete(i);
      },
    });
  }

  // --- Insérer / supprimer des lignes et des colonnes ---
  // Le moteur décale les formules ; ici on décale la mise en forme, les tailles, les fusions, le filtre.
  function decaler(m, axe, index, delta) {
    const ligne = axe === 'lignes';
    const bouge = (i) => (i >= index ? (delta < 0 && i < index - delta ? null : i + delta) : i);
    const styles = new Map();
    for (const [k, s] of m.styles) {
      const [r, c] = k.split(':').map(Number);
      const n = bouge(ligne ? r : c);
      if (n === null) continue;
      styles.set(ligne ? `${n}:${c}` : `${r}:${n}`, s);
    }
    m.styles = styles;
    const remap = (map) => {
      const out = new Map();
      for (const [i, v] of map) { const n = bouge(i); if (n !== null) out.set(n, v); }
      return out;
    };
    if (ligne) { m.hauteurs = remap(m.hauteurs); m.stylesLignes = remap(m.stylesLignes); m.cachees = new Set([...m.cachees].map(bouge).filter((n) => n !== null)); }
    else { m.largeurs = remap(m.largeurs); m.stylesColonnes = remap(m.stylesColonnes); }
    const decalerPlage = (p) => {
      const [a, b] = ligne ? ['r1', 'r2'] : ['c1', 'c2'];
      const q = { ...p };
      if (delta > 0) {
        if (p[a] >= index) q[a] += delta;
        if (p[b] >= index) q[b] += delta;
      } else {
        const fin = index - delta - 1; // dernière ligne supprimée
        const avant = (i) => (i < index ? i : i > fin ? i + delta : index);
        q[a] = avant(p[a]);
        q[b] = p[b] > fin ? p[b] + delta : Math.min(p[b], index - 1);
        if (q[b] < q[a]) return null;
      }
      return q;
    };
    m.fusions = m.fusions.map(decalerPlage).filter((p) => p && taillePlage(p) > 1);
    if (m.filtre) {
      const p = decalerPlage(m.filtre.plage);
      m.filtre = p ? { ...m.filtre, plage: p } : null;
    }
  }
  function inserer(feuille, axe, index, nombre) {
    faire(axe === 'lignes' ? `insérer ${nombre > 1 ? `${nombre} lignes` : 'une ligne'}` : `insérer ${nombre > 1 ? `${nombre} colonnes` : 'une colonne'}`, {
      feuilles: [feuille],
      moteur: (h) => (axe === 'lignes' ? h.addRows(feuille, [index, nombre]) : h.addColumns(feuille, [index, nombre])),
      meta: () => decaler(metas.get(feuille), axe, index, nombre),
    });
  }
  function supprimer(feuille, axe, index, nombre) {
    faire(axe === 'lignes' ? `supprimer ${nombre > 1 ? `${nombre} lignes` : 'la ligne'}` : `supprimer ${nombre > 1 ? `${nombre} colonnes` : 'la colonne'}`, {
      feuilles: [feuille],
      moteur: (h) => (axe === 'lignes' ? h.removeRows(feuille, [index, nombre]) : h.removeColumns(feuille, [index, nombre])),
      meta: () => decaler(metas.get(feuille), axe, index, -nombre),
    });
  }
  // Insérer des cellules en décalant vers le bas ou la droite : le moteur ne sait pas le faire pour
  // une partie de ligne, on déplace donc le bloc concerné.
  function decalerCellules(feuille, plage, sens) {
    const { width, height } = dimensions(feuille);
    const bas = sens === 'bas';
    const n = bas ? plage.r2 - plage.r1 + 1 : plage.c2 - plage.c1 + 1;
    const bloc = bas
      ? { r1: plage.r1, c1: plage.c1, r2: Math.max(plage.r1, height - 1), c2: plage.c2 }
      : { r1: plage.r1, c1: plage.c1, r2: plage.r2, c2: Math.max(plage.c1, width - 1) };
    faire('insérer des cellules', {
      feuilles: [feuille],
      moteur: (h) => {
        if ((bas && bloc.r2 >= height) || (!bas && bloc.c2 >= width)) return;
        h.moveCells({ start: cellule(feuille, bloc.r1, bloc.c1), end: cellule(feuille, bloc.r2, bloc.c2) }, cellule(feuille, bloc.r1 + (bas ? n : 0), bloc.c1 + (bas ? 0 : n)));
      },
      meta: () => {
        const m = metas.get(feuille);
        const styles = new Map();
        for (const [k, s] of m.styles) {
          const [r, c] = k.split(':').map(Number);
          const dedans = bas ? c >= plage.c1 && c <= plage.c2 && r >= plage.r1 : r >= plage.r1 && r <= plage.r2 && c >= plage.c1;
          styles.set(dedans ? (bas ? `${r + n}:${c}` : `${r}:${c + n}`) : k, s);
        }
        m.styles = styles;
      },
    });
  }

  // --- Fusionner ---
  function fusionner(feuille, plage, centrer = true) {
    if (taillePlage(plage) < 2) return;
    faire('fusionner', {
      feuilles: [feuille],
      moteur: (h) => {
        // Comme Excel : seule la valeur en haut à gauche est gardée.
        const vide = Array.from({ length: plage.r2 - plage.r1 + 1 }, () => Array(plage.c2 - plage.c1 + 1).fill(null));
        const coin = h.getCellSerialized(cellule(feuille, plage.r1, plage.c1));
        vide[0][0] = coin ?? null;
        h.setCellContents(cellule(feuille, plage.r1, plage.c1), vide);
      },
      meta: () => {
        const m = metas.get(feuille);
        m.fusions = m.fusions.filter((p) => !croise(p, plage));
        m.fusions.push({ ...plage });
        if (centrer) appliquerStyle(feuille, { r1: plage.r1, c1: plage.c1, r2: plage.r1, c2: plage.c1 }, { alignH: 'center', alignV: 'middle' });
      },
    });
  }
  function defusionner(feuille, plage) {
    faire('annuler la fusion', { feuilles: [feuille], meta: () => { const m = metas.get(feuille); m.fusions = m.fusions.filter((p) => !croise(p, plage)); } });
  }
  // La fusion qui contient cette cellule (ou null).
  function fusionDe(feuille, r, c) {
    for (const p of metas.get(feuille).fusions) if (dansPlage(p, r, c)) return p;
    return null;
  }

  // --- Volets figés ---
  function figer(feuille, lignes, colonnes) {
    faire(lignes || colonnes ? 'figer les volets' : 'libérer les volets', { feuilles: [feuille], meta: () => { metas.get(feuille).figer = { lignes: Math.max(0, lignes), colonnes: Math.max(0, colonnes) }; } });
  }

  // --- Recopier (poignée de recopie, Ctrl+D, Ctrl+R) ---
  // Le moteur adapte les formules (A1 devient A2 une ligne plus bas). Pour les nombres, on prolonge la
  // suite comme Excel (1, 2 → 3, 4, 5…) ; un texte qui finit par un nombre aussi (Article 1 → Article 2) ;
  // les jours et les mois aussi (lundi → mardi, janvier → février).
  const LISTES = [
    ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
    ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'],
    ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
    ['t1', 't2', 't3', 't4'],
  ];
  function recopier(feuille, source, cible, { serie = true } = {}) {
    const verticale = cible.c1 === source.c1 && cible.c2 === source.c2;
    const vers = (p) => ({ start: cellule(feuille, p.r1, p.c1), end: cellule(feuille, p.r2, p.c2) });
    const donnees = hf.getFillRangeData(vers(source), vers(cible));
    // Les suites : colonne par colonne (ou ligne par ligne).
    if (serie) {
      const nbSeries = verticale ? source.c2 - source.c1 + 1 : source.r2 - source.r1 + 1;
      const longueur = verticale ? source.r2 - source.r1 + 1 : source.c2 - source.c1 + 1;
      const versLeHaut = verticale ? cible.r2 < source.r1 : cible.c2 < source.c1;
      for (let s = 0; s < nbSeries; s++) {
        const valeurs = [];
        for (let k = 0; k < longueur; k++) {
          const [r, c] = verticale ? [source.r1 + k, source.c1 + s] : [source.r1 + s, source.c1 + k];
          valeurs.push(aFormule(feuille, r, c) ? undefined : brut(feuille, r, c));
        }
        const suite = prolonger(valeurs, verticale ? cible.r2 - cible.r1 + 1 : cible.c2 - cible.c1 + 1, versLeHaut);
        if (!suite) continue;
        suite.forEach((v, k) => {
          if (verticale) donnees[k][s] = v; else donnees[s][k] = v;
        });
      }
    }
    faire('recopier', {
      feuilles: [feuille],
      moteur: (h) => h.setCellContents(cellule(feuille, cible.r1, cible.c1), donnees),
      meta: () => {
        const m = metas.get(feuille);
        for (let r = cible.r1; r <= cible.r2; r++) {
          for (let c = cible.c1; c <= cible.c2; c++) {
            const hs = source.r2 - source.r1 + 1, ws = source.c2 - source.c1 + 1;
            const sr = source.r1 + (((r - source.r1) % hs) + hs) % hs, sc = source.c1 + (((c - source.c1) % ws) + ws) % ws;
            const s = m.styles.get(`${sr}:${sc}`);
            if (s) m.styles.set(`${r}:${c}`, { ...s }); else m.styles.delete(`${r}:${c}`);
          }
        }
      },
    });
  }
  // Prolonger une suite de valeurs (undefined = une formule : on laisse le moteur faire).
  // versLeHaut : la recopie part vers le haut (ou la gauche) : la case k de la cible (de haut en bas)
  // est à (n − k) pas AVANT la première valeur.
  function prolonger(valeurs, n, versLeHaut) {
    if (valeurs.some((v) => v === undefined || v === null)) return null;
    const terme = (premier, dernier, pas, k) => (versLeHaut ? premier - pas * (n - k) : dernier + pas * (k + 1));
    const suite = (f) => Array.from({ length: n }, (_v, k) => f(k));
    if (valeurs.every((v) => typeof v === 'number')) {
      if (valeurs.length === 1) return null; // un seul nombre : on le recopie (comme Excel)
      const pas = (valeurs[valeurs.length - 1] - valeurs[0]) / (valeurs.length - 1);
      return suite((k) => Number(terme(valeurs[0], valeurs[valeurs.length - 1], pas, k).toPrecision(15)));
    }
    if (!valeurs.every((v) => typeof v === 'string')) return null;
    const textes = valeurs.map((v) => (v.startsWith('\'') ? v.slice(1) : v));
    for (const liste of LISTES) {
      const idx = textes.map((t) => liste.indexOf(t.toLowerCase()));
      if (!idx.every((i) => i >= 0)) continue;
      const pas = idx.length > 1 ? (idx[idx.length - 1] - idx[0]) / (idx.length - 1) || 1 : 1;
      const maj = textes[0][0] !== textes[0][0].toLowerCase();
      return suite((k) => {
        const i = ((Math.round(terme(idx[0], idx[idx.length - 1], pas, k)) % liste.length) + liste.length) % liste.length;
        return `'${maj ? liste[i][0].toUpperCase() + liste[i].slice(1) : liste[i]}`;
      });
    }
    const m = textes.map((t) => t.match(/^(.*?)(\d+)$/));
    if (m.every(Boolean) && m.every((x) => x[1] === m[0][1])) {
      const nums = m.map((x) => Number(x[2]));
      const pas = nums.length > 1 ? (nums[nums.length - 1] - nums[0]) / (nums.length - 1) : 1;
      const chiffres = m[m.length - 1][2].length; // Article 007 → Article 008
      return suite((k) => `'${m[0][1]}${String(Math.max(0, Math.round(terme(nums[0], nums[nums.length - 1], pas, k)))).padStart(chiffres, '0')}`);
    }
    return null;
  }

  // --- Coller depuis Reikna (les formules s'adaptent, la mise en forme suit) ---
  let pressePapiers = null; // { feuille, plage, styles, couper }
  function copier(feuille, plage, couper = false) {
    hf.copy({ start: cellule(feuille, plage.r1, plage.c1), end: cellule(feuille, plage.r2, plage.c2) });
    const styles = [];
    for (let r = plage.r1; r <= plage.r2; r++) {
      const l = [];
      for (let c = plage.c1; c <= plage.c2; c++) l.push(metas.get(feuille).styles.get(`${r}:${c}`) || null);
      styles.push(l);
    }
    pressePapiers = { feuille, plage: { ...plage }, styles, couper };
  }
  const copieEnCours = () => pressePapiers;
  function oublierCopie() { pressePapiers = null; }
  function coller(feuille, r, c, { valeursSeules = false, formatsSeuls = false } = {}) {
    const pp = pressePapiers;
    if (!pp) return null;
    const h = pp.plage.r2 - pp.plage.r1 + 1, w = pp.plage.c2 - pp.plage.c1 + 1;
    const cible = { r1: r, c1: c, r2: r + h - 1, c2: c + w - 1 };
    if (pp.couper) {
      // Couper-coller : le moteur déplace les cellules (et met à jour les formules qui les visent).
      faire('déplacer', {
        feuilles: [...new Set([pp.feuille, feuille])],
        moteurDirect: true,
        moteur: (hh) => hh.moveCells({ start: cellule(pp.feuille, pp.plage.r1, pp.plage.c1), end: cellule(pp.feuille, pp.plage.r2, pp.plage.c2) }, cellule(feuille, r, c)),
        meta: () => {
          const ms = metas.get(pp.feuille), mc = metas.get(feuille);
          for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) ms.styles.delete(`${pp.plage.r1 + i}:${pp.plage.c1 + j}`);
          pp.styles.forEach((l, i) => l.forEach((s, j) => { if (s) mc.styles.set(`${r + i}:${c + j}`, { ...s }); else mc.styles.delete(`${r + i}:${c + j}`); }));
        },
      });
      pressePapiers = null;
      return cible;
    }
    const metaStyles = () => {
      const m = metas.get(feuille);
      pp.styles.forEach((l, i) => l.forEach((s, j) => { if (s) m.styles.set(`${r + i}:${c + j}`, { ...s }); else m.styles.delete(`${r + i}:${c + j}`); }));
    };
    if (formatsSeuls) {
      faire('coller les formats', { feuilles: [feuille], meta: metaStyles });
    } else if (valeursSeules) {
      const contenus = [];
      for (let i = 0; i < h; i++) {
        const l = [];
        for (let j = 0; j < w; j++) {
          const v = valeur(pp.feuille, pp.plage.r1 + i, pp.plage.c1 + j);
          l.push(v === null || typeof v === 'object' ? null : typeof v === 'string' ? `'${v}` : v);
        }
        contenus.push(l);
      }
      faire('coller les valeurs', { moteur: (hh) => hh.setCellContents(cellule(feuille, r, c), contenus) });
    } else {
      faire('coller', { feuilles: [feuille], moteurDirect: true, moteur: (hh) => hh.paste(cellule(feuille, r, c)), meta: metaStyles });
    }
    return cible;
  }

  // --- Trier ---
  // cles : [{ colonne (index dans la feuille), croissant }]. entete : la 1re ligne ne bouge pas.
  function trier(feuille, plage, cles, entete = false) {
    const debut = plage.r1 + (entete ? 1 : 0);
    if (debut >= plage.r2) return;
    const lignes = [];
    for (let r = debut; r <= plage.r2; r++) lignes.push(r);
    const cmp = (a, b) => {
      for (const { colonne, croissant = true } of cles) {
        const va = valeur(feuille, a, colonne), vb = valeur(feuille, b, colonne);
        const d = comparer(va, vb);
        if (d) return croissant ? d : -d;
      }
      return a - b;
    };
    // Les cellules vides vont toujours à la fin, dans un sens comme dans l'autre.
    const vide = (r) => cles.every(({ colonne }) => valeur(feuille, r, colonne) === null);
    const pleines = lignes.filter((r) => !vide(r)).sort(cmp);
    const nouvelOrdre = [...pleines, ...lignes.filter(vide)];
    const vers = (r1, r2) => ({ start: cellule(feuille, r1, plage.c1), end: cellule(feuille, r2, plage.c2) });
    const contenus = nouvelOrdre.map((src, i) => hf.getFillRangeData(vers(src, src), vers(debut + i, debut + i))[0]);
    faire('trier', {
      feuilles: [feuille],
      moteur: (h) => h.setCellContents(cellule(feuille, debut, plage.c1), contenus),
      meta: () => {
        const m = metas.get(feuille);
        const anciens = new Map();
        for (let r = debut; r <= plage.r2; r++) for (let c = plage.c1; c <= plage.c2; c++) anciens.set(`${r}:${c}`, m.styles.get(`${r}:${c}`));
        nouvelOrdre.forEach((src, i) => {
          for (let c = plage.c1; c <= plage.c2; c++) {
            const s = anciens.get(`${src}:${c}`);
            if (s) m.styles.set(`${debut + i}:${c}`, s); else m.styles.delete(`${debut + i}:${c}`);
          }
        });
      },
    });
  }
  // Ordre d'Excel : nombres, puis textes (sans tenir compte des majuscules ni des accents), puis FAUX/VRAI, puis erreurs.
  const rangType = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : v === null ? 4 : 3);
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  function comparer(a, b) {
    const ta = rangType(a), tb = rangType(b);
    if (ta !== tb) return ta - tb;
    if (ta === 0) return a - b;
    if (ta === 1) return collator.compare(a, b);
    if (ta === 2) return Number(a) - Number(b);
    return 0;
  }

  // --- Filtre ---
  function basculerFiltre(feuille, plage) {
    const m = metas.get(feuille);
    if (m.filtre) {
      faire('retirer le filtre', { feuilles: [feuille], meta: () => { m.filtre = null; m.cachees = new Set(); } });
      return false;
    }
    faire('filtrer', { feuilles: [feuille], meta: () => { m.filtre = { plage: { ...plage }, criteres: {} }; } });
    return true;
  }
  // valeursCachees : les textes affichés à cacher pour cette colonne ([] = tout montrer).
  function filtrerColonne(feuille, colonne, valeursCachees) {
    const m = metas.get(feuille);
    if (!m.filtre) return;
    faire('filtrer', {
      feuilles: [feuille],
      meta: () => {
        const criteres = { ...m.filtre.criteres };
        if (valeursCachees?.length) criteres[colonne] = [...valeursCachees]; else delete criteres[colonne];
        m.filtre = { ...m.filtre, criteres };
        appliquerFiltre(feuille);
      },
    });
  }
  function appliquerFiltre(feuille) {
    const m = metas.get(feuille);
    m.cachees = new Set();
    if (!m.filtre) return;
    const { plage, criteres } = m.filtre;
    const fin = Math.max(plage.r2, dimensions(feuille).height - 1);
    for (let r = plage.r1 + 1; r <= fin; r++) {
      for (const [c, caches] of Object.entries(criteres)) {
        if (caches.includes(texte(feuille, r, Number(c)))) { m.cachees.add(r); break; }
      }
    }
  }
  // Les valeurs différentes d'une colonne du filtre (pour la liste à cocher).
  function valeursColonne(feuille, colonne) {
    const m = metas.get(feuille);
    if (!m.filtre) return [];
    const fin = Math.max(m.filtre.plage.r2, dimensions(feuille).height - 1);
    const vus = new Map();
    for (let r = m.filtre.plage.r1 + 1; r <= fin; r++) {
      const t = texte(feuille, r, colonne);
      if (!vus.has(t)) vus.set(t, valeur(feuille, r, colonne));
    }
    return [...vus].sort((a, b) => comparer(a[1], b[1])).map(([t]) => t);
  }

  // --- Chercher / remplacer ---
  function chercher(texteCherche, { feuille = null, casse = false, entier = false, dansFormules = true } = {}) {
    const resultats = [];
    const cible = casse ? texteCherche : texteCherche.toLowerCase();
    for (const id of feuille === null ? ordre : [feuille]) {
      const { width, height } = dimensions(id);
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          let t = dansFormules && aFormule(id, r, c) ? texteEdition(id, r, c) : texte(id, r, c);
          if (!t) continue;
          if (!casse) t = t.toLowerCase();
          if (entier ? t === cible : t.includes(cible)) resultats.push({ feuille: id, r, c });
        }
      }
    }
    return resultats;
  }

  // --- Tout le classeur, pour l'enregistrer ---
  function exporter() {
    return ordre.map((id) => {
      const m = metas.get(id);
      const { width, height } = dimensions(id);
      const cellules = [];
      for (let r = 0; r < height; r++) {
        const l = [];
        for (let c = 0; c < width; c++) {
          const cel = cellule(id, r, c);
          if (hf.doesCellHaveFormula(cel)) l.push({ formule: hf.getCellFormula(cel).slice(1), valeur: hf.getCellValue(cel) });
          else if (hf.isCellPartOfArray(cel)) l.push(null); // une valeur débordée d'une formule voisine
          else {
            const v = hf.getCellValue(cel);
            l.push(v === null ? null : { valeur: v });
          }
        }
        cellules.push(l);
      }
      return {
        nom: hf.getSheetName(id),
        cellules,
        styles: [...m.styles].map(([k, s]) => [...k.split(':').map(Number), s]),
        stylesColonnes: [...m.stylesColonnes],
        largeurs: [...m.largeurs],
        hauteurs: [...m.hauteurs],
        fusions: m.fusions,
        figer: m.figer,
        filtre: m.filtre?.plage || null,
        cachees: [...m.cachees],
        couleurOnglet: m.couleurOnglet,
      };
    });
  }

  return {
    LARGEUR, HAUTEUR, charger, ecouter, faire, defaire, refaire: refaireAction, peutAnnuler, peutRefaire,
    feuilles, nomFeuille, idFeuille, meta, ajouterFeuille, renommerFeuille, supprimerFeuille, deplacerFeuille, dupliquerFeuille, couleurOnglet,
    valeur, brut, aFormule, typeValeur, dimensions, style, texte, texteEdition, dansTableauDebordant,
    saisir, ecrireContenus, effacer, styler, bordures, largeur, hauteur, changerLargeurs, changerHauteurs, afficherTout,
    inserer, supprimer, decalerCellules, fusionner, defusionner, fusionDe, figer, recopier, copier, coller, copieEnCours, oublierCopie,
    trier, comparer, basculerFiltre, filtrerColonne, valeursColonne, chercher, exporter,
    moteur: () => hf,
  };
})();
