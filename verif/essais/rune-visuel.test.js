// Rune : mode visuel de l'aperçu. Retrouver l'élément cliqué, déplacer une section, placer un bloc.
const test = require('node:test');
const assert = require('node:assert/strict');
const { charger } = require('../charger');

const { VisuelTexte: V } = charger('ide/renderer', ['bifrost-flags.js', 'visuel-texte.js']);

const PAGE = `<!doctype html>
<html>
<head><title>A</title><script>const s = '<section>';</script></head>
<body>
  <main>
    <section id="a">
      <h1>A</h1>
    </section>
    <section id="b"><p>B</p></section>
    <section id="c">
      <p>C <img src="x.png"></p>
    </section>
  </main>
</body>
</html>
`;
const pos = (id) => PAGE.indexOf(`<section id="${id}"`);

test('Rune visuel : chaque balise de la page servie porte sa position', () => {
  const h = V.annoter(PAGE);
  assert.match(h, new RegExp(`<section data-rune="${pos('b')}" id="b">`));
  assert.match(h, /<script data-rune="\d+">const s = '<section>';<\/script>/); // pas dans le script
  // retirer les marques redonne le texte d'origine
  assert.equal(h.replace(/ data-rune="\d+"/g, ''), PAGE);
});

test('Rune visuel : trouver l’élément, avec sa balise fermante', () => {
  const e = V.trouver(PAGE, pos('b'), 'section');
  assert.equal(PAGE.slice(e.debut, e.finEl), '<section id="b"><p>B</p></section>');
  assert.equal(V.trouver(PAGE, pos('b'), 'div'), null);
  assert.equal(V.trouver(PAGE, pos('b') + 1), null);
  const img = V.trouver(PAGE, PAGE.indexOf('<img'));
  assert.equal(PAGE.slice(img.debut, img.finEl), '<img src="x.png">');
});

test('Rune visuel : déplacer une section garde l’indentation', () => {
  const r = V.deplacer(PAGE, pos('c'), pos('a'), false);
  const h = V.appliquer(PAGE, r);
  assert.ok(h.includes(`  <main>
    <section id="c">
      <p>C <img src="x.png"></p>
    </section>
    <section id="a">`));
  assert.ok(h.includes('<section id="b"><p>B</p></section>\n  </main>'));
  // descendre la première après la deuxième
  const h2 = V.appliquer(PAGE, V.deplacer(PAGE, pos('a'), pos('b'), true));
  assert.ok(h2.indexOf('id="b"') < h2.indexOf('id="a"') && h2.indexOf('id="a"') < h2.indexOf('id="c"'));
  assert.equal(h2.split('\n').length, PAGE.split('\n').length);
  // déjà à sa place, ou dans elle-même : rien
  assert.equal(V.deplacer(PAGE, pos('b'), pos('a'), true), null);
  assert.equal(V.deplacer(PAGE, pos('a'), PAGE.indexOf('<h1>'), true), null);
});

test('Rune visuel : où insérer un bloc avant ou après une section', () => {
  const p = V.place(PAGE, V.trouver(PAGE, pos('b')), true);
  const h = PAGE.slice(0, p.offset) + p.avant + '<section id="n"></section>' + p.apres + PAGE.slice(p.offset);
  assert.ok(h.includes('<section id="b"><p>B</p></section>\n    <section id="n"></section>\n    <section id="c">'));
  const q = V.place(PAGE, V.trouver(PAGE, pos('a')), false);
  const h2 = PAGE.slice(0, q.offset) + q.avant + '<x></x>' + q.apres + PAGE.slice(q.offset);
  assert.ok(h2.includes('  <main>\n    <x></x>\n    <section id="a">'));
});
