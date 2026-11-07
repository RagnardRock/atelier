// Les textes du jeu remplis au moment de les dire (Saga 1.22). Pur, sans écran : testable avec node.
//
//   {joueur}       le nom du joueur (comme depuis Tafl 0.7)
//   {var:id}       la valeur de la variable id (donnees/variables.json) : « Il te reste {var:or} pièces. »
//   {a|b}          une forme parmi plusieurs, selon la variable des accords (reglages.accords) :
//                  « Tu es arrivé{|e} », « {Il|Elle} est {prêt|prête} ». La 1re forme va avec la 1re valeur
//                  de accords.valeurs, la 2e avec la 2e, et ainsi de suite ; une valeur inconnue (ou pas de
//                  réglage) prend la 1re forme. Autant de formes qu'on veut (homme|femme|autre…).
//
// reglages.accords : { variable: 'sexe', valeurs: ['homme', 'femme'] }. Rien n'est propre à un jeu : la
// variable peut aussi bien dire le sexe du héros, sa classe ou son peuple.

const Textes = (() => {
  const FORMES = /\{([^{}|]*(?:\|[^{}]*)+)\}/g;
  const VARIABLE = /\{var:([a-z0-9][a-z0-9_-]{0,63})\}/gi;

  // Quelle forme prendre (0 = la première), selon la variable des accords.
  function forme(accords, variables) {
    const id = typeof accords?.variable === 'string' ? accords.variable : '';
    const valeurs = Array.isArray(accords?.valeurs) ? accords.valeurs.map((v) => String(v ?? '').trim().toLowerCase()) : [];
    if (!id || !valeurs.length) return 0;
    const v = String(variables?.[id] ?? '').trim().toLowerCase();
    const k = valeurs.indexOf(v);
    return k < 0 ? 0 : k;
  }

  // Le texte rempli. o : { nom, variables, accords }.
  function remplir(t, o = {}) {
    const vars = o.variables && typeof o.variables === 'object' ? o.variables : {};
    const k = forme(o.accords, vars);
    return String(t ?? '')
      .replace(/\{joueur\}/g, o.nom ?? '')
      .replace(VARIABLE, (_, id) => { const v = vars[id] ?? vars[id.toLowerCase()]; return v === undefined || v === null ? '' : String(v); })
      .replace(FORMES, (_, corps) => { const l = corps.split('|'); return l[Math.min(k, l.length - 1)]; });
  }

  return { remplir, forme };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Textes;
