// Les modules de jeu, vus par le moteur (Saga 1.4).
//
// Un pack de règles (regles/) décide des combats et de la progression : un jeu en a exactement un. Un
// MODULE ajoute au monde une chose que le jeu sait faire en plus (gérer un domaine, plus tard le temps
// réel…) : un jeu en active zéro, un ou plusieurs, quel que soit son pack (reglages.modules).
//
// Le moteur ne connaît aucun module : il passe toujours par cet objet `Modules`, qui appelle chaque module
// actif du jeu, dans l'ordre de reglages.modules. Un module s'inscrit lui-même quand son fichier est lu
// (Modules.enregistrer), depuis son dossier modules/<id>/.
//
// La documentation complète (le contrat, ce qu'un module a le droit de faire, un exemple) : MODULES.md,
// à côté. La description des modules connus (pour Tafl) : commun/modules.js (ModulesJeu).
//
// Ce qu'un module fournit (tout est facultatif sauf id) :
//   id                                  son identifiant, celui de reglages.modules ('gestion')
//   nouvellePartie(o)                   prépare son état dans une partie toute neuve
//   preparer(o)                         remet à jour son état dans une partie chargée (ou neuve)
//   entrerCarte(o)                      le joueur arrive sur une carte (o.carte, o.depuis)
//   finDeJournee(o)                     le joueur dort : le jour o.jour se termine (Saga 1.5) ; → [lignes du rapport]
//   bloque(o, x, y)                     → true si la case (x, y) de o.carte est bloquée par le module
//   dessiner(o)                         dessine sur la carte, à la profondeur o.profondeur ('sol' | 'dessus')
//   commandes                           { type: async (o) → résultat } : ses commandes d'événement
//   condition(o, cond)                  → vrai, faux, ou undefined (une condition qu'il ne connaît pas)
//   actionsPause(o)                     → [[id, nom, icône]] : des choix en plus dans le menu de pause
//   agirPause(o, id)                    fait l'un de ces choix
//   pourScript(o)                       → ce qu'un script JS lit de lui (saga.modules[id]), des valeurs simples
//
// Chaque appel reçoit un objet o : { jeu, partie, etat, hote } (plus ce qui est propre à l'appel).
//   etat   = partie.modules[id] : le seul endroit de la partie qui appartient au module (sauvegardé tel quel)
//   hote   = ce que le moteur prête : reagir(moment, infos), rafraichir(), message(texte), ui (les menus) ;
//            Saga 1.5 : carte, joueur, libre(x, y), viser({ largeur, hauteur, valide }) → { x, y } ou null

const Modules = (() => {
  const INSCRITS = new Map(); // id → module

  // Un module s'inscrit quand son fichier est lu.
  function enregistrer(m) {
    if (!m || typeof m.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(m.id)) throw new Error('Un module a besoin d\'un id (minuscules, chiffres, tirets)');
    INSCRITS.set(m.id, m);
    return m;
  }
  const inscrits = () => [...INSCRITS.keys()];

  // Les erreurs d'un module ne cassent jamais le jeu : elles sont dites une fois par module et par appel
  // (dessiner est appelé à chaque image : une erreur répétée ne doit pas inonder le joueur).
  let signaler = (texte) => console.warn(texte);
  const dites = new Set();
  function brancher({ message } = {}) { if (typeof message === 'function') signaler = message; }
  function dire(id, quoi, err) {
    const cle = `${id}/${quoi}/${err?.message || err}`;
    if (dites.has(cle)) return;
    dites.add(cle);
    signaler(`Module « ${id} » (${quoi}) : ${err?.message || err}`);
  }

  const reglesDe = (jeu) => jeu?.donnees?.reglages?.reglages || {};
  const idsActifs = (jeu) => (typeof ModulesJeu !== 'undefined'
    ? ModulesJeu.actifs(reglesDe(jeu))
    : [...new Set((Array.isArray(reglesDe(jeu).modules) ? reglesDe(jeu).modules : []).filter((x) => typeof x === 'string'))]);

  // Les modules actifs du jeu, dans l'ordre de reglages.modules. Un module que ce Saga ne connaît pas est
  // ignoré (et dit une fois) : le jeu tourne sans lui.
  function actifs(jeu) {
    const out = [];
    for (const id of idsActifs(jeu)) {
      const m = INSCRITS.get(id);
      if (m) out.push(m);
      else dire(id, 'chargement', 'ce Saga ne connaît pas ce module : le jeu tourne sans lui');
    }
    return out;
  }
  const actif = (jeu, id) => idsActifs(jeu).includes(id) && INSCRITS.has(id);

  // L'état d'un module dans la partie : partie.modules[id], un objet JSON simple qu'il est seul à changer.
  function etat(partie, id) {
    if (!partie.modules || typeof partie.modules !== 'object' || Array.isArray(partie.modules)) partie.modules = {};
    const e = partie.modules[id];
    if (!e || typeof e !== 'object' || Array.isArray(e)) partie.modules[id] = {};
    return partie.modules[id];
  }

  // L'objet que reçoit chaque appel.
  const objet = (m, jeu, partie, hote, plus = {}) => ({ jeu, partie, etat: etat(partie, m.id), hote: hote || {}, ...plus });

  // Appelle `nom` sur chaque module actif qui l'a, en attrapant ses erreurs. Rend la liste des résultats.
  function chacun(jeu, nom, faire) {
    const out = [];
    for (const m of actifs(jeu)) {
      if (typeof m[nom] !== 'function') continue;
      try { out.push([m, faire(m)]); } catch (err) { dire(m.id, nom, err); }
    }
    return out;
  }

  return {
    enregistrer,
    inscrits,
    brancher,
    actifs: (jeu) => actifs(jeu).map((m) => m.id),
    actif,
    etat,
    // Une partie toute neuve : chaque module y prépare son état.
    nouvellePartie(jeu, partie, hote) {
      chacun(jeu, 'nouvellePartie', (m) => m.nouvellePartie(objet(m, jeu, partie, hote)));
    },
    // Toute partie (neuve ou chargée) : chaque module a son état (au moins {}) et le remet à jour.
    preparer(jeu, partie, hote) {
      for (const m of actifs(jeu)) etat(partie, m.id);
      chacun(jeu, 'preparer', (m) => m.preparer(objet(m, jeu, partie, hote)));
    },
    entrerCarte(jeu, partie, hote, carte, depuis) {
      chacun(jeu, 'entrerCarte', (m) => m.entrerCarte(objet(m, jeu, partie, hote, { carte, depuis })));
    },
    // Saga 1.5 : le joueur dort, le jour `jour` se termine. Chaque module fait son calcul (une seule fois
    // par jour : c'est à lui de s'en souvenir dans son état) et rend les lignes du rapport du matin.
    finDeJournee(jeu, partie, hote, jour) {
      return chacun(jeu, 'finDeJournee', (m) => m.finDeJournee(objet(m, jeu, partie, hote, { jour })))
        .flatMap(([, l]) => (Array.isArray(l) ? l : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.slice(0, 200)));
    },
    // Une case bloquée par un module (un bâtiment posé en jeu). Appelé souvent : doit rester rapide.
    bloque(jeu, partie, carte, x, y) {
      for (const m of actifs(jeu)) {
        if (typeof m.bloque !== 'function') continue;
        try { if (m.bloque(objet(m, jeu, partie, null, { carte }), x, y) === true) return true; } catch (err) { dire(m.id, 'bloque', err); }
      }
      return false;
    },
    // Dessiner sur la carte. o : { ctx, carte, cam, taille, maintenant, profondeur, tuile(n, cx, cy) }.
    dessiner(jeu, partie, o) {
      chacun(jeu, 'dessiner', (m) => m.dessiner(objet(m, jeu, partie, null, o)));
    },
    // La commande d'événement `type` d'un module actif, ou null. Elle reçoit o + { c, jouer, narrer, ui }.
    commande(jeu, type) {
      for (const m of actifs(jeu)) {
        if (m.commandes && Object.prototype.hasOwnProperty.call(m.commandes, type)) {
          return async (partie, hote, plus) => {
            try { return await m.commandes[type](objet(m, jeu, partie, hote, plus)); } catch (err) { dire(m.id, `commande ${type}`, err); return null; }
          };
        }
      }
      return null;
    },
    // Une condition de page d'un module : le premier qui répond autre chose que undefined décide.
    condition(jeu, cond, partie) {
      for (const m of actifs(jeu)) {
        if (typeof m.condition !== 'function') continue;
        try {
          const r = m.condition(objet(m, jeu, partie, null), cond);
          if (r !== undefined) return Boolean(r);
        } catch (err) { dire(m.id, 'condition', err); }
      }
      return undefined;
    },
    // Les choix des modules dans le menu de pause. Leur id devient « module:<id du module>:<id du choix> ».
    actionsPause(jeu, partie, hote = null) {
      return chacun(jeu, 'actionsPause', (m) => m.actionsPause(objet(m, jeu, partie, hote)))
        .flatMap(([m, l]) => (Array.isArray(l) ? l : []).filter((a) => Array.isArray(a) && a[0]).map(([id, nom, icone]) => [`module:${m.id}:${id}`, String(nom || id), icone || '']));
    },
    estActionPause: (id) => typeof id === 'string' && id.startsWith('module:'),
    async agirPause(jeu, partie, hote, id) {
      const [, mid, choix] = String(id).match(/^module:([^:]+):(.+)$/) || [];
      const m = INSCRITS.get(mid);
      if (!m || !actif(jeu, mid) || typeof m.agirPause !== 'function') return;
      try { await m.agirPause(objet(m, jeu, partie, hote), choix); } catch (err) { dire(mid, 'agirPause', err); }
    },
    // Ce que les scripts JS lisent des modules : saga.modules[id].
    pourScript(jeu, partie) {
      const out = {};
      for (const [m, v] of chacun(jeu, 'pourScript', (x) => x.pourScript(objet(x, jeu, partie, null)))) out[m.id] = v ?? null;
      return out;
    },
    // Pour les tests : oublier les erreurs déjà dites.
    _oublier() { dites.clear(); },
  };
})();
