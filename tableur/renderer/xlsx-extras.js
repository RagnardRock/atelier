// Ce qu'ExcelJS ne sait pas faire dans un .xlsx, fait directement dans le fichier (un .xlsx est un
// dossier zippé de fichiers XML, ouvert ici avec JSZip) :
// - les graphiques : relus (type, données, titre, légende, place) et réécrits pour qu'Excel les affiche ;
// - les règles de mise en forme conditionnelle qu'ExcelJS ignore à la lecture (doublons, valeurs
//   uniques, cellules vides, erreurs).

const XlsxExtras = (() => {
  const NS = {
    c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    xdr: 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
  };
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const EMU = 9525; // un pixel

  const xml = (texte) => new DOMParser().parseFromString(texte, 'application/xml');
  const tous = (n, nom) => (n ? [...n.getElementsByTagNameNS('*', nom)] : []);
  const un = (n, nom) => tous(n, nom)[0] || null;
  const enfants = (n, nom) => (n ? [...n.children].filter((x) => x.localName === nom) : []);
  const val = (n, nom, defaut = null) => un(n, nom)?.getAttribute('val') ?? defaut;
  const echapper = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Chemin d'un fichier visé par une relation (« ../drawings/drawing1.xml » depuis « xl/worksheets/sheet1.xml »).
  function resoudre(depuis, cible) {
    if (cible.startsWith('/')) return cible.slice(1);
    const parts = depuis.split('/').slice(0, -1);
    for (const p of cible.split('/')) {
      if (p === '..') parts.pop(); else if (p !== '.') parts.push(p);
    }
    return parts.join('/');
  }
  const cheminRels = (chemin) => { const i = chemin.lastIndexOf('/'); return `${chemin.slice(0, i)}/_rels/${chemin.slice(i + 1)}.rels`; };
  async function lireRels(zip, chemin) {
    const f = zip.file(cheminRels(chemin));
    if (!f) return new Map();
    const d = xml(await f.async('string'));
    return new Map(tous(d, 'Relationship').map((r) => [r.getAttribute('Id'), { cible: resoudre(chemin, r.getAttribute('Target')), type: r.getAttribute('Type') }]));
  }

  // Les feuilles du classeur : nom → chemin de son XML.
  async function feuillesDe(zip) {
    const wb = xml(await zip.file('xl/workbook.xml').async('string'));
    const rels = await lireRels(zip, 'xl/workbook.xml');
    return tous(wb, 'sheet').map((s) => ({ nom: s.getAttribute('name'), chemin: rels.get(s.getAttributeNS(NS.r, 'id') || s.getAttribute('r:id'))?.cible })).filter((s) => s.chemin);
  }

  // =================================================================================================
  // Lire
  // =================================================================================================
  // Résultat : { [nom de feuille]: { graphiques: [...], regles: [...] } }
  async function lire(bytes) {
    const out = {};
    let zip;
    try { zip = await JSZip.loadAsync(bytes); } catch { return out; }
    if (!zip.file('xl/workbook.xml')) return out;
    const dxfs = await lireDxfs(zip);
    for (const { nom, chemin } of await feuillesDe(zip)) {
      const f = zip.file(chemin);
      if (!f) continue;
      const doc = xml(await f.async('string'));
      const res = { graphiques: [], regles: reglesIgnorees(doc, dxfs) };
      const rels = await lireRels(zip, chemin);
      for (const d of tous(doc, 'drawing')) {
        const rel = rels.get(d.getAttributeNS(NS.r, 'id') || d.getAttribute('r:id'));
        if (rel) res.graphiques.push(...await lireDessin(zip, rel.cible, nom));
      }
      if (res.graphiques.length || res.regles.length) out[nom] = res;
    }
    return out;
  }

  async function lireDessin(zip, chemin, nomFeuille) {
    const f = zip.file(chemin);
    if (!f) return [];
    const doc = xml(await f.async('string'));
    const rels = await lireRels(zip, chemin);
    const graphiques = [];
    const ancres = [...doc.documentElement.children].filter((n) => /Anchor$/.test(n.localName));
    for (const a of ancres) {
      const ref = un(a, 'chart');
      if (!ref) continue;
      const rel = rels.get(ref.getAttributeNS(NS.r, 'id') || ref.getAttribute('r:id'));
      const fc = rel && zip.file(rel.cible);
      if (!fc) continue;
      try {
        const g = lireGraphique(xml(await fc.async('string')), nomFeuille);
        if (!g) continue;
        const point = (n) => (n ? { c: Number(un(n, 'col')?.textContent || 0), r: Number(un(n, 'row')?.textContent || 0), dx: Number(un(n, 'colOff')?.textContent || 0) / EMU, dy: Number(un(n, 'rowOff')?.textContent || 0) / EMU } : null);
        g.de = point(enfants(a, 'from')[0]);
        g.a = point(enfants(a, 'to')[0]);
        const ext = enfants(a, 'ext')[0];
        if (ext) g.taille = { w: Number(ext.getAttribute('cx')) / EMU, h: Number(ext.getAttribute('cy')) / EMU };
        if (!g.de) { const pos = enfants(a, 'pos')[0]; g.position = pos ? { x: Number(pos.getAttribute('x')) / EMU, y: Number(pos.getAttribute('y')) / EMU } : { x: 0, y: 0 }; }
        graphiques.push(g);
      } catch (err) { console.warn('Graphique illisible', err); }
    }
    return graphiques;
  }

  // Une référence « 'Feuil 1'!$A$2:$A$9 » → { nomFeuille, plage }.
  function lireRef(f) {
    if (!f) return null;
    const m = String(f).trim().replace(/^\(|\)$/g, '').match(/^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/);
    if (!m) return null;
    const plage = lirePlage(m[3].split(',')[0]);
    return plage ? { nomFeuille: (m[1] || m[2]).replace(/''/g, '\''), plage } : null;
  }
  const union = (a, b) => (a ? { r1: Math.min(a.r1, b.r1), c1: Math.min(a.c1, b.c1), r2: Math.max(a.r2, b.r2), c2: Math.max(a.c2, b.c2) } : { ...b });

  function lireGraphique(doc, feuilleParDefaut) {
    const zone = un(doc, 'plotArea');
    if (!zone) return null;
    const TYPES = { barChart: 'colonnes', bar3DChart: 'colonnes', lineChart: 'lignes', line3DChart: 'lignes', areaChart: 'aires', area3DChart: 'aires', pieChart: 'secteurs', pie3DChart: 'secteurs', ofPieChart: 'secteurs', doughnutChart: 'anneau', scatterChart: 'nuage', radarChart: 'lignes', bubbleChart: 'nuage' };
    const noeud = [...zone.children].find((n) => TYPES[n.localName]);
    if (!noeud) return null;
    let type = TYPES[noeud.localName];
    if (type === 'colonnes' && val(noeud, 'barDir') === 'bar') type = 'barres';
    const groupe = val(noeud, 'grouping', 'standard');
    // Les données : la plus petite plage qui contient les titres, les catégories et les valeurs de toutes les séries.
    let plage = null, nomFeuille = null;
    let verticales = 0, horizontales = 0;
    for (const ser of enfants(noeud, 'ser')) {
      for (const partie of ['tx', 'cat', 'val', 'xVal', 'yVal']) {
        const r = lireRef(un(enfants(ser, partie)[0], 'f')?.textContent);
        if (!r) continue;
        nomFeuille = nomFeuille || r.nomFeuille;
        if (r.nomFeuille !== nomFeuille) continue;
        plage = union(plage, r.plage);
        if (partie === 'val' || partie === 'yVal') { if (r.plage.c1 === r.plage.c2 && r.plage.r2 > r.plage.r1) verticales++; else if (r.plage.r1 === r.plage.r2 && r.plage.c2 > r.plage.c1) horizontales++; }
      }
    }
    if (!plage) return null;
    const titre = un(doc, 'title');
    const texteTitre = titre ? tous(titre, 't').map((t) => t.textContent).join('') || '' : '';
    const legende = un(doc, 'legend');
    const pos = legende ? val(legende, 'legendPos', 'r') : null;
    return {
      type,
      titre: texteTitre,
      legende: legende ? ({ b: 'bas', r: 'droite', t: 'haut', l: 'droite', tr: 'droite' }[pos] || 'bas') : 'aucune',
      empile: groupe === 'stacked' || groupe === 'percentStacked',
      series: verticales >= horizontales ? 'colonnes' : 'lignes',
      donnees: { nomFeuille: nomFeuille || feuilleParDefaut, plage },
    };
  }

  // Les styles des règles (styles.xml › dxfs) : numéro → { fond, couleur, gras, italique }.
  async function lireDxfs(zip) {
    const f = zip.file('xl/styles.xml');
    if (!f) return [];
    const doc = xml(await f.async('string'));
    const couleurDe = (n) => { const rgb = n?.getAttribute('rgb'); return rgb && rgb.length >= 6 ? `#${rgb.slice(-6).toLowerCase()}` : null; };
    return tous(un(doc, 'dxfs'), 'dxf').map((d) => {
      const s = {};
      const font = un(d, 'font');
      if (font) {
        if (un(font, 'b') && val(font, 'b') !== '0') s.gras = true;
        if (un(font, 'i') && val(font, 'i') !== '0') s.italique = true;
        const c = couleurDe(un(font, 'color'));
        if (c) s.couleur = c;
      }
      const fill = un(d, 'fill');
      const c = couleurDe(un(fill, 'bgColor')) || couleurDe(un(fill, 'fgColor'));
      if (c) s.fond = c;
      return s;
    });
  }
  // Les règles qu'ExcelJS laisse de côté.
  function reglesIgnorees(doc, dxfs) {
    const TYPES = { duplicateValues: 'doublons', uniqueValues: 'uniques', containsBlanks: 'vides', notContainsBlanks: 'nonVides', containsErrors: 'erreurs' };
    const regles = [];
    for (const cf of tous(doc, 'conditionalFormatting')) {
      if (cf.namespaceURI !== doc.documentElement.namespaceURI) continue; // les règles x14 (extLst) : ExcelJS les lit
      const plages = String(cf.getAttribute('sqref') || '').split(/\s+/).map((x) => lirePlage(x)).filter(Boolean);
      if (!plages.length) continue;
      for (const r of enfants(cf, 'cfRule')) {
        const type = TYPES[r.getAttribute('type')];
        if (!type) continue;
        const dxf = r.getAttribute('dxfId');
        regles.push({ type, plages, priorite: Number(r.getAttribute('priority') || 99), style: dxf !== null ? dxfs[Number(dxf)] || {} : {}, ...(r.getAttribute('stopIfTrue') === '1' ? { arreter: true } : {}) });
      }
    }
    return regles;
  }

  // =================================================================================================
  // Écrire les graphiques dans le .xlsx fabriqué par ExcelJS
  // =================================================================================================
  // parFeuille : [{ index (0 = première feuille du fichier), graphiques: [{ g, d (Graphiques.lire), nomFeuilleDonnees }], largeur(c), hauteur(r) }]
  async function ecrireGraphiques(buffer, parFeuille) {
    if (!parFeuille.some((f) => f.graphiques.length)) return buffer;
    const zip = await JSZip.loadAsync(buffer);
    const feuilles = await feuillesDe(zip);
    let types = await zip.file('[Content_Types].xml').async('string');
    const overrides = [];
    let nDessin = 0, nGraphique = 0;
    for (const f of parFeuille) {
      if (!f.graphiques.length) continue;
      const sf = feuilles[f.index];
      if (!sf) continue;
      nDessin++;
      const cheminDessin = `xl/drawings/drawing${nDessin}.xml`;
      const relsDessin = [];
      const ancres = [];
      for (const [i, { g, d, nomFeuilleDonnees }] of f.graphiques.entries()) {
        nGraphique++;
        const id = `rId${i + 1}`;
        zip.file(`xl/charts/chart${nGraphique}.xml`, xmlGraphique(g, d, nomFeuilleDonnees));
        overrides.push(`<Override PartName="/xl/charts/chart${nGraphique}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        relsDessin.push(`<Relationship Id="${id}" Type="${REL}/chart" Target="../charts/chart${nGraphique}.xml"/>`);
        ancres.push(xmlAncre(g, f, i, id));
      }
      zip.file(cheminDessin, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS.xdr}" xmlns:a="${NS.a}">${ancres.join('')}</xdr:wsDr>`);
      zip.file(cheminRels(cheminDessin), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsDessin.join('')}</Relationships>`);
      overrides.push(`<Override PartName="/${cheminDessin}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      // La feuille : une relation vers le dessin, et la balise <drawing> à sa place dans le XML.
      const cheminRelsFeuille = cheminRels(sf.chemin);
      const relsTexte = zip.file(cheminRelsFeuille) ? await zip.file(cheminRelsFeuille).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      const idDessin = `rIdReikna${nDessin}`;
      zip.file(cheminRelsFeuille, relsTexte.replace('</Relationships>', `<Relationship Id="${idDessin}" Type="${REL}/drawing" Target="../drawings/drawing${nDessin}.xml"/></Relationships>`));
      // Les enfants de <worksheet> ont un ordre imposé : <drawing> vient avant ceux-ci.
      const doc = xml(await zip.file(sf.chemin).async('string'));
      const racine = doc.documentElement;
      const APRES = ['legacyDrawing', 'legacyDrawingHF', 'drawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];
      const dessin = doc.createElementNS(racine.namespaceURI, 'drawing');
      dessin.setAttributeNS(NS.r, 'r:id', idDessin);
      racine.insertBefore(dessin, [...racine.children].find((n) => APRES.includes(n.localName)) || null);
      const feuilleXml = new XMLSerializer().serializeToString(doc);
      zip.file(sf.chemin, feuilleXml);
    }
    types = types.replace('</Types>', `${overrides.join('')}</Types>`);
    zip.file('[Content_Types].xml', types);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  // La place du graphique : de la cellule d'ancrage jusqu'à la cellule où tombe son coin en bas à droite.
  function xmlAncre(g, f, i, id) {
    const avancer = (depart, decalage, taille, tailleDe) => {
      let k = depart, reste = decalage + taille;
      while (reste >= tailleDe(k) && k < depart + 2000) { reste -= tailleDe(k); k++; }
      return { k, off: Math.round(reste * EMU) };
    };
    const fin = { c: avancer(g.ancre.c, g.ancre.dx || 0, g.largeur, f.largeur), r: avancer(g.ancre.r, g.ancre.dy || 0, g.hauteur, f.hauteur) };
    // Le décalage de départ, ramené dans la cellule d'ancrage.
    const point = (c, cOff, r, rOff) => `<xdr:col>${c}</xdr:col><xdr:colOff>${cOff}</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>${rOff}</xdr:rowOff>`;
    const debut = { c: avancer(g.ancre.c, 0, g.ancre.dx || 0, f.largeur), r: avancer(g.ancre.r, 0, g.ancre.dy || 0, f.hauteur) };
    return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from>${point(debut.c.k, debut.c.off, debut.r.k, debut.r.off)}</xdr:from><xdr:to>${point(fin.c.k, fin.c.off, fin.r.k, fin.r.off)}</xdr:to>`
      + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${echapper(g.titre || `Graphique ${i + 1}`)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`
      + `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS.c}"><c:chart xmlns:c="${NS.c}" xmlns:r="${NS.r}" r:id="${id}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
  }

  // Le XML d'un graphique (DrawingML), avec les valeurs en cache pour qu'Excel l'affiche tout de suite.
  function xmlGraphique(g, d, nomFeuille) {
    const feuille = `'${nomFeuille.replace(/'/g, '\'\'')}'`;
    const ref = (r1, c1, r2, c2) => `${feuille}!$${lettreColonne(c1)}$${r1 + 1}${r2 !== r1 || c2 !== c1 ? `:$${lettreColonne(c2)}$${r2 + 1}` : ''}`;
    const p = d.plage;
    const couleur = (i) => Graphiques.PALETTE[i % Graphiques.PALETTE.length].slice(1);
    const remplissage = (hex) => `<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr>`;
    const strCache = (textes) => `<c:strCache><c:ptCount val="${textes.length}"/>${textes.map((t, i) => `<c:pt idx="${i}"><c:v>${echapper(t)}</c:v></c:pt>`).join('')}</c:strCache>`;
    const numCache = (valeurs) => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${valeurs.length}"/>${valeurs.map((v, i) => (typeof v === 'number' ? `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>` : '')).join('')}</c:numCache>`;
    const rond = g.type === 'secteurs' || g.type === 'anneau';
    // Les références de chaque série (titre, catégories, valeurs) dans la plage.
    const n = d.enColonnes ? p.r2 - p.r1 + 1 - d.r0 : p.c2 - p.c1 + 1 - d.c0;
    const refsSerie = (k) => (d.enColonnes
      ? { tx: d.ligneTitres ? ref(p.r1, p.c1 + k, p.r1, p.c1 + k) : null, cat: d.colonneTitres ? ref(p.r1 + d.r0, p.c1, p.r2, p.c1) : null, val: ref(p.r1 + d.r0, p.c1 + k, p.r2, p.c1 + k) }
      : { tx: d.colonneTitres ? ref(p.r1 + k, p.c1, p.r1 + k, p.c1) : null, cat: d.ligneTitres ? ref(p.r1, p.c1 + d.c0, p.r1, p.c2) : null, val: ref(p.r1 + k, p.c1 + d.c0, p.r1 + k, p.c2) });
    const tx = (r, nom) => (r ? `<c:tx><c:strRef><c:f>${echapper(r)}</c:f>${strCache([nom])}</c:strRef></c:tx>` : `<c:tx><c:v>${echapper(nom)}</c:v></c:tx>`);
    let series = '';
    let typeXml;
    if (g.type === 'nuage') {
      d.series.forEach((s, i) => {
        const k = i + 1;
        const r = d.enColonnes
          ? { tx: d.ligneTitres ? ref(p.r1, p.c1 + k, p.r1, p.c1 + k) : null, x: ref(p.r1 + d.r0, p.c1, p.r2, p.c1), y: ref(p.r1 + d.r0, p.c1 + k, p.r2, p.c1 + k) }
          : { tx: d.colonneTitres ? ref(p.r1 + k, p.c1, p.r1 + k, p.c1) : null, x: ref(p.r1, p.c1 + d.c0, p.r1, p.c2), y: ref(p.r1 + k, p.c1 + d.c0, p.r1 + k, p.c2) };
        series += `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx(r.tx, s.nom)}<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/>${remplissage(couleur(i))}</c:marker>`
          + `<c:xVal><c:numRef><c:f>${echapper(r.x)}</c:f>${numCache(s.points.map((pt) => pt.x))}</c:numRef></c:xVal><c:yVal><c:numRef><c:f>${echapper(r.y)}</c:f>${numCache(s.points.map((pt) => pt.y))}</c:numRef></c:yVal><c:smooth val="0"/></c:ser>`;
      });
      typeXml = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series}<c:axId val="1001"/><c:axId val="1002"/></c:scatterChart>`;
    } else {
      const liste = rond ? d.series.slice(0, 1) : d.series;
      liste.forEach((s, i) => {
        const k = (d.enColonnes ? d.c0 : d.r0) + s.k;
        const r = refsSerie(k);
        const cat = r.cat ? `<c:cat><c:strRef><c:f>${echapper(r.cat)}</c:f>${strCache(d.categories)}</c:strRef></c:cat>` : '';
        const valeurs = `<c:val><c:numRef><c:f>${echapper(r.val)}</c:f>${numCache(s.valeurs)}</c:numRef></c:val>`;
        let style = remplissage(couleur(i));
        let milieu = '';
        if (g.type === 'lignes') { style = `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${couleur(i)}"/></a:solidFill><a:round/></a:ln></c:spPr>`; milieu = `<c:marker><c:symbol val="circle"/><c:size val="5"/>${remplissage(couleur(i))}</c:marker>`; }
        if (rond) { style = ''; milieu = s.valeurs.map((_, j) => `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/>${remplissage(couleur(j))}</c:dPt>`).join(''); }
        if (g.type === 'colonnes' || g.type === 'barres') milieu = '<c:invertIfNegative val="0"/>';
        series += `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx(r.tx, s.nom)}${style}${milieu}${cat}${valeurs}${g.type === 'lignes' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
      });
      const groupe = g.empile ? 'stacked' : (g.type === 'colonnes' || g.type === 'barres' ? 'clustered' : 'standard');
      if (g.type === 'colonnes' || g.type === 'barres') typeXml = `<c:barChart><c:barDir val="${g.type === 'barres' ? 'bar' : 'col'}"/><c:grouping val="${groupe}"/><c:varyColors val="0"/>${series}<c:gapWidth val="80"/>${g.empile ? '<c:overlap val="100"/>' : ''}<c:axId val="1001"/><c:axId val="1002"/></c:barChart>`;
      else if (g.type === 'lignes') typeXml = `<c:lineChart><c:grouping val="${groupe}"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="1001"/><c:axId val="1002"/></c:lineChart>`;
      else if (g.type === 'aires') typeXml = `<c:areaChart><c:grouping val="${groupe}"/><c:varyColors val="0"/>${series}<c:axId val="1001"/><c:axId val="1002"/></c:areaChart>`;
      else if (g.type === 'anneau') typeXml = `<c:doughnutChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
      else typeXml = `<c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart>`;
    }
    const axe = (nom, id, croise, pos, extra) => `<c:${nom}><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${extra.grille ? '<c:majorGridlines/>' : ''}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${croise}"/><c:crosses val="autoZero"/>${nom === 'catAx' ? '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>' : `<c:crossBetween val="${extra.milieu ? 'midCat' : 'between'}"/>`}</c:${nom}>`;
    let axes = '';
    if (g.type === 'nuage') axes = axe('valAx', 1001, 1002, 'b', { milieu: true }) + axe('valAx', 1002, 1001, 'l', { grille: true, milieu: true });
    else if (!rond) axes = axe('catAx', 1001, 1002, g.type === 'barres' ? 'l' : 'b', {}) + axe('valAx', 1002, 1001, g.type === 'barres' ? 'b' : 'l', { grille: true });
    const legende = g.legende || (rond || d.series.length > 1 ? 'bas' : 'aucune');
    const titre = g.titre ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1400" b="0"/></a:pPr><a:r><a:t>${echapper(g.titre)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><c:roundedCorners val="0"/><c:chart>${titre}<c:plotArea><c:layout/>${typeXml}${axes}</c:plotArea>`
      + `${legende !== 'aucune' ? `<c:legend><c:legendPos val="${{ bas: 'b', droite: 'r', haut: 't' }[legende] || 'b'}"/><c:overlay val="0"/></c:legend>` : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  }

  return { lire, ecrireGraphiques };
})();
