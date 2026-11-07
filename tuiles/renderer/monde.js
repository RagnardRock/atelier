// La carte monde (Tafl 0.11) : toutes les cartes extérieures du jeu (villes, routes…) posées
// ensemble, comme vues d'avion. Les intérieurs (maisons, grottes…) n'y sont pas.
//
// Chaque carte extérieure a une place { x, y } sur la carte monde, en cases (map.monde). Une carte
// sans place est posée toute seule à partir des téléporteurs : une route dont le bord droit mène au
// bord gauche d'une ville se pose juste à gauche de cette ville, alignée sur le passage. Un bâtiment
// de passage (un intérieur relié à deux extérieurs, comme les postes entre deux routes de Pokémon)
// compte aussi comme un lien. Ensuite, Ragna glisse les cartes où il veut ; le moteur pourra s'en
// servir (raccords entre cartes voisines, écran « carte de la région »).

const Monde = (() => {
  const COTES = ['droite', 'gauche', 'bas', 'haut'];
  const ICONES = { soin: '✚', boutique: '◆', quete: '!', etoile: '★', maison: '⌂', grotte: '▲', danger: '✕', point: '●' };

  // De quel côté de A se trouve B, d'après un téléporteur w de A (vers la case tx, ty de B).
  function cote(A, w, B) {
    const bords = [];
    if (w.x === A.width - 1) bords.push('droite');
    if (w.x === 0) bords.push('gauche');
    if (w.y === A.height - 1) bords.push('bas');
    if (w.y === 0) bords.push('haut');
    if (bords.length === 1) return bords[0];
    // Sinon, d'après le bord de B où arrive le joueur (arriver sur le bord gauche de B = venir de la gauche).
    const arrivee = [];
    if (w.tx <= 1) arrivee.push('droite');
    if (w.tx >= B.width - 2) arrivee.push('gauche');
    if (w.ty <= 1) arrivee.push('bas');
    if (w.ty >= B.height - 2) arrivee.push('haut');
    const commun = arrivee.filter((c) => !bords.length || bords.includes(c));
    if (commun.length === 1) return commun[0];
    // Enfin, d'après le sens du joueur à l'arrivée (il marche vers la droite : B est à droite).
    return COTES.includes(w.direction) ? w.direction : 'droite';
  }
  // Où poser B par rapport à A (en cases), pour que la case (ax, ay) de A touche la case (bx, by) de B.
  function decalage(A, B, sens, ax, ay, bx, by) {
    if (sens === 'droite') return { x: A.width, y: ay - by };
    if (sens === 'gauche') return { x: -B.width, y: ay - by };
    if (sens === 'bas') return { x: ax - bx, y: A.height };
    return { x: ax - bx, y: -B.height };
  }
  const OPPOSE = { droite: 'gauche', gauche: 'droite', bas: 'haut', haut: 'bas' };

  // Les liens entre cartes extérieures : [{ a, b, dx, dy }] = poser b à (a.x + dx, a.y + dy).
  function liens(doc, exterieures, estInterieure) {
    const ext = new Set(exterieures.map((m) => m.id));
    const out = [];
    for (const A of exterieures) {
      for (const w of A.warps) {
        const B = Doc.mapById(doc, w.carte);
        if (!B || B === A) continue;
        if (ext.has(B.id)) {
          const sens = cote(A, w, B);
          const d = decalage(A, B, sens, w.x, w.y, w.tx, w.ty);
          out.push({ a: A.id, b: B.id, dx: d.x, dy: d.y });
          out.push({ a: B.id, b: A.id, dx: -d.x, dy: -d.y });
        } else if (estInterieure(B)) {
          // Un bâtiment de passage : A → intérieur → C. C se pose contre A, du côté où l'on marche en arrivant.
          for (const w2 of B.warps) {
            const C = Doc.mapById(doc, w2.carte);
            if (!C || C === A || C === B || !ext.has(C.id)) continue;
            const sens = COTES.includes(w2.direction) ? w2.direction : cote(A, w, C);
            const d = decalage(A, C, sens, w.x, w.y, w2.tx, w2.ty);
            out.push({ a: A.id, b: C.id, dx: d.x, dy: d.y });
            out.push({ a: C.id, b: A.id, dx: -d.x, dy: -d.y });
          }
        }
      }
    }
    return out;
  }

  const chevauche = (p, A, q, B) => p.x < q.x + B.width && q.x < p.x + A.width && p.y < q.y + B.height && q.y < p.y + A.height;

  // Place les cartes qui n'ont pas encore de place (pos : Map id → { x, y }, complétée sur place).
  function placer(doc, exterieures, pos, estInterieure = (m) => m.interieur) {
    const parId = new Map(exterieures.map((m) => [m.id, m]));
    const tous = liens(doc, exterieures, estInterieure);
    const libre = (m, p) => ![...pos].some(([id, q]) => id !== m.id && parId.has(id) && chevauche(p, m, q, parId.get(id)));
    const poser = (m, p, pas) => {
      // Si la place est prise, on s'éloigne case par case dans le même sens.
      for (let k = 0; k < 400 && !libre(m, p); k++) p = { x: p.x + pas.x, y: p.y + pas.y };
      pos.set(m.id, p);
    };
    const file = exterieures.filter((m) => pos.has(m.id)).map((m) => m.id);
    const reste = () => exterieures.filter((m) => !pos.has(m.id));
    while (reste().length) {
      if (!file.length) {
        // Un nouveau morceau du monde (sans lien avec le reste) : à droite de ce qui est déjà posé.
        const depart = reste().find((m) => m.id === doc.depart?.carte) || reste()[0];
        let p = { x: 0, y: 0 };
        if (pos.size) {
          let maxX = -Infinity, minY = Infinity;
          for (const [id, q] of pos) {
            const m = parId.get(id);
            if (!m) continue;
            maxX = Math.max(maxX, q.x + m.width);
            minY = Math.min(minY, q.y);
          }
          if (maxX > -Infinity) p = { x: maxX + 4, y: minY };
        }
        poser(depart, p, { x: 1, y: 0 });
        file.push(depart.id);
      }
      while (file.length) {
        const a = file.shift();
        const pa = pos.get(a);
        for (const l of tous) {
          if (l.a !== a || pos.has(l.b)) continue;
          const B = parId.get(l.b);
          poser(B, { x: pa.x + l.dx, y: pa.y + l.dy }, { x: Math.sign(l.dx) || 0, y: l.dx ? 0 : Math.sign(l.dy) || 1 });
          file.push(l.b);
        }
      }
    }
    return pos;
  }

  // Les places de toutes les cartes extérieures, celles qui n'en ont pas encore étant calculées.
  function positions(doc) {
    const exterieures = doc.maps.filter((m) => !m.interieur);
    return placer(doc, exterieures, new Map(exterieures.filter((m) => m.monde).map((m) => [m.id, { ...m.monde }])));
  }
  // Toute la carte monde en une image, à la taille réelle des tuiles (pos : les cartes à y mettre ;
  // images : les cartes déjà dessinées par la fenêtre, sinon on les dessine).
  function dessin(doc, pos = positions(doc), images = null) {
    const s = doc.tileSize;
    const maps = doc.maps.filter((m) => pos.has(m.id));
    if (!maps.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const m of maps) {
      const p = pos.get(m.id);
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + m.width); y1 = Math.max(y1, p.y + m.height);
    }
    const c = el('canvas', { width: (x1 - x0) * s, height: (y1 - y0) * s });
    const g = c.getContext('2d');
    const tuiles = images ? null : doc.tiles.map((t) => Doc.tileCanvas(t, s));
    for (const m of maps) g.drawImage(images ? images(m) : IO.mapCanvas(doc, 1, m, tuiles), (pos.get(m.id).x - x0) * s, (pos.get(m.id).y - y0) * s);
    return { canvas: c, x0, y0 };
  }

  // --- La fenêtre ---
  // Renvoie { ouvrir: numéro } si Ragna a double-cliqué une carte pour l'ouvrir, sinon null.
  function open(doc) {
    if (Events.isOpen()) return Promise.resolve(null);
    return new Promise((resolve) => {
      const s = doc.tileSize;
      const interieur = new Map(doc.maps.map((m) => [m.id, Boolean(m.interieur)]));
      const pos = new Map(doc.maps.filter((m) => m.monde).map((m) => [m.id, { ...m.monde }]));
      const exterieures = () => doc.maps.filter((m) => !interieur.get(m.id));
      const estInterieure = (m) => interieur.get(m.id);
      const completer = () => placer(doc, exterieures(), pos, estInterieure);
      const avantBrut = JSON.stringify([...interieur, ...pos]);
      completer();
      // Tafl 1.27 (Saga 1.26) : la carte du monde en jeu (panneau « Carte en jeu »), avec ses repères.
      const cm = structuredClone(doc.data.reglages?.carte_monde || Donnees.normCarteMonde({}));
      const avantCm = JSON.stringify(cm);
      const avantPlace = JSON.stringify([...interieur, ...pos]);
      const avant = JSON.stringify([...JSON.parse(avantBrut), cm]); // même forme que etat()
      let onglet = 'cartes', apercu = false, poser = false, repereChoisi = null;

      const w = Events.fenetre({ titre: 'Carte monde', icone: 'globe', largeur: 1600 });
      w.card.classList.add('world-editor');
      w.card.style.maxHeight = 'none';
      const side = el('div', { className: 'editor-side world-side' });
      const vue = el('div', { className: 'world-view' });
      const canvas = el('canvas');
      const bulle = el('div', { className: 'world-tip', hidden: true });
      vue.append(canvas, bulle);
      w.body.append(side, vue);
      const g = canvas.getContext('2d');

      // Les cartes dessinées une fois (une image par carte, à la taille réelle des tuiles).
      const tuiles = doc.tiles.map((t) => Doc.tileCanvas(t, s));
      const images = new Map();
      const image = (m) => {
        if (!images.has(m.id)) images.set(m.id, IO.mapCanvas(doc, 1, m, tuiles));
        return images.get(m.id);
      };

      // Le dessin simplifié de Saga (un pixel par case), pour l'aperçu « comme en jeu ».
      // Saga 1.26.1 : la vraie couleur moyenne de chaque case, tous calques ensemble (comme Saga).
      function moyennes(m) {
        const L = m.width, H = m.height;
        const d = image(m).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, L * s, H * s).data;
        const out = new Float32Array(L * H * 4);
        for (let y = 0; y < H * s; y++) {
          const cy = Math.floor(y / s);
          for (let x = 0; x < L * s; x++) {
            const k = (y * L * s + x) * 4, w = d[k + 3];
            if (!w) continue;
            const o = (cy * L + Math.floor(x / s)) * 4;
            out[o] += d[k] * w; out[o + 1] += d[k + 1] * w; out[o + 2] += d[k + 2] * w; out[o + 3] += w;
          }
        }
        return out;
      }
      const simples = new Map();
      const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      function simple(m) {
        const cle = `${m.id}${cm.style}${cm.sol}${cm.obstacle}${cm.eau}`;
        if (simples.has(cle)) return simples.get(cle);
        const c = el('canvas', { width: m.width, height: m.height });
        const g2 = c.getContext('2d');
        const img = g2.createImageData(m.width, m.height);
        const col = Doc.collisions(doc, m);
        const calques = m.layers.filter((l) => l.visible !== false);
        const M = cm.style === 'plan' ? null : moyennes(m);
        const sol = rgb(cm.sol), obstacle = rgb(cm.obstacle), eau = rgb(cm.eau);
        for (let i = 0; i < m.width * m.height; i++) {
          const bloque = col[i] === 2;
          const estEau = calques.some((l) => doc.tiles[l.cells[i]]?.effet?.corps === 'eau');
          let k;
          if (cm.style === 'plan') k = estEau ? eau : bloque ? obstacle : sol;
          else {
            const a = M[i * 4 + 3];
            k = a ? [M[i * 4] / a, M[i * 4 + 1] / a, M[i * 4 + 2] / a] : obstacle;
            if (!a) k = obstacle;
            const moy = (k[0] + k[1] + k[2]) / 3;
            k = k.map((x) => Math.round(Math.min(255, Math.max(0, moy + (x - moy) * 1.25)) / 24) * 24);
            if (bloque && !estEau) k = k.map((x) => x * 0.72);
          }
          img.data.set([k[0], k[1], k[2], 255], i * 4);
        }
        g2.putImageData(img, 0, 0);
        simples.set(cle, c);
        return c;
      }

      // Vue : 1 case = s × zoom pixels à l'écran ; (ox, oy) = où tombe la case (0, 0).
      let zoom = 1, ox = 0, oy = 0, survol = null, choisie = null;
      const versEcran = (x, y) => ({ x: ox + x * s * zoom, y: oy + y * s * zoom });
      const versCase = (sx, sy) => ({ x: (sx - ox) / (s * zoom), y: (sy - oy) / (s * zoom) });
      function bornes() {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const m of exterieures()) {
          const p = pos.get(m.id);
          if (!p) continue;
          x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + m.width); y1 = Math.max(y1, p.y + m.height);
        }
        return x0 === Infinity ? null : { x0, y0, x1, y1 };
      }
      function ajuster() {
        const b = bornes();
        const W = vue.clientWidth, H = vue.clientHeight;
        if (!b) { zoom = 1; ox = W / 2; oy = H / 2; return dessiner(); }
        const marge = 60;
        zoom = clamp(Math.min((W - marge * 2) / ((b.x1 - b.x0) * s), (H - marge * 2) / ((b.y1 - b.y0) * s)), 0.05, 8);
        ox = (W - (b.x1 - b.x0) * s * zoom) / 2 - b.x0 * s * zoom;
        oy = (H - (b.y1 - b.y0) * s * zoom) / 2 - b.y0 * s * zoom;
        dessiner();
      }
      const carteSous = (sx, sy) => {
        const c = versCase(sx, sy);
        return [...exterieures()].reverse().find((m) => { const p = pos.get(m.id); return p && c.x >= p.x && c.y >= p.y && c.x < p.x + m.width && c.y < p.y + m.height; }) || null;
      };
      const enConflit = (m) => exterieures().some((o) => o !== m && chevauche(pos.get(m.id), m, pos.get(o.id), o));

      let attente = 0;
      function dessiner() {
        cancelAnimationFrame(attente);
        attente = requestAnimationFrame(peindre);
      }
      function peindre() {
        const r = window.devicePixelRatio || 1;
        const W = vue.clientWidth, H = vue.clientHeight;
        if (canvas.width !== Math.round(W * r) || canvas.height !== Math.round(H * r)) {
          canvas.width = Math.round(W * r); canvas.height = Math.round(H * r);
          canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
        }
        g.setTransform(r, 0, 0, r, 0, 0);
        g.clearRect(0, 0, W, H);
        g.imageSmoothingEnabled = !apercu && zoom < 1;
        if (apercu) { g.fillStyle = cm.fond; g.fillRect(0, 0, W, H); }
        const maps = exterieures();
        if (!maps.length) {
          g.fillStyle = 'rgba(255,255,255,0.45)';
          g.font = '14px "Segoe UI", sans-serif';
          g.textAlign = 'center';
          g.fillText('Aucune carte extérieure : coche à gauche les villes et routes à montrer.', W / 2, H / 2);
          return;
        }
        // Les cartes, puis leurs liens, puis les noms (toujours lisibles par-dessus).
        for (const m of maps) {
          const p = versEcran(pos.get(m.id).x, pos.get(m.id).y);
          g.drawImage(apercu ? simple(m) : image(m), p.x, p.y, m.width * s * zoom, m.height * s * zoom);
        }
        const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7bd88f';
        for (const m of maps) {
          const p = versEcran(pos.get(m.id).x, pos.get(m.id).y);
          const conflit = enConflit(m);
          g.lineWidth = conflit || m === survol || m === choisie ? 2 : 1;
          g.strokeStyle = conflit ? '#ff6b6b' : m === choisie ? accent : m === survol ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.22)';
          g.strokeRect(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5, Math.round(m.width * s * zoom) - 1, Math.round(m.height * s * zoom) - 1);
        }
        // Les passages d'une carte extérieure à l'autre : un point, vert si les deux bords se touchent.
        for (const m of maps) {
          for (const t of m.warps) {
            const B = Doc.mapById(doc, t.carte);
            if (!B || interieur.get(B.id) || !pos.get(B.id)) continue;
            const pa = pos.get(m.id), pb = pos.get(B.id);
            const a = versEcran(pa.x + t.x + 0.5, pa.y + t.y + 0.5), b = versEcran(pb.x + t.tx + 0.5, pb.y + t.ty + 0.5);
            const loin = Math.hypot(pa.x + t.x - pb.x - t.tx, pa.y + t.y - pb.y - t.ty) > 2.5;
            g.strokeStyle = loin ? 'rgba(255, 196, 64, 0.85)' : accent;
            g.fillStyle = g.strokeStyle;
            g.lineWidth = 2;
            if (loin) {
              g.setLineDash([6, 5]);
              g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
              g.setLineDash([]);
            }
            g.beginPath(); g.arc(a.x, a.y, Math.max(2.5, Math.min(5, s * zoom * 0.3)), 0, Math.PI * 2); g.fill();
          }
        }
        g.font = '600 12px "Segoe UI", sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        for (const m of maps) {
          const p = versEcran(pos.get(m.id).x, pos.get(m.id).y);
          const texte = `${m.name}${doc.depart?.carte === m.id ? '  ★' : ''}`;
          const tw = g.measureText(texte).width;
          g.fillStyle = 'rgba(16, 17, 24, 0.78)';
          g.beginPath(); g.roundRect(p.x + 6, p.y + 6, tw + 14, 22, 6); g.fill();
          g.fillStyle = m === choisie ? accent : '#e8e8ea';
          g.fillText(texte, p.x + 13, p.y + 17);
        }
        // Les repères de la carte en jeu.
        g.textAlign = 'center';
        for (const r of cm.reperes) {
          const p = posRepere(r);
          if (!p) continue;
          const rayon = 10;
          g.fillStyle = 'rgba(12, 14, 22, 0.88)';
          g.beginPath(); g.arc(p.x, p.y, rayon, 0, Math.PI * 2); g.fill();
          g.strokeStyle = r === repereChoisi ? accent : r.quete ? '#ffd166' : '#ffffff'; g.lineWidth = 2; g.stroke();
          g.fillStyle = r.quete ? '#ffd166' : '#ffffff';
          g.font = '700 11px "Segoe UI", sans-serif';
          g.fillText(ICONES[r.icone] || ICONES.point, p.x, p.y + 1);
          if (r.nom) {
            g.font = '600 11px "Segoe UI", sans-serif';
            const tw = g.measureText(r.nom).width;
            g.fillStyle = 'rgba(12, 14, 22, 0.8)';
            g.beginPath(); g.roundRect(p.x - tw / 2 - 5, p.y + rayon + 3, tw + 10, 16, 5); g.fill();
            g.fillStyle = '#f2f2f4';
            g.fillText(r.nom, p.x, p.y + rayon + 11);
          }
        }
      }
      // Où est un repère à l'écran (au centre de sa case), ou null si sa carte n'est pas sur la carte monde.
      function posRepere(r) {
        const m = Doc.mapById(doc, r.carte);
        const p = m && !interieur.get(m.id) && pos.get(m.id);
        return p ? versEcran(p.x + r.x + 0.5, p.y + r.y + 0.5) : null;
      }
      const repereSous = (sx, sy) => [...cm.reperes].reverse().find((r) => { const p = posRepere(r); return p && Math.hypot(p.x - sx, p.y - sy) <= 12; }) || null;

      // --- Souris : glisser une carte, glisser le fond, molette = zoom ---
      let geste = null;
      canvas.onpointerdown = (e) => {
        const r = canvas.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        const m = e.button === 0 && !e.altKey ? carteSous(sx, sy) : null;
        canvas.setPointerCapture(e.pointerId);
        const rep = e.button === 0 && !poser ? repereSous(sx, sy) : null;
        if (poser && m) {
          // Poser un repère sur la case cliquée.
          const c = versCase(sx, sy), p = pos.get(m.id);
          const r = { id: Events.ident('repere', cm.reperes, 'repere'), nom: '', icone: 'point', carte: m.id, x: clamp(Math.floor(c.x - p.x), 0, m.width - 1), y: clamp(Math.floor(c.y - p.y), 0, m.height - 1), quete: '', etape: '' };
          cm.reperes.push(r);
          repereChoisi = r;
          poser = false;
          onglet = 'jeu';
          renderListe();
          dessiner();
          return;
        }
        if (rep) {
          repereChoisi = rep;
          geste = { sorte: 'repere', r: rep };
          if (onglet === 'jeu') renderListe();
          dessiner();
          return;
        }
        if (m) {
          choisie = m;
          geste = { sorte: 'carte', m, depart: versCase(sx, sy), origine: { ...pos.get(m.id) } };
          renderListe();
        } else geste = { sorte: 'vue', sx: e.clientX, sy: e.clientY, ox, oy };
        dessiner();
      };
      canvas.onpointermove = (e) => {
        const r = canvas.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        if (geste?.sorte === 'repere') {
          const m = carteSous(sx, sy);
          if (m) {
            const c = versCase(sx, sy), p = pos.get(m.id);
            Object.assign(geste.r, { carte: m.id, x: clamp(Math.floor(c.x - p.x), 0, m.width - 1), y: clamp(Math.floor(c.y - p.y), 0, m.height - 1) });
            dessiner();
          }
          return;
        }
        if (geste?.sorte === 'carte') {
          const c = versCase(sx, sy);
          const p = { x: geste.origine.x + Math.round(c.x - geste.depart.x), y: geste.origine.y + Math.round(c.y - geste.depart.y) };
          const q = pos.get(geste.m.id);
          if (p.x !== q.x || p.y !== q.y) { pos.set(geste.m.id, p); majPied(); dessiner(); }
        } else if (geste?.sorte === 'vue') {
          ox = geste.ox + e.clientX - geste.sx; oy = geste.oy + e.clientY - geste.sy;
          dessiner();
        }
        const m = carteSous(sx, sy);
        if (m !== survol) { survol = m; dessiner(); }
        canvas.style.cursor = poser ? (m ? 'crosshair' : 'not-allowed') : geste?.sorte === 'vue' ? 'grabbing' : repereSous(sx, sy) || m ? 'move' : 'grab';
        bulle.hidden = !m || Boolean(geste);
        if (m) {
          const p = pos.get(m.id);
          bulle.textContent = `${m.name}${m.groupe ? ` · ${m.groupe}` : ''} · ${m.width} × ${m.height} · place ${p.x}, ${p.y}${enConflit(m) ? ' · chevauche une autre carte' : ''}`;
          bulle.style.left = `${sx + 14}px`; bulle.style.top = `${sy + 16}px`;
        }
      };
      canvas.onpointerup = () => { if (geste?.sorte === 'repere' && onglet === 'jeu') renderListe(); geste = null; };
      canvas.onpointerleave = () => { bulle.hidden = true; if (survol) { survol = null; dessiner(); } };
      canvas.ondblclick = (e) => {
        const r = canvas.getBoundingClientRect();
        const m = carteSous(e.clientX - r.left, e.clientY - r.top);
        if (m) finir({ ouvrir: doc.maps.indexOf(m) }, true);
      };
      canvas.onwheel = (e) => {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        const c = versCase(sx, sy);
        zoom = clamp(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.05, 8);
        ox = sx - c.x * s * zoom; oy = sy - c.y * s * zoom;
        dessiner();
      };
      const observateur = new ResizeObserver(() => dessiner());
      observateur.observe(vue);

      // --- La liste à gauche : quelles cartes sont sur la carte monde ---
      function renderListe() {
        side.innerHTML = '';
        const tab = (id, texte, ic) => el('button', { type: 'button', className: `world-tab${onglet === id ? ' active' : ''}`, onclick: () => { onglet = id; renderListe(); } }, [icon(ic), texte]);
        side.append(el('div', { className: 'world-tabs' }, [tab('cartes', 'Cartes', 'map'), tab('jeu', 'Carte en jeu', 'globe')]));
        if (onglet === 'jeu') return renderJeu();
        side.append(el('p', { className: 'rows-empty world-help', textContent: 'Coche les cartes extérieures (villes, routes). Les intérieurs (maisons, grottes…) restent décochés.' }));
        const groupes = [];
        for (const m of doc.maps) {
          const nom = m.groupe || '';
          let gr = groupes.find((x) => x.nom === nom);
          if (!gr) groupes.push(gr = { nom, cartes: [] });
          gr.cartes.push(m);
        }
        groupes.sort((a, b) => (a.nom === '') - (b.nom === ''));
        for (const gr of groupes) {
          if (groupes.length > 1 || gr.nom) side.append(el('div', { className: 'editor-section' }, [el('span', { textContent: gr.nom || 'Sans groupe' })]));
          for (const m of gr.cartes) {
            const box = el('input', { type: 'checkbox', checked: !interieur.get(m.id), title: 'Sur la carte monde (décoché = intérieur)' });
            box.onchange = () => {
              interieur.set(m.id, !box.checked);
              if (box.checked) completer();
              if (!box.checked && choisie === m) choisie = null;
              majPied();
              renderListe();
              dessiner();
            };
            const ligne = el('div', { className: `world-row${m === choisie ? ' active' : ''}${interieur.get(m.id) ? ' inside' : ''}` }, [
              box,
              el('i', { className: `codicon codicon-${interieur.get(m.id) ? 'home' : 'map'}` }),
              el('span', { className: 'row-name', textContent: m.name }),
              !interieur.get(m.id) && enConflit(m) ? el('span', { className: 'badge conflit', textContent: 'chevauche', title: 'Elle chevauche une autre carte : glisse-la ailleurs' }) : null,
            ]);
            ligne.onclick = (e) => {
              if (e.target === box || interieur.get(m.id)) return;
              // Centrer la vue sur cette carte.
              choisie = m;
              const p = pos.get(m.id);
              ox = vue.clientWidth / 2 - (p.x + m.width / 2) * s * zoom;
              oy = vue.clientHeight / 2 - (p.y + m.height / 2) * s * zoom;
              renderListe();
              dessiner();
            };
            ligne.ondblclick = () => finir({ ouvrir: doc.maps.indexOf(m) }, true);
            side.append(ligne);
          }
        }
      }

      // --- L'onglet « Carte en jeu » : ce que Saga montre (écran Carte, touche M) ---
      function renderJeu() {
        const majVue = () => { simples.clear(); dessiner(); };
        const coche = (cle, texte, aide) => {
          const b = el('input', { type: 'checkbox', checked: Boolean(cm[cle]), onchange: () => { cm[cle] = b.checked; renderListe(); dessiner(); } });
          return el('label', { className: 'world-field world-check', title: aide || '' }, [b, el('span', { textContent: texte })]);
        };
        const champ = (texte, ctrl) => el('label', { className: 'world-field' }, [el('span', { className: 'world-label', textContent: texte }), ctrl]);
        const choix = (liste, valeur, change) => {
          const sel = el('select', { onchange: () => change(sel.value) }, liste.map(([v, t]) => el('option', { value: v, textContent: t, selected: v === valeur })));
          return sel;
        };
        const couleur = (cle, texte) => champ(texte, el('input', { type: 'color', value: cm[cle], oninput: (e) => { cm[cle] = e.target.value; majVue(); } }));
        side.append(
          el('p', { className: 'rows-empty world-help', textContent: 'Dans le jeu, le joueur ouvre la carte depuis la pause ou avec M. Elle montre les cartes cochées dans l\'onglet Cartes, à leur place.' }),
          coche('active', 'Carte dans le jeu', 'Décoché : pas d\'écran Carte dans ce jeu'));
        if (cm.active) {
          const objets = (doc.data.objets || []).map((o) => [o.id, o.nom || o.id]);
          side.append(
            coche('brouillard', 'Brouillard : seulement les cartes visitées'),
            coche('zoom', 'Zoom (de près, la vraie carte apparaît)'),
            champ('Il faut avoir', choix([['', 'Rien (toujours permise)'], ...objets], cm.objet, (v) => { cm.objet = v; })),
            champ('Dessin', choix([['tuiles', 'Couleurs des tuiles'], ['plan', 'Plan : mes couleurs']], cm.style, (v) => { cm.style = v; renderListe(); majVue(); })));
          if (cm.style === 'plan') side.append(couleur('sol', 'Sol'), couleur('obstacle', 'Obstacles'), couleur('eau', 'Eau'));
          side.append(couleur('fond', 'Fond'));
          const ap = el('input', { type: 'checkbox', checked: apercu, onchange: () => { apercu = ap.checked; dessiner(); } });
          side.append(el('label', { className: 'world-field world-check' }, [ap, el('span', { textContent: 'Aperçu comme en jeu' })]));
          // Les repères.
          side.append(el('div', { className: 'editor-section' }, [el('span', { textContent: `Repères (${cm.reperes.length})` })]));
          side.append(el('button', { type: 'button', className: `btn world-poser${poser ? ' active' : ''}`, onclick: () => { poser = !poser; renderListe(); } }, [icon('location'), poser ? 'Clique sur la carte… (annuler)' : 'Poser un repère']));
          const quetes = [['', 'Toujours visible'], ...(doc.data.quetes || []).map((q) => [q.id, `Pendant « ${q.titre || q.id} »`])];
          for (const r of cm.reperes) {
            const m = Doc.mapById(doc, r.carte);
            const ligne = el('div', { className: `world-repere${r === repereChoisi ? ' active' : ''}` });
            const nom = el('input', { type: 'text', value: r.nom, placeholder: 'Nom (facultatif)', maxLength: 40, oninput: () => { r.nom = nom.value; dessiner(); } });
            const suppr = el('button', { type: 'button', className: 'icon-button', title: 'Retirer ce repère', onclick: () => { cm.reperes = cm.reperes.filter((x) => x !== r); if (repereChoisi === r) repereChoisi = null; renderListe(); dessiner(); } }, [icon('trash')]);
            ligne.append(
              el('div', { className: 'world-repere-tete' }, [choix(Donnees.ICONES_REPERE, r.icone, (v) => { r.icone = v; dessiner(); }), nom, suppr]),
              el('div', { className: 'world-repere-detail', textContent: `${m ? m.name : r.carte} · case ${r.x}, ${r.y}` }),
              choix(quetes, r.quete, (v) => { r.quete = v; renderListe(); dessiner(); }));
            if (r.quete) {
              const q = (doc.data.quetes || []).find((x) => x.id === r.quete);
              const etapes = [['', 'Toute la quête'], ...(q?.etapes || []).map((e, i) => [String(i), `Étape ${i + 1}${e.texte ? ` : ${e.texte.slice(0, 30)}` : ''}`])];
              ligne.append(choix(etapes, r.etape === '' ? '' : String(r.etape), (v) => { r.etape = v === '' ? '' : Number(v); }));
            }
            ligne.onclick = (e) => {
              if (e.target.closest('input, select, button')) return;
              repereChoisi = r;
              const p = m && pos.get(m.id);
              if (p) { ox = vue.clientWidth / 2 - (p.x + r.x + 0.5) * s * zoom; oy = vue.clientHeight / 2 - (p.y + r.y + 0.5) * s * zoom; }
              renderListe();
              dessiner();
            };
            side.append(ligne);
          }
          if (!cm.reperes.length) side.append(el('p', { className: 'rows-empty', textContent: 'Aucun repère. Un repère peut marquer un centre de soin, une boutique, ou le but d\'une quête (il ne se voit alors que pendant la quête). Glisse-le pour le déplacer.' }));
        }
      }

      // --- Exporter toute la carte monde en une image ---
      async function exporter() {
        const ext = new Set(exterieures().map((m) => m.id));
        const c = dessin(doc, new Map([...pos].filter(([id]) => ext.has(id))), image)?.canvas;
        if (!c) return notify('Aucune carte extérieure à exporter.', 'info', 2500);
        const path = await window.tafl.saveDialog({ defaultName: `${String(doc.name || 'jeu').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')}-carte-monde.png`, format: 'png' });
        if (!path) return;
        const saved = await window.tafl.writeFile(path, await IO.canvasBytes(c));
        notify(`Carte monde exportée : ${saved.name} (${c.width} × ${c.height} px)`, 'success', 6000, [{ label: 'Afficher', run: () => window.tafl.revealFile(saved.path) }]);
      }

      const etat = () => JSON.stringify([...interieur, ...pos, cm]);
      const places = () => JSON.stringify([...interieur, ...pos]);
      const change = () => etat() !== avant;
      function appliquer() {
        if (!change()) return;
        // Les places calculées toutes seules sont gardées aussi : le moteur les lira telles quelles.
        const cmChange = JSON.stringify(cm) !== avantCm;
        Doc.change(doc, places() === avantPlace && !cmChange ? 'Placer les cartes sur la carte monde' : 'Carte monde', () => {
          if (cmChange) doc.data = { ...doc.data, reglages: { ...doc.data.reglages, carte_monde: Donnees.normCarteMonde(cm) } };
          doc.maps = doc.maps.map((m) => {
            const dedans = interieur.get(m.id);
            const p = dedans ? m.monde : pos.get(m.id) || null;
            return { ...m, interieur: dedans, monde: p ? { x: p.x, y: p.y } : null };
          });
          Doc.selectMap(doc, doc.mapIndex);
        });
      }
      const finir = (r, garder) => {
        if (garder) appliquer();
        observateur.disconnect();
        w.root.remove();
        Events.occuper(null);
        resolve(r);
      };
      const fermer = async () => {
        // Seules les places calculées par Tafl ont changé : rien à perdre.
        if ((places() === avantPlace && JSON.stringify(cm) === avantCm) || await Dialogs.ask('Carte monde', 'Garder ce que tu as changé sur la carte monde ?', [
          { label: 'Fermer sans garder', value: true },
          { label: 'Continuer', value: false, primary: true },
        ])) finir(null, false);
      };
      w.close.onclick = fermer;
      function majPied() {
        const n = exterieures().filter(enConflit).length;
        w.hint.textContent = n
          ? `${n} carte(s) en chevauchent une autre (bord rouge) : glisse-les ailleurs.`
          : 'Glisse une carte pour la déplacer · glisse le fond pour te déplacer · molette : zoom · double-clic : ouvrir la carte. Les points verts sont les passages entre cartes ; en pointillés orange, les deux bords ne se touchent pas.';
      }
      w.bouton('Replacer tout seul', () => {
        pos.clear();
        completer();
        majPied();
        renderListe();
        ajuster();
      });
      w.bouton('Ajuster la vue', ajuster);
      w.bouton('Exporter en image…', () => exporter().catch((err) => notify(String(err.message || err), 'error')));
      w.bouton('Annuler', fermer);
      w.bouton('Valider', () => finir(null, true), true);
      Events.occuper({ fermer, valider: () => finir(null, true) });
      renderListe();
      majPied();
      requestAnimationFrame(ajuster);
    });
  }

  return { open, placer, liens, cote, positions, dessin };
})();
