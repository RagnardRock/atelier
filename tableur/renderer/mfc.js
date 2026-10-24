// La mise en forme conditionnelle : des règles qui changent l'apparence d'une cellule selon sa valeur
// (comme dans Excel : « supérieur à 100 en rouge », doublons, 10 premiers, nuances de couleurs,
// barres de données…).
//
// Les règles d'une feuille sont dans sa meta (Classeur.meta(feuille).mfc), dans l'ordre de priorité :
// la première qui donne une couleur de fond l'emporte sur les suivantes.
//
// Une règle : { id, plages: [plage], type, ...réglages, style: { fond, couleur, gras, italique, souligne, barre } }
//   valeur   : op (sup, inf, supEgal, infEgal, egal, different, entre, horsDe), v1, v2
//              (nombre, texte, ou formule « =… » en anglais, relative au coin en haut à gauche)
//   texte    : op (contient, neContientPas, commencePar, finitPar), texte
//   doublons, uniques, vides, nonVides, erreurs
//   top      : sens (haut, bas), n, pourcent
//   moyenne  : sens (dessus, dessous)
//   date     : periode (hier, aujourdhui, demain, septJours, semaineDerniere, semaine, semaineProchaine,
//              moisDernier, mois, moisProchain)
//   formule  : formule (anglais, relative au coin en haut à gauche de la première plage) — vraie = mise en forme
//   echelle  : couleurs [min, milieu (ou null), max]   (pas de style : la couleur de fond varie)
//   barres   : couleur                                  (une barre dans la cellule, longueur selon la valeur)

const MFC = (() => {
  const TYPES = {
    valeur: 'Valeur de la cellule',
    texte: 'Texte qui contient…',
    date: 'Date (aujourd\'hui, ce mois…)',
    doublons: 'Valeurs en double',
    uniques: 'Valeurs uniques',
    top: 'Premières ou dernières valeurs',
    moyenne: 'Au-dessus ou en dessous de la moyenne',
    vides: 'Cellules vides',
    nonVides: 'Cellules non vides',
    erreurs: 'Cellules en erreur',
    formule: 'Formule (vraie = mise en forme)',
    echelle: 'Nuances de couleurs',
    barres: 'Barres de données',
  };
  const OPERATEURS = {
    sup: 'supérieure à', inf: 'inférieure à', supEgal: 'supérieure ou égale à', infEgal: 'inférieure ou égale à',
    egal: 'égale à', different: 'différente de', entre: 'comprise entre', horsDe: 'en dehors de',
  };
  const OPS_TEXTE = { contient: 'contient', neContientPas: 'ne contient pas', commencePar: 'commence par', finitPar: 'finit par' };
  const PERIODES = {
    hier: 'Hier', aujourdhui: 'Aujourd\'hui', demain: 'Demain', septJours: 'Les 7 derniers jours',
    semaineDerniere: 'La semaine dernière', semaine: 'Cette semaine', semaineProchaine: 'La semaine prochaine',
    moisDernier: 'Le mois dernier', mois: 'Ce mois-ci', moisProchain: 'Le mois prochain',
  };
  // Les styles tout prêts d'Excel.
  const STYLES = {
    rouge: { libelle: 'Rouge clair, texte rouge foncé', style: { fond: '#ffc7ce', couleur: '#9c0006' } },
    jaune: { libelle: 'Jaune, texte jaune foncé', style: { fond: '#ffeb9c', couleur: '#9c5700' } },
    vert: { libelle: 'Vert, texte vert foncé', style: { fond: '#c6efce', couleur: '#006100' } },
    rougeFond: { libelle: 'Fond rouge clair', style: { fond: '#ffc7ce' } },
    texteRouge: { libelle: 'Texte rouge', style: { couleur: '#ff4d4f' } },
    texteVert: { libelle: 'Texte vert', style: { couleur: '#34d399' } },
    gras: { libelle: 'Gras', style: { gras: true } },
  };
  const ECHELLES = {
    vertJauneRouge: { libelle: 'Vert, jaune, rouge', couleurs: ['#63be7b', '#ffeb84', '#f8696b'] },
    rougeJauneVert: { libelle: 'Rouge, jaune, vert', couleurs: ['#f8696b', '#ffeb84', '#63be7b'] },
    vertBlanc: { libelle: 'Blanc, vert', couleurs: ['#fcfcff', null, '#63be7b'] },
    blancRouge: { libelle: 'Blanc, rouge', couleurs: ['#fcfcff', null, '#f8696b'] },
    bleuBlancRouge: { libelle: 'Bleu, blanc, rouge', couleurs: ['#5a8ac6', '#fcfcff', '#f8696b'] },
  };
  const BARRES = { bleu: '#638ec6', vert: '#63c384', rouge: '#ff555a', orange: '#ffb628', violet: '#d6007b', emeraude: '#34d399' };

  // --- Cache : recalculé à chaque modification du classeur ---
  let versionCache = -1;
  let statsRegles = new Map();   // « feuille:id de règle » → statistiques de sa plage
  let resultats = new Map();     // « feuille:r:c » → résultat
  function verifierCache() {
    const v = Classeur.version();
    if (v !== versionCache) { versionCache = v; statsRegles = new Map(); resultats = new Map(); }
  }

  const estErreur = (v) => v && typeof v === 'object' && v.type;
  const cleTexte = (v) => (typeof v === 'string' ? v.toLowerCase() : String(v));

  // Les valeurs de la plage d'une règle (limitée aux données de la feuille).
  function valeursDe(feuille, regle) {
    const { width, height } = Classeur.dimensions(feuille);
    const out = [];
    for (const p of regle.plages) {
      for (let r = p.r1; r <= Math.min(p.r2, height - 1); r++) {
        for (let c = p.c1; c <= Math.min(p.c2, width - 1); c++) out.push(Classeur.valeur(feuille, r, c));
      }
    }
    return out;
  }
  function statsDe(feuille, regle) {
    const cle = `${feuille}:${regle.id}`;
    let s = statsRegles.get(cle);
    if (s) return s;
    const valeurs = valeursDe(feuille, regle);
    const nombres = valeurs.filter((v) => typeof v === 'number').sort((a, b) => a - b);
    s = { nombres };
    if (nombres.length) {
      s.min = nombres[0];
      s.max = nombres[nombres.length - 1];
      s.moyenne = nombres.reduce((a, b) => a + b, 0) / nombres.length;
      s.milieu = centile(nombres, 0.5);
    }
    if (regle.type === 'doublons' || regle.type === 'uniques') {
      s.compte = new Map();
      for (const v of valeurs) if (v !== null && v !== '' && !estErreur(v)) s.compte.set(cleTexte(v), (s.compte.get(cleTexte(v)) || 0) + 1);
    }
    if (regle.type === 'top' && nombres.length) {
      const n = regle.pourcent ? Math.max(1, Math.floor(nombres.length * (regle.n || 10) / 100)) : Math.max(1, regle.n || 10);
      s.seuil = regle.sens === 'bas' ? nombres[Math.min(n, nombres.length) - 1] : nombres[Math.max(0, nombres.length - n)];
    }
    statsRegles.set(cle, s);
    return s;
  }
  function centile(tries, k) {
    const i = (tries.length - 1) * k;
    const a = Math.floor(i), b = Math.ceil(i);
    return tries[a] + (tries[b] - tries[a]) * (i - a);
  }

  // Décale les références relatives d'une formule (A1 → B3 pour dr = 2, dc = 1) ; $A$1 ne bouge pas.
  function decalerFormule(formule, dr, dc) {
    if (!dr && !dc) return formule;
    return formule.replace(/("(?:[^"]|"")*")|(?<![A-Za-z0-9_.])(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(])/g, (m, texte, d1, col, d2, lig) => {
      if (texte) return texte;
      const c = d1 ? col : lettreColonne(Math.max(0, numeroColonne(col) + dc));
      const r = d2 ? lig : String(Math.max(1, Number(lig) + dr));
      return `${d1}${c.toUpperCase()}${d2}${r}`;
    });
  }
  // Une formule de règle, calculée pour la cellule (r, c).
  function calculer(feuille, regle, formule, r, c) {
    const coin = regle.plages[0];
    const f = decalerFormule(formule.replace(/^=/, ''), r - coin.r1, c - coin.c1);
    try {
      const v = Classeur.moteur().calculateFormula(`=${f}`, feuille);
      return Array.isArray(v) ? v[0]?.[0] : v;
    } catch { return null; }
  }
  const vrai = (v) => v === true || (typeof v === 'number' && v !== 0);
  // Une borne de règle « valeur » : un nombre, un texte, ou une formule.
  function borne(feuille, regle, x, r, c) {
    if (typeof x === 'string' && x.startsWith('=')) return calculer(feuille, regle, x, r, c);
    return x;
  }
  function comparer(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (a === null || a === undefined) a = typeof b === 'number' ? 0 : '';
    return Classeur.comparer(a, b);
  }

  // Début et fin (numéros de série Excel) d'une période de dates.
  function periode(nom) {
    const auj = new Date();
    const jour = (d) => Formules.dateVersSerie(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const t = jour(auj);
    const lundi = t - ((auj.getDay() + 6) % 7);
    const debutMois = (dm) => jour(new Date(auj.getFullYear(), auj.getMonth() + dm, 1));
    switch (nom) {
      case 'hier': return [t - 1, t - 1];
      case 'aujourdhui': return [t, t];
      case 'demain': return [t + 1, t + 1];
      case 'septJours': return [t - 6, t];
      case 'semaineDerniere': return [lundi - 7, lundi - 1];
      case 'semaine': return [lundi, lundi + 6];
      case 'semaineProchaine': return [lundi + 7, lundi + 13];
      case 'moisDernier': return [debutMois(-1), debutMois(0) - 1];
      case 'mois': return [debutMois(0), debutMois(1) - 1];
      case 'moisProchain': return [debutMois(1), debutMois(2) - 1];
      default: return [NaN, NaN];
    }
  }

  // La règle s'applique-t-elle à la cellule ?
  function verifie(feuille, regle, r, c, v) {
    switch (regle.type) {
      case 'valeur': {
        if (v === null || estErreur(v)) return false;
        const a = borne(feuille, regle, regle.v1, r, c), b = borne(feuille, regle, regle.v2, r, c);
        const d = comparer(v, a);
        switch (regle.op) {
          case 'sup': return d > 0;
          case 'inf': return d < 0;
          case 'supEgal': return d >= 0;
          case 'infEgal': return d <= 0;
          case 'egal': return d === 0;
          case 'different': return d !== 0;
          case 'entre': case 'horsDe': {
            const [lo, hi] = comparer(a, b) <= 0 ? [a, b] : [b, a];
            const dedans = comparer(v, lo) >= 0 && comparer(v, hi) <= 0;
            return regle.op === 'entre' ? dedans : !dedans;
          }
          default: return false;
        }
      }
      case 'texte': {
        if (v === null || estErreur(v)) return regle.op === 'neContientPas';
        const t = Classeur.texte(feuille, r, c).toLowerCase(), x = String(regle.texte || '').toLowerCase();
        if (regle.op === 'commencePar') return t.startsWith(x);
        if (regle.op === 'finitPar') return t.endsWith(x);
        if (regle.op === 'neContientPas') return !t.includes(x);
        return t.includes(x);
      }
      case 'date': {
        if (typeof v !== 'number') return false;
        const [a, b] = periode(regle.periode);
        const j = Math.floor(v);
        return j >= a && j <= b;
      }
      case 'doublons': case 'uniques': {
        if (v === null || v === '' || estErreur(v)) return false;
        const n = statsDe(feuille, regle).compte.get(cleTexte(v)) || 0;
        return regle.type === 'doublons' ? n > 1 : n === 1;
      }
      case 'top': {
        if (typeof v !== 'number') return false;
        const s = statsDe(feuille, regle);
        if (s.seuil === undefined) return false;
        return regle.sens === 'bas' ? v <= s.seuil : v >= s.seuil;
      }
      case 'moyenne': {
        if (typeof v !== 'number') return false;
        const s = statsDe(feuille, regle);
        return regle.sens === 'dessous' ? v < s.moyenne : v > s.moyenne;
      }
      case 'vides': return v === null || v === '';
      case 'nonVides': return !(v === null || v === '');
      case 'erreurs': return Boolean(estErreur(v));
      case 'formule': return vrai(calculer(feuille, regle, regle.formule || 'FALSE()', r, c));
      default: return false;
    }
  }

  // Mélange de deux couleurs #rrggbb (t de 0 à 1).
  function melanger(a, b, t) {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return `#${pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('')}`;
  }
  function couleurEchelle(s, couleurs, v) {
    const [cmin, cmid, cmax] = couleurs;
    if (s.max === s.min) return cmid || cmax;
    if (!cmid) return melanger(cmin, cmax, (v - s.min) / (s.max - s.min));
    if (v <= s.milieu) return s.milieu === s.min ? cmid : melanger(cmin, cmid, (v - s.min) / (s.milieu - s.min));
    return s.max === s.milieu ? cmid : melanger(cmid, cmax, (v - s.milieu) / (s.max - s.milieu));
  }

  // Ce que les règles changent pour une cellule : { style, barre: { debut, fin, couleur } } ou null.
  function evaluer(feuille, r, c) {
    const regles = Classeur.meta(feuille)?.mfc;
    if (!regles?.length) return null;
    verifierCache();
    const cle = `${feuille}:${r}:${c}`;
    if (resultats.has(cle)) return resultats.get(cle);
    let res = null;
    let v;
    let lue = false;
    for (const regle of regles) {
      if (!regle.plages.some((p) => dansPlage(p, r, c))) continue;
      if (!lue) { v = Classeur.valeur(feuille, r, c); lue = true; }
      if (regle.type === 'echelle') {
        if (typeof v !== 'number') continue;
        const s = statsDe(feuille, regle);
        res = res || { style: {} };
        if (!res.style.fond) res.style.fond = couleurEchelle(s, regle.couleurs || ECHELLES.vertJauneRouge.couleurs, v);
        continue;
      }
      if (regle.type === 'barres') {
        if (typeof v !== 'number' || (res && res.barre)) continue;
        const s = statsDe(feuille, regle);
        const lo = Math.min(0, s.min), hi = Math.max(0, s.max);
        if (hi === lo) continue;
        const zero = (0 - lo) / (hi - lo), pos = (v - lo) / (hi - lo);
        res = res || { style: {} };
        res.barre = { debut: Math.min(zero, pos), fin: Math.max(zero, pos), couleur: v < 0 ? '#ff555a' : (regle.couleur || BARRES.bleu) };
        continue;
      }
      if (!verifie(feuille, regle, r, c, v)) continue;
      res = res || { style: {} };
      // La règle la plus haute l'emporte : on ne remplace pas ce qu'une règle précédente a posé.
      for (const [k, x] of Object.entries(regle.style || {})) if (!(k in res.style)) res.style[k] = x;
      if (regle.arreter) break;
    }
    resultats.set(cle, res);
    return res;
  }

  // --- Décrire une règle (liste des règles, Claude) ---
  function decrire(regle) {
    const nombre = (x) => (typeof x === 'number' ? Formules.texteValeur(x) : typeof x === 'string' && x.startsWith('=') ? Formules.versAffichage(x) : `« ${x} »`);
    switch (regle.type) {
      case 'valeur': return `Valeur ${OPERATEURS[regle.op] || regle.op} ${nombre(regle.v1)}${regle.op === 'entre' || regle.op === 'horsDe' ? ` et ${nombre(regle.v2)}` : ''}`;
      case 'texte': return `Texte qui ${OPS_TEXTE[regle.op] || 'contient'} « ${regle.texte} »`;
      case 'date': return `Date : ${(PERIODES[regle.periode] || regle.periode).toLowerCase()}`;
      case 'top': return `${regle.sens === 'bas' ? 'Les' : 'Les'} ${regle.n || 10}${regle.pourcent ? ' %' : ''} ${regle.sens === 'bas' ? 'plus petites' : 'plus grandes'} valeurs`;
      case 'moyenne': return `${regle.sens === 'dessous' ? 'En dessous' : 'Au-dessus'} de la moyenne`;
      case 'formule': return `Formule ${Formules.versAffichage(`=${String(regle.formule || '').replace(/^=/, '')}`)}`;
      default: return TYPES[regle.type] || regle.type;
    }
  }

  // --- Les modifications (annulables) ---
  let compteur = 0;
  const nouvelId = () => `r${Date.now().toString(36)}${(compteur++).toString(36)}`;
  function ajouter(feuille, regle, nom = 'mise en forme conditionnelle') {
    const r = { ...regle, id: nouvelId(), plages: regle.plages.map((p) => ({ ...p })) };
    Classeur.faire(nom, { feuilles: [feuille], meta: () => { Classeur.meta(feuille).mfc.unshift(r); } });
    return r;
  }
  function remplacerTout(feuille, regles, nom = 'règles de mise en forme') {
    Classeur.faire(nom, { feuilles: [feuille], meta: () => { Classeur.meta(feuille).mfc = regles.map((x) => ({ ...x, id: x.id || nouvelId() })); } });
  }
  // Retire les règles de la plage (ou de toute la feuille sans plage).
  function effacer(feuille, plage = null) {
    const m = Classeur.meta(feuille);
    const garder = plage ? m.mfc.filter((x) => !x.plages.some((p) => croise(p, plage))) : [];
    if (garder.length === m.mfc.length) return 0;
    const n = m.mfc.length - garder.length;
    Classeur.faire('effacer les règles', { feuilles: [feuille], meta: () => { Classeur.meta(feuille).mfc = garder; } });
    return n;
  }

  return { TYPES, OPERATEURS, OPS_TEXTE, PERIODES, STYLES, ECHELLES, BARRES, evaluer, decrire, ajouter, remplacerTout, effacer, decalerFormule, nouvelId };
})();
