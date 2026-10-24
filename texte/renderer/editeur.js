// L'édition dans la page : la mise en forme (ruban, raccourcis), le collage, les tableaux, les liens,
// les sauts de page, et l'état des boutons du ruban selon l'endroit où est le curseur.
//
// La page est un élément « contenteditable » : c'est Chromium qui gère la frappe, la sélection et
// l'annulation (Ctrl+Z). Pour que tout reste annulable, chaque changement passe par
// document.execCommand (insertHTML, bold, formatBlock…), jamais par une modification directe du HTML.

const Editeur = (() => {
  let doc = null; // le document actif (voir app.js)
  let selection = null; // la dernière sélection dans la page (gardée quand on clique dans le ruban)
  const ecouteurs = { change: [], selection: [] };

  const page = () => doc?.page || null;
  const dansPage = (n) => Boolean(page() && n && (n === page() || page().contains(n)));

  // --- Sélection ---
  function memoriser() {
    const s = window.getSelection();
    if (s.rangeCount && dansPage(s.anchorNode)) selection = s.getRangeAt(0).cloneRange();
  }
  // Remet la sélection (perdue en cliquant dans le ruban ou une fenêtre) et donne le focus à la page.
  function restaurer() {
    const p = page();
    if (!p) return false;
    const s = window.getSelection();
    // Le curseur est déjà dans la page (on y écrit) : c'est lui qui compte, pas le souvenir, qui peut
    // avoir une frappe de retard (selectionchange arrive après les touches).
    if (document.activeElement === p && s.rangeCount && dansPage(s.anchorNode)) {
      selection = s.getRangeAt(0).cloneRange();
      return true;
    }
    p.focus({ preventScroll: true });
    if (selection && dansPage(selection.startContainer)) {
      s.removeAllRanges();
      s.addRange(selection);
    } else if (!s.rangeCount || !dansPage(s.anchorNode)) {
      const r = document.createRange();
      r.selectNodeContents(p);
      r.collapse(false);
      s.removeAllRanges();
      s.addRange(r);
    }
    return true;
  }
  document.addEventListener('selectionchange', () => {
    if (!doc) return;
    const s = window.getSelection();
    if (s.rangeCount && dansPage(s.anchorNode)) {
      selection = s.getRangeAt(0).cloneRange();
      planifier();
    }
  });
  let rafEtat = 0;
  function planifier() {
    cancelAnimationFrame(rafEtat);
    rafEtat = requestAnimationFrame(() => ecouteurs.selection.forEach((f) => f(etat())));
  }

  function exec(cmd, valeur = null) {
    if (!restaurer()) return false;
    document.execCommand('styleWithCSS', false, !['bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript'].includes(cmd));
    const ok = document.execCommand(cmd, false, valeur);
    memoriser();
    planifier();
    return ok;
  }

  // Le bloc (paragraphe, titre…) où est le curseur.
  function blocCourant() {
    const s = window.getSelection();
    let n = s.rangeCount ? s.anchorNode : null;
    if (!dansPage(n)) n = selection?.startContainer;
    while (n && n !== page()) {
      if (n.nodeType === 1 && /^(P|H[1-6]|BLOCKQUOTE|PRE|LI|DIV|TD|TH)$/.test(n.tagName)) return n;
      n = n.parentNode;
    }
    return null;
  }
  const ancetre = (n, sel) => {
    while (n && n !== page()) { if (n.nodeType === 1 && n.matches(sel)) return n; n = n.parentNode; }
    return null;
  };

  // --- Les commandes du ruban et des menus ---
  const commandes = {
    undo: () => exec('undo'),
    redo: () => exec('redo'),
    bold: () => exec('bold'),
    italic: () => exec('italic'),
    underline: () => exec('underline'),
    strikeThrough: () => exec('strikeThrough'),
    subscript: () => exec('subscript'),
    superscript: () => exec('superscript'),
    justifyLeft: () => exec('justifyLeft'),
    justifyCenter: () => exec('justifyCenter'),
    justifyRight: () => exec('justifyRight'),
    justifyFull: () => exec('justifyFull'),
    insertUnorderedList: () => exec('insertUnorderedList'),
    insertOrderedList: () => exec('insertOrderedList'),
    indent: () => exec('indent'),
    outdent: () => exec('outdent'),
    removeFormat: () => { exec('removeFormat'); exec('unlink'); },
    // Style du paragraphe : p, h1…h6, blockquote, pre
    style: (bloc) => {
      // Une citation se retire en repassant en texte normal.
      const actuel = blocCourant();
      if (bloc === 'p' && ancetre(actuel, 'blockquote')) exec('formatBlock', 'p');
      exec('formatBlock', bloc);
    },
    police: (nom) => { if (nom) exec('fontName', nom); },
    // Taille en points. execCommand ne connaît que 7 tailles : on pose la plus grande, puis on la
    // remplace par la vraie taille (le tout s'annule d'un coup avec Ctrl+Z).
    taille: (pt) => {
      const t = Number(String(pt).replace(',', '.'));
      if (!t || t < 1 || t > 400) return;
      if (!exec('fontSize', '7')) return;
      for (const n of page().querySelectorAll('span[style*="xxx-large"], font[size="7"]')) {
        if (n.tagName === 'FONT') { n.removeAttribute('size'); n.style.fontSize = `${t}pt`; } else n.style.fontSize = `${t}pt`;
      }
      memoriser();
      changement();
    },
    plusGrand: () => commandes.taille(tailleSuivante(etat().taille, 1)),
    plusPetit: () => commandes.taille(tailleSuivante(etat().taille, -1)),
    couleur: (hex) => exec('foreColor', hex ? `#${hex}` : 'inherit'),
    surligner: (hex) => exec('hiliteColor', hex ? `#${hex}` : 'transparent'),
    saut: () => inserer('<hr class="saut-page"><p><br></p>'),
    ligne: () => inserer('<hr><p><br></p>'),
  };
  const TAILLES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
  function tailleSuivante(t, sens) {
    const v = Number(t) || 11;
    if (sens > 0) return TAILLES.find((x) => x > v) || v + 12;
    return [...TAILLES].reverse().find((x) => x < v) || Math.max(1, v - 1);
  }

  // Insérer du HTML là où est le curseur (nettoyé d'abord). Annulable avec Ctrl+Z.
  function inserer(html, { nettoyer = true } = {}) {
    if (!restaurer()) return false;
    const propre = nettoyer ? Nettoyage.html(html, { racine: doc?.dossierUrl }) : html;
    document.execCommand('insertHTML', false, propre);
    memoriser();
    changement();
    return true;
  }
  // Remplacer un élément de la page (un tableau, un média) par du HTML, en restant annulable.
  function remplacerNoeud(noeud, html) {
    if (!dansPage(noeud)) return;
    page().focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNode(noeud);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.execCommand('insertHTML', false, html);
    memoriser();
    changement();
  }
  // Remplacer tout le contenu de la page (Claude, « ecrire_document »). Annulable avec Ctrl+Z.
  function remplacerTout(html) {
    const p = page();
    if (!p) return;
    p.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(p);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    const propre = Nettoyage.html(html, { racine: doc?.dossierUrl });
    if (propre.trim()) document.execCommand('insertHTML', false, propre);
    else document.execCommand('delete');
    if (!p.firstElementChild) p.innerHTML = '<p><br></p>';
    memoriser();
    changement();
  }

  // --- État du ruban à l'endroit du curseur ---
  function etat() {
    const p = page();
    if (!p) return {};
    const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
    const bloc = blocCourant();
    let style = 'p';
    for (let n = bloc; n && n !== p; n = n.parentNode) {
      if (/^H[1-6]$/.test(n.tagName)) { style = n.tagName.toLowerCase(); break; }
      if (n.tagName === 'PRE') { style = 'pre'; break; }
      if (n.tagName === 'BLOCKQUOTE' && !n.getAttribute('style')) { style = 'blockquote'; break; }
    }
    // Police et taille : celles calculées par Chromium au début de la sélection.
    let n = selection?.startContainer;
    if (n?.nodeType === 3) n = n.parentNode;
    if (n?.nodeType === 1 && n === p && selection.startOffset < p.childNodes.length) n = p.childNodes[selection.startOffset].nodeType === 1 ? p.childNodes[selection.startOffset] : p;
    const cs = n && dansPage(n) ? getComputedStyle(n) : null;
    const police = cs ? cs.fontFamily.split(',')[0].replace(/["']/g, '').trim() : '';
    const taille = cs ? Math.round(Unites.pxEnPt(parseFloat(cs.fontSize)) * 2) / 2 : '';
    const align = cs ? getComputedStyle(bloc || p).textAlign : 'left';
    return {
      bold: q('bold'), italic: q('italic'), underline: q('underline'), strikeThrough: q('strikeThrough'),
      subscript: q('subscript'), superscript: q('superscript'),
      insertUnorderedList: q('insertUnorderedList'), insertOrderedList: q('insertOrderedList'),
      justifyLeft: align === 'left' || align === 'start', justifyCenter: align === 'center', justifyRight: align === 'right' || align === 'end', justifyFull: align === 'justify',
      style, police, taille,
      dansTableau: Boolean(ancetre(n, 'td, th')),
      lien: ancetre(n, 'a[href]'),
    };
  }

  // --- Tableaux ---
  function insererTableau(lignes, colonnes) {
    const cellule = '<td><br></td>'.repeat(colonnes);
    const html = `<table><tbody>${`<tr>${cellule}</tr>`.repeat(lignes)}</tbody></table><p><br></p>`;
    if (!inserer(html)) return;
    // Le curseur dans la première case (il est sur la ligne vide qui suit le tableau).
    const s = window.getSelection();
    let n = s.anchorNode;
    while (n && n.parentNode !== page()) n = n.parentNode;
    const table = n?.previousElementSibling?.tagName === 'TABLE' ? n.previousElementSibling : null;
    const premiere = table?.querySelector('td, th');
    if (!premiere) return;
    const r = document.createRange();
    r.selectNodeContents(premiere);
    r.collapse(true);
    s.removeAllRanges();
    s.addRange(r);
    memoriser();
  }
  // Ajouter, retirer une ligne ou une colonne : le tableau est refait, puis remplacé (annulable).
  function modifierTableau(action) {
    const cellule = ancetre(selection?.startContainer, 'td, th');
    const table = ancetre(cellule, 'table');
    if (!table) return;
    const copie = table.cloneNode(true);
    const ligneIndex = cellule.parentNode.rowIndex;
    const colIndex = cellule.cellIndex;
    const rows = [...copie.rows];
    const nouvelleCellule = (tag = 'td') => Object.assign(document.createElement(tag), { innerHTML: '<br>' });
    switch (action) {
      case 'ligneAvant': case 'ligneApres': {
        const modele = rows[ligneIndex];
        const tr = document.createElement('tr');
        for (const c of modele.cells) { const n = nouvelleCellule('td'); if (c.colSpan > 1) n.colSpan = c.colSpan; tr.append(n); }
        modele[action === 'ligneAvant' ? 'before' : 'after'](tr);
        break;
      }
      case 'colonneAvant': case 'colonneApres':
        for (const tr of rows) {
          const c = tr.cells[Math.min(colIndex, tr.cells.length - 1)];
          if (c) c[action === 'colonneAvant' ? 'before' : 'after'](nouvelleCellule(c.tagName.toLowerCase()));
          else tr.append(nouvelleCellule());
        }
        break;
      case 'supprimerLigne':
        if (rows.length <= 1) return remplacerNoeud(table, '<p><br></p>');
        rows[ligneIndex].remove();
        break;
      case 'supprimerColonne':
        if (Math.max(...rows.map((r) => r.cells.length)) <= 1) return remplacerNoeud(table, '<p><br></p>');
        for (const tr of rows) tr.cells[Math.min(colIndex, tr.cells.length - 1)]?.remove();
        break;
      case 'supprimerTableau':
        return remplacerNoeud(table, '<p><br></p>');
      case 'entete': {
        const premiere = rows[0];
        const enTete = [...premiere.cells].every((c) => c.tagName === 'TH');
        for (const c of [...premiere.cells]) {
          const n = document.createElement(enTete ? 'td' : 'th');
          for (const a of c.attributes) n.setAttribute(a.name, a.value);
          n.append(...c.childNodes);
          c.replaceWith(n);
        }
        break;
      }
      default: return;
    }
    remplacerNoeud(table, copie.outerHTML);
  }
  function fondCellule(hex) {
    const cellule = ancetre(selection?.startContainer, 'td, th');
    if (!cellule) return;
    const table = ancetre(cellule, 'table');
    const copie = table.cloneNode(true);
    const c = copie.rows[cellule.parentNode.rowIndex].cells[cellule.cellIndex];
    c.style.backgroundColor = hex ? `#${hex}` : '';
    if (!c.getAttribute('style')) c.removeAttribute('style');
    remplacerNoeud(table, copie.outerHTML);
  }

  // --- Liens ---
  async function lien() {
    const e = etat();
    const existant = e.lien;
    const texteSel = selection && !selection.collapsed ? selection.toString() : (existant?.textContent || '');
    const v = await Dialogs.form({
      title: existant ? 'Modifier le lien' : 'Insérer un lien',
      okLabel: existant ? 'Enregistrer' : 'Insérer',
      fields: [
        { key: 'url', label: 'Adresse', type: 'text', value: existant?.getAttribute('href') || 'https://', placeholder: 'https://… ou mailto:…' },
        { key: 'texte', label: 'Texte affiché', type: 'text', value: texteSel },
      ],
      buttons: existant ? [{ label: 'Retirer le lien', run: () => { Dialogs.close(null); restaurer(); selectionner(existant); exec('unlink'); } }] : [],
    });
    if (!v || !v.url.trim() || v.url.trim() === 'https://') return;
    let url = v.url.trim();
    if (!/^(https?:|mailto:|#|file:)/i.test(url)) url = /@/.test(url) && !/\//.test(url) ? `mailto:${url}` : `https://${url}`;
    if (existant) {
      selectionner(existant);
      inserer(`<a href="${escapeHtml(url)}">${escapeHtml(v.texte || url)}</a>`);
    } else if (selection && !selection.collapsed && v.texte === texteSel) {
      exec('createLink', url);
    } else inserer(`<a href="${escapeHtml(url)}">${escapeHtml(v.texte || url)}</a>&nbsp;`);
  }
  function selectionner(noeud) {
    const r = document.createRange();
    r.selectNodeContents(noeud);
    selection = r;
    restaurer();
  }

  // --- Mise en page (format, orientation, marges) ---
  function appliquerMiseEnPage(d) {
    const mp = d.miseEnPage || Formats.MISE_EN_PAGE;
    const { largeur, hauteur } = Formats.dimensions(mp);
    const s = d.page.style;
    s.setProperty('--page-l', `${largeur}cm`);
    s.setProperty('--page-h', `${hauteur}cm`);
    s.setProperty('--marge-h', `${mp.marges.haut}cm`);
    s.setProperty('--marge-b', `${mp.marges.bas}cm`);
    s.setProperty('--marge-g', `${mp.marges.gauche}cm`);
    s.setProperty('--marge-d', `${mp.marges.droite}cm`);
    s.setProperty('--police-doc', /\s/.test(d.police) ? `'${d.police}'` : d.police);
    s.setProperty('--taille-doc', `${d.taille}pt`);
  }

  // --- La page d'un document ---
  function creerPage(d) {
    const p = el('div', { className: 'feuille', contentEditable: 'true', spellcheck: true });
    p.setAttribute('role', 'textbox');
    p.setAttribute('aria-multiline', 'true');
    p.addEventListener('input', () => { changement(); verifierVide(p); });
    p.addEventListener('paste', coller);
    p.addEventListener('keydown', clavier);
    p.addEventListener('focus', () => document.execCommand('defaultParagraphSeparator', false, 'p'));
    // Un lien s'ouvre avec Ctrl+clic (comme dans Word) ; un clic simple place le curseur.
    p.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href]');
      if (a && (e.ctrlKey || e.metaKey) && dansPage(a)) {
        e.preventDefault();
        const href = a.getAttribute('href');
        if (href.startsWith('#')) page().querySelector(`[id="${CSS.escape(href.slice(1))}"], a[name="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ block: 'center' });
        else window.edda.ouvrirLien(href).catch((err) => notify(cleanError(err), 'error'));
      }
    });
    // Les vidéos et les sons sont des « îlots » : on peut cliquer leurs boutons lecture/pause.
    new MutationObserver(() => { for (const m of p.querySelectorAll('video:not([contenteditable]), audio:not([contenteditable])')) m.setAttribute('contenteditable', 'false'); })
      .observe(p, { childList: true, subtree: true });
    d.page = p;
    appliquerMiseEnPage(d);
    return p;
  }
  // « Commence à écrire… » sur une page vide.
  function verifierVide(p) {
    p.classList.toggle('vide-demarrage', !p.textContent.trim() && !p.querySelector('img, video, audio, table, hr'));
  }

  function changement() {
    if (!doc) return;
    ecouteurs.change.forEach((f) => f(doc));
  }

  // --- Coller ---
  async function coller(e) {
    const cd = e.clipboardData;
    if (!cd) return;
    const fichiers = [...cd.files].filter((f) => /^image\//.test(f.type));
    const html = cd.getData('text/html');
    if (fichiers.length && !html) {
      // Une capture d'écran, une image copiée : elle entre dans la page (gardée dans le document).
      e.preventDefault();
      for (const f of fichiers) {
        const url = Medias.dataUrl(new Uint8Array(await f.arrayBuffer()), f.type);
        inserer(Formats.htmlMedia('image', url, null, f.name && f.name !== 'image.png' ? f.name : null));
      }
      return;
    }
    if (html) {
      e.preventDefault();
      // Le HTML de Word, d'un site ou d'un autre document : nettoyé (pas de scripts, pas de styles
      // qui casseraient la page), mais la mise en forme du texte reste.
      const corps = html.replace(/^[\s\S]*?<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, '');
      inserer(corps);
    }
    // Sinon (texte simple) : Chromium colle lui-même.
  }

  // --- Clavier dans la page ---
  function clavier(e) {
    const s = window.getSelection();
    const n = s.anchorNode;
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      const cellule = ancetre(n, 'td, th');
      if (cellule) {
        e.preventDefault();
        const toutes = [...ancetre(cellule, 'table').querySelectorAll('td, th')];
        const i = toutes.indexOf(cellule) + (e.shiftKey ? -1 : 1);
        if (i >= toutes.length) {
          // Tab dans la dernière case : une nouvelle ligne, et le curseur dans sa première case.
          const table = ancetre(cellule, 'table');
          const rang = [...page().querySelectorAll('table')].indexOf(table);
          const ligne = cellule.parentNode.rowIndex;
          modifierTableau('ligneApres');
          const nouvelle = page().querySelectorAll('table')[rang]?.rows[ligne + 1]?.cells[0];
          if (nouvelle) { const r = document.createRange(); r.selectNodeContents(nouvelle); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
          return;
        }
        if (i >= 0) { const r = document.createRange(); r.selectNodeContents(toutes[i]); s.removeAllRanges(); s.addRange(r); }
        return;
      }
      if (ancetre(n, 'li')) { e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); return; }
      if (!e.shiftKey) { e.preventDefault(); inserer('<span class="tab">\t</span>', { nettoyer: false }); }
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); commandes.saut(); return; }
    // Entrée à la fin d'un titre : la ligne suivante est du texte normal (comme dans Word).
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      const titre = ancetre(n, 'h1, h2, h3, h4, h5, h6');
      if (titre) {
        const r = s.getRangeAt(0).cloneRange();
        r.setEndAfter(titre);
        if (!r.toString().trim()) {
          e.preventDefault();
          document.execCommand('insertParagraph');
          const b = blocCourant();
          if (b && /^H[1-6]$/.test(b.tagName)) document.execCommand('formatBlock', false, 'p');
          memoriser();
          changement();
        }
      }
    }
  }

  return {
    activer(d) { doc = d; selection = null; planifier(); },
    page,
    doc: () => doc,
    commandes,
    exec,
    inserer,
    remplacerNoeud,
    remplacerTout,
    restaurer,
    memoriser,
    etat,
    blocCourant,
    insererTableau,
    modifierTableau,
    fondCellule,
    lien,
    creerPage,
    appliquerMiseEnPage,
    verifierVide,
    TAILLES,
    selection: () => selection,
    surChangement: (f) => ecouteurs.change.push(f),
    surSelection: (f) => ecouteurs.selection.push(f),
  };
})();
