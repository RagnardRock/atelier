// Rune : panneau Bifrost. Lecture des flags data-bf d'une page et erreurs signalées au dev.
const test = require('node:test');
const assert = require('node:assert/strict');
const { charger } = require('../charger');

const { BifrostFlags: F } = charger('ide/renderer', ['bifrost-flags.js']);

const PAGE = `<!doctype html>
<html><head><title>Accueil</title><script>const x = '<div data-bf="pas-un-flag">';</script></head>
<body>
  <h1 data-bf="accueil.titre">Bienvenue</h1>
  <img data-bf="accueil.photo" src="a.jpg" alt="">
  <div data-bf="accueil.texte" data-bf-type="riche"><p>Texte <b data-bf="dedans">x</b></p></div>
  <!-- <p data-bf="commentaire"> -->
  <ul data-bf-liste="actualites" data-bf-limite="3">
    <li data-bf-element><h3 data-bf="titre">A</h3><p data-bf="titre">B</p></li>
  </ul>
  <ul data-bf-liste="vide"></ul>
  <form data-bf-formulaire="contact"><input name="nom"><textarea></textarea><button>Envoyer</button></form>
  <form data-bf-formulaire=""></form>
</body></html>`;

test('Rune Bifrost : les zones, leur type et leur ligne', () => {
  const a = F.analyser(PAGE);
  const cles = a.champs.map((c) => c.cle);
  assert.deepEqual([...cles], ['accueil.titre', 'accueil.photo', 'accueil.texte', 'dedans', 'titre', 'titre']);
  assert.equal(a.champs[0].type, 'texte');
  assert.equal(a.champs[0].ligne, 4);
  assert.equal(a.champs[1].type, 'image');
  assert.equal(a.champs[2].type, 'riche');
  assert.equal(a.champs[4].liste, 'actualites');
  assert.equal(JSON.stringify(a.listes.map((l) => [l.nom, l.elements, l.limite])), JSON.stringify([['actualites', 1, 3], ['vide', 0, null]]));
  assert.equal(a.formulaires[0].nom, 'contact');
});

test('Rune Bifrost : les erreurs signalées', () => {
  const m = F.analyser(PAGE).erreurs.map((e) => `${e.ligne}:${e.gravite}:${e.message}`);
  const a = (bout) => assert.ok(m.some((x) => x.includes(bout)), `${bout}\n${m.join('\n')}`);
  a('« dedans » est dans un texte riche');
  a('« titre » apparaît 2 fois dans le même élément');
  a('« vide » n\'a aucun modèle d\'élément');
  a('sans name');
  a('Formulaire sans nom');
  assert.ok(!m.some((x) => x.includes('pas-un-flag') || x.includes('commentaire')));
});

test('Rune Bifrost : même nom sur la page avec des types différents', () => {
  const e = F.analyser('<h1 data-bf="logo">A</h1><img data-bf="logo" src="x">').erreurs;
  assert.equal(e[0].gravite, 'erreur');
  assert.equal(F.analyser('<p data-bf="tel">1</p><p data-bf="tel">1</p>').erreurs[0].gravite, 'info');
  assert.equal(F.analyser('<h1 data-bf="titre">Des prix</h1><h2 data-bf="titre">Par jour</h2>').erreurs[0].gravite, 'attention');
  assert.match(F.analyser('<li data-bf-element><p data-bf="a">x</p></li>').erreurs[0].message, /hors d'une liste/);
});

test('Rune Bifrost : tout le site', () => {
  const r = F.analyserSite([
    { chemin: 'index.html', html: '<p data-bf="site.nom">A</p>' },
    { chemin: 'contact.html', html: '<img data-bf="site.nom" src="x">' },
    { chemin: 'actus/modele.html', html: '<article data-bf-page="actus"></article>' },
  ]);
  assert.equal(r.modeles.actus, 'actus/modele.html');
  assert.ok(r.erreurs.some((e) => e.message.includes('aucune page n\'a de liste')));
  assert.ok(r.erreurs.some((e) => e.message.includes('« site.nom » n\'a pas le même type')));
});

test('Rune Bifrost : balise sous le curseur, nom proposé, insertion', () => {
  const html = '<div class="a">\n  <h2 class="t">Nos valeurs</h2>\n  <p>x</p>\n</div>';
  assert.equal(F.baliseA(html, html.indexOf('class="t"')).tag, 'h2');
  assert.equal(F.baliseA(html, html.indexOf('Nos')).tag, 'h2');
  assert.equal(F.baliseA(html, html.indexOf('\n  <p>') + 1).tag, 'div');
  const b = F.baliseA(html, html.indexOf('Nos'));
  const ins = F.insertion(b, 'data-bf="vie.titre"');
  assert.equal(html.slice(0, ins.offset) + ins.texte + html.slice(ins.offset), html.replace('<h2 class', '<h2 data-bf="vie.titre" class'));
  assert.equal(F.nomPropose('pages/vie.html', 'h2', 'Nos valeurs'), 'vie.sous-titre');
  assert.equal(F.nomPropose('index.html', 'h1', '', ['accueil.titre']), 'accueil.titre-2');
  assert.equal(F.nomPropose('index.html', 'span', 'Téléphone du bureau'), 'accueil.telephone-bureau');
});

test('Rune Bifrost : insérer un bloc (préfixes, chemins relatifs, feuille)', () => {
  assert.deepEqual([...F.prefixes('<h2 data-bf="galerie.titre"><ul data-bf-liste="cartes">')], ['galerie', 'cartes']);
  assert.equal(F.cheminsRelatifs('<a href="contact.html"><img src="data:image/svg+xml,x"><a href="#x">', 'actualites/2026'),
    '<a href="../../contact.html"><img src="data:image/svg+xml,x"><a href="#x">');
  assert.equal(F.cheminsRelatifs('<a href="contact.html">', '.'), '<a href="contact.html">');
  const page = '<html>\n<head>\n  <link rel="stylesheet" href="assets/style.css">\n</head>\n<body></body></html>';
  const p = F.placeFeuille(page, 'assets/bifrost-blocs.css');
  assert.equal(page.slice(0, p.offset) + p.texte + page.slice(p.offset),
    '<html>\n<head>\n  <link rel="stylesheet" href="assets/style.css">\n  <link rel="stylesheet" href="assets/bifrost-blocs.css">\n</head>\n<body></body></html>');
  assert.equal(F.placeFeuille(page, '../assets/style.css'), null);
  assert.equal(F.indenter('<a>\n<b>\n</a>', '  '), '<a>\n  <b>\n  </a>');
});
