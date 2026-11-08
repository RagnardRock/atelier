// Les styles d'un document : Titre 1 à 4 (modifiables) et les styles créés par l'utilisateur.
//
// d.styles = { base: { h1: { taille: 24, … } }, perso: [{ id, nom, balise, police, taille, couleur,
//   gras, italique, avant, apres }] }
//   base   : ce qui change dans Titre 1 à 4 par rapport à DEFAUTS (le reste vient de DEFAUTS) ;
//   perso  : les styles créés (id « perso1 »…), posés dans la page par data-style="perso1" sur un
//            paragraphe ou un titre (balise : p, h1…h4 ; un style « titre » va dans le sommaire).
// Valeurs : police (nom, ou null = celle du document), taille (pt), couleur (« rrggbb »), gras,
// italique, avant / apres (espace au-dessus et en dessous, pt).
//
// Dans la page, les styles sont une feuille CSS à part (dans <head>, une par document). À
// l'enregistrement, ils vont dans le fichier : styles Word (styles.xml) et LibreOffice.

const StylesDoc = (() => {
  const DEFAUTS = {
    h1: { nom: 'Titre 1', balise: 'h1', police: null, taille: 20, couleur: '1f3864', gras: true, italique: false, avant: 16, apres: 8 },
    h2: { nom: 'Titre 2', balise: 'h2', police: null, taille: 16, couleur: '2f5496', gras: true, italique: false, avant: 11, apres: 6 },
    h3: { nom: 'Titre 3', balise: 'h3', police: null, taille: 14, couleur: '2f5496', gras: true, italique: false, avant: 8, apres: 4 },
    h4: { nom: 'Titre 4', balise: 'h4', police: null, taille: 12, couleur: '2f5496', gras: true, italique: false, avant: 6, apres: 3 },
  };
  const BALISES = [['p', 'Texte normal'], ['h1', 'Titre 1'], ['h2', 'Titre 2'], ['h3', 'Titre 3'], ['h4', 'Titre 4']];
  const CHAMPS = ['police', 'taille', 'couleur', 'gras', 'italique', 'avant', 'apres'];

  const vide = () => ({ base: {}, perso: [] });
  const copie = (s) => structuredClone(s && typeof s === 'object' ? { base: s.base || {}, perso: s.perso || [] } : vide());

  // Tous les styles d'un document, complets.
  function liste(d) {
    const s = d?.styles || vide();
    return [
      ...Object.keys(DEFAUTS).map((id) => ({ id, ...DEFAUTS[id], ...(s.base?.[id] || {}), nom: DEFAUTS[id].nom, balise: id, perso: false })),
      ...(s.perso || []).map((p) => ({ ...p, perso: true })),
    ];
  }
  const get = (d, id) => liste(d).find((x) => x.id === id) || null;
  const estModifie = (d) => Boolean(d?.styles && (Object.keys(d.styles.base || {}).length || (d.styles.perso || []).length));

  // Modifier un style (titre de base ou perso).
  function changer(d, id, valeurs) {
    d.styles = copie(d.styles);
    if (DEFAUTS[id]) {
      const v = {};
      for (const k of CHAMPS) if (valeurs[k] !== undefined && valeurs[k] !== DEFAUTS[id][k]) v[k] = valeurs[k];
      for (const k of CHAMPS) if (valeurs[k] === undefined && d.styles.base[id]?.[k] !== undefined) v[k] = d.styles.base[id][k];
      if (Object.keys(v).length) d.styles.base[id] = v; else delete d.styles.base[id];
    } else {
      const p = d.styles.perso.find((x) => x.id === id);
      if (p) Object.assign(p, valeurs);
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
    appliquer(d);
  }

  // Les déclarations CSS d'un style.
  function declarations(s) {
    const x = [];
    if (s.police) x.push(`font-family: '${String(s.police).replace(/'/g, '')}', var(--police-doc, Calibri), sans-serif`);
    if (s.taille) x.push(`font-size: ${s.taille}pt`);
    if (s.couleur) x.push(`color: #${s.couleur}`);
    if (s.gras !== null && s.gras !== undefined) x.push(`font-weight: ${s.gras ? 700 : 400}`);
    if (s.italique !== null && s.italique !== undefined) x.push(`font-style: ${s.italique ? 'italic' : 'normal'}`);
    if (s.avant !== null && s.avant !== undefined) x.push(`margin-top: ${s.avant}pt`);
    if (s.apres !== null && s.apres !== undefined) x.push(`margin-bottom: ${s.apres}pt`);
    return x.join('; ');
  }
  // La feuille CSS des styles d'un document. portee : le sélecteur de la page (vide pour un export).
  function css(d, portee = '') {
    const p = portee ? `${portee} ` : '';
    return liste(d).map((s) => {
      const sel = s.perso ? `${p}[data-style="${s.id}"]` : `${p}${s.balise}:not([data-style])`;
      const decl = declarations(s);
      return decl ? `${sel} { ${decl}; }` : '';
    }).filter(Boolean).join('\n');
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
  function depuisEcran(noeud, page) {
    let n = noeud?.nodeType === 3 ? noeud.parentNode : noeud;
    if (!n || !page.contains(n)) return null;
    const cs = getComputedStyle(n);
    let bloc = n;
    while (bloc && bloc !== page && !/^(P|H[1-6]|LI|DIV|BLOCKQUOTE|PRE)$/.test(bloc.tagName)) bloc = bloc.parentNode;
    const bs = getComputedStyle(bloc && bloc !== page ? bloc : n);
    const police = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const pt = (px) => Math.round(Unites.pxEnPt(parseFloat(px)) * 2) / 2;
    const rgb = cs.color.match(/\d+/g) || [0, 0, 0];
    return {
      police: police && police !== getComputedStyle(page).fontFamily.split(',')[0].replace(/["']/g, '').trim() ? police : null,
      taille: Unites.pxEnPt(parseFloat(cs.fontSize)) ? Math.round(Unites.pxEnPt(parseFloat(cs.fontSize)) * 2) / 2 : null,
      couleur: rgb.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join(''),
      gras: Number(cs.fontWeight) >= 600,
      italique: cs.fontStyle === 'italic',
      avant: pt(bs.marginTop),
      apres: pt(bs.marginBottom),
    };
  }

  return { DEFAUTS, BALISES, CHAMPS, liste, get, changer, creer, supprimer, css, appliquer, retirer, depuisEcran, estModifie, copie };
})();
