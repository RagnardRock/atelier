// Tafl 0.26 : copier, couper et coller un morceau de carte, d'une carte à l'autre.
// L'outil Sélection (R) trace un rectangle ; Ctrl+C le copie, Ctrl+X le coupe, Ctrl+V colle le
// morceau qui suit alors la souris jusqu'au clic (Échap annule). Glisser l'intérieur de la sélection
// la déplace.
//
// Ce qu'on emporte se règle dans la barre d'options de l'outil :
// - le calque choisi, ou tous les calques (collés sur les calques de même nom, sinon de même rang) ;
// - en plus, si on veut : le passage peint, les zones, les événements et les téléporteurs.
// Les cases vides du morceau ne recouvrent rien : on peut coller un arbre sur de l'herbe.
//
// Le morceau garde les numéros de tuiles : il se colle dans le même jeu (n'importe quelle carte),
// pas dans un autre jeu de tuiles, où les numéros ne voudraient plus rien dire.

const PressePapiers = (() => {
  let clip = null;

  // Les calques concernés : tous, ou celui choisi (aucun si c'est la ligne Passage qui est choisie).
  const calquesDe = (map, opts) => (opts.calques === 'tous' ? map.layers.map((_, i) => i) : opts.layer >= 0 ? [opts.layer] : []);
  const dedans = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  // Le passage vient avec le morceau si on l'a demandé, ou si c'est la ligne Passage qui est choisie.
  const avecPassage = (opts) => opts.passage || (opts.calques !== 'tous' && opts.layer < 0);

  // Le morceau d'un rectangle de la carte (sans le garder : voir copier).
  function prendre(doc, map, r, opts) {
    const couches = calquesDe(map, opts).map((li) => {
      const l = map.layers[li], cells = new Int32Array(r.w * r.h);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) cells[y * r.w + x] = l.cells[(r.y + y) * map.width + r.x + x];
      return { nom: l.name, rang: li, cells };
    });
    let passage = null;
    if (avecPassage(opts)) {
      passage = new Uint8Array(r.w * r.h);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) passage[y * r.w + x] = map.passage[(r.y + y) * map.width + r.x + x];
    }
    // Les zones qui touchent le rectangle, recoupées à ses bords ; les objets posés dedans.
    const zones = opts.zones ? map.zones.flatMap((z) => {
      const x0 = Math.max(z.x, r.x), y0 = Math.max(z.y, r.y), x1 = Math.min(z.x + z.w, r.x + r.w), y1 = Math.min(z.y + z.h, r.y + r.h);
      return x1 > x0 && y1 > y0 ? [{ ...structuredClone(z), x: x0 - r.x, y: y0 - r.y, w: x1 - x0, h: y1 - y0 }] : [];
    }) : [];
    const pris = (o) => dedans(r, o.x, o.y);
    const warps = opts.evenements ? map.warps.filter(pris).map((w) => ({ ...structuredClone(w), x: w.x - r.x, y: w.y - r.y })) : [];
    const events = opts.evenements ? map.events.filter(pris).map((e) => ({ ...structuredClone(e), x: e.x - r.x, y: e.y - r.y })) : [];
    return { doc, carte: map.name, w: r.w, h: r.h, tous: opts.calques === 'tous', couches, passage, zones, warps, events };
  }
  // Le garder pour Ctrl+V.
  function copier(doc, map, r, opts) {
    clip = prendre(doc, map, r, opts);
    return clip;
  }

  // Vider le rectangle de ce qui serait copié (couper, Suppr, déplacer). À faire dans une action (Doc.begin).
  function vider(doc, map, r, opts) {
    for (const li of calquesDe(map, opts)) {
      const cells = Doc.layerForEdit(doc, li, map).cells;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells[y * map.width + x] = -1;
    }
    if (avecPassage(opts)) {
      const p = Doc.passageForEdit(doc, map);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) p[y * map.width + x] = 0;
    }
    if (opts.zones) {
      // Une zone tout entière dans le rectangle part ; une zone qui déborde reste (on ne la coupe pas en morceaux).
      map.zones = map.zones.filter((z) => !(z.x >= r.x && z.y >= r.y && z.x + z.w <= r.x + r.w && z.y + z.h <= r.y + r.h));
    }
    if (opts.evenements) {
      map.warps = map.warps.filter((w) => !dedans(r, w.x, w.y));
      map.events = map.events.filter((e) => !dedans(r, e.x, e.y));
    }
  }

  // Le calque de la carte où va une couche du morceau : celui choisi (morceau d'un seul calque),
  // sinon celui de même nom, sinon celui de même rang.
  function cible(map, c, couche, opts) {
    if (!c.tous) return opts.layer;
    const parNom = map.layers.findIndex((l) => l.name === couche.nom);
    if (parNom >= 0) return parNom;
    return couche.rang < map.layers.length ? couche.rang : -1;
  }

  // Coller le morceau, son coin en haut à gauche sur la case (x, y). À faire dans une action (Doc.begin).
  // Rend ce qui a été posé, et les calques qui n'ont pas trouvé de place.
  function coller(doc, map, x0, y0, opts, c = clip) {
    const bilan = { cases: 0, perdus: [], objets: 0 };
    if (!c) return bilan;
    const sur = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height;
    for (const couche of c.couches) {
      const li = cible(map, c, couche, opts);
      if (li < 0) { bilan.perdus.push(couche.nom); continue; }
      const cells = Doc.layerForEdit(doc, li, map).cells;
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const t = couche.cells[y * c.w + x];
          if (t < 0 || t >= doc.tiles.length || !sur(x0 + x, y0 + y)) continue;
          cells[(y0 + y) * map.width + x0 + x] = t;
          bilan.cases++;
        }
      }
    }
    if (c.passage) {
      const p = Doc.passageForEdit(doc, map);
      for (let y = 0; y < c.h; y++) {
        for (let x = 0; x < c.w; x++) {
          const v = c.passage[y * c.w + x];
          if (v && sur(x0 + x, y0 + y)) { p[(y0 + y) * map.width + x0 + x] = v; bilan.cases++; }
        }
      }
    }
    const idZone = (list) => { let n = list.length + 1; while (list.some((o) => o.id === `zone-${n}`)) n++; return `zone-${n}`; };
    for (const z of c.zones) {
      const x = Math.max(0, x0 + z.x), y = Math.max(0, y0 + z.y);
      const w = Math.min(map.width, x0 + z.x + z.w) - x, h = Math.min(map.height, y0 + z.y + z.h) - y;
      if (w <= 0 || h <= 0) continue;
      map.zones = [...map.zones, { ...structuredClone(z), id: idZone(map.zones), x, y, w, h }];
      bilan.objets++;
    }
    // Un événement ou un téléporteur collé remplace celui qui était déjà sur la case.
    const idTp = (list) => { let n = list.length + 1; while (list.some((o) => o.id === `tp-${n}`)) n++; return `tp-${n}`; };
    for (const w of c.warps) {
      const x = x0 + w.x, y = y0 + w.y;
      if (!sur(x, y)) continue;
      const reste = map.warps.filter((o) => o.x !== x || o.y !== y);
      map.warps = [...reste, { ...structuredClone(w), id: idTp(reste), x, y }];
      bilan.objets++;
    }
    for (const e of c.events) {
      const x = x0 + e.x, y = y0 + e.y;
      if (!sur(x, y)) continue;
      const reste = map.events.filter((o) => o.x !== x || o.y !== y);
      map.events = [...reste, { ...structuredClone(e), id: Events.nextId('ev', reste), x, y }];
      bilan.objets++;
    }
    return bilan;
  }

  return {
    prendre, copier, vider, coller, cible,
    get clip() { return clip; },
    // Le morceau ne se colle que dans le jeu d'où il vient.
    pourDoc: (doc) => (clip && clip.doc === doc ? clip : null),
    oublier: () => { clip = null; },
  };
})();
