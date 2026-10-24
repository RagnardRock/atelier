// Texte enrichi (.rtf) : le vieux format d'échange de Word, que tous les traitements de texte lisent.
//
// Un RTF est du texte avec des commandes : {\b gras} \par (fin de paragraphe), \fs24 (taille 12 pt,
// en demi-points), \cf2 (2e couleur de la table des couleurs), \'e9 (« é » dans la page de code
// Windows-1252), \u8364? (un caractère Unicode)… Les accolades { } délimitent des groupes : une mise
// en forme posée dans un groupe s'arrête à sa fin.
//
// Edda lit : paragraphes, titres (\outlinelevel ou styles « heading »), gras/italique/souligné/barré,
// couleurs, surlignage, polices, tailles, alignement, retraits, listes (à puces ou numérotées, telles
// qu'écrites par Word), tableaux simples, liens, images PNG et JPEG, sauts de page.
// Edda écrit la même chose (les listes avec leur puce ou leur numéro écrits dans le texte, ce que
// tous les logiciels comprennent ; les vidéos et les sons en lien vers le fichier rangé à côté).

(() => {
  const { htmlRun, htmlMedia, stylePara, assemblerListes } = Formats;

  // ======================================================================
  // Ouvrir
  // ======================================================================
  function lire(bytes, ctx) {
    // Un RTF est en ASCII : on le lit octet par octet (latin1 garde chaque octet tel quel).
    const source = new TextDecoder('latin1').decode(bytes);
    if (!/^\s*\{\\rtf/.test(source)) throw new Error('Ce fichier n\'est pas un RTF (il ne commence pas par {\\rtf).');
    const alertes = new Set();
    let codepage = 'windows-1252';
    const polices = {};
    const couleurs = []; // la 1re entrée (avant le premier « ; ») est la couleur automatique
    let policeDefaut = 0;
    const stylesheet = {}; // numéro → { titre, nom }

    // --- Découpage en jetons ---
    let i = 0;
    const n = source.length;
    function jeton() {
      while (i < n) {
        const c = source[i];
        if (c === '{') { i++; return { t: '{' }; }
        if (c === '}') { i++; return { t: '}' }; }
        if (c === '\\') {
          const d = source[i + 1];
          if (/[a-zA-Z]/.test(d)) {
            let j = i + 1;
            while (j < n && /[a-zA-Z]/.test(source[j])) j++;
            const mot = source.slice(i + 1, j);
            let param = null;
            const m = /^-?\d+/.exec(source.slice(j, j + 12));
            if (m) { param = Number(m[0]); j += m[0].length; }
            if (source[j] === ' ') j++;
            i = j;
            return { t: 'mot', mot, param };
          }
          if (d === '\'') { const hex = source.slice(i + 2, i + 4); i += 4; return { t: 'hex', valeur: parseInt(hex, 16) }; }
          i += 2;
          if (d === '\r' || d === '\n') return { t: 'mot', mot: 'par', param: null };
          return { t: 'sym', valeur: d };
        }
        if (c === '\r' || c === '\n') { i++; continue; }
        let j = i;
        while (j < n && !'{}\\\r\n'.includes(source[j])) j++;
        const texte = source.slice(i, j);
        i = j;
        return { t: 'texte', texte };
      }
      return null;
    }

    // --- Lecture ---
    const parDefaut = () => ({ gras: false, italique: false, souligne: false, barre: false, indice: false, exposant: false, police: null, taille: null, couleur: null, fond: null, cache: false });
    let car = { ...parDefaut(), f: null, uc: 1 };
    let pile = [];
    let para = paraDefaut();
    function paraDefaut() { return { align: null, retrait: 0, premiere: 0, style: 'normal', liste: null, dansTableau: false, niveau: 0 }; }
    // La destination du groupe en cours : 'texte' (le document), 'ignorer', 'polices', 'couleurs', 'styles', 'image', 'champ', 'resultat', 'listtext'…
    let dest = 'texte';
    let destPile = [];

    const items = []; // { html, liste } pour assemblerListes
    let courant = ''; // HTML du paragraphe en cours
    let lien = null; // lien du champ HYPERLINK en cours
    let instr = '';
    let image = null; // { type, hex, largeur, hauteur, largeurVoulue }
    let octetsEnAttente = []; // octets \'hh d'un même caractère (pages de code à plusieurs octets)
    let aSauter = 0; // caractères à ignorer après \uN
    let tableau = null; // { lignes: [[cellule html]], ligne: [], cellule: '' }
    let texteListe = ''; // le texte de la puce ou du numéro (\listtext, \pntext)
    let police = { nom: '', num: 0 };
    let style = { num: 0, nom: '', titre: null };

    const decodeur = () => { try { return new TextDecoder(codepage); } catch { return new TextDecoder('windows-1252'); } };
    function viderOctets() {
      if (!octetsEnAttente.length) return '';
      const s = decodeur().decode(new Uint8Array(octetsEnAttente));
      octetsEnAttente = [];
      return s;
    }
    function ecrireTexte(t) {
      if (!t) return;
      if (dest === 'texte' || dest === 'resultat') {
        if (car.cache) return;
        // Un titre a déjà sa taille, son gras et sa couleur dans Edda.
        const f = /^h\d$/.test(para.style) ? { ...car, taille: null, gras: false, couleur: null } : car;
        courant += htmlRun(t, f, lien);
      } else if (dest === 'champ') instr += t;
      else if (dest === 'polices') police.nom += t;
      else if (dest === 'styles') style.nom += t;
      else if (dest === 'listtext') texteListe += t;
    }
    function texteBrut(t) {
      // Les octets \'hh en attente passent d'abord (un caractère peut en prendre deux en chinois…).
      const avant = viderOctets();
      if (aSauter > 0) {
        const n2 = Math.min(aSauter, t.length);
        t = t.slice(n2);
        aSauter -= n2;
      }
      ecrireTexte(avant + t);
    }

    function finParagraphe() {
      viderOctets();
      const h = courant;
      courant = '';
      if (tableau && para.dansTableau) { tableau.cellule += `<p${stylePara(para)}>${h || '<br>'}</p>`; return; }
      if (tableau && !para.dansTableau) finTableau();
      const tag = para.style === 'normal' ? 'p' : para.style;
      // Une liste écrite « à la main » par Word (puce dans \listtext ou \pntext).
      // LibreOffice numérote ses titres avec une « liste » : un titre n'est pas un élément de liste.
      let liste = /^h\d$/.test(para.style) ? null : para.liste;
      if (liste && /^\s*[\dA-Za-z]{1,4}[.)]/.test(texteListe)) liste = { ...liste, type: 'ol' };
      if (!liste && texteListe.trim() && !/^h\d$/.test(para.style)) liste = { type: /^\s*[\d\w]+[.)]/.test(texteListe) ? 'ol' : 'ul', niveau: 0, id: 'rtf' };
      texteListe = '';
      items.push({ html: `<${tag}${stylePara({ ...para, retrait: liste ? 0 : para.retrait, premiere: liste ? 0 : para.premiere })}>${h || '<br>'}</${tag}>`, liste });
    }
    function finTableau() {
      if (!tableau) return;
      if (tableau.ligne.length) tableau.lignes.push(tableau.ligne);
      if (tableau.lignes.length) items.push({ html: `<table>${tableau.lignes.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`, liste: null });
      tableau = null;
    }

    function finImage(img) {
      if (!img || !img.hex) return;
      const hex = img.hex.replace(/[^0-9a-f]/gi, '');
      const b = new Uint8Array(hex.length / 2);
      for (let k = 0; k < b.length; k++) b[k] = parseInt(hex.substr(k * 2, 2), 16);
      const mime = Medias.mimeDe(b);
      if (!mime) { alertes.add('Certaines images (EMF, WMF) ne s\'affichent pas : Chromium ne sait pas les lire.'); return; }
      const largeur = img.largeurVoulue ? Unites.twipsEnPx(img.largeurVoulue) * (img.echelle || 100) / 100 : null;
      courant += htmlMedia('image', Medias.dataUrl(b, mime), largeur);
    }

    const DEST_IGNOREES = new Set(['info', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf', 'footnote', 'annotation', 'atnid', 'atnauthor',
      'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'mmathPr', 'pgdsctbl',
      'filetbl', 'revtbl', 'bkmkstart', 'bkmkend', 'object', 'objdata', 'fldtype', 'nonshppict', 'shpinst', 'sp', 'sn', 'sv', 'datafield', 'formfield', 'pnseclvl', 'userprops', 'docvar', 'template', 'operator', 'title', 'author', 'xmlopen', 'wgrffmtfilter', 'defchp', 'defpap']);

    let attendEtoile = false;
    let t;
    while ((t = jeton())) {
      if (t.t === '{') {
        texteBrut('');
        pile.push({ car: { ...car }, para: { ...para } });
        destPile.push(dest);
        attendEtoile = false;
        continue;
      }
      if (t.t === '}') {
        texteBrut('');
        if (dest === 'image') { finImage(image); image = null; }
        if (dest === 'polices' && police.nom) { polices[police.num] = police.nom.replace(/;\s*$/, '').trim(); police = { nom: '', num: 0 }; }
        if (dest === 'styles' && style.nom) { stylesheet[style.num] = { nom: style.nom.replace(/;\s*$/, '').trim(), titre: style.titre }; style = { num: 0, nom: '', titre: null }; }
        const ancienneDest = dest;
        const s = pile.pop();
        if (s) { car = s.car; para = s.para; }
        dest = destPile.pop() ?? 'texte';
        if (ancienneDest === 'champ' && dest !== 'champ') {
          const m = instr.match(/HYPERLINK\s+(?:\\l\s+)?"([^"]+)"/i);
          lien = m ? (/^\\l/.test(instr.split('HYPERLINK')[1]?.trim() || '') ? `#${m[1]}` : m[1]) : null;
          instr = '';
        }
        if (ancienneDest === 'resultat' && dest !== 'resultat') lien = null;
        continue;
      }
      if (t.t === 'hex') {
        if (aSauter > 0) { aSauter--; continue; }
        if (dest === 'image' && image) { image.hex += t.valeur.toString(16).padStart(2, '0'); continue; }
        octetsEnAttente.push(t.valeur);
        continue;
      }
      if (t.t === 'texte') {
        if (dest === 'image' && image) { image.hex += t.texte; continue; }
        if (dest === 'couleurs') {
          for (const ch of t.texte) if (ch === ';') couleurs.push(couleurEnCours ? { ...couleurEnCours } : null), couleurEnCours = null;
          continue;
        }
        if (dest === 'ignorer') continue;
        texteBrut(t.texte);
        continue;
      }
      if (t.t === 'sym') {
        if (t.valeur === '*') { attendEtoile = true; continue; }
        if (dest === 'ignorer' || dest === 'image') continue;
        if (t.valeur === '~') texteBrut('\u00a0');
        else if (t.valeur === '-') { /* césure facultative */ } else if (t.valeur === '_') texteBrut('‑');
        else if ('\\{}'.includes(t.valeur)) texteBrut(t.valeur);
        continue;
      }
      // Un mot de commande
      const { mot, param } = t;
      if (attendEtoile) {
        attendEtoile = false;
        if (mot === 'fldinst') { dest = 'champ'; continue; }
        if (mot === 'shppict' || mot === 'blipuid') { if (mot === 'blipuid') dest = 'ignorer'; continue; }
        dest = 'ignorer';
        continue;
      }
      if (dest === 'ignorer') continue;
      if (dest === 'image' && image) {
        if (mot === 'pngblip' || mot === 'jpegblip') image.type = mot;
        else if (mot === 'emfblip' || mot === 'wmetafile' || mot === 'macpict' || mot === 'dibitmap' || mot === 'wbitmap') image.type = 'autre';
        else if (mot === 'picwgoal') image.largeurVoulue = param;
        else if (mot === 'pichgoal') image.hauteurVoulue = param;
        else if (mot === 'picscalex') image.echelle = param;
        else if (mot === 'bin') { /* données binaires : rare, ignoré */ }
        continue;
      }
      if (DEST_IGNOREES.has(mot)) {
        if (/^(header|footer)/.test(mot)) alertes.add('Les en-têtes et pieds de page ne sont pas affichés.');
        if (mot === 'footnote') alertes.add('Les notes de bas de page ne sont pas affichées.');
        dest = 'ignorer';
        continue;
      }
      switch (mot) {
        case 'ansicpg': codepage = param === 65001 ? 'utf-8' : `windows-${param}`; if (param === 10000) codepage = 'macintosh'; break;
        case 'mac': codepage = 'macintosh'; break;
        case 'fonttbl': dest = 'polices'; break;
        case 'colortbl': dest = 'couleurs'; couleurEnCours = null; break;
        case 'stylesheet': dest = 'styles'; break;
        case 'pict': dest = 'image'; image = { type: null, hex: '' }; break;
        case 'field': break;
        case 'fldrslt': dest = 'resultat'; break;
        case 'listtext': case 'pntext': dest = 'listtext'; texteListe = ''; break;
        case 'red': case 'green': case 'blue':
          if (dest === 'couleurs') { couleurEnCours = couleurEnCours || { red: 0, green: 0, blue: 0 }; couleurEnCours[mot] = param || 0; }
          break;
        case 'deff': policeDefaut = param; break;
        case 'f':
          if (dest === 'polices') police.num = param;
          // La police par défaut du document n'est pas répétée sur chaque mot.
          else car.police = param === policeDefaut ? null : polices[param] || null;
          break;
        case 's':
          if (dest === 'styles') style.num = param;
          else {
            const st = stylesheet[param];
            if (st) {
              const m = st.nom.toLowerCase().match(/^(?:heading|titre)\s*(\d)/);
              if (m) para.style = `h${Math.min(6, Number(m[1]))}`;
              else if (/quote|citation/.test(st.nom.toLowerCase())) para.style = 'blockquote';
            }
          }
          break;
        case 'outlinelevel':
          if (dest === 'styles') style.titre = param;
          else if (param >= 0 && param < 9) para.style = `h${Math.min(6, param + 1)}`;
          break;
        case 'fs': car.taille = param ? param / 2 : null; break;
        case 'b': car.gras = param !== 0; break;
        case 'i': car.italique = param !== 0; break;
        case 'ul': case 'uld': case 'uldb': case 'ulw': case 'ulth': case 'ulwave': case 'uldash': car.souligne = param !== 0; break;
        case 'ulnone': car.souligne = false; break;
        case 'strike': case 'striked': car.barre = param !== 0; break;
        case 'sub': car.indice = true; car.exposant = false; break;
        case 'super': case 'up': car.exposant = true; car.indice = false; break;
        case 'nosupersub': car.indice = false; car.exposant = false; break;
        case 'v': car.cache = param !== 0; break;
        case 'cf': car.couleur = param ? hexRtf(couleurs[param]) : null; break;
        case 'highlight': case 'cb': case 'chcbpat': car.fond = param ? hexRtf(couleurs[param]) : null; break;
        case 'plain': car = { ...parDefaut(), uc: car.uc }; break;
        case 'uc': car.uc = param ?? 1; break;
        case 'u': {
          const code = param < 0 ? param + 65536 : param;
          texteBrut('');
          ecrireTexte(String.fromCharCode(code));
          aSauter = car.uc;
          break;
        }
        case 'par': finParagraphe(); break;
        case 'sect': finParagraphe(); break;
        case 'line': texteBrut(''); if (dest === 'texte' || dest === 'resultat') courant += '<br>'; break;
        case 'tab': texteBrut(''); if (dest === 'listtext') texteListe += '\t'; else if (dest === 'texte' || dest === 'resultat') courant += '<span class="tab">\t</span>'; break;
        case 'page': texteBrut(''); if (courant) finParagraphe(); finTableau(); items.push({ html: '<hr class="saut-page">', liste: null }); break;
        case 'pagebb': items.push({ html: '<hr class="saut-page">', liste: null }); break;
        case 'emdash': texteBrut('—'); break;
        case 'endash': texteBrut('–'); break;
        case 'bullet': texteBrut('•'); break;
        case 'lquote': texteBrut('‘'); break;
        case 'rquote': texteBrut('’'); break;
        case 'ldblquote': texteBrut('“'); break;
        case 'rdblquote': texteBrut('”'); break;
        case 'emspace': case 'enspace': case 'qmspace': texteBrut(' '); break;
        case 'pard': para = paraDefaut(); break;
        case 'ql': para.align = null; break;
        case 'qc': para.align = 'center'; break;
        case 'qr': para.align = 'right'; break;
        case 'qj': case 'qd': para.align = 'justify'; break;
        case 'li': case 'lin': para.retrait = Unites.twipsEnPx(param || 0); break;
        case 'fi': para.premiere = Unites.twipsEnPx(param || 0); break;
        case 'ls': para.liste = { type: 'ul', niveau: para.niveau || 0, id: `ls${param}` }; break;
        case 'ilvl': para.niveau = param || 0; if (para.liste) para.liste.niveau = param || 0; break;
        case 'pnlvlbody': case 'pnlvlcont': break;
        case 'pndec': case 'pnlcltr': case 'pnucltr': case 'pnlcrm': case 'pnucrm': if (para.liste) para.liste.type = 'ol'; break;
        case 'intbl': para.dansTableau = true; if (!tableau) tableau = { lignes: [], ligne: [], cellule: '' }; break;
        case 'trowd': if (!tableau) tableau = { lignes: [], ligne: [], cellule: '' }; break;
        case 'itap': if (param > 1) alertes.add('Les tableaux dans des tableaux sont simplifiés.'); break;
        case 'cell': case 'nestcell':
          if (courant || !tableau?.cellule) { const dans = para.dansTableau; para.dansTableau = true; finParagraphe(); para.dansTableau = dans; }
          if (tableau) { tableau.ligne.push(tableau.cellule); tableau.cellule = ''; }
          break;
        case 'row': case 'nestrow':
          if (tableau) { if (tableau.ligne.length) tableau.lignes.push(tableau.ligne); tableau.ligne = []; }
          break;
        case 'paperw': pageL = param; break;
        case 'paperh': pageH = param; break;
        case 'margl': marges.gauche = param; break;
        case 'margr': marges.droite = param; break;
        case 'margt': marges.haut = param; break;
        case 'margb': marges.bas = param; break;
        case 'landscape': paysage = true; break;
        case 'cols': if (param > 1) alertes.add('La mise en colonnes est remplacée par une seule colonne.'); break;
        default: break;
      }
    }
    if (courant) finParagraphe();
    finTableau();

    const miseEnPage = structuredClone(Formats.MISE_EN_PAGE);
    if (pageL && pageH) Object.assign(miseEnPage, Formats.papierDe(Unites.pxEnCm(Unites.twipsEnPx(pageL)), Unites.pxEnCm(Unites.twipsEnPx(pageH))));
    if (paysage && miseEnPage.orientation !== 'paysage') miseEnPage.orientation = 'paysage';
    const cm = (tw) => Math.round(Unites.pxEnCm(Unites.twipsEnPx(tw)) * 100) / 100;
    miseEnPage.marges = { haut: marges.haut != null ? cm(marges.haut) : 2.5, bas: marges.bas != null ? cm(marges.bas) : 2.5, gauche: marges.gauche != null ? cm(marges.gauche) : 3.17, droite: marges.droite != null ? cm(marges.droite) : 3.17 };
    return { html: assemblerListes(items), miseEnPage, police: polices[policeDefaut] || null, alertes: [...alertes] };
  }
  // Variables de la mise en page (lues au fil du fichier).
  let pageL = null, pageH = null, paysage = false, marges = {}, couleurEnCours = null;
  const hexRtf = (c) => (c ? [c.red, c.green, c.blue].map((v) => (v || 0).toString(16).padStart(2, '0')).join('') : null);

  function lireAvecRemise(bytes, ctx) {
    pageL = null; pageH = null; paysage = false; marges = {}; couleurEnCours = null;
    return lire(bytes, ctx);
  }

  // ======================================================================
  // Enregistrer
  // ======================================================================
  async function ecrire(ctx) {
    const blocs = Formats.blocs(ctx.page);
    const alertes = new Set();
    const polices = [ctx.police || 'Calibri'];
    const couleurs = [];
    const largeurMax = Formats.largeurUtile(ctx.miseEnPage);
    const numPolice = (p) => { if (!p) return 0; let k = polices.indexOf(p); if (k < 0) { polices.push(p); k = polices.length - 1; } return k; };
    const numCouleur = (c) => { if (!c) return 0; let k = couleurs.indexOf(c); if (k < 0) { couleurs.push(c); k = couleurs.length - 1; } return k + 1; };
    const tailleBase = ctx.taille || 11;

    // Le texte : \, {, } protégés, les caractères hors ASCII en \uN? (N signé sur 16 bits).
    const echapper = (t) => {
      let s = '';
      for (const ch of t) {
        const c = ch.codePointAt(0);
        if (ch === '\\' || ch === '{' || ch === '}') s += `\\${ch}`;
        else if (ch === '\t') s += '\\tab ';
        else if (c < 128) s += ch;
        else if (c > 0xffff) {
          const u = c - 0x10000;
          s += `\\u${(0xd800 + (u >> 10)) - 65536}?\\u${(0xdc00 + (u & 0x3ff)) - 65536}?`;
        } else s += `\\u${c > 32767 ? c - 65536 : c}?`;
      }
      return s;
    };
    function car(f, base = {}) {
      const g = { ...base, ...f };
      let s = '';
      if (g.police) s += `\\f${numPolice(g.police)}`;
      if (g.taille) s += `\\fs${Math.round(g.taille * 2)}`;
      if (g.gras) s += '\\b';
      if (g.italique) s += '\\i';
      if (g.souligne) s += '\\ul';
      if (g.barre) s += '\\strike';
      if (g.indice) s += '\\sub';
      if (g.exposant) s += '\\super';
      if (g.couleur) s += `\\cf${numCouleur(g.couleur)}`;
      if (g.fond) s += `\\chcbpat${numCouleur(g.fond)}\\highlight${numCouleur(g.fond)}`;
      return s;
    }
    const TITRES = { h1: 20, h2: 16, h3: 14, h4: 12, h5: 11, h6: 11 };

    async function runs(liste, base) {
      let s = '';
      for (const r of liste) {
        if (r.t === 'br') { s += '\\line '; continue; }
        if (r.t === 'tab') { s += '\\tab '; continue; }
        let contenu = '';
        if (r.t === 'texte') { const c = car(r.f, base); contenu = c ? `{${c} ${echapper(r.texte)}}` : echapper(r.texte); }
        else if (r.t === 'media') contenu = await media(r);
        if (r.lien && r.t === 'texte') s += `{\\field{\\*\\fldinst{HYPERLINK "${echapper(r.lien.startsWith('#') ? r.lien.slice(1) : r.lien)}"${r.lien.startsWith('#') ? ' \\\\l' : ''}}}{\\fldrslt{\\ul\\cf${numCouleur('0563c1')}${contenu}}}}`;
        else s += contenu;
      }
      return s;
    }

    async function media(r) {
      if (r.type === 'image') {
        let img;
        try {
          img = await Medias.imagePourBureautique(r.src, { formats: ['png', 'jpeg'] });
        } catch (err) {
          alertes.add(`Une image n'a pas pu être lue (${r.nom}) : ${err.message}`);
          return '';
        }
        let w = r.largeur || img.largeur;
        if (w > largeurMax) w = largeurMax;
        const h = w * (img.hauteur / img.largeur);
        let hex = '';
        for (let k = 0; k < img.bytes.length; k++) {
          hex += img.bytes[k].toString(16).padStart(2, '0');
          if (k % 64 === 63) hex += '\n';
        }
        return `{\\pict\\${img.ext === 'png' ? 'pngblip' : 'jpegblip'}\\picw${img.largeur}\\pich${img.hauteur}\\picwgoal${Unites.pxEnTwips(w)}\\pichgoal${Unites.pxEnTwips(h)}\n${hex}}`;
      }
      let cible;
      try {
        cible = await Formats.cheminMedia(ctx, r);
      } catch (err) {
        alertes.add(`${r.nom} n'a pas pu être rangé à côté du document : ${err.message}`);
        return '';
      }
      alertes.add(`Le RTF ne garde pas les vidéos et les sons : ils sont rangés dans le dossier « ${ctx.dossierMedias} » et le document montre un lien vers eux.`);
      return `{\\field{\\*\\fldinst{HYPERLINK "${echapper(cible)}"}}{\\fldrslt{\\ul\\cf${numCouleur('0563c1')} ${echapper(`${r.type === 'video' ? '▶ Vidéo' : '♪ Son'} : ${r.nom}`)}}}}`;
    }

    // Les listes, comme Word les écrit : une définition par liste (\\listtable, \\listoverridetable),
    // et sur chaque paragraphe \\lsN\\ilvlK plus le texte de la puce (\\listtext) pour les logiciels
    // qui ne lisent pas les définitions.
    const listesRtf = new Map(); // id de liste → { n, type, debut }
    function tablesDeListes() {
      if (!listesRtf.size) return '';
      const puces = ['\\u8226 ?', '\\u9702 ?', '\\u9642 ?'];
      const nfc = [0, 4, 2]; // 1., a., i.
      const niveaux = (l) => Array.from({ length: 9 }, (_, k) => (l.type === 'ul'
        ? `{\\listlevel\\levelnfc23\\leveljc0\\levelfollow0\\levelstartat1{\\leveltext\\'01${puces[k % 3]};}{\\levelnumbers;}\\fi-360\\li${360 * (k + 2)}}`
        : `{\\listlevel\\levelnfc${nfc[k % 3]}\\leveljc0\\levelfollow0\\levelstartat${k ? 1 : l.debut}{\\leveltext\\'02\\'0${k}.;}{\\levelnumbers\\'01;}\\fi-360\\li${360 * (k + 2)}}`)).join('');
      const defs = [...listesRtf.values()].map((l) => `{\\list\\listtemplateid${l.n}${niveaux(l)}\\listid${l.n}}`).join('');
      const over = [...listesRtf.values()].map((l) => `{\\listoverride\\listid${l.n}\\listoverridecount0\\ls${l.n}}`).join('');
      return `{\\*\\listtable${defs}}\n{\\*\\listoverridetable${over}}\n`;
    }

    // Les numéros des listes numérotées (un compteur par liste et par niveau).
    const compteurs = new Map();
    const formatNumero = (n, niveau) => {
      const m = niveau % 3;
      if (m === 1) return `${String.fromCharCode(96 + ((n - 1) % 26) + 1)}.`;
      if (m === 2) return `${['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][(n - 1) % 10]}.`;
      return `${n}.`;
    };

    async function bloc(b) {
      if (b.type === 'saut') return '\\page\n';
      if (b.type === 'ligne') return '\\pard\\plain\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\n';
      if (b.type === 'table') return table(b);
      let s = '\\pard\\plain';
      const base = {};
      if (/^h\d$/.test(b.style)) { s += `\\outlinelevel${Number(b.style[1]) - 1}`; base.gras = true; base.taille = TITRES[b.style]; base.couleur = b.style === 'h1' ? '1f3864' : '2f5496'; s += '\\sb240\\sa120\\keepn'; } else s += '\\sa160';
      if (b.style === 'citation') { s += '\\li567\\ri567'; base.italique = true; base.couleur = '595959'; }
      if (b.style === 'code') { base.police = 'Consolas'; base.taille = 10; s += '\\sa0'; }
      if (b.align) s += { left: '\\ql', center: '\\qc', right: '\\qr', justify: '\\qj' }[b.align] || '';
      let prefixe = '';
      if (b.liste) {
        const retrait = Unites.pxEnTwips(24 * (b.liste.niveau + 1) + (b.retrait || 0));
        s += `\\li${retrait}${b.liste.suite ? '' : '\\fi-360'}`;
        if (!b.liste.suite) {
          if (!listesRtf.has(b.liste.id)) listesRtf.set(b.liste.id, { n: listesRtf.size + 1, type: b.liste.type, debut: b.liste.debut || 1 });
          s += `\\ls${listesRtf.get(b.liste.id).n}\\ilvl${Math.min(8, b.liste.niveau)}`;
          if (b.liste.type === 'ol') {
            const cle = `${b.liste.id}:${b.liste.niveau}`;
            const n2 = (compteurs.get(cle) ?? ((b.liste.debut || 1) - 1)) + 1;
            compteurs.set(cle, n2);
            // Un retour au niveau du dessus remet les sous-niveaux à zéro.
            for (const k of [...compteurs.keys()]) if (k.startsWith(`${b.liste.id}:`) && Number(k.split(':')[1]) > b.liste.niveau) compteurs.delete(k);
            prefixe = `{\\listtext ${formatNumero(n2, b.liste.niveau)}\\tab}`;
          } else prefixe = `{\\listtext ${['\\u8226?', '\\u9702?', '\\u9642?'][b.liste.niveau % 3]}\\tab}`;
        }
      } else if (b.retrait) s += `\\li${Unites.pxEnTwips(b.retrait)}`;
      return `${s} ${prefixe}${await runs(b.runs, base)}\\par\n`;
    }

    async function table(t) {
      const { cases, colonnes } = Formats.grille(t);
      const larg = Unites.pxEnTwips(largeurMax) / colonnes;
      let s = '';
      for (let r = 0; r < cases.length; r++) {
        s += '\\trowd\\trgaph108\\trleft0';
        for (let c = 0; c < colonnes; c++) {
          const k = cases[r][c];
          if (k && !k.colDebut) continue;
          if (k?.cellule.fond) s += `\\clcbpat${numCouleur(k.cellule.fond)}`;
          if (k && k.cellule.rowspan > 1) s += k.ligneDebut ? '\\clvmgf' : '\\clvmrg';
          s += '\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10';
          s += `\\cellx${Math.round(larg * (c + (k ? k.cellule.colspan : 1)))}`;
        }
        s += '\n';
        for (let c = 0; c < colonnes; c++) {
          const k = cases[r][c];
          if (k && !k.colDebut) continue;
          let contenu = '';
          if (k && k.ligneDebut) {
            const parties = [];
            for (const b of k.cellule.blocs) if (b.type === 'p') parties.push(await runs(b.runs, k.cellule.entete ? { gras: true } : {}));
            contenu = parties.join('\\par ');
          }
          s += `\\pard\\intbl ${contenu}\\cell\n`;
        }
        s += '\\row\n';
      }
      return `${s}\\pard\n`;
    }

    let corps = '';
    for (const b of blocs) corps += await bloc(b);
    const mp = ctx.miseEnPage || Formats.MISE_EN_PAGE;
    const { largeur, hauteur } = Formats.dimensions(mp);
    const tw = (cm) => Unites.pxEnTwips(Unites.cmEnPx(cm));
    const entete = `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n{\\fonttbl${polices.map((p, k) => `{\\f${k}\\fnil ${echapper(p)};}`).join('')}}\n`
      + `{\\colortbl;${couleurs.map((c) => `\\red${parseInt(c.slice(0, 2), 16)}\\green${parseInt(c.slice(2, 4), 16)}\\blue${parseInt(c.slice(4, 6), 16)};`).join('')}}\n`
      + tablesDeListes()
      + `{\\*\\generator Edda;}\\paperw${tw(largeur)}\\paperh${tw(hauteur)}\\margl${tw(mp.marges.gauche)}\\margr${tw(mp.marges.droite)}\\margt${tw(mp.marges.haut)}\\margb${tw(mp.marges.bas)}${mp.orientation === 'paysage' ? '\\landscape' : ''}\n`
      + `\\deflang1036\\plain\\f0\\fs${Math.round(tailleBase * 2)}\n`;
    // Les polices et couleurs sont connues seulement après le corps : l'en-tête est fait à la fin.
    return { bytes: encoderTexte(`${entete}${corps}}`), alertes: [...alertes] };
  }

  Formats.ajouter('rtf', { nom: 'Texte enrichi (RTF)', extensions: ['rtf'], lire: lireAvecRemise, ecrire, garde: 'tout' });
})();
