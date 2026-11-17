// Reikna : la traduction des formules (français ↔ moteur de calcul) et la lecture de ce qu'on tape
// dans une cellule. Une erreur ici donnerait de faux résultats sans rien afficher d'anormal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { charger } = require('../charger');

const { Formules } = charger('tableur/renderer', ['fonctions.js', 'formules.js']);
// Un petit dictionnaire de fonctions, à la place de celui d'HyperFormula.
Formules.preparer(
  { getRegisteredFunctionNames: () => ['SUM', 'IF', 'AVERAGE', 'ROUND'] },
  { functions: { SUM: 'SOMME', IF: 'SI', AVERAGE: 'MOYENNE', ROUND: 'ARRONDI' } },
);

test('formule française → moteur', () => {
  assert.equal(Formules.versMoteur('=SOMME(A1:A3; 2,5)'), '=SUM(A1:A3, 2.5)');
  assert.equal(Formules.versMoteur('=SI(A1>0; "oui; non"; 1,5)'), '=IF(A1>0, "oui; non", 1.5)');
  assert.equal(Formules.versMoteur('=ARRONDI(MOYENNE(B1:B9); 2)'), '=ROUND(AVERAGE(B1:B9), 2)');
});

test('formule moteur → français', () => {
  assert.equal(Formules.versAffichage('=SUM(A1:A3, 2.5)'), '=SOMME(A1:A3; 2,5)');
  assert.equal(Formules.versAffichage('=IF(A1>0, "a, b", 0.5)'), '=SI(A1>0; "a, b"; 0,5)');
});

test('aller-retour sans perte', () => {
  for (const f of ['=SOMME(A1:B2; C3)', '=SI(ET(A1>1; B1<2); "x"; "y")', "='Feuille 2'!A1*2,5"]) {
    assert.equal(Formules.versAffichage(Formules.versMoteur(f)), f);
  }
});

test('ce qu\'on tape dans une cellule', () => {
  const lu = (t) => JSON.parse(JSON.stringify(Formules.lireSaisie(t)));
  assert.deepEqual(lu('12,5'), { contenu: 12.5 });
  assert.deepEqual(lu('15 %'), { contenu: 0.15, format: '0%' });
  assert.equal(lu('12 €').contenu, 12);
  assert.equal(lu('vrai').contenu, true);
  assert.equal(lu('bonjour').contenu, "'bonjour");
  // Le 24/10/2026 est le jour 46319 d'Excel.
  assert.deepEqual(lu('24/10/2026'), { contenu: 46319, format: 'dd/mm/yyyy' });
});

test('dates ↔ numéros de série', () => {
  const s = Formules.dateVersSerie(2026, 10, 24);
  assert.equal(s, 46319);
  assert.equal(Formules.serieVersDate(s).toISOString().slice(0, 10), '2026-10-24');
  // 1er mars 1900 : après le faux 29 février 1900 d'Excel.
  assert.equal(Formules.serieVersDate(61).toISOString().slice(0, 10), '1900-03-01');
});
