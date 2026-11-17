// Edda : enregistrer puis rouvrir un document dans chaque format (Word, OpenDocument, RTF, Markdown,
// HTML) ne doit perdre ni le texte ni la mise en forme de base. Les formats ont besoin d'un vrai
// navigateur (DOMParser, éléments de la page) : on les charge dans Chromium, sans fenêtre.
// Il faut les modules d'Edda : npm ci --ignore-scripts dans texte/.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RACINE } = require('../charger');

const TEXTE = path.join(RACINE, 'texte');
const SCRIPTS = [
  'node_modules/jszip/dist/jszip.min.js', 'node_modules/marked/lib/marked.umd.js', 'node_modules/turndown/lib/turndown.browser.umd.js',
  'renderer/base.js', 'renderer/couleurs.js', 'renderer/formats/commun.js', 'renderer/formats/docx.js',
  'renderer/formats/odt.js', 'renderer/formats/rtf.js', 'renderer/formats/texte.js', 'renderer/stylesdoc.js',
];
const DOCUMENT = '<h1>Le titre</h1><h2>Une partie</h2>'
  + '<p>Un <b>mot gras</b>, un <i>italique</i> et des accents : été, €, « guillemets ».</p>'
  + '<ul><li>premier</li><li>second</li></ul><ol><li>un</li><li>deux</li></ol>'
  + '<table><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></table>';

const pret = fs.existsSync(path.join(TEXTE, 'node_modules/jszip'));

test('Edda : enregistrer puis rouvrir chaque format', { skip: !pret && 'lancer npm ci --ignore-scripts dans texte/' }, async (t) => {
  const { chromium } = require('playwright');
  const navigateur = await chromium.launch();
  t.after(() => navigateur.close());
  const page = await navigateur.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.setContent('<div id="page"></div>');
  for (const f of SCRIPTS) await page.addScriptTag({ path: path.join(TEXTE, f) });

  const resultats = await page.evaluate(async (html) => {
    const racine = document.getElementById('page');
    racine.innerHTML = html;
    const ctx = { page: racine, police: 'Calibri', taille: 11, styles: {}, cssStyles: '', listeStyles: [], titre: 'essai', dossierMedias: 'essai-medias', ranger: async (s) => s };
    const lu = {};
    for (const [id, format] of Object.entries(Formats.liste)) {
      if (id === 'txt') continue; // le texte seul perd la mise en forme, c'est voulu
      const { bytes } = await format.ecrire(ctx);
      const r = await format.lire(bytes, { racine: '' });
      const d = document.createElement('div');
      d.innerHTML = r.html.replace(/<\/(p|h[1-6]|li|td|th)>/g, ' $&'); // un espace à la fin de chaque bloc
      lu[id] = {
        texte: d.textContent.replace(/\s+/g, ' ').trim(),
        gras: [...d.querySelectorAll('b, strong')].map((e) => e.textContent.trim()),
        italique: [...d.querySelectorAll('i, em')].map((e) => e.textContent.trim()),
        titres: [...d.querySelectorAll('h1, h2')].map((e) => `${e.tagName}:${e.textContent.trim()}`),
        puces: d.querySelectorAll('ul > li').length,
        numeros: d.querySelectorAll('ol > li').length,
        cases: [...d.querySelectorAll('td, th')].map((e) => e.textContent.trim()),
      };
    }
    return lu;
  }, DOCUMENT);

  assert.deepEqual(erreurs, []);
  assert.deepEqual(Object.keys(resultats).sort(), ['docx', 'html', 'md', 'odt', 'rtf']);
  for (const [id, r] of Object.entries(resultats)) {
    assert.match(r.texte, /Le titre Une partie Un mot gras, un italique et des accents : été, €, « guillemets »\. premier second un deux A1 B1 A2 B2$/, id);
    assert.deepEqual(r.gras, ['mot gras'], id);
    assert.deepEqual(r.italique, ['italique'], id);
    assert.deepEqual(r.titres, ['H1:Le titre', 'H2:Une partie'], id);
    assert.equal(r.puces, 2, id);
    assert.equal(r.numeros, 2, id);
    assert.deepEqual(r.cases, ['A1', 'B1', 'A2', 'B2'], id);
  }
});
