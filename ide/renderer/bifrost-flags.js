// Flags Bifrost (data-bf…) d'une page HTML : ce que le client pourra modifier, et les erreurs.
// Fonctions pures (texte en entrée, description en sortie), testées dans verif/essais.
// La convention est celle de Bifrost (docs/flags.md du dépôt Bifrost) :
//   data-bf="cle"              zone modifiable (img → image, a → lien, sinon texte)
//   data-bf-type="riche"       texte mis en forme
//   data-bf-liste="nom"        liste répétable, dont chaque élément porte data-bf-element
//   data-bf-limite="N"         la liste n'affiche que les N premiers éléments
//   data-bf-page="nom"         la page sert de modèle aux nouveaux éléments de la liste « nom »
//   data-bf-formulaire="nom"   formulaire dont les messages arrivent dans Bifrost

const BifrostFlags = (() => {
  const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const BRUTS = new Set(['script', 'style', 'textarea', 'title']);
  const TYPES = new Set(['texte', 'riche', 'image', 'lien']);
  const NOM_FORMULAIRE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
  const CLE = /^[\w.-]+$/;
  const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const BALISE = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;

  // Ligne et colonne (à partir de 1) d'une position dans le texte.
  function positions(texte) {
    const debuts = [0];
    for (let i = 0; i < texte.length; i++) if (texte.charCodeAt(i) === 10) debuts.push(i + 1);
    return (offset) => {
      let bas = 0;
      let haut = debuts.length - 1;
      while (bas < haut) {
        const m = (bas + haut + 1) >> 1;
        if (debuts[m] <= offset) bas = m; else haut = m - 1;
      }
      return { ligne: bas + 1, col: offset - debuts[bas] + 1 };
    };
  }

  function attributs(source) {
    const res = {};
    ATTR.lastIndex = 0;
    let m;
    while ((m = ATTR.exec(source))) {
      const nom = m[1].toLowerCase();
      if (!(nom in res)) res[nom] = m[2] ?? m[3] ?? m[4] ?? '';
    }
    return res;
  }

  // Les balises ouvrantes, avec leur position et leurs parents (on saute commentaires, scripts, styles).
  function balises(html) {
    const pos = positions(html);
    const res = [];
    const pile = [];
    let i = 0;
    while (i < html.length) {
      const lt = html.indexOf('<', i);
      if (lt < 0) break;
      if (html.startsWith('<!--', lt)) { const fin = html.indexOf('-->', lt + 4); i = fin < 0 ? html.length : fin + 3; continue; }
      if (html[lt + 1] === '!' || html[lt + 1] === '?') { const fin = html.indexOf('>', lt); i = fin < 0 ? html.length : fin + 1; continue; }
      BALISE.lastIndex = lt;
      const m = BALISE.exec(html);
      if (!m) { i = lt + 1; continue; }
      const tag = m[2].toLowerCase();
      i = BALISE.lastIndex;
      if (m[1]) {
        const k = pile.map((b) => b.tag).lastIndexOf(tag);
        if (k >= 0) { for (const o of pile.slice(k)) o.ferme = lt; pile.length = k; }
        continue;
      }
      const b = { tag, attrs: attributs(m[3]), debut: lt, fin: i, ...pos(lt), parents: pile.slice() };
      res.push(b);
      const autoFermee = /\/\s*$/.test(m[3]);
      if (BRUTS.has(tag)) {
        const fin = html.toLowerCase().indexOf(`</${tag}`, i);
        i = fin < 0 ? html.length : fin;
        b.ferme = i;
      } else if (!VIDES.has(tag) && !autoFermee) pile.push(b);
      else b.ferme = i;
    }
    return res;
  }

  function typeDe(b) {
    const force = b.attrs['data-bf-type'];
    if (TYPES.has(force)) return force;
    if (b.tag === 'img') return 'image';
    if (b.tag === 'a') return 'lien';
    return 'texte';
  }

  // Description complète d'une page.
  function analyser(html) {
    html = String(html || '');
    const toutes = balises(html);
    const texteDe = (b) => (b.tag === 'img' ? b.attrs.src || '' : html.slice(b.fin, b.ferme ?? b.fin).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
    const erreurs = [];
    const signaler = (b, gravite, message) => erreurs.push({ ligne: b.ligne, col: b.col, gravite, message });
    const listeDe = (b) => [...b.parents].reverse().find((p) => 'data-bf-liste' in p.attrs) || null;
    const elementDe = (b) => [...b.parents].reverse().find((p) => 'data-bf-element' in p.attrs) || null;
    const dansRiche = (b) => b.parents.some((p) => p.attrs['data-bf-type'] === 'riche');

    const listes = [];
    for (const b of toutes.filter((x) => 'data-bf-liste' in x.attrs)) {
      const nom = b.attrs['data-bf-liste'].trim();
      const elements = toutes.filter((x) => 'data-bf-element' in x.attrs && listeDe(x) === b);
      const limite = b.attrs['data-bf-limite'];
      listes.push({ nom, ligne: b.ligne, col: b.col, elements: elements.length, limite: limite ? Number(limite) : null });
      if (dansRiche(b)) signaler(b, 'attention', `La liste « ${nom} » est dans un texte riche : le client ne pourra pas la gérer à part`);
      if (!nom) signaler(b, 'erreur', 'Liste sans nom : data-bf-liste="actualites", par exemple');
      else if (!CLE.test(nom)) signaler(b, 'erreur', `Nom de liste « ${nom} » : lettres, chiffres, points, tirets seulement`);
      if (!elements.length) signaler(b, 'erreur', `La liste « ${nom || '?'} » n'a aucun modèle d'élément (data-bf-element) : le client ne pourra rien ajouter`);
      if (limite !== undefined && !(Number(limite) > 0 && Number.isInteger(Number(limite)))) signaler(b, 'erreur', `data-bf-limite="${limite}" : un nombre entier, par exemple 3`);
    }
    const nomsListes = new Map();
    for (const l of listes) nomsListes.set(l.nom, (nomsListes.get(l.nom) || []).concat(l));

    for (const b of toutes.filter((x) => 'data-bf-element' in x.attrs)) {
      if (!listeDe(b)) signaler(b, 'erreur', 'data-bf-element hors d\'une liste (data-bf-liste)');
    }

    const champs = [];
    for (const b of toutes.filter((x) => 'data-bf' in x.attrs)) {
      const cle = b.attrs['data-bf'].trim();
      const liste = listeDe(b);
      const element = elementDe(b);
      const c = { cle, type: typeDe(b), tag: b.tag, texte: texteDe(b), ligne: b.ligne, col: b.col, liste: liste ? liste.attrs['data-bf-liste'] : null, element, riche: dansRiche(b) };
      champs.push(c);
      if (!cle) signaler(b, 'erreur', 'Zone modifiable sans nom : data-bf="accueil.titre", par exemple');
      else if (!CLE.test(cle)) signaler(b, 'erreur', `Nom « ${cle} » : lettres, chiffres, points, tirets seulement`);
      const t = b.attrs['data-bf-type'];
      if (t !== undefined && !TYPES.has(t)) signaler(b, 'erreur', `data-bf-type="${t}" inconnu (riche, texte, image ou lien)`);
      if (c.type === 'image' && b.tag !== 'img') signaler(b, 'attention', `« ${cle} » est une image, mais la balise est <${b.tag}>`);
      if (c.riche && !(liste && dansRiche(liste))) signaler(b, 'attention', `« ${cle} » est dans un texte riche : le client ne le verra pas à part`);
      if (liste && !element) signaler(b, 'erreur', `« ${cle} » est dans la liste « ${c.liste} » mais hors d'un élément (data-bf-element)`);
    }

    // Noms en double : dans un même élément de liste (ambigu), ou sur la page avec des types différents.
    const groupes = new Map();
    for (const c of champs.filter((x) => x.cle && !x.riche)) {
      const cle = `${c.element ? c.element.debut : 'page'}|${c.cle}`;
      groupes.set(cle, (groupes.get(cle) || []).concat(c));
    }
    for (const [k, g] of groupes) {
      if (g.length < 2) continue;
      const enListe = !k.startsWith('page|');
      const types = new Set(g.map((c) => c.type));
      for (const c of g.slice(1)) {
        if (enListe) erreurs.push({ ligne: c.ligne, col: c.col, gravite: 'erreur', message: `« ${c.cle} » apparaît ${g.length} fois dans le même élément de liste : donne-leur des noms différents` });
        else if (types.size > 1) erreurs.push({ ligne: c.ligne, col: c.col, gravite: 'erreur', message: `« ${c.cle} » est utilisé pour des zones de types différents (${[...types].join(', ')})` });
        else if (c.texte !== g[0].texte) erreurs.push({ ligne: c.ligne, col: c.col, gravite: 'attention', message: `« ${c.cle} » est déjà utilisé ligne ${g[0].ligne} avec un autre contenu : le client remplacera les deux par le même` });
        else erreurs.push({ ligne: c.ligne, col: c.col, gravite: 'info', message: `« ${c.cle} » apparaît ${g.length} fois : le client modifie les deux d'un coup` });
      }
    }

    const formulaires = [];
    for (const b of toutes.filter((x) => 'data-bf-formulaire' in x.attrs)) {
      const nom = b.attrs['data-bf-formulaire'].trim();
      if (b.tag !== 'form') signaler(b, 'erreur', 'data-bf-formulaire se pose sur une balise <form>');
      if (!nom) signaler(b, 'erreur', 'Formulaire sans nom : data-bf-formulaire="contact", par exemple');
      else if (!NOM_FORMULAIRE.test(nom)) signaler(b, 'erreur', `Nom de formulaire « ${nom} » : lettres, chiffres, tirets (40 au plus)`);
      const champsForm = toutes.filter((x) => x.parents.includes(b) && ['input', 'textarea', 'select'].includes(x.tag));
      for (const x of champsForm) {
        const type = (x.attrs.type || '').toLowerCase();
        if (['submit', 'button', 'reset', 'image', 'hidden'].includes(type)) continue;
        if (!x.attrs.name) signaler(x, 'erreur', `Champ du formulaire « ${nom || '?'} » sans name : sa valeur ne sera pas reçue`);
      }
      if (!champsForm.some((x) => (x.attrs.type || '').toLowerCase() === 'email')) signaler(b, 'info', `Le formulaire « ${nom || '?'} » n'a pas de champ e-mail : « Répondre » ne sera pas possible`);
      formulaires.push({ nom, ligne: b.ligne, col: b.col, champs: champsForm.filter((x) => x.attrs.name).length });
    }

    const modeleB = toutes.find((x) => 'data-bf-page' in x.attrs);
    const modele = modeleB ? modeleB.attrs['data-bf-page'].trim() : null;
    if (modeleB && !modele) signaler(modeleB, 'erreur', 'Page modèle sans nom : data-bf-page="actualites", par exemple');

    erreurs.sort((a, b) => a.ligne - b.ligne || a.col - b.col);
    return { champs: champs.map(({ element, ...c }) => c), listes, formulaires, modele, erreurs };
  }

  // Vérifications sur tout le site : collections dont les cartes mènent à des pages sans modèle, etc.
  // pages : [{ chemin, html }]
  function analyserSite(pages) {
    const res = pages.map((p) => ({ chemin: p.chemin, ...analyser(p.html) }));
    const modeles = new Map(res.filter((p) => p.modele).map((p) => [p.modele, p.chemin]));
    const erreurs = [];
    for (const [nom, chemin] of modeles) {
      if (!res.some((p) => p.listes.some((l) => l.nom === nom))) erreurs.push({ chemin, ligne: 1, col: 1, gravite: 'attention', message: `${chemin} est le modèle de « ${nom} », mais aucune page n'a de liste data-bf-liste="${nom}"` });
    }
    const types = new Map();
    for (const p of res) for (const c of p.champs) if (c.cle && !c.liste) {
      const e = types.get(c.cle) || { types: new Set(), chemin: p.chemin, ligne: c.ligne };
      e.types.add(c.type);
      types.set(c.cle, e);
    }
    for (const [cle, e] of types) if (e.types.size > 1) erreurs.push({ chemin: e.chemin, ligne: e.ligne, col: 1, gravite: 'erreur', message: `« ${cle} » n'a pas le même type sur toutes les pages (${[...e.types].join(', ')})` });
    return { pages: res, modeles: Object.fromEntries(modeles), erreurs };
  }

  // Nom proposé pour une nouvelle zone : « accueil.titre » depuis la page et la balise.
  function nomPropose(page, tag, texte, existants = []) {
    const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const base = slug(String(page || '').split(/[\\/]/).pop().replace(/\.html?$/i, '')) || 'page';
    const parTag = { h1: 'titre', h2: 'sous-titre', h3: 'sous-titre', img: 'photo', a: 'lien', p: 'texte', li: 'element', blockquote: 'citation' };
    const mot = slug(texte).split('-').filter((m) => m.length > 2).slice(0, 2).join('-');
    const prefixe = base === 'index' ? 'accueil' : base;
    let nom = `${prefixe}.${parTag[tag] || mot || tag}`;
    for (let n = 2; existants.includes(nom); n++) nom = `${prefixe}.${parTag[tag] || mot || tag}-${n}`;
    return nom;
  }

  // La balise sous le curseur : celle dont on est dans la balise ouvrante, sinon l'élément qui
  // entoure le curseur (le plus profond).
  function baliseA(html, offset) {
    let res = null;
    for (const b of balises(html)) {
      if (b.debut > offset) break;
      if (offset < b.fin) return b;
      if (b.ferme === undefined || b.ferme >= offset) res = b;
    }
    return res;
  }

  // Texte à insérer pour ajouter un attribut à la balise b : position juste après le nom de la balise.
  function insertion(b, attribut) {
    return { offset: b.debut + 1 + b.tag.length, texte: ` ${attribut}` };
  }

  return { analyser, analyserSite, balises, nomPropose, baliseA, insertion, typeDe };
})();

if (typeof module !== 'undefined') module.exports = { BifrostFlags };
