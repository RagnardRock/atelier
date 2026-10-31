// Les bonus du groupe (Saga 1.11) : un effet passager sur les statistiques de combat de tout le groupe du
// joueur. Un bain chaud (Défense +10 % pour les 3 prochains combats), un bon repas (Force +5 % jusqu'à la
// nuit), une bénédiction… C'est une base du moteur, pour tous les jeux : la commande « bonus » (Tafl) et les
// modules (le module gestion : les bâtiments de repos, par hote.bonus) en donnent ; les packs qui savent
// s'en servir les appliquent en combat (REGLES.md › 1.5).
//
// Dans la partie (partie.bonus, une liste d'objets JSON simples) :
//   { id, nom, stats: { stat: pourcent }, combats, nuit }
//   id       ce qui le donne ('bains', 'gestion:spa') : un nouveau bonus du même id remplace l'ancien
//   nom      ce que voit le joueur (« Bains chauds »)
//   stats    les statistiques du pack touchées, en % (+10 : ×1,1 ; −20 : ×0,8), de −90 à +200
//   combats  combien de combats il dure encore (0 : pas de limite en combats)
//   nuit     true : il s'efface quand le joueur dort (commande dormir)
// Un bonus sans limite (combats 0, nuit false) dure jusqu'à ce qu'on le retire (commande bonus › retirer).
//
// Tout ici est pur et sans écran : ce sont le moteur (moteur.js, scripts.js) et les packs qui l'appellent.

const Bonus = (() => {
  const ID = /^[a-z0-9][a-z0-9:_-]{0,79}$/;
  const MAX = 12;
  const entier = (v, d, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const texte = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // Les stats d'un bonus : un objet { stat: % } ou une liste [{ stat, pourcent }] (celle de Tafl).
  function stats(v) {
    const out = {};
    const paires = Array.isArray(v) ? v.map((q) => [q?.stat, q?.pourcent]) : v && typeof v === 'object' ? Object.entries(v) : [];
    for (const [s, p] of paires) {
      if (typeof s !== 'string' || !/^[a-z_]{1,32}$/.test(s)) continue;
      const n = entier(p, 0, -90, 200);
      if (n) out[s] = Math.min(200, Math.max(-90, (out[s] || 0) + n));
    }
    return out;
  }
  // Un bonus remis en forme (ou null s'il ne fait rien).
  function normaliser(b) {
    if (!b || typeof b !== 'object') return null;
    const s = stats(b.stats);
    if (!Object.keys(s).length) return null;
    const id = typeof b.id === 'string' && ID.test(b.id) ? b.id : `bonus-${Object.keys(s).join('-')}`;
    return { id, nom: texte(b.nom, 60) || 'Bonus', stats: s, combats: entier(b.combats, 0, 0, 99), nuit: Boolean(b.nuit) };
  }
  // La liste de la partie, remise en forme (une sauvegarde d'avant Saga 1.11 n'en a pas).
  function liste(partie) {
    if (!partie) return [];
    if (!Array.isArray(partie.bonus)) partie.bonus = [];
    const vus = new Set();
    partie.bonus = partie.bonus.map(normaliser).filter((b) => b && !vus.has(b.id) && vus.add(b.id)).slice(-MAX);
    return partie.bonus;
  }

  // Donner un bonus : il remplace celui du même id. Rend le bonus donné, ou null.
  function donner(partie, b) {
    const n = normaliser(b);
    if (!n || !partie) return null;
    const l = liste(partie).filter((x) => x.id !== n.id);
    l.push(n);
    partie.bonus = l.slice(-MAX);
    return n;
  }
  // Retirer un bonus (par son id ; '' : tous). Rend ceux qui sont partis.
  function retirer(partie, id = '') {
    const l = liste(partie);
    const partis = l.filter((x) => !id || x.id === id);
    partie.bonus = l.filter((x) => id && x.id !== id);
    return partis;
  }
  // Après chaque combat (gagné, perdu ou fui) : un combat de moins. Rend ceux qui s'effacent.
  function apresCombat(partie) {
    const l = liste(partie);
    const finis = [];
    for (const b of l) if (b.combats > 0 && --b.combats === 0) finis.push(b);
    partie.bonus = l.filter((b) => !finis.includes(b));
    return finis;
  }
  // Quand le joueur dort : ceux qui durent « jusqu'à la nuit » s'effacent. Rend ceux qui s'effacent.
  function nuit(partie) {
    const l = liste(partie);
    const finis = l.filter((b) => b.nuit);
    partie.bonus = l.filter((b) => !b.nuit);
    return finis;
  }
  const actif = (partie, id) => liste(partie).some((b) => b.id === id);

  // Ce que vaut une statistique du groupe avec les bonus : le multiplicateur (1,1 pour +10 %). Les bonus
  // s'additionnent (+10 % et +5 % : ×1,15), sans descendre sous ×0,1.
  function mult(partie, stat) {
    let p = 0;
    for (const b of Array.isArray(partie?.bonus) ? partie.bonus : []) p += Number(b?.stats?.[stat]) || 0;
    return Math.max(0.1, 1 + p / 100);
  }

  // « Défense +10 %, Force +5 % » ; noms : { stat: nom } (ceux du pack), sinon l'id de la stat.
  const dire = (b, noms = {}) => Object.entries(b.stats).map(([s, p]) => `${noms[s] || s} ${p > 0 ? '+' : '−'}${Math.abs(p)} %`).join(', ');
  // « pour 3 combats », « jusqu'à la nuit », « pour 2 combats, jusqu'à la nuit au plus tard »
  function duree(b) {
    const c = b.combats ? `pour ${b.combats} combat${b.combats > 1 ? 's' : ''}` : '';
    if (c && b.nuit) return `${c}, jusqu'à la nuit au plus tard`;
    return c || (b.nuit ? 'jusqu\'à la nuit' : '');
  }

  return { normaliser, liste, donner, retirer, apresCombat, nuit, actif, mult, dire, duree, stats };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Bonus;
