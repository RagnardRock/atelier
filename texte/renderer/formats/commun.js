// Ce que les formats ont en commun.
//
// Pour ENREGISTRER, chaque format (docx.js, odt.js, rtf.js…) ne lit pas le HTML de la page lui-même :
// Formats.blocs(page) le transforme d'abord en une liste simple de « blocs », la même pour tous :
//
//   { type: 'p', style, align, retrait, liste, runs }   un paragraphe (ou un titre, une citation…)
//       style   : 'normal', 'h1'…'h6', 'citation' ou 'code'
//       align   : 'left', 'center', 'right', 'justify' ou null
//       retrait : décalage à gauche, en pixels
//       liste   : null, ou { type: 'ul' | 'ol', niveau (0 = premier), id (une liste = un id), suite }
//                 (suite : un 2e paragraphe dans le même élément de liste, sans puce)
//       runs    : les morceaux de texte, chacun avec sa mise en forme :
//                 { t: 'texte', texte, f, lien }, { t: 'br' }, { t: 'tab' },
//                 { t: 'media', type: 'image' | 'video' | 'audio', src, nom, largeur, f, lien }
//                 f = { gras, italique, souligne, barre, indice, exposant, couleur, fond, police, taille }
//                 (couleur et fond en « rrggbb », taille en points)
//   { type: 'table', lignes: [[{ blocs, colspan, rowspan, entete, fond }]] }
//   { type: 'saut' }   un saut de page
//   { type: 'ligne' }  un trait horizontal
//
// Pour OUVRIR, chaque format produit directement du HTML, nettoyé ensuite par Nettoyage.html (base.js).
//
// La mise en page d'un document : { format: 'A4', orientation: 'portrait' | 'paysage',
// marges: { haut, bas, gauche, droite } } (marges en cm).

const Formats = (() => {
  const liste = {}; // id → { nom, extensions, lire(bytes, ctx), ecrire(ctx), garde }

  const PAPIERS = {
    A4: { nom: 'A4', largeur: 21, hauteur: 29.7 },
    A5: { nom: 'A5', largeur: 14.8, hauteur: 21 },
    A3: { nom: 'A3', largeur: 29.7, hauteur: 42 },
    Letter: { nom: 'Lettre US', largeur: 21.59, hauteur: 27.94 },
    Legal: { nom: 'Légal US', largeur: 21.59, hauteur: 35.56 },
  };
  const MISE_EN_PAGE = { format: 'A4', orientation: 'portrait', marges: { haut: 2.5, bas: 2.5, gauche: 2.5, droite: 2.5 } };
  // Largeur et hauteur de la feuille (cm), selon l'orientation.
  function dimensions(mp) {
    const p = PAPIERS[mp?.format] || PAPIERS.A4;
    return mp?.orientation === 'paysage' ? { largeur: p.hauteur, hauteur: p.largeur } : { largeur: p.largeur, hauteur: p.hauteur };
  }
  // Le papier le plus proche d'une taille lue dans un fichier (cm).
  function papierDe(largeur, hauteur) {
    const [petit, grand] = largeur < hauteur ? [largeur, hauteur] : [hauteur, largeur];
    let best = 'A4', ecart = Infinity;
    for (const [id, p] of Object.entries(PAPIERS)) {
      const e = Math.abs(p.largeur - petit) + Math.abs(p.hauteur - grand);
      if (e < ecart) { ecart = e; best = id; }
    }
    return { format: best, orientation: largeur > hauteur ? 'paysage' : 'portrait' };
  }
  // Largeur utile (entre les marges), en pixels : les médias ne doivent pas la dépasser.
  const largeurUtile = (mp) => Unites.cmEnPx(dimensions(mp).largeur - (mp?.marges?.gauche ?? 2.5) - (mp?.marges?.droite ?? 2.5));

  // --- Du HTML de la page vers les blocs ---
  const BLOCS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'TABLE', 'HR', 'DIV',
    'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD', 'CAPTION', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
  const estBloc = (n) => n.nodeType === 1 && BLOCS.has(n.tagName);

  function premierePolice(v) {
    const p = String(v || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
    return p && !/^(inherit|initial|serif|sans-serif|monospace|system-ui)$/i.test(p) ? p : null;
  }

  // La mise en forme d'un élément, ajoutée à celle de ses parents.
  function formatDe(n, f) {
    const g = { ...f };
    switch (n.tagName) {
      case 'B': case 'STRONG': g.gras = true; break;
      case 'I': case 'EM': case 'CITE': case 'VAR': g.italique = true; break;
      case 'U': case 'INS': g.souligne = true; break;
      case 'S': case 'STRIKE': case 'DEL': g.barre = true; break;
      case 'SUB': g.indice = true; g.exposant = false; break;
      case 'SUP': g.exposant = true; g.indice = false; break;
      case 'MARK': g.fond = 'ffff00'; break;
      case 'CODE': case 'KBD': case 'SAMP': g.police = 'Consolas'; break;
      case 'SMALL': g.taille = (g.taille || 11) * 0.85; break;
      case 'BIG': g.taille = (g.taille || 11) * 1.2; break;
      default: break;
    }
    const s = n.style;
    if (s) {
      if (s.fontWeight) g.gras = s.fontWeight === 'bold' || s.fontWeight === 'bolder' || Number(s.fontWeight) >= 600;
      if (s.fontStyle) g.italique = s.fontStyle === 'italic' || s.fontStyle === 'oblique';
      const deco = `${s.textDecoration} ${s.textDecorationLine}`;
      if (/underline/.test(deco)) g.souligne = true;
      if (/line-through/.test(deco)) g.barre = true;
      if (/^none/.test(s.textDecoration)) { g.souligne = false; g.barre = false; }
      if (s.color) g.couleur = couleurHex(s.color) ?? g.couleur;
      if (s.backgroundColor) g.fond = couleurHex(s.backgroundColor) ?? g.fond;
      if (s.fontFamily) g.police = premierePolice(s.fontFamily) || g.police;
      if (s.fontSize) g.taille = taillePt(s.fontSize) || g.taille;
      if (s.verticalAlign === 'sub') { g.indice = true; g.exposant = false; }
      if (s.verticalAlign === 'super') { g.exposant = true; g.indice = false; }
    }
    return g;
  }

  function blocs(racine) {
    const out = [];
    let listeId = 0;
    // ctx : { style, align, retrait, liste, pre, f }
    function conteneur(node, ctx, sortie) {
      let attente = []; // nœuds en ligne pas encore rangés dans un paragraphe
      let liSuite = false;
      const vider = () => {
        if (!attente.length) return;
        const p = paragraphe(attente, ctx, liSuite);
        attente = [];
        if (p) { sortie.push(p); if (ctx.liste) liSuite = true; }
      };
      for (const n of node.childNodes) {
        if (n.nodeType === 3 || (n.nodeType === 1 && !estBloc(n))) { attente.push(n); continue; }
        if (n.nodeType !== 1) continue;
        if (n.dataset.sentinelle !== undefined && !n.textContent.trim()) continue; // voir Editeur.insererA
        vider();
        const c = enfantCtx(n, ctx);
        switch (n.tagName) {
          case 'HR':
            sortie.push({ type: n.classList.contains('saut-page') ? 'saut' : 'ligne' });
            break;
          case 'UL': case 'OL': {
            const niveau = ctx.liste ? ctx.liste.niveau + 1 : 0;
            const id = ++listeId;
            const debut = n.tagName === 'OL' ? Number(n.getAttribute('start')) || 1 : 1;
            for (const li of n.children) {
              if (li.tagName === 'LI') conteneur(li, { ...c, liste: { type: n.tagName.toLowerCase(), niveau, id, debut } }, sortie);
              else conteneur(li, c, sortie);
            }
            break;
          }
          case 'TABLE':
            sortie.push(tableau(n, c));
            break;
          default:
            conteneur(n, c, sortie);
            liSuite = liSuite || Boolean(ctx.liste);
        }
        if (ctx.liste && n.tagName !== 'UL' && n.tagName !== 'OL') liSuite = true;
      }
      vider();
      // Un élément de liste vide garde sa puce.
      if (ctx.liste && !liSuite && node.tagName === 'LI') sortie.push({ type: 'p', style: ctx.style, align: ctx.align, retrait: ctx.retrait, liste: ctx.liste, runs: [] });
    }

    function enfantCtx(n, ctx) {
      const c = { ...ctx, liste: ctx.liste };
      const s = n.style;
      if (/^H[1-6]$/.test(n.tagName)) c.style = n.tagName.toLowerCase();
      else if (n.tagName === 'P' || n.tagName === 'DIV') c.style = ctx.style === 'code' || ctx.style === 'citation' || /^h/.test(ctx.style) ? ctx.style : 'normal';
      else if (n.tagName === 'PRE') { c.style = 'code'; c.pre = true; }
      else if (n.tagName === 'BLOCKQUOTE') {
        // L'indentation de Chromium (bouton « Augmenter le retrait ») est une citation avec une marge.
        if (s?.marginLeft || /margin/.test(n.getAttribute('style') || '')) c.retrait = (ctx.retrait || 0) + (Unites.lire(s.marginLeft) ?? 40);
        else c.style = 'citation';
      } else if (n.tagName === 'DD') c.retrait = (ctx.retrait || 0) + 40;
      else if (n.tagName === 'DT') c.f = { ...ctx.f, gras: true };
      else if (n.tagName === 'TH' || n.tagName === 'CAPTION') c.f = { ...ctx.f, gras: true };
      else if (n.tagName === 'FIGCAPTION') c.f = { ...ctx.f, italique: true };
      if (s?.textAlign) c.align = { start: 'left', end: 'right', left: 'left', right: 'right', center: 'center', justify: 'justify' }[s.textAlign] || ctx.align;
      if (n.tagName !== 'BLOCKQUOTE' && n.tagName !== 'LI') {
        const m = Unites.lire(s?.marginLeft) || 0, p = Unites.lire(s?.paddingLeft) || 0;
        if (m + p > 0) c.retrait = (ctx.retrait || 0) + m + p;
      }
      // La mise en forme posée sur un bloc (un <p style="color:…">) vaut pour son texte.
      if (n.tagName !== 'TABLE') c.f = formatDe(n, c.f || {});
      return c;
    }

    function paragraphe(noeuds, ctx, suite) {
      const runs = [];
      for (const n of noeuds) enLigne(n, ctx.f || {}, null, runs, ctx.pre);
      // Espaces en trop au début et à la fin (indentation du HTML), et le <br> final (que Chromium
      // ajoute pour qu'un paragraphe vide ait une hauteur).
      if (!ctx.pre) {
        while (runs.length && runs[0].t === 'texte' && !(runs[0].texte = runs[0].texte.replace(/^ +/, ''))) runs.shift();
        while (runs.length && runs.at(-1).t === 'texte' && !(runs.at(-1).texte = runs.at(-1).texte.replace(/ +$/, ''))) runs.pop();
      }
      if (runs.at(-1)?.t === 'br') runs.pop();
      const vide = !runs.length;
      // Un nœud texte fait seulement d'espaces entre deux blocs : pas un paragraphe.
      if (vide && noeuds.every((n) => n.nodeType === 3)) return null;
      return { type: 'p', style: ctx.style || 'normal', align: ctx.align || null, retrait: ctx.retrait || 0, liste: ctx.liste ? { ...ctx.liste, suite } : null, runs };
    }

    function enLigne(n, f, lien, runs, pre) {
      if (n.nodeType === 3) {
        let t = n.nodeValue;
        if (!pre) t = t.replace(/[\t\n\r ]+/g, ' ');
        t = t.replace(/ /g, ' ').replace(/​/g, '');
        if (!t) return;
        // Deux espaces de suite (en fin d'un morceau puis au début du suivant) : un seul, comme à l'écran.
        const prec = runs.at(-1);
        if (!pre && prec?.t === 'texte' && prec.texte.endsWith(' ') && t.startsWith(' ')) t = t.slice(1);
        if (pre && t.includes('\n')) {
          t.split('\n').forEach((ligne, i) => {
            if (i) runs.push({ t: 'br' });
            if (ligne) runs.push({ t: 'texte', texte: ligne, f, lien });
          });
          return;
        }
        if (prec?.t === 'texte' && prec.lien === lien && memeFormat(prec.f, f)) prec.texte += t;
        else runs.push({ t: 'texte', texte: t, f, lien });
        return;
      }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { runs.push({ t: 'br' }); return; }
      if (n.classList.contains('tab')) { runs.push({ t: 'tab' }); return; }
      const type = Medias.type(n);
      if (type) {
        const src = n.getAttribute('src');
        if (!src) return;
        const largeur = Unites.lire(n.style.width) || (n.tagName === 'IMG' && n.naturalWidth) || null;
        runs.push({ t: 'media', type, src, nom: Medias.nom(n), largeur, ratio: n.tagName === 'IMG' && n.naturalWidth ? n.naturalHeight / n.naturalWidth : null, f, lien });
        return;
      }
      const g = formatDe(n, f);
      const l = n.tagName === 'A' && n.getAttribute('href') ? n.getAttribute('href') : lien;
      const dansPre = pre || n.tagName === 'CODE' && pre;
      for (const c of n.childNodes) enLigne(c, g, l, runs, dansPre);
    }

    function tableau(t, ctx) {
      const lignes = [];
      for (const tr of t.rows) {
        const ligne = [];
        for (const td of tr.cells) {
          const c = enfantCtx(td, { ...ctx, liste: null, style: 'normal', retrait: 0, align: null });
          const contenu = [];
          conteneur(td, c, contenu);
          if (!contenu.length) contenu.push({ type: 'p', style: 'normal', align: c.align, retrait: 0, liste: null, runs: [] });
          ligne.push({ blocs: contenu, colspan: td.colSpan || 1, rowspan: td.rowSpan || 1, entete: td.tagName === 'TH', fond: couleurHex(td.style.backgroundColor) || couleurHex(tr.style.backgroundColor), largeur: Unites.lire(td.style.width) });
        }
        if (ligne.length) lignes.push(ligne);
      }
      return { type: 'table', lignes, largeur: Unites.lire(t.style.width) };
    }

    conteneur(racine, { style: 'normal', align: null, retrait: 0, liste: null, pre: false, f: {} }, out);
    return out;
  }

  const CLES_FORMAT = ['gras', 'italique', 'souligne', 'barre', 'indice', 'exposant', 'couleur', 'fond', 'police', 'taille'];
  const memeFormat = (a, b) => CLES_FORMAT.every((k) => (a[k] || null) === (b[k] || null));

  // Une grille de tableau complète : les cellules fusionnées (colspan, rowspan) occupent plusieurs
  // cases. Word et LibreOffice veulent une case pour chaque position, avec « suite de la fusion ».
  // → [[{ cellule, debut: true } | { cellule, debut: false, verticale } ]]
  function grille(table) {
    const g = [];
    table.lignes.forEach((ligne, r) => {
      g[r] = g[r] || [];
      let c = 0;
      for (const cellule of ligne) {
        while (g[r][c]) c++;
        for (let dr = 0; dr < cellule.rowspan; dr++) {
          for (let dc = 0; dc < cellule.colspan; dc++) {
            g[r + dr] = g[r + dr] || [];
            g[r + dr][c + dc] = { cellule, debut: dr === 0 && dc === 0, ligneDebut: dr === 0, colDebut: dc === 0 };
          }
        }
        c += cellule.colspan;
      }
    });
    const colonnes = Math.max(1, ...g.map((l) => l.length));
    return { cases: g.slice(0, table.lignes.length).map((l) => Array.from({ length: colonnes }, (_, i) => l[i] || null)), colonnes };
  }

  // Le texte brut d'une liste de runs.
  const texteDe = (runs) => runs.map((r) => (r.t === 'texte' ? r.texte : r.t === 'br' ? '\n' : r.t === 'tab' ? '\t' : '')).join('');

  // --- XML ---
  const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // Caractères interdits en XML (des caractères de contrôle collés depuis un PDF…).
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
  function lireXml(texte) {
    const doc = new DOMParser().parseFromString(texte, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Fichier abîmé : son contenu XML est illisible.');
    return doc;
  }
  // Les enfants d'un élément XML, par nom local (sans « w: », « text: »…).
  const enfants = (n, nom) => [...(n?.children || [])].filter((c) => !nom || c.localName === nom);
  const enfant = (n, nom) => enfants(n, nom)[0] || null;
  // L'attribut « w:val » se lit avec ou sans préfixe, selon le logiciel qui a écrit le fichier.
  function attr(n, nom) {
    if (!n) return null;
    if (n.hasAttribute(nom)) return n.getAttribute(nom);
    const local = nom.split(':').pop();
    for (const a of n.attributes) if (a.localName === local) return a.value;
    return null;
  }

  // Le HTML d'un morceau de texte mis en forme (pour les lecteurs docx, odt, rtf).
  function htmlRun(texte, f, lien) {
    if (!texte) return '';
    let h = escapeHtml(texte);
    const styles = [];
    if (f.couleur) styles.push(`color: #${f.couleur}`);
    if (f.fond) styles.push(`background-color: #${f.fond}`);
    if (f.police) styles.push(`font-family: ${/\s/.test(f.police) ? `'${f.police}'` : f.police}`);
    if (f.taille) styles.push(`font-size: ${f.taille}pt`);
    if (styles.length) h = `<span style="${escapeHtml(styles.join('; '))}">${h}</span>`;
    if (f.indice) h = `<sub>${h}</sub>`;
    if (f.exposant) h = `<sup>${h}</sup>`;
    if (f.barre) h = `<s>${h}</s>`;
    if (f.souligne) h = `<u>${h}</u>`;
    if (f.italique) h = `<em>${h}</em>`;
    if (f.gras) h = `<strong>${h}</strong>`;
    if (lien) h = `<a href="${escapeHtml(lien)}">${h}</a>`;
    return h;
  }
  // Le HTML d'un média lu dans un fichier.
  function htmlMedia(type, src, largeur, nom) {
    const w = largeur ? ` style="width: ${Math.round(largeur)}px"` : '';
    const n = nom ? ` data-nom="${escapeHtml(nom)}"` : '';
    if (type === 'video') return `<video class="media" controls src="${escapeHtml(src)}"${w}${n}></video>`;
    if (type === 'audio') return `<audio class="media" controls src="${escapeHtml(src)}"${n}></audio>`;
    return `<img class="media" src="${escapeHtml(src)}"${w}${n} alt="">`;
  }
  // Les attributs d'un paragraphe lu dans un fichier (alignement, retrait).
  function stylePara({ align, retrait, premiere }) {
    const s = [];
    if (align && align !== 'left') s.push(`text-align: ${align}`);
    // Un tout petit retrait (la marge intérieure d'une cellule de LibreOffice) ne se voit pas.
    if (retrait > 4) s.push(`margin-left: ${Math.round(retrait)}px`);
    if (premiere && Math.abs(premiere) > 4) s.push(`text-indent: ${Math.round(premiere)}px`);
    return s.length ? ` style="${s.join('; ')}"` : '';
  }

  // Ranger les paragraphes d'une liste dans des <ul>/<ol> imbriqués (pour les lecteurs).
  // items : [{ html (le <p>…</p>), liste: null | { type, niveau, id, debut } }]
  function assemblerListes(items) {
    let h = '';
    const pile = []; // [{ type, id }]
    const fermerJusqua = (n) => { while (pile.length > n) h += `</li></${pile.pop().type}>`; };
    for (const it of items) {
      if (!it.liste) { fermerJusqua(0); h += it.html; continue; }
      const niveau = Math.min(it.liste.niveau, 8);
      if (pile.length > niveau + 1) fermerJusqua(niveau + 1);
      // Une autre liste au même niveau (autre type, ou autre numérotation) : on recommence.
      if (pile.length === niveau + 1 && (pile[niveau].type !== it.liste.type || (niveau === 0 && pile[0].id !== it.liste.id))) fermerJusqua(niveau);
      if (pile.length === niveau + 1) h += '</li><li>';
      while (pile.length < niveau + 1) {
        const type = pile.length === niveau ? it.liste.type : (pile.at(-1)?.type || it.liste.type);
        const start = type === 'ol' && it.liste.debut > 1 && pile.length === niveau ? ` start="${it.liste.debut}"` : '';
        h += `<${type}${start}><li>`;
        pile.push({ type, id: it.liste.id });
      }
      h += it.html;
    }
    fermerJusqua(0);
    return h;
  }

  // --- Enregistrer les médias à côté du document (HTML, Markdown, vidéos et sons des .docx…) ---
  // ctx.ranger(src) renvoie le chemin relatif au document (« Rapport-medias/photo.png »).
  // Une adresse https:// reste telle quelle.
  async function cheminMedia(ctx, run) {
    if (/^https?:/i.test(run.src)) return run.src;
    if (/^(data|blob):/i.test(run.src)) {
      const { bytes } = await Medias.octets(run.src);
      return ctx.ranger({ nom: run.nom, bytes });
    }
    return ctx.ranger(run.src);
  }

  return {
    liste,
    ajouter(id, format) { liste[id] = { id, ...format }; },
    deExtension(ext) { return Object.values(liste).find((f) => f.extensions.includes(String(ext).toLowerCase())) || null; },
    PAPIERS,
    MISE_EN_PAGE,
    dimensions,
    papierDe,
    largeurUtile,
    blocs,
    grille,
    texteDe,
    memeFormat,
    xml,
    lireXml,
    enfants,
    enfant,
    attr,
    htmlRun,
    htmlMedia,
    stylePara,
    assemblerListes,
    cheminMedia,
  };
})();
