// L'aperçu d'une scène (Tafl 1.17) : dans la fenêtre d'un événement, « Aperçu de la scène » joue le script
// de la page ouverte sur la carte, comme Saga le jouera : les dialogues, les personnages qui marchent, la
// caméra, les fondus, les secousses, les bulles et les bandes de cinéma.
//
// C'est un aperçu : les autres événements sont montrés à leur page 1, le héros est à son point de départ
// (ou sous l'événement), les choix prennent la réponse cliquée, un « si » suit « alors », et les commandes
// qui changent la partie (objets, interrupteurs, combats…) sont seulement nommées en bas de l'écran.

const ApercuScene = (() => {
  const DIRS = { haut: [0, -1], bas: [0, 1], gauche: [-1, 0], droite: [1, 0] };
  const VITESSES = { lente: 0.48, normale: 0.29, rapide: 0.13 };
  const BULLES = { exclamation: ['!', '#e0413a'], question: ['?', '#2f6fd6'], coeur: ['♥', '#e0417a'], points: ['…', '#444'], note: ['♪', '#2e9a5a'], colere: ['#', '#d1452b'], sommeil: ['z', '#5a5fc9'], idee: ['✦', '#d9a514'] };
  const lisse = (k) => k * k * (3 - 2 * k);
  const ZOOM = 3;

  function ouvrir(doc, ev, page) {
    const map = doc.map;
    const s = doc.tileSize, cell = s * ZOOM;
    const VW = Math.min(map.width, 16) * cell, VH = Math.min(map.height, 10) * cell;

    // --- La fenêtre ---
    const root = el('div', { className: 'editor-overlay apercu-scene' });
    const card = el('div', { className: 'editor', style: { width: `min(${VW + 48}px, calc(100vw - 48px))` } });
    const canvas = el('canvas', { width: VW, height: VH, className: 'apercu-scene-toile' });
    const boite = el('div', { className: 'apercu-scene-boite', hidden: true });
    const note = el('div', { className: 'apercu-scene-note' });
    const scene = el('div', { className: 'apercu-scene-ecran', style: { width: `${VW}px`, maxWidth: '100%', aspectRatio: `${VW} / ${VH}` } }, [canvas, boite, note]);
    const rejouer = el('button', { className: 'button', textContent: 'Rejouer' });
    const fermer = el('button', { className: 'button primary', textContent: 'Fermer' });
    card.append(
      el('header', {}, [icon('play'), el('span', { className: 'editor-title', textContent: `Aperçu de la scène : « ${ev.nom || ev.id} »` })]),
      el('div', { className: 'editor-body apercu-scene-corps' }, [scene, el('p', { className: 'modal-info', textContent: 'Clic, Espace ou Entrée : la suite du dialogue. Les autres événements sont à leur page 1 et le héros à son point de départ. Les objets, interrupteurs, combats… sont seulement nommés en bas : ils ne changent rien ici.' })]),
      el('footer', {}, [el('span', { className: 'editor-hint', textContent: 'Échap : fermer' }), rejouer, fermer]),
    );
    root.append(card);
    document.body.append(root);
    const g = canvas.getContext('2d');

    // --- Le décor : la carte en deux images (sous les personnages, et les calques « dessus ») ---
    const tuiles = doc.tiles.map((t) => Doc.tileCanvas(t, s));
    function calques(dessus) {
      const c = el('canvas', { width: map.width * cell, height: map.height * cell });
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      for (const l of map.layers) {
        if (!l.visible || (l.profondeur === 'dessus') !== dessus) continue;
        x.globalAlpha = l.opacite ?? 1;
        for (let yy = 0; yy < map.height; yy++) for (let xx = 0; xx < map.width; xx++) {
          const t = l.cells[yy * map.width + xx];
          if (t >= 0 && tuiles[t]) x.drawImage(tuiles[t], xx * cell, yy * cell, cell, cell);
        }
      }
      return c;
    }
    const sol = calques(false), toits = calques(true);
    const passage = Doc.collisions(doc, map);
    const BLOQUE = 2;

    // --- Les acteurs ---
    let acteurs = [], fini = true, jeton = 0;
    const perso = (id) => doc.data.personnages.find((p) => p.id === id) || null;
    function preparer() {
      acteurs = [];
      // L'événement ouvert tel qu'on est en train de l'écrire (pas encore enregistré), les autres tels quels.
      const tous = [...map.events.filter((e) => e.id !== ev.id), ev];
      for (const e of tous) {
        const pg = e.id === ev.id ? page : e.pages[0];
        if (!pg || pg.cache) { if (e.id !== ev.id) continue; }
        const ap = pg?.apparence || e.apparence;
        acteurs.push({ id: e.id, nom: e.nom, x: e.x, y: e.y, dir: e.direction || 'bas', perso: perso(ap.personnage), tuile: ap.tuile, bloque: !e.traversable, mouvement: null, pas: 0, cache: Boolean(pg?.cache) });
      }
      const heros = doc.data.personnages.find((p) => p.heros) || null;
      const d = doc.depart?.carte === map.id ? doc.depart : { x: ev.x, y: Math.min(map.height - 1, ev.y + 2), direction: 'haut' };
      acteurs.push({ id: '@joueur', nom: heros?.nom || 'Le héros', x: d.x, y: d.y, dir: d.direction || 'bas', perso: heros, tuile: -1, bloque: true, mouvement: null, pas: 0, heros: true });
    }
    const acteur = (qui) => acteurs.find((a) => a.id === (qui === '@evenement' ? ev.id : qui || '@joueur')) || null;
    const pixels = (a) => {
      const m = a.mouvement, k = m ? Math.min(1, m.t / m.duree) : 1;
      return m ? { x: (m.de.x + (a.x - m.de.x) * k) * cell, y: (m.de.y + (a.y - m.de.y) * k) * cell } : { x: a.x * cell, y: a.y * cell };
    };
    const libre = (a, x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && passage[y * map.width + x] !== BLOQUE
      && !acteurs.some((b) => b !== a && !b.cache && b.bloque && b.x === x && b.y === y);

    // --- La mise en scène ---
    let camera = null; // { de, vers, t, duree, retour }
    let voile = null;  // { couleur, a, de, vers, t, duree }
    let secousse = null, bandes = { k: 0, de: 0, vers: 0, t: 0, duree: 0.4 }, bulles = [], marches = [], attentes = [];
    const attendre = (sec) => new Promise((r) => attentes.push({ reste: sec, r }));
    function centre() {
      const h = acteur('@joueur'), p = h ? pixels(h) : { x: 0, y: 0 };
      if (!camera) return p;
      const k = camera.duree > 0 ? lisse(Math.min(1, camera.t / camera.duree)) : 1;
      const vers = camera.retour ? p : camera.vers;
      return { x: camera.de.x + (vers.x - camera.de.x) * k, y: camera.de.y + (vers.y - camera.de.y) * k };
    }

    function avancer(dt) {
      for (const a of acteurs) if (a.mouvement) { a.mouvement.t += dt; if (a.mouvement.t >= a.mouvement.duree) a.mouvement = null; }
      for (const m of marches) {
        const a = m.a;
        if (a.mouvement) continue;
        if (!m.etapes.length) { m.fini = true; continue; }
        const dir = m.etapes[0], [dx, dy] = DIRS[dir];
        a.dir = dir;
        if (!(m.traverser ? a.x + dx >= 0 && a.y + dy >= 0 && a.x + dx < map.width && a.y + dy < map.height : libre(a, a.x + dx, a.y + dy))) {
          m.attente += dt;
          if (m.attente > 1.5) { m.etapes.shift(); m.attente = 0; }
          continue;
        }
        m.etapes.shift(); m.attente = 0;
        a.pas++;
        a.mouvement = { de: { x: a.x, y: a.y }, t: 0, duree: m.duree };
        a.x += dx; a.y += dy;
      }
      for (const m of marches.filter((x) => x.fini)) m.r();
      marches = marches.filter((x) => !x.fini);
      if (camera) { camera.t += dt; if (camera.t >= camera.duree && camera.r) { camera.r(); camera.r = null; if (camera.retour) camera = null; } }
      if (voile) {
        voile.t += dt;
        const k = voile.duree > 0 ? Math.min(1, voile.t / voile.duree) : 1;
        voile.a = voile.de + (voile.vers - voile.de) * k;
        if (k >= 1 && voile.r) { voile.r(); voile.r = null; if (voile.a <= 0) voile = null; }
      }
      if (secousse) { secousse.reste -= dt; if (secousse.reste <= 0) { secousse.r(); secousse = null; } }
      bandes.t += dt;
      const kb = bandes.duree > 0 ? Math.min(1, bandes.t / bandes.duree) : 1;
      bandes.k = bandes.de + (bandes.vers - bandes.de) * lisse(kb);
      if (kb >= 1 && bandes.r) { bandes.r(); bandes.r = null; }
      for (const b of bulles) b.t += dt;
      for (const b of bulles.filter((x) => x.t >= x.duree)) b.r();
      bulles = bulles.filter((x) => x.t < x.duree);
      for (const w of attentes) w.reste -= dt;
      for (const w of attentes.filter((x) => x.reste <= 0)) w.r();
      attentes = attentes.filter((x) => x.reste > 0);
    }

    function dessinerActeur(a, cam) {
      if (a.cache) return;
      const p = pixels(a), x = Math.round(p.x - cam.x), y = Math.round(p.y - cam.y);
      const m = a.mouvement, image = m && m.t < m.duree / 2 && a.perso?.sprite ? 1 + (a.pas % Math.max(1, a.perso.sprite.images - 1)) : 0;
      if (a.tuile >= 0 && tuiles[a.tuile]) { g.drawImage(tuiles[a.tuile], x, y, cell, cell); return; }
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath(); g.ellipse(x + cell / 2, y + cell - 4, cell * 0.3, cell * 0.1, 0, 0, Math.PI * 2); g.fill();
      if (a.perso?.sprite && Sprites.dessinerSurCase(g, a.perso.sprite, a.dir, x, y, cell, s, () => {}, image)) return;
      if (a.perso?.tuile >= 0 && tuiles[a.perso.tuile]) { g.drawImage(tuiles[a.perso.tuile], x, y, cell, cell); return; }
      // Le petit bonhomme de Saga, en plus simple : un rond à la couleur du personnage.
      g.fillStyle = a.perso?.couleur || (a.heros ? '#5ec8ff' : '#c9a0ff');
      g.beginPath(); g.arc(x + cell / 2, y + cell * 0.55, cell * 0.32, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      const [dx, dy] = DIRS[a.dir] || [0, 1];
      g.beginPath(); g.arc(x + cell / 2 + dx * cell * 0.14, y + cell * 0.5 + dy * cell * 0.1, cell * 0.07, 0, Math.PI * 2); g.fill();
    }

    function dessiner() {
      const c = centre();
      const lw = map.width * cell, lh = map.height * cell;
      const cam = {
        x: Math.round(lw <= VW ? (lw - VW) / 2 : Math.min(lw - VW, Math.max(0, c.x + cell / 2 - VW / 2))),
        y: Math.round(lh <= VH ? (lh - VH) / 2 : Math.min(lh - VH, Math.max(0, c.y + cell / 2 - VH / 2))),
      };
      if (secousse) { const f = secousse.force * ZOOM * Math.min(1, secousse.reste / 0.25); cam.x += Math.round((Math.random() * 2 - 1) * f); cam.y += Math.round((Math.random() * 2 - 1) * f * 0.6); }
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#000';
      g.fillRect(0, 0, VW, VH);
      g.drawImage(sol, -cam.x, -cam.y);
      for (const a of [...acteurs].sort((p, q) => pixels(p).y - pixels(q).y)) dessinerActeur(a, cam);
      g.drawImage(toits, -cam.x, -cam.y);
      for (const b of bulles) {
        const a = acteur(b.qui);
        if (!a) continue;
        const p = pixels(a), w = 12 * ZOOM, h = 11 * ZOOM;
        const x = Math.round(p.x - cam.x + cell / 2 - w / 2), y = Math.round(p.y - cam.y - h - 2 * ZOOM);
        g.fillStyle = '#fff'; g.strokeStyle = '#222'; g.lineWidth = ZOOM;
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, w, h, 3 * ZOOM); else g.rect(x, y, w, h);
        g.fill(); g.stroke();
        g.fillStyle = b.couleur; g.font = `bold ${9 * ZOOM}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(b.texte, x + w / 2, y + h / 2 + ZOOM / 2);
      }
      if (voile && voile.a > 0) { g.fillStyle = voile.couleur === 'blanc' ? `rgba(255,255,255,${voile.a})` : `rgba(0,0,0,${voile.a})`; g.fillRect(0, 0, VW, VH); }
      if (bandes.k > 0) { const h = Math.round(VH * 0.12 * bandes.k); g.fillStyle = '#000'; g.fillRect(0, 0, VW, h); g.fillRect(0, VH - h, VW, h); }
    }

    let avant = performance.now(), boucle = 0;
    function tour(t) {
      boucle = requestAnimationFrame(tour);
      const dt = Math.min(0.05, (t - avant) / 1000);
      avant = t;
      avancer(dt);
      dessiner();
    }
    boucle = requestAnimationFrame(tour);

    // --- Les dialogues et les choix ---
    let suite = null;
    const nomQui = (qui) => {
      if (!qui) return '';
      const id = Events.quiReel(qui, { ...ev, apparence: page.apparence || ev.apparence });
      const p = perso(id);
      return p ? (p.heros ? (doc.data.personnages.find((x) => x.heros)?.nom || p.nom) : p.nom) : (qui === '@evenement' ? ev.nom : qui);
    };
    function dire(c) {
      boite.hidden = false;
      boite.replaceChildren(
        ...(nomQui(c.qui) ? [el('div', { className: 'apercu-scene-nom', textContent: nomQui(c.qui) })] : []),
        el('div', { className: 'apercu-scene-texte', textContent: String(c.texte || '').replace(/\{joueur\}/g, 'Héros') }),
      );
      return new Promise((r) => { suite = () => { boite.hidden = true; r(); }; });
    }
    function choisir(c) {
      boite.hidden = false;
      boite.replaceChildren(...(c.options || []).map((o, i) => {
        const b = el('button', { className: 'apercu-scene-choix', textContent: `▸ ${o.texte}` });
        b.onclick = (e) => { e.stopPropagation(); suite = null; boite.hidden = true; choisi(i); };
        return b;
      }));
      let choisi = null;
      return new Promise((r) => { choisi = r; suite = () => { boite.hidden = true; r(0); }; });
    }
    const avancerDialogue = () => { const f = suite; suite = null; f?.(); };
    scene.onclick = avancerDialogue;
    let noteFin = 0;
    function nommer(texte) {
      note.textContent = texte;
      note.classList.add('visible');
      clearTimeout(noteFin);
      noteFin = setTimeout(() => note.classList.remove('visible'), 1600);
    }

    // --- Le script ---
    class Arret extends Error {}
    async function jouer(liste, j) {
      for (const c of liste || []) {
        if (j !== jeton) throw new Arret();
        await commande(c, j);
      }
    }
    function etapesVers(a, but) {
      // Le plus court chemin (largeur d'abord), qui s'arrête à côté si la case d'arrivée est prise.
      const prise = !libre(a, but.x, but.y);
      const vu = new Map([[`${a.x},${a.y}`, null]]);
      const file = [{ x: a.x, y: a.y }];
      while (file.length) {
        const q = file.shift();
        if (q.x === but.x && q.y === but.y) break;
        for (const [d, [dx, dy]] of Object.entries(DIRS)) {
          const x = q.x + dx, y = q.y + dy, k = `${x},${y}`;
          if (vu.has(k) || !((x === but.x && y === but.y) || libre(a, x, y))) continue;
          vu.set(k, { de: q, d });
          file.push({ x, y });
        }
      }
      if (!vu.has(`${but.x},${but.y}`)) return [];
      const out = [];
      for (let k = `${but.x},${but.y}`; vu.get(k); ) { const v = vu.get(k); out.unshift(v.d); k = `${v.de.x},${v.de.y}`; }
      if (prise) out.pop();
      return out;
    }
    async function commande(c, j) {
      const d = Events.COMMANDES[c.type];
      switch (c.type) {
        case 'dire': await dire(c); break;
        case 'choix': { const i = await choisir(c); await jouer(c.options?.[i]?.commandes, j); break; }
        case 'si': nommer(`Si ${Events.resumeCondition(doc, c.condition)} : l'aperçu suit « alors »`); await jouer(c.alors, j); break;
        case 'attendre': await attendre((Number(c.ms) || 0) / 1000); break;
        case 'fin': throw new Arret();
        case 'deplacer': {
          const a = acteur(c.qui);
          if (!a) break;
          let etapes = [];
          if (c.mode === 'vers') {
            const b = c.vers === 'case' ? { x: c.x, y: c.y } : acteur(c.vers);
            if (b) etapes = etapesVers(a, { x: b.x, y: b.y });
          } else for (const e of c.chemin || []) for (let i = 0; i < e.cases; i++) etapes.push(e.direction);
          for (const m of marches.filter((x) => x.a === a)) m.r();
          marches = marches.filter((x) => x.a !== a);
          const fin = new Promise((r) => marches.push({ a, etapes, duree: VITESSES[c.vitesse] || VITESSES.normale, traverser: c.traverser, attente: 0, r }));
          if (c.attendre !== false) await fin;
          break;
        }
        case 'regarder': {
          const a = acteur(c.qui);
          if (!a) break;
          if (DIRS[c.direction]) a.dir = c.direction; else {
            const b = acteur(c.direction);
            if (b && b !== a) { const dx = b.x - a.x, dy = b.y - a.y; a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'droite' : 'gauche') : (dy > 0 ? 'bas' : 'haut'); }
          }
          break;
        }
        case 'camera': {
          const de = centre();
          let fin;
          if (c.action === 'revenir') { if (!camera) break; fin = new Promise((r) => { camera = { de, t: 0, duree: (c.duree || 0) / 1000, retour: true, r }; }); } else {
            const b = c.vers === 'case' ? { x: c.x * cell, y: c.y * cell } : (() => { const a = acteur(c.vers); return a ? pixels(a) : null; })();
            if (!b) break;
            fin = new Promise((r) => { camera = { de, vers: b, t: 0, duree: (c.duree || 0) / 1000, retour: false, r }; });
          }
          if (c.attendre !== false) await fin;
          break;
        }
        case 'fondu': {
          const a = voile && voile.couleur === c.couleur ? voile.a : c.action === 'entrer' ? 1 : 0;
          const fin = new Promise((r) => { voile = { couleur: c.couleur, a, de: a, vers: c.action === 'entrer' ? 0 : 1, t: 0, duree: (c.duree || 0) / 1000, r }; });
          if (c.attendre !== false) await fin;
          break;
        }
        case 'secouer': { const fin = new Promise((r) => { secousse = { force: c.force || 4, reste: (c.duree || 0) / 1000, r }; }); if (c.attendre !== false) await fin; break; }
        case 'bulle': {
          const [texte, couleur] = BULLES[c.bulle] || BULLES.exclamation;
          const fin = new Promise((r) => bulles.push({ qui: c.qui, texte, couleur, t: 0, duree: (c.duree || 1000) / 1000, r }));
          if (c.attendre !== false) await fin;
          break;
        }
        case 'cinema': await new Promise((r) => { bandes = { k: bandes.k, de: bandes.k, vers: c.action === 'cacher' ? 0 : 1, t: 0, duree: 0.4, r }; }); break;
        case 'teleporter': nommer(`${d.resume(doc, c, ev)} (l'aperçu reste ici)`); await attendre(0.8); break;
        case 'commentaire': break;
        default: nommer(d ? d.resume(doc, c, ev) : c.type); await attendre(0.5);
      }
    }

    async function lancer() {
      const j = ++jeton;
      fini = false;
      marches.forEach((m) => m.r()); marches = [];
      attentes.forEach((w) => w.r()); attentes = [];
      suite = null; boite.hidden = true;
      camera = null; voile = null; secousse = null; bulles = []; bandes = { k: 0, de: 0, vers: 0, t: 0, duree: 0.4 };
      preparer();
      note.classList.remove('visible');
      await attendre(0.4);
      try { await jouer(page.commandes, j); } catch (err) { if (!(err instanceof Arret)) nommer(`Erreur : ${err.message}`); }
      if (j !== jeton) return;
      // Comme dans Saga : à la fin du script, la caméra revient, le voile et les bandes s'en vont.
      camera = null;
      if (voile) voile = { ...voile, de: voile.a, vers: 0, t: 0, duree: 0.3, r: null };
      if (bandes.k > 0) bandes = { k: bandes.k, de: bandes.k, vers: 0, t: 0, duree: 0.3 };
      fini = true;
      nommer('Fin de la scène');
    }

    const clavier = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); fermerTout(); return; }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); if (fini) lancer(); else avancerDialogue(); }
    };
    window.addEventListener('keydown', clavier, true);
    function fermerTout() {
      jeton++;
      cancelAnimationFrame(boucle);
      clearTimeout(noteFin);
      window.removeEventListener('keydown', clavier, true);
      root.remove();
    }
    rejouer.onclick = () => lancer();
    fermer.onclick = fermerTout;
    lancer();
    return { fermer: fermerTout };
  }

  return { ouvrir };
})();
