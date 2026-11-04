// La fiche personnalisée d'un jeu JDR (Tafl 1.23, Saga 1.21.3), commune à Tafl et Saga.
//
// Un jeu peut dessiner sa propre fiche de personnage (Tafl › Données › Réglages › Fiche des
// personnages) : quels blocs, dans quelles colonnes, des champs à lui (une jauge de Santé mentale,
// des points de Destin, une case « Inspiré »…) et son apparence. Elle vit dans reglages.jdr.fiche :
//
//   { active, colonnes: 1-3,
//     blocs:  [{ type, titre, colonne, champs: [ids] }]   type : voir BLOCS
//     champs: [{ id, nom, type, depart, max, formule, options, modifiable, visible, note }]
//     theme:  { perso, fond, texte, accent, cadre, police, image, opacite_image, bordure, coins } }
//
// Un champ : nombre, jauge (une valeur sur un max), texte, case à cocher ou liste de choix. Une formule
// (« 10 + mod_con * 2 ») calcule un nombre, ou le max d'une jauge : elle lit le niveau, la maîtrise,
// les PV, la CA, chaque caractéristique (« con ») et son modificateur (« mod_con »), et les champs
// placés avant (une jauge : « sante », « sante_max »). Pas d'eval : un petit calcul à la main.
// modifiable : 'joueur' (le joueur et le MJ) ou 'mj' (le MJ seulement) ; visible : 'tous' ou 'mj'.
// Les valeurs d'un personnage sont gardées dans la partie (membre.champs = { id: valeur }).
//
// Ce fichier normalise la fiche, fait les calculs et la dessine (en HTML) : Tafl s'en sert pour son
// aperçu, Saga pour l'écran des joueurs et la fenêtre du MJ. Rien ne touche à la partie ici.

const FichePerso = (() => {
  const TYPES = [['nombre', 'Nombre'], ['jauge', 'Jauge (une valeur sur un max)'], ['texte', 'Texte'], ['case', 'Case à cocher'], ['liste', 'Liste de choix']];
  const BLOCS = [
    ['entete', 'En-tête : nom, PV, CA, états'], ['caracs', 'Caractéristiques'], ['competences', 'Compétences'],
    ['attaques', 'Attaques'], ['sac', 'Sac du groupe'], ['actions', 'Actions hors combat'], ['champs', 'Champs du jeu'], ['notes', 'Notes'],
  ];
  const TITRES = { entete: '', caracs: 'Caractéristiques', competences: 'Compétences', attaques: 'Attaques', sac: 'Sac', actions: 'Actions', champs: 'Fiche', notes: 'Notes' };
  const POLICES = [['systeme', 'Celle de Saga'], ['serif', 'Livre (avec empattements)'], ['mono', 'Machine à écrire'], ['arrondie', 'Arrondie'], ['manuscrite', 'Manuscrite']];
  const FAMILLES = { systeme: '', serif: 'Georgia, "Times New Roman", serif', mono: '"Courier New", ui-monospace, monospace', arrondie: '"Trebuchet MS", "Segoe UI", sans-serif', manuscrite: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' };
  const THEME = { perso: false, fond: '#1a1c24', texte: '#ece8e1', accent: '#d4a95a', cadre: '#454b5a', police: 'systeme', image: '', opacite_image: 30, bordure: 1, coins: 10 };
  // Les noms que lisent les formules, en plus des caractéristiques : un champ ne peut pas les prendre.
  const RESERVES = new Set(['niveau', 'maitrise', 'pv', 'pv_max', 'ca', 'min', 'max', 'floor', 'ceil', 'round', 'abs']);
  const FONCTIONS = { min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs };

  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v, n = 80) => (typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' ? String(v).slice(0, n) : '');
  const int = (v, d, a, b) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== '' && v !== null && v !== undefined ? Math.max(a, Math.min(b, n)) : d; };
  const pick = (v, l, d) => (l.some(([k]) => k === v) ? v : d);
  const couleur = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
  const idChamp = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z]+|_+$/g, '').slice(0, 32);

  // L'image de fond : une image du jeu, gardée dans la fiche (Tafl la réduit en JPEG à l'import).
  const imagePropre = (v) => (typeof v === 'string' && v.length < 3e6 && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(v) ? v : '');

  // --- Normaliser (Tafl à l'enregistrement, Saga à la lecture) ---
  function normChamp(c, id) {
    const type = pick(c.type, TYPES, 'nombre');
    const out = { id, nom: str(c.nom, 40) || id, type, modifiable: c.modifiable === 'mj' ? 'mj' : 'joueur', visible: c.visible === 'mj' ? 'mj' : 'tous' };
    const formule = str(c.formule, 200).trim();
    if (formule && (type === 'nombre' || type === 'jauge')) out.formule = formule;
    if (type === 'nombre') out.depart = int(c.depart, 0, -99999, 99999);
    else if (type === 'jauge') {
      out.max = int(c.max, 10, 0, 99999);
      // Sans valeur de départ, la jauge part pleine.
      if (c.depart !== '' && c.depart !== null && c.depart !== undefined && Number.isFinite(Number(c.depart))) out.depart = int(c.depart, 0, 0, 99999);
    } else if (type === 'texte') out.depart = str(c.depart, 200);
    else if (type === 'case') out.depart = Boolean(c.depart);
    else {
      out.options = [...new Set(arr(c.options).map((o) => str(o, 40).trim()).filter(Boolean))].slice(0, 20);
      if (!out.options.length) out.options = ['Oui', 'Non'];
      out.depart = out.options.includes(c.depart) ? c.depart : out.options[0];
    }
    const note = str(c.note, 120).trim();
    if (note) out.note = note;
    return out;
  }
  function normaliser(f) {
    if (!f || typeof f !== 'object') return undefined;
    const champs = [], vus = new Set();
    for (const c of arr(f.champs)) {
      if (!c || typeof c !== 'object') continue;
      const id = idChamp(c.id || c.nom);
      if (!id || vus.has(id) || RESERVES.has(id) || id.startsWith('mod_')) continue;
      vus.add(id);
      champs.push(normChamp(c, id));
    }
    const colonnes = int(f.colonnes, 1, 1, 3);
    let blocs = arr(f.blocs).filter((b) => b && BLOCS.some(([k]) => k === b.type)).slice(0, 24).map((b) => ({
      type: b.type, titre: str(b.titre, 40), colonne: int(b.colonne, 1, 1, 3),
      ...(b.type === 'champs' ? { champs: [...new Set(arr(b.champs).filter((x) => vus.has(x)))] } : {}),
    }));
    if (!blocs.length) blocs = defaut().blocs;
    const t = f.theme && typeof f.theme === 'object' ? f.theme : {};
    const theme = {
      perso: Boolean(t.perso), fond: couleur(t.fond, THEME.fond), texte: couleur(t.texte, THEME.texte), accent: couleur(t.accent, THEME.accent), cadre: couleur(t.cadre, THEME.cadre),
      police: pick(t.police, POLICES, THEME.police), image: imagePropre(t.image), opacite_image: int(t.opacite_image, THEME.opacite_image, 0, 100),
      bordure: int(t.bordure, THEME.bordure, 0, 6), coins: int(t.coins, THEME.coins, 0, 24),
    };
    return { active: f.active !== false, colonnes, blocs, champs, theme };
  }
  // La fiche de Saga, refaite en blocs : le point de départ d'une fiche à soi.
  function defaut() {
    return {
      active: true, colonnes: 1, champs: [], theme: { ...THEME },
      blocs: [{ type: 'entete', titre: '', colonne: 1 }, { type: 'caracs', titre: '', colonne: 1 }, { type: 'competences', titre: '', colonne: 1 },
        { type: 'attaques', titre: '', colonne: 1 }, { type: 'sac', titre: '', colonne: 1 }, { type: 'actions', titre: '', colonne: 1 }],
    };
  }
  // Les champs qu'aucun bloc « Champs du jeu » ne nomme vont dans le premier d'entre eux (sans liste : tous).
  function champsDuBloc(fiche, b) {
    const blocs = fiche.blocs.filter((x) => x.type === 'champs');
    const nommes = new Set(blocs.flatMap((x) => x.champs || []));
    const ids = [...(b.champs || [])];
    if (b === blocs[0]) for (const c of fiche.champs) if (!nommes.has(c.id)) ids.push(c.id);
    return ids;
  }

  // --- Les formules : + - * / ( ), des nombres, des noms et min max floor ceil round abs ---
  function lexer(t) {
    const out = [];
    const s = String(t || '').replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/(\d),(\d)/g, '$1.$2');
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      const nb = s.slice(i).match(/^\d+(\.\d+)?/);
      if (nb) { out.push({ t: 'n', v: Number(nb[0]) }); i += nb[0].length; continue; }
      const nom = s.slice(i).match(/^[a-z_][a-z0-9_]*/i);
      if (nom) { out.push({ t: 'id', v: nom[0].toLowerCase() }); i += nom[0].length; continue; }
      if ('+-*/(),;'.includes(ch)) { out.push({ t: ch === ';' ? ',' : ch }); i++; continue; }
      throw new Error(`Caractère inattendu : « ${ch} »`);
    }
    return out;
  }
  // Rend une fonction (vars) → nombre, ou lève une erreur lisible. inconnus : les noms qui manquent.
  function compiler(texte) {
    const l = lexer(texte);
    if (l.length > 200) throw new Error('Formule trop longue');
    let i = 0;
    const voir = () => l[i], prendre = (t) => { if (l[i]?.t !== t) throw new Error(t === ')' ? 'Il manque une parenthèse fermante' : `« ${t} » attendu`); i++; };
    function somme() {
      let g = produit();
      while (voir()?.t === '+' || voir()?.t === '-') { const op = l[i++].t, a = g, b = produit(); g = op === '+' ? (v) => a(v) + b(v) : (v) => a(v) - b(v); }
      return g;
    }
    function produit() {
      let g = unaire();
      while (voir()?.t === '*' || voir()?.t === '/') { const op = l[i++].t, a = g, b = unaire(); g = op === '*' ? (v) => a(v) * b(v) : (v) => { const d = b(v); return d ? a(v) / d : 0; }; }
      return g;
    }
    function unaire() {
      if (voir()?.t === '-') { i++; const a = unaire(); return (v) => -a(v); }
      if (voir()?.t === '+') { i++; return unaire(); }
      return terme();
    }
    function terme() {
      const x = l[i++];
      if (!x) throw new Error('La formule s\'arrête trop tôt');
      if (x.t === 'n') return () => x.v;
      if (x.t === '(') { const g = somme(); prendre(')'); return g; }
      if (x.t === 'id') {
        if (voir()?.t === '(') {
          const f = FONCTIONS[x.v];
          if (!f) throw new Error(`Fonction inconnue : ${x.v}`);
          i++;
          const args = [somme()];
          while (voir()?.t === ',') { i++; args.push(somme()); }
          prendre(')');
          return (v) => f(...args.map((a) => a(v)));
        }
        return (v) => { if (!(x.v in v)) throw new Error(`Nom inconnu : ${x.v}`); return Number(v[x.v]) || 0; };
      }
      throw new Error('Formule mal écrite');
    }
    if (!l.length) throw new Error('Formule vide');
    const g = somme();
    if (i < l.length) throw new Error('Formule mal écrite (quelque chose en trop)');
    return g;
  }
  const cache = new Map();
  function calculer(texte, vars) {
    let g = cache.get(texte);
    if (!g) { g = compiler(texte); if (cache.size > 200) cache.clear(); cache.set(texte, g); }
    const n = g(vars);
    return Number.isFinite(n) ? Math.floor(n + 1e-9) : 0;
  }
  // Pour Tafl : « » si la formule est juste avec ces noms, sinon ce qui ne va pas.
  function verifier(texte, noms) {
    try { calculer(texte, Object.fromEntries([...noms].map((n) => [n, 10]))); return ''; } catch (e) { return e.message; }
  }
  // Les noms qu'une formule de ce champ peut lire : les nombres de base, puis les champs d'avant.
  function nomsPour(fiche, idChampVise, caracs) {
    const noms = new Set(['niveau', 'maitrise', 'pv', 'pv_max', 'ca']);
    for (const k of caracs) { noms.add(k); noms.add(`mod_${k}`); }
    for (const c of fiche?.champs || []) {
      if (c.id === idChampVise) break;
      if (c.type === 'texte') continue;
      noms.add(c.id);
      if (c.type === 'jauge') noms.add(`${c.id}_max`);
    }
    return noms;
  }

  // --- Les valeurs d'un personnage ---
  // base : { niveau, maitrise, pv, pv_max, ca, caracs: { id: valeur } } ; gardees : membre.champs.
  // Rend [{ ...champ, valeur, max?, calcule, erreur? }] dans l'ordre des champs.
  function valeurs(fiche, base = {}, gardees = {}) {
    const vars = { niveau: base.niveau || 1, maitrise: base.maitrise || 2, pv: base.pv || 0, pv_max: base.pv_max || 0, ca: base.ca || 10 };
    for (const [k, v] of Object.entries(base.caracs || {})) { vars[k] = v; vars[`mod_${k}`] = Math.floor((Number(v) - 10) / 2); }
    const g = gardees && typeof gardees === 'object' ? gardees : {};
    const out = [];
    for (const c of fiche?.champs || []) {
      const r = { ...c, calcule: false };
      const essai = (f, d) => { try { return calculer(f, vars); } catch (e) { r.erreur = e.message; return d; } };
      if (c.type === 'nombre') {
        if (c.formule) { r.valeur = essai(c.formule, c.depart || 0); r.calcule = true; } else r.valeur = Number.isFinite(Number(g[c.id])) ? Number(g[c.id]) : c.depart;
        vars[c.id] = r.valeur;
      } else if (c.type === 'jauge') {
        r.max = Math.max(0, c.formule ? essai(c.formule, c.max) : c.max);
        const v = Number.isFinite(Number(g[c.id])) ? Number(g[c.id]) : c.depart ?? r.max;
        r.valeur = Math.max(0, Math.min(r.max, v));
        vars[c.id] = r.valeur; vars[`${c.id}_max`] = r.max;
      } else if (c.type === 'case') { r.valeur = typeof g[c.id] === 'boolean' ? g[c.id] : Boolean(c.depart); vars[c.id] = r.valeur ? 1 : 0; }
      else if (c.type === 'liste') { r.valeur = c.options.includes(g[c.id]) ? g[c.id] : c.depart; vars[c.id] = c.options.indexOf(r.valeur) + 1; }
      else r.valeur = typeof g[c.id] === 'string' ? g[c.id] : c.depart;
      out.push(r);
    }
    return out;
  }
  // Une nouvelle valeur demandée (par un joueur, le MJ, un événement) : la valeur propre, ou undefined
  // si elle n'a pas de sens (un champ calculé, une option qui n'existe pas).
  function valeurPropre(c, v, max) {
    if (!c || ((c.type === 'nombre') && c.formule)) return undefined;
    if (c.type === 'nombre') return Number.isFinite(Number(v)) ? int(v, 0, -99999, 99999) : undefined;
    if (c.type === 'jauge') return Number.isFinite(Number(v)) ? Math.max(0, Math.min(Number.isFinite(max) ? max : 99999, Math.round(Number(v)))) : undefined;
    if (c.type === 'case') return Boolean(v);
    if (c.type === 'liste') return c.options.includes(v) ? v : undefined;
    return str(v, 200);
  }

  // --- Dessiner la fiche (HTML) ---
  // d : la fiche lue (nom, niveau, pv, pvMax, ca, etats, caracs, competences, attaques, sac, argent,
  //     actions, notes, champs : les valeurs de valeurs(), avec `modifiable` vrai/faux pour qui regarde)
  // o : { jet(sorte, id, quoi), utiliser(objet), agir(id), changer(id, valeur), occupe, combat, mj }
  //     sans jet / utiliser / agir / changer, les boutons ne sont pas là (l'aperçu de Tafl, le MJ).
  function el(tag, props = {}, ...enfants) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('data-')) e.setAttribute(k, v);
      else e[k] = v;
    }
    for (const x of enfants.flat()) if (x != null && x !== false) e.append(x);
    return e;
  }
  const signe = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
  function bouton(texte, f, titre = '', classe = '') {
    const b = el('button', { type: 'button', className: `fp-bouton ${classe}`.trim(), textContent: texte, title: titre, disabled: !f });
    if (f) b.onclick = (e) => { e.stopPropagation(); f(); };
    return b;
  }
  function blocChamps(fiche, b, d, o) {
    const parId = new Map((d.champs || []).map((c) => [c.id, c]));
    const corps = [];
    for (const id of champsDuBloc(fiche, b)) {
      const c = parId.get(id);
      if (!c) continue;
      const peut = Boolean(o.changer && c.modifiable && !c.calcule);
      const ch = (v) => o.changer(c.id, v);
      let valeur;
      if (c.type === 'jauge') {
        const k = c.max ? c.valeur / c.max : 0;
        valeur = el('div', { className: 'fp-jauge-ligne' },
          peut ? bouton('−', () => ch(c.valeur - 1), 'Retirer 1') : null,
          el('div', { className: 'fp-jauge', title: `${c.valeur} / ${c.max}` }, el('i', { style: { width: `${Math.round(k * 100)}%` } }), el('span', { textContent: `${c.valeur} / ${c.max}` })),
          peut ? bouton('+', () => ch(c.valeur + 1), 'Ajouter 1') : null);
      } else if (c.type === 'nombre') {
        valeur = peut
          ? el('div', { className: 'fp-compteur' }, bouton('−', () => ch(c.valeur - 1), 'Retirer 1'), el('b', { textContent: String(c.valeur) }), bouton('+', () => ch(c.valeur + 1), 'Ajouter 1'))
          : el('b', { className: 'fp-valeur', textContent: String(c.valeur), title: c.calcule ? `= ${c.formule}` : '' });
      } else if (c.type === 'case') {
        const i = el('input', { type: 'checkbox', checked: Boolean(c.valeur), disabled: !peut });
        if (peut) i.onchange = () => ch(i.checked);
        valeur = i;
      } else if (c.type === 'liste') {
        if (peut) {
          const s = el('select', { className: 'fp-choix' }, c.options.map((x) => el('option', { value: x, textContent: x, selected: x === c.valeur })));
          s.onchange = () => ch(s.value);
          valeur = s;
        } else valeur = el('b', { className: 'fp-valeur', textContent: c.valeur });
      } else if (peut) {
        const t = el('input', { type: 'text', className: 'fp-texte', value: c.valeur, maxLength: 200 });
        t.onchange = () => ch(t.value);
        valeur = t;
      } else valeur = el('span', { className: 'fp-valeur texte', textContent: c.valeur || '—' });
      corps.push(el('div', { className: `fp-ligne fp-champ ${c.type}${c.visible === 'mj' ? ' secret' : ''}`, title: c.note || '' },
        el('span', { className: 'fp-nom', textContent: c.nom }), valeur));
    }
    if (!corps.length) corps.push(el('p', { className: 'fp-note', textContent: 'Aucun champ.' }));
    return corps;
  }
  function contenuBloc(fiche, b, d, o) {
    const occupe = Boolean(o.occupe);
    if (b.type === 'entete') {
      return [
        el('div', { className: 'fp-tete' }, el('b', { className: 'fp-titre', textContent: d.nom || '' }),
          d.sousTitre ? el('small', { textContent: d.sousTitre }) : null),
        el('div', { className: 'fp-pastilles' },
          el('span', { className: 'fp-pastille pv', textContent: `${d.pv ?? 0} / ${d.pvMax ?? 0} PV` }),
          el('span', { className: 'fp-pastille', textContent: `CA ${d.ca ?? 10}` }),
          d.niveau ? el('span', { className: 'fp-pastille', textContent: `Niv. ${d.niveau}` }) : null),
        d.etats?.length ? el('div', { className: 'fp-etats', textContent: d.etats.join(', ') }) : null,
      ];
    }
    if (b.type === 'caracs') {
      return (d.caracs || []).map((c) => el('div', { className: 'fp-ligne' },
        el('span', { className: 'fp-nom', textContent: `${c.nom} ${c.valeur}` }),
        bouton(signe(c.mod), o.jet && (() => o.jet('test', c.id, c.nom)), 'Lancer un test de cette caractéristique'),
        bouton(`Sauv. ${signe(c.sauvegarde)}`, o.jet && (() => o.jet('sauvegarde', c.id, '')), 'Lancer une sauvegarde')));
    }
    if (b.type === 'competences') {
      return (d.competences || []).map((c) => el('div', { className: `fp-ligne${c.maitrise ? ' maitrise' : ''}` },
        el('span', { className: 'fp-nom', textContent: c.nom }),
        bouton(signe(c.bonus), o.jet && (() => o.jet('test', c.id, c.nom)), 'Lancer ce test')));
    }
    if (b.type === 'attaques') {
      const l = (d.attaques || []).map((a) => el('div', { className: 'fp-ligne' },
        el('span', { className: 'fp-nom', textContent: a.nom }),
        el('small', { textContent: `${signe(a.bonus)} · ${a.des}${a.mod ? ` ${signe(a.mod)}` : ''}` })));
      if (o.jet) l.push(el('p', { className: 'fp-note', textContent: 'En combat, à ton tour, tes actions s\'affichent ici : choisis, puis clique la case ou la cible sur le plateau.' }));
      return l;
    }
    if (b.type === 'sac') {
      const l = [el('div', { className: 'fp-note', textContent: `Sac du groupe · ${d.argent || 0} pièce${(d.argent || 0) > 1 ? 's' : ''}` })];
      if (!d.sac?.length) l.push(el('p', { className: 'fp-note', textContent: 'Le sac est vide.' }));
      for (const x of d.sac || []) {
        l.push(el('div', { className: 'fp-ligne' }, el('span', { className: 'fp-nom', textContent: `${x.nom} ×${x.n}`, title: x.detail || '' }),
          x.utilisable && o.utiliser ? bouton('Utiliser', occupe ? null : () => o.utiliser(x.id), 'Utiliser cet objet') : null));
      }
      return l;
    }
    if (b.type === 'actions') {
      const l = (d.actions || []).map((a) => {
        const x = el('button', { type: 'button', className: `fp-action${a.id === 'niveau' ? ' actif' : ''}`, disabled: occupe || !o.agir, textContent: a.texte });
        if (o.agir) x.onclick = () => o.agir(a.id);
        return x;
      });
      if (!l.length) l.push(el('p', { className: 'fp-note', textContent: 'Rien à faire pour l\'instant.' }));
      if (o.combat) l.push(el('p', { className: 'fp-note', textContent: 'En combat, tout se fait à ton tour.' }));
      return l;
    }
    if (b.type === 'notes') return [el('p', { className: 'fp-note libre', textContent: d.notes || 'Pas de notes.' })];
    return blocChamps(fiche, b, d, o);
  }
  // L'apparence, en variables CSS posées sur la fiche (fp-perso : le jeu a choisi la sienne).
  function appliquerTheme(e, theme, image) {
    const t = theme || THEME;
    e.classList.toggle('fp-perso', Boolean(t.perso));
    if (!t.perso) return;
    e.style.setProperty('--fp-fond', t.fond);
    e.style.setProperty('--fp-texte', t.texte);
    e.style.setProperty('--fp-accent', t.accent);
    e.style.setProperty('--fp-cadre', t.cadre);
    e.style.setProperty('--fp-bordure', `${t.bordure}px`);
    e.style.setProperty('--fp-coins', `${t.coins}px`);
    if (FAMILLES[t.police]) e.style.setProperty('--fp-police', FAMILLES[t.police]);
    if (image) { e.style.setProperty('--fp-image', `url("${String(image).replace(/["\\]/g, '')}")`); e.style.setProperty('--fp-opacite', String(t.opacite_image / 100)); e.classList.add('fp-avec-image'); }
  }
  // image : l'adresse de l'image de fond (le chemin du jeu traduit par qui affiche).
  function rendre(fiche, d, o = {}) {
    styles();
    const f = fiche || defaut();
    const racine = el('div', { className: `fiche-perso fp-col-${f.colonnes}` });
    appliquerTheme(racine, f.theme, o.image);
    const colonnes = Array.from({ length: f.colonnes }, () => el('div', { className: 'fp-colonne' }));
    for (const b of f.blocs) {
      const titre = b.titre || TITRES[b.type];
      colonnes[Math.min(f.colonnes, b.colonne) - 1].append(el('section', { className: `fp-bloc fp-${b.type}` },
        titre ? el('h4', { className: 'fp-bloc-titre', textContent: titre }) : null, contenuBloc(f, b, d, o)));
    }
    racine.append(...colonnes);
    // La boîte autour mesure la place : sur un écran étroit, les colonnes passent l'une sous l'autre.
    return el('div', { className: 'fiche-perso-boite' }, racine);
  }

  // Le style, posé une fois dans la page (Tafl et Saga n'ont pas la même feuille).
  function styles() {
    if (typeof document === 'undefined' || document.getElementById('fiche-perso-style')) return;
    const s = document.createElement('style');
    s.id = 'fiche-perso-style';
    s.textContent = `
.fiche-perso { --fp-fond: transparent; --fp-texte: inherit; --fp-accent: #7cc4ff; --fp-cadre: rgba(255,255,255,.12); --fp-bordure: 1px; --fp-coins: 10px; --fp-police: inherit;
  position: relative; display: grid; gap: 10px; color: var(--fp-texte); font-family: var(--fp-police); }
.fiche-perso-boite { container-type: inline-size; }
.fiche-perso.fp-col-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.fiche-perso.fp-col-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@container (max-width: 460px) { .fiche-perso.fp-col-2, .fiche-perso.fp-col-3 { grid-template-columns: minmax(0, 1fr); } }
.fiche-perso.fp-perso { background: var(--fp-fond); border: var(--fp-bordure) solid var(--fp-cadre); border-radius: var(--fp-coins); padding: 10px; isolation: isolate; overflow: hidden; }
.fiche-perso.fp-avec-image::before { content: ''; position: absolute; inset: 0; z-index: -1; background: var(--fp-image) center / cover no-repeat; opacity: var(--fp-opacite, .3); pointer-events: none; }
.fp-colonne { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.fp-bloc { border: var(--fp-bordure) solid var(--fp-cadre); border-radius: var(--fp-coins); padding: 8px 10px; background: rgba(0,0,0,.12); min-width: 0; }
.fp-entete { border: none; background: none; padding: 2px 0; }
.fp-bloc-titre { margin: 0 0 6px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--fp-accent); font-weight: 600; }
.fp-tete { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.fp-titre { font-size: 16px; }
.fp-tete small { opacity: .7; }
.fp-pastilles { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.fp-pastille { padding: 2px 8px; border-radius: 999px; border: var(--fp-bordure) solid var(--fp-cadre); font-size: 12px; }
.fp-pastille.pv { border-color: var(--fp-accent); }
.fp-etats { margin-top: 6px; font-size: 12px; color: #c9a7ff; }
.fp-ligne { display: flex; align-items: center; gap: 6px; padding: 3px 0; min-height: 26px; }
.fp-ligne + .fp-ligne { border-top: 1px solid color-mix(in srgb, var(--fp-cadre) 50%, transparent); }
.fp-ligne.maitrise .fp-nom::before { content: '● '; color: var(--fp-accent); }
.fp-ligne small { opacity: .75; font-size: 12px; }
.fp-nom { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.fp-champ.secret .fp-nom::after { content: ' (MJ)'; opacity: .55; font-size: 11px; }
.fp-bouton { font: inherit; font-size: 12px; color: inherit; background: color-mix(in srgb, var(--fp-accent) 14%, transparent); border: 1px solid color-mix(in srgb, var(--fp-accent) 45%, transparent);
  border-radius: calc(var(--fp-coins) * .6); padding: 2px 8px; cursor: pointer; min-width: 28px; }
.fp-bouton:hover:not(:disabled) { background: color-mix(in srgb, var(--fp-accent) 30%, transparent); }
.fp-bouton:disabled { cursor: default; opacity: .8; }
.fp-action { display: block; width: 100%; text-align: left; font: inherit; color: inherit; background: rgba(255,255,255,.05); border: 1px solid var(--fp-cadre); border-radius: calc(var(--fp-coins) * .6); padding: 6px 10px; margin: 4px 0; cursor: pointer; }
.fp-action.actif { border-color: var(--fp-accent); }
.fp-action:disabled { opacity: .5; cursor: default; }
.fp-note { margin: 4px 0; font-size: 12px; opacity: .7; }
.fp-note.libre { white-space: pre-wrap; opacity: .9; }
.fp-valeur { font-variant-numeric: tabular-nums; }
.fp-valeur.texte { font-weight: normal; opacity: .9; text-align: right; }
.fp-compteur { display: flex; align-items: center; gap: 6px; }
.fp-compteur b { min-width: 2ch; text-align: center; font-variant-numeric: tabular-nums; }
.fp-jauge-ligne { display: flex; align-items: center; gap: 6px; flex: 1.4; min-width: 0; }
.fp-jauge { position: relative; flex: 1; height: 18px; min-width: 60px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid var(--fp-cadre); overflow: hidden; }
.fp-jauge i { position: absolute; inset: 0 auto 0 0; background: var(--fp-accent); opacity: .65; transition: width .2s; }
.fp-jauge span { position: relative; display: block; text-align: center; font-size: 11px; line-height: 16px; font-variant-numeric: tabular-nums; }
.fp-texte, .fp-choix { font: inherit; font-size: 12px; color: inherit; background: rgba(0,0,0,.2); border: 1px solid var(--fp-cadre); border-radius: 6px; padding: 2px 6px; max-width: 55%; }
.fp-choix option { color: #111; }
`;
    document.head.append(s);
  }

  return { TYPES, BLOCS, TITRES, POLICES, THEME, RESERVES, normaliser, defaut, champsDuBloc, idChamp, calculer, verifier, nomsPour, valeurs, valeurPropre, rendre, styles };
})();
if (typeof module !== 'undefined') module.exports = FichePerso;
