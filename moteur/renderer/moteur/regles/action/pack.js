// Le pack « action » (Saga 1.12) : les règles d'un jeu en temps réel, façon Zelda. Le joueur se déplace
// librement et frappe à l'épée ; les ennemis le poursuivent sur la carte (action/temps-reel.js). Ce fichier
// ne fait que les calculs : la vie du héros (des cœurs), les dégâts, le recul, l'expérience, le butin, le
// bestiaire. Il ne voit ni la carte ni l'écran : le mode temps réel du moteur lui pose des questions et
// applique ses réponses (état entrant → résultat sortant).
//
// Données (FORMAT.md › « Le pack action ») :
//   donnees/ennemis.json   { ennemis: [{ id, nom, numero, personnage, couleur, pv, attaque, defense,
//                            vitesse, vue, comportement, script, portee, recharge, contact, poids,
//                            xp, argent, coeur, butin: [{ objet, chance }], description, boss }] }
//   reglages.action        { coeurs, pv_coeur, attaque, defense, vitesse, invincibilite, recul,
//                            pv_niveau, attaque_niveau, xp_niveau }
// Le héros est le personnage « héros » de personnages.json : partie.equipe[0], un seul membre.

const ActionRegles = (() => {
  const nombre = (v, d, min = -Infinity, max = Infinity) => {
    const n = Number(v);
    return v !== '' && v !== null && v !== undefined && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
  };
  const liste = (jeu, sorte) => jeu.donnees[sorte]?.[sorte] || [];
  const trouver = (jeu, sorte, id) => liste(jeu, sorte).find((o) => o && o.id === id) || null;

  // Les réglages du héros (Tafl › Données › Réglages › Règles du jeu, pack action).
  const REGLAGES = { coeurs: 3, pv_coeur: 4, attaque: 2, defense: 0, vitesse: 5, invincibilite: 1, recul: 1.5, pv_niveau: 2, attaque_niveau: 1, xp_niveau: 20, niveau_max: 30 };
  function reglages(jeu) {
    const r = jeu.donnees.reglages?.reglages || {}, a = r.action || {};
    return {
      coeurs: Math.round(nombre(a.coeurs, REGLAGES.coeurs, 1, 40)),
      pv_coeur: Math.round(nombre(a.pv_coeur, REGLAGES.pv_coeur, 1, 100)),
      attaque: nombre(a.attaque, REGLAGES.attaque, 0, 999),
      defense: nombre(a.defense, REGLAGES.defense, 0, 999),
      vitesse: nombre(a.vitesse, REGLAGES.vitesse, 1, 20),          // cases par seconde
      invincibilite: nombre(a.invincibilite, REGLAGES.invincibilite, 0, 5), // secondes après un coup reçu
      recul: nombre(a.recul, REGLAGES.recul, 0, 6),                  // cases de recul quand on est touché
      pv_niveau: nombre(a.pv_niveau, REGLAGES.pv_niveau, 0, 100),
      attaque_niveau: nombre(a.attaque_niveau, REGLAGES.attaque_niveau, 0, 100),
      xp_niveau: Math.round(nombre(a.xp_niveau, REGLAGES.xp_niveau, 1, 100000)),
      niveau_max: Math.round(nombre(r.niveau_max, REGLAGES.niveau_max, 1, 999)),
    };
  }

  // --- Les ennemis ---
  const COMPORTEMENTS = ['patrouiller', 'suivre', 'garde', 'fuir', 'immobile', 'script'];
  function ennemi(jeu, id) {
    const e = trouver(jeu, 'ennemis', id);
    if (!e) return null;
    return {
      id: e.id, nom: e.nom || e.id, numero: Math.round(nombre(e.numero, 0, 0)), description: String(e.description || ''),
      personnage: String(e.personnage || ''), couleur: /^#[0-9a-f]{6}$/i.test(e.couleur || '') ? e.couleur : '#9b59d0',
      pv: Math.round(nombre(e.pv, 3, 1, 99999)), attaque: nombre(e.attaque, 1, 0, 9999), defense: nombre(e.defense, 0, 0, 9999),
      vitesse: nombre(e.vitesse, 2.5, 0, 20), vue: nombre(e.vue, 5, 0, 40),
      comportement: COMPORTEMENTS.includes(e.comportement) ? e.comportement : 'patrouiller',
      script: typeof e.script === 'string' ? e.script : '',
      // portee : la distance (en cases) d'où il frappe ; 0 = il ne frappe pas, il blesse seulement au contact.
      portee: nombre(e.portee, 0, 0, 6), recharge: nombre(e.recharge, 1.2, 0.2, 10),
      contact: e.contact !== false, poids: nombre(e.poids, 1, 0.1, 10),
      xp: Math.round(nombre(e.xp, 3, 0, 999999)), argent: Math.round(nombre(e.argent, 1, 0, 999999)),
      coeur: nombre(e.coeur, 20, 0, 100), // % de chance de laisser un cœur
      butin: (Array.isArray(e.butin) ? e.butin : []).filter((b) => b && b.objet).map((b) => ({ objet: String(b.objet), chance: nombre(b.chance, 10, 0, 100) })),
      boss: Boolean(e.boss),
    };
  }

  // --- Le héros ---
  const pvMax = (jeu, c) => { const r = reglages(jeu); return Math.round(r.coeurs * r.pv_coeur + (Math.max(1, c?.niveau || 1) - 1) * r.pv_niveau); };
  // Ses statistiques, avec l'équipement porté (un objet avec equipement.bonus : arme, bouclier…).
  // partie (facultatif) : les bonus du groupe (Saga 1.11, moteur/bonus.js) multiplient attaque, défense, vitesse.
  const STATS_BONUS = { attaque: 'Attaque', defense: 'Défense', vitesse: 'Vitesse' };
  function stats(jeu, c, partie) {
    const r = reglages(jeu), niveau = Math.max(1, c?.niveau || 1);
    const s = { pvMax: pvMax(jeu, c), attaque: r.attaque + (niveau - 1) * r.attaque_niveau, defense: r.defense, vitesse: r.vitesse, invincibilite: r.invincibilite, recul: r.recul };
    for (const id of Object.values(c?.equipement || {})) {
      const b = trouver(jeu, 'objets', id)?.equipement?.bonus || {};
      s.attaque += nombre(b.attaque ?? b.force, 0);
      s.defense += nombre(b.defense, 0);
      s.vitesse += nombre(b.vitesse ?? b.agilite, 0) / 10;
    }
    if (partie && typeof Bonus !== 'undefined') for (const k of Object.keys(STATS_BONUS)) s[k] *= Bonus.mult(partie, k);
    return s;
  }
  const xpPour = (jeu, niveau) => { const r = reglages(jeu); return Math.round(r.xp_niveau * (niveau - 1) * niveau / 2); };
  function creerHeros(jeu, niveau = 1) {
    const h = jeu.heros;
    const c = { creature: h?.id || 'heros', nom: '', niveau: Math.max(1, Math.round(niveau) || 1), xp: 0, pv: 0, equipement: {} };
    c.xp = xpPour(jeu, c.niveau);
    c.pv = pvMax(jeu, c);
    return c;
  }
  function completer(jeu, c) {
    if (!c || typeof c !== 'object') return null;
    const n = { ...c, niveau: Math.max(1, Math.round(nombre(c.niveau, 1, 1, 999))), xp: Math.max(0, Math.round(nombre(c.xp, 0))), equipement: c.equipement && typeof c.equipement === 'object' ? { ...c.equipement } : {} };
    n.pv = Math.round(nombre(c.pv, pvMax(jeu, n), 0, pvMax(jeu, n)));
    return n;
  }

  // --- Les calculs du temps réel (appelés par action/temps-reel.js) ---
  // Les dégâts d'un coup : l'attaque moins la défense, au moins 1. Règle maison : formule('degats').
  // Rend un nombre, ou une promesse si un script du jeu remplace la formule (le moteur attend sa réponse).
  function degats({ A, D, puissance = 1 }) {
    const normal = Math.max(1, Math.round(A * puissance - D));
    return typeof Maison !== 'undefined' ? Maison.formule('degats', { A, D, puissance, normal }, () => normal) : normal;
  }
  // Le héros frappe un ennemi (l'arme tenue par le héros, puissance 1).
  const coupDuHeros = (jeu, partie, e) => degats({ A: stats(jeu, partie.equipe[0], partie).attaque, D: e.defense });
  // Un ennemi touche le héros.
  const coupDeLEnnemi = (jeu, partie, e) => degats({ A: e.attaque, D: stats(jeu, partie.equipe[0], partie).defense });

  // Le héros perd ou gagne des PV. Rend ses PV.
  function blesser(jeu, partie, n) {
    const c = partie.equipe[0];
    if (!c) return 0;
    c.pv = Math.max(0, Math.min(pvMax(jeu, c), c.pv - Math.round(n)));
    return c.pv;
  }
  const soignerPv = (jeu, partie, n) => blesser(jeu, partie, -n);

  // Un ennemi est vaincu : l'expérience et les niveaux, l'argent, ce qu'il laisse tomber. Rend
  // { xp, argent, butin: [ids d'objets], coeur: bool, niveaux: [nouveaux niveaux] }. La partie change ici.
  function vaincu(jeu, partie, e, hasard = Math.random) {
    const c = partie.equipe[0];
    const out = { xp: e.xp, argent: e.argent, butin: [], coeur: hasard() * 100 < e.coeur, niveaux: [] };
    for (const b of e.butin) if (trouver(jeu, 'objets', b.objet) && hasard() * 100 < b.chance) out.butin.push(b.objet);
    if (c) {
      const r = reglages(jeu);
      c.xp += e.xp;
      while (c.niveau < r.niveau_max && c.xp >= xpPour(jeu, c.niveau + 1)) {
        const avant = pvMax(jeu, c);
        c.niveau++;
        c.pv += pvMax(jeu, c) - avant; // le cœur gagné arrive plein
        out.niveaux.push(c.niveau);
      }
    }
    partie.dex.vus[e.id] = true;
    partie.dex.pris[e.id] = true;
    partie.compteurs.monstres_vaincus = (partie.compteurs.monstres_vaincus || 0) + 1;
    return out;
  }

  // --- Hors combat : les objets du sac (un soin redonne des PV) ---
  const SOINS = ['soin', 'rappel'];
  const utilisable = (jeu, o) => Boolean(o && SOINS.includes(o.effet?.type));
  async function utiliserObjet({ jeu, partie, ui, id }) {
    const o = trouver(jeu, 'objets', id);
    const c = partie.equipe[0];
    if (!o || !(partie.sac[id] > 0) || !c) return false;
    if (!utilisable(jeu, o)) { await ui.dire(`${o.nom} ne s'utilise pas comme ça.`); return false; }
    if (c.pv >= pvMax(jeu, c)) { await ui.dire('Tu as déjà tous tes cœurs.'); return false; }
    const v = Number(o.effet.valeur) || pvMax(jeu, c);
    const avant = c.pv;
    c.pv = Math.min(pvMax(jeu, c), c.pv + v);
    partie.sac[id]--;
    if (partie.sac[id] <= 0) delete partie.sac[id];
    await ui.dire(`Tu utilises ${o.nom} : ${c.pv - avant} PV retrouvés.`);
    return true;
  }

  // --- Les menus : la fiche du héros, le bestiaire ---
  const nomHeros = (jeu, c) => c?.nom || jeu.joueur?.nom || jeu.heros?.nom || 'Héros';
  const coeursTexte = (jeu, c) => { const r = reglages(jeu); return `${Math.ceil((c.pv / r.pv_coeur) * 4) / 4} / ${pvMax(jeu, c) / r.pv_coeur} cœurs`; };
  function fiche(jeu, c) {
    const s = stats(jeu, c), r = reglages(jeu);
    const auMax = c.niveau >= r.niveau_max, a = xpPour(jeu, c.niveau), b = xpPour(jeu, c.niveau + 1);
    return {
      titre: nomHeros(jeu, c), sousTitre: `Niveau ${c.niveau}`,
      image: typeof Sprites !== 'undefined' ? Sprites.vignette(jeu, jeu.heros || { couleur: '#d94a4a' }) : '',
      etiquettes: [],
      pages: [
        { id: 'infos', nom: 'Infos', lignes: [
          { nom: 'Vie', valeur: coeursTexte(jeu, c), barre: c.pv / Math.max(1, s.pvMax), couleur: '#f0503c' },
          { nom: 'Expérience', valeur: String(c.xp), detail: auMax ? 'niveau maximum' : `encore ${Math.max(0, b - c.xp)} pour le niveau ${c.niveau + 1}`, barre: auMax ? 1 : (c.xp - a) / Math.max(1, b - a), couleur: '#4aa8ff' },
        ] },
        { id: 'stats', nom: 'Statistiques', lignes: [
          { nom: 'Attaque', valeur: String(s.attaque) }, { nom: 'Défense', valeur: String(s.defense) },
          { nom: 'Vitesse', valeur: `${Math.round(s.vitesse * 10) / 10} cases/s` },
        ] },
      ],
    };
  }
  const numero = (e) => `N° ${String(e.numero || 0).padStart(3, '0')}`;
  const imageEnnemi = (jeu, e) => (typeof Sprites !== 'undefined' ? Sprites.vignette(jeu, jeu.personnages.get(e.personnage) || { couleur: e.couleur }) : '');
  function especes(jeu) {
    return liste(jeu, 'ennemis').map((x) => ennemi(jeu, x.id)).filter(Boolean)
      .sort((a, b) => a.numero - b.numero || a.nom.localeCompare(b.nom))
      .map((e) => ({ id: e.id, numero: numero(e), nom: e.nom, image: imageEnnemi(jeu, e) }));
  }
  function ficheEspece(jeu, id, { pris = false } = {}) {
    const e = ennemi(jeu, id);
    if (!e) return null;
    const pages = pris ? [
      { nom: 'Description', texte: e.description, lignes: [{ nom: 'Expérience', valeur: String(e.xp) }, { nom: 'Argent', valeur: String(e.argent) }] },
      { nom: 'Statistiques', lignes: [{ nom: 'PV', valeur: String(e.pv) }, { nom: 'Attaque', valeur: String(e.attaque) }, { nom: 'Défense', valeur: String(e.defense) }, { nom: 'Vitesse', valeur: `${e.vitesse} cases/s` }] },
      { nom: 'Butin', lignes: e.butin.map((b) => ({ nom: trouver(jeu, 'objets', b.objet)?.nom || b.objet, valeur: `${b.chance} %` })), texte: e.butin.length ? '' : 'Il ne laisse rien (sauf parfois un cœur).' },
    ] : [{ nom: 'Description', texte: 'Pas encore vaincu. Bats-le pour en savoir plus.', lignes: [] }];
    return { titre: e.nom, sousTitre: `${numero(e)}${e.boss ? ' · Boss' : ''}`, image: imageEnnemi(jeu, e), etiquettes: [], pages };
  }

  const pack = {
    nom: 'action',
    ecran: 'duel',
    capacites: { tempsReel: true },
    statsBonus: STATS_BONUS,
    menus: {
      equipe: 'Héros', dex: 'Bestiaire', dex_visible: true, pc: 'Réserve', boite: 'Réserve',
      places: 12, colonnes: 4, forme_boites: 'liste',
      pages: ['infos', 'stats'], toutes_pages: [['infos', 'Infos'], ['stats', 'Statistiques']],
      dex_pris: 'Vaincus', dex_pris_un: 'vaincu',
      dex_vide: 'Tu n\'as encore vaincu aucun ennemi. Ceux que tu bats s\'inscrivent ici.',
    },
    existe: (jeu, id) => id === jeu.heros?.id || Boolean(trouver(jeu, 'ennemis', id)),
    creer: (jeu, id, niveau) => (id === jeu.heros?.id || id === 'heros' ? creerHeros(jeu, niveau) : null),
    completer,
    soigner: (jeu, c) => { c.pv = pvMax(jeu, c); },
    resume: (jeu, c) => ({ nom: nomHeros(jeu, c), niveau: c.niveau, pv: c.pv, pvMax: pvMax(jeu, c), statut: '', image: '', apparence: jeu.heros || { couleur: '#d94a4a' } }),
    // Pas de rencontres au hasard : les ennemis sont sur la carte (les zones les font apparaître).
    rencontre: () => null,
    // Les commandes « combat » des scripts n'ont pas de sens ici : rien ne se passe.
    combattre: async () => ({ issue: 'fuite' }),
    utilisable, utiliserObjet,
    ecranEv: async ({ ui }) => { await ui.dire('(Ce jeu n\'a pas de points d\'effort : c\'est une commande des jeux Pokémon.)'); },
    prixCreature: () => 0,
    fiche,
    dex: (jeu) => ({ nom: 'Bestiaire', especes: especes(jeu) }),
    ficheEspece,
    // Une partie neuve : le héros, seul, avec tous ses cœurs.
    nouvellePartie(jeu, partie) { if (!partie.equipe.length) partie.equipe.push(creerHeros(jeu, 1)); },
    plafond: (jeu) => reglages(jeu).niveau_max,
    pourScript: (jeu, partie) => partie.equipe.slice(0, 1).map((c) => ({ nom: nomHeros(jeu, c), niveau: c.niveau, pv: c.pv, pvMax: pvMax(jeu, c), ...stats(jeu, c) })),
  };

  return { pack, reglages, ennemi, stats, pvMax, xpPour, coupDuHeros, coupDeLEnnemi, degats, blesser, soignerPv, vaincu, COMPORTEMENTS, trouver };
})();
