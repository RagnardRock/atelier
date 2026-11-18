// Rune : Ctrl+clic sur un lien d'une page HTML. Le chemin visé part du dossier du fichier
// (« vie.html »), ou du dossier ouvert pour « /… », comme dans un navigateur.
const test = require('node:test');
const assert = require('node:assert/strict');
const { charger } = require('../charger');

const { Liens } = charger('ide/renderer', ['liens.js']);
const W = (ref, depuis = 'D:\\Projets\\site\\pages\\index.html') => Liens.resoudre(ref, depuis, 'D:\\Projets\\site', '\\');

test('Rune : liens relatifs au fichier (Windows)', () => {
  assert.equal(W('vie.html'), 'D:\\Projets\\site\\pages\\vie.html');
  assert.equal(W('./vie.html#equipe'), 'D:\\Projets\\site\\pages\\vie.html');
  assert.equal(W('../css/style.css?v=2'), 'D:\\Projets\\site\\css\\style.css');
  assert.equal(W('blog/'), 'D:\\Projets\\site\\pages\\blog\\index.html');
  assert.equal(W('mon%20fichier.html'), 'D:\\Projets\\site\\pages\\mon fichier.html');
});

test('Rune : « /… » part du dossier ouvert', () => {
  assert.equal(W('/images/logo.png'), 'D:\\Projets\\site\\images\\logo.png');
  assert.equal(Liens.resoudre('/a.html', '/home/r/site/b/c.html', '/home/r/site', '/'), '/home/r/site/a.html');
  assert.equal(Liens.resoudre('../../x.html', '/home/r/site/b/c.html', '/home/r/site', '/'), '/home/r/x.html');
});

test('Rune : ce qui n\'est pas un fichier est ignoré', () => {
  for (const ref of ['#haut', 'https://exemple.fr', '//cdn.exemple.fr/a.js', 'mailto:a@b.fr', 'tel:0102', 'javascript:void(0)', '{{ url }}', '']) {
    assert.equal(W(ref), null, ref);
  }
});

test('Rune : liens trouvés dans le HTML', () => {
  const html = '<a href="vie.html">Vie</a><img src=\'img/a.png\'><a href="">x</a>';
  const liens = Liens.trouver(html);
  assert.deepEqual([...liens.map((l) => l.ref)], ['vie.html', 'img/a.png']);
  for (const l of liens) assert.equal(html.slice(l.debut, l.fin), l.ref);
});
