// Lire et écrire les classeurs : Excel (xlsx, xls), OpenDocument / LibreOffice (ods), CSV et TSV.
//
// - xlsx : ExcelJS, qui lit et écrit aussi la mise en forme (gras, couleurs, bordures, formats de
//   nombre, largeurs, fusions, volets figés, filtre, couleur des onglets, liens), et la mise en forme
//   conditionnelle. Les graphiques passent par xlsx-extras.js (ExcelJS ne les connaît pas).
// - xls (ancien Excel) et ods : SheetJS, qui sait lire presque tous les formats de tableur. On en tire
//   les valeurs, les formules, les formats de nombre, les fusions et les tailles (pas les couleurs).
// - csv / tsv : lus et écrits ici, à la française par défaut (« ; » entre les colonnes, « 12,5 »).
//
// Lire renvoie les données attendues par Classeur.charger ; écrire part de Classeur.exporter().

const Fichiers = (() => {
  const extension = (nom) => (nom.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

  // Ce qu'on sait enregistrer, et ce que chaque format garde.
  const FORMATS = {
    xlsx: { nom: 'Classeur Excel (.xlsx)', garde: 'tout' },
    ods: { nom: 'Classeur LibreOffice (.ods)', garde: 'les valeurs, les formules, les fusions (pas les couleurs, la mise en forme conditionnelle ni les graphiques)' },
    xls: { nom: 'Excel 97-2003 (.xls)', garde: 'les valeurs seulement (pas les formules ni les couleurs)' },
    csv: { nom: 'CSV (.csv)', garde: 'les valeurs de la feuille affichée seulement' },
    tsv: { nom: 'Texte tabulé (.tsv)', garde: 'les valeurs de la feuille affichée seulement' },
  };

  // --- Couleurs Excel → #rrggbb ---
  // Les couleurs du thème Office (Excel numérote 0 = fond clair, 1 = texte foncé…).
  const THEME = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
  // L'ancienne palette de 64 couleurs « indexées » (fichiers anciens).
  const INDEXEES = '000000FFFFFFFF000000FF000000FFFFFF00FF00FF00FFFF000000FFFFFFFF000000FF000000FFFFFF00FF00FF00FFFF800000008000000080808000800080008080C0C0C0808080'
    + '9999FF993366FFFFCCCCFFFF660066FF80800066CCCCCCFF000080FF00FFFFFF0000FFFF800080800000008080' + '0000FF00CCFFCCFFFFCCFFCCFFFF99' + '99CCFFFF99CCCC99FFFFCC993366FF33CCCC99CC00FFCC00FF9900FF6600666699969696003366339966003300333300993300993366333399333333';
  function couleur(c) {
    if (!c) return null;
    let hex = null;
    if (c.argb && /^[0-9A-F]{8}$/i.test(c.argb)) hex = `#${c.argb.slice(2)}`;
    else if (c.theme !== undefined) hex = THEME[c.theme] || null;
    else if (c.indexed !== undefined && c.indexed < 64) hex = `#${INDEXEES.slice(c.indexed * 6, c.indexed * 6 + 6)}`;
    if (!hex) return null;
    if (c.tint) {
      // La teinte éclaircit (tint > 0) ou assombrit (tint < 0) la couleur du thème.
      const n = parseInt(hex.slice(1), 16);
      const canal = (v) => Math.round(c.tint > 0 ? v + (255 - v) * c.tint : v * (1 + c.tint));
      hex = `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => canal(v).toString(16).padStart(2, '0')).join('')}`;
    }
    return hex.toUpperCase();
  }
  const versArgb = (hex) => ({ argb: `FF${hex.replace('#', '').toUpperCase()}` });

  // --- Fonctions récentes d'Excel ---
  // Dans un fichier, Excel préfixe les fonctions apparues après 2007 (_xlfn.XLOOKUP). On enlève le
  // préfixe en lisant, et on le remet en écrivant, sinon Excel afficherait #NOM?.
  const SANS_PREFIXE = (f) => Formules.booleens(f.replace(/_xlfn\.(_xlws\.)?/gi, '').replace(/_xludf\./gi, ''));
  const RECENTES = new Set(['XLOOKUP', 'IFS', 'SWITCH', 'MAXIFS', 'MINIFS', 'TEXTJOIN', 'CONCAT', 'FILTER', 'SORT', 'UNIQUE', 'SEQUENCE', 'VSTACK', 'HSTACK',
    'DAYS', 'ISOWEEKNUM', 'XOR', 'IFNA', 'BITAND', 'BITOR', 'BITXOR', 'BITLSHIFT', 'BITRSHIFT', 'ARABIC', 'BASE', 'DECIMAL', 'COMBINA', 'COT', 'COTH',
    'CSC', 'CSCH', 'SEC', 'SECH', 'ACOT', 'ACOTH', 'SHEET', 'SHEETS', 'UNICHAR', 'UNICODE', 'FORMULATEXT', 'ISFORMULA', 'PDURATION', 'RRI', 'GAMMA',
    'GAUSS', 'PHI', 'IMCOSH', 'IMCOT', 'IMCSC', 'IMCSCH', 'IMSEC', 'IMSECH', 'IMSINH', 'IMTAN', 'ERF.PRECISE', 'ERFC.PRECISE']);
  const AVEC_XLWS = new Set(['FILTER', 'SORT']);
  function avecPrefixes(formule) {
    return formule.replace(/("(?:[^"]|"")*")|([A-Z][A-Z0-9.]*)\(/gi, (m, texte, nom) => {
      if (texte) return m;
      const N = nom.toUpperCase();
      if (AVEC_XLWS.has(N)) return `_xlfn._xlws.${N}(`;
      if (RECENTES.has(N) || (N.includes('.') && Fonctions.parNom(N, 'en'))) return `_xlfn.${N}(`;
      return m;
    });
  }

  // =================================================================================================
  // Lire
  // =================================================================================================
  async function lire(nom, bytes) {
    const ext = extension(nom);
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return lireTexte(bytes, ext);
    if (ext === 'xlsx' || ext === 'xlsm') {
      try {
        return await lireXlsx(bytes);
      } catch (err) {
        console.warn('ExcelJS n\'a pas pu lire ce fichier, essai avec SheetJS', err);
        const d = lireAvecSheetJS(bytes);
        d.avertissement = 'La mise en forme de ce fichier n\'a pas pu être lue (seulement les valeurs et les formules).';
        return d;
      }
    }
    return lireAvecSheetJS(bytes);
  }

  // Un contenu de cellule pour le moteur.
  const texteCellule = (t) => (t === '' || t === null || t === undefined ? null : `'${t}`);
  const ERREUR_VERS_FORMULE = { '#N/A': '=NA()', '#DIV/0!': '=1/0' };

  async function lireXlsx(bytes) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    const feuilles = [];
    for (const ws of wb.worksheets) {
      if (ws.state === 'veryHidden') continue;
      const cellules = [];
      const styles = [];
      const poser = (r, c, v) => {
        while (cellules.length <= r) cellules.push([]);
        cellules[r][c] = v;
      };
      ws.eachRow({ includeEmpty: false }, (row, rn) => {
        row.eachCell({ includeEmpty: false }, (cell, cn) => {
          const r = rn - 1, c = cn - 1;
          const s = styleDe(cell);
          if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
            if (s?.bordures) styles.push([r, c, { bordures: s.bordures }]);
            return;
          }
          let v = null;
          const val = cell.value;
          switch (cell.type) {
            case ExcelJS.ValueType.Number: v = val; break;
            case ExcelJS.ValueType.Boolean: v = val; break;
            case ExcelJS.ValueType.String: case ExcelJS.ValueType.SharedString: v = texteCellule(String(val)); break;
            case ExcelJS.ValueType.Date: v = (val.getTime() - Date.UTC(1899, 11, 30)) / 86400000; break;
            case ExcelJS.ValueType.RichText: v = texteCellule(val.richText.map((x) => x.text).join('')); break;
            case ExcelJS.ValueType.Hyperlink:
              v = texteCellule(typeof val.text === 'object' ? val.text.richText?.map((x) => x.text).join('') : val.text);
              if (s) s.lien = val.hyperlink; else styles.push([r, c, { lien: val.hyperlink }]);
              break;
            case ExcelJS.ValueType.Formula:
              v = cell.formula ? `=${SANS_PREFIXE(cell.formula)}` : (typeof val.result === 'number' ? val.result : texteCellule(val.result));
              break;
            case ExcelJS.ValueType.Error: v = ERREUR_VERS_FORMULE[val.error] || texteCellule(val.error); break;
            default: v = null;
          }
          if (v !== null) poser(r, c, v);
          if (s) styles.push([r, c, s]);
        });
      });
      const largeurs = [];
      const defaut = ws.properties.defaultColWidth;
      (ws.columns || []).forEach((col, i) => {
        if (col.hidden) largeurs.push([i, 0]);
        else if (col.width) largeurs.push([i, Math.round(col.width * 7 + 5)]);
        else if (defaut) largeurs.push([i, Math.round(defaut * 7 + 5)]);
      });
      const hauteurs = [];
      ws.eachRow({ includeEmpty: true }, (row, rn) => {
        if (row.hidden) hauteurs.push([rn - 1, 0]);
        else if (row.height) hauteurs.push([rn - 1, Math.round(row.height * 4 / 3)]);
      });
      const fusions = (ws.model.merges || []).map((m) => lirePlage(m)).filter(Boolean);
      const vue = (ws.views || [])[0];
      const figer = vue?.state === 'frozen' ? { lignes: vue.ySplit || 0, colonnes: vue.xSplit || 0 } : null;
      let filtre = null;
      if (typeof ws.autoFilter === 'string') filtre = lirePlage(ws.autoFilter);
      else if (ws.autoFilter?.from) filtre = lirePlage(`${typeof ws.autoFilter.from === 'string' ? ws.autoFilter.from : adresse(ws.autoFilter.from.row - 1, ws.autoFilter.from.column - 1)}:${typeof ws.autoFilter.to === 'string' ? ws.autoFilter.to : adresse(ws.autoFilter.to.row - 1, ws.autoFilter.to.column - 1)}`);
      const mfc = (ws.conditionalFormattings || []).flatMap((cf) => {
        const plages = String(cf.ref || '').split(/\s+/).map((x) => lirePlage(x)).filter(Boolean);
        return plages.length ? (cf.rules || []).map((rule) => regleDepuisExcel(rule, plages)).filter(Boolean) : [];
      });
      feuilles.push({ nom: ws.name, cellules, styles, largeurs, hauteurs, fusions, figer, filtre, mfc, couleurOnglet: couleur(ws.properties.tabColor), masquee: ws.state === 'hidden' });
    }
    // Les graphiques, et les règles qu'ExcelJS ne lit pas : directement dans le fichier.
    const extras = await XlsxExtras.lire(bytes);
    for (const f of feuilles) {
      const x = extras[f.nom];
      if (!x) continue;
      f.mfc = [...f.mfc, ...x.regles].sort((a, b) => (a.priorite ?? 99) - (b.priorite ?? 99));
      const larg = new Map(f.largeurs), haut = new Map(f.hauteurs);
      const L = (c) => larg.get(c) ?? Classeur.LARGEUR, H = (r) => haut.get(r) ?? Classeur.HAUTEUR;
      const somme = (de, a, taille) => { let t = -de.d; for (let k = de.k; k < a.k && k < de.k + 2000; k++) t += taille(k); return t + a.d; };
      f.graphiques = x.graphiques.map((g) => {
        let ancre, largeur = Graphiques.LARGEUR, hauteur = Graphiques.HAUTEUR;
        if (g.de) {
          ancre = { r: g.de.r, c: g.de.c, dx: Math.round(g.de.dx), dy: Math.round(g.de.dy) };
          if (g.a) {
            largeur = Math.round(somme({ k: g.de.c, d: g.de.dx }, { k: g.a.c, d: g.a.dx }, L));
            hauteur = Math.round(somme({ k: g.de.r, d: g.de.dy }, { k: g.a.r, d: g.a.dy }, H));
          } else if (g.taille) { largeur = Math.round(g.taille.w); hauteur = Math.round(g.taille.h); }
        } else {
          ancre = { r: 0, c: 0, dx: Math.round(g.position?.x || 0), dy: Math.round(g.position?.y || 0) };
          if (g.taille) { largeur = Math.round(g.taille.w); hauteur = Math.round(g.taille.h); }
        }
        return { type: g.type, titre: g.titre, legende: g.legende, empile: g.empile, series: g.series, donnees: g.donnees, ancre, largeur: Math.max(160, largeur), hauteur: Math.max(110, hauteur) };
      });
    }
    return { feuilles };
  }

  // --- Mise en forme conditionnelle : Excel (ExcelJS) ↔ règles de Reikna (mfc.js) ---
  const OPS_EXCEL = { greaterThan: 'sup', lessThan: 'inf', greaterThanOrEqual: 'supEgal', lessThanOrEqual: 'infEgal', equal: 'egal', notEqual: 'different', between: 'entre', notBetween: 'horsDe' };
  const OPS_TEXTE_EXCEL = { containsText: 'contient', notContains: 'neContientPas', beginsWith: 'commencePar', endsWith: 'finitPar' };
  const PERIODES_EXCEL = { today: 'aujourdhui', yesterday: 'hier', tomorrow: 'demain', last7Days: 'septJours', thisWeek: 'semaine', lastWeek: 'semaineDerniere', nextWeek: 'semaineProchaine', thisMonth: 'mois', lastMonth: 'moisDernier', nextMonth: 'moisProchain' };
  const inverse = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
  const minuscule = (c) => (c ? c.toLowerCase() : c);
  // Une borne de règle écrite par Excel : « 10 », « "abc" » ou une formule.
  function borneDepuisExcel(f) {
    if (f === undefined || f === null) return null;
    const t = String(f).trim();
    if (/^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(t)) return Number(t);
    const m = t.match(/^"((?:[^"]|"")*)"$/);
    if (m) return m[1].replace(/""/g, '"');
    return `=${SANS_PREFIXE(t)}`;
  }
  function borneVersExcel(x) {
    if (typeof x === 'number') return String(x);
    if (typeof x === 'string' && x.startsWith('=')) return avecPrefixes(x.slice(1));
    return `"${String(x ?? '').replace(/"/g, '""')}"`;
  }
  function regleDepuisExcel(rule, plages) {
    const st = rule.style || {};
    const style = {};
    const fond = couleur(st.fill?.bgColor) || couleur(st.fill?.fgColor);
    if (fond) style.fond = minuscule(fond);
    if (st.font?.color) { const c = couleur(st.font.color); if (c) style.couleur = minuscule(c); }
    if (st.font?.bold) style.gras = true;
    if (st.font?.italic) style.italique = true;
    const base = { plages, style, priorite: rule.priority ?? 99, ...(rule.stopIfTrue ? { arreter: true } : {}) };
    const f = rule.formulae || [];
    switch (rule.type) {
      case 'cellIs': return { ...base, type: 'valeur', op: OPS_EXCEL[rule.operator] || 'egal', v1: borneDepuisExcel(f[0]), v2: borneDepuisExcel(f[1]) };
      case 'expression': return f[0] ? { ...base, type: 'formule', formule: SANS_PREFIXE(String(f[0])) } : null;
      case 'containsText': {
        const texte = rule.text ?? String(f[0] || '').match(/"((?:[^"]|"")*)"/)?.[1]?.replace(/""/g, '"') ?? '';
        return { ...base, type: 'texte', op: OPS_TEXTE_EXCEL[rule.operator] || 'contient', texte };
      }
      case 'timePeriod': return { ...base, type: 'date', periode: PERIODES_EXCEL[rule.timePeriod] || 'aujourdhui' };
      case 'top10': return { ...base, type: 'top', sens: rule.bottom ? 'bas' : 'haut', n: rule.rank || 10, pourcent: Boolean(rule.percent) };
      case 'aboveAverage': return { ...base, type: 'moyenne', sens: rule.aboveAverage === false ? 'dessous' : 'dessus' };
      case 'colorScale': {
        const cs = (rule.color || []).map((c) => minuscule(couleur(c)) || '#ffffff');
        return { plages, priorite: base.priorite, type: 'echelle', couleurs: cs.length >= 3 ? cs.slice(0, 3) : [cs[0] || '#fcfcff', null, cs[1] || '#63be7b'] };
      }
      case 'dataBar': return { plages, priorite: base.priorite, type: 'barres', couleur: minuscule(couleur(rule.color)) || '#638ec6' };
      default: return null; // jeux d'icônes : pas encore
    }
  }
  function regleVersExcel(regle, priority) {
    const style = {};
    const s = regle.style || {};
    if (s.fond) style.fill = { type: 'pattern', pattern: 'solid', bgColor: versArgb(s.fond) };
    const font = {};
    if (s.couleur) font.color = versArgb(s.couleur);
    if (s.gras) font.bold = true;
    if (s.italique) font.italic = true;
    if (Object.keys(font).length) style.font = font;
    const base = { priority, ...(regle.arreter ? { stopIfTrue: true } : {}), style };
    const coin = regle.plages[0];
    const cel = adresse(coin.r1, coin.c1);
    const abs = `$${lettreColonne(coin.c1)}$${coin.r1 + 1}:$${lettreColonne(coin.c2)}$${coin.r2 + 1}`;
    switch (regle.type) {
      case 'valeur': return { ...base, type: 'cellIs', operator: inverse(OPS_EXCEL)[regle.op] || 'equal', formulae: [borneVersExcel(regle.v1), ...(regle.op === 'entre' || regle.op === 'horsDe' ? [borneVersExcel(regle.v2)] : [])] };
      case 'texte': return { ...base, type: 'containsText', operator: inverse(OPS_TEXTE_EXCEL)[regle.op] || 'containsText', text: regle.texte || '' };
      case 'date': return { ...base, type: 'timePeriod', timePeriod: inverse(PERIODES_EXCEL)[regle.periode] || 'today' };
      case 'top': return { ...base, type: 'top10', rank: regle.n || 10, percent: Boolean(regle.pourcent), bottom: regle.sens === 'bas' };
      case 'moyenne': return { ...base, type: 'aboveAverage', aboveAverage: regle.sens !== 'dessous' };
      case 'formule': return { ...base, type: 'expression', formulae: [avecPrefixes(String(regle.formule || 'FALSE()'))] };
      // Ce qu'ExcelJS ne sait pas écrire tel quel : une formule qui fait la même chose.
      case 'doublons': return { ...base, type: 'expression', formulae: [`COUNTIF(${abs},${cel})>1`] };
      case 'uniques': return { ...base, type: 'expression', formulae: [`COUNTIF(${abs},${cel})=1`] };
      case 'vides': return { ...base, type: 'expression', formulae: [`LEN(TRIM(${cel}))=0`] };
      case 'nonVides': return { ...base, type: 'expression', formulae: [`LEN(TRIM(${cel}))>0`] };
      case 'erreurs': return { ...base, type: 'expression', formulae: [`ISERROR(${cel})`] };
      case 'echelle': {
        const [a, m, b] = regle.couleurs;
        return m
          ? { priority, type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [versArgb(a), versArgb(m), versArgb(b)] }
          : { priority, type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'max' }], color: [versArgb(a), versArgb(b)] };
      }
      case 'barres': return { priority, type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: versArgb(regle.couleur || '#638ec6'), gradient: true };
      default: return null;
    }
  }

  function styleDe(cell) {
    const st = cell.style || {};
    const s = {};
    const f = st.font;
    if (f) {
      if (f.bold) s.gras = true;
      if (f.italic) s.italique = true;
      if (f.underline) s.souligne = true;
      if (f.strike) s.barre = true;
      if (f.size && f.size !== 11) s.taille = f.size;
      if (f.name && !/^(Calibri|Aptos Narrow|Arial)$/i.test(f.name)) s.police = f.name;
      const c = couleur(f.color);
      if (c && c !== '#000000') s.couleur = c;
    }
    if (st.fill?.type === 'pattern' && st.fill.pattern && st.fill.pattern !== 'none') {
      const c = couleur(st.fill.fgColor) || couleur(st.fill.bgColor);
      if (c) s.fond = c;
    }
    const a = st.alignment;
    if (a) {
      if (['left', 'center', 'right', 'centerContinuous', 'fill', 'justify', 'distributed'].includes(a.horizontal)) s.alignH = a.horizontal === 'centerContinuous' ? 'center' : ['left', 'center', 'right'].includes(a.horizontal) ? a.horizontal : 'left';
      if (a.vertical === 'top' || a.vertical === 'middle') s.alignV = a.vertical;
      if (a.wrapText) s.retour = true;
      if (a.indent) s.retrait = a.indent;
    }
    if (st.numFmt && st.numFmt !== 'General') s.format = Formules.formatLocal(st.numFmt);
    const b = st.border;
    if (b) {
      const bo = {};
      for (const [cote, k] of [['top', 't'], ['right', 'r'], ['bottom', 'b'], ['left', 'l']]) {
        if (b[cote]?.style) bo[k] = { s: b[cote].style, c: couleur(b[cote].color) };
      }
      if (Object.keys(bo).length) s.bordures = bo;
    }
    return Object.keys(s).length ? s : null;
  }

  function lireAvecSheetJS(bytes) {
    const wb = XLSX.read(bytes, { type: 'array', cellFormula: true, cellNF: true, cellDates: false, cellHTML: false, cellText: false });
    const feuilles = [];
    for (const nom of wb.SheetNames) {
      const ws = wb.Sheets[nom];
      const cellules = [];
      const styles = [];
      if (ws['!ref']) {
        const plage = XLSX.utils.decode_range(ws['!ref']);
        for (let r = plage.s.r; r <= plage.e.r; r++) {
          for (let c = plage.s.c; c <= plage.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (!cell) continue;
            let v = null;
            if (cell.f) v = `=${SANS_PREFIXE(cell.f)}`;
            else if (cell.t === 'n') v = cell.v;
            else if (cell.t === 'b') v = cell.v;
            else if (cell.t === 's' || cell.t === 'str') v = texteCellule(cell.v);
            else if (cell.t === 'd') v = (new Date(cell.v).getTime() - Date.UTC(1899, 11, 30)) / 86400000;
            else if (cell.t === 'e') v = ERREUR_VERS_FORMULE[cell.w] || texteCellule(cell.w);
            if (v !== null) {
              while (cellules.length <= r) cellules.push([]);
              cellules[r][c] = v;
            }
            const s = {};
            if (cell.z && cell.z !== 'General' && cell.t !== 's') s.format = Formules.formatLocal(String(cell.z));
            if (cell.l?.Target) s.lien = cell.l.Target;
            if (Object.keys(s).length) styles.push([r, c, s]);
          }
        }
      }
      const largeurs = (ws['!cols'] || []).map((col, i) => (col ? [i, col.hidden ? 0 : Math.round(col.wpx || (col.wch ? col.wch * 7 + 5 : 0))] : null)).filter((x) => x && (x[1] || x[1] === 0) && !(x[1] === 0 && !ws['!cols'][x[0]].hidden));
      const hauteurs = (ws['!rows'] || []).map((row, i) => (row ? [i, row.hidden ? 0 : Math.round(row.hpx || (row.hpt ? row.hpt * 4 / 3 : 0))] : null)).filter((x) => x && (x[1] || ws['!rows'][x[0]].hidden));
      const fusions = (ws['!merges'] || []).map((m) => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }));
      const filtre = ws['!autofilter']?.ref ? lirePlage(ws['!autofilter'].ref) : null;
      feuilles.push({ nom, cellules, styles, largeurs, hauteurs, fusions, filtre });
    }
    return { feuilles };
  }

  // --- CSV / TSV ---
  function decoder(bytes) {
    const u8 = new Uint8Array(bytes);
    if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return { texte: new TextDecoder('utf-8').decode(u8.subarray(3)), encodage: 'UTF-8' };
    if (u8[0] === 0xFF && u8[1] === 0xFE) return { texte: new TextDecoder('utf-16le').decode(u8.subarray(2)), encodage: 'UTF-16' };
    try {
      return { texte: new TextDecoder('utf-8', { fatal: true }).decode(u8), encodage: 'UTF-8' };
    } catch {
      // Pas de l'UTF-8 valide : c'est sans doute un CSV enregistré par un vieil Excel français (Windows-1252).
      return { texte: new TextDecoder('windows-1252').decode(u8), encodage: 'Windows-1252' };
    }
  }

  // Le séparateur le plus probable : celui qui revient le même nombre de fois sur les premières lignes.
  function deviner(texte) {
    const lignes = texte.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
    let meilleur = ';', score = -1;
    for (const sep of [';', '\t', ',', '|']) {
      const comptes = lignes.map((l) => l.replace(/"[^"]*"/g, '').split(sep).length - 1);
      if (!comptes.length || comptes[0] === 0) continue;
      const pareils = comptes.filter((n) => n === comptes[0]).length;
      const s = pareils * 100 + comptes[0];
      if (s > score) { score = s; meilleur = sep; }
    }
    return meilleur;
  }

  function decouper(texte, sep) {
    const lignes = [];
    let ligne = [], champ = '', guillemets = false;
    for (let i = 0; i < texte.length; i++) {
      const ch = texte[i];
      if (guillemets) {
        if (ch === '"') {
          if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false;
        } else champ += ch;
      } else if (ch === '"' && champ === '') guillemets = true;
      else if (ch === sep) { ligne.push(champ); champ = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texte[i + 1] === '\n') i++;
        ligne.push(champ); lignes.push(ligne); ligne = []; champ = '';
      } else champ += ch;
    }
    if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes;
  }

  function lireTexte(bytes, ext) {
    const { texte, encodage } = decoder(bytes);
    const sep = ext === 'tsv' ? '\t' : deviner(texte);
    const lignes = decouper(texte, sep);
    const cellules = [], styles = [];
    lignes.forEach((l, r) => {
      cellules.push(l.map((t, c) => {
        if (t.startsWith('=') && t.length > 1) return Formules.versMoteur(t, { auto: true });
        const { contenu, format } = Formules.lireSaisie(t);
        if (format) styles.push([r, c, { format }]);
        return contenu;
      }));
    });
    const noms = { ';': 'point-virgule', '\t': 'tabulation', ',': 'virgule', '|': 'barre verticale' };
    return { feuilles: [{ nom: 'Feuil1', cellules, styles }], info: `Séparateur : ${noms[sep]} · encodage ${encodage}` };
  }

  // =================================================================================================
  // Écrire
  // =================================================================================================
  async function ecrire(format, { feuilleActive, csvSeparateur = ';', csvDecimale = ',' } = {}) {
    const feuilles = Classeur.exporter();
    if (format === 'xlsx') return new Uint8Array(await ecrireXlsx(feuilles));
    if (format === 'ods' || format === 'xls') return new Uint8Array(ecrireAvecSheetJS(feuilles, format));
    if (format === 'csv' || format === 'tsv') {
      const f = feuilles.find((x) => x.nom === Classeur.nomFeuille(feuilleActive)) || feuilles[0];
      return ecrireTexte(f, format === 'tsv' ? '\t' : csvSeparateur, csvDecimale, feuilleActive);
    }
    throw new Error(`Format inconnu : ${format}`);
  }

  function valeurXlsx(cel) {
    const v = cel.valeur;
    if (v && typeof v === 'object' && v.type) return { error: v.value };
    return v;
  }

  async function ecrireXlsx(feuilles) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Reikna';
    wb.created = new Date();
    for (const f of feuilles) {
      const ws = wb.addWorksheet(f.nom, {
        properties: f.couleurOnglet ? { tabColor: versArgb(f.couleurOnglet) } : {},
        views: f.figer && (f.figer.lignes || f.figer.colonnes) ? [{ state: 'frozen', xSplit: f.figer.colonnes, ySplit: f.figer.lignes }] : [],
      });
      const styles = new Map(f.styles.map(([r, c, s]) => [`${r}:${c}`, s]));
      f.cellules.forEach((ligne, r) => ligne.forEach((cel, c) => {
        if (!cel) return;
        const cell = ws.getCell(r + 1, c + 1);
        const s = styles.get(`${r}:${c}`);
        if (cel.formule !== undefined) {
          const resultat = valeurXlsx(cel);
          cell.value = { formula: avecPrefixes(cel.formule), ...(resultat !== null && resultat !== undefined ? { result: resultat } : {}) };
        } else if (s?.lien && typeof cel.valeur === 'string') {
          cell.value = { text: cel.valeur, hyperlink: s.lien };
        } else {
          cell.value = valeurXlsx(cel);
        }
      }));
      for (const [k, s] of styles) {
        const [r, c] = k.split(':').map(Number);
        Object.assign(ws.getCell(r + 1, c + 1), styleXlsx(s));
      }
      for (const [c, s] of f.stylesColonnes || []) ws.getColumn(c + 1).style = styleXlsx(s);
      for (const [c, px] of f.largeurs) {
        const col = ws.getColumn(c + 1);
        if (px === 0) col.hidden = true; else col.width = Math.max(1, (px - 5) / 7);
      }
      for (const [r, px] of f.hauteurs) {
        const row = ws.getRow(r + 1);
        if (px === 0) row.hidden = true; else row.height = px * 3 / 4;
      }
      for (const r of f.cachees || []) ws.getRow(r + 1).hidden = true;
      for (const p of f.fusions) {
        try { ws.mergeCells(p.r1 + 1, p.c1 + 1, p.r2 + 1, p.c2 + 1); } catch { /* fusions qui se chevauchent : on garde la première */ }
      }
      if (f.filtre) ws.autoFilter = adressePlage(f.filtre);
      (f.mfc || []).forEach((regle, i) => {
        const rule = regleVersExcel(regle, i + 1);
        if (rule) ws.addConditionalFormatting({ ref: regle.plages.map(adressePlage).join(' '), rules: [rule] });
      });
    }
    if (!feuilles.length) wb.addWorksheet('Feuil1');
    const buffer = await wb.xlsx.writeBuffer();
    // Les graphiques : ajoutés au fichier d'ExcelJS.
    const parFeuille = feuilles.map((f, index) => {
      const larg = new Map(f.largeurs), haut = new Map(f.hauteurs);
      const graphiques = (f.graphiques || []).map((g) => {
        const id = Classeur.idFeuille(g.donnees.nomFeuille);
        if (id === undefined) return null;
        const d = Graphiques.lire({ ...g, donnees: { feuille: id, plage: g.donnees.plage } });
        return d.erreur ? null : { g, d, nomFeuilleDonnees: g.donnees.nomFeuille };
      }).filter(Boolean);
      return { index, graphiques, largeur: (c) => larg.get(c) ?? Classeur.LARGEUR, hauteur: (r) => haut.get(r) ?? Classeur.HAUTEUR };
    });
    return XlsxExtras.ecrireGraphiques(buffer, parFeuille);
  }

  function styleXlsx(s) {
    const out = {};
    const font = {};
    if (s.gras) font.bold = true;
    if (s.italique) font.italic = true;
    if (s.souligne) font.underline = true;
    if (s.barre) font.strike = true;
    if (s.taille) font.size = s.taille;
    if (s.police) font.name = s.police;
    if (s.couleur) font.color = versArgb(s.couleur);
    if (s.lien && !s.couleur) { font.color = { theme: 10 }; font.underline = true; }
    if (Object.keys(font).length) out.font = { name: 'Calibri', size: 11, ...font };
    if (s.fond) out.fill = { type: 'pattern', pattern: 'solid', fgColor: versArgb(s.fond) };
    const al = {};
    if (s.alignH) al.horizontal = s.alignH;
    if (s.alignV) al.vertical = s.alignV;
    if (s.retour) al.wrapText = true;
    if (s.retrait) al.indent = s.retrait;
    if (Object.keys(al).length) out.alignment = al;
    if (s.format) out.numFmt = s.format;
    if (s.bordures) {
      const b = {};
      for (const [k, cote] of [['t', 'top'], ['r', 'right'], ['b', 'bottom'], ['l', 'left']]) {
        if (s.bordures[k]) b[cote] = { style: s.bordures[k].s || 'thin', ...(s.bordures[k].c ? { color: versArgb(s.bordures[k].c) } : {}) };
      }
      out.border = b;
    }
    return out;
  }

  function ecrireAvecSheetJS(feuilles, format) {
    const wb = XLSX.utils.book_new();
    for (const f of feuilles) {
      const ws = {};
      const styles = new Map(f.styles.map(([r, c, s]) => [`${r}:${c}`, s]));
      let maxR = 0, maxC = 0;
      f.cellules.forEach((ligne, r) => ligne.forEach((cel, c) => {
        if (!cel) return;
        const v = cel.valeur;
        const cell = {};
        if (v === null || v === undefined) cell.t = 'z';
        else if (typeof v === 'object' && v.type) { cell.t = 'e'; cell.v = 0; cell.w = v.value; }
        else if (typeof v === 'number') { cell.t = 'n'; cell.v = v; }
        else if (typeof v === 'boolean') { cell.t = 'b'; cell.v = v; }
        else { cell.t = 's'; cell.v = String(v); }
        if (cel.formule !== undefined) cell.f = cel.formule;
        const s = styles.get(`${r}:${c}`);
        if (s?.format) cell.z = s.format;
        ws[XLSX.utils.encode_cell({ r, c })] = cell;
        maxR = Math.max(maxR, r);
        maxC = Math.max(maxC, c);
      }));
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
      ws['!merges'] = f.fusions.map((p) => ({ s: { r: p.r1, c: p.c1 }, e: { r: p.r2, c: p.c2 } }));
      const cols = [];
      for (const [c, px] of f.largeurs) cols[c] = px === 0 ? { hidden: true } : { wpx: px };
      if (cols.length) ws['!cols'] = cols;
      const rows = [];
      for (const [r, px] of f.hauteurs) rows[r] = px === 0 ? { hidden: true } : { hpx: px };
      if (rows.length) ws['!rows'] = rows;
      XLSX.utils.book_append_sheet(wb, ws, f.nom);
    }
    return XLSX.write(wb, { bookType: format === 'xls' ? 'biff8' : 'ods', type: 'array' });
  }

  function ecrireTexte(f, sep, decimale, feuille) {
    const lignes = f.cellules.map((ligne, r) => {
      const champs = ligne.map((cel, c) => {
        if (!cel) return '';
        const v = cel.valeur;
        let t;
        const fmt = Classeur.style(feuille, r, c)?.format;
        if (typeof v === 'number' && !Formules.estDate(fmt) && !/%/.test(fmt || '')) t = String(Number(v.toPrecision(15))).replace('.', decimale);
        else t = Classeur.texte(feuille, r, c);
        if (t.includes(sep) || /["\r\n]/.test(t)) t = `"${t.replace(/"/g, '""')}"`;
        return t;
      });
      while (champs.length && champs[champs.length - 1] === '') champs.pop();
      return champs.join(sep);
    });
    // UTF-8 avec BOM : Excel reconnaît alors les accents tout seul.
    const corps = new TextEncoder().encode(lignes.join('\r\n') + '\r\n');
    const out = new Uint8Array(corps.length + 3);
    out.set([0xEF, 0xBB, 0xBF]);
    out.set(corps, 3);
    return out;
  }

  return { lire, ecrire, extension, FORMATS };
})();
