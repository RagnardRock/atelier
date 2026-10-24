// Documents Word (.docx).
//
// Un .docx est un fichier zip (lu et écrit avec JSZip) qui contient surtout :
// - word/document.xml : le texte, en paragraphes (<w:p>) faits de morceaux (<w:r>) ;
// - word/styles.xml : les styles (Normal, Titre 1…) ;
// - word/numbering.xml : les listes à puces et numérotées ;
// - word/media/ : les images ; word/_rels/document.xml.rels : qui pointe vers quoi (images, liens).
//
// Edda lit et écrit : titres, paragraphes, gras/italique/souligné/barré, couleurs, surlignage,
// polices et tailles, alignement, retraits, listes, tableaux (avec cellules fusionnées et fond),
// liens, images, sauts de page, format et marges de la page.
// Les vidéos et les sons n'existent pas dans Word : ils sont rangés à côté du document
// (« <document>-medias/ ») et Word montre un lien « ▶ » vers eux. Edda, à la réouverture, en refait
// des vidéos et des sons dans la page.
// Simplifié à l'ouverture (et signalé) : en-têtes et pieds de page, notes, commentaires, zones de
// texte, colonnes, suivi des modifications (les modifications sont acceptées).

(() => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const { xml, lireXml, enfants, enfant, attr, htmlRun, htmlMedia, stylePara, assemblerListes } = Formats;

  // ======================================================================
  // Ouvrir
  // ======================================================================
  async function lire(bytes, ctx) {
    const zip = await JSZip.loadAsync(bytes);
    const alertes = new Set();
    const texte = async (nom) => (zip.file(nom) ? zip.file(nom).async('string') : null);
    const docXml = await texte('word/document.xml');
    if (!docXml) throw new Error('Ce fichier n\'est pas un document Word (.docx) : word/document.xml est absent.');
    const doc = lireXml(docXml);

    // Relations : rId → cible (image, lien)
    const rels = {};
    const relsXml = await texte('word/_rels/document.xml.rels');
    if (relsXml) for (const r of lireXml(relsXml).getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = { cible: r.getAttribute('Target'), externe: r.getAttribute('TargetMode') === 'External', type: r.getAttribute('Type') };

    // Styles : id → { nom, parent, p (propriétés de paragraphe), r (de texte) }
    const styles = {};
    let defautRun = {};
    const stylesXml = await texte('word/styles.xml');
    if (stylesXml) {
      const sx = lireXml(stylesXml);
      const dd = sx.getElementsByTagNameNS(W, 'rPrDefault')[0];
      if (dd) defautRun = proprietesRun(enfant(dd, 'rPr'), {});
      for (const s of sx.getElementsByTagNameNS(W, 'style')) {
        styles[attr(s, 'w:styleId')] = {
          type: attr(s, 'w:type'),
          nom: attr(enfant(s, 'name'), 'w:val') || '',
          parent: attr(enfant(s, 'basedOn'), 'w:val'),
          pPr: enfant(s, 'pPr'),
          rPr: enfant(s, 'rPr'),
        };
      }
    }
    // Les propriétés d'un style, avec celles des styles dont il hérite.
    const cacheRun = {};
    function runDuStyle(id, profondeur = 0) {
      if (!id || !styles[id] || profondeur > 10) return {};
      if (cacheRun[id]) return cacheRun[id];
      const s = styles[id];
      return (cacheRun[id] = proprietesRun(s.rPr, runDuStyle(s.parent, profondeur + 1)));
    }
    function paraDuStyle(id, profondeur = 0) {
      if (!id || !styles[id] || profondeur > 10) return {};
      const s = styles[id];
      return proprietesPara(s.pPr, paraDuStyle(s.parent, profondeur + 1));
    }
    // Le rôle d'un style de paragraphe pour Edda : titre, citation, code…
    function roleDuStyle(id, profondeur = 0) {
      if (!id || !styles[id] || profondeur > 10) return 'normal';
      const nom = styles[id].nom.toLowerCase();
      const m = nom.match(/^(?:heading|titre)\s*(\d)$/) || String(id).match(/^(?:Heading|Titre)(\d)$/);
      if (m) return `h${Math.min(6, Number(m[1]))}`;
      if (nom === 'title' || nom === 'titre') return 'h1';
      if (nom === 'subtitle' || nom === 'sous-titre') return 'h2';
      if (/quote|citation|block text/.test(nom)) return 'citation';
      if (/code|html preformatted|preformatted|plain text/.test(nom)) return 'code';
      return roleDuStyle(styles[id].parent, profondeur + 1);
    }
    // Normal : la police et la taille du document.
    const normal = { ...defautRun, ...runDuStyle(Object.keys(styles).find((k) => styles[k].type === 'paragraph' && /^normal$/i.test(styles[k].nom)) || 'Normal') };

    // Listes : numId → niveau → 'ul' | 'ol'
    const numeros = {};
    const numXml = await texte('word/numbering.xml');
    if (numXml) {
      const nx = lireXml(numXml);
      const abstraits = {};
      for (const a of nx.getElementsByTagNameNS(W, 'abstractNum')) {
        const niveaux = {};
        for (const l of enfants(a, 'lvl')) niveaux[attr(l, 'w:ilvl')] = { type: attr(enfant(l, 'numFmt'), 'w:val') === 'bullet' ? 'ul' : 'ol', debut: Number(attr(enfant(l, 'start'), 'w:val')) || 1 };
        abstraits[attr(a, 'w:abstractNumId')] = niveaux;
      }
      for (const n of nx.getElementsByTagNameNS(W, 'num')) {
        const niveaux = { ...(abstraits[attr(enfant(n, 'abstractNumId'), 'w:val')] || {}) };
        for (const o of enfants(n, 'lvlOverride')) {
          const so = attr(enfant(o, 'startOverride'), 'w:val');
          const l = attr(o, 'w:ilvl');
          if (so && niveaux[l]) niveaux[l] = { ...niveaux[l], debut: Number(so) };
        }
        numeros[attr(n, 'w:numId')] = niveaux;
      }
    }

    // Images : on garde chaque fichier de word/media en adresse data: (la page reste autonome).
    const images = {};
    async function image(rid) {
      const rel = rels[rid];
      if (!rel) return null;
      if (rel.externe) return /^https?:/i.test(rel.cible) ? rel.cible : null;
      const chemin = rel.cible.startsWith('/') ? rel.cible.slice(1) : `word/${rel.cible}`.replace(/\/\.\//g, '/');
      if (images[chemin]) return images[chemin];
      const f = zip.file(chemin) || zip.file(chemin.replace(/^word\/\.\.\//, ''));
      if (!f) return null;
      const b = await f.async('uint8array');
      let mime = Medias.mimeDe(b) || ({ emf: 'image/emf', wmf: 'image/wmf', tif: 'image/tiff', tiff: 'image/tiff' }[extension(chemin)] || 'image/png');
      if (/emf|wmf|tiff/.test(mime)) { alertes.add('Certaines images (EMF, WMF, TIFF) ne s\'affichent pas : Chromium ne sait pas les lire.'); return null; }
      return (images[chemin] = Medias.dataUrl(b, mime));
    }

    // --- Le corps ---
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const sect = body ? enfant(body, 'sectPr') : null;
    const miseEnPage = lireSection(sect || [...doc.getElementsByTagNameNS(W, 'sectPr')].pop());
    if (sect && Number(attr(enfant(sect, 'cols'), 'w:num')) > 1) alertes.add('La mise en colonnes est remplacée par une seule colonne.');
    if (sect && (enfant(sect, 'headerReference') || enfant(sect, 'footerReference'))) alertes.add('Les en-têtes et pieds de page ne sont pas affichés (ils restent dans le fichier d\'origine).');
    if (zip.file('word/footnotes.xml') && /<w:footnote [^>]*w:id="[1-9]/.test(await texte('word/footnotes.xml'))) alertes.add('Les notes de bas de page ne sont pas affichées.');
    if (/<w:comment\b/.test(await texte('word/comments.xml') || '')) alertes.add('Les commentaires ne sont pas affichés.');

    const html = await blocsDe(body);

    async function blocsDe(conteneur) {
      const items = [];
      for (const n of enfants(conteneur)) {
        if (n.localName === 'p') items.push(...(await paragraphe(n)));
        else if (n.localName === 'tbl') items.push({ html: await tableau(n), liste: null });
        else if (n.localName === 'sdt') {
          const c = enfant(n, 'sdtContent');
          if (c) items.push({ html: await blocsDe(c), liste: null });
        } else if (n.localName === 'customXml' || n.localName === 'ins') items.push({ html: await blocsDe(n), liste: null });
      }
      return assemblerListes(items);
    }

    // Un <w:p> → un ou plusieurs blocs (un saut de page au milieu coupe le paragraphe en deux).
    async function paragraphe(p) {
      const pPr = enfant(p, 'pPr');
      const styleId = attr(enfant(pPr, 'pStyle'), 'w:val');
      const role = roleDuStyle(styleId);
      const props = proprietesPara(pPr, paraDuStyle(styleId));
      const baseRun = { ...runDuStyle(styleId) };
      // Un titre a déjà sa taille et son gras dans Edda : on n'écrit que ce qui diffère.
      if (/^h/.test(role)) { delete baseRun.taille; delete baseRun.gras; delete baseRun.couleur; delete baseRun.police; }
      let liste = null;
      const numPr = enfant(pPr, 'numPr') || props.numPr;
      if (numPr) {
        const numId = attr(enfant(numPr, 'numId'), 'w:val');
        const niveau = Number(attr(enfant(numPr, 'ilvl'), 'w:val')) || 0;
        if (numId && numId !== '0' && numeros[numId]) liste = { type: numeros[numId][niveau]?.type || 'ul', niveau, id: numId, debut: numeros[numId][niveau]?.debut || 1 };
      }
      const morceaux = [''];
      const etat = { lienChamp: null, dansInstr: false, instr: '' };
      await contenuEnLigne(p, baseRun, null, morceaux, etat);
      const tag = role === 'citation' ? 'blockquote' : role === 'code' ? 'pre' : role === 'normal' ? 'p' : role;
      const retrait = liste ? Math.max(0, (props.retrait || 0) - 24 * (liste.niveau + 1)) : props.retrait;
      const attrs = stylePara({ align: props.align, retrait: liste || tag === 'blockquote' || tag === 'pre' ? 0 : retrait, premiere: props.premiere });
      const out = [];
      morceaux.forEach((m, i) => {
        if (m === '\f') { out.push({ html: '<hr class="saut-page">', liste: null }); return; }
        // Un paragraphe qui ne contient qu'un saut de page : pas de paragraphe vide autour.
        if (!m && (morceaux[i - 1] === '\f' || morceaux[i + 1] === '\f')) return;
        const contenu = tag === 'blockquote' ? `<p>${m || '<br>'}</p>` : m || '<br>';
        out.push({ html: `<${tag}${attrs}>${contenu}</${tag}>`, liste: i === 0 || morceaux[i - 1] !== '\f' ? liste : null });
      });
      if (props.sautAvant) out.unshift({ html: '<hr class="saut-page">', liste: null });
      return out;
    }

    // Les morceaux de texte d'un paragraphe (récursif : liens, champs, révisions…).
    // morceaux : le HTML du paragraphe ; '\f' marque un saut de page.
    async function contenuEnLigne(n, baseRun, lien, morceaux, etat) {
      for (const c of enfants(n)) {
        switch (c.localName) {
          case 'r': await run(c, baseRun, lien || etat.lienChamp, morceaux, etat); break;
          case 'hyperlink': {
            const rid = attr(c, 'r:id');
            const ancre = attr(c, 'w:anchor');
            const cible = rid && rels[rid] ? rels[rid].cible : ancre ? `#${ancre}` : null;
            // Un lien vers une vidéo ou un son rangé à côté du document (écrit par Edda) : on remet le média.
            const typeMedia = Medias.typeDuLien(cible);
            if (typeMedia && ctx.racine && !/^https?:/i.test(cible)) {
              let src = cible;
              try { src = new URL(cible.replace(/\\/g, '/'), ctx.racine).href; } catch { /* adresse illisible */ }
              morceaux[morceaux.length - 1] += htmlMedia(typeMedia, src, null, decodeURIComponent(cible.split('/').pop()));
              break;
            }
            await contenuEnLigne(c, baseRun, cible, morceaux, etat);
            break;
          }
          case 'fldSimple': {
            const m = (attr(c, 'w:instr') || '').match(/HYPERLINK\s+"([^"]+)"/);
            await contenuEnLigne(c, baseRun, m ? m[1] : lien, morceaux, etat);
            break;
          }
          case 'ins': case 'smartTag': case 'customXml': case 'sdtContent': case 'moveTo':
            await contenuEnLigne(c, baseRun, lien, morceaux, etat);
            break;
          case 'sdt': await contenuEnLigne(enfant(c, 'sdtContent') || c, baseRun, lien, morceaux, etat); break;
          case 'del': case 'moveFrom': alertes.add('Le suivi des modifications est simplifié : les modifications sont acceptées.'); break;
          default: break;
        }
      }
    }

    async function run(r, baseRun, lien, morceaux, etat) {
      const rPr = enfant(r, 'rPr');
      const f = proprietesRun(rPr, { ...baseRun, ...runDuStyle(attr(enfant(rPr, 'rStyle'), 'w:val')) });
      // Le style « Hyperlink » met le texte en bleu souligné : un lien d'Edda l'est déjà.
      if (lien && /hyperlink|lienhypertexte/i.test(attr(enfant(rPr, 'rStyle'), 'w:val') || '')) { delete f.couleur; delete f.souligne; }
      // Ce que Normal donne déjà à tout le document n'a pas besoin d'être répété sur chaque mot.
      if (f.police && f.police === normal.police) delete f.police;
      if (f.taille && f.taille === normal.taille) delete f.taille;
      const ajouter = (h) => { morceaux[morceaux.length - 1] += h; };
      for (const c of enfants(r)) {
        switch (c.localName) {
          case 'fldChar': {
            const t = attr(c, 'w:fldCharType');
            if (t === 'begin') { etat.dansInstr = true; etat.instr = ''; } else if (t === 'separate') {
              etat.dansInstr = false;
              const m = etat.instr.match(/HYPERLINK\s+"([^"]+)"/);
              etat.lienChamp = m ? m[1] : null;
            } else if (t === 'end') { etat.dansInstr = false; etat.lienChamp = null; }
            break;
          }
          case 'instrText': if (etat.dansInstr) etat.instr += c.textContent; break;
          case 't': if (!etat.dansInstr) ajouter(htmlRun(c.textContent, f, lien)); break;
          case 'tab': ajouter('<span class="tab">\t</span>'); break;
          case 'noBreakHyphen': ajouter('‑'); break;
          case 'softHyphen': ajouter('­'); break;
          case 'sym': {
            const code = parseInt(attr(c, 'w:char') || '', 16);
            if (code) ajouter(escapeHtml(String.fromCharCode(code >= 0xf000 ? code - 0xf000 : code)));
            break;
          }
          case 'br': case 'cr':
            if (attr(c, 'w:type') === 'page') morceaux.push('\f', '');
            else ajouter('<br>');
            break;
          case 'lastRenderedPageBreak': break;
          case 'drawing': await dessin(c, ajouter, lien); break;
          case 'pict': case 'object': {
            const im = c.getElementsByTagName('v:imagedata')[0] || [...c.getElementsByTagName('*')].find((x) => x.localName === 'imagedata');
            const rid = im && (attr(im, 'r:id') || attr(im, 'r:pict'));
            const src = rid && await image(rid);
            if (src) ajouter(htmlMedia('image', src, null));
            break;
          }
          case 'footnoteReference': case 'endnoteReference': ajouter('<sup>*</sup>'); break;
          default: break;
        }
      }
    }

    // Une image (<w:drawing>) : en ligne (wp:inline) ou flottante (wp:anchor, posée en ligne dans Edda).
    async function dessin(d, ajouter, lien) {
      const tous = [...d.getElementsByTagName('*')];
      if (tous.some((x) => x.localName === 'txbxContent')) alertes.add('Les zones de texte sont simplifiées : leur texte suit le paragraphe.');
      const blip = tous.find((x) => x.localName === 'blip');
      const extent = tous.find((x) => x.localName === 'extent');
      const largeur = extent ? Unites.emuEnPx(Number(attr(extent, 'cx'))) : null;
      if (tous.some((x) => x.localName === 'anchor' && x.parentNode === d)) alertes.add('Les images flottantes sont posées dans le texte.');
      const rid = blip && (attr(blip, 'r:embed') || attr(blip, 'r:link'));
      const src = rid && await image(rid);
      if (src) {
        const h = htmlMedia('image', src, largeur);
        ajouter(lien ? `<a href="${escapeHtml(lien)}">${h}</a>` : h);
      }
      for (const tx of tous.filter((x) => x.localName === 'txbxContent')) {
        for (const p of enfants(tx, 'p')) {
          const m = [''];
          await contenuEnLigne(p, {}, null, m, { lienChamp: null, dansInstr: false, instr: '' });
          ajouter(` ${m.filter((x) => x !== '\f').join(' ')}`);
        }
      }
    }

    async function tableau(t) {
      // Cellules fusionnées verticalement (vMerge) : on compte combien de lignes chaque fusion couvre.
      const lignes = enfants(t, 'tr').map((tr) => {
        let col = 0;
        return enfants(tr).filter((c) => c.localName === 'tc' || c.localName === 'sdt').map((tc) => {
          const cell = tc.localName === 'sdt' ? enfant(enfant(tc, 'sdtContent'), 'tc') || tc : tc;
          const tcPr = enfant(cell, 'tcPr');
          const span = Number(attr(enfant(tcPr, 'gridSpan'), 'w:val')) || 1;
          const vm = enfant(tcPr, 'vMerge');
          const out = { tc: cell, col, span, fusion: vm ? (attr(vm, 'w:val') === 'restart' ? 'debut' : 'suite') : null, fond: attr(enfant(tcPr, 'shd'), 'w:fill'), entete: Boolean(enfant(enfant(tr, 'trPr'), 'tblHeader')) };
          col += span;
          return out;
        });
      });
      let h = '<table>';
      for (let r = 0; r < lignes.length; r++) {
        h += '<tr>';
        for (const c of lignes[r]) {
          if (c.fusion === 'suite') continue;
          let rowspan = 1;
          if (c.fusion === 'debut') {
            for (let k = r + 1; k < lignes.length; k++) {
              const d = lignes[k].find((x) => x.col === c.col);
              if (d?.fusion === 'suite') rowspan++; else break;
            }
          }
          const tag = c.entete ? 'th' : 'td';
          const fond = c.fond && c.fond !== 'auto' ? ` style="background-color: #${c.fond}"` : '';
          h += `<${tag}${c.span > 1 ? ` colspan="${c.span}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${fond}>${await blocsDe(c.tc)}</${tag}>`;
        }
        h += '</tr>';
      }
      return `${h}</table>`;
    }

    return { html, miseEnPage, police: normal.police || null, taille: normal.taille || null, alertes: [...alertes] };
  }

  function proprietesRun(rPr, base) {
    const f = { ...base };
    if (!rPr) return f;
    const on = (nom) => {
      const n = enfant(rPr, nom);
      if (!n) return undefined;
      const v = attr(n, 'w:val');
      return !(v === '0' || v === 'false' || v === 'none');
    };
    const b = on('b'); if (b !== undefined) f.gras = b;
    const i = on('i'); if (i !== undefined) f.italique = i;
    const s = on('strike') ?? on('dstrike'); if (s !== undefined) f.barre = s;
    const u = enfant(rPr, 'u'); if (u) f.souligne = !['none', '0'].includes(attr(u, 'w:val'));
    const color = attr(enfant(rPr, 'color'), 'w:val'); if (color) f.couleur = color === 'auto' ? null : color.toLowerCase();
    const sz = attr(enfant(rPr, 'sz'), 'w:val'); if (sz) f.taille = Number(sz) / 2;
    const fonts = enfant(rPr, 'rFonts');
    const police = attr(fonts, 'w:ascii') || attr(fonts, 'w:hAnsi');
    if (police) f.police = police;
    const hl = attr(enfant(rPr, 'highlight'), 'w:val'); if (hl) f.fond = SURLIGNEURS_WORD[hl] || null;
    const shd = attr(enfant(rPr, 'shd'), 'w:fill'); if (shd && shd !== 'auto') f.fond = shd.toLowerCase();
    const va = attr(enfant(rPr, 'vertAlign'), 'w:val');
    if (va) { f.indice = va === 'subscript'; f.exposant = va === 'superscript'; }
    const caps = on('caps'); if (caps) f.majuscules = true;
    return f;
  }

  function proprietesPara(pPr, base) {
    const p = { ...base };
    if (!pPr) return p;
    const jc = attr(enfant(pPr, 'jc'), 'w:val');
    if (jc) p.align = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc] || null;
    const ind = enfant(pPr, 'ind');
    if (ind) {
      const g = attr(ind, 'w:left') ?? attr(ind, 'w:start');
      if (g !== null) p.retrait = Unites.twipsEnPx(Number(g));
      const fl = attr(ind, 'w:firstLine');
      if (fl !== null) p.premiere = Unites.twipsEnPx(Number(fl));
      const hg = attr(ind, 'w:hanging');
      if (hg !== null) p.premiere = -Unites.twipsEnPx(Number(hg));
    }
    if (enfant(pPr, 'pageBreakBefore') && attr(enfant(pPr, 'pageBreakBefore'), 'w:val') !== '0') p.sautAvant = true;
    if (enfant(pPr, 'numPr')) p.numPr = enfant(pPr, 'numPr');
    return p;
  }

  function lireSection(sect) {
    const mp = structuredClone(Formats.MISE_EN_PAGE);
    if (!sect) return mp;
    const sz = enfant(sect, 'pgSz'), mar = enfant(sect, 'pgMar');
    if (sz) {
      const l = Unites.pxEnCm(Unites.twipsEnPx(Number(attr(sz, 'w:w')))), h = Unites.pxEnCm(Unites.twipsEnPx(Number(attr(sz, 'w:h'))));
      if (l && h) Object.assign(mp, Formats.papierDe(l, h));
    }
    if (mar) {
      const cm = (k) => Math.round(Unites.pxEnCm(Unites.twipsEnPx(Math.abs(Number(attr(mar, k)) || 0))) * 100) / 100;
      mp.marges = { haut: cm('w:top') || 2.5, bas: cm('w:bottom') || 2.5, gauche: cm('w:left') || 2.5, droite: cm('w:right') || 2.5 };
    }
    return mp;
  }

  // ======================================================================
  // Enregistrer
  // ======================================================================
  async function ecrire(ctx) {
    const blocs = Formats.blocs(ctx.page);
    const zip = new JSZip();
    const rels = []; // { id, type, cible, externe }
    const medias = []; // { nom, bytes }
    const alertes = new Set();
    let nRel = 10, nDessin = 1;
    const rel = (type, cible, externe) => {
      const deja = rels.find((r) => r.type === type && r.cible === cible);
      if (deja) return deja.id;
      const id = `rId${nRel++}`;
      rels.push({ id, type, cible, externe });
      return id;
    };
    const largeurMax = Formats.largeurUtile(ctx.miseEnPage);

    // Listes : une numérotation par liste (pour que chaque liste numérotée reparte de 1).
    const numsListe = new Map(); // id de liste → { numId, type }
    const numDe = (liste) => {
      if (!numsListe.has(liste.id)) numsListe.set(liste.id, { numId: numsListe.size + 1, type: liste.type, debut: liste.debut || 1 });
      return numsListe.get(liste.id);
    };

    async function runsXml(runs, base = {}) {
      let x = '';
      let lienOuvert = null;
      const fermerLien = () => { if (lienOuvert) { x += '</w:hyperlink>'; lienOuvert = null; } };
      for (const r of runs) {
        if (r.lien !== lienOuvert && !(r.t === 'br' || r.t === 'tab')) {
          fermerLien();
          if (r.lien) {
            if (r.lien.startsWith('#')) x += `<w:hyperlink w:anchor="${xml(r.lien.slice(1))}">`;
            else x += `<w:hyperlink r:id="${rel('hyperlink', r.lien, true)}">`;
            lienOuvert = r.lien;
          }
        }
        if (r.t === 'br') x += '<w:r><w:br/></w:r>';
        else if (r.t === 'tab') x += '<w:r><w:tab/></w:r>';
        else if (r.t === 'texte') x += `<w:r>${rPr({ ...base, ...r.f }, Boolean(r.lien))}<w:t xml:space="preserve">${xml(r.texte)}</w:t></w:r>`;
        else if (r.t === 'media') x += await mediaXml(r);
      }
      fermerLien();
      return x;
    }

    async function mediaXml(r) {
      if (r.type === 'image') {
        let img;
        try {
          img = await Medias.imagePourBureautique(r.src, { formats: ['png', 'jpeg', 'gif', 'bmp'] });
        } catch (err) {
          alertes.add(`Une image n'a pas pu être lue (${r.nom}) : ${err.message}`);
          return '';
        }
        const nom = `image${medias.length + 1}.${img.ext}`;
        medias.push({ nom, bytes: img.bytes });
        const id = rel('image', `media/${nom}`);
        let w = r.largeur || img.largeur;
        if (w > largeurMax) w = largeurMax;
        const h = w * (img.hauteur / img.largeur);
        const cx = Unites.pxEnEmu(w), cy = Unites.pxEnEmu(h);
        const n = nDessin++;
        return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Image ${n}"/>`
          + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
          + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
          + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="${xml(r.nom)}"/><pic:cNvPicPr/></pic:nvPicPr>`
          + `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
          + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
          + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
      }
      // Vidéo, son : un lien vers le fichier rangé à côté du document.
      let cible;
      try {
        cible = await Formats.cheminMedia(ctx, r);
      } catch (err) {
        alertes.add(`${r.nom} n'a pas pu être rangé à côté du document : ${err.message}`);
        return '';
      }
      alertes.add(`Word ne sait pas lire les vidéos et les sons : ils sont rangés dans le dossier « ${ctx.dossierMedias} » et Word montre un lien vers eux. Edda les remet dans la page à la réouverture.`);
      const id = rel('hyperlink', encodeURI(cible).replace(/#/g, '%23'), true);
      const icone = r.type === 'video' ? '▶ Vidéo' : '♪ Son';
      return `<w:hyperlink r:id="${id}"><w:r>${rPr({}, true)}<w:t xml:space="preserve">${xml(`${icone} : ${r.nom}`)}</w:t></w:r></w:hyperlink>`;
    }

    function rPr(f, lien) {
      let x = '';
      if (lien) x += '<w:rStyle w:val="Hyperlink"/>';
      if (f.police) x += `<w:rFonts w:ascii="${xml(f.police)}" w:hAnsi="${xml(f.police)}" w:cs="${xml(f.police)}" w:eastAsia="${xml(f.police)}"/>`;
      if (f.gras) x += '<w:b/><w:bCs/>';
      if (f.italique) x += '<w:i/><w:iCs/>';
      if (f.barre) x += '<w:strike/>';
      if (f.couleur) x += `<w:color w:val="${f.couleur}"/>`;
      if (f.taille) x += `<w:sz w:val="${Math.round(f.taille * 2)}"/><w:szCs w:val="${Math.round(f.taille * 2)}"/>`;
      if (f.fond) x += `<w:shd w:val="clear" w:color="auto" w:fill="${f.fond}"/>`;
      if (f.souligne) x += '<w:u w:val="single"/>';
      if (f.indice) x += '<w:vertAlign w:val="subscript"/>';
      if (f.exposant) x += '<w:vertAlign w:val="superscript"/>';
      return x ? `<w:rPr>${x}</w:rPr>` : '';
    }

    const STYLE_ID = { h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', h4: 'Heading4', h5: 'Heading5', h6: 'Heading6', citation: 'Quote', code: 'Code' };
    async function blocXml(b) {
      if (b.type === 'saut') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (b.type === 'ligne') return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="A0A0A0"/></w:pBdr></w:pPr></w:p>';
      if (b.type === 'table') return tableXml(b);
      let ppr = '';
      if (STYLE_ID[b.style]) ppr += `<w:pStyle w:val="${STYLE_ID[b.style]}"/>`;
      if (b.liste && !b.liste.suite) {
        const { numId } = numDe(b.liste);
        ppr += `<w:numPr><w:ilvl w:val="${Math.min(8, b.liste.niveau)}"/><w:numId w:val="${numId}"/></w:numPr>`;
      }
      const retrait = (b.retrait || 0) + (b.liste ? 24 * (b.liste.niveau + 1) : 0);
      if (b.liste?.suite || (!b.liste && retrait)) ppr += `<w:ind w:left="${Unites.pxEnTwips(retrait)}"/>`;
      if (b.align && b.align !== 'left') ppr += `<w:jc w:val="${b.align === 'justify' ? 'both' : b.align}"/>`;
      return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${await runsXml(b.runs)}</w:p>`;
    }

    async function tableXml(t) {
      const { cases, colonnes } = Formats.grille(t);
      const total = Unites.pxEnTwips(largeurMax);
      const col = Math.floor(total / colonnes);
      let x = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/>'
        + '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="A0A0A0"/><w:left w:val="single" w:sz="4" w:color="A0A0A0"/><w:bottom w:val="single" w:sz="4" w:color="A0A0A0"/><w:right w:val="single" w:sz="4" w:color="A0A0A0"/><w:insideH w:val="single" w:sz="4" w:color="A0A0A0"/><w:insideV w:val="single" w:sz="4" w:color="A0A0A0"/></w:tblBorders>'
        + `<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${Array.from({ length: colonnes }, () => `<w:gridCol w:w="${col}"/>`).join('')}</w:tblGrid>`;
      for (let r = 0; r < cases.length; r++) {
        const entete = cases[r].some((c) => c?.cellule.entete && c.debut) && cases[r].every((c) => !c || c.cellule.entete);
        x += `<w:tr>${entete ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}`;
        for (let c = 0; c < colonnes; c++) {
          const k = cases[r][c];
          if (!k) { x += `<w:tc><w:tcPr><w:tcW w:w="${col}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`; continue; }
          if (!k.colDebut) continue; // couvert par le gridSpan de la case de gauche
          const cel = k.cellule;
          let tcpr = `<w:tcW w:w="${col * cel.colspan}" w:type="dxa"/>`;
          if (cel.colspan > 1) tcpr += `<w:gridSpan w:val="${cel.colspan}"/>`;
          if (cel.rowspan > 1) tcpr += k.ligneDebut ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
          if (cel.fond) tcpr += `<w:shd w:val="clear" w:color="auto" w:fill="${cel.fond}"/>`;
          let contenu = '<w:p/>';
          if (k.ligneDebut) {
            contenu = '';
            for (const b of cel.blocs) contenu += await blocXml(b);
            if (!contenu.endsWith('</w:p>')) contenu += '<w:p/>'; // une cellule finit toujours par un paragraphe
          }
          x += `<w:tc><w:tcPr>${tcpr}</w:tcPr>${contenu}</w:tc>`;
        }
        x += '</w:tr>';
      }
      return `${x}</w:tbl>`;
    }

    let corps = '';
    for (const b of blocs) corps += await blocXml(b);
    // Word veut un paragraphe après un tableau qui finit le document.
    if (corps.endsWith('</w:tbl>') || !corps) corps += '<w:p/>';

    const mp = ctx.miseEnPage || Formats.MISE_EN_PAGE;
    const { largeur, hauteur } = Formats.dimensions(mp);
    const tw = (cm) => Unites.pxEnTwips(Unites.cmEnPx(cm));
    const sectPr = `<w:sectPr><w:pgSz w:w="${tw(largeur)}" w:h="${tw(hauteur)}"${mp.orientation === 'paysage' ? ' w:orient="landscape"' : ''}/>`
      + `<w:pgMar w:top="${tw(mp.marges.haut)}" w:right="${tw(mp.marges.droite)}" w:bottom="${tw(mp.marges.bas)}" w:left="${tw(mp.marges.gauche)}" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>`;

    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
      + `<w:body>${corps}${sectPr}</w:body></w:document>`;

    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="bmp" ContentType="image/bmp"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
      + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '</Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
      + '</Relationships>');
    const types = { image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink' };
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
      + rels.map((r) => `<Relationship Id="${r.id}" Type="${types[r.type]}" Target="${xml(r.cible)}"${r.externe ? ' TargetMode="External"' : ''}/>`).join('')
      + '</Relationships>');
    zip.file('word/document.xml', documentXml);
    zip.file('word/styles.xml', stylesXml(ctx.police || 'Calibri', ctx.taille || 11));
    zip.file('word/numbering.xml', numerotationXml([...numsListe.values()]));
    zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="709"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`);
    const maintenant = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${xml(ctx.titre || '')}</dc:title><dc:creator>Ragna</dc:creator><cp:lastModifiedBy>Edda</cp:lastModifiedBy>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${maintenant}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${maintenant}</dcterms:modified></cp:coreProperties>`);
    zip.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Edda</Application></Properties>');
    for (const m of medias) zip.file(`word/media/${m.nom}`, m.bytes);
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return { bytes, alertes: [...alertes] };
  }

  function stylesXml(police, taille) {
    const titre = (n, sz, couleur) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>`
      + `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="${couleur}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
    const p = xml(police);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + `<w:styles xmlns:w="${W}">`
      + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${p}" w:hAnsi="${p}" w:cs="${p}" w:eastAsia="${p}"/><w:sz w:val="${taille * 2}"/><w:szCs w:val="${taille * 2}"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>`
      + '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
      + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
      + titre(1, 40, '1F3864') + titre(2, 32, '2F5496') + titre(3, 28, '2F5496') + titre(4, 24, '2F5496') + titre(5, 22, '2F5496') + titre(6, 22, '595959')
      + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="567" w:right="567"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="A0A0A0"/></w:pBdr></w:pPr><w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style>'
      + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>'
      + '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>'
      + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
      + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
      + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr></w:style>'
      + '</w:styles>';
  }

  function numerotationXml(listes) {
    const puces = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪'];
    const formats = ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman'];
    const niveaux = (type) => Array.from({ length: 9 }, (_, i) => {
      const ind = `<w:pPr><w:ind w:left="${360 * (i + 1)}" w:hanging="360"/></w:pPr>`;
      return type === 'ul'
        ? `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${puces[i]}"/><w:lvlJc w:val="left"/>${ind}</w:lvl>`
        : `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${formats[i]}"/><w:lvlText w:val="%${i + 1}."/><w:lvlJc w:val="left"/>${ind}</w:lvl>`;
    }).join('');
    let x = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="${W}">`;
    x += `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${niveaux('ul')}</w:abstractNum>`;
    x += `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${niveaux('ol')}</w:abstractNum>`;
    for (const l of listes) {
      x += `<w:num w:numId="${l.numId}"><w:abstractNumId w:val="${l.type === 'ul' ? 0 : 1}"/>`;
      if (l.type === 'ol') x += `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${l.debut}"/></w:lvlOverride>`;
      x += '</w:num>';
    }
    return `${x}</w:numbering>`;
  }

  Formats.ajouter('docx', { nom: 'Document Word', extensions: ['docx', 'docm', 'dotx'], lire, ecrire, garde: 'tout' });
})();
