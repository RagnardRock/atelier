// Le mode table (Saga 0.14) : les calculs sur la grille, sans rien dessiner. Une case de la grille est une
// tuile de la carte ; l'échelle (reglages.jdr.case_m, 1,5 m par défaut) ne sert qu'à changer les mètres
// des données (vitesse, portée) en cases.
//
//   distance(a, b, diagonales)            en cases ; 'simple' : une diagonale = 1, 'alternees' : 1 puis 2
//   cases(metres, caseM)                  des mètres en cases (au moins 1 pour une distance non nulle)
//   atteignables(carte, depart, max, o)   Map index → coût, les cases où l'on peut aller en `max` cases
//   chemin(carte, depart, arrivee, o)     la liste des cases de départ (exclu) à l'arrivée, ou null
//   vers(carte, depart, cible, portee, max, o) la meilleure case pour s'approcher de `cible` à `portee`
//   ligneDeVue(carte, a, b)               aucune case bloquée entre les deux ?
//
// o : { diagonales, occupe(x, y) } (une case occupée par quelqu'un ne se traverse pas).
// Les rebords se franchissent ici dans les deux sens : sur une table, on marche, on ne saute pas.

const TableGrille = (() => {
  const BLOQUE = 2;
  const VOISINS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function distance(a, b, diagonales = 'simple') {
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    const grand = Math.max(dx, dy), petit = Math.min(dx, dy);
    return diagonales === 'alternees' ? grand + Math.floor(petit / 2) : grand;
  }
  function cases(metres, caseM = 1.5) {
    const m = Number(metres) || 0;
    if (m <= 0) return 0;
    return Math.max(1, Math.floor(m / (Number(caseM) > 0 ? Number(caseM) : 1.5) + 1e-9));
  }
  const dans = (carte, x, y) => x >= 0 && y >= 0 && x < carte.largeur && y < carte.hauteur;
  const libre = (carte, x, y) => dans(carte, x, y) && carte.collisions[y * carte.largeur + x] !== BLOQUE;

  // Dijkstra sur (case, nombre de diagonales déjà faites modulo 2) : avec la règle « alternées », la
  // deuxième diagonale coûte 2. On ne coupe pas un coin de mur en diagonale.
  function explorer(carte, depart, max, { diagonales = 'simple', occupe = () => false, arrivee = null } = {}) {
    const W = carte.largeur;
    const cle = (i, p) => i * 2 + p;
    const cout = new Map(), avant = new Map();
    const d0 = depart.y * W + depart.x;
    cout.set(cle(d0, 0), 0);
    const file = [[0, d0, 0]];
    while (file.length) {
      let k = 0;
      for (let j = 1; j < file.length; j++) if (file[j][0] < file[k][0]) k = j;
      const [c, i, p] = file.splice(k, 1)[0];
      if (c > (cout.get(cle(i, p)) ?? Infinity)) continue;
      const x = i % W, y = Math.floor(i / W);
      for (const [dx, dy] of VOISINS) {
        const nx = x + dx, ny = y + dy;
        if (!libre(carte, nx, ny)) continue;
        const diag = dx !== 0 && dy !== 0;
        if (diag && (!libre(carte, x + dx, y) || !libre(carte, x, y + dy))) continue;
        const ni = ny * W + nx;
        const cible = arrivee && arrivee.x === nx && arrivee.y === ny;
        if (occupe(nx, ny) && !cible) continue;
        const pas = diag && diagonales === 'alternees' ? (p ? 2 : 1) : 1;
        const np = diag ? 1 - p : p;
        const nc = c + pas;
        if (nc > max) continue;
        if (nc < (cout.get(cle(ni, np)) ?? Infinity)) {
          cout.set(cle(ni, np), nc);
          avant.set(cle(ni, np), cle(i, p));
          file.push([nc, ni, np]);
        }
      }
    }
    return { cout, avant, cle };
  }
  function atteignables(carte, depart, max, o = {}) {
    const { cout } = explorer(carte, depart, max, o);
    const out = new Map();
    for (const [k, c] of cout) {
      const i = Math.floor(k / 2);
      if (!out.has(i) || out.get(i) > c) out.set(i, c);
    }
    return out;
  }
  function chemin(carte, depart, arrivee, o = {}) {
    const W = carte.largeur;
    const max = o.max ?? carte.largeur * carte.hauteur * 2;
    const { cout, avant, cle } = explorer(carte, depart, max, { ...o, arrivee });
    const ai = arrivee.y * W + arrivee.x;
    const fins = [cle(ai, 0), cle(ai, 1)].filter((k) => cout.has(k)).sort((a, b) => cout.get(a) - cout.get(b));
    if (!fins.length) return null;
    const out = [];
    let k = fins[0];
    const d0 = cle(depart.y * W + depart.x, 0);
    while (k !== d0 && avant.has(k)) {
      const i = Math.floor(k / 2);
      out.unshift({ x: i % W, y: Math.floor(i / W), cout: cout.get(k) });
      k = avant.get(k);
    }
    return out;
  }
  // Où aller pour être à `portee` cases de la cible (ou au plus près), en `max` cases au plus : la case
  // atteignable la plus proche de la cible, la moins coûteuse à égalité. Rend { x, y, cout } ou null (rester).
  function vers(carte, depart, cible, portee, max, o = {}) {
    const diagonales = o.diagonales || 'simple';
    if (distance(depart, cible, diagonales) <= portee && (!o.voir || ligneDeVue(carte, depart, cible))) return null;
    const W = carte.largeur;
    let mieux = null;
    for (const [i, c] of atteignables(carte, depart, max, o)) {
      const p = { x: i % W, y: Math.floor(i / W) };
      if (p.x === depart.x && p.y === depart.y) continue;
      const d = distance(p, cible, diagonales);
      const voit = !o.voir || ligneDeVue(carte, p, cible);
      const score = (d <= portee && voit ? 0 : 1000 + d) * 100 + c;
      if (!mieux || score < mieux.score) mieux = { ...p, cout: c, score };
    }
    // Mieux vaut rester que s'éloigner.
    if (mieux && mieux.score >= 100000 + distance(depart, cible, diagonales) * 100) return null;
    return mieux;
  }
  // La ligne de vue : les cases traversées entre les deux centres (algorithme de Bresenham), sans les
  // deux bouts, ne doivent pas être bloquées.
  function ligneDeVue(carte, a, b) {
    let x = a.x, y = a.y;
    const dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x === b.x && y === b.y) return true;
      if (!(x === a.x && y === a.y) && !libre(carte, x, y)) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  return { distance, cases, libre, atteignables, chemin, vers, ligneDeVue };
})();

if (typeof module !== 'undefined') module.exports = TableGrille;
