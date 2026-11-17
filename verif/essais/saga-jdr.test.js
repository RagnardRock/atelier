// Saga, pack JDR : les dés (graine gardée dans la partie) et les petits calculs de D&D 5e.
// Ces fonctions sont pures (partie en entrée, résultat en sortie) : on les essaie sans fenêtre.
const test = require('node:test');
const assert = require('node:assert/strict');
const { charger } = require('../charger');

const { JdrBase: B, JdrDes: D } = charger('moteur/renderer/moteur/regles/jdr', ['base.js', 'des.js']);

test('modificateur et bonus de maîtrise', () => {
  assert.deepEqual([1, 8, 10, 11, 15, 20].map(B.mod), [-5, -1, 0, 0, 2, 5]);
  assert.deepEqual([1, 4, 5, 9, 13, 17, 20].map(B.maitrise), [2, 2, 3, 4, 5, 6, 6]);
});

test('lire une formule de dés', () => {
  assert.deepEqual({ ...B.lireDes('2d6+3') }, { n: 2, faces: 6, bonus: 3 });
  assert.deepEqual({ ...B.lireDes('d20') }, { n: 1, faces: 20, bonus: 0 });
  assert.deepEqual({ ...B.lireDes('1d8 − 1') }, { n: 1, faces: 8, bonus: -1 });
  assert.equal(B.lireDes('n\'importe quoi'), null);
  assert.equal(B.moyenne('2d6+3'), 10);
});

test('même graine, mêmes dés (recharger une sauvegarde rejoue les jets)', () => {
  const a = { jdr: { graine: 1234 } }, b = { jdr: { graine: 1234 } };
  const suite = (p) => Array.from({ length: 20 }, () => D.d(p, 20));
  const sa = suite(a);
  assert.deepEqual(sa, suite(b));
  assert.ok(sa.every((v) => v >= 1 && v <= 20));
});

test('un jet : le total suit les dés', () => {
  const p = { jdr: { graine: 42 } };
  for (let i = 0; i < 50; i++) {
    const r = D.lancer(p, '2d6+3');
    assert.equal(r.des.length, 2);
    assert.equal(r.total, r.des.reduce((t, x) => t + x.valeur, 0) + 3);
    assert.ok(r.total >= 5 && r.total <= 15);
  }
  assert.equal(D.lancer(p, '1d4-1').bonus, -1);
  // Coup critique : les dés sont lancés deux fois (doubler), ou une moitié au maximum (max).
  assert.equal(D.lancer(p, '1d8+2', { doubler: true }).des.length, 2);
  const max = D.lancer(p, '1d6', { max: true });
  assert.equal(max.des.length, 2);
  assert.equal(max.des[0].valeur, 6);
  assert.equal(D.lancer(p, '5d4*10').total % 10, 0);
  assert.equal(D.lancer(p, 'pas une formule').total, 0);
});

test('d20 avec avantage garde le meilleur, avec désavantage le pire', () => {
  const p = { jdr: { graine: 7 } };
  for (let i = 0; i < 30; i++) {
    const av = D.d20(p, { avantage: true });
    assert.equal(av.naturel, Math.max(...av.des.map((x) => x.valeur)));
    const des = D.d20(p, { desavantage: true });
    assert.equal(des.naturel, Math.min(...des.des.map((x) => x.valeur)));
    assert.equal(D.d20(p, { avantage: true, desavantage: true }).des.length, 1);
  }
});

test('le journal garde les 200 derniers jets', () => {
  const p = { jdr: { graine: 1 } };
  for (let i = 0; i < 250; i++) D.noter(p, { quoi: `jet ${i}`, total: i });
  assert.equal(p.jdr.journal.length, D.MAX_JOURNAL);
});
