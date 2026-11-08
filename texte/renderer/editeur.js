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
    style: (id) => {
      // Un style créé (data-style) : sa balise (p, h1…h4), puis la marque sur les paragraphes choisis.
      const perso = /^perso\d+$/.test(id) ? StylesDoc.get(doc, id) : null;
      const bloc = perso ? perso.balise : id;
      // Une citation se retire en repassant en texte normal.
      const actuel = blocCourant();
      if (bloc === 'p' && ancetre(actuel, 'blockquote:not([data-bloc])')) exec('formatBlock', 'p');
      exec('formatBlock', bloc);
      marquerStyle(perso ? perso.id : null);
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
    repere: () => basculerRepere(),
    blocDeroulant: () => basculerBloc(),
    ligne: () => inserer('<hr><p><br></p>'),
  };
  // --- Sélection multiple (Ctrl+glisser, Ctrl+double-clic, comme dans Word) ---
  //
  // Chromium ne garde qu'une sélection à la fois. Edda garde donc elle-même les plages déjà choisies
  // (« plages ») et les surligne avec l'API CSS Custom Highlight (rien n'est ajouté dans la page).
  // La sélection en cours (celle de Chromium) est la dernière plage.
  //
  // Une mise en forme sur toutes les plages se fait plage par plage avec execCommand, ce qui donnerait
  // une étape de Ctrl+Z par plage. Pour n'en garder qu'une : on note le HTML obtenu, on défait ces
  // étapes, puis on remplace d'un coup la partie de la page concernée par ce HTML (un seul insertHTML).
  // Si quelque chose ne colle pas (le HTML n'est pas exactement celui attendu), on garde les étapes
  // séparées : c'est moins pratique, mais rien n'est perdu.
  let plages = []; // Range[] : les plages ajoutées avec Ctrl, sans la sélection en cours
  let interne = false; // vrai pendant qu'Edda applique une commande sur les plages
  const surlignable = typeof Highlight !== 'undefined' && CSS.highlights;
  function dessinerPlages() {
    if (!surlignable) return;
    plages = plages.filter((r) => !r.collapsed && dansPage(r.startContainer));
    if (plages.length) CSS.highlights.set('edda-plages', new Highlight(...plages));
    else CSS.highlights.delete('edda-plages');
  }
  function viderPlages() {
    if (!plages.length) return;
    plages = [];
    dessinerPlages();
  }
  const avantPoint = (n1, o1, n2, o2) => { const r = document.createRange(); r.setStart(n1, o1); return r.comparePoint(n2, o2) > 0; };
  const sechevauchent = (a, b) => avantPoint(a.startContainer, a.startOffset, b.endContainer, b.endOffset)
    && avantPoint(b.startContainer, b.startOffset, a.endContainer, a.endOffset);
  function ajouterPlage(r) {
    plages = plages.filter((x) => !sechevauchent(x, r));
    plages.push(r);
    dessinerPlages();
  }
  // Toutes les plages, sélection en cours comprise, dans l'ordre de la page. Une plage refaite par-dessus
  // une autre la remplace (comme dans Word, on ne peut pas choisir deux fois le même texte).
  function toutesPlages() {
    const s = window.getSelection();
    const active = s.rangeCount && !s.isCollapsed && dansPage(s.anchorNode) ? s.getRangeAt(0).cloneRange()
      : (selection && !selection.collapsed && dansPage(selection.startContainer) ? selection.cloneRange() : null);
    const liste = plages.filter((r) => !r.collapsed && dansPage(r.startContainer) && !(active && sechevauchent(r, active)));
    if (active) liste.push(active);
    return liste.sort((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b));
  }
  const multiple = () => plages.length > 0 && toutesPlages().length > 1;

  // Positions dans le texte de la page (en caractères) : elles ne bougent pas quand on met en forme,
  // alors que les nœuds, eux, sont souvent refaits par Chromium.
  function positionTexte(n, o) {
    const r = document.createRange();
    r.setStart(page(), 0);
    r.setEnd(n, o);
    return r.toString().length;
  }
  function pointTexte(i, fin) {
    const w = document.createTreeWalker(page(), NodeFilter.SHOW_TEXT);
    let vu = 0;
    let dernier = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const l = n.nodeValue.length;
      // Une fin qui tombe au tout début d'un nœud reste à la fin du précédent ; un début, au début du suivant.
      if (fin ? i <= vu + l && (l || i === vu) : i < vu + l) return { n, o: i - vu };
      vu += l;
      dernier = n;
    }
    return dernier ? { n: dernier, o: dernier.nodeValue.length } : { n: page(), o: page().childNodes.length };
  }
  function rangeTexte([a, b]) {
    const d = pointTexte(a, false), f = pointTexte(b, true);
    const r = document.createRange();
    r.setStart(d.n, d.o);
    r.setEnd(f.n, f.o);
    return r;
  }
  // L'enfant direct de la page qui contient un point.
  function indexHaut(n, o, fin) {
    const p = page();
    if (n === p) return Math.max(0, Math.min(p.childNodes.length - 1, fin ? o - 1 : o));
    while (n.parentNode !== p) n = n.parentNode;
    return [...p.childNodes].indexOf(n);
  }

  // Appliquer une action sur chaque plage. `faire(i)` agit sur la sélection, posée sur la plage i.
  function surPlages(faire, { effacer = false, liste = toutesPlages() } = {}) {
    const p = page();
    const positions = liste.map((r) => [positionTexte(r.startContainer, r.startOffset), positionTexte(r.endContainer, r.endOffset)]);
    const premier = liste[0], dernier = liste[liste.length - 1];
    const debut = indexHaut(premier.startContainer, premier.startOffset, false);
    const resteFin = p.childNodes.length - 1 - indexHaut(dernier.endContainer, dernier.endOffset, true);
    const avant = p.innerHTML;
    p.focus({ preventScroll: true });
    const s = window.getSelection();
    let pas = 0;
    const compter = (e) => { if (!/^history/.test(e.inputType)) pas++; };
    const poser = (k) => { s.removeAllRanges(); s.addRange(rangeTexte(positions[k])); memoriser(); };
    interne = true;
    p.addEventListener('input', compter, true);
    try {
      // Effacer : de la fin vers le début, pour que les positions des plages d'avant restent justes.
      const ordre = positions.map((_, k) => k);
      if (effacer) ordre.reverse();
      for (const k of ordre) { poser(k); faire(k); }
      const apres = p.innerHTML;
      if (pas > 1) {
        for (let k = 0; k < pas; k++) document.execCommand('undo');
        if (p.innerHTML !== avant) {
          for (let k = 0; k < pas; k++) document.execCommand('redo');
        } else {
          const t = document.createElement('template');
          t.innerHTML = apres;
          const n = t.content.childNodes.length;
          const boite = document.createElement('div');
          for (const x of [...t.content.childNodes].slice(debut, n - resteFin)) boite.append(x);
          // Comme pour insererA : une « sentinelle » (paragraphe vide) juste avant la zone, pour que le HTML
          // remis ne se mêle pas à un titre ou à une liste. La zone finit à l'intérieur de son dernier bloc :
          // finir juste après lui ferait commencer Chromium dans le bloc suivant.
          const dernierBloc = p.childNodes[p.childNodes.length - 1 - resteFin];
          const sentinelle = document.createElement('p');
          sentinelle.dataset.sentinelle = '';
          sentinelle.innerHTML = '<br>';
          p.insertBefore(sentinelle, p.childNodes[debut]);
          const zone = document.createRange();
          zone.setStart(sentinelle, 0);
          if (dernierBloc.nodeType === 3) zone.setEnd(dernierBloc, dernierBloc.nodeValue.length);
          else zone.setEnd(dernierBloc, dernierBloc.childNodes.length);
          s.removeAllRanges();
          s.addRange(zone);
          document.execCommand('insertHTML', false, boite.innerHTML);
          if (p.innerHTML !== apres) {
            // Chromium a retouché le HTML en le remettant : on revient en arrière et on refait plage par plage.
            document.execCommand('undo');
            sentinelle.remove();
            if (p.innerHTML === avant) for (const k of ordre) { poser(k); faire(k); }
          }
        }
      }
    } finally {
      p.removeEventListener('input', compter, true);
      interne = false;
    }
    if (effacer) {
      viderPlages();
    } else {
      // Les plages restent choisies (on peut enchaîner gras, puis couleur…), la dernière reste la sélection.
      const r = positions.map(rangeTexte);
      s.removeAllRanges();
      s.addRange(r.pop());
      plages = r;
      dessinerPlages();
    }
    memoriser();
    planifier();
    changement();
    return true;
  }

  // Les commandes qui s'appliquent à toutes les plages. Pour gras, italique… comme dans Word : si
  // toutes les plages le sont déjà, on l'enlève partout ; sinon on le met partout.
  const BASCULES = ['bold', 'italic', 'underline', 'strikeThrough', 'subscript', 'superscript'];
  const SUR_PLAGES = [...BASCULES, 'removeFormat', 'police', 'taille', 'plusGrand', 'plusPetit', 'couleur', 'surligner',
    'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'style'];
  for (const nom of SUR_PLAGES) {
    const simple = commandes[nom];
    commandes[nom] = (...args) => {
      if (interne || !multiple()) return simple(...args);
      if (!BASCULES.includes(nom)) return surPlages(() => simple(...args));
      const liste = toutesPlages();
      const etats = liste.map((r) => {
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        try { return document.queryCommandState(nom); } catch { return false; }
      });
      const voulu = !etats.every(Boolean);

      return surPlages((k) => { if (etats[k] !== voulu) simple(...args); }, { liste });
    };
  }
  const effacerPlages = () => surPlages(() => document.execCommand('delete'), { effacer: true });
  // Copier : les textes des plages, l'un sous l'autre.
  function copierPlages(e) {
    if (!multiple()) return false;
    const liste = toutesPlages();
    const html = liste.map((r) => { const d = document.createElement('div'); d.append(r.cloneContents()); return d.innerHTML; });
    e.clipboardData.setData('text/plain', liste.map((r) => r.toString()).join('\n'));
    e.clipboardData.setData('text/html', html.join('<br>'));
    e.preventDefault();
    return true;
  }

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
  // Écrire un morceau de HTML au début ou à la fin de la page, ou à la place de tout son contenu
  // (Claude : inserer, ecrire_document). Annulable avec Ctrl+Z, en une seule fois.
  //
  // Chromium mêle le HTML inséré au paragraphe où commence la sélection : inséré dans un titre ou une
  // liste, tout le contenu finirait dans ce titre ou cette liste. On pose donc d'abord un paragraphe
  // vide (une « sentinelle ») là où écrire, et l'insertion commence dedans. Après Ctrl+Z, la sentinelle
  // revient, cachée : ni affichée, ni enregistrée (formats/commun.js et texte.js la sautent).
  function insererA(html, ou = 'tout') {
    const p = page();
    if (!p) return;
    const sentinelle = document.createElement('p');
    sentinelle.dataset.sentinelle = '';
    sentinelle.innerHTML = '<br>';
    if (ou === 'fin') p.append(sentinelle); else p.prepend(sentinelle);
    p.focus({ preventScroll: true });
    const r = document.createRange();
    if (ou === 'tout') { r.setStart(sentinelle, 0); r.setEnd(p, p.childNodes.length); } else r.selectNodeContents(sentinelle);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    const propre = Nettoyage.html(html, { racine: doc?.dossierUrl });
    if (propre.trim()) document.execCommand('insertHTML', false, propre);
    else if (ou === 'tout') document.execCommand('insertHTML', false, '<p><br></p>');
    else sentinelle.remove();
    if (!p.firstElementChild) p.innerHTML = '<p><br></p>';
    memoriser();
    changement();
  }
  const remplacerTout = (html) => insererA(html, 'tout');

  // --- État du ruban à l'endroit du curseur ---
  function etat() {
    const p = page();
    if (!p) return {};
    const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
    const bloc = blocCourant();
    let style = 'p';
    for (let n = bloc; n && n !== p; n = n.parentNode) {
      if (n.dataset?.style && /^(P|H[1-6])$/.test(n.tagName)) { style = n.dataset.style; break; }
      if (/^H[1-6]$/.test(n.tagName)) { style = n.tagName.toLowerCase(); break; }
      if (n.tagName === 'PRE') { style = 'pre'; break; }
      if (n.tagName === 'BLOCKQUOTE' && !n.getAttribute('style') && !n.hasAttribute('data-bloc')) { style = 'blockquote'; break; }
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
      repere: Boolean(ancetre(bloc, '[data-repere]')),
      blocDeroulant: Boolean(ancetre(bloc, 'blockquote[data-bloc]')),
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
    p.addEventListener('input', (e) => {
      // Une frappe, un Ctrl+Z, une insertion… : la sélection multiple s'arrête (sauf pendant qu'Edda l'applique).
      if (!interne) viderPlages();
      // Ctrl+Z après une écriture de Claude : la sentinelle revenue reste cachée (voir insererA).
      if (e.inputType === 'historyUndo') for (const x of p.querySelectorAll(':scope > p[data-sentinelle]')) if (!x.textContent.trim()) x.hidden = true;
      changement();
      verifierVide(p);
    });
    p.addEventListener('paste', coller);
    p.addEventListener('copy', copierPlages);
    p.addEventListener('cut', (e) => { if (copierPlages(e)) effacerPlages(); });
    // Ctrl+clic : la sélection en cours devient une plage gardée, et une nouvelle sélection commence.
    // Un clic sans Ctrl arrête la sélection multiple.
    p.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!(e.ctrlKey || e.metaKey)) { viderPlages(); return; }
      const s = window.getSelection();
      if (!s.rangeCount || s.isCollapsed || !dansPage(s.anchorNode)) return;
      ajouterPlage(s.getRangeAt(0).cloneRange());
      // Le curseur va là où l'on clique : sinon, Ctrl+glisser dans le texte choisi le déplacerait.
      const c = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (c && dansPage(c.startContainer)) { s.removeAllRanges(); s.addRange(c); }
    }, true);
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
  // Poser (ou retirer) data-style sur les paragraphes et titres de la sélection.
  function marquerStyle(id) {
    const s = window.getSelection();
    if (!s.rangeCount || !page()) return;
    const r = s.getRangeAt(0);
    const blocs = [...page().querySelectorAll('p, h1, h2, h3, h4, h5, h6')].filter((b) => r.intersectsNode(b));
    const courant = blocCourant();
    if (courant && /^(P|H[1-6])$/.test(courant.tagName) && !blocs.includes(courant)) blocs.push(courant);
    let change = false;
    for (const b of blocs) {
      if (id && b.dataset.style !== id) { b.dataset.style = id; change = true; }
      if (!id && b.hasAttribute('data-style')) { b.removeAttribute('data-style'); change = true; }
    }
    if (change) { changement(); planifier(); }
  }

  // --- Repères et blocs déroulants (voir sommaire.js) ---
  //
  // Un repère : un paragraphe marqué data-repere, qui apparaît dans le sommaire.
  // Un bloc déroulant : <blockquote data-bloc> ; sa première ligne est son titre, le reste se replie.
  // Les deux s'écrivent en remplaçant le HTML du bloc (insertHTML) : un seul Ctrl+Z les défait.
  // Dans un fichier Word ou LibreOffice, ce sont des signets (voir formats/commun.js).

  // Remplace des blocs voisins par du HTML, puis met le curseur dans le bloc d'arrivée (rang dans le parent).
  function remplacerBlocs(premier, dernier, html, { cible = 0, choisir = false } = {}) {
    const parent = premier.parentNode;
    const vrais = () => [...parent.children].filter((x) => !x.hasAttribute('data-sentinelle'));
    const rang = vrais().indexOf(premier);
    page().focus({ preventScroll: true });
    // Comme pour insererA : une sentinelle (paragraphe vide) juste avant, pour que le HTML ne se mêle
    // pas au bloc d'avant.
    const sentinelle = document.createElement('p');
    sentinelle.dataset.sentinelle = '';
    sentinelle.innerHTML = '<br>';
    parent.insertBefore(sentinelle, premier);
    // Et une après : la zone finit au début de celle-ci, hors du dernier bloc remplacé (finir dans ce
    // bloc garderait son enveloppe : un bloc déroulant remplacé se retrouverait dans l'ancien).
    const apres = sentinelle.cloneNode(true);
    dernier.after(apres);
    const r = document.createRange();
    r.setStart(sentinelle, 0);
    r.setEnd(apres, 0);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.execCommand('insertHTML', false, html);
    // La sentinelle restée vide est cachée (ni affichée, ni enregistrée) ; après Ctrl+Z aussi (voir creerPage).
    for (const x of parent.querySelectorAll(':scope > p[data-sentinelle]')) if (!x.textContent.trim()) x.hidden = true;
    let n = vrais()[rang + cible];
    if (n && choisir) n = n.firstElementChild || n;
    if (n && dansPage(n)) {
      const c = document.createRange();
      c.selectNodeContents(n);
      if (!choisir) c.collapse(false);
      s.removeAllRanges();
      s.addRange(c);
    }
    memoriser();
    changement();
    planifier();
  }
  // Le bloc à marquer comme repère : le paragraphe (ou l'élément de liste) du curseur.
  function basculerRepere() {
    if (!restaurer()) return;
    let b = blocCourant();
    if (b && b.tagName === 'DIV' && b.parentNode === page() && !b.textContent.trim()) b = null;
    if (!b) return;
    if (/^H[1-6]$/.test(b.tagName)) { notify('Un titre est déjà dans le sommaire : le repère sert aux autres paragraphes.', 'info', 4000); return; }
    const marque = ancetre(b, '[data-repere]');
    const cible = marque || b;
    const copie = cible.cloneNode(true);
    if (marque) copie.removeAttribute('data-repere'); else copie.setAttribute('data-repere', '');
    remplacerBlocs(cible, cible, copie.outerHTML);
  }
  // Les blocs (enfants d'un même parent : la page ou un bloc déroulant) que couvre la sélection.
  function blocsChoisis() {
    const s = window.getSelection();
    if (!s.rangeCount || !dansPage(s.anchorNode)) return null;
    const r = s.getRangeAt(0);
    const conteneurOk = (c) => c === page() || (c.nodeType === 1 && c.matches('blockquote[data-bloc]'));
    let c = r.commonAncestorContainer;
    while (c && !conteneurOk(c)) c = c.parentNode;
    if (!c) return null;
    const enfantDe = (n) => { while (n && n.parentNode !== c) n = n.parentNode; return n; };
    let debut = enfantDe(r.startContainer === c ? c.childNodes[r.startOffset] || c.lastChild : r.startContainer);
    let fin = enfantDe(r.endContainer === c ? c.childNodes[Math.max(0, r.endOffset - 1)] : r.endContainer);
    // Une sélection qui finit tout au début d'un bloc ne le prend pas (triple-clic, sélection à la souris).
    if (!r.collapsed && fin && fin !== debut && r.endContainer !== c) {
      const avant = document.createRange(); avant.selectNodeContents(fin); avant.setEnd(r.endContainer, r.endOffset);
      if (!avant.toString().length) fin = fin.previousElementSibling || fin;
    }
    if (!debut || !fin || debut.nodeType !== 1 || fin.nodeType !== 1) return null;
    // Le titre d'un bloc ne peut pas être enroulé seul dans un autre bloc : on prend le bloc entier.
    return { conteneur: c, debut, fin };
  }
  function basculerBloc() {
    if (!restaurer()) return;
    const s = window.getSelection();
    const dedans = ancetre(blocCourant(), 'blockquote[data-bloc]');
    // Le curseur (sans sélection) dans un bloc : on retire le bloc, son texte reste.
    if (dedans && s.isCollapsed) {
      remplacerBlocs(dedans, dedans, [...dedans.children].map((x) => x.outerHTML).join('') || '<p><br></p>', { cible: 0 });
      return;
    }
    const choix = blocsChoisis();
    if (!choix) return;
    const { debut, fin } = choix;
    const blocs = [];
    for (let n = debut; n; n = n.nextElementSibling) { blocs.push(n); if (n === fin) break; }
    if (blocs.some((x) => x.hasAttribute('data-sentinelle'))) return;
    const contenu = blocs.map((x) => x.outerHTML).join('');
    remplacerBlocs(debut, fin, `<blockquote data-bloc=""><p>Titre du bloc</p>${contenu}</blockquote>`, { cible: 0, choisir: true });
  }
  // Entrée sur une ligne vide à la fin d'un bloc déroulant : on sort du bloc (comme dans une liste).
  function sortirDuBloc(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey) return false;
    const s = window.getSelection();
    if (!s.isCollapsed) return false;
    const b = blocCourant();
    const bloc = b?.parentNode;
    if (!bloc?.matches?.('blockquote[data-bloc]') || b === bloc.firstElementChild || b !== bloc.lastElementChild || b.textContent.trim() || b.querySelector('img, video, audio, table')) return false;
    e.preventDefault();
    const parent = bloc.parentNode;
    const rang = [...parent.children].indexOf(bloc);
    const restes = [...bloc.children].slice(0, -1).map((x) => x.outerHTML).join('');
    const attrs = [...bloc.attributes].map((a) => ` ${a.name}="${escapeHtml(a.value)}"`).join('');
    remplacerBlocs(bloc, bloc, `<blockquote${attrs}>${restes}</blockquote><p><br></p>`, { cible: 1 });
    const p = parent.children[rang + 1];
    if (p) { const r = document.createRange(); r.setStart(p, 0); r.collapse(true); s.removeAllRanges(); s.addRange(r); memoriser(); }
    return true;
  }

  // Coller des paragraphes (un titre et son texte, par exemple) au début ou au bout d'un titre :
  // Chromium mêlerait le premier bloc collé au titre (« Partie 2Partie 1 »), et le titre collé ne
  // serait plus un titre. On colle plutôt juste avant ou juste après ce titre, dans une sentinelle
  // (voir insererA). Au milieu d'un titre, on laisse faire Chromium.
  function collerAutourDuTitre(html) {
    const s = window.getSelection();
    if (!s.rangeCount || !s.isCollapsed || !dansPage(s.anchorNode)) return false;
    const titre = ancetre(s.anchorNode, 'h1, h2, h3, h4, h5, h6');
    if (!titre || titre.parentNode !== page()) return false;
    const propre = Nettoyage.html(html, { racine: doc?.dossierUrl });
    if (!/<(p|h[1-6]|ul|ol|li|table|blockquote|pre|div|hr)\b/i.test(propre)) return false;
    const r = s.getRangeAt(0);
    const avant = document.createRange(); avant.selectNodeContents(titre); avant.setEnd(r.startContainer, r.startOffset);
    const apres = document.createRange(); apres.selectNodeContents(titre); apres.setStart(r.startContainer, r.startOffset);
    const auBout = !apres.toString().length;
    if (!auBout && avant.toString().length) return false;
    const sentinelle = document.createElement('p');
    sentinelle.dataset.sentinelle = '';
    sentinelle.innerHTML = '<br>';
    if (auBout) titre.after(sentinelle); else titre.before(sentinelle);
    const r2 = document.createRange();
    r2.selectNodeContents(sentinelle);
    s.removeAllRanges();
    s.addRange(r2);
    document.execCommand('insertHTML', false, propre);
    if (sentinelle.isConnected && !sentinelle.textContent.trim() && !sentinelle.querySelector('img, video, audio, table, hr')) sentinelle.hidden = true;
    memoriser();
    changement();
    return true;
  }

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
      if (!collerAutourDuTitre(corps)) inserer(corps);
    }
    // Sinon (texte simple) : Chromium colle lui-même.
  }

  // --- Clavier dans la page ---
  function clavier(e) {
    const s = window.getSelection();
    if (plages.length && !['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && multiple()) { e.preventDefault(); effacerPlages(); return; }
      // Les raccourcis (Ctrl+G, Ctrl+C…) gardent les plages ; le reste (frappe, flèches, Échap) les arrête.
      const raccourci = (e.ctrlKey || e.metaKey) && !['a', 'z', 'y'].includes(e.key.toLowerCase());
      if (!raccourci) viderPlages();
      if (e.key === 'Escape') return;
    }
    if (sortirDuBloc(e)) return;
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
    activer(d) { doc = d; selection = null; plages = []; dessinerPlages(); planifier(); },
    plagesMultiples: () => (multiple() ? toutesPlages().length : 0),
    viderPlages,
    page,
    doc: () => doc,
    commandes,
    exec,
    inserer,
    remplacerNoeud,
    remplacerTout,
    insererA,
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
