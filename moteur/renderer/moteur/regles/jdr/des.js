// Le pack JDR (Saga 0.13) : les dés et le journal des jets.
//
// Tous les jets du pack passent par ici. Le hasard part d'une graine gardée dans la partie
// (partie.jdr.graine) : recharger une sauvegarde rejoue les mêmes dés, comme pour les scripts JS. En
// multijoueur, c'est l'hôte qui lancera, et chaque jet deviendra une ligne du journal envoyée à tous.
//
// Chaque jet qui compte (un test, une attaque, des dégâts…) est noté dans partie.jdr.journal (les 200
// derniers) :
//   { n, qui, quoi, formule, des: [{ faces, valeur, garde }], bonus, total, contre, resultat, cache }
// resultat : 'reussi', 'rate', 'critique', 'echec_critique' ou ''. cache : faux pour l'instant (ce sera
// un jet caché du MJ, avec le mode « table »).

const JdrDes = (() => {
  const MAX_JOURNAL = 200;

  function etat(partie) {
    if (!partie.jdr || typeof partie.jdr !== 'object') partie.jdr = {};
    const j = partie.jdr;
    if (!Number.isInteger(j.graine)) j.graine = Math.floor(Math.random() * 2147483647);
    if (!Array.isArray(j.journal)) j.journal = [];
    if (!Number.isInteger(j.compte)) j.compte = j.journal.length;
    return j;
  }
  // mulberry32, comme dans le bac à sable des scripts.
  function aleatoire(partie) {
    const j = etat(partie);
    j.graine = (j.graine + 0x6D2B79F5) | 0;
    let t = j.graine;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const d = (partie, faces) => 1 + Math.floor(aleatoire(partie) * Math.max(1, Math.round(Number(faces) || 6)));
  const chance = (partie, pourcent) => aleatoire(partie) * 100 < Number(pourcent);
  const choisir = (partie, liste) => (liste.length ? liste[Math.floor(aleatoire(partie) * liste.length)] : undefined);

  // « 2d6+3 », « d20 », « 1d8 + 1d6 − 1 », « 5d4×10 » (l'or de départ). doubler : les dés sont lancés
  // deux fois (un critique) ; max : les dés d'origine valent leur maximum, plus un jet (la règle maison
  // « critiques au maximum »).
  function lancer(partie, formule, { doubler = false, max = false } = {}) {
    let texte = String(formule ?? '').replace(/\s+/g, '').toLowerCase().replace(/−/g, '-') || '0';
    const r = { formule: texte, des: [], bonus: 0, total: 0 };
    const fois = texte.match(/^(.+?)[*x×](\d+)$/);
    if (fois) texte = fois[1];
    if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(texte)) return r;
    for (const [, s, n, faces, nombre] of texte.matchAll(/([+-]?)(?:(\d*)d(\d+)|(\d+))/g)) {
      const sg = s === '-' ? -1 : 1;
      if (nombre !== undefined) { r.bonus += sg * Number(nombre); continue; }
      const combien = Math.min(100, n === '' ? 1 : Number(n)) * (doubler || max ? 2 : 1), f = Math.max(1, Math.min(1000, Number(faces)));
      for (let i = 0; i < combien; i++) {
        const v = max && i < combien / 2 ? f : d(partie, f);
        r.des.push({ faces: f, valeur: v, signe: sg, garde: true });
      }
    }
    r.total = r.bonus + r.des.reduce((t, x) => t + x.signe * x.valeur, 0);
    if (fois) r.total *= Number(fois[2]); // le journal montre la formule : « 5d4*10 [2 1 2 1 1] = 70 »
    return r;
  }
  // Un d20, avec avantage ou désavantage (les deux s'annulent). Rend { naturel, des }.
  function d20(partie, { avantage = false, desavantage = false } = {}) {
    const deux = avantage !== desavantage;
    const a = d(partie, 20), b = deux ? d(partie, 20) : null;
    if (!deux) return { naturel: a, des: [{ faces: 20, valeur: a, garde: true }], mode: '' };
    const garde = avantage ? Math.max(a, b) : Math.min(a, b);
    const ia = a === garde;
    return { naturel: garde, des: [{ faces: 20, valeur: a, garde: ia }, { faces: 20, valeur: b, garde: !ia }], mode: avantage ? 'avantage' : 'desavantage' };
  }

  // Noter un jet dans le journal (et le rendre, pour le montrer).
  function noter(partie, ligne) {
    const j = etat(partie);
    const l = {
      n: ++j.compte, qui: String(ligne.qui || ''), quoi: String(ligne.quoi || ''), formule: String(ligne.formule || ''),
      des: (ligne.des || []).map((x) => ({ faces: x.faces, valeur: x.valeur, garde: x.garde !== false })), bonus: Number(ligne.bonus) || 0,
      total: Number(ligne.total) || 0, contre: String(ligne.contre || ''), resultat: ligne.resultat || '', mode: ligne.mode || '',
      cache: Boolean(ligne.cache), temps: Number(partie.temps) || 0,
    };
    j.journal.push(l);
    if (j.journal.length > MAX_JOURNAL) j.journal.splice(0, j.journal.length - MAX_JOURNAL);
    return l;
  }

  // Le détail d'une ligne, pour le journal et le plateau : « d20 (14) + 5 = 19 contre DD 15 ».
  const signe = (n) => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`);
  function detail(l) {
    const des = l.des.length ? l.des.map((x) => `${x.garde ? '' : '~'}${x.valeur}`).join(' ') : '';
    const dés = des ? `[${des}]` : '';
    return `${l.formule ? `${l.formule} ` : ''}${dés}${l.bonus ? ` ${signe(l.bonus)}` : ''} = ${l.total}${l.contre ? ` contre ${l.contre}` : ''}`;
  }
  const RESULTATS = { reussi: 'Réussi', rate: 'Raté', critique: 'Critique !', echec_critique: 'Échec critique', touche: 'Touché', manque: 'Manqué' };

  return { etat, aleatoire, d, chance, choisir, lancer, d20, noter, detail, RESULTATS, MAX_JOURNAL };
})();
