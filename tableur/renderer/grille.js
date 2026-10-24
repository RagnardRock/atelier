// La grille : dessine la feuille affichée dans un <canvas> et gère la souris, le clavier et l'édition.
//
// Pourquoi un canvas ? Une feuille peut avoir un million de lignes : on ne dessine que les cellules
// visibles (quelques centaines), à chaque défilement. Par-dessus le canvas, une <div> transparente
// (#defil) contient un grand bloc vide de la taille de la feuille : elle donne les vraies barres de
// défilement de Windows et la molette ; on lit sa position pour savoir quoi dessiner.
//
// Sélection : une cellule active (r, c) et une plage { r1, c1, r2, c2 } qui la contient.
// Édition : une zone de texte posée sur la cellule, reliée à la barre de formule (en haut).
// Pendant qu'on écrit une formule, un clic (ou les flèches) sur une cellule insère sa référence,
// les références de la formule sont coloriées, et l'autocomplétion propose les fonctions.

const Grille = (() => {
  const ENTETE_H = 24;     // hauteur de la ligne des lettres de colonnes
  const POLICE = 'Calibri, Carlito, "Segoe UI", sans-serif';
  const COULEURS_REFS = ['#4f9dff', '#ff6b6b', '#b48cff', '#3ddc84', '#ff9f43', '#ff6bd5', '#2ed3c7'];

  let feuille = null;
  let actif = { r: 0, c: 0 };
  let plage = { r1: 0, c1: 0, r2: 0, c2: 0 };
  let zoom = 1;
  let options = {};
  let couleurs = {};
  const vues = new Map(); // feuille → { x, y, actif, plage } (on retrouve sa place en changeant d'onglet)

  const zone = $('#grille');
  const canvas = $('#grille-canvas');
  const ctx = canvas.getContext('2d');
  const defil = $('#defil');
  const espace = $('#defil-espace');
  const editeur = $('#editeur');
  const barre = $('#barre-formule');
  const nomCase = $('#nom-case');
  const auto = $('#autocompletion');
  const aideArgs = $('#aide-args');

  // ===============================================================================================
  // Positions : colonnes et lignes de tailles variables
  // ===============================================================================================
  // Pour chaque axe, on garde les index dont la taille n'est pas celle par défaut, triés, avec la
  // somme cumulée des écarts : la position de la ligne i se calcule par une recherche dichotomique.
  let axes = null;
  function construireAxes() {
    if (feuille === null) return;
    const m = Classeur.meta(feuille);
    const axe = (defaut, tailles, cachees) => {
      const ecarts = new Map();
      for (const [i, px] of tailles) ecarts.set(i, px - defaut);
      if (cachees) for (const i of cachees) ecarts.set(i, -defaut);
      const pts = [...ecarts.keys()].sort((a, b) => a - b);
      const cum = [];
      let s = 0;
      for (const i of pts) { s += ecarts.get(i); cum.push(s); }
      return { defaut, pts, cum, ecarts };
    };
    axes = { c: axe(Classeur.LARGEUR, m.largeurs), r: axe(Classeur.HAUTEUR, m.hauteurs, m.cachees) };
  }
  // Position (non zoomée) du début de l'index i.
  function pos(a, i) {
    const { defaut, pts, cum } = axes[a];
    let lo = 0, hi = pts.length; // nombre de points < i
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid] < i) lo = mid + 1; else hi = mid; }
    return defaut * i + (lo ? cum[lo - 1] : 0);
  }
  const taille = (a, i) => axes[a].defaut + (axes[a].ecarts.get(i) || 0);
  // L'index qui contient la position p (non zoomée).
  function indexA(a, p, max) {
    let lo = 0, hi = max - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pos(a, mid) <= p) lo = mid; else hi = mid - 1; }
    return lo;
  }

  // Dimensions à l'écran
  let largeurEntete = 46;
  const L = () => zone.clientWidth;
  const H = () => zone.clientHeight;
  const figees = () => Classeur.meta(feuille).figer;
  // Coin haut gauche de la partie qui défile, à l'écran.
  const origineX = () => largeurEntete + pos('c', figees().colonnes) * zoom;
  const origineY = () => ENTETE_H * zoom + pos('r', figees().lignes) * zoom;
  // Position à l'écran du début de la colonne c / ligne r.
  function ecranX(c) {
    const fc = figees().colonnes;
    return c < fc ? largeurEntete + pos('c', c) * zoom : origineX() + (pos('c', c) - pos('c', fc)) * zoom - defil.scrollLeft;
  }
  function ecranY(r) {
    const fr = figees().lignes;
    return r < fr ? ENTETE_H * zoom + pos('r', r) * zoom : origineY() + (pos('r', r) - pos('r', fr)) * zoom - defil.scrollTop;
  }
  // Colonne / ligne sous un point de l'écran (x relatif à la grille).
  function colonneA(x) {
    const fc = figees().colonnes;
    if (fc && x < origineX()) return indexA('c', (x - largeurEntete) / zoom, fc);
    return indexA('c', pos('c', fc) + (x - origineX() + defil.scrollLeft) / zoom, MAX_COLONNES);
  }
  function ligneA(y) {
    const fr = figees().lignes;
    if (fr && y < origineY()) return indexA('r', (y - ENTETE_H * zoom) / zoom, fr);
    return indexA('r', pos('r', fr) + (y - origineY() + defil.scrollTop) / zoom, MAX_LIGNES);
  }

  // Taille du bloc qui défile : ce qui est rempli, plus de la marge (elle grandit quand on descend).
  let etendue = { r: 100, c: 30 };
  function majEspace() {
    if (!axes) return;
    const { width, height } = Classeur.dimensions(feuille);
    const visR = ligneA(H()) + 40, visC = colonneA(L()) + 8;
    etendue.r = Math.min(MAX_LIGNES, Math.max(etendue.r, height + 60, visR, actif.r + 30, 100));
    etendue.c = Math.min(MAX_COLONNES, Math.max(etendue.c, width + 12, visC, actif.c + 8, 30));
    const fc = figees().colonnes, fr = figees().lignes;
    espace.style.width = `${origineX() + (pos('c', etendue.c) - pos('c', fc)) * zoom}px`;
    espace.style.height = `${origineY() + (pos('r', etendue.r) - pos('r', fr)) * zoom}px`;
  }

  // ===============================================================================================
  // Dessin
  // ===============================================================================================
  function lireCouleurs() {
    const cs = getComputedStyle(document.body);
    const v = (n) => cs.getPropertyValue(n).trim();
    couleurs = {
      fond: v('--grille-fond'), ligne: v('--grille-ligne'), texte: v('--grille-texte'), entete: v('--entete-fond'),
      enteteTexte: v('--entete-texte'), enteteLigne: v('--entete-ligne'), accent: v('--accent'), lien: v('--grille-lien'),
      clair: document.body.classList.contains('grille-claire'),
    };
  }

  let demande = false;
  function redessiner() {
    if (demande) return;
    demande = true;
    requestAnimationFrame(() => { demande = false; dessiner(); options.apresDessin?.(); });
  }

  function dessiner() {
    if (feuille === null || !axes) return;
    const dpr = window.devicePixelRatio || 1;
    const w = L(), h = H();
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    // La largeur des numéros de ligne suit le nombre de chiffres (1 à 1 048 576).
    const derniere = ligneA(h) + 1;
    ctx.font = `${12 * zoom}px "Segoe UI", sans-serif`;
    const lEntete = Math.max(34, Math.ceil(ctx.measureText(String(derniere)).width + 18 * zoom));
    if (lEntete !== largeurEntete) { largeurEntete = lEntete; majEspace(); }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = couleurs.fond;
    ctx.fillRect(0, 0, w, h);
    const fr = figees().lignes, fc = figees().colonnes;
    const premiereR = ligneA(origineY() + 0.5), derniereR = Math.min(MAX_LIGNES - 1, ligneA(h));
    const premiereC = colonneA(origineX() + 0.5), derniereC = Math.min(MAX_COLONNES - 1, colonneA(w));
    // Les 4 parties : coin figé, lignes figées, colonnes figées, et le reste.
    const parties = [
      [premiereR, derniereR, premiereC, derniereC, origineX(), origineY(), w, h],
      ...(fr ? [[0, fr - 1, premiereC, derniereC, origineX(), ENTETE_H * zoom, w, origineY()]] : []),
      ...(fc ? [[premiereR, derniereR, 0, fc - 1, largeurEntete, origineY(), origineX(), h]] : []),
      ...(fr && fc ? [[0, fr - 1, 0, fc - 1, largeurEntete, ENTETE_H * zoom, origineX(), origineY()]] : []),
    ];
    for (const [r1, r2, c1, c2, x1, y1, x2, y2] of parties) {
      if (r2 < r1 || c2 < c1) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x1, y1, x2 - x1, y2 - y1);
      ctx.clip();
      dessinerCellules(r1, r2, c1, c2);
      dessinerRefs();
      dessinerSelection();
      ctx.restore();
    }
    dessinerEntetes(premiereR, derniereR, premiereC, derniereC);
    // Trait des volets figés
    ctx.fillStyle = couleurs.enteteLigne;
    if (fr) ctx.fillRect(largeurEntete, origineY() - 1, w, 2);
    if (fc) ctx.fillRect(origineX() - 1, ENTETE_H * zoom, 2, h);
    placerEditeur();
  }

  // Le rectangle à l'écran d'une cellule (ou de sa fusion).
  function rect(r, c, fusion = null) {
    const p = fusion || { r1: r, c1: c, r2: r, c2: c };
    const x = ecranX(p.c1), y = ecranY(p.r1);
    return { x, y, w: ecranX(p.c2 + 1) - x, h: ecranY(p.r2 + 1) - y };
  }

  const policeDe = (s) => `${s?.italique ? 'italic ' : ''}${s?.gras ? 'bold ' : ''}${((s?.taille || 11) * 4 / 3) * zoom}px ${s?.police ? `"${s.police}", ` : ''}${POLICE}`;

  // La couleur du texte, lisible sur le fond de la grille (sombre ou claire).
  function couleurTexte(s) {
    const fond = s?.fond;
    if (s?.lien && !s?.couleur) return couleurs.lien;
    if (s?.couleur) {
      const lf = fond ? luminosite(fond) : couleurs.clair ? 1 : 0.1;
      const lt = luminosite(s.couleur);
      if (Math.abs(lf - lt) > 0.25) return s.couleur;
    }
    if (fond) return luminosite(fond) > 0.55 ? '#1b1b1f' : '#f2f2f2';
    return couleurs.texte;
  }

  // Une barre de données (mise en forme conditionnelle) : dégradé de la couleur vers le transparent.
  function dessinerBarre(x, y, w, h, b) {
    const m = 2 * zoom;
    const x1 = x + m + (w - 2 * m) * b.debut, x2 = x + m + (w - 2 * m) * b.fin;
    if (x2 - x1 < 0.5) return;
    const g = ctx.createLinearGradient(x1, 0, x2, 0);
    g.addColorStop(0, `${b.couleur}d0`);
    g.addColorStop(1, `${b.couleur}40`);
    ctx.fillStyle = g;
    ctx.fillRect(x1, y + m, x2 - x1, h - 2 * m);
    ctx.fillStyle = b.couleur;
    ctx.fillRect(b.debut > 0 ? x1 : x2 - Math.max(1, zoom), y + m, Math.max(1, zoom), h - 2 * m);
  }

  function dessinerCellules(r1, r2, c1, c2) {
    const m = Classeur.meta(feuille);
    const fusions = m.fusions.filter((p) => p.r2 >= r1 && p.r1 <= r2 && p.c2 >= c1 && p.c1 <= c2);
    const couvertes = (r, c) => fusions.some((p) => dansPlage(p, r, c));
    const z = zoom;
    // 1. Fonds de couleur
    for (let r = r1; r <= r2; r++) {
      if (!taille('r', r)) continue;
      const y = ecranY(r), hh = taille('r', r) * z;
      for (let c = c1; c <= c2; c++) {
        const s = Classeur.styleAffiche(feuille, r, c);
        if (s?.fond && !couvertes(r, c)) {
          ctx.fillStyle = s.fond;
          ctx.fillRect(ecranX(c), y, taille('c', c) * z, hh);
        }
        if (s?._barre && !couvertes(r, c)) dessinerBarre(ecranX(c), y, taille('c', c) * z, hh, s._barre);
      }
    }
    // 2. Quadrillage
    if (options.quadrillage !== false) {
      ctx.fillStyle = couleurs.ligne;
      const xMax = ecranX(c2 + 1), yMax = ecranY(r2 + 1);
      for (let c = c1; c <= c2 + 1; c++) ctx.fillRect(Math.round(ecranX(c)) - 0.5, ecranY(r1), 1, yMax - ecranY(r1));
      for (let r = r1; r <= r2 + 1; r++) ctx.fillRect(ecranX(c1), Math.round(ecranY(r)) - 0.5, xMax - ecranX(c1), 1);
    }
    // 3. Textes (avec débordement vers la droite si les voisines sont vides, comme Excel)
    for (let r = r1; r <= r2; r++) {
      if (!taille('r', r)) continue;
      for (let c = c1; c <= c2; c++) {
        if (couvertes(r, c)) continue;
        dessinerTexte(r, c, null, c2);
      }
    }
    // 4. Cellules fusionnées (même si leur coin est hors de la zone visible)
    for (const p of fusions) {
      const rc = rect(p.r1, p.c1, p);
      const s = Classeur.styleAffiche(feuille, p.r1, p.c1);
      ctx.fillStyle = s?.fond || couleurs.fond;
      ctx.fillRect(rc.x + 0.5, rc.y + 0.5, rc.w - 1, rc.h - 1);
      if (options.quadrillage !== false && !s?.fond) { ctx.strokeStyle = couleurs.ligne; ctx.lineWidth = 1; ctx.strokeRect(Math.round(rc.x) - 0.5, Math.round(rc.y) - 0.5, Math.round(rc.w), Math.round(rc.h)); }
      dessinerTexte(p.r1, p.c1, p, p.c2);
    }
    // 5. Bordures
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const s = Classeur.style(feuille, r, c);
        if (!s?.bordures) continue;
        const f = couvertes(r, c) ? fusions.find((p) => dansPlage(p, r, c)) : null;
        dessinerBordures(rect(r, c), s.bordures, f, r, c);
      }
    }
    // 6. Boutons du filtre (dans la ligne d'en-tête du filtre)
    if (m.filtre && m.filtre.plage.r1 >= r1 && m.filtre.plage.r1 <= r2) {
      for (let c = Math.max(c1, m.filtre.plage.c1); c <= Math.min(c2, m.filtre.plage.c2); c++) {
        const rc = rect(m.filtre.plage.r1, c);
        const b = boutonFiltre(rc);
        const actifFiltre = Boolean(m.filtre.criteres[c]?.length);
        ctx.fillStyle = actifFiltre ? couleurs.accent : (couleurs.clair ? '#e8e8ec' : '#33343d');
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 3 * zoom);
        ctx.fill();
        ctx.fillStyle = actifFiltre ? '#111' : (couleurs.clair ? '#333' : '#ddd');
        ctx.beginPath();
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        ctx.moveTo(cx - 3.5 * zoom, cy - 1.5 * zoom); ctx.lineTo(cx + 3.5 * zoom, cy - 1.5 * zoom); ctx.lineTo(cx, cy + 2.5 * zoom);
        ctx.fill();
      }
    }
  }
  const boutonFiltre = (rc) => { const t = Math.min(rc.h - 4, 18 * zoom); return { x: rc.x + rc.w - t - 2, y: rc.y + (rc.h - t) / 2, w: t, h: t }; };

  function dessinerTexte(r, c, fusion, cMaxVisible) {
    const v = Classeur.valeur(feuille, r, c);
    if (v === null || v === undefined || v === '') return;
    const s = Classeur.styleAffiche(feuille, r, c);
    let texte = Classeur.texte(feuille, r, c);
    if (!texte) return;
    const rc = rect(r, c, fusion);
    const pad = 4 * zoom;
    ctx.font = policeDe(s);
    const estNombre = typeof v === 'number';
    let align = s?.alignH || (estNombre ? 'right' : typeof v === 'string' ? 'left' : 'center');
    const retour = s?.retour;
    let largeurTexte = ctx.measureText(texte).width;
    // Sur la ligne des titres d'un filtre, le texte s'arrête avant le bouton.
    const filtre = Classeur.meta(feuille).filtre;
    const reserve = filtre && r === filtre.plage.r1 && c >= filtre.plage.c1 && c <= filtre.plage.c2 ? boutonFiltre(rc).w + 2 : 0;
    const largeurUtile = rc.w - reserve;
    let x1 = rc.x, x2 = rc.x + largeurUtile;
    // Débordement d'un texte trop long dans les cellules vides voisines (à droite pour un texte aligné à gauche).
    if (!retour && !fusion && !reserve && largeurTexte + 2 * pad > rc.w && typeof v === 'string') {
      if (align === 'left') {
        let c2 = c + 1;
        while (x2 - rc.x < largeurTexte + 2 * pad && c2 <= cMaxVisible + 20 && Classeur.valeur(feuille, r, c2) === null && !Classeur.fusionDe(feuille, r, c2)) { x2 = ecranX(c2 + 1); c2++; }
        // On efface le quadrillage sous le texte qui déborde.
        if (x2 > rc.x + rc.w) { ctx.fillStyle = s?.fond || couleurs.fond; ctx.fillRect(rc.x + rc.w - 0.5, rc.y + 0.5, x2 - rc.x - rc.w, rc.h - 1); }
      } else if (align === 'right') {
        let c0 = c - 1;
        while (rc.x + rc.w - x1 < largeurTexte + 2 * pad && c0 >= 0 && Classeur.valeur(feuille, r, c0) === null && !Classeur.fusionDe(feuille, r, c0)) { x1 = ecranX(c0); c0--; }
        if (x1 < rc.x) { ctx.fillStyle = s?.fond || couleurs.fond; ctx.fillRect(x1, rc.y + 0.5, rc.x - x1 + 0.5, rc.h - 1); }
      }
    } else if (estNombre && !retour && largeurTexte + 2 * pad > largeurUtile) {
      // Un nombre trop large pour sa colonne : ### (comme Excel), plutôt qu'un nombre coupé et trompeur.
      texte = '#'.repeat(Math.max(1, Math.floor((largeurUtile - 2 * pad) / ctx.measureText('#').width)));
      largeurTexte = ctx.measureText(texte).width;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, rc.y, x2 - x1, rc.h);
    ctx.clip();
    ctx.fillStyle = couleurTexte(s);
    ctx.textBaseline = 'alphabetic';
    const tailleTexte = ((s?.taille || 11) * 4 / 3) * zoom;
    const hauteurLigne = tailleTexte * 1.25;
    const lignes = retour ? couper(texte, rc.w - 2 * pad) : [texte];
    const hauteurBloc = lignes.length * hauteurLigne;
    const valign = s?.alignV || 'bottom';
    let y = valign === 'top' ? rc.y + pad / 2 : valign === 'middle' ? rc.y + (rc.h - hauteurBloc) / 2 : rc.y + rc.h - hauteurBloc - pad / 2;
    const retrait = (s?.retrait || 0) * 9 * zoom;
    for (const ligne of lignes) {
      const lw = ctx.measureText(ligne).width;
      const x = align === 'right' ? x2 - pad - lw - retrait : align === 'center' ? rc.x + (largeurUtile - lw) / 2 : x1 + pad + retrait;
      const base = y + hauteurLigne * 0.8;
      ctx.fillText(ligne, x, base);
      if (s?.souligne || s?.lien) ctx.fillRect(x, base + 2 * zoom, lw, Math.max(1, zoom));
      if (s?.barre) ctx.fillRect(x, base - tailleTexte * 0.3, lw, Math.max(1, zoom));
      y += hauteurLigne;
    }
    ctx.restore();
  }

  // Couper un texte en lignes qui tiennent dans la largeur (retour à la ligne automatique).
  function couper(texte, largeur) {
    const out = [];
    for (const para of texte.split('\n')) {
      let ligne = '';
      for (const mot of para.split(/(\s+)/)) {
        const essai = ligne + mot;
        if (ctx.measureText(essai).width > largeur && ligne.trim()) { out.push(ligne.trimEnd()); ligne = mot.trimStart(); } else ligne = essai;
      }
      out.push(ligne);
    }
    return out;
  }

  function dessinerBordures(rc, b, fusion, r, c) {
    const trait = (def, x1, y1, x2, y2) => {
      if (!def) return;
      const epaisseur = { medium: 2, thick: 3, double: 1 }[def.s] || 1;
      ctx.strokeStyle = def.c && !(couleurs.clair === false && luminosite(def.c) < 0.2) ? def.c : (couleurs.clair ? '#000' : '#d8d8de');
      ctx.lineWidth = epaisseur * Math.max(1, zoom * 0.8);
      ctx.setLineDash(def.s === 'dashed' || def.s === 'mediumDashed' ? [4 * zoom, 2 * zoom] : def.s === 'dotted' || def.s === 'hair' ? [1 * zoom, 2 * zoom] : []);
      ctx.beginPath();
      if (def.s === 'double') {
        const dx = y1 === y2 ? 0 : 1.5, dy = y1 === y2 ? 1.5 : 0;
        ctx.moveTo(x1 - dx, y1 - dy); ctx.lineTo(x2 - dx, y2 - dy); ctx.moveTo(x1 + dx, y1 + dy); ctx.lineTo(x2 + dx, y2 + dy);
      } else { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
      ctx.stroke();
    };
    const X1 = Math.round(rc.x) - 0.5, Y1 = Math.round(rc.y) - 0.5, X2 = Math.round(rc.x + rc.w) - 0.5, Y2 = Math.round(rc.y + rc.h) - 0.5;
    // Dans une fusion, seules les bordures du tour comptent.
    if (!fusion || r === fusion.r1) trait(b.t, X1, Y1, X2, Y1);
    if (!fusion || r === fusion.r2) trait(b.b, X1, Y2, X2, Y2);
    if (!fusion || c === fusion.c1) trait(b.l, X1, Y1, X1, Y2);
    if (!fusion || c === fusion.c2) trait(b.r, X2, Y1, X2, Y2);
    ctx.setLineDash([]);
  }

  function dessinerEntetes(r1, r2, c1, c2) {
    const z = zoom, w = L(), h = H();
    const fr = figees().lignes, fc = figees().colonnes;
    const sel = plage;
    const colonneEntiere = sel.r1 === 0 && sel.r2 === MAX_LIGNES - 1;
    const ligneEntiere = sel.c1 === 0 && sel.c2 === MAX_COLONNES - 1;
    ctx.font = `${12 * z}px "Segoe UI", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    // Lettres des colonnes
    ctx.fillStyle = couleurs.entete;
    ctx.fillRect(0, 0, w, ENTETE_H * z);
    const colonnes = [...(fc ? Array.from({ length: fc }, (_v, i) => i) : []), ...range(c1, c2)];
    for (const c of colonnes) {
      const x = ecranX(c), cw = taille('c', c) * z;
      if (c >= fc && x + cw < origineX()) continue;
      if (!cw) { ctx.fillStyle = couleurs.accent; ctx.fillRect(x - 1, 4 * z, 2, ENTETE_H * z - 8 * z); continue; }
      const dedans = c >= sel.c1 && c <= sel.c2;
      if (dedans) {
        ctx.fillStyle = colonneEntiere ? couleurs.accent : `color-mix(in srgb, ${couleurs.accent} 22%, ${couleurs.entete})`;
        ctx.fillRect(x, 0, cw, ENTETE_H * z);
        ctx.fillStyle = couleurs.accent;
        ctx.fillRect(x, ENTETE_H * z - 2, cw, 2);
      }
      ctx.fillStyle = dedans && colonneEntiere ? '#111' : dedans ? couleurs.accent : couleurs.enteteTexte;
      ctx.fillText(lettreColonne(c), x + cw / 2, ENTETE_H * z / 2 + 0.5);
      ctx.fillStyle = couleurs.enteteLigne;
      ctx.fillRect(Math.round(x + cw) - 0.5, 0, 1, ENTETE_H * z);
    }
    // Numéros des lignes
    ctx.fillStyle = couleurs.entete;
    ctx.fillRect(0, ENTETE_H * z, largeurEntete, h);
    const lignes = [...(fr ? Array.from({ length: fr }, (_v, i) => i) : []), ...range(r1, r2)];
    for (const r of lignes) {
      const y = ecranY(r), rh = taille('r', r) * z;
      if (r >= fr && y + rh < origineY()) continue;
      if (!rh) { ctx.fillStyle = couleurs.accent; ctx.fillRect(4 * z, y - 1, largeurEntete - 8 * z, 2); continue; }
      const dedans = r >= sel.r1 && r <= sel.r2;
      if (dedans) {
        ctx.fillStyle = ligneEntiere ? couleurs.accent : `color-mix(in srgb, ${couleurs.accent} 22%, ${couleurs.entete})`;
        ctx.fillRect(0, y, largeurEntete, rh);
        ctx.fillStyle = couleurs.accent;
        ctx.fillRect(largeurEntete - 2, y, 2, rh);
      }
      ctx.fillStyle = dedans && ligneEntiere ? '#111' : dedans ? couleurs.accent : couleurs.enteteTexte;
      if (rh > 8) ctx.fillText(String(r + 1), largeurEntete / 2, y + rh / 2 + 0.5);
      ctx.fillStyle = couleurs.enteteLigne;
      ctx.fillRect(0, Math.round(y + rh) - 0.5, largeurEntete, 1);
    }
    // Coin (tout sélectionner)
    ctx.fillStyle = couleurs.entete;
    ctx.fillRect(0, 0, largeurEntete, ENTETE_H * z);
    ctx.fillStyle = couleurs.enteteTexte;
    ctx.beginPath();
    ctx.moveTo(largeurEntete - 5, ENTETE_H * z - 5); ctx.lineTo(largeurEntete - 5, ENTETE_H * z - 14); ctx.lineTo(largeurEntete - 14, ENTETE_H * z - 5);
    ctx.fill();
    ctx.fillStyle = couleurs.enteteLigne;
    ctx.fillRect(0, Math.round(ENTETE_H * z) - 0.5, w, 1);
    ctx.fillRect(Math.round(largeurEntete) - 0.5, 0, 1, h);
    ctx.textAlign = 'left';
  }
  function range(a, b) { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; }

  // Sélection, poignée de recopie, cadre de la copie
  function dessinerSelection() {
    if (edition?.feuille !== undefined && edition.feuille !== feuille) return;
    const p = etendreAuxFusions(plage);
    const r = rect(0, 0, p);
    const multi = taillePlage(p) > 1 && !(Classeur.fusionDe(feuille, actif.r, actif.c) && memePlage(Classeur.fusionDe(feuille, actif.r, actif.c), p));
    if (multi) {
      // Un voile sur la plage, sauf sur la cellule active (règle « evenodd » : le trou du milieu).
      const a = rect(actif.r, actif.c, Classeur.fusionDe(feuille, actif.r, actif.c));
      ctx.fillStyle = `color-mix(in srgb, ${couleurs.accent} 14%, transparent)`;
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.rect(a.x, a.y, a.w, a.h);
      ctx.fill('evenodd');
    }
    ctx.strokeStyle = couleurs.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(r.x), Math.round(r.y), Math.round(r.w) - 1, Math.round(r.h) - 1);
    if (multi) {
      const a = rect(actif.r, actif.c, Classeur.fusionDe(feuille, actif.r, actif.c));
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(a.x) + 1.5, Math.round(a.y) + 1.5, Math.round(a.w) - 4, Math.round(a.h) - 4);
    }
    if (!edition && !colonnesOuLignesEntieres(p)) {
      const t = 7;
      ctx.fillStyle = couleurs.fond;
      ctx.fillRect(r.x + r.w - t / 2 - 2, r.y + r.h - t / 2 - 2, t + 2, t + 2);
      ctx.fillStyle = couleurs.accent;
      ctx.fillRect(r.x + r.w - t / 2 - 1, r.y + r.h - t / 2 - 1, t, t);
    }
    // Copie en cours : cadre en pointillés
    const pp = Classeur.copieEnCours();
    if (pp && pp.feuille === feuille) {
      const cr = rect(0, 0, pp.plage);
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -decalagePointilles;
      ctx.strokeStyle = couleurs.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(cr.x) + 1, Math.round(cr.y) + 1, Math.round(cr.w) - 3, Math.round(cr.h) - 3);
      ctx.setLineDash([]);
    }
    // Recopie en cours : cadre gris de la destination
    if (glisse?.type === 'recopie' && glisse.cible) {
      const cr = rect(0, 0, glisse.cible);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = couleurs.clair ? '#555' : '#bbb';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(cr.x) + 0.5, Math.round(cr.y) + 0.5, Math.round(cr.w) - 1, Math.round(cr.h) - 1);
      ctx.setLineDash([]);
    }
  }
  let decalagePointilles = 0;
  setInterval(() => { if (Classeur.copieEnCours()?.feuille === feuille) { decalagePointilles = (decalagePointilles + 1) % 9; redessiner(); } }, 90);

  const colonnesOuLignesEntieres = (p) => (p.r1 === 0 && p.r2 === MAX_LIGNES - 1) || (p.c1 === 0 && p.c2 === MAX_COLONNES - 1);

  // Les références de la formule en cours, en couleurs (comme dans Excel).
  function dessinerRefs() {
    if (!edition || !edition.texte.startsWith('=')) return;
    const nomFeuille = Classeur.nomFeuille(feuille);
    Formules.references(edition.texte).forEach((ref, i) => {
      const memeFeuille = ref.feuille ? ref.feuille.toLowerCase() === nomFeuille.toLowerCase() : edition.feuille === feuille;
      if (!memeFeuille) return;
      const p = lirePlage(ref.texte);
      if (!p) return;
      const r = rect(0, 0, p);
      const col = COULEURS_REFS[i % COULEURS_REFS.length];
      ctx.fillStyle = `${col}1f`;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(pointage && pointage.debut === ref.debut ? [4, 3] : []);
      ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
      ctx.setLineDash([]);
    });
  }

  // ===============================================================================================
  // Sélection et navigation
  // ===============================================================================================
  // Une plage qui coupe une fusion s'agrandit pour la contenir entièrement (comme dans Excel).
  function etendreAuxFusions(p) {
    let q = { ...p };
    let change = true;
    while (change) {
      change = false;
      for (const f of Classeur.meta(feuille).fusions) {
        if (croise(f, q) && !(f.r1 >= q.r1 && f.r2 <= q.r2 && f.c1 >= q.c1 && f.c2 <= q.c2)) {
          q = { r1: Math.min(q.r1, f.r1), c1: Math.min(q.c1, f.c1), r2: Math.max(q.r2, f.r2), c2: Math.max(q.c2, f.c2) };
          change = true;
        }
      }
    }
    return q;
  }

  // Comme Excel : après une suite de Tab, Entrée revient à la colonne du début, une ligne plus bas.
  let colonneTab = null;
  function selectionner(p, a = null, { defiler = true } = {}) {
    const n = normaliser(p);
    if (!n) return;
    colonneTab = null;
    plage = colonnesOuLignesEntieres(n) ? n : etendreAuxFusions(n);
    actif = a || { r: n.r1, c: n.c1 };
    if (defiler) rendreVisible(actif.r, actif.c);
    majBarre();
    options.auChangementSelection?.();
    redessiner();
  }
  const allerA = (r, c) => selectionner({ r1: r, c1: c, r2: r, c2: c }, { r, c });

  function rendreVisible(r, c) {
    const fr = figees().lignes, fc = figees().colonnes;
    if (r >= fr) {
      const y = ecranY(r), hh = taille('r', r) * zoom;
      if (y < origineY()) defil.scrollTop -= origineY() - y;
      else if (y + hh > H() - 2) defil.scrollTop += y + hh - H() + 2;
    }
    if (c >= fc) {
      const x = ecranX(c), cw = taille('c', c) * zoom;
      if (x < origineX()) defil.scrollLeft -= origineX() - x;
      else if (x + cw > L() - 2) defil.scrollLeft += Math.min(x - origineX(), x + cw - L() + 2);
    }
    majEspace();
  }

  // Ctrl+flèche : jusqu'au bord des données (comme Excel).
  function bord(r, c, dr, dc) {
    const plein = (rr, cc) => Classeur.valeur(feuille, rr, cc) !== null;
    const { width, height } = Classeur.dimensions(feuille);
    const maxR = dr ? Math.max(height, 1) - 1 : MAX_LIGNES - 1, maxC = dc ? Math.max(width, 1) - 1 : MAX_COLONNES - 1;
    let rr = r, cc = c;
    const suivant = () => [rr + dr, cc + dc];
    const dehors = ([a, b]) => a < 0 || b < 0 || a >= MAX_LIGNES || b >= MAX_COLONNES;
    if (dehors(suivant())) return [rr, cc];
    if (plein(rr, cc) && plein(...suivant())) {
      while (!dehors(suivant()) && plein(...suivant())) [rr, cc] = suivant();
      return [rr, cc];
    }
    [rr, cc] = suivant();
    while (!plein(rr, cc)) {
      const s = suivant();
      if (dehors(s) || (dr > 0 && rr >= maxR) || (dc > 0 && cc >= maxC)) {
        // Plus rien plus loin : tout au bout de la feuille (ou au bord des données).
        return dr > 0 ? [MAX_LIGNES - 1, cc] : dc > 0 ? [rr, MAX_COLONNES - 1] : [Math.max(0, rr), Math.max(0, cc)];
      }
      [rr, cc] = s;
    }
    return [rr, cc];
  }

  function deplacer(dr, dc, { etendre = false, saut = false } = {}) {
    // On part de la cellule active (ou du coin mobile de la plage quand on étend).
    const mobile = etendre ? { r: plage.r1 === actif.r ? plage.r2 : plage.r1, c: plage.c1 === actif.c ? plage.c2 : plage.c1 } : actif;
    let r = mobile.r, c = mobile.c;
    if (saut) [r, c] = bord(r, c, dr, dc);
    else {
      // Sauter les lignes et colonnes masquées.
      do { r += dr; } while (dr && r > 0 && r < MAX_LIGNES - 1 && !taille('r', r));
      do { c += dc; } while (dc && c > 0 && c < MAX_COLONNES - 1 && !taille('c', c));
      // Sortir d'une fusion d'un coup.
      const f = Classeur.fusionDe(feuille, mobile.r, mobile.c);
      if (f && !etendre) { if (dr > 0) r = f.r2 + 1; if (dc > 0) c = f.c2 + 1; }
    }
    r = Math.max(0, Math.min(MAX_LIGNES - 1, r));
    c = Math.max(0, Math.min(MAX_COLONNES - 1, c));
    if (etendre) { selectionner({ r1: actif.r, c1: actif.c, r2: r, c2: c }, actif, { defiler: false }); rendreVisible(r, c); }
    else {
      const f = Classeur.fusionDe(feuille, r, c);
      if (f) { r = f.r1; c = f.c1; }
      allerA(r, c);
    }
  }

  // Entrée / Tab à l'intérieur d'une plage sélectionnée : on avance dedans sans la perdre.
  function avancer(dr, dc) {
    if (taillePlage(plage) > 1 && !colonnesOuLignesEntieres(plage)) {
      let { r, c } = actif;
      if (dc) {
        c += dc;
        if (c > plage.c2) { c = plage.c1; r = r + 1 > plage.r2 ? plage.r1 : r + 1; }
        if (c < plage.c1) { c = plage.c2; r = r - 1 < plage.r1 ? plage.r2 : r - 1; }
      } else {
        r += dr;
        if (r > plage.r2) { r = plage.r1; c = c + 1 > plage.c2 ? plage.c1 : c + 1; }
        if (r < plage.r1) { r = plage.r2; c = c - 1 < plage.c1 ? plage.c2 : c - 1; }
      }
      actif = { r, c };
      rendreVisible(r, c);
      majBarre();
      options.auChangementSelection?.();
      redessiner();
      return;
    }
    if (dc) { const debut = colonneTab ?? actif.c; deplacer(0, dc); colonneTab = debut; return; }
    if (dr > 0 && colonneTab !== null) { allerA(actif.r + 1, colonneTab); return; }
    deplacer(dr, dc);
  }

  // ===============================================================================================
  // Édition
  // ===============================================================================================
  let edition = null; // { feuille, r, c, texte, mode: 'saisie' | 'edition', depuis: 'cellule' | 'barre' }
  let pointage = null; // { debut, fin, ancre: {r, c}, feuille } : la référence en train d'être pointée

  function majBarre() {
    if (feuille === null) return;
    const f = Classeur.fusionDe(feuille, actif.r, actif.c);
    nomCase.value = taillePlage(plage) > 1 && !(f && memePlage(f, plage)) ? adressePlage(plage) : adresse(actif.r, actif.c);
    if (!edition) barre.value = Classeur.texteEdition(feuille, actif.r, actif.c);
  }

  function commencer(texteInitial = null, { mode = 'saisie', depuis = 'cellule' } = {}) {
    if (edition) return;
    const { r, c } = actif;
    edition = { feuille, r, c, mode, depuis, texte: texteInitial ?? Classeur.texteEdition(feuille, r, c) };
    pointage = null;
    editeur.value = edition.texte;
    barre.value = edition.texte;
    editeur.hidden = false;
    zone.classList.add('en-edition');
    placerEditeur();
    const cible = depuis === 'barre' ? barre : editeur;
    cible.focus();
    const fin = cible.value.length;
    cible.setSelectionRange(fin, fin);
    options.auChangementEdition?.(true);
    majAides();
    redessiner();
  }

  function placerEditeur() {
    if (!edition || edition.feuille !== feuille) { if (edition) editeur.style.visibility = 'hidden'; return; }
    editeur.style.visibility = '';
    const f = Classeur.fusionDe(feuille, edition.r, edition.c);
    const rc = rect(edition.r, edition.c, f);
    const s = Classeur.style(feuille, edition.r, edition.c);
    editeur.style.font = policeDe(s);
    editeur.style.left = `${Math.max(largeurEntete, rc.x)}px`;
    editeur.style.top = `${rc.y}px`;
    editeur.style.minWidth = `${rc.w}px`;
    editeur.style.minHeight = `${rc.h}px`;
    editeur.style.textAlign = s?.alignH === 'center' ? 'center' : s?.alignH === 'right' ? 'right' : 'left';
    // La zone s'élargit avec le texte (jusqu'au bord de la grille), puis passe à la ligne.
    ctx.font = policeDe(s);
    const plusLongue = Math.max(...editeur.value.split('\n').map((l) => ctx.measureText(l).width));
    const largeur = Math.min(L() - Math.max(largeurEntete, rc.x) - 4, Math.max(rc.w, plusLongue + 24 * zoom));
    editeur.style.width = `${largeur}px`;
    editeur.style.height = 'auto';
    editeur.style.height = `${Math.max(rc.h, editeur.scrollHeight)}px`;
  }

  function terminer() {
    edition = null;
    pointage = null;
    editeur.hidden = true;
    zone.classList.remove('en-edition');
    fermerAides();
    options.auChangementEdition?.(false);
  }

  // Valider : on écrit dans la cellule (ou dans toute la plage avec Ctrl+Entrée).
  function valider({ partout = false } = {}) {
    if (!edition) return true;
    let texte = edition.texte;
    // Comme Excel : les parenthèses oubliées à la fin d'une formule sont ajoutées.
    if (texte.startsWith('=')) {
      const sansTextes = texte.replace(/"(?:[^"]|"")*"/g, '');
      const manque = (sansTextes.match(/\(/g) || []).length - (sansTextes.match(/\)/g) || []).length;
      if (manque > 0 && manque < 10) texte += ')'.repeat(manque);
    }
    const { feuille: f, r, c } = edition;
    const retour = f !== feuille;
    terminer();
    if (retour) afficherFeuille(f);
    try {
      if (partout && taillePlage(plage) > 1 && !colonnesOuLignesEntieres(plage)) {
        // Ctrl+Entrée : la même saisie dans toutes les cellules (les formules s'adaptent).
        Classeur.saisir(f, r, c, [[texte]], 'saisir');
        if (plage.r2 > plage.r1 || plage.c2 > plage.c1) Classeur.recopier(f, { r1: r, c1: c, r2: r, c2: c }, { ...plage, r1: plage.r1, c1: plage.c1 }, { serie: false });
      } else {
        const avant = Classeur.texteEdition(f, r, c);
        if (avant !== texte || (texte.startsWith('=') && !Classeur.aFormule(f, r, c))) Classeur.saisir(f, r, c, [[texte]]);
      }
    } catch (err) {
      notify(`Impossible d'écrire dans ${adresse(r, c)} : ${cleanError(err)}`, 'error');
    }
    // Une formule mal écrite : on prévient tout de suite (la cellule affiche #ERREUR!).
    const v = Classeur.valeur(f, r, c);
    if (texte.startsWith('=') && v && typeof v === 'object' && (v.type === 'ERROR' || v.type === 'NAME')) {
      notify(`${adresse(r, c)} : ${Formules.explicationErreur(v)}`, 'warning', 7000);
    }
    majBarre();
    redessiner();
    defil.focus({ preventScroll: true });
    return true;
  }

  function annulerEdition() {
    if (!edition) return;
    const f = edition.feuille;
    terminer();
    if (f !== feuille) afficherFeuille(f);
    majBarre();
    redessiner();
    defil.focus({ preventScroll: true });
  }

  // Ce qui est tapé dans la cellule ou dans la barre : les deux restent identiques.
  function surSaisie(source) {
    if (!edition) return;
    edition.texte = source.value;
    if (source === editeur) barre.value = source.value; else editeur.value = source.value;
    // Taper fait oublier la référence pointée (la suivante s'ajoutera après).
    pointage = null;
    placerEditeur();
    majAides();
    redessiner();
  }
  editeur.addEventListener('input', () => surSaisie(editeur));
  barre.addEventListener('input', () => { if (!edition) commencer(barre.value, { mode: 'edition', depuis: 'barre' }); surSaisie(barre); });
  barre.addEventListener('focus', () => {
    if (!edition) {
      commencer(null, { mode: 'edition', depuis: 'barre' });
      barre.focus();
    } else edition.depuis = 'barre';
  });
  editeur.addEventListener('focus', () => { if (edition) edition.depuis = 'cellule'; });
  editeur.addEventListener('click', () => { if (edition) { edition.mode = 'edition'; majAides(); } });
  barre.addEventListener('click', () => { if (edition) { edition.mode = 'edition'; majAides(); } });

  const champActif = () => (edition?.depuis === 'barre' ? barre : editeur);

  // Peut-on insérer une référence à la position du curseur ? (après =, (, ;, +, -, *, /, ^, &, <, >, :)
  function pointInsertion() {
    if (!edition || !edition.texte.startsWith('=')) return false;
    if (pointage) return true;
    const champ = champActif();
    if (champ.selectionStart !== champ.selectionEnd) return false;
    const avant = edition.texte.slice(0, champ.selectionStart).trimEnd();
    const apres = edition.texte[champ.selectionStart] || '';
    return /[=(;,+\-*/^&<>:]$/.test(avant) && !/[A-Za-z0-9$_"]/.test(apres);
  }

  // Insérer (ou remplacer) la référence pointée.
  function pointer(p, ancre = null) {
    const champ = champActif();
    let ref = adressePlage(p);
    if (feuille !== edition.feuille) {
      const nom = Classeur.nomFeuille(feuille);
      ref = `${/^[A-Za-z_À-ɏ][\w.À-ɏ]*$/.test(nom) ? nom : `'${nom.replace(/'/g, '\'\'')}'`}!${ref}`;
    }
    const debut = pointage ? pointage.debut : champ.selectionStart;
    const fin = pointage ? pointage.fin : champ.selectionEnd;
    const texte = edition.texte.slice(0, debut) + ref + edition.texte.slice(fin);
    edition.texte = texte;
    editeur.value = texte;
    barre.value = texte;
    pointage = { debut, fin: debut + ref.length, ancre: ancre || { r: p.r1, c: p.c1 }, plage: p };
    champ.setSelectionRange(pointage.fin, pointage.fin);
    if (edition.feuille === feuille) placerEditeur();
    majAides();
    redessiner();
  }

  // ===============================================================================================
  // Autocomplétion des fonctions et bulle d'aide des arguments
  // ===============================================================================================
  let propositions = [];
  let choix = 0;

  function motEnCours() {
    const champ = champActif();
    const avant = edition.texte.slice(0, champ.selectionStart);
    const m = avant.match(/(?:^=|[=(;,+\-*/^&<>:\s])([A-Za-zÀ-ɏ][A-Za-z0-9._À-ɏ]*)$/);
    if (!m) return null;
    // Pas dans un texte entre guillemets
    if (((avant.match(/"/g) || []).length % 2) === 1) return null;
    return { mot: m[1], debut: champ.selectionStart - m[1].length };
  }

  function majAides() {
    if (!edition || !edition.texte.startsWith('=')) { fermerAides(); return; }
    const langue = Formules.getLangue();
    const m = motEnCours();
    propositions = m ? Fonctions.chercher(m.mot, langue, 10) : [];
    // Un nom déjà complet suivi de rien : on propose quand même (Tab pour ajouter la parenthèse).
    if (propositions.length) {
      choix = Math.min(choix, propositions.length - 1);
      auto.innerHTML = '';
      propositions.forEach((f, i) => {
        const item = el('div', { className: `auto-item${i === choix ? ' choisi' : ''}` },
          el('span', { className: 'auto-nom', textContent: Fonctions.nom(f, langue) }),
          el('span', { className: 'auto-desc', textContent: f.description }));
        item.onmousedown = (e) => { e.preventDefault(); choix = i; accepter(); };
        auto.append(item);
      });
      auto.append(el('div', { className: 'auto-pied', textContent: 'Tab ou Entrée pour choisir · Maj+F3 : toutes les fonctions' }));
      auto.hidden = false;
      placerSous(auto);
    } else auto.hidden = true;
    // Bulle des arguments : la fonction dans laquelle se trouve le curseur.
    const appel = appelEnCours();
    if (appel && auto.hidden) {
      const f = Fonctions.parNom(appel.nom, langue);
      if (f) {
        aideArgs.innerHTML = '';
        const sep = langue === 'en' ? ', ' : '; ';
        aideArgs.append(el('b', { textContent: Fonctions.nom(f, langue) }), '(');
        f.args.forEach((a, i) => {
          if (i) aideArgs.append(sep);
          const courant = i === Math.min(appel.argument, f.args.length - 1) || (a === '…' && appel.argument >= i);
          aideArgs.append(courant ? el('span', { className: 'arg-courant', textContent: a }) : a);
        });
        aideArgs.append(')', el('div', { className: 'aide-desc', textContent: f.description }));
        aideArgs.hidden = false;
        placerSous(aideArgs);
        return;
      }
    }
    aideArgs.hidden = true;
  }
  function fermerAides() { auto.hidden = true; aideArgs.hidden = true; propositions = []; choix = 0; }

  // La fonction ouverte la plus proche avant le curseur, et le numéro de l'argument en cours.
  function appelEnCours() {
    const champ = champActif();
    const avant = edition.texte.slice(0, champ.selectionStart);
    let profondeur = 0, argument = 0, guillemets = false;
    for (let i = avant.length - 1; i >= 0; i--) {
      const ch = avant[i];
      if (ch === '"') guillemets = !guillemets;
      if (guillemets) continue;
      if (ch === ')') profondeur++;
      else if (ch === '(') {
        if (profondeur === 0) {
          const m = avant.slice(0, i).match(/([A-Za-zÀ-ɏ][A-Za-z0-9._À-ɏ]*)\s*$/);
          return m ? { nom: m[1], argument } : null;
        }
        profondeur--;
      } else if ((ch === ';' || (ch === ',' && Formules.getLangue() === 'en')) && profondeur === 0) argument++;
    }
    return null;
  }

  function placerSous(bulle) {
    const champ = champActif();
    const r = champ.getBoundingClientRect();
    const zr = document.body.getBoundingClientRect();
    let x = r.left, y = r.bottom + 2;
    if (champ === editeur) {
      // Sous le curseur, à peu près : on mesure le texte de la ligne jusqu'au curseur.
      ctx.font = editeur.style.font;
      const ligne = edition.texte.slice(0, champ.selectionStart).split('\n').pop();
      x = Math.min(r.left + 4 + ctx.measureText(ligne).width - 30, zr.width - 380);
    }
    bulle.style.left = `${Math.max(4, x)}px`;
    bulle.style.top = `${y}px`;
    // Pas de place en dessous : au-dessus.
    const br = bulle.getBoundingClientRect();
    if (br.bottom > zr.height - 30) bulle.style.top = `${Math.max(4, r.top - br.height - 2)}px`;
  }

  function accepter() {
    const f = propositions[choix];
    const m = motEnCours();
    if (!f || !m) return;
    const nom = Fonctions.nom(f, Formules.getLangue());
    const champ = champActif();
    const apres = edition.texte.slice(champ.selectionStart);
    const parenthese = apres.startsWith('(') ? '' : '(';
    const texte = edition.texte.slice(0, m.debut) + nom + parenthese + apres;
    const curseur = m.debut + nom.length + 1;
    champ.value = texte;
    surSaisie(champ);
    champ.setSelectionRange(curseur, curseur);
    majAides();
  }

  // Insérer une fonction choisie dans la liste de toutes les fonctions.
  function insererFonction(f) {
    const nom = Fonctions.nom(f, Formules.getLangue());
    if (!edition) {
      const actuel = Classeur.texteEdition(feuille, actif.r, actif.c);
      commencer(actuel.startsWith('=') ? actuel : '=', { mode: 'edition' });
    }
    const champ = champActif();
    champ.focus();
    let pos0 = champ.selectionStart;
    const m = motEnCours();
    let debut = m ? m.debut : pos0;
    const texte = edition.texte.slice(0, debut) + nom + '(' + edition.texte.slice(champ.selectionEnd);
    champ.value = texte;
    surSaisie(champ);
    pos0 = debut + nom.length + 1;
    champ.setSelectionRange(pos0, pos0);
    majAides();
  }

  // ===============================================================================================
  // Clavier
  // ===============================================================================================
  function toucheEdition(e) {
    const champ = e.target;
    if (!auto.hidden && propositions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        choix = (choix + (e.key === 'ArrowDown' ? 1 : -1) + propositions.length) % propositions.length;
        majAides();
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.altKey && !e.ctrlKey)) { e.preventDefault(); accepter(); return; }
      if (e.key === 'Escape') { e.preventDefault(); fermerAides(); return; }
    }
    if (e.key === 'Enter' && e.altKey) {
      // Alt+Entrée : nouvelle ligne dans la cellule.
      e.preventDefault();
      const d = champ.selectionStart;
      champ.setRangeText('\n', d, champ.selectionEnd, 'end');
      surSaisie(champ);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      valider({ partout: e.ctrlKey });
      if (!e.ctrlKey) avancer(e.shiftKey ? -1 : 1, 0);
      return;
    }
    if (e.key === 'Tab') { e.preventDefault(); valider(); avancer(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Escape') { e.preventDefault(); annulerEdition(); return; }
    if (e.key === 'F4') { e.preventDefault(); basculerDollars(champ); return; }
    if (e.key === 'F2') { e.preventDefault(); edition.mode = edition.mode === 'saisie' ? 'edition' : 'saisie'; return; }
    if (e.shiftKey && e.key === 'F3') { e.preventDefault(); options.toutesLesFonctions?.(); return; }
    const fleche = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (fleche && edition.mode === 'saisie' && !e.altKey) {
      // Dans une formule, les flèches pointent une cellule ; sinon, elles valident et déplacent.
      if (pointInsertion()) {
        e.preventDefault();
        const base = pointage ? (e.shiftKey ? pointage.plage : { r1: pointage.ancre.r, c1: pointage.ancre.c, r2: pointage.ancre.r, c2: pointage.ancre.c }) : { r1: edition.r, c1: edition.c, r2: edition.r, c2: edition.c };
        if (e.shiftKey && pointage) {
          const p = { ...base };
          p.r2 = Math.max(0, p.r2 + fleche[0]);
          p.c2 = Math.max(0, p.c2 + fleche[1]);
          pointer(normaliser({ r1: pointage.ancre.r, c1: pointage.ancre.c, r2: p.r2, c2: p.c2 }), pointage.ancre);
        } else {
          const r = Math.max(0, base.r1 + fleche[0]), c = Math.max(0, base.c1 + fleche[1]);
          pointer({ r1: r, c1: c, r2: r, c2: c }, { r, c });
          rendreVisible(r, c);
        }
        return;
      }
      if (!edition.texte.startsWith('=')) {
        e.preventDefault();
        valider();
        deplacer(...fleche);
      }
    }
  }
  editeur.addEventListener('keydown', toucheEdition);
  barre.addEventListener('keydown', (e) => {
    if (!edition && e.key === 'Enter') { e.preventDefault(); return; }
    if (edition) toucheEdition(e);
  });
  for (const champ of [editeur, barre]) champ.addEventListener('keyup', (e) => { if (edition && !['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) majAides(); });

  // F4 : A1 → $A$1 → A$1 → $A1 → A1 (sur la référence où se trouve le curseur).
  function basculerDollars(champ) {
    const t = edition.texte;
    const p = champ.selectionStart;
    const re = /\$?[A-Za-z]{1,3}\$?\d{1,7}/g;
    let m;
    while ((m = re.exec(t))) {
      if (p >= m.index && p <= m.index + m[0].length) {
        const brut0 = m[0].replace(/\$/g, '');
        const [, col, lig] = brut0.match(/([A-Za-z]+)(\d+)/);
        const etats = [`${col}${lig}`, `$${col}$${lig}`, `${col}$${lig}`, `$${col}${lig}`];
        const i = etats.indexOf(m[0]);
        const suivant = etats[(i + 1) % 4];
        champ.value = t.slice(0, m.index) + suivant + t.slice(m.index + m[0].length);
        surSaisie(champ);
        const fin = m.index + suivant.length;
        champ.setSelectionRange(fin, fin);
        return;
      }
    }
  }

  defil.addEventListener('keydown', (e) => {
    if (edition) return;
    if (options.raccourci?.(e)) { e.preventDefault(); return; }
    const fleche = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (fleche) { e.preventDefault(); deplacer(...fleche, { etendre: e.shiftKey, saut: e.ctrlKey }); return; }
    const page = Math.max(1, Math.floor((H() - origineY()) / (Classeur.HAUTEUR * zoom)) - 1);
    switch (e.key) {
      case 'Enter': e.preventDefault(); avancer(e.shiftKey ? -1 : 1, 0); return;
      case 'Tab': e.preventDefault(); avancer(0, e.shiftKey ? -1 : 1); return;
      case 'PageDown': e.preventDefault(); deplacer(page, 0, { etendre: e.shiftKey }); return;
      case 'PageUp': e.preventDefault(); deplacer(-page, 0, { etendre: e.shiftKey }); return;
      case 'Home':
        e.preventDefault();
        if (e.ctrlKey) allerA(figees().lignes, figees().colonnes);
        else if (e.shiftKey) selectionner({ r1: actif.r, c1: actif.c, r2: actif.r, c2: 0 }, actif);
        else allerA(actif.r, 0);
        return;
      case 'End':
        if (e.ctrlKey) { e.preventDefault(); const { width, height } = Classeur.dimensions(feuille); allerA(Math.max(0, height - 1), Math.max(0, width - 1)); }
        return;
      case 'F2': e.preventDefault(); commencer(null, { mode: 'edition' }); return;
      case 'Delete': e.preventDefault(); options.effacer?.(); return;
      case 'Backspace': e.preventDefault(); commencer('', { mode: 'saisie' }); return;
      case 'Escape': if (Classeur.copieEnCours()) { Classeur.oublierCopie(); redessiner(); } return;
      default:
    }
    if (e.key === ' ' && e.ctrlKey) { e.preventDefault(); selectionner({ r1: 0, c1: plage.c1, r2: MAX_LIGNES - 1, c2: plage.c2 }, actif, { defiler: false }); return; }
    if (e.key === ' ' && e.shiftKey) { e.preventDefault(); selectionner({ r1: plage.r1, c1: 0, r2: plage.r2, c2: MAX_COLONNES - 1 }, actif, { defiler: false }); return; }
    // Un caractère tapé : on commence à écrire dans la cellule (à la place de son contenu).
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      commencer(e.key, { mode: 'saisie' });
    }
  });
  // Les touches mortes et l'IME (^ puis e → ê) passent par l'événement « input » : on les rattrape.
  defil.addEventListener('compositionstart', () => { if (!edition) commencer('', { mode: 'saisie' }); });

  // ===============================================================================================
  // Souris
  // ===============================================================================================
  let glisse = null; // { type: 'selection' | 'colonnes' | 'lignes' | 'taille-col' | 'taille-ligne' | 'recopie' | 'pointage', … }

  function cible(e) {
    const r = zone.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const z = zoom;
    if (y < ENTETE_H * z && x < largeurEntete) return { zone: 'coin', x, y };
    if (y < ENTETE_H * z) {
      const c = colonneA(x);
      const bordDroit = ecranX(c + 1);
      if (Math.abs(x - bordDroit) <= 4) return { zone: 'bord-col', c, x, y };
      if (c > 0 && Math.abs(x - ecranX(c)) <= 4) return { zone: 'bord-col', c: c - 1, x, y };
      return { zone: 'col', c, x, y };
    }
    if (x < largeurEntete) {
      const rr = ligneA(y);
      if (Math.abs(y - ecranY(rr + 1)) <= 3) return { zone: 'bord-ligne', r: rr, x, y };
      if (rr > 0 && Math.abs(y - ecranY(rr)) <= 3) return { zone: 'bord-ligne', r: rr - 1, x, y };
      return { zone: 'ligne', r: rr, x, y };
    }
    const rr = ligneA(y), c = colonneA(x);
    const p = etendreAuxFusions(plage);
    const pr = rect(0, 0, p);
    if (!edition && !colonnesOuLignesEntieres(p) && Math.abs(x - (pr.x + pr.w)) <= 5 && Math.abs(y - (pr.y + pr.h)) <= 5) return { zone: 'poignee', r: rr, c, x, y };
    const m = Classeur.meta(feuille);
    if (m.filtre && rr === m.filtre.plage.r1 && c >= m.filtre.plage.c1 && c <= m.filtre.plage.c2) {
      const b = boutonFiltre(rect(rr, c));
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { zone: 'filtre', r: rr, c, x, y };
    }
    return { zone: 'cellule', r: rr, c, x, y };
  }

  defil.addEventListener('mousemove', (e) => {
    if (glisse || !axes) return;
    const t = cible(e);
    defil.style.cursor = { 'bord-col': 'col-resize', 'bord-ligne': 'row-resize', poignee: 'crosshair', col: 's-resize', ligne: 'e-resize', filtre: 'pointer' }[t.zone] || (t.zone === 'cellule' && (e.ctrlKey && Classeur.style(feuille, t.r, t.c)?.lien) ? 'pointer' : 'cell');
  });

  defil.addEventListener('mousedown', (e) => {
    if (!axes) return;
    if (e.button !== 0) {
      if (e.button === 2 && !edition) {
        const t = cible(e);
        // Clic droit hors de la sélection : on sélectionne d'abord la cellule (ou la colonne / ligne).
        if (t.zone === 'cellule' && !dansPlage(plage, t.r, t.c)) allerA(t.r, t.c);
        if (t.zone === 'col' && !(plage.r1 === 0 && plage.r2 === MAX_LIGNES - 1 && t.c >= plage.c1 && t.c <= plage.c2)) selectionner({ r1: 0, c1: t.c, r2: MAX_LIGNES - 1, c2: t.c }, { r: Math.max(figees().lignes, 0), c: t.c }, { defiler: false });
        if (t.zone === 'ligne' && !(plage.c1 === 0 && plage.c2 === MAX_COLONNES - 1 && t.r >= plage.r1 && t.r <= plage.r2)) selectionner({ r1: t.r, c1: 0, r2: t.r, c2: MAX_COLONNES - 1 }, { r: t.r, c: 0 }, { defiler: false });
      }
      return;
    }
    const t = cible(e);
    // Pendant une formule : un clic sur une cellule insère sa référence.
    if (edition && (t.zone === 'cellule' || t.zone === 'col' || t.zone === 'ligne') && (pointInsertion() || pointage)) {
      e.preventDefault();
      const p = t.zone === 'col' ? { r1: 0, c1: t.c, r2: MAX_LIGNES - 1, c2: t.c } : t.zone === 'ligne' ? { r1: t.r, c1: 0, r2: t.r, c2: MAX_COLONNES - 1 } : { r1: t.r, c1: t.c, r2: t.r, c2: t.c };
      if (e.shiftKey && pointage) pointer(normaliser({ r1: pointage.ancre.r, c1: pointage.ancre.c, r2: p.r2, c2: p.c2 }), pointage.ancre);
      else pointer(p, { r: p.r1, c: p.c1 });
      glisse = { type: 'pointage', ancre: { r: p.r1, c: p.c1 }, zone: t.zone };
      setTimeout(() => champActif().focus(), 0);
      return;
    }
    if (edition) valider();
    e.preventDefault();
    defil.focus({ preventScroll: true });
    switch (t.zone) {
      case 'coin': selectionner({ r1: 0, c1: 0, r2: MAX_LIGNES - 1, c2: MAX_COLONNES - 1 }, { r: 0, c: 0 }, { defiler: false }); return;
      case 'bord-col': glisse = { type: 'taille-col', c: t.c, depart: e.clientX, avant: taille('c', t.c) }; return;
      case 'bord-ligne': glisse = { type: 'taille-ligne', r: t.r, depart: e.clientY, avant: taille('r', t.r) }; return;
      case 'col': {
        const c0 = e.shiftKey ? actif.c : t.c;
        selectionner({ r1: 0, c1: c0, r2: MAX_LIGNES - 1, c2: t.c }, { r: e.shiftKey ? actif.r : figees().lignes, c: c0 }, { defiler: false });
        glisse = { type: 'colonnes', ancre: c0 };
        return;
      }
      case 'ligne': {
        const r0 = e.shiftKey ? actif.r : t.r;
        selectionner({ r1: r0, c1: 0, r2: t.r, c2: MAX_COLONNES - 1 }, { r: r0, c: e.shiftKey ? actif.c : figees().colonnes }, { defiler: false });
        glisse = { type: 'lignes', ancre: r0 };
        return;
      }
      case 'poignee': glisse = { type: 'recopie', source: etendreAuxFusions(plage), cible: null }; return;
      case 'filtre': options.ouvrirFiltre?.(t.c, rect(t.r, t.c)); return;
      default:
    }
    // Ctrl+clic sur un lien : on l'ouvre dans le navigateur.
    const s = Classeur.style(feuille, t.r, t.c);
    if (e.ctrlKey && s?.lien) { window.open(s.lien, '_blank'); return; }
    if (e.shiftKey) selectionner({ r1: actif.r, c1: actif.c, r2: t.r, c2: t.c }, actif, { defiler: false });
    else {
      const f = Classeur.fusionDe(feuille, t.r, t.c);
      allerA(f ? f.r1 : t.r, f ? f.c1 : t.c);
    }
    glisse = { type: 'selection' };
    if (e.detail === 2 && !e.shiftKey) { glisse = null; commencer(null, { mode: 'edition' }); }
  });

  let defilementAuto = null;
  window.addEventListener('mousemove', (e) => {
    if (!glisse) return;
    const r = zone.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // Défilement tout seul quand on glisse au bord.
    clearInterval(defilementAuto);
    const dx = x > r.width - 10 ? 30 : x < largeurEntete && glisse.type !== 'lignes' && glisse.type !== 'taille-col' ? -30 : 0;
    const dy = y > r.height - 10 ? 30 : y < ENTETE_H * zoom && glisse.type !== 'colonnes' && glisse.type !== 'taille-ligne' ? -30 : 0;
    if ((dx || dy) && !glisse.type.startsWith('taille')) {
      defilementAuto = setInterval(() => { defil.scrollLeft += dx; defil.scrollTop += dy; majEspace(); }, 40);
    }
    const rr = ligneA(Math.max(ENTETE_H * zoom + 1, Math.min(r.height - 1, y)));
    const c = colonneA(Math.max(largeurEntete + 1, Math.min(r.width - 1, x)));
    switch (glisse.type) {
      case 'selection': selectionner({ r1: actif.r, c1: actif.c, r2: rr, c2: c }, actif, { defiler: false }); break;
      case 'colonnes': selectionner({ r1: 0, c1: glisse.ancre, r2: MAX_LIGNES - 1, c2: c }, actif, { defiler: false }); break;
      case 'lignes': selectionner({ r1: glisse.ancre, c1: 0, r2: rr, c2: MAX_COLONNES - 1 }, actif, { defiler: false }); break;
      case 'taille-col': glisse.nouvelle = Math.max(4, glisse.avant + (e.clientX - glisse.depart) / zoom); apercuTaille('c', glisse.c, glisse.nouvelle); break;
      case 'taille-ligne': glisse.nouvelle = Math.max(6, glisse.avant + (e.clientY - glisse.depart) / zoom); apercuTaille('r', glisse.r, glisse.nouvelle); break;
      case 'pointage': {
        const p = glisse.zone === 'col' ? { r1: 0, c1: glisse.ancre.c, r2: MAX_LIGNES - 1, c2: c } : glisse.zone === 'ligne' ? { r1: glisse.ancre.r, c1: 0, r2: rr, c2: MAX_COLONNES - 1 } : { r1: glisse.ancre.r, c1: glisse.ancre.c, r2: rr, c2: c };
        pointer(normaliser(p), glisse.ancre);
        break;
      }
      case 'recopie': {
        const s = glisse.source;
        // On recopie dans le sens où la souris s'éloigne le plus de la plage.
        const versBas = rr > s.r2 ? rr - s.r2 : 0, versHaut = rr < s.r1 ? s.r1 - rr : 0;
        const versDroite = c > s.c2 ? c - s.c2 : 0, versGauche = c < s.c1 ? s.c1 - c : 0;
        const vertical = Math.max(versBas, versHaut) * (taille('r', rr) || 1) >= Math.max(versDroite, versGauche) * (taille('c', c) || 1);
        if (vertical && versBas) glisse.cible = { r1: s.r2 + 1, c1: s.c1, r2: rr, c2: s.c2 };
        else if (vertical && versHaut) glisse.cible = { r1: rr, c1: s.c1, r2: s.r1 - 1, c2: s.c2 };
        else if (versDroite) glisse.cible = { r1: s.r1, c1: s.c2 + 1, r2: s.r2, c2: c };
        else if (versGauche) glisse.cible = { r1: s.r1, c1: c, r2: s.r2, c2: s.c1 - 1 };
        else glisse.cible = null;
        redessiner();
        break;
      }
      default:
    }
  });
  window.addEventListener('mouseup', (e) => {
    clearInterval(defilementAuto);
    if (!glisse) return;
    const g = glisse;
    glisse = null;
    if (g.type === 'taille-col' && g.nouvelle) {
      const cols = plage.r1 === 0 && plage.r2 === MAX_LIGNES - 1 && g.c >= plage.c1 && g.c <= plage.c2 ? [plage.c1, plage.c2] : [g.c, g.c];
      Classeur.changerLargeurs(feuille, cols[0], cols[1], g.nouvelle);
    }
    if (g.type === 'taille-ligne' && g.nouvelle) {
      const lignes = plage.c1 === 0 && plage.c2 === MAX_COLONNES - 1 && g.r >= plage.r1 && g.r <= plage.r2 ? [plage.r1, plage.r2] : [g.r, g.r];
      Classeur.changerHauteurs(feuille, lignes[0], lignes[1], g.nouvelle);
    }
    if (g.type === 'recopie' && g.cible) {
      try {
        // Ctrl pendant la recopie : on recopie sans prolonger la suite (et inversement pour un nombre seul).
        Classeur.recopier(feuille, g.source, g.cible, { serie: !e.ctrlKey });
        selectionner({ r1: Math.min(g.source.r1, g.cible.r1), c1: Math.min(g.source.c1, g.cible.c1), r2: Math.max(g.source.r2, g.cible.r2), c2: Math.max(g.source.c2, g.cible.c2) }, actif, { defiler: false });
      } catch (err) { notify(`Recopie impossible : ${cleanError(err)}`, 'error'); }
    }
    if (g.type === 'pointage') champActif().focus();
    redessiner();
  });
  // Double-clic sur le bord d'une colonne : largeur ajustée au contenu ; sur la poignée : recopie jusqu'en bas.
  defil.addEventListener('dblclick', (e) => {
    const t = cible(e);
    if (t.zone === 'bord-col') {
      const cols = plage.r1 === 0 && plage.r2 === MAX_LIGNES - 1 && t.c >= plage.c1 && t.c <= plage.c2 ? range(plage.c1, plage.c2) : [t.c];
      ajusterColonnes(cols);
    } else if (t.zone === 'bord-ligne') {
      Classeur.changerHauteurs(feuille, t.r, t.r, null);
    }
  });

  // Largeur ajustée au plus long texte de la colonne.
  function ajusterColonnes(cols) {
    const { height } = Classeur.dimensions(feuille);
    Classeur.faire('ajuster la largeur', {
      feuilles: [feuille],
      meta: () => {
        const m = Classeur.meta(feuille);
        for (const c of cols) {
          let max = 0;
          for (let r = 0; r < Math.min(height, 20000); r++) {
            const t = Classeur.texte(feuille, r, c);
            if (!t || Classeur.fusionDe(feuille, r, c)) continue;
            const s = Classeur.style(feuille, r, c);
            ctx.font = policeDe(s).replace(/[\d.]+px/, `${(s?.taille || 11) * 4 / 3}px`);
            // Sur la ligne des titres d'un filtre, on garde la place du bouton.
            const bouton = m.filtre && r === m.filtre.plage.r1 && c >= m.filtre.plage.c1 && c <= m.filtre.plage.c2 ? 20 : 0;
            max = Math.max(max, ...t.split('\n').map((l) => ctx.measureText(l).width + bouton));
          }
          if (max) m.largeurs.set(c, Math.ceil(Math.min(600, max + 14))); else m.largeurs.delete(c);
        }
      },
    });
  }

  function apercuTaille(a, i, px) {
    // Aperçu pendant le glissement (sans toucher au classeur) : on change l'axe en mémoire.
    const ax = axes[a];
    const old = ax.ecarts.get(i) || 0;
    const ecart = px - ax.defaut;
    if (old === ecart) return;
    ax.ecarts.set(i, ecart);
    const idx = ax.pts.indexOf(i);
    if (idx < 0) { ax.pts.push(i); ax.pts.sort((x, y) => x - y); }
    let s = 0;
    ax.cum = ax.pts.map((p) => (s += ax.ecarts.get(p)));
    majEspace();
    redessiner();
  }

  // Molette : défilement normal ; Ctrl+molette : zoom.
  zone.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    options.zoomer?.(e.deltaY < 0 ? 10 : -10);
  }, { passive: false });

  defil.addEventListener('scroll', () => { majEspace(); redessiner(); });
  new ResizeObserver(() => { majEspace(); redessiner(); }).observe(zone);

  // ===============================================================================================
  // Feuille affichée
  // ===============================================================================================
  function afficherFeuille(id) {
    if (feuille !== null && Classeur.feuilles().some((f) => f.id === feuille)) vues.set(feuille, { x: defil.scrollLeft, y: defil.scrollTop, actif: { ...actif }, plage: { ...plage } });
    feuille = id;
    construireAxes();
    const v = vues.get(id);
    etendue = { r: 100, c: 30 };
    actif = v?.actif || { r: 0, c: 0 };
    plage = v?.plage || { r1: 0, c1: 0, r2: 0, c2: 0 };
    majEspace();
    defil.scrollLeft = v?.x || 0;
    defil.scrollTop = v?.y || 0;
    majBarre();
    redessiner();
  }

  // Le classeur a changé (saisie, annulation, mise en forme…)
  Classeur.ecouter((evt) => {
    if (feuille === null) return;
    if (evt.type === 'charge') { vues.clear(); feuille = null; return; }
    if (!Classeur.feuilles().some((f) => f.id === feuille)) return;
    construireAxes();
    majEspace();
    if (!edition) majBarre();
    redessiner();
  });

  function init(opts) {
    options = opts;
    lireCouleurs();
  }

  return {
    init,
    afficherFeuille,
    feuille: () => feuille,
    selection: () => ({ actif: { ...actif }, plage: { ...plage } }),
    selectionner,
    allerA,
    redessiner,
    lireCouleurs: () => { lireCouleurs(); redessiner(); },
    setOptions: (o) => { Object.assign(options, o); redessiner(); },
    setZoom: (z) => { zoom = z; construireAxes(); majEspace(); redessiner(); },
    enEdition: () => Boolean(edition),
    editionFormule: () => Boolean(edition?.texte.startsWith('=')),
    commencer,
    valider,
    annulerEdition,
    insererFonction,
    ajusterColonnes,
    focus: () => (edition ? champActif() : defil).focus({ preventScroll: true }),
    canvas: () => canvas,
    zoom: () => zoom,
    // Le coin des cellules (sous les lettres, à droite des numéros), en pixels de la grille.
    zoneCellules: () => ({ x: largeurEntete, y: ENTETE_H * zoom }),
    // La cellule sous un point de la grille, et le décalage dans la cellule (en pixels à 100 %).
    celluleA: (x, y) => { const c = colonneA(x), r = ligneA(y); return { r, c, dx: (x - ecranX(c)) / zoom, dy: (y - ecranY(r)) / zoom }; },
    rectCellule: (r, c) => rect(r, c),
  };
})();
