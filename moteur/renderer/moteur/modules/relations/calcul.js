// Les calculs du module « relations » (Saga 1.15), purs et testables sans écran : une partie en entrée, un
// résultat en sortie. relations.js les branche au moteur (../MODULES.md).
//
// Une relation lie le joueur à un personnage du jeu (personnages.json) : des points d'affinité, qui montent
// quand on lui parle (une fois par jour) ou qu'on lui offre quelque chose, et des niveaux (des paliers de
// points, nommés par le jeu : Inconnu, Connaissance, Ami…). Chaque niveau débloque ses paroles, et les
// événements de Tafl testent le niveau (condition relation_niveau) pour débloquer leurs propres scènes.
//
// Les données (donnees/relations.json, une entrée par personnage) :
//   { id: id du personnage, depart, adore: [objets], aime: [objets], deteste: [objets],
//     paroles: [{ niveau, texte, expression }], merci: { adore, aime, neutre, deteste } }
// Les réglages (modules_reglages.relations) : voir definitions() ci-dessous.
//
// L'état (partie.modules.relations) :
//   { liens: { id: { points, rencontre, parle, cadeau, cadeaux, vu, gouts: { objet: gout } } }, resolu }
//   parle, cadeau : le dernier jour où le joueur lui a parlé, lui a offert quelque chose (0 : jamais) ;
//   cadeaux : combien de cadeaux ce jour-là ; vu : le plus haut niveau dont il a déjà dit les paroles ;
//   gouts : ce que le joueur a appris de ses goûts en lui offrant des choses ; resolu : le dernier jour
//   calculé par finDeJournee.

const RelationsCalcul = (() => {
  const entier = (v, d = 0, min = -Infinity, max = Infinity) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== '' && v !== null ? Math.max(min, Math.min(max, n)) : d; };
  const texte = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
  const ids = (l) => [...new Set((Array.isArray(l) ? l : []).filter((x) => typeof x === 'string' && x))];
  const GOUTS = ['adore', 'aime', 'neutre', 'deteste'];

  // Les niveaux par défaut : des paliers doux (une conversation par jour et un petit cadeau de temps en
  // temps font monter d'un niveau en quelques jours).
  const NIVEAUX = [
    { nom: 'Inconnu', points: 0 }, { nom: 'Connaissance', points: 20 }, { nom: 'Ami', points: 60 },
    { nom: 'Bon ami', points: 120 }, { nom: 'Proche', points: 200 }, { nom: 'Inséparable', points: 300 },
  ];
  const CADEAUX = { adore: 30, aime: 15, neutre: 5, deteste: 0 };

  // Les mots du module (le catalogue commun/modules.js donne les clés et les défauts ; vide : le défaut).
  function lesTextes(t) {
    let cat = typeof ModulesJeu !== 'undefined' ? ModulesJeu : null;
    if (!cat && typeof require === 'function') try { cat = require('../../../../../commun/modules.js'); } catch { /* hors du dépôt */ }
    const defauts = cat?.CATALOGUE?.relations?.textes || {};
    return Object.fromEntries(Object.entries(defauts).map(([k, [defaut]]) => [k, texte(t?.[k], 200).trim() || defaut]));
  }

  // Les définitions, lues une fois par jeu : les personnes (par id de personnage) et les réglages.
  function definitions(donnees) {
    const persos = new Map((donnees?.personnages?.personnages || []).filter((p) => p && p.id).map((p) => [p.id, p]));
    const personnes = new Map();
    for (const r of Array.isArray(donnees?.relations?.relations) ? donnees.relations.relations : []) {
      const id = typeof r?.id === 'string' && r.id ? r.id : typeof r?.personnage === 'string' ? r.personnage : '';
      if (!id || personnes.has(id)) continue;
      const p = persos.get(id);
      const gouts = new Map();
      // Un objet cité deux fois : le premier goût gagne (adore, puis aime, puis déteste).
      for (const g of ['adore', 'aime', 'deteste']) for (const o of ids(r[g])) if (!gouts.has(o)) gouts.set(o, g);
      personnes.set(id, {
        id, nom: texte(p?.nom, 60) || texte(r.nom, 60) || id, couleur: texte(p?.couleur, 20), portrait: portraitDe(p),
        depart: entier(r.depart, 0, 0, 99999), gouts,
        paroles: (Array.isArray(r.paroles) ? r.paroles : []).filter((x) => x && texte(x.texte, 2000).trim())
          .map((x) => ({ niveau: entier(x.niveau, 0, 0, 99), texte: texte(x.texte, 2000), expression: texte(x.expression, 40) })),
        merci: Object.fromEntries(GOUTS.map((g) => [g, texte(r.merci?.[g], 500)])),
      });
    }
    const g = donnees?.reglages?.reglages?.modules_reglages?.relations || {};
    // Les niveaux : des paliers croissants, le premier à 0 (au moins deux).
    let niveaux = (Array.isArray(g.niveaux) ? g.niveaux : []).filter((n) => n && texte(n.nom, 40).trim())
      .map((n) => ({ nom: texte(n.nom, 40), points: entier(n.points, 0, 0, 99999) })).sort((a, b) => a.points - b.points);
    if (niveaux.length < 2) niveaux = NIVEAUX.map((n) => ({ ...n }));
    niveaux[0].points = 0;
    niveaux = niveaux.filter((n, i) => i === 0 || n.points > niveaux[i - 1].points);
    const cadeaux = Object.fromEntries(GOUTS.map((k) => [k, entier(g.cadeaux?.[k], CADEAUX[k], -999, 999)]));
    const reglages = {
      nom: texte(g.nom, 40) || 'Relations',
      niveaux, max: niveaux[niveaux.length - 1].points,
      // Les points d'une conversation (la première du jour), d'un cadeau selon le goût, et combien de cadeaux
      // par personne et par jour (0 : sans limite).
      parler: entier(g.parler, 5, 0, 999), cadeaux, cadeaux_jour: entier(g.cadeaux_jour, 1, 0, 99),
      // Les points perdus chaque nuit sans l'avoir vu (0 : rien, le défaut). On ne redescend jamais sous le
      // palier du niveau atteint : une amitié ne se perd pas.
      oubli: entier(g.oubli, 0, 0, 999),
      // menu : l'écran des relations dans le carnet ; carnet : un résumé dans le carnet ; visibles :
      // 'rencontres' (ceux à qui on a parlé) ou 'tous' ; gouts : ce que l'écran dit de leurs goûts,
      // 'decouverts' (ce qu'on a appris en offrant), 'tous' ou 'caches' ; annoncer : dire quand un niveau monte.
      menu: g.menu !== false, carnet: g.carnet !== false, visibles: g.visibles === 'tous' ? 'tous' : 'rencontres',
      gouts: ['tous', 'caches'].includes(g.gouts) ? g.gouts : 'decouverts', annoncer: g.annoncer !== false,
      // L'affinité en symboles : un plein par niveau atteint, un vide pour chaque niveau qui reste.
      symbole: texte(g.symbole, 4) || '♥', symbole_vide: typeof g.symbole_vide === 'string' ? texte(g.symbole_vide, 4) : '♡',
      textes: lesTextes(g.textes),
    };
    return { personnes, reglages };
  }

  // Le portrait « normal » d'un personnage (sinon le premier), pour les écrans.
  function portraitDe(p) {
    const l = Array.isArray(p?.portraits) ? p.portraits : [];
    return (l.find((x) => x?.expression === 'normal') || l[0])?.png || '';
  }

  const lienNeuf = (def) => ({ points: def ? def.depart : 0, rencontre: false, parle: 0, cadeau: 0, cadeaux: 0, vu: 0, gouts: {} });
  const etatNeuf = () => ({ liens: {}, resolu: 0 });

  // Remettre un état d'aplomb : les valeurs dans leurs bornes ; un lien d'un personnage qui n'est plus dans
  // les données est gardé (le jeu peut le remettre), sans être montré.
  function normaliser(d, etat) {
    const e = etat && typeof etat === 'object' ? etat : {};
    const liens = {};
    for (const [id, l] of Object.entries(e.liens && typeof e.liens === 'object' ? e.liens : {})) {
      if (!l || typeof l !== 'object') continue;
      const gouts = {};
      for (const [o, g] of Object.entries(l.gouts && typeof l.gouts === 'object' ? l.gouts : {})) if (GOUTS.includes(g)) gouts[o] = g;
      liens[id] = { points: entier(l.points, 0, 0, d.reglages.max), rencontre: l.rencontre === true, parle: entier(l.parle, 0, 0), cadeau: entier(l.cadeau, 0, 0),
        cadeaux: entier(l.cadeaux, 0, 0, 999), vu: entier(l.vu, 0, 0, d.reglages.niveaux.length - 1), gouts };
    }
    return { liens, resolu: entier(e.resolu, 0, 0) };
  }
  const copie = (e) => JSON.parse(JSON.stringify(e));
  // Le lien avec id (créé s'il manque, dans une copie de l'état).
  function lien(d, e, id) {
    if (!e.liens[id]) e.liens[id] = lienNeuf(d.personnes.get(id));
    return e.liens[id];
  }

  // Le niveau (son numéro, 0 = le premier) pour ces points.
  function niveau(d, points) {
    let n = 0;
    d.reglages.niveaux.forEach((x, i) => { if (points >= x.points) n = i; });
    return n;
  }
  const nomNiveau = (d, n) => d.reglages.niveaux[Math.max(0, Math.min(d.reglages.niveaux.length - 1, n))].nom;
  // L'affinité en symboles : ♥♥♡♡♡ (un par niveau au-dessus du premier).
  const coeurs = (d, n) => d.reglages.symbole.repeat(n) + d.reglages.symbole_vide.repeat(Math.max(0, d.reglages.niveaux.length - 1 - n));
  // Où il en est vers le niveau suivant : { points, vers } (vers : les points du prochain palier, ou null).
  function progres(d, points) {
    const n = niveau(d, points);
    const suivant = d.reglages.niveaux[n + 1];
    return { niveau: n, points, vers: suivant ? suivant.points : null };
  }

  // Changer les points d'un lien (n peut être négatif), bornés de 0 au dernier palier. Rend { avant, apres }
  // (les niveaux).
  function bouger(d, l, n) {
    const avant = niveau(d, l.points);
    l.points = Math.max(0, Math.min(d.reglages.max, l.points + n));
    return { avant, apres: niveau(d, l.points) };
  }

  // Parler à id le jour `jour` : la première conversation du jour rapporte des points. Rend { etat, gagne,
  // premiere, avant, apres }.
  function parler(d, etat, id, jour) {
    const e = copie(etat);
    const l = lien(d, e, id);
    const j = Math.max(1, entier(jour, 1));
    const premiere = l.parle !== j;
    l.rencontre = true;
    let r = { avant: niveau(d, l.points), apres: niveau(d, l.points) };
    const pts = l.points;
    if (premiere) { l.parle = j; r = bouger(d, l, d.reglages.parler); }
    return { etat: e, gagne: l.points - pts, premiere, ...r };
  }

  // Le goût de id pour un objet : 'adore', 'aime', 'deteste' ou 'neutre'.
  const gout = (d, id, objet) => d.personnes.get(id)?.gouts.get(objet) || 'neutre';

  // Peut-on offrir quelque chose à id aujourd'hui ? → { ok, raison }
  function peutOffrir(d, etat, id, jour) {
    const l = etat.liens[id];
    const max = d.reglages.cadeaux_jour;
    if (max && l && l.cadeau === Math.max(1, entier(jour, 1)) && l.cadeaux >= max) return { ok: false, raison: d.reglages.textes.deja_cadeau };
    return { ok: true, raison: '' };
  }

  // Offrir un objet à id le jour `jour`. Le sac, lui, est changé par la commande Objet (relations.js).
  // Rend { ok, raison, etat, gout, gagne, avant, apres }.
  function offrir(d, etat, id, objet, jour) {
    const p = peutOffrir(d, etat, id, jour);
    if (!p.ok) return { ok: false, raison: p.raison, etat, gout: '', gagne: 0, avant: 0, apres: 0 };
    const e = copie(etat);
    const l = lien(d, e, id);
    const j = Math.max(1, entier(jour, 1));
    if (l.cadeau !== j) { l.cadeau = j; l.cadeaux = 0; }
    l.cadeaux += 1;
    l.rencontre = true;
    const g = gout(d, id, objet);
    l.gouts[objet] = g;
    const pts = l.points;
    const r = bouger(d, l, d.reglages.cadeaux[g]);
    return { ok: true, raison: '', etat: e, gout: g, gagne: l.points - pts, ...r };
  }

  // Ajouter, retirer ou régler des points (une scène de l'histoire). Rend { etat, avant, apres, change }.
  function points(d, etat, id, n, mode = 'ajouter') {
    const e = copie(etat);
    const l = lien(d, e, id);
    const pts = l.points;
    const k = mode === 'regler' ? entier(n, 0) - l.points : mode === 'retirer' ? -Math.abs(entier(n, 0)) : entier(n, 0);
    const r = bouger(d, l, k);
    return { etat: e, change: l.points - pts, ...r };
  }

  // Ce que id dit aujourd'hui : d'abord, une fois, les paroles d'un niveau qu'il vient d'atteindre (une
  // confidence débloquée) ; sinon l'une des paroles des niveaux atteints, qui change chaque jour. Rend
  // { etat, parole: { texte, expression } ou null, nouvelle }.
  function parole(d, etat, id, jour) {
    const def = d.personnes.get(id);
    const e = copie(etat);
    const l = lien(d, e, id);
    const n = niveau(d, l.points);
    const ouvertes = (def?.paroles || []).filter((x) => x.niveau <= n);
    if (!ouvertes.length) return { etat: e, parole: null, nouvelle: false };
    // Une confidence pas encore dite : celle du plus haut niveau atteint depuis la dernière fois.
    if (n > l.vu) {
      const neuves = ouvertes.filter((x) => x.niveau > l.vu && x.niveau <= n);
      l.vu = n;
      if (neuves.length) {
        const haut = Math.max(...neuves.map((x) => x.niveau));
        return { etat: e, parole: neuves.find((x) => x.niveau === haut), nouvelle: true };
      }
    }
    // Sinon, une parole du jour : toujours la même dans la journée, une autre le lendemain.
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return { etat: e, parole: ouvertes[(Math.max(1, entier(jour, 1)) + h) % ouvertes.length], nouvelle: false };
  }

  // La nuit du jour `jour` (une fois par jour) : l'oubli, pour ceux qu'on n'a pas vus ce jour-là, sans
  // redescendre sous le palier atteint. Rend { etat }.
  function finDeJournee(d, etat, jour) {
    const n = entier(jour, 0);
    const e = copie(etat);
    if (n <= e.resolu) return { etat: e };
    if (d.reglages.oubli) {
      for (const l of Object.values(e.liens)) {
        if (!l.rencontre || l.parle === n || l.cadeau === n) continue;
        const plancher = d.reglages.niveaux[niveau(d, l.points)].points;
        l.points = Math.max(plancher, l.points - d.reglages.oubli);
      }
    }
    e.resolu = n;
    return { etat: e };
  }

  // Les personnes à montrer (écran, carnet) : celles des données, rencontrées ou toutes selon les réglages.
  function visibles(d, etat) {
    return [...d.personnes.values()].filter((p) => d.reglages.visibles === 'tous' || etat.liens[p.id]?.rencontre);
  }

  // Un texte du jeu avec {nom} et {niveau} remplis.
  const remplir = (t, o = {}) => String(t || '').replace(/\{nom\}/g, o.nom ?? '').replace(/\{niveau\}/g, o.niveau ?? '');

  return { GOUTS, NIVEAUX, CADEAUX, definitions, etatNeuf, lienNeuf, normaliser, niveau, nomNiveau, coeurs, progres, parler, gout, peutOffrir, offrir, points, parole, finDeJournee, visibles, remplir };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RelationsCalcul;
