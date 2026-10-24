// Documents OpenDocument (.odt), le format de LibreOffice et d'OpenOffice.
//
// Un .odt est un fichier zip (lu et écrit avec JSZip) qui contient :
// - mimetype : « application/vnd.oasis.opendocument.text », en premier et non compressé ;
// - content.xml : le texte (<text:p>, <text:h>, <text:list>, <table:table>…) et les styles posés
//   sur des morceaux de texte (« styles automatiques ») ;
// - styles.xml : les styles nommés (Titre 1…) et la mise en page (format, marges) ;
// - Pictures/ : les images ; META-INF/manifest.xml : la liste des fichiers.
//
// Edda lit et écrit la même chose que pour Word (voir docx.js), vidéos et sons compris (un lien
// vers le fichier rangé à côté du document).

(() => {
  const { xml, lireXml, enfants, enfant, attr, htmlRun, htmlMedia, stylePara, assemblerListes } = Formats;
  const NS = {
    office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
    fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    xlink: 'http://www.w3.org/1999/xlink',
    svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
    meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
    dc: 'http://purl.org/dc/elements/1.1/',
    loext: 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0',
  };
  const DECL = Object.entries(NS).map(([k, v]) => `xmlns:${k}="${v}"`).join(' ');

  // ======================================================================
  // Ouvrir
  // ======================================================================
  async function lire(bytes, ctx) {
    const zip = await JSZip.loadAsync(bytes);
    const alertes = new Set();
    const contentXml = zip.file('content.xml') && await zip.file('content.xml').async('string');
    if (!contentXml) throw new Error('Ce fichier n\'est pas un document OpenDocument (.odt) : content.xml est absent.');
    const content = lireXml(contentXml);
    const stylesDoc = zip.file('styles.xml') ? lireXml(await zip.file('styles.xml').async('string')) : null;

    // Styles (nommés et automatiques) : nom → { famille, parent, nomAffiche, texte, para, liste }
    const styles = {};
    const listes = {}; // nom du style de liste → niveau → 'ul' | 'ol'
    const polices = {}; // nom de police déclarée → famille
    for (const d of [stylesDoc, content]) {
      if (!d) continue;
      for (const f of d.getElementsByTagNameNS(NS.style, 'font-face')) polices[f.getAttributeNS(NS.style, 'name')] = (f.getAttributeNS(NS.svg, 'font-family') || '').replace(/^['"]|['"]$/g, '');
      for (const s of [...d.getElementsByTagNameNS(NS.style, 'style'), ...d.getElementsByTagNameNS(NS.style, 'default-style')]) {
        const nom = s.localName === 'default-style' ? `__defaut_${s.getAttributeNS(NS.style, 'family')}` : s.getAttributeNS(NS.style, 'name');
        styles[nom] = {
          famille: s.getAttributeNS(NS.style, 'family'),
          parent: s.getAttributeNS(NS.style, 'parent-style-name') || (s.localName === 'style' ? `__defaut_${s.getAttributeNS(NS.style, 'family')}` : null),
          affiche: s.getAttributeNS(NS.style, 'display-name') || nom,
          texte: enfant(s, 'text-properties'),
          para: enfant(s, 'paragraph-properties'),
          cellule: enfant(s, 'table-cell-properties'),
          listeStyle: s.getAttributeNS(NS.style, 'list-style-name'),
        };
      }
      for (const l of d.getElementsByTagNameNS(NS.text, 'list-style')) {
        const niveaux = {};
        for (const n of enfants(l)) niveaux[Number(n.getAttributeNS(NS.text, 'level')) - 1] = n.localName === 'list-level-style-number' ? 'ol' : 'ul';
        listes[l.getAttributeNS(NS.style, 'name')] = niveaux;
      }
    }
    if (styles.__defaut_paragraph && !styles.__defaut_paragraph.parent) styles.__defaut_paragraph.parent = null;
    for (const k of Object.keys(styles)) if (k.startsWith('__defaut_')) styles[k].parent = null;
    const police = (tp) => {
      const n = tp && (tp.getAttributeNS(NS.style, 'font-name') || tp.getAttributeNS(NS.fo, 'font-family'));
      return n ? (polices[n] || n).replace(/^['"]|['"]$/g, '') : null;
    };
    function texteDuStyle(nom, profondeur = 0) {
      const s = styles[nom];
      if (!s || profondeur > 12) return {};
      const f = { ...texteDuStyle(s.parent, profondeur + 1) };
      const tp = s.texte;
      if (tp) {
        const g = (k) => tp.getAttributeNS(NS.fo, k);
        const st = (k) => tp.getAttributeNS(NS.style, k);
        if (g('font-weight')) f.gras = g('font-weight') === 'bold' || Number(g('font-weight')) >= 600;
        if (g('font-style')) f.italique = g('font-style') === 'italic' || g('font-style') === 'oblique';
        if (st('text-underline-style')) f.souligne = st('text-underline-style') !== 'none';
        if (st('text-line-through-style')) f.barre = st('text-line-through-style') !== 'none';
        if (g('color')) f.couleur = couleurHex(g('color'));
        if (g('background-color')) f.fond = couleurHex(g('background-color'));
        if (g('font-size') && !/%$/.test(g('font-size'))) f.taille = taillePt(g('font-size'));
        const p = police(tp);
        if (p) f.police = p;
        const pos = st('text-position');
        if (pos) { f.exposant = /^(super|[1-9])/.test(pos); f.indice = /^(sub|-)/.test(pos); }
      }
      return f;
    }
    function paraDuStyle(nom, profondeur = 0) {
      const s = styles[nom];
      if (!s || profondeur > 12) return {};
      const p = { ...paraDuStyle(s.parent, profondeur + 1) };
      const pp = s.para;
      if (pp) {
        const a = pp.getAttributeNS(NS.fo, 'text-align');
        if (a) p.align = { start: 'left', left: 'left', center: 'center', end: 'right', right: 'right', justify: 'justify' }[a] || null;
        const m = pp.getAttributeNS(NS.fo, 'margin-left');
        if (m) p.retrait = Unites.lire(m) || 0;
        const ti = pp.getAttributeNS(NS.fo, 'text-indent');
        if (ti) p.premiere = Unites.lire(ti) || 0;
        if (pp.getAttributeNS(NS.fo, 'break-before') === 'page') p.sautAvant = true;
        if (pp.getAttributeNS(NS.fo, 'break-after') === 'page') p.sautApres = true;
      }
      if (profondeur === 0) { p.sautAvant = p.sautAvant && pp?.getAttributeNS(NS.fo, 'break-before') === 'page'; p.sautApres = p.sautApres && pp?.getAttributeNS(NS.fo, 'break-after') === 'page'; }
      return p;
    }
    function roleDuStyle(nom, profondeur = 0) {
      const s = styles[nom];
      if (!s || profondeur > 12) return 'normal';
      const a = s.affiche.toLowerCase().replace(/_20_/g, ' ');
      const m = a.match(/^(?:heading|titre)\s*(\d)$/);
      if (m) return `h${Math.min(6, Number(m[1]))}`;
      if (a === 'title' || a === 'titre') return 'h1';
      if (a === 'subtitle' || a === 'sous-titre') return 'h2';
      if (/quotation|citation/.test(a)) return 'citation';
      if (/preformatted|texte préformaté|source text/.test(a)) return 'code';
      return roleDuStyle(s.parent, profondeur + 1);
    }
    const normal = { ...texteDuStyle('__defaut_paragraph'), ...texteDuStyle('Standard') };
    const listeDuStyle = (nom, profondeur = 0) => {
      const s = styles[nom];
      if (!s || profondeur > 12) return null;
      return s.listeStyle || listeDuStyle(s.parent, profondeur + 1);
    };

    // Images : chaque fichier de Pictures/ en adresse data:.
    const images = {};
    async function image(href) {
      if (!href) return null;
      if (/^https?:/i.test(href)) return href;
      const chemin = href.replace(/^\.\//, '');
      if (images[chemin]) return images[chemin];
      const f = zip.file(chemin);
      if (!f) return null;
      const b = await f.async('uint8array');
      const mime = Medias.mimeDe(b);
      if (!mime) { alertes.add('Certaines images (EMF, WMF, TIFF) ne s\'affichent pas : Chromium ne sait pas les lire.'); return null; }
      return (images[chemin] = Medias.dataUrl(b, mime));
    }

    const corps = content.getElementsByTagNameNS(NS.office, 'text')[0];
    if (!corps) throw new Error('Ce document OpenDocument n\'est pas un texte (c\'est peut-être un classeur ou une présentation).');
    if (content.getElementsByTagNameNS(NS.text, 'note').length) alertes.add('Les notes de bas de page ne sont pas affichées.');
    if (content.getElementsByTagNameNS(NS.office, 'annotation').length) alertes.add('Les commentaires ne sont pas affichés.');
    if (content.getElementsByTagNameNS(NS.text, 'tracked-changes').length) alertes.add('Le suivi des modifications est simplifié : les modifications sont acceptées.');
    let idListe = 0;
    const html = await blocsDe(corps, null);

    // listeCtx : { type, niveau, id, style } quand on est dans une liste.
    async function blocsDe(conteneur, listeCtx) {
      const items = [];
      for (const n of enfants(conteneur)) {
        const nom = n.localName, ns = n.namespaceURI;
        if (ns === NS.text && (nom === 'p' || nom === 'h')) items.push(...(await paragraphe(n, listeCtx)));
        else if (ns === NS.text && nom === 'list') {
          const styleListe = n.getAttributeNS(NS.text, 'style-name') || listeCtx?.style;
          const niveau = listeCtx ? listeCtx.niveau + 1 : 0;
          const suite = n.getAttributeNS(NS.text, 'continue-numbering') === 'true' || n.getAttributeNS(NS.text, 'continue-list');
          const id = listeCtx ? listeCtx.id : suite ? idListe : ++idListe;
          for (const li of enfants(n)) {
            if (li.localName !== 'list-item' && li.localName !== 'list-header') continue;
            let premier = true;
            for (const c of enfants(li)) {
              const ctxLi = { type: (listes[styleListe] || {})[niveau] || (listes[styleListe] || {})[0] || 'ul', niveau, id, style: styleListe, debut: 1, suite: !premier };
              const sous = await blocsDe({ children: [c] }, li.localName === 'list-header' ? null : ctxLi);
              items.push(...sous.items);
              if (c.localName === 'p' || c.localName === 'h') premier = false;
            }
          }
        } else if (ns === NS.table && nom === 'table') items.push({ html: await tableau(n), liste: null });
        else if (ns === NS.text && (nom === 'section' || nom === 'index-body' || nom === 'table-of-content' || nom === 'alphabetical-index')) {
          const b = enfant(n, 'index-body') || n;
          items.push(...(await blocsDe(b, listeCtx)).items);
        } else if (ns === NS.text && nom === 'soft-page-break') { /* repère de LibreOffice, rien à faire */ }
      }
      // Appel de premier niveau : le HTML ; appel pour une liste : les éléments, assemblés plus haut.
      const res = assemblerListes(items);
      return Object.assign(new String(res), { items });
    }

    async function paragraphe(p, listeCtx) {
      const nomStyle = p.getAttributeNS(NS.text, 'style-name');
      let role = p.localName === 'h' ? `h${Math.min(6, Number(p.getAttributeNS(NS.text, 'outline-level')) || 1)}` : roleDuStyle(nomStyle);
      if (p.localName === 'h' && /^titre$|^title$/i.test(styles[nomStyle]?.affiche || '')) role = 'h1';
      const props = paraDuStyle(nomStyle);
      const base = texteDuStyle(nomStyle);
      if (/^h/.test(role)) { delete base.taille; delete base.gras; delete base.couleur; delete base.police; }
      for (const k of ['police', 'taille']) if (base[k] && base[k] === normal[k]) delete base[k];
      let liste = listeCtx && !listeCtx.suite ? { type: listeCtx.type, niveau: listeCtx.niveau, id: listeCtx.id, debut: 1 } : null;
      // Un paragraphe à puce sans <text:list> (style de paragraphe avec un style de liste) : rare, on le traite comme une liste.
      if (!listeCtx && listeDuStyle(nomStyle) && listes[listeDuStyle(nomStyle)] && p.localName !== 'h') liste = null;
      const morceaux = [''];
      await enLigne(p, base, null, morceaux);
      const tag = role === 'citation' ? 'blockquote' : role === 'code' ? 'pre' : role === 'normal' ? 'p' : role;
      const attrs = stylePara({ align: props.align, retrait: listeCtx || tag === 'blockquote' || tag === 'pre' ? 0 : props.retrait, premiere: props.premiere });
      const out = [];
      if (props.sautAvant) out.push({ html: '<hr class="saut-page">', liste: null });
      morceaux.forEach((m, i) => {
        const contenu = tag === 'blockquote' ? `<p>${m || '<br>'}</p>` : m || '<br>';
        out.push({ html: `<${tag}${attrs}>${contenu}</${tag}>`, liste: i === 0 ? liste : null });
      });
      if (listeCtx?.suite) out.forEach((o) => { o.liste = null; o.html = o.html.replace(/^<(\w+)/, `<$1 style="margin-left: ${24 * (listeCtx.niveau + 1)}px"`).replace(/ style="([^"]*)" style="/, ' style="$1; '); });
      if (props.sautApres) out.push({ html: '<hr class="saut-page">', liste: null });
      return out;
    }

    async function enLigne(n, f, lien, morceaux) {
      const ajouter = (h) => { morceaux[morceaux.length - 1] += h; };
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { ajouter(htmlRun(c.nodeValue, f, lien)); continue; }
        if (c.nodeType !== 1) continue;
        const nom = c.localName;
        if (c.namespaceURI === NS.text) {
          switch (nom) {
            case 'span': await enLigne(c, { ...f, ...texteDuStyle(c.getAttributeNS(NS.text, 'style-name')) }, lien, morceaux); break;
            case 'a': {
              const href = c.getAttributeNS(NS.xlink, 'href');
              const typeMedia = Medias.typeDuLien(href);
              if (typeMedia && ctx.racine && !/^https?:/i.test(href)) {
                let src = href;
                try { src = new URL(href.replace(/\\/g, '/').replace(/^\.\.\//, ''), ctx.racine).href; } catch { /* adresse illisible */ }
                ajouter(htmlMedia(typeMedia, src, null, decodeURIComponent(href.split('/').pop())));
              } else await enLigne(c, f, href, morceaux);
              break;
            }
            case 's': ajouter(' '.repeat(Number(c.getAttributeNS(NS.text, 'c')) || 1).replace(/ /g, ' ')); break;
            case 'tab': ajouter('<span class="tab">\t</span>'); break;
            case 'line-break': ajouter('<br>'); break;
            case 'soft-page-break': break;
            case 'note': case 'bookmark': case 'bookmark-start': case 'bookmark-end': case 'reference-mark': case 'change': case 'change-start': case 'change-end': break;
            case 'tracked-changes': break;
            default: await enLigne(c, f, lien, morceaux); // champs (date, numéro de page…) : leur texte
          }
        } else if (c.namespaceURI === NS.draw && nom === 'frame') {
          const img = enfant(c, 'image');
          const largeur = Unites.lire(c.getAttributeNS(NS.svg, 'width'));
          if (img) {
            const src = await image(img.getAttributeNS(NS.xlink, 'href'));
            if (src) { const h = htmlMedia('image', src, largeur); ajouter(lien ? `<a href="${escapeHtml(lien)}">${h}</a>` : h); }
          }
          const tb = enfant(c, 'text-box');
          if (tb) {
            alertes.add('Les zones de texte sont simplifiées : leur texte suit le paragraphe.');
            for (const p of tb.getElementsByTagNameNS(NS.text, 'p')) { ajouter(' '); await enLigne(p, f, lien, morceaux); }
          }
        } else if (c.namespaceURI === NS.draw && nom === 'a') {
          await enLigne(c, f, c.getAttributeNS(NS.xlink, 'href'), morceaux);
        } else if (c.namespaceURI === NS.office && nom === 'annotation') { /* commentaire */ }
      }
    }

    async function tableau(t) {
      let h = '<table>';
      const lignes = [];
      const ramasser = (n, entete) => {
        for (const c of enfants(n)) {
          if (c.localName === 'table-row') lignes.push({ tr: c, entete });
          else if (c.localName === 'table-header-rows') ramasser(c, true);
          else if (c.localName === 'table-rows' || c.localName === 'table-row-group') ramasser(c, entete);
        }
      };
      ramasser(t, false);
      for (const { tr, entete } of lignes) {
        h += '<tr>';
        for (const cell of enfants(tr)) {
          if (cell.localName !== 'table-cell') continue;
          const cs = Number(cell.getAttributeNS(NS.table, 'number-columns-spanned')) || 1;
          const rs = Number(cell.getAttributeNS(NS.table, 'number-rows-spanned')) || 1;
          const st = styles[cell.getAttributeNS(NS.table, 'style-name')];
          const fond = couleurHex(st?.cellule?.getAttributeNS(NS.fo, 'background-color'));
          const tag = entete ? 'th' : 'td';
          h += `<${tag}${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}${fond ? ` style="background-color: #${fond}"` : ''}>${await blocsDe(cell, null)}</${tag}>`;
        }
        h += '</tr>';
      }
      return `${h}</table>`;
    }

    // Mise en page : la page maîtresse « Standard » (ou la première) et son page-layout.
    const miseEnPage = structuredClone(Formats.MISE_EN_PAGE);
    if (stylesDoc) {
      const maitre = [...stylesDoc.getElementsByTagNameNS(NS.style, 'master-page')];
      const m = maitre.find((x) => x.getAttributeNS(NS.style, 'name') === 'Standard') || maitre[0];
      const nomLayout = m?.getAttributeNS(NS.style, 'page-layout-name');
      const layout = [...stylesDoc.getElementsByTagNameNS(NS.style, 'page-layout')].find((x) => x.getAttributeNS(NS.style, 'name') === nomLayout);
      const lp = enfant(layout, 'page-layout-properties');
      if (lp) {
        const cm = (k) => { const v = Unites.lire(lp.getAttributeNS(NS.fo, k)); return v == null ? null : Math.round(Unites.pxEnCm(v) * 100) / 100; };
        if (cm('page-width') && cm('page-height')) Object.assign(miseEnPage, Formats.papierDe(cm('page-width'), cm('page-height')));
        miseEnPage.marges = { haut: cm('margin-top') ?? 2, bas: cm('margin-bottom') ?? 2, gauche: cm('margin-left') ?? 2, droite: cm('margin-right') ?? 2 };
        if (Number(lp.getElementsByTagNameNS(NS.style, 'columns')[0]?.getAttributeNS(NS.fo, 'column-count')) > 1) alertes.add('La mise en colonnes est remplacée par une seule colonne.');
      }
      if (m && (enfant(m, 'header') || enfant(m, 'footer'))) alertes.add('Les en-têtes et pieds de page ne sont pas affichés (ils restent dans le fichier d\'origine).');
    }
    return { html: String(html), miseEnPage, police: normal.police || null, taille: normal.taille || null, alertes: [...alertes] };
  }

  // ======================================================================
  // Enregistrer
  // ======================================================================
  async function ecrire(ctx) {
    const blocs = Formats.blocs(ctx.page);
    const alertes = new Set();
    const auto = []; // styles automatiques (XML)
    const stylesTexte = new Map(); // clé → nom (T1…)
    const stylesPara = new Map(); // clé → nom (P1…)
    const stylesCellule = new Map();
    const images = []; // { nom, bytes, mime }
    const largeurMax = Formats.largeurUtile(ctx.miseEnPage);
    const cm = (px) => `${(Unites.pxEnCm(px)).toFixed(3)}cm`;

    function styleTexte(f, lien) {
      const props = [];
      if (f.gras) props.push('fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"');
      if (f.italique) props.push('fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"');
      if (f.souligne && !lien) props.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
      if (f.barre) props.push('style:text-line-through-style="solid" style:text-line-through-type="single"');
      if (f.couleur) props.push(`fo:color="#${f.couleur}"`);
      if (f.fond) props.push(`fo:background-color="#${f.fond}"`);
      if (f.taille) props.push(`fo:font-size="${f.taille}pt" style:font-size-asian="${f.taille}pt" style:font-size-complex="${f.taille}pt"`);
      if (f.police) props.push(`style:font-name="${xml(f.police)}" fo:font-family="${xml(/\s/.test(f.police) ? `'${f.police}'` : f.police)}"`);
      if (f.indice) props.push('style:text-position="sub 58%"');
      if (f.exposant) props.push('style:text-position="super 58%"');
      if (!props.length) return null;
      const cle = props.join(' ');
      if (!stylesTexte.has(cle)) {
        const nom = `T${stylesTexte.size + 1}`;
        stylesTexte.set(cle, nom);
        auto.push(`<style:style style:name="${nom}" style:family="text"><style:text-properties ${cle}/></style:style>`);
      }
      return stylesTexte.get(cle);
    }

    const STYLE_NOM = { normal: 'Standard', h1: 'Heading_20_1', h2: 'Heading_20_2', h3: 'Heading_20_3', h4: 'Heading_20_4', h5: 'Heading_20_5', h6: 'Heading_20_6', citation: 'Quotations', code: 'Preformatted_20_Text' };
    function stylePar(b, { sautAvant } = {}) {
      const parent = STYLE_NOM[b.style] || 'Standard';
      const props = [];
      if (b.align && b.align !== 'left') props.push(`fo:text-align="${{ center: 'center', right: 'end', justify: 'justify' }[b.align]}"`);
      if (b.retrait && !b.liste) props.push(`fo:margin-left="${cm(b.retrait)}"`);
      if (sautAvant) props.push('fo:break-before="page"');
      if (!props.length) return parent;
      const cle = `${parent}|${props.join(' ')}`;
      if (!stylesPara.has(cle)) {
        const nom = `P${stylesPara.size + 1}`;
        stylesPara.set(cle, nom);
        auto.push(`<style:style style:name="${nom}" style:family="paragraph" style:parent-style-name="${parent}"><style:paragraph-properties ${props.join(' ')}/></style:style>`);
      }
      return stylesPara.get(cle);
    }

    async function runsXml(runs) {
      let x = '';
      let lienOuvert = null;
      const fermer = () => { if (lienOuvert !== null) { x += '</text:a>'; lienOuvert = null; } };
      for (const r of runs) {
        if (r.t !== 'br' && r.t !== 'tab' && (r.lien || null) !== lienOuvert) {
          fermer();
          if (r.lien) { x += `<text:a xlink:type="simple" xlink:href="${xml(r.lien)}">`; lienOuvert = r.lien; }
        }
        if (r.t === 'br') x += '<text:line-break/>';
        else if (r.t === 'tab') x += '<text:tab/>';
        else if (r.t === 'texte') {
          const s = styleTexte(r.f, Boolean(r.lien));
          // Une espace au tout début du paragraphe disparaîtrait : on l'écrit <text:s/>.
          let t = espaces(r.texte);
          if (!x && t.startsWith(' ')) t = `<text:s/>${t.slice(1)}`;
          x += s ? `<text:span text:style-name="${s}">${t}</text:span>` : t;
        } else if (r.t === 'media') x += await mediaXml(r);
      }
      fermer();
      return x;
    }
    // En ODF, plusieurs espaces de suite se réduisent à une : on les écrit <text:s text:c="n"/>.
    function espaces(t) {
      return xml(t).replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`).replace(/\t/g, '<text:tab/>');
    }

    let nImage = 1;
    async function mediaXml(r) {
      if (r.type === 'image') {
        let img;
        try {
          img = await Medias.imagePourBureautique(r.src, { formats: ['png', 'jpeg', 'gif'] });
        } catch (err) {
          alertes.add(`Une image n'a pas pu être lue (${r.nom}) : ${err.message}`);
          return '';
        }
        const nom = `Pictures/image${images.length + 1}.${img.ext}`;
        images.push({ nom, bytes: img.bytes, mime: img.mime });
        let w = r.largeur || img.largeur;
        if (w > largeurMax) w = largeurMax;
        const h = w * (img.hauteur / img.largeur);
        const n = nImage++;
        return `<draw:frame draw:style-name="fr1" draw:name="Image${n}" text:anchor-type="as-char" svg:width="${cm(w)}" svg:height="${cm(h)}" draw:z-index="${n}"><draw:image xlink:href="${nom}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="${img.mime}"/></draw:frame>`;
      }
      let cible;
      try {
        cible = await Formats.cheminMedia(ctx, r);
      } catch (err) {
        alertes.add(`${r.nom} n'a pas pu être rangé à côté du document : ${err.message}`);
        return '';
      }
      alertes.add(`LibreOffice ne lit pas les vidéos et les sons dans le texte : ils sont rangés dans le dossier « ${ctx.dossierMedias} » et le document montre un lien vers eux. Edda les remet dans la page à la réouverture.`);
      // Les liens d'un .odt partent du fichier lui-même (« ../ » remonte dans le dossier du document).
      const href = /^https?:/i.test(cible) ? cible : `../${encodeURI(cible)}`;
      return `<text:a xlink:type="simple" xlink:href="${xml(href)}">${xml(`${r.type === 'video' ? '▶ Vidéo' : '♪ Son'} : ${r.nom}`)}</text:a>`;
    }

    let sautEnAttente = false;
    async function blocXml(b) {
      if (b.type === 'saut') { sautEnAttente = true; return ''; }
      if (b.type === 'ligne') return `<text:p text:style-name="${consommerSaut() ? 'LigneSaut' : 'Ligne'}"/>`;
      if (b.type === 'table') return (sautEnAttente ? `<text:p text:style-name="${stylePar({ style: 'normal' }, { sautAvant: consommerSaut() })}"/>` : '') + await tableXml(b);
      const style = stylePar(b, { sautAvant: consommerSaut() });
      const contenu = await runsXml(b.runs);
      if (/^h\d$/.test(b.style)) return `<text:h text:style-name="${style}" text:outline-level="${b.style[1]}">${contenu}</text:h>`;
      return `<text:p text:style-name="${style}">${contenu}</text:p>`;
    }
    const consommerSaut = () => { const s = sautEnAttente; sautEnAttente = false; return s; };

    // Les listes : une suite de blocs qui ont la même liste devient un <text:list> (imbriqué selon le niveau).
    async function sequenceXml(liste) {
      let x = '';
      let i = 0;
      while (i < liste.length) {
        const b = liste[i];
        if (b.type !== 'p' || !b.liste) { x += await blocXml(b); i++; continue; }
        const id = b.liste.id;
        const groupe = [];
        while (i < liste.length && liste[i].type === 'p' && liste[i].liste && (liste[i].liste.id === id || liste[i].liste.niveau > 0)) groupe.push(liste[i++]);
        x += await listeXml(groupe, 0);
      }
      return x;
    }
    async function listeXml(groupe, niveau) {
      const type = groupe.find((b) => b.liste.niveau === niveau)?.liste.type || groupe[0].liste.type;
      let x = `<text:list text:style-name="${type === 'ol' ? 'L2' : 'L1'}">`;
      let i = 0;
      let item = null;
      while (i < groupe.length) {
        const b = groupe[i];
        if (b.liste.niveau > niveau) {
          const sous = [];
          while (i < groupe.length && groupe[i].liste.niveau > niveau) sous.push(groupe[i++]);
          if (item === null) { x += '<text:list-item>'; item = true; }
          x += await listeXml(sous, niveau + 1);
          continue;
        }
        if (!b.liste.suite) { if (item) x += '</text:list-item>'; x += '<text:list-item>'; item = true; }
        x += await blocXml({ ...b, liste: null, retrait: 0 });
        i++;
      }
      if (item) x += '</text:list-item>';
      return `${x}</text:list>`;
    }

    async function tableXml(t) {
      const { cases, colonnes } = Formats.grille(t);
      const n = auto.filter((s) => s.includes('style:family="table"')).length + 1;
      auto.push(`<style:style style:name="Tableau${n}" style:family="table"><style:table-properties style:width="${cm(largeurMax)}" table:align="margins"/></style:style>`);
      let x = `<table:table table:name="Tableau${n}" table:style-name="Tableau${n}"><table:table-column table:number-columns-repeated="${colonnes}"/>`;
      const entetes = [];
      while (entetes.length < cases.length && cases[entetes.length].every((c) => !c || c.cellule.entete)) entetes.push(entetes.length);
      for (let r = 0; r < cases.length; r++) {
        if (r === 0 && entetes.length) x += '<table:table-header-rows>';
        x += '<table:table-row>';
        for (let c = 0; c < colonnes; c++) {
          const k = cases[r][c];
          if (!k) { x += `<table:table-cell table:style-name="${styleCellule(null)}" office:value-type="string"><text:p/></table:table-cell>`; continue; }
          if (!k.debut) { x += '<table:covered-table-cell/>'; continue; }
          const cel = k.cellule;
          let contenu = await sequenceXml(cel.blocs);
          if (!contenu) contenu = '<text:p/>';
          x += `<table:table-cell table:style-name="${styleCellule(cel.fond)}"${cel.colspan > 1 ? ` table:number-columns-spanned="${cel.colspan}"` : ''}${cel.rowspan > 1 ? ` table:number-rows-spanned="${cel.rowspan}"` : ''} office:value-type="string">${contenu}</table:table-cell>`;
        }
        x += '</table:table-row>';
        if (entetes.length && r === entetes.length - 1) x += '</table:table-header-rows>';
      }
      return `${x}</table:table>`;
    }
    function styleCellule(fond) {
      const cle = fond || '';
      if (!stylesCellule.has(cle)) {
        const nom = `Cellule${stylesCellule.size + 1}`;
        stylesCellule.set(cle, nom);
        auto.push(`<style:style style:name="${nom}" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #a0a0a0"${fond ? ` fo:background-color="#${fond}"` : ''}/></style:style>`);
      }
      return stylesCellule.get(cle);
    }

    let corps = await sequenceXml(blocs);
    if (sautEnAttente) corps += `<text:p text:style-name="${stylePar({ style: 'normal' }, { sautAvant: consommerSaut() })}"/>`;
    // Les traits horizontaux : un paragraphe vide avec une bordure en bas.
    const ligne = 'style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:border-bottom="0.5pt solid #a0a0a0" fo:padding-bottom="0.05cm"';
    auto.push(`<style:style style:name="Ligne" ${ligne}/></style:style>`, `<style:style style:name="LigneSaut" ${ligne} fo:break-before="page"/></style:style>`);
    auto.push('<style:style style:name="fr1" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline"/></style:style>');

    const polices = new Set([ctx.police || 'Calibri', 'Consolas']);
    for (const m of [...corps.matchAll(/style:font-name="([^"]+)"/g), ...auto.join('').matchAll(/style:font-name="([^"]+)"/g)]) polices.add(m[1]);
    const fontFaces = `<office:font-face-decls>${[...polices].map((p) => `<style:font-face style:name="${p}" svg:font-family="${/\s/.test(p) ? `'${p}'` : p}"/>`).join('')}</office:font-face-decls>`;

    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${DECL} office:version="1.3">${fontFaces}`
      + `<office:automatic-styles>${auto.join('')}${listesXml()}</office:automatic-styles>`
      + `<office:body><office:text>${corps || '<text:p/>'}</office:text></office:body></office:document-content>`;

    const zip = new JSZip();
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
    zip.file('content.xml', content);
    zip.file('styles.xml', stylesXml(ctx, fontFaces));
    zip.file('meta.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta ${DECL} office:version="1.3"><office:meta><meta:generator>Edda</meta:generator><dc:title>${xml(ctx.titre || '')}</dc:title><meta:initial-creator>Ragna</meta:initial-creator><dc:date>${new Date().toISOString()}</dc:date></office:meta></office:document-meta>`);
    for (const im of images) zip.file(im.nom, im.bytes);
    zip.file('META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
      + '<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>'
      + '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>'
      + '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>'
      + '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>'
      + images.map((im) => `<manifest:file-entry manifest:full-path="${im.nom}" manifest:media-type="${im.mime}"/>`).join('')
      + '</manifest:manifest>');
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.oasis.opendocument.text' });
    return { bytes, alertes: [...alertes] };
  }

  function listesXml() {
    const puces = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪', '•'];
    const niv = (i, contenu) => `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(0.635 * (i + 1)).toFixed(3)}cm" fo:text-indent="-0.635cm" fo:margin-left="${(0.635 * (i + 1)).toFixed(3)}cm"/></style:list-level-properties>${contenu}`;
    const l1 = puces.map((p, i) => `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="${p}">${niv(i, '')}</text:list-level-style-bullet>`).join('');
    const formats = ['1', 'a', 'i', '1', 'a', 'i', '1', 'a', 'i', '1'];
    const l2 = formats.map((f, i) => `<text:list-level-style-number text:level="${i + 1}" style:num-suffix="." style:num-format="${f}">${niv(i, '')}</text:list-level-style-number>`).join('');
    return `<text:list-style style:name="L1">${l1}</text:list-style><text:list-style style:name="L2">${l2}</text:list-style>`;
  }

  function stylesXml(ctx, fontFaces) {
    const mp = ctx.miseEnPage || Formats.MISE_EN_PAGE;
    const { largeur, hauteur } = Formats.dimensions(mp);
    const police = xml(ctx.police || 'Calibri');
    const taille = ctx.taille || 11;
    const titre = (n, sz) => `<style:style style:name="Heading_20_${n}" style:display-name="Heading ${n}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Standard" style:default-outline-level="${n}" style:class="text"><style:text-properties fo:font-size="${sz}pt" fo:font-weight="bold" fo:color="${n === 1 ? '#1f3864' : '#2f5496'}"/></style:style>`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${DECL} office:version="1.3">${fontFaces}<office:styles>`
      + `<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.28cm" fo:line-height="115%"/><style:text-properties style:font-name="${police}" fo:font-size="${taille}pt" fo:language="fr" fo:country="FR"/></style:default-style>`
      + '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>'
      + '<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/></style:style>'
      + titre(1, 20) + titre(2, 16) + titre(3, 14) + titre(4, 12) + titre(5, 11) + titre(6, 11)
      + '<style:style style:name="Quotations" style:display-name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm" fo:padding-left="0.2cm" fo:border-left="1.5pt solid #a0a0a0"/><style:text-properties fo:font-style="italic" fo:color="#595959"/></style:style>'
      + '<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:background-color="#f2f2f2"/><style:text-properties style:font-name="Consolas" fo:font-size="10pt"/></style:style>'
      + '<style:style style:name="Graphics" style:family="graphic"/>'
      + '</office:styles><office:automatic-styles>'
      + `<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="${largeur}cm" fo:page-height="${hauteur}cm" style:print-orientation="${mp.orientation === 'paysage' ? 'landscape' : 'portrait'}" fo:margin-top="${mp.marges.haut}cm" fo:margin-bottom="${mp.marges.bas}cm" fo:margin-left="${mp.marges.gauche}cm" fo:margin-right="${mp.marges.droite}cm"/></style:page-layout>`
      + '</office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>';
  }

  Formats.ajouter('odt', { nom: 'Document OpenDocument', extensions: ['odt', 'ott'], lire, ecrire, garde: 'tout' });
})();
