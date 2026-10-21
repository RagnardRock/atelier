// L'ambiance d'une carte (FORMAT.md › Ambiance) : la teinte, posée en « produit » sur toute la carte
// comme une couche de lumière, puis la météo, avec de vraies particules.
//
// Les particules vivent à l'écran (en pixels de jeu), mais elles suivent la caméra : quand le joueur
// avance, la pluie et la neige glissent avec le décor, et le brouillard un peu plus vite que lui
// (il est « plus près » de nous). C'est ce décalage qui donne de la profondeur.

const Ambiance = (() => {
  const hasard = (a, b) => a + Math.random() * (b - a);

  // Une tache de brouillard (un dégradé rond), dessinée une fois puis réutilisée.
  let tache = null;
  function tacheBrouillard() {
    if (tache) return tache;
    tache = document.createElement('canvas');
    tache.width = tache.height = 128;
    const g = tache.getContext('2d');
    const d = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    d.addColorStop(0, 'rgba(214, 222, 232, 0.55)');
    d.addColorStop(0.5, 'rgba(214, 222, 232, 0.22)');
    d.addColorStop(1, 'rgba(214, 222, 232, 0)');
    g.fillStyle = d;
    g.fillRect(0, 0, 128, 128);
    return tache;
  }

  function creer() {
    let a = { meteo: 'aucune', intensite: 0, teinte: '', force: 0 };
    let particules = [], eclaboussures = [];
    let W = 0, H = 0, camAvant = null;
    let eclair = 0, prochainEclair = hasard(3, 8);

    function nouvelle(type, partout) {
      const p = { x: hasard(0, W), y: partout ? hasard(0, H) : hasard(-20, -2), v: hasard(0.7, 1.3), phase: hasard(0, Math.PI * 2) };
      if (type === 'brouillard') { p.y = hasard(0, H); p.r = hasard(40, 90); p.x = partout ? hasard(-60, W + 60) : -p.r; }
      if (type === 'lucioles') { p.y = hasard(0, H); p.vie = hasard(0, 1); }
      if (type === 'pluie' || type === 'orage') p.fin = hasard(H * 0.15, H + 10); // où la goutte touche le sol
      return p;
    }

    // Combien de particules pour cette météo, sur cet écran.
    function nombreVoulu() {
      const surface = (W * H) / (16 * 16);
      const k = { pluie: 0.9, orage: 1.4, neige: 0.6, feuilles: 0.08, lucioles: 0.08, brouillard: 0.025 }[a.meteo] || 0;
      return Math.round(surface * k * (a.intensite / 100));
    }

    function regler(ambiance) {
      const change = ambiance.meteo !== a.meteo;
      a = { ...ambiance };
      if (change) { particules = []; eclaboussures = []; }
    }

    function taille(w, h) {
      if (w !== W || h !== H) { W = w; H = h; particules = []; }
    }

    function avancer(dt, cam, meteoActive) {
      if (!meteoActive || a.meteo === 'aucune') { particules = []; eclaboussures = []; camAvant = null; return; }
      // La caméra a bougé : le décor (et les particules qui y sont) glisse d'autant.
      const dx = camAvant ? cam.x - camAvant.x : 0, dy = camAvant ? cam.y - camAvant.y : 0;
      camAvant = { ...cam };
      const voulu = nombreVoulu();
      // Au premier remplissage, les particules sont semées sur tout l'écran (pas toutes en haut).
      const partout = particules.length === 0;
      while (particules.length < voulu) particules.push(nouvelle(a.meteo, partout));
      if (particules.length > voulu) particules.length = voulu;
      const t = performance.now() / 1000;
      const profondeur = a.meteo === 'brouillard' ? 1.25 : 1;
      for (let i = 0; i < particules.length; i++) {
        const p = particules[i];
        p.x -= dx * profondeur;
        p.y -= dy * profondeur;
        switch (a.meteo) {
          case 'pluie': case 'orage': {
            const vit = a.meteo === 'orage' ? 1.3 : 1;
            p.x -= 60 * vit * p.v * dt;
            p.y += 300 * vit * p.v * dt;
            if (p.y >= p.fin) {
              if (eclaboussures.length < 200) eclaboussures.push({ x: p.x, y: p.y, t: 0 });
              particules[i] = nouvelle(a.meteo, false);
              particules[i].x = hasard(0, W + 40);
            }
            break;
          }
          case 'neige':
            p.y += 18 * p.v * dt;
            p.x += Math.sin(t * 1.2 * p.v + p.phase) * 10 * dt - 6 * dt;
            break;
          case 'feuilles':
            p.y += 14 * p.v * dt;
            p.x += (Math.sin(t * 1.6 * p.v + p.phase) * 22 - 10) * dt;
            break;
          case 'lucioles':
            p.x += Math.sin(t * 0.7 * p.v + p.phase) * 8 * dt;
            p.y += Math.cos(t * 0.5 * p.v + p.phase * 2) * 6 * dt;
            p.vie += dt * 0.35 * p.v;
            break;
          case 'brouillard':
            p.x += 5 * p.v * dt;
            break;
        }
        // Sortie de l'écran : elle revient de l'autre côté (on ne voit jamais l'écran se vider).
        const m = p.r || 8;
        if (p.x < -m - 20) p.x += W + 2 * m + 40;
        else if (p.x > W + m + 20) p.x -= W + 2 * m + 40;
        if (p.y > H + m) p.y -= H + 2 * m;
        else if (p.y < -m - 30) p.y += H + 2 * m + 30;
      }
      for (const e of eclaboussures) { e.t += dt; e.x -= dx; e.y -= dy; }
      eclaboussures = eclaboussures.filter((e) => e.t < 0.18);
      // L'orage : un éclair de temps en temps (un double flash qui s'éteint vite).
      if (a.meteo === 'orage') {
        prochainEclair -= dt;
        if (prochainEclair <= 0) { eclair = 1; prochainEclair = hasard(4, 11) * (1.4 - a.intensite / 100); }
        eclair = Math.max(0, eclair - dt * 2.4);
      } else eclair = 0;
    }

    // La teinte, sur tout ce qui est la carte (calques et personnages), avant la météo.
    function dessinerTeinte(ctx) {
      if (!a.teinte || !a.force) return;
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = a.force / 100;
      ctx.fillStyle = a.teinte;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    function dessinerMeteo(ctx) {
      if (a.meteo === 'aucune' || !particules.length) return;
      ctx.save();
      switch (a.meteo) {
        case 'pluie': case 'orage':
          ctx.fillStyle = 'rgba(190, 210, 240, 0.55)';
          for (const p of particules) {
            // Une goutte = une petite diagonale de pixels, plus longue quand elle est « proche ».
            const long = p.v > 1.1 ? 6 : 4;
            for (let k = 0; k < long; k++) ctx.fillRect(Math.round(p.x + k * 0.25), Math.round(p.y - k), 1, 1);
          }
          ctx.fillStyle = 'rgba(200, 220, 245, 0.5)';
          for (const e of eclaboussures) {
            const r = Math.round(1 + e.t * 10);
            ctx.fillRect(Math.round(e.x - r), Math.round(e.y), 1, 1);
            ctx.fillRect(Math.round(e.x + r), Math.round(e.y), 1, 1);
            ctx.fillRect(Math.round(e.x), Math.round(e.y - r * 0.6), 1, 1);
          }
          break;
        case 'neige':
          for (const p of particules) {
            ctx.fillStyle = p.v > 1.1 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(235, 240, 250, 0.7)';
            const s = p.v > 1.15 ? 2 : 1;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
          }
          break;
        case 'feuilles':
          for (const p of particules) {
            ctx.fillStyle = p.phase > 3 ? '#c8662f' : p.phase > 1.5 ? '#b8923a' : '#8f5a2a';
            const large = Math.sin(performance.now() / 300 * p.v + p.phase) > 0;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), large ? 2 : 1, large ? 1 : 2);
          }
          break;
        case 'lucioles':
          ctx.globalCompositeOperation = 'lighter';
          for (const p of particules) {
            const lum = Math.max(0, Math.sin(p.vie * Math.PI * 2));
            if (lum < 0.05) continue;
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 6);
            g.addColorStop(0, `rgba(220, 255, 140, ${0.55 * lum})`);
            g.addColorStop(1, 'rgba(220, 255, 140, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
            ctx.fillStyle = `rgba(250, 255, 210, ${lum})`;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
          }
          break;
        case 'brouillard': {
          const img = tacheBrouillard();
          ctx.globalAlpha = 0.5 + a.intensite / 200;
          for (const p of particules) ctx.drawImage(img, p.x - p.r, p.y - p.r * 0.6, p.r * 2, p.r * 1.2);
          // Un voile léger sur tout l'écran en plus des nappes.
          ctx.globalAlpha = a.intensite / 400;
          ctx.fillStyle = '#d6dee8';
          ctx.fillRect(0, 0, W, H);
          break;
        }
      }
      ctx.restore();
      if (eclair > 0) {
        // Deux flashs : un fort, puis un plus faible juste après.
        const f = eclair > 0.75 ? eclair : eclair > 0.55 ? 0.1 : eclair * 0.7;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(230, 236, 255, ${f * 0.75})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    return { regler, taille, avancer, dessinerTeinte, dessinerMeteo, get eclair() { return eclair; } };
  }

  return { creer };
})();
