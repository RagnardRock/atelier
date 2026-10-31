// Ce que décide un ennemi du temps réel (Saga 1.12), à chaque instant de réflexion (quelques fois par seconde).
//
// Une fonction pure : elle reçoit l'état de l'ennemi et ce qu'il voit, et rend sa décision. Elle ne bouge
// rien elle-même : temps-reel.js déplace l'ennemi vers `but` (par le chemin A* de moteur/chemins.js), le
// fait fuir, ou frapper. Un script JS du jeu peut prendre la place de cette fonction pour un ennemi
// (comportement « script » dans Tafl : comportement('nom', (etat) => decision) dans le script, SCRIPTS.md).
//
//   decider(etat) → { etat, but, fuir, frapper }
//   etat : {
//     comportement   'patrouiller' | 'suivre' | 'garde' | 'fuir' | 'immobile'
//     etat           ce qu'il faisait : 'repos' | 'promenade' | 'chasse' | 'retour' | 'fuite'
//     x, y           où il est (en cases, nombres à virgule) ; depart : { x, y } où il est apparu
//     joueur         { x, y } (en cases) ; distance : jusqu'au joueur (en cases)
//     vue            la distance (en cases) à laquelle il remarque le joueur
//     portee         la distance d'où il frappe (0 = au contact seulement) ; pret : sa recharge est finie
//     pv, pvMax      sa vie ; hasard : un nombre entre 0 et 1 (tiré pour cette décision)
//   }
//   décision : etat (le nouveau), but ({ x, y } : une case à rejoindre, ou null pour rester), fuir (true :
//   s'éloigner du joueur), frapper (true : lancer son attaque maintenant).

const Comportements = (() => {
  const RAYON_PROMENADE = 3; // cases autour de son départ

  function promenade(e) {
    // De temps en temps, une case au hasard près de son départ ; sinon il continue ou il attend.
    if (e.etat === 'promenade' && e.but && e.hasard < 0.75) return { etat: 'promenade', but: e.but };
    if (e.hasard < 0.45) return { etat: 'repos', but: null };
    const a = e.hasard * 97.13, r = 1 + Math.floor((e.hasard * 13.7) % RAYON_PROMENADE);
    return { etat: 'promenade', but: { x: Math.round(e.depart.x + Math.cos(a) * r), y: Math.round(e.depart.y + Math.sin(a) * r) } };
  }

  function decider(e) {
    const voit = e.distance <= e.vue;
    const aPortee = e.portee > 0 && e.distance <= e.portee + 0.15;
    const chasse = () => ({ etat: 'chasse', but: { x: Math.round(e.joueur.x), y: Math.round(e.joueur.y) }, frapper: aPortee && e.pret });
    switch (e.comportement) {
      case 'immobile':
        return { etat: 'repos', but: null, frapper: voit && aPortee && e.pret };
      case 'fuir':
        // Il s'éloigne quand le joueur approche ; coincé tout près, il se défend.
        if (voit) return { etat: 'fuite', but: null, fuir: e.distance > 1.2, frapper: aPortee && e.pret };
        return promenade(e);
      case 'garde':
        // Il garde sa place : il chasse le joueur qui approche, puis revient.
        if (voit) return chasse();
        if (Math.hypot(e.x - e.depart.x, e.y - e.depart.y) > 0.6) return { etat: 'retour', but: { x: e.depart.x, y: e.depart.y } };
        return { etat: 'repos', but: null };
      case 'suivre':
        // Une fois qu'il t'a vu, il te suit plus loin que sa vue.
        if (voit || (e.etat === 'chasse' && e.distance <= e.vue * 2)) return chasse();
        return { etat: 'repos', but: null };
      case 'patrouiller':
      default:
        if (voit || (e.etat === 'chasse' && e.distance <= e.vue * 1.5)) return chasse();
        return promenade(e);
    }
  }

  // Une décision venue d'un script : on ne garde que ce qui a du sens.
  function nettoyer(d, avant) {
    if (!d || typeof d !== 'object') return avant;
    const but = d.but && Number.isFinite(Number(d.but.x)) && Number.isFinite(Number(d.but.y)) ? { x: Math.round(Number(d.but.x)), y: Math.round(Number(d.but.y)) } : null;
    return { etat: typeof d.etat === 'string' ? d.etat.slice(0, 30) : avant?.etat || 'repos', but, fuir: Boolean(d.fuir), frapper: Boolean(d.frapper) };
  }

  return { decider, nettoyer };
})();
