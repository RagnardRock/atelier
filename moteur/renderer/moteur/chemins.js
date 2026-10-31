// Trouver son chemin sur une carte (Saga 1.9) : l'algorithme A*, en 4 directions, case par case.
//
// Générique : il ne connaît ni les cartes ni les modules. On lui dit quelles cases sont libres, et ce que
// coûte chaque case (1 par défaut ; moins cher sur un sentier : les marcheurs le préfèrent). Le mode table
// a son propre chemin (table/grille.js), avec les diagonales et les coûts de déplacement des combats.
//
//   Chemins.trouver({ largeur, hauteur, depart: {x, y}, arrivee: {x, y}, libre(x, y), cout(x, y), coutMin, max })
//     → [{ x, y }, …] les cases à parcourir après le départ, jusqu'à l'arrivée comprise ; [] si on y est déjà ;
//       null si l'arrivée n'est pas atteignable (ou trop loin : max cases explorées).
//   coutMin : le plus petit coût possible d'une case (il garde l'estimation honnête, pour le plus court).
//   diagonales (Saga 1.12, le temps réel) : en 8 directions ; une diagonale coûte √2 et ne coupe jamais un coin
//     (les deux cases à côté doivent être libres).

const Chemins = (() => {
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const DIRS8 = [...DIRS, [1, -1], [1, 1], [-1, 1], [-1, -1]];

  // Un tas binaire (le plus petit en haut) de [priorité, case].
  function tas() {
    const a = [];
    return {
      get taille() { return a.length; },
      pousser(p, v) {
        a.push([p, v]);
        let i = a.length - 1;
        while (i > 0) { const m = (i - 1) >> 1; if (a[m][0] <= a[i][0]) break; [a[m], a[i]] = [a[i], a[m]]; i = m; }
      },
      sortir() {
        const haut = a[0], fin = a.pop();
        if (a.length) {
          a[0] = fin;
          let i = 0;
          for (;;) {
            const g = 2 * i + 1, d = g + 1;
            let m = i;
            if (g < a.length && a[g][0] < a[m][0]) m = g;
            if (d < a.length && a[d][0] < a[m][0]) m = d;
            if (m === i) break;
            [a[m], a[i]] = [a[i], a[m]];
            i = m;
          }
        }
        return haut[1];
      },
    };
  }

  function trouver({ largeur, hauteur, depart, arrivee, libre = () => true, cout = () => 1, coutMin = 1, max = 6000, diagonales = false }) {
    const W = Math.round(largeur), H = Math.round(hauteur);
    const dans = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    if (!depart || !arrivee || !dans(depart.x, depart.y) || !dans(arrivee.x, arrivee.y)) return null;
    if (depart.x === arrivee.x && depart.y === arrivee.y) return [];
    if (!libre(arrivee.x, arrivee.y)) return null;
    const k0 = Math.max(0.05, Number(coutMin) || 1);
    const estimer = diagonales
      ? (x, y) => { const a = Math.abs(x - arrivee.x), b = Math.abs(y - arrivee.y); return (Math.max(a, b) + (Math.SQRT2 - 1) * Math.min(a, b)) * k0; }
      : (x, y) => (Math.abs(x - arrivee.x) + Math.abs(y - arrivee.y)) * k0;
    const fin = arrivee.y * W + arrivee.x;
    const g = new Map([[depart.y * W + depart.x, 0]]);
    const avant = new Map();
    const file = tas();
    file.pousser(estimer(depart.x, depart.y), depart.y * W + depart.x);
    let explores = 0;
    while (file.taille) {
      const i = file.sortir();
      if (i === fin) {
        const out = [];
        for (let k = fin; avant.has(k); k = avant.get(k)) out.unshift({ x: k % W, y: Math.floor(k / W) });
        return out;
      }
      if (++explores > max) return null;
      const x = i % W, y = Math.floor(i / W), gi = g.get(i);
      for (const [dx, dy] of diagonales ? DIRS8 : DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!dans(nx, ny)) continue;
        const n = ny * W + nx;
        if (n !== fin && !libre(nx, ny)) continue;
        if (dx && dy && (!libre(x + dx, y) || !libre(x, y + dy))) continue;
        const c = Math.max(k0, Number(cout(nx, ny)) || 1) * (dx && dy ? Math.SQRT2 : 1);
        const ng = gi + c;
        if (g.has(n) && g.get(n) <= ng) continue;
        g.set(n, ng);
        avant.set(n, i);
        file.pousser(ng + estimer(nx, ny), n);
      }
    }
    return null;
  }

  return { trouver };
})();
