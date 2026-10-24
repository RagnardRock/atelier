// Les formules et les nombres « à la française ».
//
// Le moteur de calcul (HyperFormula) et les fichiers Excel parlent anglais : =SUM(A1:A3, 2.5).
// Toi, tu tapes et tu lis =SOMME(A1:A3; 2,5), comme dans un Excel français. Formules.versMoteur et
// Formules.versAffichage font la traduction dans les deux sens : noms des fonctions, « ; » ↔ « , »
// entre les arguments, « , » ↔ « . » dans les nombres. Le reste (références, textes entre guillemets,
// noms de feuilles) ne change pas.
//
// On y trouve aussi : la lecture de ce que tu tapes dans une cellule (12,5 → nombre ; 24/10/2026 →
// date ; 15 % → pourcentage ; 12 € → montant) et l'écriture des valeurs selon leur format.

const Formules = (() => {
  let enVersFr = new Map(); // SUM → SOMME
  let frVersEn = new Map(); // SOMME → SUM
  let langue = 'fr';

  function preparer(HyperFormula, frFR) {
    const noms = HyperFormula.getRegisteredFunctionNames('enGB');
    Fonctions.preparer(frFR.functions, noms);
    enVersFr = Fonctions.enVersFr();
    enVersFr.set('TRUE', 'VRAI');
    enVersFr.set('FALSE', 'FAUX');
    frVersEn = new Map([...enVersFr].map(([en, fr]) => [fr, en]));
  }
  const setLangue = (l) => { langue = l === 'en' ? 'en' : 'fr'; };
  const getLangue = () => langue;

  // --- Traduction des formules ---
  const DEBUT_NOM = /[A-Za-z_À-ɏ]/;
  const SUITE_NOM = /[A-Za-z0-9_.À-ɏ]/;

  // versFr = true : moteur → français ; false : français → moteur.
  function traduire(formule, versFr) {
    let out = '';
    let i = 0;
    const s = formule;
    let accolades = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"' || ch === '\'') {
        // Texte entre guillemets ou nom de feuille entre apostrophes : copié tel quel ("" et '' = le caractère lui-même).
        let j = i + 1;
        while (j < s.length) {
          if (s[j] === ch) { if (s[j + 1] === ch) { j += 2; continue; } break; }
          j++;
        }
        out += s.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (ch === '{') accolades++;
      if (ch === '}') accolades = Math.max(0, accolades - 1);
      if (DEBUT_NOM.test(ch)) {
        let j = i + 1;
        while (j < s.length && SUITE_NOM.test(s[j])) j++;
        const mot = s.slice(i, j);
        let k = j;
        while (s[k] === ' ') k++;
        const fonction = s[k] === '(';
        const MOT = mot.toUpperCase();
        // TRUE() (comme le moteur l'écrit) s'affiche VRAI, sans les parenthèses.
        if (versFr && fonction && (MOT === 'TRUE' || MOT === 'FALSE') && s.slice(k, k + 2) === '()') {
          out += enVersFr.get(MOT) || MOT;
          i = k + 2;
          continue;
        }
        if (fonction || ['TRUE', 'FALSE', 'VRAI', 'FAUX'].includes(MOT)) {
          const t = versFr ? enVersFr.get(MOT) : frVersEn.get(MOT);
          out += t || (fonction ? MOT : mot);
        } else {
          out += mot; // une référence (A1, Feuil1!B2) ou un nom
        }
        i = j;
        continue;
      }
      if (/[0-9]/.test(ch) || (ch === (versFr ? '.' : ',') && /[0-9]/.test(s[i + 1] || '') && !/[A-Za-z0-9_)]/.test(s[i - 1] || ''))) {
        // Un nombre : 12.5 ↔ 12,5 (et 1.5E+3).
        let j = i;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
        const sepEntree = versFr ? '.' : ',';
        if (s[j] === sepEntree && /[0-9]/.test(s[j + 1] || '')) {
          j++;
          while (j < s.length && /[0-9]/.test(s[j])) j++;
        }
        if (/[eE]/.test(s[j] || '') && /[+-]?[0-9]/.test(s.slice(j + 1, j + 3))) {
          j++;
          if (/[+-]/.test(s[j])) j++;
          while (j < s.length && /[0-9]/.test(s[j])) j++;
        }
        const nombre = s.slice(i, j);
        out += versFr ? nombre.replace('.', ',') : nombre.replace(',', '.');
        i = j;
        continue;
      }
      if (accolades === 0) {
        if (versFr && ch === ',') { out += ';'; i++; continue; }
        if (!versFr && ch === ';') { out += ','; i++; continue; }
      }
      out += ch;
      i++;
    }
    return out;
  }

  // Formule tapée (avec son « = ») → formule du moteur. En anglais, rien à traduire.
  // Avec auto : on devine la langue (Claude écrit dans l'une ou l'autre).
  function versMoteur(formule, { auto = false } = {}) {
    if (langue === 'en' && !auto) return booleens(formule);
    if (auto && !estFrancaise(formule)) return booleens(formule);
    return booleens(traduire(formule, false));
  }
  // Pour Excel, TRUE et FALSE (VRAI, FAUX) sont des valeurs ; pour le moteur, des fonctions : TRUE().
  // Sert aussi aux formules lues dans un fichier.
  const booleens = (formule) => formule.replace(/("(?:[^"]|"")*"|'(?:[^']|'')*')|(^|[^A-Za-z0-9_.!À-ɏ])(TRUE|FALSE|VRAI|FAUX)(?![A-Za-z0-9_.!(À-ɏ])(?!\s*\()/gi,
    (m, texte, avant, mot) => (texte ? texte : `${avant}${/^(TRUE|VRAI)$/i.test(mot) ? 'TRUE' : 'FALSE'}()`));
  const versAffichage = (formule) => (langue === 'en' ? formule : traduire(formule, true));

  // Une formule est « française » si elle a un « ; » hors des textes, ou un nom de fonction français.
  function estFrancaise(formule) {
    const sansTextes = formule.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'/g, '');
    if (sansTextes.includes(';')) return true;
    for (const m of sansTextes.matchAll(/([A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*)\s*\(/g)) {
      const n = m[1].toUpperCase();
      if (frVersEn.has(n) && !enVersFr.has(n)) return true;
    }
    return false;
  }

  // --- Erreurs ---
  const ERREURS_FR = { CYCLE: '#CYCLE!', DIV_BY_ZERO: '#DIV/0!', ERROR: '#ERREUR!', NA: '#N/A', NAME: '#NOM?', NUM: '#NOMBRE!', REF: '#REF!', SPILL: '#EPARS!', VALUE: '#VALEUR!' };
  const EXPLICATIONS = {
    CYCLE: 'La formule dépend d\'elle-même (référence circulaire).',
    DIV_BY_ZERO: 'Division par zéro (ou par une cellule vide).',
    ERROR: 'La formule est mal écrite.',
    NA: 'Valeur introuvable (une recherche n\'a rien trouvé).',
    NAME: 'Nom de fonction ou de plage inconnu.',
    NUM: 'Nombre impossible (trop grand, racine d\'un négatif…).',
    REF: 'La formule pointe vers une cellule qui n\'existe plus.',
    SPILL: 'Le résultat ne peut pas déborder : des cellules voisines sont occupées.',
    VALUE: 'Mauvais type de valeur (du texte là où un nombre est attendu…).',
  };
  const texteErreur = (err) => (langue === 'en' ? err.value : (ERREURS_FR[err.type] || err.value));
  const explicationErreur = (err) => [EXPLICATIONS[err.type], err.message].filter(Boolean).join(' ');

  // --- Lire ce que tu tapes dans une cellule ---
  // Renvoie { contenu, format } : contenu = ce qu'on donne au moteur (nombre, booléen, '=formule',
  // ou "'texte" : l'apostrophe force le texte), format = un format de nombre à poser si la cellule
  // n'en a pas (une date tapée prend le format date, par exemple).
  const ESPACES = /[\s  ]/g;
  function lireSaisie(texte) {
    const t = String(texte ?? '');
    if (t === '') return { contenu: null };
    if (t.startsWith('=') && t.length > 1) return { contenu: versMoteur(t) };
    if (t.startsWith('\'')) return { contenu: t };
    const s = t.trim();
    const sansEspaces = s.replace(ESPACES, '');
    // Nombres : 12 ; -3,5 ; 1 234,56 ; 12.5 ; 1,5E+3
    const nombre = (x) => {
      if (/^[+-]?\d+(,\d+)?([eE][+-]?\d+)?$/.test(x)) return Number(x.replace(',', '.'));
      if (/^[+-]?\d+\.\d+([eE][+-]?\d+)?$/.test(x)) return Number(x);
      return null;
    };
    const milliers = /^[+-]?\d{1,3}([\s  ]\d{3})+(,\d+)?$/.test(s);
    let n = nombre(sansEspaces);
    if (n !== null && (milliers || !/\s/.test(s))) {
      return { contenu: n, ...(milliers ? { format: s.includes(',') ? '#,##0.00' : '#,##0' } : {}) };
    }
    // Pourcentages : 15 % ; 12,5%
    let m = sansEspaces.match(/^([+-]?[\d.,]+)%$/);
    if (m && (n = nombre(m[1])) !== null) return { contenu: n / 100, format: m[1].match(/[.,]/) ? '0.00%' : '0%' };
    // Montants : 12 € ; 1 234,50 € ; €12 ; 12 $
    m = sansEspaces.match(/^(-?)([€$£]?)([\d.,]+)([€$£]?)$/);
    if (m && (m[2] || m[4]) && !(m[2] && m[4]) && (n = nombre(m[3])) !== null) {
      const symbole = m[2] || m[4];
      const fmt = symbole === '€' ? '#,##0.00 "€"' : `"${symbole}"#,##0.00`;
      return { contenu: m[1] ? -n : n, format: fmt };
    }
    // Dates : 24/10/2026 ; 24/10/26 ; 24/10 ; 2026-10-24 ; et l'heure éventuelle : 24/10/2026 14:30
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/) ||
      s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      let [jour, mois, annee] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : new Date().getFullYear()];
      if (m[1].length === 4) [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (annee < 100) annee += annee < 50 ? 2000 : 1900;
      const d = new Date(Date.UTC(annee, mois - 1, jour));
      if (d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour) {
        let serie = dateVersSerie(annee, mois, jour);
        if (m[4] !== undefined) serie += (Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6] || 0)) / 86400;
        return { contenu: serie, format: m[4] !== undefined ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy' };
      }
    }
    // Heures : 14:30 ; 8:05:30
    m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m && Number(m[2]) < 60) return { contenu: (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0)) / 86400, format: m[3] ? 'hh:mm:ss' : 'hh:mm' };
    const S = s.toUpperCase();
    if (S === 'VRAI' || S === 'TRUE') return { contenu: true };
    if (S === 'FAUX' || S === 'FALSE') return { contenu: false };
    return { contenu: `'${t}` };
  }

  // Les dates sont des nombres de jours depuis le 30/12/1899, comme dans Excel (1 = 31/12/1899… et
  // Excel compte un 29/02/1900 qui n'a pas existé : on fait pareil pour garder les mêmes nombres).
  function dateVersSerie(annee, mois, jour) {
    const ms = Date.UTC(annee, mois - 1, jour) - Date.UTC(1899, 11, 30);
    const n = Math.round(ms / 86400000);
    return n;
  }
  function serieVersDate(serie) {
    const ms = Math.round(serie * 86400000) + Date.UTC(1899, 11, 30);
    return new Date(ms);
  }

  // --- Écrire une valeur selon son format ---
  // Les formats sont ceux d'Excel (« #,##0.00 », « dd/mm/yyyy », « 0% »…), écrits à l'anglaise comme
  // dans les fichiers. SSF (de SheetJS) fait le travail, puis on passe en français : 1 234,50.
  const DATES_EXCEL_US = { 'm/d/yy': 'dd/mm/yyyy', 'mm-dd-yy': 'dd/mm/yyyy', 'd-mmm-yy': 'dd mmm yy', 'd-mmm': 'dd mmm', 'mmm-yy': 'mmm yy', 'm/d/yy h:mm': 'dd/mm/yyyy hh:mm', 'h:mm AM/PM': 'hh:mm', 'h:mm:ss AM/PM': 'hh:mm:ss' };
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  const formatLocal = (fmt) => DATES_EXCEL_US[fmt] || fmt;
  const estDate = (fmt) => {
    try { return Boolean(fmt) && fmt !== 'General' && XLSX.SSF.is_date(formatLocal(fmt)); } catch { return false; }
  };

  function texteDate(serie, fmt) {
    // Les noms de mois et de jours de SSF sont en anglais : on écrit nous-mêmes ces parties-là.
    const d = serieVersDate(serie);
    let f = formatLocal(fmt);
    const remplacements = [];
    const garde = (texte) => { remplacements.push(texte); return `\u0001${remplacements.length - 1}\u0002`; };
    f = f.replace(/(?<![a-z])mmmm(?![a-z])/gi, () => garde(MOIS_LONGS[d.getUTCMonth()]))
      .replace(/(?<![a-z])mmm(?![a-z])/gi, () => garde(MOIS[d.getUTCMonth()]))
      .replace(/(?<![a-z])dddd(?![a-z])/gi, () => garde(JOURS_LONGS[d.getUTCDay()]))
      .replace(/(?<![a-z])ddd(?![a-z])/gi, () => garde(JOURS[d.getUTCDay()]));
    // Les formats français écrits « jj/mm/aaaa » (tapés à la main) : on les comprend aussi.
    f = f.replace(/j/g, 'd').replace(/a/g, 'y');
    let texte = XLSX.SSF.format(f.replace(/\u0001(\d+)\u0002/g, (_m, i) => `"\u0001${i}\u0002"`), serie);
    texte = texte.replace(/\u0001(\d+)\u0002/g, (_m, i) => remplacements[Number(i)]);
    return texte;
  }

  // valeur : nombre, texte, booléen ou erreur du moteur. fmt : format Excel ou ''.
  // typeMoteur : le type deviné par le moteur (NUMBER_DATE…) quand la cellule n'a pas de format.
  function texteValeur(valeur, fmt, typeMoteur) {
    if (valeur === null || valeur === undefined) return '';
    if (typeof valeur === 'object' && valeur.type) return texteErreur(valeur);
    if (typeof valeur === 'boolean') return langue === 'en' ? (valeur ? 'TRUE' : 'FALSE') : (valeur ? 'VRAI' : 'FAUX');
    if (typeof valeur === 'string') return fmt === '@' || !fmt ? valeur : valeur;
    if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return String(valeur);
    let f = fmt;
    if (!f || f === 'General') {
      if (typeMoteur === 'NUMBER_DATE') f = 'dd/mm/yyyy';
      else if (typeMoteur === 'NUMBER_TIME') f = 'hh:mm';
      else if (typeMoteur === 'NUMBER_DATETIME') f = 'dd/mm/yyyy hh:mm';
      else if (typeMoteur === 'NUMBER_PERCENT') f = '0%';
      else if (typeMoteur === 'NUMBER_CURRENCY') f = '#,##0.00 "€"';
    }
    try {
      if (estDate(f)) return texteDate(valeur, f);
      if (!f || f === 'General') return nombreGeneral(valeur);
      const t = XLSX.SSF.format(f, valeur);
      return langue === 'en' ? t : t.replace(/[,.]/g, (c) => (c === ',' ? ' ' : ','));
    } catch {
      return nombreGeneral(valeur);
    }
  }

  // Sans format : au plus 10 chiffres significatifs, comme Excel (0,1 + 0,2 → 0,3).
  // Les très grands et très petits nombres s'écrivent 1,23457E+12.
  function nombreGeneral(n) {
    if (n === 0) return '0';
    let t = String(Number(n.toPrecision(10)));
    if (Math.abs(n) >= 1e11 || /e/.test(t)) t = n.toExponential(5).replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'E$10$2').replace('e', 'E');
    return langue === 'en' ? t : t.replace('.', ',');
  }

  // Ce qu'on montre dans la barre de formule (et quand tu édites) pour une valeur sans formule.
  function texteEdition(valeur, fmt, typeMoteur) {
    if (valeur === null || valeur === undefined) return '';
    if (typeof valeur === 'boolean') return texteValeur(valeur);
    if (typeof valeur === 'string') {
      // Un texte qui ressemble à un nombre ou à une date garde son apostrophe, sinon il en deviendrait un.
      const relu = lireSaisie(valeur).contenu;
      return typeof relu === 'string' ? valeur : `'${valeur}`;
    }
    if (typeof valeur === 'number') {
      const f = fmt && fmt !== 'General' ? formatLocal(fmt)
        : typeMoteur === 'NUMBER_DATE' ? 'dd/mm/yyyy' : typeMoteur === 'NUMBER_TIME' ? 'hh:mm' : typeMoteur === 'NUMBER_DATETIME' ? 'dd/mm/yyyy hh:mm' : typeMoteur === 'NUMBER_PERCENT' ? '0%' : '';
      if (estDate(f)) {
        const avecHeure = /h/i.test(f), avecJour = /d|y/i.test(f);
        const out = [];
        if (avecJour) out.push(texteDate(valeur, 'dd/mm/yyyy'));
        if (avecHeure) out.push(texteDate(valeur, /s/.test(f) ? 'hh:mm:ss' : 'hh:mm'));
        return out.join(' ') || texteDate(valeur, 'dd/mm/yyyy');
      }
      if (/%/.test(f)) return `${brut(valeur * 100)} %`;
      return brut(valeur);
    }
    return String(valeur);
  }
  const brut = (n) => {
    const t = String(Number(n.toPrecision(15)));
    return langue === 'en' ? t : t.replace('.', ',');
  };

  // Les références d'une formule (pour les colorier dans la grille pendant que tu l'écris).
  // Renvoie [{ debut, fin, texte, feuille }] (positions dans le texte).
  function references(formule) {
    const out = [];
    const re = /("(?:[^"]|"")*")|(?:(?:'((?:[^']|'')+)'|([A-Za-z_À-ɏ][\w.À-ɏ]*))!)?(\$?[A-Za-z]{1,3}\$?\d{1,7}(?::\$?[A-Za-z]{1,3}\$?\d{1,7})?)(?![\w(])/g;
    for (const m of formule.matchAll(re)) {
      if (m[1]) continue; // un texte entre guillemets
      const avant = formule[m.index - 1] || '';
      if (/[\w.]/.test(avant) && !m[2] && !m[3]) continue; // la fin d'un nom (LOG10…)
      out.push({ debut: m.index, fin: m.index + m[0].length, texte: m[4], feuille: m[2] ? m[2].replace(/''/g, '\'') : m[3] || null });
    }
    return out;
  }

  return { preparer, setLangue, getLangue, versMoteur, booleens, versAffichage, estFrancaise, lireSaisie, texteValeur, texteEdition, texteErreur, explicationErreur, estDate, formatLocal, references, dateVersSerie, serieVersDate, ERREURS_FR };
})();
