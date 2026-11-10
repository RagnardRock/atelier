// Les styles d'un document : Texte normal (le style par défaut), Titre 1 à 4 (modifiables) et les
// styles créés par l'utilisateur.
//
// d.styles = { base: { h1: { taille: 24, … } }, perso: [{ id, nom, balise, police, taille, couleur,
//   gras, italique, souligne, avant, apres }], menu: { ordre: ['h1', 'p', …], caches: ['pre'] } }
//   base   : ce qui change dans Texte normal (p) et Titre 1 à 4 par rapport à DEFAUTS (le reste vient
//            de DEFAUTS). La police et la taille de Texte normal sont celles du document (d.police,
//            d.taille : Format › Mise en page) ;
//   menu   : l'ordre des styles dans la liste du ruban et ceux qui y sont cachés (rien = l'ordre d'Edda) ;
//   perso  : les styles créés (id « perso1 »…), posés dans la page par data-style="perso1" sur un
//            paragraphe ou un titre (balise : p, h1…h4 ; un style « titre » va dans le sommaire).
// Valeurs : police (nom, ou null = celle du document), taille (pt), couleur (« rrggbb », ou null =
// automatique : celle du texte, qui suit la page blanche ou sombre), gras, italique, souligne,
// avant / apres (espace au-dessus et en dessous, pt), alignement (left, center, right, justify ;
// null = celui du paragraphe), retrait (à gauche, cm).
//
// Dans la page, les styles sont une feuille CSS à part (dans <head>, une par document). À
// l'enregistrement, ils vont dans le fichier : styles Word (styles.xml) et LibreOffice.

const StylesDoc = (() => {
  const DEFAUTS = {
    p: { nom: 'Texte normal', balise: 'p', police: null, taille: null, couleur: null, gras: null, italique: null, souligne: null, avant: null, apres: null, alignement: null, retrait: null },
    h1: { nom: 'Titre 1', balise: 'h1', police: null, taille: 20, couleur: '1f3864', gras: true, italique: false, souligne: false, avant: 16, apres: 8, alignement: null, retrait: null },
    h2: { nom: 'Titre 2', balise: 'h2', police: null, taille: 16, couleur: '2f5496', gras: true, italique: false, souligne: false, avant: 11, apres: 6, alignement: null, retrait: null },
    h3: { nom: 'Titre 3', balise: 'h3', police: null, taille: 14, couleur: '2f5496', gras: true, italique: false, souligne: false, avant: 8, apres: 4, alignement: null, retrait: null },
    h4: { nom: 'Titre 4', balise: 'h4', police: null, taille: 12, couleur: '2f5496', gras: true, italique: false, souligne: false, avant: 6, apres: 3, alignement: null, retrait: null },
  };
  const BALISES = [['p', 'Texte normal'], ['h1', 'Titre 1'], ['h2', 'Titre 2'], ['h3', 'Titre 3'], ['h4', 'Titre 4']];
  const CHAMPS = ['police', 'taille', 'couleur', 'gras', 'italique', 'souligne', 'avant', 'apres', 'alignement', 'retrait'];
  // La liste du ruban : ces styles-là, puis ceux créés dans le document.
  const MENU = [['p', 'Texte normal'], ['h1', 'Titre 1'], ['h2', 'Titre 2'], ['h3', 'Titre 3'], ['h4', 'Titre 4'], ['blockquote', 'Citation'], ['pre', 'Code']];
  const ALIGNEMENTS = [['', 'Comme le paragraphe'], ['left', 'À gauche'], ['center', 'Centré'], ['right', 'À droite'], ['justify', 'Justifié']];

  const vide = () => ({ base: {}, perso: [] });
  const copie = (s) => structuredClone(s && typeof s === 'object' ? { base: s.base || {}, perso: s.perso || [], ...(s.menu ? { menu: s.menu } : {}) } : vide());

  // Tous les styles d'un document, complets.
  function liste(d) {
    const s = d?.styles || vide();
    return [
      ...Object.keys(DEFAUTS).map((id) => ({ id, ...DEFAUTS[id], ...(s.base?.[id] || {}), nom: DEFAUTS[id].nom, balise: id, perso: false })),
      ...(s.perso || []).map((p) => ({ ...p, perso: true })),
    ];
  }
  const get = (d, id) => liste(d).find((x) => x.id === id) || null;
  const estModifie = (d) => Boolean(d?.styles && (Object.keys(d.styles.base || {}).length || (d.styles.perso || []).length || d.styles.menu));

  // La liste du ruban, dans l'ordre choisi : [{ id, nom, cache, perso }].
  function menu(d) {
    const tous = [...MENU.map(([id, nom]) => ({ id, nom, perso: false })), ...(d?.styles?.perso || []).map((p) => ({ id: p.id, nom: p.nom, perso: true }))];
    const m = d?.styles?.menu || {};
    const ordre = Array.isArray(m.ordre) ? m.ordre : [];
    const rang = (x) => { const i = ordre.indexOf(x.id); return i < 0 ? ordre.length + tous.indexOf(x) : i; };
    const caches = new Set(Array.isArray(m.caches) ? m.caches : []);
    return tous.sort((a, b) => rang(a) - rang(b)).map((x) => ({ ...x, cache: caches.has(x.id) }));
  }
  // Ranger la liste du ruban : ordre (les id) et caches (les id cachés). Rien de changé = l'ordre d'Edda.
  function changerMenu(d, ordre, caches) {
    d.styles = copie(d.styles);
    const parDefaut = menu({ styles: { ...d.styles, menu: null } }).map((x) => x.id);
    const pareil = ordre.join() === parDefaut.join();
    if (pareil && !caches.length) delete d.styles.menu; else d.styles.menu = { ordre: [...ordre], caches: [...caches] };
  }

  // Modifier un style (titre de base ou perso).
  function changer(d, id, valeurs) {
    d.styles = copie(d.styles);
    if (DEFAUTS[id]) {
      const v = {};
      for (const k of CHAMPS) if (valeurs[k] !== undefined && valeurs[k] !== DEFAUTS[id][k]) v[k] = valeurs[k];
      // Texte normal : sa police et sa taille sont celles du document (d.police, d.taille).
      if (id === 'p') { delete v.police; delete v.taille; }
      for (const k of CHAMPS) if (valeurs[k] === undefined && d.styles.base[id]?.[k] !== undefined) v[k] = d.styles.base[id][k];
      if (Object.keys(v).length) d.styles.base[id] = v; else delete d.styles.base[id];
    } else {
      const p = d.styles.perso.find((x) => x.id === id);
      if (p) for (const [k, x] of Object.entries(valeurs)) if (x !== undefined) p[k] = x;
    }
    appliquer(d);
  }
  function creer(d, valeurs) {
    d.styles = copie(d.styles);
    let n = 1;
    while (d.styles.perso.some((x) => x.id === `perso${n}`)) n++;
    const s = { id: `perso${n}`, nom: valeurs.nom || `Style ${n}`, balise: valeurs.balise || 'p', ...Object.fromEntries(CHAMPS.map((k) => [k, valeurs[k] ?? null])) };
    d.styles.perso.push(s);
    appliquer(d);
    return s;
  }
  function supprimer(d, id) {
    d.styles = copie(d.styles);
    d.styles.perso = d.styles.perso.filter((x) => x.id !== id);
    if (d.styles.menu) d.styles.menu = { ordre: (d.styles.menu.ordre || []).filter((x) => x !== id), caches: (d.styles.menu.caches || []).filter((x) => x !== id) };
    appliquer(d);
  }

  // Les déclarations CSS d'un style.
  const donne = (v) => v !== null && v !== undefined;
  // quoi : 'texte' (police, couleur, gras…), 'para' (espaces, alignement, retrait, souligné) ou tout.
  function declarations(s, quoi = null) {
    const x = [];
    if (quoi !== 'para') {
      if (s.police) x.push(`font-family: '${String(s.police).replace(/'/g, '')}', var(--police-doc, Calibri), sans-serif`);
      if (s.taille) x.push(`font-size: ${s.taille}pt`);
      if (s.couleur) x.push(`color: #${s.couleur}`);
      // Un titre en couleur automatique : celle du texte (pas le bleu d'Edda).
      else if (s.couleur === null && !s.perso && DEFAUTS[s.id]?.couleur) x.push('color: inherit');
      if (donne(s.gras)) x.push(`font-weight: ${s.gras ? 700 : 400}`);
      if (donne(s.italique)) x.push(`font-style: ${s.italique ? 'italic' : 'normal'}`);
      if (quoi === 'texte') return x.join('; ');
    }
    if (donne(s.souligne)) x.push(`text-decoration-line: ${s.souligne ? 'underline' : 'none'}`);
    if (s.avant !== null && s.avant !== undefined) x.push(`margin-top: ${s.avant}pt`);
    if (s.apres !== null && s.apres !== undefined) x.push(`margin-bottom: ${s.apres}pt`);
    if (/^(left|center|right|justify)$/.test(s.alignement || '')) x.push(`text-align: ${s.alignement}`);
    if (Number(s.retrait) > 0) x.push(`margin-left: ${Number(s.retrait)}cm`);
    return x.join('; ');
  }
  // La feuille CSS des styles d'un document. portee : le sélecteur de la page (vide pour un export).
  // Dans la page, une couleur de style trop proche du fond (bleu nuit sur la page sombre…) est
  // montrée adaptée (voir couleurs.js) ; le fichier garde la vraie.
  function css(d, portee = '') {
    const p = portee ? `${portee} ` : '';
    const racine = portee || 'body';
    const regles = [];
    // sel : le sélecteur sans la portée ('' = la page elle-même).
    const variantes = (sel, couleur) => {
      if (!portee || !couleur || typeof Couleurs === 'undefined') return;
      const sombre = Couleurs.adapterPour(couleur, true), claire = Couleurs.adapterPour(couleur, false);
      if (sombre) regles.push(`${portee}.sombre${sel ? ` ${sel}` : ''} { color: #${sombre}; }`);
      if (claire) regles.push(`${portee}:not(.sombre)${sel ? ` ${sel}` : ''} { color: #${claire}; }`);
    };
    for (const s of liste(d)) {
      if (s.id === 'p') {
        // Texte normal : la couleur, le gras et l'italique valent pour tout le document (les titres
        // et les styles créés en héritent, comme dans Word) ; les espaces et le souligné pour ses paragraphes.
        const t = declarations(s, 'texte');
        if (t) regles.push(`${racine} { ${t}; }`);
        variantes('', s.couleur);
        const para = declarations(s, 'para');
        if (para) regles.push(`${racine} > p:not([data-style]), ${racine} > blockquote[data-bloc] > p:not([data-style]) { ${para}; }`);
        continue;
      }
      const nu = s.perso ? `[data-style="${s.id}"]` : `${s.balise}:not([data-style])`;
      const decl = declarations(s);
      if (decl) regles.push(`${p}${nu} { ${decl}; }`);
      variantes(nu, s.couleur);
    }
    return regles.join('\n');
  }

  // La feuille de la page d'un document (une balise <style> par document, dans <head>).
  function appliquer(d) {
    if (!d?.page) return;
    if (!d.page.id) d.page.id = `feuille-${d.id}`;
    let st = document.getElementById(`styles-${d.id}`);
    if (!st) { st = el('style', { id: `styles-${d.id}` }); document.head.append(st); }
    // #id.feuille : plus fort que les règles de base (.feuille h1) de style.css.
    st.textContent = css(d, `#${CSS.escape(d.page.id)}.feuille`);
  }
  function retirer(d) { document.getElementById(`styles-${d.id}`)?.remove(); }

  // Le style lu sur du texte à l'écran (pour « mettre à jour d'après la sélection »).
  function depuisEcran(noeud, page, d = null) {
    let n = noeud?.nodeType === 3 ? noeud.parentNode : noeud;
    if (!n || !page.contains(n)) return null;
    const cs = getComputedStyle(n);
    let bloc = n;
    while (bloc && bloc !== page && !/^(P|H[1-6]|LI|DIV|BLOCKQUOTE|PRE)$/.test(bloc.tagName)) bloc = bloc.parentNode;
    const bs = getComputedStyle(bloc && bloc !== page ? bloc : n);
    const police = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const pt = (px) => Math.round(Unites.pxEnPt(parseFloat(px)) * 2) / 2;
    // La couleur posée à la main sur ce texte (pas celle montrée : elle peut être adaptée à la page
    // sombre) ; sinon celle du style du paragraphe.
    let couleur;
    for (let x = n; x && x !== page; x = x.parentNode) {
      const c = x.style?.color || (x.tagName === 'FONT' ? x.getAttribute('color') : '');
      if (c && c !== 'inherit' && typeof Couleurs !== 'undefined') { couleur = Couleurs.propre(c); break; }
    }
    if (couleur === undefined && d && bloc && bloc !== page) couleur = get(d, bloc.dataset?.style || bloc.tagName.toLowerCase())?.couleur;
    let souligne = false;
    for (let x = n; x && x !== page; x = x.parentNode) if (/underline/.test(getComputedStyle(x).textDecorationLine)) { souligne = true; break; }
    return {
      police: police && police !== getComputedStyle(page).fontFamily.split(',')[0].replace(/["']/g, '').trim() ? police : null,
      taille: Unites.pxEnPt(parseFloat(cs.fontSize)) ? Math.round(Unites.pxEnPt(parseFloat(cs.fontSize)) * 2) / 2 : null,
      couleur: couleur ?? null,
      gras: Number(cs.fontWeight) >= 600,
      italique: cs.fontStyle === 'italic',
      souligne,
      avant: pt(bs.marginTop),
      apres: pt(bs.marginBottom),
      alignement: { center: 'center', right: 'right', end: 'right', justify: 'justify' }[bs.textAlign] || null,
      retrait: Math.round(Unites.pxEnCm(parseFloat(bs.marginLeft) || 0) * 10) / 10 || null,
    };
  }

  return { DEFAUTS, BALISES, CHAMPS, ALIGNEMENTS, MENU, liste, get, changer, creer, supprimer, menu, changerMenu, css, appliquer, retirer, depuisEcran, estModifie, copie };
})();
