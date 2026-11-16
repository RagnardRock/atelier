// Saga 1.45 : la vision dynamique du mode table (à la Roll20). Calculs purs (sans écran), testables sous Node.
//
// Une carte en vision dynamique (table › carte › vision : 'jour' ou 'sombre') ne se révèle plus pièce par pièce :
// chaque joueur voit ce que voient ses héros, d'où ils se tiennent.
//   - Un mur (une case bloquée dont aucune tuile n'est « transparente » : FORMAT.md › tuiles) arrête la vue ;
//     l'eau ou une barrière basse cochées « transparentes » dans Tafl bloquent le pas, pas le regard.
//   - 'jour' : tout ce qui est en vue, jusqu'à PORTEE cases.
//   - 'sombre' : seulement ce qui est éclairé (les tuiles et événements qui éclairent, la lumière d'un pion : une
//     torche, une lanterne) ou à portée de sa vision dans le noir (l'origine du héros, ou le réglage du MJ).
// Ce qui a été vu une fois reste « exploré » (2 dans le masque) : le décor se voit, voilé, mais pas qui s'y trouve.
//
//   opaque(carte, tuiles)                 Uint8Array : 1 = la case arrête la vue (calculé une fois par carte)
//   champ(carte, op, x, y, rayon)         Set des index visibles depuis (x, y) jusqu'à rayon cases
//   eclairees(carte, op, sources)         Set des index éclairés ([{ x, y, rayon }], chaque lumière a sa ligne de vue)
//   voit(carte, op, yeux, lumieres, mode) Set de ce que voient ces yeux ([{ x, y, nuit }], nuit en cases)
//   visionNuit(jeu, c)                    la vision dans le noir d'un héros, en mètres (0 : aucune)

const TableVision = (() => {
  const PORTEE = 30; // cases : assez loin pour une carte de table, sans tout parcourir sur une immense carte
  const BLOQUE = 2;  // Jeu.PASSAGE.bloque

  function opaque(carte, tuiles = []) {
    if (carte._opaque) return carte._opaque;
    const n = carte.largeur * carte.hauteur;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (carte.collisions?.[i] !== BLOQUE) continue;
      let voitAuTravers = false;
      for (const c of carte.calques || []) {
        if (c.profondeur === 'dessus') continue;
        const t = c.cases?.[i];
        if (t >= 0 && tuiles[t]?.transparent) { voitAuTravers = true; break; }
      }
      out[i] = voitAuTravers ? 0 : 1;
    }
    Object.defineProperty(carte, '_opaque', { value: out, configurable: true, enumerable: false });
    return out;
  }

  // Une ligne de (x0, y0) à (x1, y1) : aucune case opaque entre les deux (la case visée se voit, même un mur).
  function libreEntre(carte, op, x0, y0, x1, y1) {
    let x = x0, y = y0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && op[y * carte.largeur + x]) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  function champ(carte, op, x, y, rayon) {
    const out = new Set();
    const r = Math.max(0, Math.min(PORTEE, Math.round(rayon)));
    const W = carte.largeur, H = carte.hauteur;
    if (x < 0 || y < 0 || x >= W || y >= H) return out;
    for (let cy = Math.max(0, y - r); cy <= Math.min(H - 1, y + r); cy++) {
      for (let cx = Math.max(0, x - r); cx <= Math.min(W - 1, x + r); cx++) {
        if ((cx - x) ** 2 + (cy - y) ** 2 > r * r + r) continue; // un disque
        // Deux lignes (vers le centre, et vers le coin le plus proche) : on ne perd pas un mur vu de biais.
        if (libreEntre(carte, op, x, y, cx, cy) || libreEntre(carte, op, cx, cy, x, y)) out.add(cy * W + cx);
      }
    }
    return out;
  }

  function eclairees(carte, op, sources) {
    const out = new Set();
    for (const s of sources || []) for (const i of champ(carte, op, s.x, s.y, s.rayon)) out.add(i);
    return out;
  }

  function voit(carte, op, yeux, lumieres, mode) {
    const out = new Set();
    const clair = mode === 'sombre' ? eclairees(carte, op, lumieres) : null;
    for (const o of yeux) {
      const loin = champ(carte, op, o.x, o.y, PORTEE);
      if (!clair) { for (const i of loin) out.add(i); continue; }
      // Dans le noir : sa case et ses voisines (à tâtons), sa vision dans le noir, et ce qui est éclairé en vue.
      const pres = champ(carte, op, o.x, o.y, Math.max(1, Math.round(Number(o.nuit) || 0)));
      for (const i of loin) if (pres.has(i) || clair.has(i)) out.add(i);
    }
    return out;
  }

  // « Vision dans le noir » (ou nyctalopie, infravision) dans les traits de son origine ou les aptitudes de sa
  // classe : la portée écrite (« jusqu'à 18 m »), sinon 18 m.
  function visionNuit(jeu, c) {
    if (!c) return 0;
    const d = jeu?.donnees || {};
    const origine = (d.origines?.origines || []).find((o) => o.id === c.origine);
    const classe = (d.classes_jdr?.classes_jdr || []).find((o) => o.id === c.classe);
    const niveau = Number(c.niveau) || 1;
    const traits = [...(origine?.traits || []), ...(classe?.niveaux || []).filter((n) => (Number(n.niveau) || 1) <= niveau).flatMap((n) => n.aptitudes || [])];
    let m = 0;
    for (const t of traits) {
      const nom = String(t?.nom || ''), texte = String(t?.description || '');
      if (!/vision dans le noir|nyctalop|infravision/i.test(nom)) continue;
      const k = texte.match(/(\d+(?:[.,]\d+)?)\s*m\b/);
      m = Math.max(m, k ? Number(k[1].replace(',', '.')) : 18);
    }
    return m;
  }

  return { PORTEE, opaque, libreEntre, champ, eclairees, voit, visionNuit };
})();

if (typeof module !== 'undefined') module.exports = TableVision;
