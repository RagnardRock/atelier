// Le mode table (Saga 1.32) : les outils d'une séance, à la Roll20. Les jets tapés dans le chat (/r),
// les macros, les marques sur les pions, la règle, les gabarits de zone et le ping.
//
// Deux parties dans ce fichier :
//   - des calculs purs (sans écran), utilisés par l'hôte et testables sous Node :
//       commande(texte)                    « /r 2d6+3 Épée » → { sorte: 'jet', formule, quoi, cache } ou { sorte: 'macro', nom } ou null
//       remplacer(formule, refs)           « 1d20+@dex » → « 1d20+3 » (refs : { dex: 3, … }), ou { erreur }
//       casesGabarit(carte, g, diag)       les index des cases couvertes par un gabarit
//       marquesDispo(jeu)                  les marques qu'on peut poser : les états du jeu, puis des couleurs
//   - la barre d'outils des deux écrans (celui du MJ et celui des joueurs) : barre({ … }).
//
// Un gabarit : { id, forme: 'cercle'|'cone'|'ligne'|'carre', x, y (l'origine, ou le centre), vx, vy (la
// case visée, pour le cône et la ligne), taille (en cases), auteur, couleur, anim (Saga 1.49 : '' ou une
// des ANIMS), duree (secondes, 0 : il reste), fin (l'heure de l'hôte où il s'efface) }. Tout ce que voit un écran
// vient de la vue (table/etat.js) : l'écran d'un téléphone (le futur compagnon) n'a qu'à la dessiner.

const TableOutils = (() => {
  const FORMES = [['cercle', 'Cercle (rayon)', 6], ['cone', 'Cône', 4.5], ['ligne', 'Ligne', 9], ['carre', 'Cube (côté)', 3]];
  const COULEURS = [['rouge', 'Rouge', '#ef5b5b'], ['orange', 'Orange', '#f0a04c'], ['jaune', 'Jaune', '#f2d14c'], ['vert', 'Vert', '#6fd17d'], ['bleu', 'Bleu', '#5ea8ff'], ['violet', 'Violet', '#a77bff']];
  // Saga 1.49 : les animations d'un gabarit (dessinées par le plateau), et combien de temps il reste.
  const ANIMS = [['', 'Sans animation'], ['flammes', 'Flammes'], ['eau', 'Eau'], ['magie', 'Magie'], ['coeurs', 'Cœurs'], ['glace', 'Glace'], ['poison', 'Poison'], ['eclairs', 'Éclairs']];
  const DUREES = [[3, '3 s'], [5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min'], [0, 'Il reste']];
  const DUREE_DEFAUT = 5;

  // --- Le chat : /r (ou /roll) jet public, /gr (ou /mj) jet secret pour le MJ, /m nom : une macro ---
  function commande(texte) {
    const t = String(texte || '').trim();
    const m = t.match(/^\/(r|roll|gr|mj|m|macro)(?:\s+(.*))?$/i);
    if (!m) return null;
    const mot = m[1].toLowerCase(), reste = (m[2] || '').trim();
    if (mot === 'm' || mot === 'macro') return reste ? { sorte: 'macro', nom: reste } : null;
    // La formule : tout ce qui ressemble à des dés au début (espaces permis autour des + et -), puis le « pour quoi ».
    const f = reste.match(/^((?:[+-]?\s*(?:\d*d\d+|\d+|@[a-z0-9_]+)\s*)+(?:[*x×]\s*\d+)?)(.*)$/i);
    const formule = f ? f[1].replace(/\s+/g, '') : '1d20';
    const quoi = (f ? f[2] : reste).trim();
    return { sorte: 'jet', formule: formule || '1d20', quoi, cache: mot === 'gr' || mot === 'mj' };
  }
  // Les @ d'une formule : les modificateurs du héros qui lance (@for, @dex…, @maitrise, @niveau).
  function remplacer(formule, refs = {}) {
    let erreur = '';
    const out = String(formule || '').replace(/@([a-z0-9_]+)/gi, (_, k) => {
      const v = refs[k.toLowerCase()];
      if (!Number.isFinite(v)) { erreur = erreur || `@${k} inconnu`; return '0'; }
      return v < 0 ? `-${Math.abs(v)}` : `+${v}`;
    }).replace(/^\+/, '').replace(/([+-])\+/g, '$1').replace(/\+-/g, '-').replace(/--/g, '+');
    return erreur ? { erreur } : { formule: out };
  }
  // Ce que valent les @ pour un héros (avec les règles du pack JDR).
  function refsHeros(jeu, c) {
    const r = {};
    if (!c || typeof JdrPerso === 'undefined') return r;
    for (const x of JdrBase.caracteristiques(jeu)) r[x.id] = JdrBase.mod(JdrPerso.carac(jeu, c, x.id));
    r.maitrise = r.pb = JdrPerso.pb(c);
    r.niveau = Number(c.niveau) || 1;
    // Les champs chiffrés de la fiche du jeu (Tafl › Fiche des personnages) : @sante_mentale, @armure…
    // (un tiret de l'id devient un tiret bas). Ils ne remplacent pas les caractéristiques.
    if (typeof JdrFiches !== 'undefined') {
      try {
        for (const x of JdrFiches.champs(jeu, c) || []) {
          const k = String(x.id || '').toLowerCase().replace(/-/g, '_');
          if (k && !(k in r) && Number.isFinite(Number(x.valeur)) && x.valeur !== '' && typeof x.valeur !== 'boolean') r[k] = Math.round(Number(x.valeur));
        }
      } catch { /* une fiche sans champs */ }
    }
    if (JdrPerso.lanceur(jeu, c)) { r.magie = JdrPerso.attaqueSorts(jeu, c); r.dd = JdrPerso.ddSorts(jeu, c); }
    return r;
  }

  // --- Les gabarits sur la grille ---
  function casesGabarit(carte, g, diagonales = 'simple') {
    const out = [];
    const n = Math.max(1, Math.min(60, Math.round(Number(g.taille) || 1)));
    const W = carte.largeur, H = carte.hauteur;
    const ajouter = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) out.push(y * W + x); };
    if (g.forme === 'cercle') {
      for (let y = g.y - n; y <= g.y + n; y++) for (let x = g.x - n; x <= g.x + n; x++) {
        const dx = Math.abs(x - g.x), dy = Math.abs(y - g.y), grand = Math.max(dx, dy), petit = Math.min(dx, dy);
        if ((diagonales === 'alternees' ? grand + Math.floor(petit / 2) : grand) <= n) ajouter(x, y);
      }
      return out;
    }
    if (g.forme === 'carre') {
      const a = Math.floor((n - 1) / 2), b = n - 1 - a;
      for (let y = g.y - a; y <= g.y + b; y++) for (let x = g.x - a; x <= g.x + b; x++) ajouter(x, y);
      return out;
    }
    // Le cône et la ligne partent de l'origine vers la case visée.
    let vx = Number(g.vx) - g.x, vy = Number(g.vy) - g.y;
    const l = Math.hypot(vx, vy);
    if (!l) { vx = 0; vy = 1; } else { vx /= l; vy /= l; }
    for (let y = g.y - n; y <= g.y + n; y++) for (let x = g.x - n; x <= g.x + n; x++) {
      if (x === g.x && y === g.y) continue;
      const px = x - g.x, py = y - g.y;
      const avant = px * vx + py * vy; // le long de la direction
      const cote = Math.abs(px * vy - py * vx);
      if (avant <= 0 || avant > n + 0.01) continue;
      // Un cône de la 5e est aussi large que long : un demi-angle d'atan(1/2).
      if (g.forme === 'cone' ? cote <= avant / 2 + 0.01 : cote <= 0.5) ajouter(x, y);
    }
    return out;
  }
  function normGabarit(a, carte) {
    const forme = FORMES.some(([f]) => f === a.forme) ? a.forme : 'cercle';
    const borne = (v, max) => Math.max(0, Math.min(max - 1, Math.round(Number(v) || 0)));
    return {
      forme, x: borne(a.x, carte.largeur), y: borne(a.y, carte.hauteur), vx: borne(a.vx ?? a.x, carte.largeur), vy: borne(a.vy ?? a.y, carte.hauteur),
      taille: Math.max(1, Math.min(60, Math.round(Number(a.taille) || 1))),
      couleur: COULEURS.some(([c]) => c === a.couleur) ? a.couleur : 'orange',
      anim: ANIMS.some(([x]) => x && x === a.anim) ? a.anim : '',
      duree: DUREES.some(([d]) => d === Number(a.duree)) ? Number(a.duree) : 0, // sans durée (anciens, scripts) : il reste
    };
  }
  const couleur = (id) => COULEURS.find(([c]) => c === id)?.[2] || '#f0a04c';

  // --- Les marques des pions : les états du jeu (empoisonné, à terre…), puis six couleurs ---
  function marquesDispo(jeu) {
    const etats = (jeu?.donnees?.etats?.etats || []).map((e) => ({ id: e.id, nom: e.nom || e.id, couleur: e.couleur || '' }));
    return [...etats, ...COULEURS.map(([id, nom, c]) => ({ id: `c-${id}`, nom: `Marque ${nom.toLowerCase()}`, couleur: c }))];
  }
  const PALETTE = ['#9b6bff', '#ef5b5b', '#f0a04c', '#6fd17d', '#5ea8ff', '#e86bd0', '#4cd4c8', '#c9b458'];
  function couleurMarque(m, i = 0) {
    if (m.couleur) return m.couleur;
    let h = 0;
    for (const ch of String(m.id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return PALETTE[Math.abs(h + i * 0) % PALETTE.length];
  }

  // --- La barre d'outils (les deux écrans) ---
  // o : { conteneur, caseM(), diagonales(), placer(gabarit), ping(case), effacer() (ses gabarits) }
  // Rend { appuyer(c, e) → true si l'outil prend le clic, bouger(c), lacher(c), dessin() (pour le plateau), outil }.
  function barre(o) {
    let outil = null;               // null | 'regle' | 'gabarit'
    let forme = 'cercle', metres = 6, teinte = 'orange', anim = '', duree = DUREE_DEFAUT;
    // Saga 1.49 : la couleur de mes pings ('' : la mienne), la règle que les autres voient (le MJ peut mesurer en secret).
    let teinteP = '', regleSecrete = false, envoiRegle = 0, regleEnvoyee = '';
    let trait = null;               // { de: { x, y }, a: { x, y }, gabarit: bool } pendant qu'on glisse
    const racine = el('div', { className: 'table-outils' });
    const boutonOutil = (id, icone, titre) => {
      const b = el('button', { className: 'table-outil', type: 'button', title: titre }, el('i', { className: `codicon codicon-${icone}` }));
      b.onclick = () => { outil = outil === id ? null : id; dessinerBarre(); };
      b.dataset.outil = id;
      return b;
    };
    // Saga 1.35 : un rail vertical à gauche ; chaque outil dit sa touche (data-touche, montrée au survol).
    const main = el('button', { className: 'table-outil', type: 'button', title: 'Choisir et déplacer les pions (V)' }, el('i', { className: 'codicon codicon-move' }));
    main.dataset.touche = 'V';
    main.onclick = () => { outil = null; dessinerBarre(); };
    const regle = boutonOutil('regle', 'symbol-ruler', 'Règle (R) : glisse sur le plateau pour mesurer. Maj + glisser marche aussi sans l\'outil.');
    regle.dataset.touche = 'R';
    const gab = boutonOutil('gabarit', 'circle-large-outline', 'Gabarit de zone (G) : clique le centre, ou glisse de l\'origine vers la direction pour un cône ou une ligne');
    gab.dataset.touche = 'G';
    const pingB = boutonOutil('ping', 'location', 'Ping (P) : montrer une case à tous. Alt + clic marche aussi sans l\'outil.');
    pingB.dataset.touche = 'P';
    // Saga 1.43 : le feutre (F) et les notes (T) ; le MJ choisit son calque (pour lui seul, ou pour tous).
    const feutreB = boutonOutil('feutre', 'edit', 'Feutre (F) : dessine sur le plateau');
    feutreB.dataset.touche = 'F';
    const noteB = boutonOutil('note', 'note', 'Note (T) : écris le texte, puis clique une case');
    noteB.dataset.touche = 'T';
    let calque = o.mj ? 'mj' : 'tous', teinteD = 'jaune';
    // Les boutons en plus de l'écran (le pinceau du MJ, le tapis de dés…) : { icone, titre, touche, faire(), actif() }.
    const extras = (o.extras || []).map((x) => {
      const b = el('button', { className: 'table-outil', type: 'button', title: x.titre }, el('i', { className: `codicon codicon-${x.icone}` }));
      if (x.touche) b.dataset.touche = x.touche;
      b.onclick = () => { x.faire(); dessinerBarre(); };
      return [b, x];
    });
    const choixForme = el('select', { className: 'table-outil-choix', title: 'La forme du gabarit' }, ...FORMES.map(([f, nom]) => el('option', { value: f, textContent: nom })));
    const champM = el('input', { className: 'table-outil-m', type: 'number', min: '0.5', step: '0.5', title: 'La taille, en mètres' });
    const choixTeinte = el('select', { className: 'table-outil-choix', title: 'La couleur' }, ...COULEURS.map(([c, nom]) => el('option', { value: c, textContent: nom })));
    const choixAnim = el('select', { className: 'table-outil-choix', title: 'Une animation sur la zone' }, ...ANIMS.map(([a, nom]) => el('option', { value: a, textContent: nom })));
    const choixDuree = el('select', { className: 'table-outil-choix', title: 'Combien de temps il reste' }, ...DUREES.map(([d, nom]) => el('option', { value: String(d), textContent: nom })));
    const choixTeinteP = el('select', { className: 'table-outil-choix', title: 'La couleur de mes pings' }, el('option', { value: '', textContent: 'Ma couleur' }), ...COULEURS.map(([c, nom]) => el('option', { value: c, textContent: nom })));
    const choixRegle = el('select', { className: 'table-outil-choix', title: 'Qui voit ta règle' }, el('option', { value: 'tous', textContent: 'Vue de tous' }), el('option', { value: 'mj', textContent: 'Secrète (moi seul)' }));
    choixAnim.onchange = () => { anim = choixAnim.value; };
    choixDuree.onchange = () => { duree = Number(choixDuree.value) || 0; };
    choixTeinteP.onchange = () => { teinteP = choixTeinteP.value; };
    choixRegle.onchange = () => { regleSecrete = choixRegle.value === 'mj'; };
    const reglagesP = el('span', { className: 'table-outil-reglages' }, choixTeinteP);
    const reglagesR = el('span', { className: 'table-outil-reglages' }, choixRegle);
    const effacer = el('button', { className: 'table-outil', type: 'button', title: 'Effacer mes gabarits' }, el('i', { className: 'codicon codicon-clear-all' }));
    const aide = el('span', { className: 'table-outil-aide', textContent: 'Alt + clic : ping' });
    choixForme.onchange = () => { forme = choixForme.value; metres = FORMES.find(([f]) => f === forme)[2]; dessinerBarre(); };
    champM.onchange = () => { metres = Math.max(0.5, Number(champM.value) || 1.5); };
    choixTeinte.onchange = () => { teinte = choixTeinte.value; };
    effacer.onclick = () => o.effacer?.();
    const reglages = el('span', { className: 'table-outil-reglages' }, choixForme, champM, el('small', { textContent: 'm' }), choixTeinte, choixAnim, choixDuree);
    const choixTeinteD = el('select', { className: 'table-outil-choix', title: 'La couleur du feutre' }, ...COULEURS.map(([c, nom]) => el('option', { value: c, textContent: nom })));
    const champNote = el('input', { className: 'table-outil-texte', type: 'text', maxLength: 120, placeholder: 'Texte de la note', title: 'Le texte de la note' });
    const choixCalque = el('select', { className: 'table-outil-choix', title: 'Qui voit ce que tu dessines' },
      el('option', { value: 'mj', textContent: 'Calque du MJ (moi seul)' }), el('option', { value: 'tous', textContent: 'Pour tous' }));
    const effacerD = el('button', { className: 'table-outil', type: 'button', title: o.mj ? 'Effacer les dessins et notes de ce calque' : 'Effacer mes dessins et notes' }, el('i', { className: 'codicon codicon-trash' }));
    choixTeinteD.onchange = () => { teinteD = choixTeinteD.value; };
    choixCalque.onchange = () => { calque = choixCalque.value; };
    effacerD.onclick = () => o.effacerDessins?.(o.mj ? calque : '');
    if (!o.mj) choixCalque.hidden = true;
    const reglagesD = el('span', { className: 'table-outil-reglages' }, choixTeinteD, champNote, choixCalque, effacerD);
    racine.append(main, regle, gab, pingB, feutreB, noteB, effacer, ...(extras.length ? [el('span', { className: 'table-outil-sep' }), ...extras.map(([b]) => b)] : []), reglages, reglagesD, reglagesP, ...(o.mj ? [reglagesR] : []), aide);
    o.conteneur.append(racine);
    function dessinerBarre() {
      for (const b of [regle, gab, pingB, feutreB, noteB]) b.classList.toggle('actif', outil === b.dataset.outil);
      main.classList.toggle('actif', !outil);
      for (const [b, x] of extras) { let on = false; try { on = Boolean(x.actif?.()); } catch { /* pas encore prêt */ } b.classList.toggle('actif', on); }
      reglages.hidden = outil !== 'gabarit';
      reglagesP.hidden = outil !== 'ping';
      reglagesR.hidden = outil !== 'regle';
      choixAnim.value = anim;
      choixDuree.value = String(duree);
      choixTeinteP.value = teinteP;
      choixRegle.value = regleSecrete ? 'mj' : 'tous';
      reglagesD.hidden = outil !== 'feutre' && outil !== 'note';
      champNote.hidden = outil !== 'note';
      choixTeinteD.value = teinteD;
      choixCalque.value = calque;
      choixForme.value = forme;
      champM.value = String(metres);
      choixTeinte.value = teinte;
      document.body.classList.toggle('outil-table', Boolean(outil));
    }
    dessinerBarre();
    const taille = () => Math.max(1, Math.round(metres / (o.caseM() || 1.5)));
    const longueur = (de, a) => {
      const dx = Math.abs(a.x - de.x), dy = Math.abs(a.y - de.y), grand = Math.max(dx, dy), petit = Math.min(dx, dy);
      return o.diagonales() === 'alternees' ? grand + Math.floor(petit / 2) : grand;
    };
    const metresDe = (n) => `${Math.round(n * (o.caseM() || 1.5) * 10) / 10} m`.replace('.', ',');
    const api = {
      get outil() { return outil; },
      rafraichir: () => dessinerBarre(),
      get element() { return racine; },
      set outil(v) { outil = v; dessinerBarre(); },
      touche(e) {
        if (e.target?.matches?.('input, select, textarea')) return false;
        if (e.key === 'r' || e.key === 'R') { outil = outil === 'regle' ? null : 'regle'; dessinerBarre(); return true; }
        if (e.key === 'g' || e.key === 'G') { outil = outil === 'gabarit' ? null : 'gabarit'; dessinerBarre(); return true; }
        if (e.key === 'p' || e.key === 'P') { outil = outil === 'ping' ? null : 'ping'; dessinerBarre(); return true; }
        if (e.key === 'f' || e.key === 'F') { outil = outil === 'feutre' ? null : 'feutre'; dessinerBarre(); return true; }
        if (e.key === 't' || e.key === 'T') { outil = outil === 'note' ? null : 'note'; dessinerBarre(); if (outil) champNote.focus(); return true; }
        if (e.key === 'v' || e.key === 'V') { outil = null; dessinerBarre(); return true; }
        const x = extras.find(([, k]) => k.touche && k.touche.toLowerCase() === e.key.toLowerCase());
        if (x) { x[1].faire(); dessinerBarre(); return true; }
        if (e.key === 'Escape' && (outil || trait)) { outil = null; trait = null; if (regleEnvoyee) { regleEnvoyee = ''; o.mesurer?.(null); } dessinerBarre(); return true; }
        return false;
      },
      appuyer(c, e) {
        if (e.altKey || outil === 'ping') { o.ping?.(c, teinteP); return true; }
        if (outil === 'regle' || e.shiftKey) { trait = { de: c, a: c, gabarit: false }; return true; }
        if (outil === 'gabarit') { trait = { de: c, a: c, gabarit: true }; return true; }
        if (outil === 'feutre') { trait = { de: c, a: c, points: [[c.fx ?? c.x + 0.5, c.fy ?? c.y + 0.5]] }; return true; }
        if (outil === 'note') {
          const texte = champNote.value.trim();
          if (!texte) { o.message?.('Écris d\'abord le texte de la note.'); champNote.focus(); return true; }
          o.noter?.({ x: c.x, y: c.y, texte, couleur: teinteD, visible: calque });
          champNote.value = '';
          return true;
        }
        return false;
      },
      bouger(c) {
        if (!trait || !c) return;
        trait.a = c;
        // Saga 1.49 : la règle se voit chez les autres (au plus 10 fois par seconde, quand elle change).
        if (!trait.gabarit && !trait.points && !regleSecrete && o.mesurer) {
          const n = longueur(trait.de, c), cle = `${trait.de.x},${trait.de.y},${c.x},${c.y}`;
          const t = Date.now();
          if (cle !== regleEnvoyee && t - envoiRegle >= 100) {
            envoiRegle = t; regleEnvoyee = cle;
            o.mesurer({ de: { x: trait.de.x, y: trait.de.y }, a: { x: c.x, y: c.y }, texte: `${n} case${n > 1 ? 's' : ''} · ${metresDe(n)}` });
          }
        }
        if (trait.points && trait.points.length < 400) {
          const p = [c.fx ?? c.x + 0.5, c.fy ?? c.y + 0.5], q = trait.points[trait.points.length - 1];
          if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.12) trait.points.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
        }
      },
      lacher() {
        const t = trait;
        trait = null;
        if (regleEnvoyee) { regleEnvoyee = ''; o.mesurer?.(null); }
        if (t?.points) { o.dessiner?.({ points: t.points, couleur: teinteD, visible: calque }); return true; }
        if (!t?.gabarit) return Boolean(t);
        // Un cercle et un cube se posent au clic ; le cône et la ligne vont vers là où l'on a lâché.
        const vise = t.a.x !== t.de.x || t.a.y !== t.de.y ? t.a : { x: t.de.x, y: t.de.y + 1 };
        o.placer?.({ forme, x: t.de.x, y: t.de.y, vx: vise.x, vy: vise.y, taille: taille(), couleur: teinte, anim, duree });
        return true;
      },
      get occupe() { return Boolean(trait); },
      // Ce que le plateau dessine en plus pour cet écran seulement : la règle, l'aperçu du gabarit.
      dessin(survol) {
        if (trait?.points) return { trace: { points: trait.points, couleur: teinteD, visible: calque } };
        if (trait && !trait.gabarit) {
          const n = longueur(trait.de, trait.a);
          return { regle: { de: trait.de, a: trait.a, texte: `${n} case${n > 1 ? 's' : ''} · ${metresDe(n)}` } };
        }
        if (outil === 'gabarit' && (trait || survol)) {
          const de = trait?.de || survol, a = trait?.a || survol;
          const vise = a.x !== de.x || a.y !== de.y ? a : { x: de.x, y: de.y + 1 };
          return { gabarit: { forme, x: de.x, y: de.y, vx: vise.x, vy: vise.y, taille: taille(), couleur: teinte, anim } };
        }
        return null;
      },
    };
    return api;
  }

  return { FORMES, COULEURS, ANIMS, DUREES, commande, remplacer, refsHeros, casesGabarit, normGabarit, couleur, marquesDispo, couleurMarque, barre };
})();

if (typeof module !== 'undefined') module.exports = TableOutils;
