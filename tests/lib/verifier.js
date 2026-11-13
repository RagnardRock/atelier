// De quoi dire ce qui ne va pas, en français.
function egal(vu, attendu, quoi) {
  const a = JSON.stringify(attendu), v = JSON.stringify(vu);
  if (a !== v) throw new Error(`${quoi} : attendu ${a}, trouvé ${v}`);
}
function vrai(v, quoi) { if (!v) throw new Error(quoi); }
function sansErreur(erreurs, ou) {
  if (erreurs.length) throw new Error(`${ou} : ${erreurs.length} erreur(s) dans la console\n${erreurs.slice(0, 5).join('\n')}`);
}
module.exports = { egal, vrai, sansErreur };
