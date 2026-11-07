// La carte du monde en jeu (Saga 1.26, réglée dans Tafl › carte monde › Carte en jeu) : les villes et
// routes du jeu (les cartes extérieures, posées où Tafl les a mises : carte.monde), dessinées en
// couleurs simplifiées, avec la position du joueur et les repères de l'auteur.
//
// - Une case de carte = une case du monde. Chaque case prend une couleur : la teinte moyenne de ses
//   tuiles (style « tuiles »), ou sol / obstacle / eau aux couleurs choisies dans Tafl (style « plan »).
// - Brouillard : une carte n'apparaît qu'une fois visitée (partie.visites).
// - Zoom (option) : molette, Action, ou les gâchettes ; de près, la vraie carte en miniature apparaît.
// - Dans un intérieur (maison, grotte), le joueur est montré à la porte de la ville qui y mène.
// - Repères (reglages.carte_monde.reperes) : { nom, icone, carte, x, y, quete, etape }. Un repère lié
//   à une quête ne se voit que pendant cette quête (et à cette étape si etape est donnée).
//
// Ne connaît pas les règles : il lit les cartes, la partie et les réglages, et dessine.

const CarteMonde = (() => {
  let courante = null; // fermer la carte ouverte (la touche M la referme)
  const ICONES = { soin: '✚', boutique: '◆', quete: '!', etoile: '★', maison: '⌂', grotte: '▲', danger: '✕', point: '●' };
  const hex = (v, def) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : def);

  // Les réglages, bornés (absents : la carte est permise, avec brouillard et zoom).
  function reglages(jeu) {
    const r = jeu.donnees.reglages?.reglages?.carte_monde || {};
    return {
      active: r.active !== false,
      brouillard: r.brouillard !== false,
      zoom: r.zoom !== false,
      objet: typeof r.objet === 'string' ? r.objet : '',
      style: r.style === 'plan' ? 'plan' : 'tuiles',
      sol: hex(r.sol, '#8cc56f'), obstacle: hex(r.obstacle, '#3f6e4c'), eau: hex(r.eau, '#4b8fd6'), fond: hex(r.fond, '#10131c'),
      reperes: (Array.isArray(r.reperes) ? r.reperes : []).filter((p) => p && typeof p.carte === 'string'),
    };
  }
  const exterieures = (jeu) => [...jeu.cartes.values()].filter((c) => !c.interieur && c.monde);

  // L'entrée « Carte » se montre-t-elle ? (le jeu a des cartes placées et ne l'a pas coupée)
  const disponible = (jeu) => Boolean(jeu && reglages(jeu).active && exterieures(jeu).length);

  // La carte extérieure qui mène à cet intérieur (en passant par d'autres intérieurs), et la case de sa porte.
  function dehors(jeu, idCarte, x, y) {
    const c = jeu.cartes.get(idCarte);
    if (!c) return null;
    if (!c.interieur && c.monde) return { carte: c, x, y };
    const vus = new Set([c.id]);
    let file = [c.id];
    while (file.length) {
      const suivante = [];
      for (const cible of file) {
        for (const m of jeu.cartes.values()) {
          for (const t of m.teleporteurs) {
            if (t.vers?.carte !== cible && Jeu.baseDe(t.vers?.carte) !== cible) continue;
            if (!m.interieur && m.monde) return { carte: m, x: t.x, y: t.y };
            if (!vus.has(m.id)) { vus.add(m.id); suivante.push(m.id); }
          }
        }
      }
      file = suivante;
    }
    return null;
  }

  // --- Les images des cartes (faites une fois par jeu) ---
  const caches = new WeakMap();
  function cache(jeu) {
    if (!caches.has(jeu)) caches.set(jeu, { simples: new Map(), details: new Map(), style: '' });
    return caches.get(jeu);
  }
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  // Le dessin simplifié d'une carte : un pixel par case.
  function simple(jeu, carte, R) {
    const k = cache(jeu);
    const cle = `${R.style}${R.sol}${R.obstacle}${R.eau}`;
    if (k.style !== cle) { k.simples.clear(); k.style = cle; }
    if (k.simples.has(carte.id)) return k.simples.get(carte.id);
    const L = carte.largeur, H = carte.hauteur;
    const c = document.createElement('canvas');
    c.width = L; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(L, H);
    const M = R.style === 'plan' ? null : moyennes(detail(jeu, carte), L, H, jeu.taille);
    const calques = carte.calques.filter((l) => l.visible);
    const sol = rgb(R.sol), obstacle = rgb(R.obstacle), eau = rgb(R.eau);
    for (let i = 0; i < L * H; i++) {
      let col;
      const bloque = carte.collisions[i] === Jeu.PASSAGE.bloque;
      const estEau = calques.some((l) => jeu.tuiles[l.cases[i]]?.effet?.corps === 'eau');
      if (R.style === 'plan') col = estEau ? eau : bloque ? obstacle : sol;
      else {
        // La vraie couleur moyenne de la case, telle qu'on la voit (tous les calques ensemble).
        const a = M[i * 4 + 3];
        col = [M[i * 4], M[i * 4 + 1], M[i * 4 + 2]];
        if (!a) col = obstacle;
        // Plus simple : des teintes un peu plus franches, par paliers, et les obstacles un peu plus sombres.
        const m = (col[0] + col[1] + col[2]) / 3;
        col = col.map((x) => Math.round(Math.min(255, Math.max(0, m + (x - m) * 1.25)) / 24) * 24);
        if (bloque && !estEau) col = col.map((x) => x * 0.72);
      }
      img.data.set([col[0], col[1], col[2], 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    k.simples.set(carte.id, c);
    return c;
  }
  // La couleur moyenne de chaque case d'une image de carte (s pixels par case) : [r, g, b, a] à la suite.
  // Saga 1.26.1 : avant, on mêlait la teinte moyenne de chaque tuile, calque par calque, et une herbe de
  // bord (presque pleine, avec un trou pour le chemin) cachait tout le chemin dessous.
  function moyennes(image, L, H, s) {
    const d = image.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, L * s, H * s).data;
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
    for (let i = 0; i < L * H; i++) {
      const w = out[i * 4 + 3];
      if (w) { out[i * 4] /= w; out[i * 4 + 1] /= w; out[i * 4 + 2] /= w; }
    }
    return out;
  }
  // La vraie carte en miniature (les tuiles, première image), faite à la demande quand on zoome.
  function detail(jeu, carte) {
    const k = cache(jeu);
    if (k.details.has(carte.id)) return k.details.get(carte.id);
    const s = jeu.taille;
    const c = document.createElement('canvas');
    c.width = carte.largeur * s; c.height = carte.hauteur * s;
    const g = c.getContext('2d');
    for (const l of carte.calques) {
      if (!l.visible) continue;
      g.globalAlpha = l.opacite;
      g.globalCompositeOperation = l.fusion;
      for (let i = 0; i < l.cases.length; i++) {
        const t = jeu.tuiles[l.cases[i]];
        if (!t) continue;
        g.drawImage(jeu.planche, t.images[0].sx, t.images[0].sy, s, s, (i % carte.largeur) * s, Math.floor(i / carte.largeur) * s, s, s);
      }
    }
    k.details.set(carte.id, c);
    return c;
  }

  // Le repère se voit-il maintenant ? (lié à une quête : seulement pendant elle, à son étape s'il y en a une)
  function visible(p, partie) {
    if (!p.quete) return true;
    const q = partie.quetes?.[p.quete];
    if (q?.etat !== 'en_cours') return false;
    return p.etape == null || p.etape === '' || Number(q.etape) === Number(p.etape);
  }

  // --- L'écran ---
  // o : { jeu, partie (la partie vive), position: { carte, x, y }, menus, accent }
  function ouvrir({ jeu, partie, position, menus, accent = '#7bd88f' }) {
    const R = reglages(jeu);
    const cartes = exterieures(jeu);
    const visites = partie.visites || {};
    const ici = position ? dehors(jeu, position.carte, position.x, position.y) : null;
    const vue = (c) => !R.brouillard || visites[c.id] || c === ici?.carte;
    const montrees = cartes.filter(vue);
    const objet = R.objet ? (jeu.donnees.objets?.objets || []).find((o) => o.id === R.objet) : null;
    if (R.objet && !(partie.sac?.[R.objet] > 0)) {
      return menus.liste({ titre: 'Carte', items: [], note: `Il te faut ${objet?.nom || R.objet} pour voir la carte.` });
    }
    const reperes = R.reperes.filter((p) => visible(p, partie) && montrees.some((c) => c.id === p.carte));

    return menus.ecran((boite, fermer, aide) => {
      boite.classList.add('carte-monde');
      const zone = el('div', { className: 'carte-monde-vue' });
      const canvas = el('canvas');
      const nom = el('span', { className: 'menu-entete' });
      zone.append(canvas);
      boite.append(el('div', { className: 'combat-liste-titre menu-tete' }, el('span', { textContent: 'Carte' }), nom), zone,
        aide(R.zoom ? 'Flèches : se déplacer · Action ou molette : zoomer · Échap : fermer' : 'Flèches : se déplacer · Échap : fermer'));
      nom.textContent = ici ? (position.carte === ici.carte.id ? ici.carte.nom : `${jeu.cartes.get(position.carte)?.nom || ''} · ${ici.carte.nom}`) : '';
      const g = canvas.getContext('2d');
      const police = getComputedStyle(boite).fontFamily || 'sans-serif';

      // Les bornes de ce qu'on montre, en cases du monde.
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of montrees) { x0 = Math.min(x0, c.monde.x); y0 = Math.min(y0, c.monde.y); x1 = Math.max(x1, c.monde.x + c.largeur); y1 = Math.max(y1, c.monde.y + c.hauteur); }
      if (x0 === Infinity) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
      // Vue : k pixels (CSS) par case ; (cx, cy) = la case du monde au centre.
      let k = 1, base = 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      // Les crans de zoom : ×2 à chaque fois, jusqu'à deux pixels par pixel de tuile (au moins deux crans).
      let ZOOMS = [1];
      let niveau = 0;
      let W = 0, H = 0;
      function ajuster() {
        const r = zone.getBoundingClientRect();
        W = Math.max(1, r.width); H = Math.max(1, r.height);
        const d = window.devicePixelRatio || 1;
        canvas.width = Math.round(W * d); canvas.height = Math.round(H * d);
        canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
        base = Math.max(0.5, Math.min((W - 40) / (x1 - x0), (H - 40) / (y1 - y0)));
        ZOOMS = [1];
        if (R.zoom) do ZOOMS.push(ZOOMS[ZOOMS.length - 1] * 2); while (base * ZOOMS[ZOOMS.length - 1] < jeu.taille * 2);
        niveau = Math.min(niveau, ZOOMS.length - 1);
        k = base * ZOOMS[niveau];
        borner();
        dessiner();
      }
      function borner() {
        // On ne s'éloigne pas du monde montré (le centre reste dedans).
        cx = Math.min(x1, Math.max(x0, cx)); cy = Math.min(y1, Math.max(y0, cy));
        if (niveau === 0) { cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; }
      }
      const ecran = (x, y) => ({ x: W / 2 + (x - cx) * k, y: H / 2 + (y - cy) * k });
      function zoomer(d, sx = W / 2, sy = H / 2) {
        if (!R.zoom) return;
        const n = Math.max(0, Math.min(ZOOMS.length - 1, niveau + d));
        if (n === niveau) return;
        // La case sous la souris reste sous la souris.
        const wx = cx + (sx - W / 2) / k, wy = cy + (sy - H / 2) / k;
        niveau = n; k = base * ZOOMS[niveau];
        cx = wx - (sx - W / 2) / k; cy = wy - (sy - H / 2) / k;
        borner();
        dessiner();
      }

      let anim = 0, t0 = performance.now();
      function dessiner() {
        const d = window.devicePixelRatio || 1;
        g.setTransform(d, 0, 0, d, 0, 0);
        g.fillStyle = R.fond;
        g.fillRect(0, 0, W, H);
        if (!montrees.length) {
          g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '14px sans-serif'; g.textAlign = 'center';
          g.fillText('Rien d\'exploré pour l\'instant.', W / 2, H / 2);
          return;
        }
        // En zoomant, la vraie carte passe peu à peu devant le dessin simplifié (toute au dernier cran).
        const fin = R.zoom && niveau > 0 ? niveau / (ZOOMS.length - 1) : 0;
        g.imageSmoothingEnabled = false;
        for (const c of montrees) {
          const p = ecran(c.monde.x, c.monde.y);
          const w = c.largeur * k, h = c.hauteur * k;
          if (p.x > W || p.y > H || p.x + w < 0 || p.y + h < 0) continue;
          // Une petite ombre sous chaque carte, pour lire les bords du monde.
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(p.x + 2, p.y + 3, w, h);
          if (fin < 1) g.drawImage(simple(jeu, c, R), p.x, p.y, w, h);
          if (fin > 0) { g.globalAlpha = fin; g.drawImage(detail(jeu, c), p.x, p.y, w, h); g.globalAlpha = 1; }
        }
        // Les noms des cartes (assez grandes à l'écran).
        g.font = `600 12px ${police}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const c of montrees) {
          const p = ecran(c.monde.x + c.largeur / 2, c.monde.y);
          p.y = Math.max(16, p.y + 18);
          if (c.largeur * k < 50) continue;
          const tw = g.measureText(c.nom).width;
          g.fillStyle = 'rgba(12, 14, 22, 0.72)';
          g.beginPath(); g.roundRect(p.x - tw / 2 - 7, p.y - 10, tw + 14, 20, 6); g.fill();
          g.fillStyle = '#f2f2f4';
          g.fillText(c.nom, p.x, p.y);
        }
        // Les repères.
        const rayon = Math.max(8, Math.min(13, k * 0.9));
        for (const r of reperes) {
          const c = jeu.cartes.get(r.carte);
          const p = ecran(c.monde.x + Number(r.x) + 0.5, c.monde.y + Number(r.y) + 0.5);
          g.fillStyle = 'rgba(12, 14, 22, 0.85)';
          g.beginPath(); g.arc(p.x, p.y, rayon, 0, Math.PI * 2); g.fill();
          g.strokeStyle = r.quete ? '#ffd166' : '#ffffff'; g.lineWidth = 2; g.stroke();
          g.fillStyle = r.quete ? '#ffd166' : '#ffffff';
          g.font = `700 ${Math.round(rayon * 1.1)}px sans-serif`;
          g.fillText(ICONES[r.icone] || ICONES.point, p.x, p.y + 1);
          if (r.nom && k >= 4) {
            g.font = `600 11px ${police}`;
            const tw = g.measureText(r.nom).width;
            g.fillStyle = 'rgba(12, 14, 22, 0.8)';
            g.beginPath(); g.roundRect(p.x - tw / 2 - 5, p.y + rayon + 3, tw + 10, 16, 5); g.fill();
            g.fillStyle = '#f2f2f4';
            g.fillText(r.nom, p.x, p.y + rayon + 11);
          }
        }
        // Le joueur : un point à la couleur du jeu qui pulse.
        if (ici) {
          const p = ecran(ici.carte.monde.x + ici.x + 0.5, ici.carte.monde.y + ici.y + 0.5);
          const t = ((performance.now() - t0) / 900) % 1;
          g.strokeStyle = accent; g.globalAlpha = 1 - t; g.lineWidth = 2;
          g.beginPath(); g.arc(p.x, p.y, 6 + t * 14, 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1;
          g.fillStyle = accent; g.strokeStyle = '#ffffff';
          g.beginPath(); g.arc(p.x, p.y, 6, 0, Math.PI * 2); g.fill(); g.stroke();
        }
      }
      const boucle = () => { dessiner(); anim = requestAnimationFrame(boucle); };

      // Souris : glisser pour se déplacer (zoomé), molette pour zoomer.
      let geste = null;
      canvas.onpointerdown = (e) => { canvas.setPointerCapture(e.pointerId); geste = { x: e.clientX, y: e.clientY, cx, cy }; };
      canvas.onpointermove = (e) => {
        if (!geste || niveau === 0) return;
        cx = geste.cx - (e.clientX - geste.x) / k; cy = geste.cy - (e.clientY - geste.y) / k;
        borner();
      };
      canvas.onpointerup = () => { geste = null; };
      canvas.onwheel = (e) => {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        zoomer(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
      };
      const obs = new ResizeObserver(ajuster);
      obs.observe(zone);
      // Zoomé, on commence centré sur le joueur.
      requestAnimationFrame(() => { ajuster(); anim = requestAnimationFrame(boucle); });
      courante = () => finir();
      const finir = () => { courante = null; cancelAnimationFrame(anim); obs.disconnect(); boite.classList.remove('carte-monde'); fermer(null); };

      return {
        touche(t) {
          const pas = Math.max(2, 60 / k);
          if (t === 'retour') return finir();
          if (t === 'action') {
            if (niveau === ZOOMS.length - 1 || !R.zoom) { niveau = 0; k = base; borner(); }
            else {
              if (niveau === 0 && ici) { cx = ici.carte.monde.x + ici.x; cy = ici.carte.monde.y + ici.y; }
              const p = ici && niveau === 0 ? ecran(cx, cy) : { x: W / 2, y: H / 2 };
              zoomer(1, p.x, p.y);
            }
            return;
          }
          if (niveau === 0) return;
          if (t === 'haut') cy -= pas; else if (t === 'bas') cy += pas; else if (t === 'gauche') cx -= pas; else if (t === 'droite') cx += pas;
          borner();
        },
      };
    });
  }

  // Noter la carte où l'on vient d'entrer (le brouillard), et celle de dehors pour un intérieur.
  function noter(jeu, partie, idCarte) {
    partie.visites = partie.visites && typeof partie.visites === 'object' ? partie.visites : {};
    const c = jeu.cartes.get(idCarte);
    if (!c) return;
    const id = Jeu.baseDe(c.id);
    if (!c.interieur) partie.visites[id] = true;
  }

  return { ouvrir, disponible, reglages, noter, dehors, ICONES, get ouverte() { return Boolean(courante); }, fermer: () => courante?.() };
})();
