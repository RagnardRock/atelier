// Tuiles d'exemple proposées à la création d'un jeu de tuiles : herbe, hautes herbes, chemin, eau
// (animée) et fleur, avec une petite carte qui les utilise. De quoi voir tout de suite comment Tafl marche,
// puis les retoucher ou les effacer.
// Chaque tuile est dessinée ici en 16 × 16, une lettre par pixel (« . » = transparent) ;
// pour une autre taille de tuile, elle est agrandie ou réduite pixel par pixel.

const Samples = (() => {
  const COLORS = {
    a: '#38a048', b: '#70c858', c: '#285828', d: '#183018',
    e: '#c8a060', f: '#e8d098', g: '#906838',
    h: '#3060b0', i: '#58a0f0', j: '#98d0f8',
    r: '#e05848', y: '#f8c838', w: '#ffffff',
  };
  const TILES = [
    ['herbe', [
      'aaaaaaaaaaaaaaaa', 'aaabaaaaaaaaaaaa', 'aabcbaaaaaaaaaaa', 'aaaaaaaaaabaaaaa',
      'aaaaaaaaabcbaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'abaaaaaaaaaaaaaa',
      'bcbaaaaaaaaaabaa', 'aaaaaaaaaaaabcba', 'aaaaaabaaaaaaaaa', 'aaaaabcbaaaaaaaa',
      'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaabaaaaa', 'aaaaaaaaabcbaaaa',
    ]],
    ['hautes-herbes', [
      'aaaaaaaaaaaaaaaa', 'aaabaaaaabaaaaab', 'abcbabaabcbabaab', 'bcacbcbbcacbcbbc',
      'cacdcacdcacdcacd', 'cdccdccdccdccdcc', 'ddcddcddcddcddcd', 'cdddcdddcdddcddd',
      'aaaaaaaaaaaaaaaa', 'aaaaabaaaaabaaab', 'abaabcbabaababcb', 'bcbbcacbcbbcbcac',
      'cacdcacdcacdcacd', 'dccdccdccdcccdcc', 'dcddcddcddcdddcd', 'cdddcdddcdddcddd',
    ]],
    ['chemin', [
      'eeeeeeeeeeeeeeee', 'eeeeefeeeeeeeeee', 'eeeeegeeeeeeeefe', 'eeeeeeeeeeeeeege',
      'eefeeeeeeeeeeeee', 'eegeeeeeeefeeeee', 'eeeeeeeeeegeeeee', 'eeeeeeeeeeeeeeee',
      'eeeeeeefeeeeeeee', 'eeeeeeegeeeeefee', 'efeeeeeeeeeeegee', 'egeeeeeeeeeeeeee',
      'eeeeeeeeeefeeeee', 'eeeefeeeeegeeeee', 'eeeegeeeeeeeeeee', 'eeeeeeeeeeeeeeee',
    ]],
    ['eau', [
      'iiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiii', 'iijjjiiiiiiiiiii', 'ijiiijiiiiiiiiii',
      'iiiiiiiiiijjjiii', 'iiiiiiiiijiiijii', 'iiiiiiiiiiiiiiii', 'iiiihiiiiiiiiiii',
      'iiiiiiiiiiiiiiii', 'iiiiiiiiiiiiiiii', 'iiiiijjjiiiiiiii', 'iiiijiiijiiiiiii',
      'iiiiiiiiiiiiijjj', 'jiiiiiiiiiiiijii', 'iiiiiiiiiihiiiii', 'iiiiiiiiiiiiiiii',
    ]],
    ['fleur', [
      '................', '................', '................', '.....r..........',
      '....ryr.........', '.....r..........', '.....c....w.....', '.....c...wyw....',
      '..........w.....', '..........c.....', '..........c.....', '................',
      '..r.............', '.ryr............', '..r.............', '..c.............',
    ]],
  ];

  function tileData(rows, size) {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const ch = rows[Math.floor((y * 16) / size)][Math.floor((x * 16) / size)];
        if (ch === '.') continue;
        const [r, g, b] = hexToRgba(COLORS[ch]);
        data.set([r, g, b, 255], (y * size + x) * 4);
      }
    }
    return data;
  }

  // Remplit un jeu de tuiles neuf avec les exemples et une petite carte (route, mare, hautes herbes).
  function fill(doc) {
    doc.tiles = TILES.map(([name, rows]) => ({ id: Doc.newId(), name, frames: [tileData(rows, doc.tileSize)], duration: Doc.DEFAULT_DURATION }));
    // L'eau est animée : 4 images où les vagues glissent vers la droite, en boucle (la tuile reste raccordable).
    const water = doc.tiles.find((t) => t.name === 'eau');
    const waterRows = TILES.find(([name]) => name === 'eau')[1];
    water.frames = [0, 4, 8, 12].map((dx) => tileData(waterRows.map((r) => r.slice(16 - dx) + r.slice(0, 16 - dx)), doc.tileSize));
    water.duration = 300;
    const { width: W, height: H } = doc.map;
    const [sol, decor] = doc.map.layers;
    const set = (cells, x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) cells[y * W + x] = v; };
    sol.cells.fill(0);
    const midY = Math.floor(H / 2), midX = Math.floor(W / 2) - 1;
    for (let x = 0; x < W; x++) set(sol.cells, x, midY, 2);
    for (let y = 0; y < midY; y++) set(sol.cells, midX, y, 2);
    for (let y = midY + 2; y < midY + 6; y++) for (let x = 2; x < 7; x++) set(sol.cells, x, y, 1);
    for (let y = midY + 2; y < midY + 6; y++) for (let x = W - 7; x < W - 2; x++) set(sol.cells, x, y, 3);
    for (const [x, y] of [[3, 2], [5, 4], [14, 2], [16, 4], [12, 5], [2, 5], [17, 1]]) set(decor.cells, x, y, 4);
    // Les nouvelles couleurs rejoignent la palette, pour pouvoir retoucher les exemples.
    for (const hex of Object.values(COLORS)) if (!doc.palette.includes(hex)) doc.palette.push(hex);
  }

  return { fill };
})();
