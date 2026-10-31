// Ce que Claude peut faire dans Tafl (panneau Claude, ../commun/claude-panneau.js).
//
// Chaque action est décrite pour Claude (description, paramètres) et faite ici, dans la fenêtre,
// avec les mêmes fonctions que les menus : tout passe par Doc.change() et s'annule avec Ctrl+Z.
// Les actions « lecture » (voir, infos) ne demandent pas la permission ; les autres affichent la
// carte Autoriser / Refuser du panneau.
//
// Les pixels d'une tuile sont échangés en texte, une ligne par rangée de pixels : « . » pour un
// pixel transparent, puis un caractère par couleur de la palette (0 à 9, puis a à z, puis A à Z).
// Claude peut ainsi lire et dessiner une tuile pixel par pixel.

(() => {
  const CODES = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const besoinJeu = () => {
    const doc = App.doc;
    if (!doc) throw new Error('Aucun jeu de tuiles ouvert dans Tafl. Crée-en un (nouveau_jeu) ou demande à Ragna d\'en ouvrir un.');
    return doc;
  };
  const tuileNumero = (doc, index) => {
    const i = index === undefined || index === null ? doc.current : Number(index);
    if (!doc.tiles[i]) throw new Error(`Pas de tuile n° ${index} (il y en a ${doc.tiles.length}, de 0 à ${doc.tiles.length - 1}).`);
    return i;
  };
  const calqueNumero = (doc, calque) => {
    if (calque === undefined || calque === null) return App.options.layer;
    if (typeof calque === 'number' || /^\d+$/.test(calque)) {
      const i = Number(calque);
      if (!doc.map.layers[i]) throw new Error(`Pas de calque n° ${calque} : ${doc.map.layers.map((l, k) => `${k} = ${l.name}`).join(', ')}.`);
      return i;
    }
    const i = doc.map.layers.findIndex((l) => l.name.toLowerCase() === String(calque).toLowerCase());
    if (i < 0) throw new Error(`Pas de calque « ${calque} » : ${doc.map.layers.map((l) => l.name).join(', ')}.`);
    return i;
  };
  // La carte nommée par Claude (id, nom ou numéro) devient la carte affichée ; sans carte, celle affichée.
  const carteNumero = (doc, carte) => {
    if (carte === undefined || carte === null || carte === '') return doc.mapIndex;
    const t = String(carte).toLowerCase();
    const i = /^\d+$/.test(t) && doc.maps[Number(t)] ? Number(t) : doc.maps.findIndex((m) => m.id === t || m.name.toLowerCase() === t);
    if (i < 0) throw new Error(`Pas de carte « ${carte} » : ${doc.maps.map((m, k) => `${k} = ${m.id} (« ${m.name} »)`).join(', ')}.`);
    return i;
  };
  const choisirCarte = (doc, carte) => {
    const i = carteNumero(doc, carte);
    if (i !== doc.mapIndex) App.selectMap(i);
    App.setMode('map');
    return doc.map;
  };
  // Tafl 0.30 : avant une action qui change le jeu, ce qui est en cours dans une page (Données,
  // Événements) est appliqué ; après, la page se redessine avec ce que Loki a fait.
  const avecPages = (liste) => Object.fromEntries(Object.entries(liste).map(([nom, a]) => [nom, a.lecture ? a : {
    ...a,
    faire: async (args) => {
      if (!(await Espaces.appliquer())) throw new Error('Ragna a un événement en cours de modification qui ne peut pas être appliqué (case déjà prise). Demande-lui de le valider ou de l\'annuler.');
      try { return await a.faire(args); } finally { Espaces.recharger(); }
    },
  }]));
  const PASSAGE_CARS = ['?', '.', '#', 'v', '^', '<', '>'];
  const legende = (doc) => `Légende des pixels : « . » = transparent, ${doc.palette.map((c, i) => `${CODES[i] ?? '?'} = ${c}`).join(', ')}.`;

  // Pixels d'une image de tuile -> lignes de texte.
  // (w × h : la taille de l'image, une tuile par défaut ; un sprite peut être plus haut.)
  function versTexte(doc, data, w = doc.tileSize, h = w) {
    const index = new Map(doc.palette.map((c, i) => [c.toLowerCase(), CODES[i]]));
    const lignes = [];
    for (let y = 0; y < h; y++) {
      let ligne = '';
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        const hex = rgbaToHex(data[k], data[k + 1], data[k + 2], data[k + 3]);
        ligne += hex ? (index.get(hex.slice(0, 7)) || '?') : '.';
      }
      lignes.push(ligne);
    }
    return lignes;
  }
  // Lignes de texte -> pixels (couleurs : la palette, ou couleurs_en_plus { caractère: '#rrggbb' }).
  function depuisTexte(doc, lignes, enPlus = {}, w = doc.tileSize, h = w, quoi = 'la tuile') {
    if (!Array.isArray(lignes) || lignes.length !== h) throw new Error(`Il faut ${h} lignes de ${w} caractères (${quoi} fait ${w} × ${h} pixels).`);
    const data = new Uint8ClampedArray(w * h * 4);
    lignes.forEach((ligne, y) => {
      const l = String(ligne);
      if (l.length !== w) throw new Error(`La ligne ${y + 1} fait ${l.length} caractères au lieu de ${w}.`);
      for (let x = 0; x < w; x++) {
        const c = l[x];
        if (c === '.' || c === ' ') continue;
        const hex = enPlus[c] || doc.palette[CODES.indexOf(c)];
        if (!hex) throw new Error(`Caractère « ${c} » (ligne ${y + 1}) : pas dans la palette ni dans couleurs_en_plus.`);
        data.set(hexToRgba(hex), (y * w + x) * 4);
      }
    });
    return data;
  }
  // Une image agrandie (pixel art : sans lissage), pour que Claude voie bien les pixels.
  function agrandir(canvas, cible = 512) {
    const k = Math.max(1, Math.floor(cible / Math.max(canvas.width, canvas.height)));
    if (k === 1) return canvas;
    const out = el('canvas', { width: canvas.width * k, height: canvas.height * k });
    const g = out.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(canvas, 0, 0, out.width, out.height);
    return out;
  }
  // Tafl 0.11 : avec le groupe, intérieur ou non, et la place sur la carte monde.
  const listeCartes = (doc) => doc.maps.map((m, i) => `${i} = ${m.id} « ${m.name} » ${m.width} × ${m.height}${m.groupe ? ` [groupe ${m.groupe}]` : ''}${m.interieur ? ' [intérieur]' : m.monde ? ` [monde ${m.monde.x}, ${m.monde.y}]` : ''}`).join(', ');
  const decrireCarte = (doc) => {
    const m = doc.map;
    return [
      `Carte affichée : ${doc.mapIndex} = ${m.id} « ${m.name} », ${m.width} × ${m.height} cases de ${doc.tileSize} px.`,
      `Calques (du dessous au dessus) : ${m.layers.map((l, i) => `${i} = ${l.name} [${l.profondeur}${(l.opacite ?? 1) < 1 ? `, opacité ${l.opacite}` : ''}${l.fusion !== 'normal' ? `, fusion ${l.fusion}` : ''}${l.parallaxe.x !== 1 || l.parallaxe.y !== 1 ? `, parallaxe ${l.parallaxe.x}/${l.parallaxe.y}` : ''}${l.visible ? '' : ', masqué'}]`).join(', ')}.`,
      `Zones : ${m.zones.length ? m.zones.map((z) => `${z.id} « ${z.name} » ${z.type} (${z.x}, ${z.y}) ${z.w} × ${z.h}${z.objet ? `, objet requis ${z.objet}` : ''}${z.rencontres?.length ? `, rencontres ${z.taux} % : ${z.rencontres.map((r) => `${r.creature} ${r.niveau_min}-${r.niveau_max} (${r.chance} %)`).join(', ')}` : ''}`).join(' ; ') : 'aucune'}.`,
      `Ambiance : ${m.ambiance ? `${m.ambiance.meteo}${m.ambiance.meteo !== 'aucune' ? ` ${m.ambiance.intensite} %` : ''}${m.ambiance.teinte ? `, teinte ${m.ambiance.teinte} à ${m.ambiance.force} %` : ''}` : 'aucune'}.`,
      `Téléporteurs : ${m.warps.length ? m.warps.map((w) => `${w.id} (${w.x}, ${w.y}) → ${w.carte} (${w.tx}, ${w.ty}) regard ${w.direction}`).join(' ; ') : 'aucun'}.`,
      `Événements : ${m.events.length ? m.events.map((e) => Events.decrire(doc, e)).join(' ; ') : 'aucun'}.`,
    ].join('\n');
  };
  // Tafl 0.17 : les couleurs données par code, #rrggbb ou « . » ; les #rrggbb nouveaux iront dans la palette.
  const lecteurCouleurs = (doc) => {
    const nouvelles = new Set();
    return { nouvelles, lire: (c) => PixelArt.lireCouleur(doc, c, CODES, nouvelles) };
  };
  const ajouterCouleurs = (doc, nouvelles) => { for (const hex of nouvelles) if (!doc.palette.includes(hex)) doc.palette.push(hex); };
  // Ce que Claude voit après avoir dessiné : la tuile (toutes ses images), une mosaïque 3 × 3 pour
  // les raccords, et un regard critique (couleurs, pixels isolés, aplats, raccords).
  const resultatTuile = (doc, i, texte, k = 0) => {
    const t = doc.tiles[i];
    return {
      texte: [texte, `Regard critique (image ${k + 1}) : ${PixelArt.analyse(t.frames[k], doc.tileSize, doc.tileSize).join(' ')}`,
        'L\'image montre la tuile (et ses images si elle est animée) puis une mosaïque 3 × 3 : regarde-la avant de dire que c\'est fini.'].join('\n'),
      image: PixelArt.apercu(t.frames, doc.tileSize, doc.tileSize),
      max: 1024,
    };
  };
  const nombre = { type: 'number' };
  const lignesSchema = { type: 'array', items: { type: 'string' } };

  // --- Tafl 0.19 : économiser les jetons ---
  // Chaque action de Claude relit toute la conversation : une réponse de 20 000 jetons (la liste
  // de 2 500 tuiles importées) se paie à chaque appel suivant. D'où un catalogue en texte, des
  // listes en plages (« 12-40 ») au lieu de numéros un par un, et des images seulement sur demande.

  // [0, 1, 2, 5, 7, 8] -> « 0-2, 5, 7-8 »
  const plages = (indices) => {
    const out = [];
    const tri = [...indices].sort((a, b) => a - b);
    for (let k = 0; k < tri.length; k++) {
      const debut = tri[k];
      while (k + 1 < tri.length && tri[k + 1] === tri[k] + 1) k++;
      out.push(debut === tri[k] ? `${debut}` : `${debut}-${tri[k]}`);
    }
    return out.join(', ');
  };
  // « 12-15, 40 », [12, 13] ou 12 -> les numéros de tuile (vérifiés).
  const lirePlages = (doc, v) => {
    const morceaux = Array.isArray(v) ? v : String(v ?? '').split(',');
    const out = [];
    for (const m of morceaux) {
      const s = String(m).trim();
      if (!s) continue;
      const r = /^(\d+)\s*-\s*(\d+)$/.exec(s);
      if (r) {
        const a = Number(r[1]), b = Number(r[2]);
        if (b < a || b - a > 5000) throw new Error(`Plage « ${s} » impossible.`);
        for (let i = a; i <= b; i++) out.push(tuileNumero(doc, i));
      } else out.push(tuileNumero(doc, Number(s)));
    }
    return out;
  };
  // Un nom donné par l'import ou la création (« tuile-12 ») : la tuile n'est pas encore décrite.
  const sansNom = (t) => /^tuile-\d+$/.test(t.name);
  // Une tuile par numéro ou par nom (celui du catalogue).
  const tuileParNumeroOuNom = (doc, v) => {
    if (typeof v === 'number' || /^-?\d+$/.test(String(v))) {
      const t = Math.round(Number(v));
      return t === -1 ? -1 : tuileNumero(doc, t);
    }
    const nom = String(v).trim().toLowerCase();
    const i = doc.tiles.findIndex((t) => t.name.toLowerCase() === nom);
    if (i < 0) throw new Error(`Pas de tuile nommée « ${v} » (voir catalogue).`);
    return i;
  };
  const tamponParNumeroOuNom = (doc, v) => {
    const t = String(v);
    const i = /^\d+$/.test(t) && doc.stamps[Number(t)] ? Number(t) : doc.stamps.findIndex((st) => st.name.toLowerCase() === t.toLowerCase());
    if (i < 0) throw new Error(`Pas de tampon « ${v} » : ${doc.stamps.length > 40 ? 'voir catalogue' : doc.stamps.map((st, k) => `${k} = ${st.name}`).join(', ') || 'aucun tampon'}.`);
    return i;
  };
  // Les tuiles en lignes de catalogue : les tuiles voisines de même nom et même passage tiennent en
  // une ligne (« 120-131 sans nom », « 40-43 eau [bloque] {animée} »).
  const lignesTuiles = (doc, indices) => {
    const cle = (i) => {
      const t = doc.tiles[i];
      return `${sansNom(t) ? 'sans nom' : t.name}${t.passage && t.passage !== 'auto' ? ` [${t.passage}]` : ''}${t.frames.length > 1 ? ' {animée}' : ''}`;
    };
    const out = [];
    for (let k = 0; k < indices.length; k++) {
      const debut = indices[k], c = cle(debut);
      while (k + 1 < indices.length && indices[k + 1] === indices[k] + 1 && cle(indices[k + 1]) === c) k++;
      out.push(`${debut === indices[k] ? debut : `${debut}-${indices[k]}`} ${c}`);
    }
    return out;
  };
  // Les catégories en plages, et combien de tuiles n'ont pas encore de nom.
  const resumeTuiles = (doc) => {
    const parCat = new Map();
    doc.tiles.forEach((t, i) => { const c = t.categorie || 'sans catégorie'; if (!parCat.has(c)) parCat.set(c, []); parCat.get(c).push(i); });
    const n = doc.tiles.filter(sansNom).length;
    return `${[...parCat].map(([c, l]) => `${c} (${plages(l)})`).join(' ; ')}.${n ? ` ${n} sans nom : regarde-les par pages (voir_tuiles de, nombre) et décris-les une fois pour toutes avec nommer.` : ''}`;
  };
  const ligneTampon = (st, k) => `${k} « ${st.name} » ${st.w}×${st.h}${st.dessus ? `, cime ${st.dessus}` : ''}`;
  // Une rangée de numéros, compressée : « 12*5 » = 5 fois la tuile 12, « .*3 » = 3 cases vides.
  const rangeeCompacte = (valeurs) => {
    const out = [];
    for (let k = 0; k < valeurs.length; k++) {
      let n = 1;
      while (k + 1 < valeurs.length && valeurs[k + 1] === valeurs[k]) { k++; n++; }
      out.push(n > 1 ? `${valeurs[k]}*${n}` : String(valeurs[k]));
    }
    return out.join(' ');
  };
  // Une planche de tuiles numérotée pour Claude : 16 par rangée, le numéro de la première tuile de
  // chaque rangée à gauche, la colonne (0 à 15) en haut. Il lit ainsi le numéro de chaque tuile.
  function plancheNumerotee(doc, indices, colonnes = 16) {
    const s = doc.tileSize, k = Math.max(1, Math.round(32 / s)), c = s * k;
    const marge = 36, haut = 14;
    const rangees = Math.ceil(indices.length / colonnes);
    const out = el('canvas', { width: marge + colonnes * (c + 1), height: haut + rangees * (c + 1) });
    const g = out.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#16161c';
    g.fillRect(0, 0, out.width, out.height);
    g.font = '10px monospace';
    g.textBaseline = 'middle';
    g.fillStyle = '#c8c8d0';
    for (let col = 0; col < colonnes; col++) g.fillText(String(col), marge + col * (c + 1) + c / 2 - 3, haut / 2);
    indices.forEach((i, n) => {
      const col = n % colonnes, row = Math.floor(n / colonnes);
      const x = marge + col * (c + 1), y = haut + row * (c + 1);
      if (col === 0) { g.fillStyle = '#c8c8d0'; g.fillText(String(i), 2, y + c / 2); }
      g.fillStyle = (col + row) % 2 ? '#2a2a33' : '#33333d';
      g.fillRect(x, y, c, c);
      g.drawImage(Doc.tileCanvas(doc.tiles[i], s), x, y, c, c);
    });
    out.pixelArt = true;
    return out;
  }
  // Les tampons côte à côte, chacun avec son numéro en haut à gauche.
  function plancheTampons(doc, liste) {
    const s = doc.tileSize, z = s < 32 ? 2 : 1, largeur = 1024;
    let x = 0, y = 0, haut = 0;
    const places = liste.map(([st, k]) => {
      const w = st.w * s * z, h = st.h * s * z + 12;
      if (x && x + w > largeur) { x = 0; y += haut + 6; haut = 0; }
      const p = { st, k, x, y };
      x += Math.max(w, 24) + 6;
      haut = Math.max(haut, h);
      return p;
    });
    const out = el('canvas', { width: largeur, height: Math.max(1, y + haut) });
    const g = out.getContext('2d');
    g.fillStyle = '#16161c';
    g.fillRect(0, 0, out.width, out.height);
    g.font = '10px monospace';
    g.textBaseline = 'top';
    for (const p of places) {
      g.fillStyle = '#ffd36b';
      g.fillText(String(p.k), p.x, p.y);
      g.drawImage(Panels.stampCanvas(doc, p.st, Math.max(p.st.w, p.st.h) * s * z), p.x, p.y + 12);
    }
    out.pixelArt = true;
    return out;
  }

  ClaudePanneau.actions(avecPages({
    // Tafl 0.27 : le vérificateur du jeu (verificateur.js), comme Jeu › Vérifier le jeu.
    verifier: {
      lecture: true,
      icone: 'checklist',
      libelle: () => 'Vérifie le jeu',
      description: 'Vérifie tout le jeu (ce qui est dans Tafl, même pas encore enregistré) : téléporteurs cassés (carte ou case d\'arrivée qui n\'existe pas, case bloquée, pas de retour), cartes et personnages que le joueur ne peut pas atteindre depuis le départ, quêtes impossibles à commencer ou à finir, étapes jamais atteintes, conditions jamais vraies (interrupteur jamais allumé, objet que personne ne donne), ids inconnus. Il suppose que le joueur obtient tout ce que le jeu donne ou vend. Lance-le après une grosse modification, corrige les erreurs, puis relance-le. Ragna voit la même liste avec Jeu › Vérifier le jeu (Ctrl+Maj+V).',
      faire: async () => {
        const doc = besoinJeu();
        ScriptsTafl.appliquer();
        await ScriptsTafl.rafraichir(doc); // Tafl 0.31 : ce que déclarent les scripts JS, à jour
        const r = Verificateur.verifier(OutilsJeu.jeuDe(doc));
        if (!r.problemes.length) return 'Aucun problème trouvé.';
        const lignes = r.problemes.slice(0, 80).map((p) => `- [${p.gravite === 'erreur' ? 'erreur' : 'à vérifier'}] ${p.message}${p.carte ? ` (carte ${p.carte}${Number.isInteger(p.x) ? `, case ${p.x}, ${p.y}` : ''}${p.evenement ? `, événement ${p.evenement}` : ''})` : p.script ? ` (script ${p.script}.js${p.ligne ? `, ligne ${p.ligne}` : ''})` : ''}`);
        return [`${r.erreurs} erreur(s), ${r.attentions} à vérifier.`, ...lignes, r.problemes.length > 80 ? `… et ${r.problemes.length - 80} de plus.` : ''].filter(Boolean).join('\n');
      },
    },
    infos: {
      lecture: true,
      icone: 'info',
      libelle: () => 'Regarde le jeu de tuiles',
      description: 'Décrit le jeu ouvert : dossier de jeu ou simple jeu de tuiles, taille des tuiles, liste des tuiles (numéro, nom, images, passage), palette, cartes, départ du joueur, nombre de personnages, quêtes et interrupteurs, et pour la carte affichée ses calques (profondeur, opacité, fusion, parallaxe), zones, téléporteurs et événements.',
      faire: () => {
        const doc = besoinJeu();
        return [
          `${doc.game ? `Dossier de jeu « ${doc.name} »${doc.game.folder ? ` (${doc.game.folder})` : ', pas encore enregistré'}` : `Jeu de tuiles « ${doc.name} »${doc.path ? ` (${doc.path})` : ', jamais enregistré'}`}${doc.dirty ? ', modifié' : ''}. Tuiles de ${doc.tileSize} × ${doc.tileSize} px. Espace affiché : ${Espaces.LISTE.find((e) => e.id === Espaces.courant)?.nom}.`,
          // Tafl 0.19 : au-delà de 40 tuiles, un résumé (le détail est dans catalogue).
          doc.tiles.length <= 40
            ? `Tuiles (${doc.tiles.length}) : ${doc.tiles.map((t, i) => `${i} « ${t.name} »${t.frames.length > 1 ? ` (${t.frames.length} images, ${t.duration} ms)` : ''}${t.passage && t.passage !== 'auto' ? ` [${t.passage}]` : ''}${i === doc.current ? ' [choisie]' : ''}`).join(', ')}.`
            : `Tuiles (${doc.tiles.length}, choisie : ${doc.current}) : ${resumeTuiles(doc)} La liste par nom : action catalogue.`,
          `Cartes (${doc.maps.length}) : ${listeCartes(doc)}. Départ du joueur : ${doc.depart ? `${doc.depart.carte} (${doc.depart.x}, ${doc.depart.y}), regard ${doc.depart.direction}` : 'pas encore placé'}.`,
          `Tampons (objets de plusieurs tuiles, action tampon) : ${!doc.stamps.length ? 'aucun' : doc.stamps.length <= 30 ? doc.stamps.map(ligneTampon).join(', ') : `${doc.stamps.length}, la liste : action catalogue`}.`,
          `Palette : ${doc.palette.slice(0, 62).map((c, i) => `${CODES[i] ?? '?'} ${c}`).join(', ')}${doc.palette.length > 62 ? ` (+ ${doc.palette.length - 62})` : ''}.`,
          `Données du jeu : ${doc.data.personnages.length} personnage(s), ${doc.data.quetes.length} quête(s), ${doc.data.interrupteurs.length} interrupteur(s) (détails : action donnees) ; ${Donnees.SORTES.filter((k) => k !== 'reglages').map((k) => `${doc.data[k].length} ${k}`).join(', ')} (action donnee). Événements : ${doc.maps.reduce((n, m) => n + m.events.length, 0)} sur toutes les cartes.`,
          decrireCarte(doc),
        ].join('\n');
      },
    },
    // Tafl 0.19 : le catalogue en texte des tuiles et des tampons. Claude le lit au lieu de regarder
    // les planches en images ; les noms sont donnés une fois (nommer) et gardés dans le jeu.
    catalogue: {
      lecture: true,
      icone: 'list-tree',
      libelle: (a) => `Lit le catalogue des tuiles${a.filtre ? ` (« ${a.filtre} »)` : ''}`,
      description: 'Le catalogue en texte des tuiles (par catégorie : « numéros nom [passage] {animée} », les tuiles voisines de même nom en une ligne) et des tampons (numéro « nom » largeur×hauteur). À lire avant de construire : c\'est bien moins cher que les images. filtre : un mot cherché dans les noms et catégories ; categorie : une seule catégorie ; debut : la ligne où reprendre (300 lignes à la fois). Les tuiles « sans nom » se décrivent une fois avec nommer, après les avoir regardées avec voir_tuiles.',
      schema: { type: 'object', properties: { filtre: { type: 'string' }, categorie: { type: 'string' }, debut: nombre } },
      faire: (a) => {
        const doc = besoinJeu();
        const filtre = String(a.filtre || '').trim().toLowerCase();
        const garde = (t) => (a.categorie === undefined || (t.categorie || '') === String(a.categorie))
          && (!filtre || t.name.toLowerCase().includes(filtre) || (t.categorie || '').toLowerCase().includes(filtre));
        const parCat = new Map();
        doc.tiles.forEach((t, i) => { if (!garde(t)) return; const c = t.categorie || ''; if (!parCat.has(c)) parCat.set(c, []); parCat.get(c).push(i); });
        const lignes = [];
        for (const [c, liste] of parCat) lignes.push(`## ${c || 'Sans catégorie'} (${liste.length})`, ...lignesTuiles(doc, liste));
        const tampons = doc.stamps.map((st, k) => [st, k]).filter(([st]) => !filtre || st.name.toLowerCase().includes(filtre));
        if (tampons.length && a.categorie === undefined) lignes.push(`## Tampons (${tampons.length}, action tampon ou plan_carte)`, ...tampons.map(([st, k]) => ligneTampon(st, k)));
        const debut = clamp(Math.round(a.debut || 0), 0, Math.max(0, lignes.length - 1));
        const page = lignes.slice(debut, debut + 300);
        const sans = doc.tiles.filter(sansNom).length;
        return [`Catalogue de « ${doc.name} » : ${doc.tiles.length} tuiles de ${doc.tileSize} px, ${doc.stamps.length} tampons${filtre ? `, filtre « ${a.filtre} »` : ''}.${sans ? ` ${sans} tuiles sans nom.` : ''}`,
          ...page, ...(debut + 300 < lignes.length ? [`(… suite : debut ${debut + 300}, ${lignes.length} lignes en tout)`] : []),
          ...(lignes.length ? [] : ['Rien ne correspond.'])].join('\n');
      },
    },
    voir_tuiles: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Regarde les tuiles${a.categorie ? ` « ${a.categorie} »` : a.tuiles ? ` ${a.tuiles}` : ` à partir de ${a.de || 0}`}`,
      description: 'Montre une page de tuiles (une image, 16 par rangée : le numéro de la première tuile de chaque rangée est à gauche, la colonne 0 à 15 en haut) avec leur nom. de : premier numéro (0 par défaut) ; nombre : 1 à 256 (128 par défaut) ; ou categorie : les tuiles d\'une catégorie ; ou tuiles : « 12-15, 40 ». Une image coûte cher : pour trouver une tuile, lis d\'abord catalogue (texte) ; ne regarde des pages que pour décrire des tuiles sans nom (puis nommer).',
      schema: { type: 'object', properties: { de: nombre, nombre, categorie: { type: 'string' }, tuiles: { type: ['string', 'array'] } } },
      faire: (a) => {
        const doc = besoinJeu();
        let liste;
        if (a.tuiles !== undefined) liste = lirePlages(doc, a.tuiles);
        else if (a.categorie !== undefined) {
          liste = doc.tiles.map((t, i) => ((t.categorie || '') === String(a.categorie) ? i : -1)).filter((i) => i >= 0);
          if (!liste.length) throw new Error(`Pas de catégorie « ${a.categorie} » (voir catalogue).`);
        } else liste = doc.tiles.map((_t, i) => i);
        const de = clamp(Math.round(a.de || 0), 0, Math.max(0, doc.tiles.length - 1));
        const nb = clamp(Math.round(a.nombre || 128), 1, 256);
        if (a.tuiles === undefined) liste = liste.filter((i) => i >= de);
        const page = liste.slice(0, nb);
        const reste = liste.length - page.length;
        const suivi = page.length > 1 && page.every((i, k) => k === 0 || i === page[k - 1] + 1);
        return {
          texte: [`Tuiles ${plages(page)} (${page.length} sur ${doc.tiles.length}).${suivi ? ' Numéro d\'une tuile = le nombre à gauche de sa rangée + sa colonne.' : ' Elles sont dans l\'ordre de cette liste, 16 par rangée.'}${reste > 0 ? ` Suite : de ${liste[page.length]}.` : ''}`,
            ...lignesTuiles(doc, page)].join('\n'),
          image: plancheNumerotee(doc, page),
          max: 1100,
        };
      },
    },
    voir_tuile: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Regarde la tuile ${a.index ?? 'choisie'}`,
      description: 'Montre une tuile agrandie (toutes ses images si elle est animée, puis une mosaïque 3 × 3 pour voir les raccords), ses pixels en texte (une ligne par rangée, voir la légende) et un regard critique (couleurs, pixels isolés, aplats, raccords). index : numéro de la tuile (sinon la tuile choisie) ; image : numéro de l\'image pour une tuile animée.',
      schema: { type: 'object', properties: { index: nombre, image: nombre } },
      faire: (a) => {
        const doc = besoinJeu();
        const i = tuileNumero(doc, a.index);
        const t = doc.tiles[i];
        const k = clamp(Number(a.image) || 0, 0, t.frames.length - 1);
        // Une tuile importée a souvent ses couleurs hors de la palette : ses pixels ne seraient que
        // des « ? », qui coûtent sans rien apprendre. On ne les donne alors pas.
        const pixels = versTexte(doc, t.frames[k]);
        const inconnus = pixels.join('').split('?').length - 1;
        const lisible = inconnus <= pixels.length * pixels.length * 0.1;
        return {
          texte: [`Tuile ${i} « ${t.name} », image ${k + 1} sur ${t.frames.length}.`,
            ...(lisible ? [legende(doc), '', ...pixels] : [`(Pixels non donnés en texte : ${inconnus} pixels de couleurs hors de la palette. Regarde l'image.)`]), '',
            `Regard critique : ${PixelArt.analyse(t.frames[k], doc.tileSize, doc.tileSize).join(' ')}`].join('\n'),
          image: PixelArt.apercu(t.frames, doc.tileSize, doc.tileSize),
          max: 1024,
        };
      },
    },
    voir_carte: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Regarde la carte${a.image ? ' (image)' : ''}`,
      description: 'Décrit une carte (carte : id, nom ou numéro, sinon la carte affichée, qui devient affichée) : calques, zones, téléporteurs, événements, et les numéros de tuile de chaque calque, une ligne par rangée (« 12*5 » = 5 fois la tuile 12, « . » = vide), sur 64 × 64 cases au plus (x, y, largeur, hauteur : la partie à lire, toute la carte par défaut). passage: true ajoute le passage final (. libre, # bloqué, v ^ < > rebords). image: true ajoute une image de la carte : elle coûte cher, garde-la pour vérifier le résultat à la fin.',
      schema: { type: 'object', properties: { carte: { type: ['string', 'number'] }, x: nombre, y: nombre, largeur: nombre, hauteur: nombre, passage: { type: 'boolean' }, image: { type: 'boolean' } } },
      faire: (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        const lignes = [decrireCarte(doc)];
        const x0 = clamp(Math.round(a.x || 0), 0, map.width - 1), y0 = clamp(Math.round(a.y || 0), 0, map.height - 1);
        const x1 = clamp(x0 + Math.round(a.largeur || map.width), x0 + 1, Math.min(map.width, x0 + 64));
        const y1 = clamp(y0 + Math.round(a.hauteur || map.height), y0 + 1, Math.min(map.height, y0 + 64));
        const partie = x0 > 0 || y0 > 0 || x1 < map.width || y1 < map.height;
        lignes.push('', partie ? `Cases (${x0}, ${y0}) à (${x1 - 1}, ${y1 - 1}) sur ${map.width} × ${map.height}${x1 - x0 === 64 || y1 - y0 === 64 ? ' (64 × 64 au plus : x, y pour lire la suite)' : ''}.` : `Toute la carte (${map.width} × ${map.height}).`);
        const rangee = (cells, y) => rangeeCompacte(Array.from(cells.subarray(y * map.width + x0, y * map.width + x1), (c) => (c < 0 ? '.' : c)));
        for (const layer of map.layers) {
          let vide = true;
          for (let y = y0; y < y1 && vide; y++) for (let x = x0; x < x1; x++) if (layer.cells[y * map.width + x] >= 0) { vide = false; break; }
          if (vide) { lignes.push(`Calque ${layer.name} : vide.`); continue; }
          lignes.push(`Calque ${layer.name} :`);
          for (let y = y0; y < y1; y++) lignes.push(rangee(layer.cells, y));
        }
        if (a.passage) {
          const final = Doc.collisions(doc, map);
          lignes.push('Passage final (. libre, # bloqué, v ^ < > rebord à sauter dans ce sens) :');
          for (let y = y0; y < y1; y++) lignes.push(Array.from(final.subarray(y * map.width + x0, y * map.width + x1), (c) => PASSAGE_CARS[c]).join(''));
        }
        if (!a.image) return lignes.join('\n');
        return { texte: lignes.join('\n'), image: agrandir(IO.mapCanvas(doc, 1), 768), max: 768 };
      },
    },
    nouveau_jeu: {
      icone: 'new-file',
      libelle: (a) => (a.dossier_de_jeu ? `Crée le jeu « ${a.nom || 'Sans titre'} » (tuiles de ${a.taille_tuile || 16} px)` : `Crée un jeu de tuiles de ${a.taille_tuile || 16} px`),
      description: 'Crée un nouveau jeu (remplace celui ouvert, Tafl propose d\'abord de l\'enregistrer). dossier_de_jeu : true pour un dossier de jeu (plusieurs cartes, lu par le futur moteur ; enregistre-le ensuite avec enregistrer_jeu), false pour un simple jeu de tuiles .tafl. taille_tuile : 4 à 128 px (16 par défaut) ; nom_carte, largeur_carte, hauteur_carte : la première carte ; exemples : true pour partir des tuiles d\'exemple.',
      schema: { type: 'object', properties: { nom: { type: 'string' }, dossier_de_jeu: { type: 'boolean' }, taille_tuile: nombre, nom_carte: { type: 'string' }, largeur_carte: nombre, hauteur_carte: nombre, exemples: { type: 'boolean' } } },
      faire: async (a) => {
        const tileSize = clamp(Math.round(a.taille_tuile || App.config.tileSize || 16), 4, 128);
        const palette = (PALETTES.find((p) => p.id === App.config.palette) || PALETTES[0]).couleurs;
        const doc = Doc.create({ name: a.nom || 'Sans titre', tileSize, palette, mapWidth: clamp(Math.round(a.largeur_carte || 20), 1, 256), mapHeight: clamp(Math.round(a.hauteur_carte || 15), 1, 256), mapName: a.nom_carte || 'Carte 1' });
        if (a.exemples && tileSize === 16) Samples.fill(doc);
        if (a.dossier_de_jeu) doc.game = { folder: null, fichiers: [] };
        await App.setDocument(doc);
        if (App.doc !== doc) throw new Error('Ragna a gardé le jeu ouvert.');
        return `${a.dossier_de_jeu ? 'Dossier de jeu' : 'Jeu de tuiles'} « ${doc.name} » créé : tuiles de ${tileSize} px, carte ${doc.map.id} de ${doc.map.width} × ${doc.map.height} cases.`;
      },
    },
    dessiner_tuile: {
      icone: 'edit',
      libelle: (a) => (a.index === undefined || a.index === null ? 'Dessine une nouvelle tuile' : `Redessine la tuile ${a.index}`),
      description: 'Dessine une tuile pixel par pixel. pixels : autant de lignes que de pixels de haut, chacune avec un caractère par pixel (« . » = transparent, sinon un code de la palette, voir infos ou voir_tuile). couleurs_en_plus : { "caractère": "#rrggbb" } pour des couleurs hors palette (elles y sont ajoutées). Sans index : une nouvelle tuile (nom facultatif) ; avec index : remplace cette tuile (image : numéro de l\'image pour une tuile animée).',
      schema: { type: 'object', properties: { pixels: lignesSchema, index: nombre, image: nombre, nom: { type: 'string' }, couleurs_en_plus: { type: 'object' } }, required: ['pixels'] },
      faire: (a) => {
        const doc = besoinJeu();
        const enPlus = Object.fromEntries(Object.entries(a.couleurs_en_plus || {}).map(([k, v]) => [k, normalizeHex(v)]).filter(([k, v]) => k.length === 1 && v));
        const data = depuisTexte(doc, a.pixels, enPlus);
        let i;
        Doc.change(doc, a.index === undefined || a.index === null ? 'Nouvelle tuile (Loki)' : 'Dessiner la tuile (Loki)', () => {
          for (const hex of Object.values(enPlus)) if (!doc.palette.includes(hex)) doc.palette.push(hex);
          if (a.index === undefined || a.index === null) {
            i = Doc.addTile(doc, data, a.nom ? (doc.tiles.some((t) => t.name === a.nom) ? Doc.uniqueName(doc, a.nom) : String(a.nom)) : null);
          } else {
            i = tuileNumero(doc, a.index);
            const t = Doc.tileForEdit(doc, i);
            const k = clamp(Number(a.image) || 0, 0, t.frames.length - 1);
            t.frames[k] = data;
            Doc.touch(t);
            if (a.nom) t.name = String(a.nom);
          }
          doc.current = i;
        });
        App.selectTile(i);
        return resultatTuile(doc, i, `Tuile ${i} « ${doc.tiles[i].name} » dessinée.`, clamp(Number(a.image) || 0, 0, doc.tiles[i].frames.length - 1));
      },
    },
    rampe: {
      icone: 'symbol-color',
      libelle: (a) => `Ajoute une rampe de ${a.nombre || 5} couleurs autour de ${a.base}`,
      description: 'Crée une rampe de couleurs (3 à 8, de la plus sombre à la plus claire) autour d\'une couleur de base (#rrggbb ou code de la palette), avec le décalage de teinte du pixel art : les ombres tirent vers le bleu violet, les lumières vers le jaune, au lieu d\'un simple noir ou blanc ajouté. Les couleurs sont ajoutées à la palette (sauf ajouter: false) et la réponse donne leurs codes. ecart : l\'étendue de la lumière (0,1 à 0,8, 0,42 par défaut) ; decalage : la force du décalage de teinte (0 à 1, 0,5 par défaut).',
      schema: { type: 'object', properties: { base: { type: 'string' }, nombre, ecart: nombre, decalage: nombre, ajouter: { type: 'boolean' } }, required: ['base'] },
      faire: (a) => {
        const doc = besoinJeu();
        const b = String(a.base || '').trim();
        const base = normalizeHex(b) && b.length > 1 ? normalizeHex(b) : doc.palette[CODES.indexOf(b)];
        if (!base) throw new Error(`base : « ${a.base} » n'est ni #rrggbb ni un code de la palette.`);
        const couleurs = PixelArt.rampe(base, a.nombre || 5, { ecart: clamp(Number(a.ecart ?? 0.42), 0.1, 0.8), decalage: clamp(Number(a.decalage ?? 0.5), 0, 1) });
        if (a.ajouter !== false) {
          const nouvelles = couleurs.filter((c) => !doc.palette.includes(c));
          if (nouvelles.length) Doc.change(doc, 'Ajouter une rampe (Loki)', () => doc.palette.push(...new Set(nouvelles)));
          App.refresh();
        }
        const code = (c) => { const i = doc.palette.indexOf(c); return i >= 0 && CODES[i] ? ` (code ${CODES[i]})` : ''; };
        return `Rampe, du plus sombre au plus clair : ${couleurs.map((c) => `${c}${code(c)}`).join(', ')}.`;
      },
    },
    peindre_tuile: {
      icone: 'paintcan',
      libelle: (a) => `${a.index === undefined || a.index === null ? 'Peint une nouvelle tuile' : `Peint la tuile ${a.index}`} (${a.operations?.length || 0} opération(s))`,
      description: `Peint une tuile par opérations, dans l'ordre (plus rapide et plus propre que pixel par pixel pour les fonds, textures, volumes et ombres ; finis les détails avec l'opération pixels ou dessiner_tuile). Sans index : une nouvelle tuile (nom) ; avec index : part de cette tuile (image : l'image d'une tuile animée ; toutes_images : true pour peindre chaque image pareil). Couleurs : code de la palette, #rrggbb (ajouté à la palette) ou « . » (transparent). Coordonnées en pixels, 0,0 en haut à gauche. Chaque opération accepte seulement : des couleurs (codes) — elle ne touche alors que les pixels de ces couleurs. forme (contour, ombrage, ombre_portee) : les codes des couleurs de l'objet ; si le sol autour a les mêmes couleurs, ajoute x, y, largeur, hauteur pour limiter la forme à ce rectangle. operations : [{ type, … }] avec type =
- remplir (couleur) ; rect (x, y, largeur, hauteur, couleur, vide) ; ellipse (idem) ; polygone (points [[x, y], …] dans l'ordre du tour, couleur, vide : une silhouette nette, dents de scie, pan de toit) ; ligne (x1, y1, x2, y2, couleur) ; pot (x, y, couleur : remplit la zone de même couleur) ;
- degrade (couleurs : 2 ou plus, du début à la fin ; direction bas, haut, droite, gauche, diagonale, radial ; x, y, largeur, hauteur ; trame : false pour des bandes nettes, sinon tramé façon 16 bits) ;
- taches (couleurs : une par niveau, densite : la part couverte, taille des taches en pixels, graine ; bord tramé sauf trame: false ; se raccorde) : les grandes nuances calmes d'un sol, à préférer au bruit ;
- nettoyer (garder : codes à ne pas toucher) : remplace les pixels isolés par la couleur autour ; à faire en dernier sur un sol ;
- bruit (couleurs, densite 0 à 1, taille 1 à 4, forme amas, brin, touffe (un V d'herbe ; couleurs par paires base, pointe), trait ou point, espace : distance mini entre deux marques, graine, x/y/largeur/hauteur ; se raccorde d'un bord à l'autre de la tuile sauf raccord: false) : herbe, terre, pierre, feuillage ;
- contour (couleur, forme : les codes des couleurs de l'objet, sinon tout le non transparent ; cotes tout, bas, bas_droite, haut ; interieur: true pour peindre le bord de l'objet lui-même) ;
- ombrage (forme, clair, sombre, lumiere haut_gauche (défaut), haut, haut_droite, gauche, droite ; epaisseur 1 à 4) : le volume, bord éclairé et bord dans l'ombre ;
- ombre_portee (couleur, forme, dx, dy : 1, 1 par défaut) : l'ombre de l'objet sur le sol ;
- pixels (lignes : du texte comme dessiner_tuile, x, y ; « . » = laisser) ; repeter (lignes : un petit motif soigné, positions : [[x, y], …] ou [{ x, y, miroir }]) ; symetrie (axe vertical : gauche → droite, horizontal : haut → bas) ; remplacer (de, vers) ; decaler (dx, dy, en boucle).
Tu vois ensuite la tuile, une mosaïque 3 × 3 et un regard critique.`,
      schema: { type: 'object', properties: { operations: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: PixelArt.OPERATIONS } }, required: ['type'] } }, index: nombre, image: nombre, toutes_images: { type: 'boolean' }, nom: { type: 'string' } }, required: ['operations'] },
      faire: (a) => {
        const doc = besoinJeu();
        if (!Array.isArray(a.operations) || !a.operations.length) throw new Error('operations : au moins une.');
        const { nouvelles, lire } = lecteurCouleurs(doc);
        const nouvelle = a.index === undefined || a.index === null;
        const i0 = nouvelle ? -1 : tuileNumero(doc, a.index);
        const s = doc.tileSize;
        const sources = nouvelle ? [new Uint8ClampedArray(s * s * 4)] : doc.tiles[i0].frames;
        const k = nouvelle ? 0 : clamp(Number(a.image) || 0, 0, sources.length - 1);
        const cibles = a.toutes_images && !nouvelle ? sources.map((_, j) => j) : [k];
        // On peint des copies : si une opération est fausse, rien ne change et l'erreur dit laquelle.
        const peintes = new Map();
        for (const j of cibles) {
          const data = new Uint8ClampedArray(sources[j]);
          const toile = PixelArt.Toile(data, s, s);
          a.operations.forEach((op, n) => {
            try { PixelArt.operation(toile, op || {}, lire); } catch (err) { throw new Error(`Opération ${n + 1} (${op?.type}) : ${err.message}`); }
          });
          peintes.set(j, data);
        }
        let i = i0;
        Doc.change(doc, nouvelle ? 'Nouvelle tuile peinte (Loki)' : 'Peindre la tuile (Loki)', () => {
          ajouterCouleurs(doc, nouvelles);
          if (nouvelle) i = Doc.addTile(doc, peintes.get(0), a.nom ? (doc.tiles.some((t) => t.name === a.nom) ? Doc.uniqueName(doc, a.nom) : String(a.nom)) : null);
          else {
            const t = Doc.tileForEdit(doc, i);
            for (const [j, data] of peintes) t.frames[j] = data;
            Doc.touch(t);
            if (a.nom) t.name = String(a.nom);
          }
          doc.current = i;
        });
        App.selectTile(i);
        return resultatTuile(doc, i, `Tuile ${i} « ${doc.tiles[i].name} » peinte (${a.operations.length} opération(s)${nouvelles.size ? `, ${nouvelles.size} couleur(s) ajoutée(s) à la palette` : ''}).`, k);
      },
    },
    dessiner_objet: {
      icone: 'symbol-structure',
      libelle: (a) => (a.tampon !== undefined ? `Redessine l'objet ${a.tampon}` : `Dessine l'objet « ${a.nom || 'objet'} » (${a.largeur || 2} × ${a.hauteur || 2} tuiles)`),
      description: `Dessine un grand objet (arbre, maison, falaise, fontaine, statue…) d'un seul tenant, sur plusieurs tuiles : c'est là que se fait la finesse (un sapin de 3 × 4 tuiles a la place pour des branches étagées, une maison pour ses planches, ses tuiles de toit et ses fenêtres). Mêmes operations que peindre_tuile, sur toute l'image (largeur × taille des tuiles en pixels, fond transparent), plus repeter (un motif soigné posé à plusieurs positions). L'image est ensuite découpée en tuiles (les tuiles vides sont sautées) et devient un tampon prêt à poser. largeur, hauteur : en tuiles (1 à 8) ; nom ; dessus : les rangées du haut qui passent devant le joueur (la cime) ; tampon : un objet existant (numéro ou nom) à reprendre et retoucher, ses tuiles sont alors remplacées. Tu vois ensuite l'objet agrandi pixel par pixel.`,
      schema: { type: 'object', properties: { operations: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: PixelArt.OPERATIONS } }, required: ['type'] } }, nom: { type: 'string' }, largeur: nombre, hauteur: nombre, dessus: nombre, tampon: { type: ['string', 'number'] } }, required: ['operations'] },
      faire: (a) => {
        const doc = besoinJeu();
        const s = doc.tileSize;
        let st = null, si = -1;
        if (a.tampon !== undefined && a.tampon !== null && a.tampon !== '') {
          const t = String(a.tampon);
          si = /^\d+$/.test(t) && doc.stamps[Number(t)] ? Number(t) : doc.stamps.findIndex((o) => o.name.toLowerCase() === t.toLowerCase());
          if (si < 0) throw new Error(`Pas de tampon « ${a.tampon} » : ${doc.stamps.map((o, k) => `${k} = ${o.name}`).join(', ') || 'aucun tampon'}.`);
          st = doc.stamps[si];
        }
        const tw = st ? st.w : clamp(Math.round(a.largeur || 2), 1, 8), th = st ? st.h : clamp(Math.round(a.hauteur || 2), 1, 8);
        const W = tw * s, H = th * s;
        const data = new Uint8ClampedArray(W * H * 4);
        // Reprendre un objet : on recolle ses tuiles en une seule image.
        if (st) st.cells.forEach((c, k) => {
          if (c < 0) return;
          const f = doc.tiles[c].frames[0], ox = (k % tw) * s, oy = Math.floor(k / tw) * s;
          for (let y = 0; y < s; y++) data.set(f.subarray(y * s * 4, (y + 1) * s * 4), ((oy + y) * W + ox) * 4);
        });
        const { nouvelles, lire } = lecteurCouleurs(doc);
        const toile = PixelArt.Toile(data, W, H);
        (a.operations || []).forEach((op, n) => {
          try { PixelArt.operation(toile, op || {}, lire); } catch (err) { throw new Error(`Opération ${n + 1} (${op?.type}) : ${err.message}`); }
        });
        // Découpe en tuiles.
        const morceaux = [];
        for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
          const f = new Uint8ClampedArray(s * s * 4);
          for (let y = 0; y < s; y++) f.set(data.subarray(((j * s + y) * W + i * s) * 4, ((j * s + y) * W + (i + 1) * s) * 4), y * s * 4);
          let vide = true;
          for (let k = 3; k < f.length; k += 4) if (f[k]) { vide = false; break; }
          morceaux.push(vide ? null : f);
        }
        if (!morceaux.some(Boolean)) throw new Error('L\'objet est vide : aucune opération n\'a peint de pixel.');
        const nom = st ? st.name : (a.nom || 'objet');
        let index = si;
        Doc.change(doc, st ? 'Retoucher l\'objet (Loki)' : 'Nouvel objet (Loki)', () => {
          ajouterCouleurs(doc, nouvelles);
          const cells = morceaux.map((f, k) => {
            if (!f) return -1;
            const ancienne = st ? st.cells[k] : -1;
            if (ancienne >= 0) {
              const t = Doc.tileForEdit(doc, ancienne);
              t.frames = [f];
              Doc.touch(t);
              return ancienne;
            }
            const i = Doc.addTile(doc, f, Doc.uniqueName(doc, `${nom}-${Math.floor(k / tw) + 1}-${(k % tw) + 1}`.replace(/\s+/g, '-')));
            doc.tiles[i].categorie = nom;
            return i;
          });
          if (st) doc.stamps = doc.stamps.map((o, k) => (k === si ? { ...o, cells, dessus: a.dessus === undefined ? o.dessus : clamp(Math.round(a.dessus), 0, o.h) } : o));
          else {
            const nouveau = Doc.newStamp(doc, { name: nom, w: tw, h: th, cells, dessus: a.dessus || 0 });
            doc.stamps = [...doc.stamps, nouveau];
            index = doc.stamps.length - 1;
          }
        });
        App.refresh();
        const o = doc.stamps[index];
        return {
          texte: [`Objet « ${o.name} » : tampon ${index}, ${tw} × ${th} tuiles (${W} × ${H} px), tuiles ${o.cells.filter((c) => c >= 0).join(', ')}${o.dessus ? `, ${o.dessus} rangée(s) devant le joueur` : ''}. Pose-le avec tampon action poser.`,
            `Regard critique : ${PixelArt.analyse(data, W, H).join(' ')}`,
            'Regarde l\'image agrandie : silhouette lisible, lumière en haut à gauche, détails en motifs soignés, contour sélectif. Retouche avec tampon et d\'autres operations si besoin.'].join('\n'),
          image: PixelArt.apercu([data], W, H, { mosaique: false }),
          max: 1024,
        };
      },
    },
    animer_tuile: {
      icone: 'play-circle',
      libelle: (a) => `Anime la tuile ${a.index ?? 'choisie'} (${String(a.mode || '').replace(/_/g, ' ')}, ${a.images || 4} images)`,
      description: 'Fabrique toutes les images d\'une tuile animée à partir d\'une seule (source : son numéro d\'image, 0 par défaut) ; les images existantes sont remplacées. images : 2 à 16 (4 par défaut) ; duree : ms par image. mode :\n- defilement (dx, dy : pixels par image, en boucle) : l\'eau qui coule, un tapis roulant. Pour une boucle sans saut, images × dx doit faire la taille de la tuile (ou un de ses diviseurs si le motif se répète).\n- cycle (couleurs : les codes dans l\'ordre du cycle, chacune prend la suivante) : reflets de l\'eau, flammes, lumière qui pulse. Le plus joli pour l\'eau : une rampe de 3 ou 4 bleus.\n- balancement (forme : codes des couleurs qui bougent, fond : couleur laissée derrière, « . » par défaut ; amplitude 1 à 2 pixels ; pied : la rangée qui reste fixe, le bas par défaut) : herbes hautes, fleurs, flammes au vent.\n- scintillement (couleur, nombre d\'éclats par image, forme : où ils peuvent apparaître, couleur_croix : un petit halo, graine) : reflets du soleil sur l\'eau, étoiles, magie.\nTu vois ensuite toutes les images côte à côte.',
      schema: { type: 'object', properties: { mode: { type: 'string', enum: ['defilement', 'cycle', 'balancement', 'scintillement'] }, index: nombre, source: nombre, images: nombre, duree: nombre, dx: nombre, dy: nombre, couleurs: { type: 'array', items: { type: 'string' } }, forme: { type: 'string' }, fond: { type: 'string' }, amplitude: nombre, pied: nombre, couleur: { type: 'string' }, couleur_croix: { type: 'string' }, nombre, graine: nombre }, required: ['mode'] },
      faire: (a) => {
        const doc = besoinJeu();
        const i = tuileNumero(doc, a.index);
        const t0 = doc.tiles[i];
        const src = t0.frames[clamp(Number(a.source) || 0, 0, t0.frames.length - 1)];
        const { nouvelles, lire } = lecteurCouleurs(doc);
        const images = PixelArt.animer(src, doc.tileSize, doc.tileSize, a.mode, a, lire);
        Doc.change(doc, 'Animer la tuile (Loki)', () => {
          ajouterCouleurs(doc, nouvelles);
          const t = Doc.tileForEdit(doc, i);
          t.frames = images;
          if (a.duree) t.duration = clamp(Math.round(a.duree), 30, 5000);
          Doc.touch(t);
          doc.current = i;
        });
        App.selectTile(i);
        App.selectFrame(0);
        if (!App.playing) App.togglePlay();
        App.refresh();
        const t = doc.tiles[i];
        return resultatTuile(doc, i, `Tuile ${i} « ${t.name} » animée : ${t.frames.length} images de ${t.duration || Doc.DEFAULT_DURATION} ms (${a.mode}). L'animation est lancée dans Tafl.`);
      },
    },
    tuile: {
      icone: 'symbol-misc',
      libelle: (a) => `Tuile ${a.index ?? 'choisie'} : ${String(a.action || '').replace(/_/g, ' ')}`,
      description: 'Agit sur une tuile (index, sinon la tuile choisie). action : choisir, renommer (nom), dupliquer, supprimer, vider, miroir_horizontal, miroir_vertical, tourner_droite, tourner_gauche, decaler (d\'une demi-tuile, pour voir les raccords ; refaire pour revenir), deplacer (vers la place position : la carte suit).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['choisir', 'renommer', 'dupliquer', 'supprimer', 'vider', 'miroir_horizontal', 'miroir_vertical', 'tourner_droite', 'tourner_gauche', 'decaler', 'deplacer'] }, index: nombre, nom: { type: 'string' }, position: nombre }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const i = tuileNumero(doc, a.index);
        const t = doc.tiles[i];
        // Tourner à gauche = trois quarts de tour à droite.
        const transform = { miroir_horizontal: ['flipH'], miroir_vertical: ['flipV'], tourner_droite: ['rotate'], tourner_gauche: ['rotate', 'rotate', 'rotate'], decaler: ['half'] }[a.action];
        if (a.action === 'choisir') App.selectTile(i);
        else if (a.action === 'renommer') Doc.change(doc, 'Renommer la tuile', () => { t.name = String(a.nom || t.name); });
        else if (a.action === 'dupliquer') Doc.change(doc, 'Dupliquer la tuile', () => { doc.current = Doc.addTile(doc, t.frames.map((f) => f.slice()), Doc.uniqueName(doc, t.name.replace(/-\d+$/, '')), i + 1, t.duration); });
        else if (a.action === 'supprimer') {
          if (doc.tiles.length === 1) throw new Error('C\'est la dernière tuile : un jeu en garde au moins une.');
          Doc.change(doc, 'Supprimer la tuile', () => { Doc.removeTile(doc, i); doc.current = clamp(i, 0, doc.tiles.length - 1); });
        } else if (a.action === 'deplacer') {
          const to = Math.round(a.position);
          if (!(to >= 0 && to < doc.tiles.length)) throw new Error(`position : de 0 à ${doc.tiles.length - 1}.`);
          Doc.change(doc, 'Déplacer la tuile', () => { Doc.moveTile(doc, i, to); doc.current = to; });
        } else if (a.action === 'vider') Doc.change(doc, 'Vider la tuile', () => { const tt = Doc.tileForEdit(doc, i); tt.frames = tt.frames.map((f) => new Uint8ClampedArray(f.length)); Doc.touch(tt); });
        else if (transform) {
          Doc.change(doc, a.action.replace(/_/g, ' '), () => { for (const kind of transform) Doc.transformTile(doc, i, Doc.TRANSFORMS[kind]); });
        } else throw new Error(`Action inconnue : ${a.action}`);
        App.refresh();
        return `Fait. Il y a maintenant ${doc.tiles.length} tuiles.`;
      },
    },
    ranger_tuiles: {
      icone: 'sort-precedence',
      libelle: (a) => ({ categorie: `Range ${a.tuiles?.length || 1} tuile(s) dans « ${a.categorie || 'sans catégorie'} »`, trier: `Trie les tuiles ${a.par || 'par nom'}`, doublons: 'Fusionne les tuiles en double', inutilisees: 'Supprime les tuiles inutilisées', renommer_categorie: `Renomme la catégorie « ${a.categorie} »` }[a.action] || 'Range les tuiles'),
      description: 'Range les tuiles (Tafl 0.13). La carte suit toujours : rien ne change à l\'écran du jeu. action : categorie (met les tuiles « tuiles » [numéros] dans la catégorie « categorie », vide = sans catégorie ; elles rejoignent les autres tuiles de la catégorie), renommer_categorie (categorie → nom), trier (par : nom, couleur, utilisation, animees ou categorie ; avec « tuiles », seules elles changent de place entre elles, sinon toutes, chaque catégorie restant groupée), doublons (les tuiles identiques n\'en font plus qu\'une), inutilisees (supprime les tuiles posées nulle part : cartes, tampons, événements, personnages). Les numéros des tuiles changent : relis voir_tuiles après.',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['categorie', 'renommer_categorie', 'trier', 'doublons', 'inutilisees'] }, tuiles: { type: 'array', items: nombre }, categorie: { type: 'string' }, nom: { type: 'string' }, par: { type: 'string', enum: ['nom', 'couleur', 'utilisation', 'animees', 'categorie'] } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const lot = (a.tuiles || []).map((i) => tuileNumero(doc, i));
        if (a.action === 'categorie') {
          const categorie = String(a.categorie || '').trim().slice(0, 60);
          const cibles = lot.length ? lot : [doc.current];
          const last = doc.tiles.reduce((k, t, j) => ((t.categorie || '') === categorie && !cibles.includes(j) ? j : k), -1);
          App.placeTiles(cibles, last >= 0 ? last + 1 : Math.min(...cibles), categorie);
          return `${cibles.length} tuile(s) rangée(s) ${categorie ? `dans « ${categorie} »` : 'sans catégorie'}.`;
        }
        if (a.action === 'renommer_categorie') {
          const nom = String(a.nom || '').trim().slice(0, 60);
          if (!nom || !doc.tiles.some((t) => t.categorie === a.categorie)) throw new Error('Donne une catégorie existante (categorie) et son nouveau nom (nom).');
          Doc.change(doc, 'Renommer la catégorie', () => { doc.tiles = doc.tiles.map((t) => (t.categorie === a.categorie ? { ...t, categorie: nom } : t)); });
          return `Catégorie « ${a.categorie} » renommée « ${nom} ».`;
        }
        const avant = doc.tiles.length;
        if (a.action === 'trier') App.sortTiles(a.par || 'nom', lot.length > 1 ? lot : null);
        else if (a.action === 'doublons') App.mergeDuplicates();
        else if (a.action === 'inutilisees') {
          const used = Doc.usedTiles(doc);
          const unused = doc.tiles.map((_t, i) => i).filter((i) => !used.has(i));
          if (unused.length) Doc.change(doc, 'Supprimer les tuiles inutilisées (Loki)', () => Doc.removeTiles(doc, new Set(unused)));
        } else throw new Error(`Action inconnue : ${a.action}`);
        return `Fait. ${avant !== doc.tiles.length ? `${avant - doc.tiles.length} tuile(s) en moins, ` : ''}${doc.tiles.length} tuiles maintenant (les numéros ont pu changer).`;
      },
    },
    poser_tuiles: {
      icone: 'symbol-array',
      libelle: (a) => `Pose la tuile ${a.tuile} sur la carte (${a.largeur || 1} × ${a.hauteur || 1} cases)`,
      description: 'Remplit un rectangle de cases d\'une carte avec une tuile. x, y : case en haut à gauche (0, 0 = coin en haut à gauche) ; largeur, hauteur en cases (1 par défaut) ; tuile : numéro (-1 pour effacer) ; variantes : [numéros] d\'autres versions de la même tuile (herbe, terre…), mélangées au hasard avec tuile pour casser la répétition ; calque : numéro ou nom (Sol, Décor…), sinon le calque choisi ; carte : id, nom ou numéro, sinon la carte affichée.',
      schema: { type: 'object', properties: { tuile: nombre, variantes: { type: 'array', items: nombre }, x: nombre, y: nombre, largeur: nombre, hauteur: nombre, calque: { type: ['string', 'number'] }, carte: { type: ['string', 'number'] } }, required: ['tuile', 'x', 'y'] },
      faire: (a) => {
        const doc = besoinJeu();
        choisirCarte(doc, a.carte);
        const t = Math.round(a.tuile);
        if (t !== -1) tuileNumero(doc, t);
        // Tafl 0.17 : la tuile et ses variantes, la tuile principale deux fois plus souvent que chacune.
        const variantes = (a.variantes || []).map((v) => tuileNumero(doc, Math.round(v)));
        const choix = t === -1 || !variantes.length ? [t] : [t, t, ...variantes];
        const li = calqueNumero(doc, a.calque);
        const { map } = doc;
        const x0 = clamp(Math.round(a.x), 0, map.width - 1), y0 = clamp(Math.round(a.y), 0, map.height - 1);
        const x1 = clamp(x0 + Math.round(a.largeur || 1), 1, map.width), y1 = clamp(y0 + Math.round(a.hauteur || 1), 1, map.height);
        Doc.change(doc, 'Poser des tuiles (Loki)', () => {
          const { cells } = Doc.layerForEdit(doc, li);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells[y * map.width + x] = choix[Math.floor(Math.random() * choix.length)];
        });
        App.setMode('map');
        return `${(x1 - x0) * (y1 - y0)} case(s) du calque ${map.layers[li].name} ${t === -1 ? 'effacée(s)' : `remplie(s) avec la tuile ${t}${variantes.length ? ` et ses variantes ${variantes.join(', ')}` : ''}`}.`;
      },
    },
    voir_tampons: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => (a.tampon !== undefined ? `Regarde le tampon ${a.tampon}` : 'Regarde les tampons'),
      description: 'Montre les tampons (objets de plusieurs tuiles : arbres, maisons…) en image, chacun avec son numéro, et leur nom et taille. de : premier numéro (0 par défaut) ; nombre : 1 à 48 (24 par défaut). tampon : un seul tampon (numéro ou nom), avec aussi ses numéros de tuile par rangée. Pour les retrouver par nom, catalogue suffit (texte, sans image).',
      schema: { type: 'object', properties: { de: nombre, nombre, tampon: { type: ['string', 'number'] } } },
      faire: (a) => {
        const doc = besoinJeu();
        if (!doc.stamps.length) return 'Aucun tampon.';
        if (a.tampon !== undefined) {
          const k = tamponParNumeroOuNom(doc, a.tampon), st = doc.stamps[k];
          const rangees = Array.from({ length: st.h }, (_v, j) => st.cells.slice(j * st.w, (j + 1) * st.w).map((c) => (c < 0 ? '.' : c)).join(' '));
          return { texte: [`Tampon ${ligneTampon(st, k)}${st.dessus ? ` (les ${st.dessus} rangée(s) du haut passent devant le joueur)` : ''}. Tuiles par rangée :`, ...rangees].join('\n'), image: plancheTampons(doc, [[st, k]]), max: 768 };
        }
        const de = clamp(Math.round(a.de || 0), 0, doc.stamps.length - 1);
        const page = doc.stamps.slice(de, de + clamp(Math.round(a.nombre || 24), 1, 48)).map((st, n) => [st, de + n]);
        const fin = de + page.length;
        return {
          texte: [`Tampons ${de} à ${fin - 1} sur ${doc.stamps.length} (numéro « nom » largeur×hauteur en tuiles)${fin < doc.stamps.length ? `. Suite : de ${fin}` : ''} :`, ...page.map(([st, k]) => ligneTampon(st, k))].join('\n'),
          image: plancheTampons(doc, page),
          max: 1024,
        };
      },
    },
    tampon: {
      icone: 'package',
      libelle: (a) => ({ poser: `Pose le tampon ${a.tampon} en (${a.x}, ${a.y})`, effacer: `Efface le tampon ${a.tampon} en (${a.x}, ${a.y})`, creer: `Crée le tampon « ${a.nom || 'tampon'} »`, reglages: `Règle le tampon ${a.tampon}`, supprimer: `Supprime le tampon ${a.tampon}` }[a.action] || 'Tampons'),
      description: 'Les tampons : des objets de plusieurs tuiles (arbre, maison, fontaine…) posés d\'un coup. action : poser ou effacer (tampon : numéro ou nom ; x, y : la case du coin en haut à gauche ; calque : numéro ou nom, sinon le calque choisi ; carte), creer (nom ; soit tuiles = une chaîne par rangée avec des numéros de tuile séparés par des espaces, « . » = vide, soit x, y, largeur, hauteur = un rectangle d\'un calque de la carte ; dessus), reglages (tampon ; nom, dessus = nombre de rangées du haut posées sur le calque au-dessus du joueur, comme la cime d\'un arbre), supprimer (ses tuiles restent).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['poser', 'effacer', 'creer', 'reglages', 'supprimer'] }, tampon: { type: ['string', 'number'] }, x: nombre, y: nombre, largeur: nombre, hauteur: nombre, calque: { type: ['string', 'number'] }, carte: { type: ['string', 'number'] }, nom: { type: 'string' }, tuiles: lignesSchema, dessus: nombre }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const numero = () => {
          const t = String(a.tampon ?? App.options.stamp);
          const i = /^\d+$/.test(t) && doc.stamps[Number(t)] ? Number(t) : doc.stamps.findIndex((st) => st.name.toLowerCase() === t.toLowerCase());
          if (i < 0) throw new Error(`Pas de tampon « ${a.tampon} » : ${doc.stamps.map((st, k) => `${k} = ${st.name}`).join(', ') || 'aucun tampon'}.`);
          return i;
        };
        if (a.action === 'creer') {
          let w, h, cells;
          if (Array.isArray(a.tuiles)) {
            const rangees = a.tuiles.map((l) => String(l).trim().split(/\s+/));
            h = rangees.length;
            w = Math.max(...rangees.map((r) => r.length));
            cells = [];
            rangees.forEach((r, j) => { for (let i = 0; i < w; i++) { const v = r[i]; const t = v === undefined || v === '.' ? -1 : Number(v); if (!Number.isInteger(t) || t < -1 || t >= doc.tiles.length) throw new Error(`« ${v} » (rangée ${j + 1}) n'est pas un numéro de tuile.`); cells.push(t); } });
          } else {
            choisirCarte(doc, a.carte);
            const li = calqueNumero(doc, a.calque);
            const { map } = doc;
            const x = clamp(Math.round(a.x || 0), 0, map.width - 1), y = clamp(Math.round(a.y || 0), 0, map.height - 1);
            w = clamp(Math.round(a.largeur || 1), 1, map.width - x);
            h = clamp(Math.round(a.hauteur || 1), 1, map.height - y);
            cells = Doc.stampFromRect(doc, map, li, { x, y, w, h });
          }
          if (!cells.some((c) => c >= 0)) throw new Error('Ce tampon serait vide.');
          const st = Doc.newStamp(doc, { name: a.nom || 'tampon', w, h, cells, dessus: a.dessus || 0 });
          Doc.change(doc, 'Nouveau tampon (Loki)', () => { doc.stamps = [...doc.stamps, st]; });
          return `Tampon ${doc.stamps.length - 1} « ${st.name} » (${w} × ${h}) créé.`;
        }
        const i = numero();
        const st = doc.stamps[i];
        if (a.action === 'reglages') {
          const name = a.nom ? String(a.nom) : st.name, dessus = a.dessus === undefined ? st.dessus : clamp(Math.round(a.dessus), 0, st.h);
          Doc.change(doc, 'Réglages du tampon (Loki)', () => { doc.stamps = doc.stamps.map((o, k) => (k === i ? { ...o, name, dessus } : o)); });
          return `Tampon ${i} : « ${name} », ${dessus} rangée(s) au-dessus du joueur.`;
        }
        if (a.action === 'supprimer') {
          App.deleteStamp(i);
          return `Tampon « ${st.name} » supprimé (ses tuiles restent dans le jeu).`;
        }
        if (a.action === 'poser' || a.action === 'effacer') {
          choisirCarte(doc, a.carte);
          const li = calqueNumero(doc, a.calque);
          if (li < 0) throw new Error('Choisis un calque (calque : numéro ou nom).');
          let n = 0;
          Doc.change(doc, a.action === 'poser' ? 'Poser un tampon (Loki)' : 'Effacer un tampon (Loki)', () => { n = Doc.placeStamp(doc, st, Math.round(a.x || 0), Math.round(a.y || 0), li, a.action === 'effacer'); });
          return `Tampon « ${st.name} » ${a.action === 'poser' ? 'posé' : 'effacé'} en (${Math.round(a.x || 0)}, ${Math.round(a.y || 0)}) : ${n} case(s).`;
        }
        throw new Error(`Action inconnue : ${a.action}`);
      },
    },
    ecrire_carte: {
      icone: 'symbol-array',
      libelle: (a) => `Écrit ${a.lignes?.length || 0} rangée(s) de la carte`,
      description: 'Écrit plusieurs cases d\'un coup : lignes = une chaîne par rangée, avec les numéros de tuile séparés par des espaces (« . » = vide, « _ » = ne pas toucher, « 12*5 » = 5 fois la tuile 12, comme voir_carte). Pour toute une ville ou une route, plan_carte est plus simple. x, y : où commence la première case (0, 0 par défaut) ; calque : numéro ou nom, sinon le calque choisi ; carte : id, nom ou numéro, sinon la carte affichée.',
      schema: { type: 'object', properties: { lignes: lignesSchema, x: nombre, y: nombre, calque: { type: ['string', 'number'] }, carte: { type: ['string', 'number'] } }, required: ['lignes'] },
      faire: (a) => {
        const doc = besoinJeu();
        choisirCarte(doc, a.carte);
        const li = calqueNumero(doc, a.calque);
        const { map } = doc;
        const x0 = Math.round(a.x || 0), y0 = Math.round(a.y || 0);
        let n = 0;
        Doc.change(doc, 'Écrire la carte (Loki)', () => {
          const { cells } = Doc.layerForEdit(doc, li);
          (a.lignes || []).forEach((ligne, dy) => {
            String(ligne).trim().split(/\s+/).flatMap((v) => { const r = /^(.+)\*(\d+)$/.exec(v); return r ? Array(Math.min(Number(r[2]), 256)).fill(r[1]) : [v]; }).forEach((v, dx) => {
              const x = x0 + dx, y = y0 + dy;
              if (v === '_' || x < 0 || y < 0 || x >= map.width || y >= map.height) return;
              const t = v === '.' ? -1 : Number(v);
              if (!Number.isInteger(t) || t < -1 || t >= doc.tiles.length) throw new Error(`« ${v} » (rangée ${dy + 1}) n'est pas un numéro de tuile (0 à ${doc.tiles.length - 1}, ou .).`);
              cells[y * map.width + x] = t;
              n++;
            });
          });
        });
        App.setMode('map');
        return `${n} case(s) écrite(s) sur le calque ${map.layers[li].name}.`;
      },
    },
    // Tafl 0.19 : décrire beaucoup de tuiles et de tampons d'un coup, une fois pour toutes.
    nommer: {
      icone: 'tag',
      libelle: (a) => `Nomme ${(a.tuiles || []).length + (a.tampons || []).length} groupe(s) de tuiles et tampons`,
      description: 'Donne un nom court et parlant (« herbe haute », « toit rouge coin haut gauche », « porte d\'arène ») à des tuiles et des tampons, en un seul appel ; le nom est gardé dans le jeu et sert ensuite au catalogue et à plan_carte. tuiles : [{ tuiles : « 12-15, 40 » ou [numéros], nom, passage : auto, libre ou bloque (facultatif) }] (des tuiles qui vont ensemble peuvent garder le même nom) ; tampons : [{ tampon : numéro ou nom, nom, dessus : rangées du haut devant le joueur (facultatif) }]. Les numéros ne changent pas.',
      schema: { type: 'object', properties: {
        tuiles: { type: 'array', items: { type: 'object', properties: { tuiles: { type: ['string', 'array', 'number'] }, nom: { type: 'string' }, passage: { type: 'string', enum: ['auto', 'libre', 'bloque'] } }, required: ['tuiles'] } },
        tampons: { type: 'array', items: { type: 'object', properties: { tampon: { type: ['string', 'number'] }, nom: { type: 'string' }, dessus: nombre }, required: ['tampon'] } },
      } },
      faire: (a) => {
        const doc = besoinJeu();
        // Tout est vérifié avant de changer quoi que ce soit.
        const tuiles = (a.tuiles || []).map((e) => ({ liste: lirePlages(doc, e.tuiles), nom: e.nom === undefined ? null : String(e.nom).trim().slice(0, 80), passage: e.passage }));
        const tampons = (a.tampons || []).map((e) => ({ k: tamponParNumeroOuNom(doc, e.tampon), nom: e.nom === undefined ? null : String(e.nom).trim().slice(0, 80), dessus: e.dessus }));
        let n = 0;
        Doc.change(doc, 'Nommer des tuiles (Loki)', () => {
          const copie = doc.tiles.slice();
          for (const e of tuiles) {
            for (const i of e.liste) {
              copie[i] = { ...copie[i], ...(e.nom ? { name: e.nom } : {}), ...(['auto', 'libre', 'bloque'].includes(e.passage) ? { passage: e.passage } : {}) };
              n++;
            }
          }
          doc.tiles = copie;
          if (tampons.length) {
            doc.stamps = doc.stamps.map((st, k) => {
              const e = tampons.findLast((t) => t.k === k);
              return e ? { ...st, ...(e.nom ? { name: e.nom } : {}), ...(e.dessus !== undefined ? { dessus: clamp(Math.round(e.dessus), 0, st.h) } : {}) } : st;
            });
          }
        });
        App.refresh();
        const reste = doc.tiles.filter(sansNom).length;
        return `${n} tuile(s) et ${tampons.length} tampon(s) nommés.${reste ? ` Encore ${reste} tuiles sans nom.` : ''} Enregistre le jeu pour garder les noms (et exporter_planche_nommee pour les reprendre dans un autre jeu).`;
      },
    },
    // Tafl 0.19 : toute une carte (ou une partie) en un appel, à partir d'un plan en texte.
    // Au lieu de cent poser_tuiles et tampon, qui relisent chacun toute la conversation.
    plan_carte: {
      icone: 'map',
      libelle: (a) => `Construit ${a.nouvelle ? `la carte « ${a.nouvelle.nom || 'nouvelle'} »` : 'la carte'} d'après un plan de ${a.plan?.length || 0} rangée(s)`,
      description: `Construit une carte (ou une partie) d'un seul coup, à partir d'un plan en texte : la bonne façon de faire une ville, une route, un intérieur. plan : une chaîne par rangée de cases, un caractère par case ; legende : { "caractère": ce qu'il pose } ; l'espace ne pose rien. Une entrée de légende : { tuile : numéro ou nom (catalogue), variantes : [numéros ou noms] mélangées au hasard, calque } pour une tuile ; { tampon : numéro ou nom, calque } pour un objet de plusieurs tuiles (maison, arbre, arène) : il est posé là où son caractère apparaît en premier (coin haut gauche) et couvre sa taille, donc dessine-le comme un bloc de son caractère (une maison 5×4 = 4 rangées de 5 « M ») ; { effacer: true, calque } vide la case ; passage (${Object.keys(Doc.PASSAGE).join(', ')}) peint aussi le passage de la case. Une liste d'entrées pose plusieurs choses sur la même case (par exemple l'herbe sur Sol et une fleur sur Décor). calque : numéro ou nom (Sol par défaut pour une tuile, Décor pour un tampon). fond : une entrée (ou une liste) posée d'abord sous tout le plan (l'herbe partout). x, y : la case où commence le plan (0, 0). carte : id, nom ou numéro, sinon la carte affichée ; nouvelle : { nom, groupe, interieur } crée d'abord une carte à la taille du plan. Tout s'annule d'un seul Ctrl+Z. image: true renvoie une image du résultat (chère : seulement pour vérifier).`,
      schema: { type: 'object', properties: {
        plan: lignesSchema,
        legende: { type: 'object', additionalProperties: { type: ['object', 'array'] } },
        fond: { type: ['object', 'array'] },
        x: nombre, y: nombre,
        carte: { type: ['string', 'number'] },
        nouvelle: { type: 'object', properties: { nom: { type: 'string' }, groupe: { type: 'string' }, interieur: { type: 'boolean' } } },
        image: { type: 'boolean' },
      }, required: ['plan', 'legende'] },
      faire: (a) => {
        const doc = besoinJeu();
        const plan = (a.plan || []).map((l) => [...String(l)]);
        if (!plan.length) throw new Error('plan : une chaîne par rangée de cases.');
        const largeurPlan = Math.max(...plan.map((l) => l.length)), hauteurPlan = plan.length;
        if (largeurPlan > 256 || hauteurPlan > 256) throw new Error('Un plan fait 256 × 256 cases au plus.');
        if (!a.nouvelle) choisirCarte(doc, a.carte);
        // Les calques d'une carte neuve sont Sol, Décor, Au-dessus (Doc.newMap) : on peut tout vérifier avant.
        const calquesDe = (m) => (m ? m.layers.map((l) => l.name) : Doc.newMap().layers.map((l) => l.name));
        const noms = calquesDe(a.nouvelle ? null : doc.map);
        const calque = (v, defaut) => {
          if (v === undefined || v === null) return Math.min(defaut, noms.length - 1);
          if (typeof v === 'number' || /^\d+$/.test(v)) { const i = Number(v); if (noms[i] === undefined) throw new Error(`Pas de calque n° ${v} : ${noms.map((n, k) => `${k} = ${n}`).join(', ')}.`); return i; }
          const i = noms.findIndex((n) => n.toLowerCase() === String(v).toLowerCase());
          if (i < 0) throw new Error(`Pas de calque « ${v} » : ${noms.join(', ')}.`);
          return i;
        };
        // Une entrée de légende -> { sorte, … } vérifiée.
        const entree = (e, ou) => {
          if (!e || typeof e !== 'object') throw new Error(`${ou} : une entrée { tuile }, { tampon } ou { effacer: true }.`);
          const passage = e.passage === undefined ? null : Doc.PASSAGE[e.passage];
          if (passage === undefined) throw new Error(`${ou} : passage ${Object.keys(Doc.PASSAGE).join(', ')}.`);
          if (e.tampon !== undefined) return { sorte: 'tampon', st: doc.stamps[tamponParNumeroOuNom(doc, e.tampon)], li: calque(e.calque, 1), passage };
          if (e.effacer) return { sorte: 'tuile', choix: [-1], li: calque(e.calque, 0), passage };
          if (e.tuile !== undefined) {
            const t = tuileParNumeroOuNom(doc, e.tuile);
            const variantes = (e.variantes || []).map((v) => tuileParNumeroOuNom(doc, v));
            return { sorte: 'tuile', choix: t === -1 || !variantes.length ? [t] : [t, t, ...variantes], li: calque(e.calque, 0), passage };
          }
          if (passage !== null) return { sorte: 'passage', passage };
          throw new Error(`${ou} : il faut tuile, tampon, effacer ou passage.`);
        };
        const liste = (v, ou) => (Array.isArray(v) ? v : [v]).map((e, k) => entree(e, Array.isArray(v) ? `${ou} n° ${k + 1}` : ou));
        const legende = new Map(Object.entries(a.legende || {}).map(([c, v]) => {
          if ([...c].length !== 1) throw new Error(`legende : « ${c} » doit être un seul caractère.`);
          return [c, liste(v, `legende « ${c} »`)];
        }));
        const fond = a.fond ? liste(a.fond, 'fond') : [];
        const inconnus = new Set();
        const decales = new Set(); // tampons dont le bloc dans le plan n'a pas leur taille
        const compte = { cases: 0, passage: 0, tampons: new Map() };
        Doc.change(doc, 'Construire d\'après un plan (Loki)', () => {
          if (a.nouvelle) {
            Doc.addMap(doc, { name: String(a.nouvelle.nom || `Carte ${doc.maps.length + 1}`), width: Math.max(largeurPlan + Math.round(a.x || 0), 1), height: Math.max(hauteurPlan + Math.round(a.y || 0), 1), groupe: a.nouvelle.groupe === undefined ? doc.map.groupe : String(a.nouvelle.groupe).trim().slice(0, 60), interieur: a.nouvelle.interieur === true });
          }
          const { map } = doc;
          const x0 = Math.round(a.x || 0), y0 = Math.round(a.y || 0);
          const dans = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height;
          const poser = (e, x, y) => {
            if (e.passage !== null && e.sorte !== 'tampon' && dans(x, y)) { Doc.passageForEdit(doc, map)[y * map.width + x] = e.passage; compte.passage++; }
            if (e.sorte !== 'tuile' || !dans(x, y)) return;
            Doc.layerForEdit(doc, e.li, map).cells[y * map.width + x] = e.choix[Math.floor(Math.random() * e.choix.length)];
            compte.cases++;
          };
          for (const e of fond) for (let j = 0; j < hauteurPlan; j++) for (let i = 0; i < largeurPlan; i++) poser(e, x0 + i, y0 + j);
          const couvert = new Set(); // « caractère:x,y » déjà couverts par un tampon de ce caractère
          plan.forEach((ligne, j) => ligne.forEach((c, i) => {
            if (c === ' ') return;
            const entrees = legende.get(c);
            if (!entrees) { inconnus.add(c); return; }
            for (const e of entrees) {
              if (e.sorte !== 'tampon') { poser(e, x0 + i, y0 + j); continue; }
              if (couvert.has(`${c}:${i},${j}`)) continue;
              for (let dy = 0; dy < e.st.h; dy++) {
                for (let dx = 0; dx < e.st.w; dx++) {
                  couvert.add(`${c}:${i + dx},${j + dy}`);
                  if (plan[j + dy]?.[i + dx] !== c) decales.add(`« ${c} » (${e.st.name}, ${e.st.w}×${e.st.h})`);
                }
              }
              Doc.placeStamp(doc, e.st, x0 + i, y0 + j, e.li, false, map);
              if (e.passage !== null) for (let dy = 0; dy < e.st.h; dy++) for (let dx = 0; dx < e.st.w; dx++) poser({ sorte: 'passage', passage: e.passage }, x0 + i + dx, y0 + j + dy);
              compte.tampons.set(e.st.name, (compte.tampons.get(e.st.name) || 0) + 1);
            }
          }));
        });
        if (a.nouvelle) Stage.reset();
        App.setMode('map');
        App.refresh();
        const map = doc.map;
        const texte = [`Carte ${doc.mapIndex} = ${map.id} « ${map.name} » (${map.width} × ${map.height}) : ${compte.cases} case(s) de tuiles posées${compte.tampons.size ? `, tampons ${[...compte.tampons].map(([n, k]) => `${n} ×${k}`).join(', ')}` : ''}${compte.passage ? `, passage peint sur ${compte.passage} case(s)` : ''}. Un seul Ctrl+Z annule tout.`,
          ...(inconnus.size ? [`Caractères sans légende, ignorés : ${[...inconnus].map((c) => `« ${c} »`).join(' ')}.`] : []),
          ...(decales.size ? [`Attention : les blocs de ${[...decales].join(', ')} n'ont pas la taille de leur tampon, qui a pu être posé plusieurs fois ou déborder. Un bloc = la taille exacte du tampon.`] : []),
          ...(largeurPlan + Math.round(a.x || 0) > map.width || hauteurPlan + Math.round(a.y || 0) > map.height ? [`Le plan dépasse la carte : ce qui sort de ${map.width} × ${map.height} est ignoré (taille_carte pour l'agrandir).`] : [])].join('\n');
        return a.image ? { texte, image: agrandir(IO.mapCanvas(doc, 1), 768), max: 768 } : texte;
      },
    },
    taille_carte: {
      icone: 'screen-full',
      libelle: (a) => `Passe la carte à ${a.largeur} × ${a.hauteur} cases`,
      description: 'Change la taille d\'une carte (en cases ; carte : id, nom ou numéro, sinon la carte affichée). Les cases existantes restent en place, depuis le coin en haut à gauche.',
      schema: { type: 'object', properties: { largeur: nombre, hauteur: nombre, carte: { type: ['string', 'number'] } }, required: ['largeur', 'hauteur'] },
      faire: (a) => {
        const doc = besoinJeu();
        choisirCarte(doc, a.carte);
        const w = clamp(Math.round(a.largeur), 1, 256), h = clamp(Math.round(a.hauteur), 1, 256);
        Doc.change(doc, 'Taille de la carte', () => Doc.resizeMap(doc, w, h));
        return `Carte : ${w} × ${h} cases.`;
      },
    },
    ajouter_couleurs: {
      icone: 'symbol-color',
      libelle: (a) => `Ajoute ${a.couleurs?.length || 0} couleur(s) à la palette`,
      description: 'Ajoute des couleurs (#rrggbb) à la palette du jeu.',
      schema: { type: 'object', properties: { couleurs: { type: 'array', items: { type: 'string' } } }, required: ['couleurs'] },
      faire: (a) => {
        const doc = besoinJeu();
        const nouvelles = (a.couleurs || []).map(normalizeHex).filter((c) => c && !doc.palette.includes(c));
        if (!nouvelles.length) return 'Ces couleurs sont déjà dans la palette (ou ne sont pas au format #rrggbb).';
        Doc.change(doc, 'Ajouter des couleurs', () => doc.palette.push(...[...new Set(nouvelles)]));
        return legende(doc);
      },
    },
    mode: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Affiche l'espace ${a.mode}`,
      description: 'Change l\'espace de travail affiché dans Tafl (Tafl 0.30) : accueil (le jeu en un coup d\'œil), tuile (la tuile choisie, agrandie), carte, evenements (un événement en pleine page : id et carte), donnees (les données du jeu : onglet, et id d\'un élément), jeu (jouer, vérifier, exporter).',
      schema: { type: 'object', properties: { mode: { type: 'string', enum: ['accueil', 'tuile', 'carte', 'evenements', 'donnees', 'jeu'] }, carte: { type: ['string', 'number'] }, id: { type: 'string' }, onglet: { type: 'string' } }, required: ['mode'] },
      faire: async (a) => {
        const doc = besoinJeu();
        if (a.mode === 'carte' || a.mode === 'tuile') App.setMode(a.mode === 'carte' ? 'map' : 'tile');
        else if (a.mode === 'evenements' && a.id) {
          const map = doc.maps[carteNumero(doc, a.carte)];
          if (!map.events.some((e) => e.id === a.id)) throw new Error(`Pas d'événement « ${a.id} » sur ${map.id}.`);
          await Espaces.aller('evenements', { carte: map.id, evenement: a.id });
        } else if (a.mode === 'donnees') await Espaces.aller('donnees', a.onglet ? { tab: a.onglet, id: a.id } : {});
        else await Espaces.aller(a.mode);
        return 'Fait.';
      },
    },
    exporter_planche: {
      icone: 'export',
      libelle: (a) => `Exporte la planche vers ${a.chemin}`,
      description: 'Exporte toutes les tuiles dans une image PNG en grille (ce que lisent Tiled, Godot, Phaser…), dans le dossier du projet. chemin : relatif au dossier du projet, en .png ; colonnes (par défaut celles du jeu) ; echelle (1 par défaut).',
      schema: { type: 'object', properties: { chemin: { type: 'string' }, colonnes: nombre, echelle: nombre }, required: ['chemin'] },
      faire: async (a) => {
        const doc = besoinJeu();
        if (!/\.png$/i.test(a.chemin)) throw new Error('Le fichier doit finir par .png.');
        const c = IO.sheetCanvas(doc, Math.round(a.colonnes || doc.columns), clamp(Math.round(a.echelle || 1), 1, 8));
        const chemin = await window.claude.ecrireFichier(a.chemin, await IO.canvasBytes(c));
        return `Planche exportée : ${chemin} (${c.width} × ${c.height} px).`;
      },
    },
    // Tafl 0.20 : la planche et ses noms, pour les reprendre dans un autre jeu sans les renommer.
    exporter_planche_nommee: {
      icone: 'export',
      libelle: (a) => `Exporte la planche nommée vers ${a.chemin}`,
      description: 'Exporte des tuiles en planche PNG (taille réelle) avec, à côté, un fichier .tuiles.json : noms, passage, catégories, animations et tampons. Importer ce PNG dans un autre jeu (importer_planche) reprend tout, sans avoir à renommer. chemin : relatif au dossier du projet, en .png ; categorie : seulement ces tuiles (souvent celles d\'une planche importée), sinon toutes ; colonnes (par défaut celles du jeu).',
      schema: { type: 'object', properties: { chemin: { type: 'string' }, categorie: { type: 'string' }, colonnes: nombre }, required: ['chemin'] },
      faire: async (a) => {
        const doc = besoinJeu();
        if (!/\.png$/i.test(a.chemin)) throw new Error('Le fichier doit finir par .png.');
        const p = IO.plancheNommee(doc, { categorie: a.categorie === undefined ? null : String(a.categorie), colonnes: a.colonnes || doc.columns });
        const png = await window.claude.ecrireFichier(a.chemin, await IO.canvasBytes(p.canvas));
        const json = await window.claude.ecrireFichier(a.chemin.replace(/\.png$/i, '') + '.tuiles.json', IO.textBytes(JSON.stringify(p.json)));
        return `Planche nommée exportée : ${png} (${p.nombre} tuiles, dont ${p.nommees} nommées ; ${p.json.tampons.length} tampons) et ${json}.${p.nommees < p.nombre ? ` ${p.nombre - p.nommees} tuiles n'ont pas encore de nom.` : ''}`;
      },
    },
    exporter_carte: {
      icone: 'export',
      libelle: (a) => `Exporte la carte en image vers ${a.chemin}`,
      description: 'Exporte une carte (carte : sinon celle affichée) en image PNG dans le dossier du projet (chemin relatif, en .png ; echelle 1 à 4).',
      schema: { type: 'object', properties: { chemin: { type: 'string' }, echelle: nombre, carte: { type: ['string', 'number'] } }, required: ['chemin'] },
      faire: async (a) => {
        const doc = besoinJeu();
        choisirCarte(doc, a.carte);
        if (!/\.png$/i.test(a.chemin)) throw new Error('Le fichier doit finir par .png.');
        const c = IO.mapCanvas(doc, clamp(Math.round(a.echelle || 1), 1, 4));
        const chemin = await window.claude.ecrireFichier(a.chemin, await IO.canvasBytes(c));
        return `Carte exportée : ${chemin} (${c.width} × ${c.height} px).`;
      },
    },
    enregistrer: {
      icone: 'save',
      libelle: () => 'Enregistre le jeu',
      description: 'Enregistre le jeu (comme Ctrl+S) : un dossier de jeu réécrit jeu.json, tuiles.tafl et cartes/*.json ; un jeu de tuiles son .tafl. S\'il n\'a pas encore d\'emplacement, Tafl demande à Ragna où l\'enregistrer (préfère enregistrer_jeu ou enregistrer_sous, qui écrivent dans le projet).',
      faire: async () => {
        const doc = besoinJeu();
        return (await IO.save(doc)) ? `Enregistré : ${doc.path}.` : 'Ragna a annulé l\'enregistrement.';
      },
    },
    annuler: {
      icone: 'discard',
      libelle: () => 'Annule la dernière modification',
      description: 'Annule la dernière modification (comme Ctrl+Z).',
      faire: () => {
        const doc = besoinJeu();
        const label = Doc.undo(doc);
        App.refresh();
        return label ? `Annulé : ${label}.` : 'Rien à annuler.';
      },
    },
  }));
  // --- Le reste : menus, animation, palette, fichiers du projet ---
  const normal = (t) => String(t).toLowerCase().replace(/…|\.\.\./g, '').replace(/\s+/g, ' ').trim();
  function lignesMenus() {
    const lignes = [];
    for (const [menu, items] of Object.entries(App.MENUS)) {
      for (const item of items()) if (item && !item.disabled) lignes.push({ menu, libelle: item.label, touches: item.keys || '', run: item.run });
    }
    return lignes;
  }
  function ligneMenu(chemin) {
    const parts = String(chemin).split(/\s+[›>]\s+|\s*›\s*/).filter(Boolean);
    const libelle = normal(parts.pop() || '');
    const menu = parts.length ? normal(parts.join(' ')) : null;
    const lignes = lignesMenus().filter((l) => !menu || normal(l.menu) === menu);
    const ligne = lignes.find((l) => normal(l.libelle) === libelle) || (() => { const p = lignes.filter((l) => normal(l.libelle).includes(libelle)); return p.length === 1 ? p[0] : null; })();
    if (!ligne) throw new Error(`Pas de commande « ${chemin} » dans les menus (ou elle n'est pas possible pour l'instant). Regarde la liste avec l'action menus.`);
    return ligne;
  }
  const decrireFenetres = (fenetres) => fenetres.map((f) => (f.question
    ? `Question « ${f.titre} » : ${f.question} → ${f.reponse}`
    : `Fenêtre « ${f.titre} »${f.erreur ? ` (non validée : ${f.erreur})` : ''} :\n${f.champs.map((c) => `  - ${c.cle} : ${c.libelle} (${c.type}${c.choix ? ` : ${c.choix.join(', ')}` : ''}${c.min !== undefined ? `, ${c.min} à ${c.max}${c.unite ? ` ${c.unite}` : ''}` : ''})${f.valeurs ? ` = ${JSON.stringify(f.valeurs[c.cle])}` : ''}`).join('\n')}`)).join('\n');
  const dossierRel = (d) => String(d || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  ClaudePanneau.actions(avecPages({
    menus: {
      lecture: true,
      icone: 'list-flat',
      libelle: () => 'Regarde les menus de Tafl',
      description: 'Liste les commandes des menus de Tafl (Fichier, Tuile, Carte, Jeu, Affichage) possibles en ce moment, avec leur raccourci. Une commande qui finit par « … » ouvre une fenêtre : champs_menu en donne les champs. Lance-les avec l\'action menu.',
      faire: () => {
        const parMenu = {};
        for (const l of lignesMenus()) (parMenu[l.menu] ||= []).push(`${l.libelle}${l.touches ? ` (${l.touches})` : ''}`);
        return Object.entries(parMenu).map(([m, items]) => `${m} :\n${items.map((i) => `  - ${i}`).join('\n')}`).join('\n');
      },
    },
    champs_menu: {
      lecture: true,
      icone: 'list-flat',
      libelle: (a) => `Regarde les réglages de « ${a.commande} »`,
      description: 'Donne les champs de la fenêtre qu\'ouvre une commande de menu qui finit par « … » (hors menu Fichier), sans rien changer. commande : « Menu › Commande », par exemple « Tuile › Taille des tuiles du jeu… ».',
      schema: { type: 'object', properties: { commande: { type: 'string' } }, required: ['commande'] },
      faire: async (a) => {
        const ligne = ligneMenu(a.commande);
        if (!ligne.libelle.endsWith('…') || ligne.menu === 'Fichier') throw new Error(`« ${ligne.libelle} » n'a pas de fenêtre de réglages à lire ici : lance-la avec l'action menu.`);
        const { fenetres } = await Dialogs.automatique({ apercu: true }, () => ligne.run());
        return fenetres.length ? decrireFenetres(fenetres) : 'Cette commande n\'a pas ouvert de fenêtre.';
      },
    },
    menu: {
      icone: 'play',
      libelle: (a) => `Lance « ${a.commande} »`,
      description: 'Lance une commande des menus de Tafl, comme si Ragna cliquait dessus (liste : action menus), par exemple « Carte › Remplir le calque avec la tuile choisie » ou « Affichage › Mosaïque (raccords) ». Si elle ouvre une fenêtre, elle se remplit avec valeurs (les clés de champs_menu) et se valide toute seule ; choix : le bouton à prendre si une question s\'affiche. Les commandes qui demandent un fichier ou un dossier ouvrent la fenêtre de Windows pour Ragna : préfère ouvrir, importer_planche, enregistrer_sous, exporter_planche, exporter_tuiles, exporter_tiled et exporter_carte, qui écrivent dans le projet.',
      schema: { type: 'object', properties: { commande: { type: 'string' }, valeurs: { type: ['object', 'array'] }, choix: { type: 'string' } }, required: ['commande'] },
      faire: async (a) => {
        const ligne = ligneMenu(a.commande);
        const doc = App.doc;
        const avant = doc?.undo.length;
        const { fenetres } = await Dialogs.automatique({ valeurs: a.valeurs, choix: a.choix }, () => ligne.run());
        const fait = App.doc !== doc || (App.doc && App.doc.undo.length !== avant);
        const lignes = [`${ligne.menu} › ${ligne.libelle} : ${fenetres.some((f) => f.erreur) ? 'pas fait.' : fait ? 'fait.' : 'lancé.'}`];
        if (fenetres.length) lignes.push(decrireFenetres(fenetres));
        return lignes.join('\n');
      },
    },
    animation: {
      icone: 'play-circle',
      libelle: (a) => `Animation de la tuile ${a.index ?? 'choisie'} : ${String(a.action || '').replace(/_/g, ' ')}`,
      description: 'Les images d\'une tuile animée (eau, fleurs…). index : la tuile, sinon la tuile choisie. action : ajouter_image (copie de l\'image image, sinon de l\'image en cours, juste après ; ensuite dessine-la avec dessiner_tuile index + image), supprimer_image (image), choisir_image (image : celle qu\'on voit et qu\'on dessine), duree (ms : durée de chaque image, 30 à 5000), deplacer_image (image vers position), lancer, arreter. 16 images au plus.',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['ajouter_image', 'supprimer_image', 'choisir_image', 'duree', 'deplacer_image', 'lancer', 'arreter'] }, index: nombre, image: nombre, ms: nombre, position: nombre }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const i = tuileNumero(doc, a.index);
        if (i !== doc.current) App.selectTile(i);
        const t = doc.tiles[i];
        const k = a.image === undefined ? App.frame : Math.round(a.image);
        if (!(k >= 0 && k < t.frames.length)) throw new Error(`Pas d'image n° ${a.image} (la tuile en a ${t.frames.length}, de 0 à ${t.frames.length - 1}).`);
        App.selectFrame(k);
        if (a.action === 'ajouter_image') { if (t.frames.length >= 16) throw new Error('16 images au plus par tuile.'); App.addFrame(); }
        else if (a.action === 'supprimer_image') { if (t.frames.length < 2) throw new Error('La tuile n\'a qu\'une image.'); App.deleteFrame(); }
        else if (a.action === 'duree') App.setDuration(Number(a.ms));
        else if (a.action === 'deplacer_image') {
          const to = Math.round(a.position);
          if (!(to >= 0 && to < t.frames.length)) throw new Error(`position : de 0 à ${t.frames.length - 1}.`);
          Doc.change(doc, 'Déplacer l\'image', () => Doc.moveFrame(doc, i, k, to));
          App.selectFrame(to);
        } else if (a.action === 'lancer' || a.action === 'arreter') { if (App.playing !== (a.action === 'lancer')) App.togglePlay(); }
        else if (a.action !== 'choisir_image') throw new Error(`Action inconnue : ${a.action}`);
        App.refresh();
        const tt = doc.tiles[i];
        return `Tuile ${i} « ${tt.name} » : ${tt.frames.length} image(s) de ${tt.duration || Doc.DEFAULT_DURATION} ms, image en cours ${App.frame}, animation ${App.playing ? 'lancée' : 'arrêtée'}.`;
      },
    },
    palette: {
      icone: 'symbol-color',
      libelle: (a) => `Palette : ${String(a.action || '').replace(/_/g, ' ')}`,
      description: `Change la palette. action : choisir (modele : ${PALETTES.map((p) => `${p.id} = ${p.nom}`).join(', ')}, ou utilisees = les couleurs déjà dans les tuiles ; les tuiles ne changent pas), remplacer (de #rrggbb vers #rrggbb : dans la palette ET dans toutes les tuiles), retirer (couleur, seulement de la palette), couleur_principale (couleur : celle du crayon de Ragna).`,
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['choisir', 'remplacer', 'retirer', 'couleur_principale'] }, modele: { type: 'string' }, de: { type: 'string' }, vers: { type: 'string' }, couleur: { type: 'string' } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        if (a.action === 'choisir') {
          const couleurs = a.modele === 'utilisees' ? Panels.usedColors(doc) : PALETTES.find((p) => p.id === a.modele)?.couleurs;
          if (!couleurs) throw new Error(`Modèle inconnu : ${a.modele}`);
          Doc.change(doc, 'Changer de palette', () => { doc.palette = [...couleurs]; });
        } else if (a.action === 'remplacer') {
          const de = normalizeHex(a.de), vers = normalizeHex(a.vers);
          if (!de || !vers) throw new Error('de et vers : des couleurs #rrggbb.');
          Doc.change(doc, 'Modifier une couleur', () => {
            const i = doc.palette.indexOf(de);
            if (i >= 0) doc.palette[i] = vers;
            Doc.replaceColor(doc, de, vers);
          });
        } else if (a.action === 'retirer') {
          const c = normalizeHex(a.couleur);
          const i = doc.palette.indexOf(c);
          if (i < 0) throw new Error(`${a.couleur} n'est pas dans la palette.`);
          Doc.change(doc, 'Retirer une couleur', () => doc.palette.splice(i, 1));
        } else if (a.action === 'couleur_principale') {
          const c = normalizeHex(a.couleur);
          if (!c) throw new Error('couleur : #rrggbb.');
          App.setColor('primary', c);
        } else throw new Error(`Action inconnue : ${a.action}`);
        App.refresh();
        return legende(doc);
      },
    },
    calque_carte: {
      icone: 'layers',
      libelle: (a) => `Calque ${a.calque ?? 'choisi'} de la carte : ${a.action}`,
      description: `Les calques de la carte affichée (autant qu'on veut ; le n° 0 est tout en dessous). action : choisir (celui où poser les tuiles ; « passage » pour peindre le passage), afficher, masquer, remplir (avec la tuile tuile, sinon la tuile choisie), vider, ajouter (nom, profondeur ; placé juste au-dessus du calque calque, sinon tout en haut), dupliquer, supprimer, monter, descendre, regler (nom, profondeur, opacite de 0 à 1, fusion, parallaxe_x, parallaxe_y). profondeur : ${Doc.PROFONDEURS.map(([k, l]) => `${k} (${l})`).join(', ')} ; un calque « dessus » passe devant le joueur et ne bloque jamais. fusion : ${Doc.FUSIONS.map(([k, l]) => `${k} (${l})`).join(', ')}. parallaxe : 1 = suit la carte, 0,5 = fond lointain, 0 = fixe à l'écran (appliquée par le moteur).`,
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['choisir', 'afficher', 'masquer', 'remplir', 'vider', 'ajouter', 'dupliquer', 'supprimer', 'monter', 'descendre', 'regler'] }, calque: { type: ['string', 'number'] }, tuile: nombre, nom: { type: 'string' }, profondeur: { type: 'string', enum: Doc.PROFONDEURS.map(([k]) => k) }, opacite: nombre, fusion: { type: 'string', enum: Doc.FUSIONS.map(([k]) => k) }, parallaxe_x: nombre, parallaxe_y: nombre, carte: { type: ['string', 'number'] } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        if (a.action === 'choisir' && String(a.calque).toLowerCase() === 'passage') {
          App.selectLayer(-1);
          return 'Ligne Passage choisie : le crayon peint maintenant le passage.';
        }
        if (a.action === 'ajouter') {
          const at = a.calque === undefined || a.calque === null ? map.layers.length : calqueNumero(doc, a.calque) + 1;
          Doc.change(doc, 'Nouveau calque (Loki)', () => Doc.addLayer(doc, at, { name: a.nom || `Calque ${map.layers.length + 1}`, profondeur: Doc.PROFONDEURS.some(([k]) => k === a.profondeur) ? a.profondeur : 'dessous' }));
          App.selectLayer(at);
          return `Calque ${at} « ${doc.map.layers[at].name} » ajouté.\n${decrireCarte(doc)}`;
        }
        const li = calqueNumero(doc, a.calque);
        const l = map.layers[li];
        if (a.action === 'choisir') App.selectLayer(li);
        else if (a.action === 'afficher' || a.action === 'masquer') { if (l.visible !== (a.action === 'afficher')) App.toggleLayerVisible(li); }
        else if (a.action === 'remplir' || a.action === 'vider') {
          const t = a.action === 'vider' ? -1 : tuileNumero(doc, a.tuile);
          Doc.change(doc, a.action === 'vider' ? 'Vider le calque' : 'Remplir le calque', () => Doc.layerForEdit(doc, li).cells.fill(t));
        } else if (a.action === 'dupliquer') {
          Doc.change(doc, 'Dupliquer le calque (Loki)', () => Doc.addLayer(doc, li + 1, { ...l, name: a.nom || `${l.name} (copie)`, cells: l.cells.slice(), parallaxe: { ...l.parallaxe } }));
          App.selectLayer(li + 1);
        } else if (a.action === 'supprimer') {
          if (map.layers.length < 2) throw new Error('C\'est le dernier calque de la carte.');
          Doc.change(doc, 'Supprimer le calque (Loki)', () => Doc.removeLayer(doc, li));
          App.selectLayer(clamp(li - 1, 0, doc.map.layers.length - 1));
        } else if (a.action === 'monter' || a.action === 'descendre') {
          const to = li + (a.action === 'monter' ? 1 : -1);
          if (to < 0 || to >= map.layers.length) throw new Error(`Le calque est déjà tout ${a.action === 'monter' ? 'en haut' : 'en bas'}.`);
          Doc.change(doc, 'Déplacer le calque (Loki)', () => Doc.moveLayer(doc, li, to));
          App.selectLayer(to);
        } else if (a.action === 'regler') {
          const props = {};
          if (a.nom) props.name = String(a.nom);
          if (a.profondeur) {
            if (!Doc.PROFONDEURS.some(([k]) => k === a.profondeur)) throw new Error(`profondeur : ${Doc.PROFONDEURS.map(([k]) => k).join(', ')}.`);
            props.profondeur = a.profondeur;
          }
          if (a.opacite !== undefined) props.opacite = clamp(Number(a.opacite) > 1 ? Number(a.opacite) / 100 : Number(a.opacite), 0, 1);
          if (a.fusion) {
            if (!Doc.FUSIONS.some(([k]) => k === a.fusion)) throw new Error(`fusion : ${Doc.FUSIONS.map(([k]) => k).join(', ')}.`);
            props.fusion = a.fusion;
          }
          if (a.parallaxe_x !== undefined || a.parallaxe_y !== undefined) props.parallaxe = { x: Number(a.parallaxe_x ?? l.parallaxe.x), y: Number(a.parallaxe_y ?? l.parallaxe.y) };
          Doc.change(doc, 'Réglages du calque (Loki)', () => Doc.setLayer(doc, li, props));
        } else throw new Error(`Action inconnue : ${a.action}`);
        App.refresh();
        return decrireCarte(doc);
      },
    },
    cartes: {
      icone: 'map',
      libelle: (a) => `Cartes : ${a.action}${a.nom ? ` « ${a.nom} »` : ''}`,
      description: 'Les cartes du jeu (une ville, une route, une maison… ; elles partagent les tuiles). carte : id, nom ou numéro (sinon la carte affichée). action : choisir (l\'afficher), nouvelle (nom, largeur, hauteur, et facultatifs groupe, interieur : elle devient la carte affichée), dupliquer (nom), renommer (nom ; l\'id et le fichier ne changent pas), supprimer (les téléporteurs qui y mènent sont retirés), deplacer (position dans la liste), grouper (groupe : le nom du groupe dans la liste des cartes, "" = sans groupe ; la carte rejoint les autres cartes du groupe), interieur (interieur : true pour une maison, une grotte… qui ne va pas sur la carte monde, false pour une ville ou une route).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['choisir', 'nouvelle', 'dupliquer', 'renommer', 'supprimer', 'deplacer', 'grouper', 'interieur'] }, carte: { type: ['string', 'number'] }, nom: { type: 'string' }, largeur: nombre, hauteur: nombre, position: nombre, groupe: { type: 'string' }, interieur: { type: 'boolean' } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        if (a.action === 'nouvelle' || a.action === 'dupliquer') {
          const name = String(a.nom || (a.action === 'dupliquer' ? `${map.name} (copie)` : `Carte ${doc.maps.length + 1}`));
          Doc.change(doc, a.action === 'nouvelle' ? 'Nouvelle carte (Loki)' : 'Dupliquer la carte (Loki)', () => Doc.addMap(doc, a.action === 'dupliquer' ? { name, copyOf: map } : { name, width: clamp(Math.round(a.largeur || map.width), 1, 256), height: clamp(Math.round(a.hauteur || map.height), 1, 256), groupe: a.groupe === undefined ? map.groupe : String(a.groupe).trim().slice(0, 60), interieur: a.interieur === true }));
          Stage.reset();
        } else if (a.action === 'renommer') {
          if (!a.nom) throw new Error('nom : le nouveau nom de la carte.');
          Doc.change(doc, 'Renommer la carte (Loki)', () => { doc.maps[doc.mapIndex] = { ...map, name: String(a.nom) }; Doc.selectMap(doc, doc.mapIndex); });
        } else if (a.action === 'supprimer') {
          if (doc.maps.length < 2) throw new Error('C\'est la seule carte du jeu.');
          Doc.change(doc, 'Supprimer la carte (Loki)', () => Doc.removeMap(doc, doc.mapIndex));
          Stage.reset();
        } else if (a.action === 'deplacer') {
          const to = Math.round(a.position);
          if (!(to >= 0 && to < doc.maps.length)) throw new Error(`position : de 0 à ${doc.maps.length - 1}.`);
          Doc.change(doc, 'Déplacer la carte (Loki)', () => Doc.moveMap(doc, doc.mapIndex, to));
        } else if (a.action === 'grouper') {
          if (a.groupe === undefined) throw new Error('groupe : le nom du groupe ("" = sans groupe).');
          const groupe = String(a.groupe).trim().slice(0, 60);
          const i = doc.maps.indexOf(map);
          const last = doc.maps.reduce((k, o, j) => (o.groupe === groupe && groupe && j !== i ? j : k), -1);
          App.placeMap(i, last >= 0 ? last + 1 : i, groupe);
        } else if (a.action === 'interieur') {
          if (typeof a.interieur !== 'boolean') throw new Error('interieur : true (maison, grotte…) ou false (ville, route).');
          const i = doc.maps.indexOf(map);
          if (Boolean(map.interieur) !== a.interieur) Doc.change(doc, a.interieur ? 'Carte intérieure (Loki)' : 'Carte extérieure (Loki)', () => { doc.maps[i] = { ...map, interieur: a.interieur }; Doc.selectMap(doc, doc.mapIndex); });
        } else if (a.action !== 'choisir') throw new Error(`Action inconnue : ${a.action}`);
        App.refresh();
        return `Cartes : ${listeCartes(doc)}.\n${decrireCarte(doc)}`;
      },
    },
    carte_monde: {
      icone: 'globe',
      libelle: (a) => (a.action === 'voir' ? 'Regarde la carte monde' : a.action === 'replacer' ? 'Replace les cartes sur la carte monde' : `Place ${a.carte} sur la carte monde`),
      description: 'La carte monde (Tafl 0.11) : les cartes extérieures (villes, routes ; pas les intérieurs) posées ensemble, en cases. action : voir (une image de toute la carte monde et la place de chaque carte), placer (carte, x, y : la case du coin haut gauche de la carte sur la carte monde), replacer (efface les places et les recalcule à partir des téléporteurs entre cartes ; carte : seulement celle-là). Les cartes sans place sont posées toutes seules d\'après les téléporteurs. Ragna voit et ajuste tout dans Carte › Carte monde (Ctrl+Maj+M).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['voir', 'placer', 'replacer'] }, carte: { type: ['string', 'number'] }, x: nombre, y: nombre }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        if (a.action === 'placer') {
          const map = choisirCarte(doc, a.carte);
          if (map.interieur) throw new Error(`${map.id} est un intérieur : passe-la d'abord en extérieur (action cartes, interieur false).`);
          if (!Number.isFinite(Number(a.x)) || !Number.isFinite(Number(a.y))) throw new Error('x, y : la place de la carte en cases.');
          const i = doc.maps.indexOf(map);
          Doc.change(doc, 'Placer la carte sur la carte monde (Loki)', () => { doc.maps[i] = { ...map, monde: { x: Math.round(a.x), y: Math.round(a.y) } }; Doc.selectMap(doc, doc.mapIndex); });
        } else if (a.action === 'replacer') {
          const seule = a.carte !== undefined ? choisirCarte(doc, a.carte) : null;
          Doc.change(doc, 'Replacer les cartes sur la carte monde (Loki)', () => {
            doc.maps = doc.maps.map((m) => (!seule || m === seule ? { ...m, monde: null } : m));
            const pos = Monde.positions(doc);
            doc.maps = doc.maps.map((m) => (pos.has(m.id) && !m.monde ? { ...m, monde: pos.get(m.id) } : m));
            Doc.selectMap(doc, doc.mapIndex);
          });
        } else if (a.action !== 'voir') throw new Error(`Action inconnue : ${a.action}`);
        App.refresh();
        const pos = Monde.positions(doc);
        const texte = `Carte monde : ${doc.maps.filter((m) => pos.has(m.id)).map((m) => `${m.id} à (${pos.get(m.id).x}, ${pos.get(m.id).y}) ${m.width} × ${m.height}${m.monde ? '' : ' (place calculée)'}`).join(' ; ') || 'aucune carte extérieure'}. Intérieurs : ${doc.maps.filter((m) => m.interieur).map((m) => m.id).join(', ') || 'aucun'}.`;
        const d = a.action === 'voir' ? Monde.dessin(doc, pos) : null;
        if (!d) return texte;
        // Une grande région est réduite (au plus 1600 px de côté) pour rester lisible.
        let image = agrandir(d.canvas, 1024);
        const k = 1600 / Math.max(image.width, image.height);
        if (k < 1) {
          const petit = el('canvas', { width: Math.round(image.width * k), height: Math.round(image.height * k) });
          petit.getContext('2d').drawImage(image, 0, 0, petit.width, petit.height);
          image = petit;
        }
        return { texte: `${texte} L'image commence à la case (${d.x0}, ${d.y0}), ${doc.tileSize} px par case${k < 1 ? ` (réduite à ${Math.round(k * 100)} %)` : ''}.`, image };
      },
    },
    peindre_passage: {
      icone: 'shield',
      libelle: (a) => `Passage « ${a.valeur} » sur ${a.largeur || 1} × ${a.hauteur || 1} case(s)`,
      description: 'Peint le passage (où le joueur peut marcher) sur un rectangle de cases de la carte (carte : sinon celle affichée). valeur : auto (la case suit ses tuiles), libre, bloque, rebord_bas, rebord_haut, rebord_gauche, rebord_droite (le joueur saute le rebord dans ce sens sans pouvoir remonter). Le passage peint l\'emporte sur celui des tuiles (voir passage_tuile).',
      schema: { type: 'object', properties: { valeur: { type: 'string', enum: Object.keys(Doc.PASSAGE) }, x: nombre, y: nombre, largeur: nombre, hauteur: nombre, carte: { type: ['string', 'number'] } }, required: ['valeur', 'x', 'y'] },
      faire: (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        const code = Doc.PASSAGE[a.valeur];
        if (code === undefined) throw new Error(`valeur : ${Object.keys(Doc.PASSAGE).join(', ')}.`);
        const x0 = clamp(Math.round(a.x), 0, map.width - 1), y0 = clamp(Math.round(a.y), 0, map.height - 1);
        const x1 = clamp(x0 + Math.round(a.largeur || 1), 1, map.width), y1 = clamp(y0 + Math.round(a.hauteur || 1), 1, map.height);
        Doc.change(doc, 'Peindre le passage (Loki)', () => {
          const p = Doc.passageForEdit(doc);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) p[y * map.width + x] = code;
        });
        if (!App.options.showPassage) App.toggleOption('showPassage');
        return `${(x1 - x0) * (y1 - y0)} case(s) : passage ${a.valeur}.`;
      },
    },
    passage_tuile: {
      icone: 'shield',
      libelle: (a) => `Tuile ${a.index ?? 'choisie'} : passage ${a.valeur}`,
      description: 'Le passage par défaut d\'une tuile (index, sinon la tuile choisie), partout où elle est posée : auto (ne décide rien), libre, bloque (arbre, mur, eau…). Une case prend la décision de sa tuile la plus haute qui n\'est pas « auto », en ignorant les calques au-dessus du joueur.',
      schema: { type: 'object', properties: { index: nombre, valeur: { type: 'string', enum: ['auto', 'libre', 'bloque'] } }, required: ['valeur'] },
      faire: (a) => {
        const doc = besoinJeu();
        const i = tuileNumero(doc, a.index);
        if (!['auto', 'libre', 'bloque'].includes(a.valeur)) throw new Error('valeur : auto, libre ou bloque.');
        App.setTilePassage(a.valeur, i);
        return `Tuile ${i} « ${doc.tiles[i].name} » : passage ${a.valeur}.`;
      },
    },
    zone: {
      icone: 'symbol-namespace',
      libelle: (a) => `Zone : ${a.action}${a.nom ? ` « ${a.nom} »` : a.id ? ` ${a.id}` : ''}`,
      description: `Les zones d'une carte (carte : sinon celle affichée) : des rectangles de cases. action : ajouter (nom, type, x, y, largeur, hauteur, objet_requis, taux, rencontres), modifier (id + les champs à changer), supprimer (id). rencontres : les créatures sauvages qui surgissent [{ creature (id), niveau_min, niveau_max, chance (%) }], ou pour le pack JRPG les groupes de monstres [{ groupe (id), chance }] ; taux : % de chance de rencontre à chaque pas (10 par défaut). type : ${Doc.ZONES.map(([k, l]) => `${k} (${l})`).join(', ')}. objet_requis : l'objet qu'il faut pour y entrer (par exemple « planche-de-surf » pour l'eau, à la place des CS).`,
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['ajouter', 'modifier', 'supprimer'] }, id: { type: 'string' }, nom: { type: 'string' }, type: { type: 'string', enum: Doc.ZONES.map(([k]) => k) }, x: nombre, y: nombre, largeur: nombre, hauteur: nombre, objet_requis: { type: 'string' }, taux: nombre, rencontres: { type: 'array', items: { type: 'object' } }, carte: { type: ['string', 'number'] } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        const z0 = a.id ? map.zones.find((z) => z.id === a.id) : null;
        if (a.action !== 'ajouter' && !z0) throw new Error(`Pas de zone « ${a.id} » sur ${map.id} : ${map.zones.map((z) => z.id).join(', ') || 'aucune zone'}.`);
        if (a.action === 'supprimer') {
          Doc.change(doc, 'Supprimer la zone (Loki)', () => { map.zones = map.zones.filter((z) => z !== z0); });
          return decrireCarte(doc);
        }
        const base = z0 || { id: (() => { let n = map.zones.length + 1; while (map.zones.some((z) => z.id === `zone-${n}`)) n++; return `zone-${n}`; })(), name: '', type: 'herbes', objet: '', x: 0, y: 0, w: 1, h: 1 };
        const x = clamp(Math.round(a.x ?? base.x), 0, map.width - 1), y = clamp(Math.round(a.y ?? base.y), 0, map.height - 1);
        const type = a.type ?? base.type;
        if (!Doc.ZONES.some(([k]) => k === type)) throw new Error(`type : ${Doc.ZONES.map(([k]) => k).join(', ')}.`);
        const zone = { ...base, name: String(a.nom ?? base.name), type, objet: String(a.objet_requis ?? base.objet ?? ''), x, y, w: clamp(Math.round(a.largeur ?? base.w), 1, map.width - x), h: clamp(Math.round(a.hauteur ?? base.h), 1, map.height - y), taux: clamp(Math.round(a.taux ?? base.taux ?? 10), 0, 100), rencontres: a.rencontres !== undefined ? Donnees.normRencontres(a.rencontres) : base.rencontres || [] };
        const inconnues = zone.rencontres.filter((r) => (r.groupe ? !doc.data.groupes.some((g) => g.id === r.groupe) : doc.data.creatures.length && !doc.data.creatures.some((c) => c.id === r.creature))).map((r) => r.groupe || r.creature);
        if (inconnues.length) throw new Error(`Créatures inconnues : ${inconnues.join(', ')} (cherche avec voir_donnees, sorte creatures, action liste).`);
        Doc.change(doc, z0 ? 'Modifier la zone (Loki)' : 'Nouvelle zone (Loki)', () => { map.zones = z0 ? map.zones.map((z) => (z === z0 ? zone : z)) : [...map.zones, zone]; });
        return decrireCarte(doc);
      },
    },
    teleporteur: {
      icone: 'debug-step-into',
      libelle: (a) => `Téléporteur : ${a.action}${a.vers_carte ? ` vers ${a.vers_carte}` : ''}`,
      description: 'Les téléporteurs d\'une carte (carte : sinon celle affichée) : marcher sur la case (x, y) mène à la case (vers_x, vers_y) de la carte vers_carte, le joueur regardant direction (bas, haut, gauche, droite). action : ajouter (x, y, vers_carte, vers_x, vers_y, direction ; retour: true crée aussi le téléporteur du retour, juste derrière l\'arrivée), modifier (id, ou x et y, + les champs à changer), supprimer (id, ou x et y).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['ajouter', 'modifier', 'supprimer'] }, id: { type: 'string' }, x: nombre, y: nombre, vers_carte: { type: ['string', 'number'] }, vers_x: nombre, vers_y: nombre, direction: { type: 'string', enum: Doc.DIRECTIONS.map(([k]) => k) }, retour: { type: 'boolean' }, carte: { type: ['string', 'number'] } }, required: ['action'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        const w0 = a.id ? map.warps.find((w) => w.id === a.id) : map.warps.find((w) => w.x === Math.round(a.x) && w.y === Math.round(a.y));
        if (a.action !== 'ajouter' && !w0) throw new Error(`Pas de téléporteur ${a.id || `en (${a.x}, ${a.y})`} sur ${map.id}.`);
        if (a.action === 'supprimer') {
          Doc.change(doc, 'Supprimer le téléporteur (Loki)', () => { map.warps = map.warps.filter((w) => w !== w0); });
          return decrireCarte(doc);
        }
        const x = clamp(Math.round(a.x ?? w0?.x ?? 0), 0, map.width - 1), y = clamp(Math.round(a.y ?? w0?.y ?? 0), 0, map.height - 1);
        if (a.action === 'ajouter' && map.warps.some((w) => w.x === x && w.y === y)) throw new Error(`Il y a déjà un téléporteur en (${x}, ${y}) : utilise modifier.`);
        const dest = a.vers_carte === undefined ? Doc.mapById(doc, w0?.carte) : doc.maps[carteNumero(doc, a.vers_carte)];
        if (!dest) throw new Error('vers_carte : la carte d\'arrivée (id, nom ou numéro).');
        // Même fenêtre que l'outil Téléporteur, remplie et validée toute seule.
        const valeurs = { carte: dest.id, tx: Math.round(a.vers_x ?? w0?.tx ?? 0), ty: Math.round(a.vers_y ?? w0?.ty ?? 0), direction: a.direction ?? w0?.direction ?? 'bas' };
        if (!w0) valeurs.retour = Boolean(a.retour);
        if (w0 && (w0.x !== x || w0.y !== y)) Doc.change(doc, 'Déplacer le téléporteur (Loki)', () => { map.warps = map.warps.map((w) => (w === w0 ? { ...w, x, y } : w)); });
        await Dialogs.automatique({ valeurs }, () => App.editWarpAt(x, y));
        App.selectMap(doc.maps.indexOf(map));
        return decrireCarte(doc);
      },
    },
    depart: {
      icone: 'location',
      libelle: (a) => `Départ du joueur en (${a.x}, ${a.y})`,
      description: 'Place le départ du joueur : la case (x, y) de la carte carte (sinon celle affichée), le joueur regardant direction (bas par défaut).',
      schema: { type: 'object', properties: { x: nombre, y: nombre, direction: { type: 'string', enum: Doc.DIRECTIONS.map(([k]) => k) }, carte: { type: ['string', 'number'] } }, required: ['x', 'y'] },
      faire: (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        App.options.direction = a.direction || 'bas';
        App.setStart(clamp(Math.round(a.x), 0, map.width - 1), clamp(Math.round(a.y), 0, map.height - 1), map.id);
        return `Départ : ${map.id} (${doc.depart.x}, ${doc.depart.y}), regard ${doc.depart.direction}.`;
      },
    },
    ouvrir: {
      icone: 'folder-opened',
      libelle: (a) => `Ouvre ${a.chemin}`,
      description: 'Ouvre un jeu du dossier du projet (chemin relatif) : un jeu de tuiles .tafl, ou le jeu.json d\'un dossier de jeu. Une image PNG s\'importe comme une planche (voir importer_planche). Si le jeu ouvert a des modifications non enregistrées, Tafl demande d\'abord à Ragna.',
      schema: { type: 'object', properties: { chemin: { type: 'string' } }, required: ['chemin'] },
      faire: async (a) => {
        const fichier = await window.claude.lireFichier(a.chemin);
        if (/^jeu\.json$/i.test(fichier.name)) {
          await IO.openGame(fichier.path);
          return App.doc?.path === fichier.path ? `Jeu « ${App.doc.name} » ouvert : ${App.doc.maps.length} carte(s), ${App.doc.tiles.length} tuile(s).` : 'Le jeu n\'a pas été ouvert (Ragna a peut-être gardé celui en cours).';
        }
        if (!/\.tafl$/i.test(fichier.name)) throw new Error('Il faut un fichier .tafl ou un jeu.json (pour une image, utilise importer_planche).');
        await IO.openLoaded(fichier);
        return App.doc?.path === fichier.path ? `${fichier.name} ouvert : ${App.doc.tiles.length} tuile(s).` : 'Le jeu n\'a pas été ouvert (Ragna a peut-être gardé celui en cours).';
      },
    },
    // Tafl 0.22 : ComfyUI dessine sur la carte graphique de Ragna ; Claude ne dépense que le texte.
    generer_tuiles: {
      icone: 'sparkle',
      libelle: (a) => `Génère avec ComfyUI « ${String(a.description || '').slice(0, 60)} » (${a.sorte === 'objet' ? 'objet' : 'sol'}, ${a.largeur || (a.sorte === 'objet' ? 2 : 4)} × ${a.hauteur || (a.sorte === 'objet' ? 2 : 4)} tuiles, ${a.style || 'pixel'})`,
      description: 'Génère des tuiles avec ComfyUI, sur la carte graphique de Ragna (aucun jeton d\'image pour toi : préfère-le à dessiner pixel par pixel pour les sols et les objets détaillés), puis les ajoute au jeu ouvert (catégorie « ia-… »). description : de préférence en anglais, courte et concrète (« mossy cobblestone », « small red roof house ») ; style : pixel (par défaut), peint, dessin, realiste ou libre ; sorte : sol (texture qui se répète sans couture) ou objet (détouré, devient aussi un tampon) ; largeur, hauteur : en tuiles, 1 à 16 (sol 4 × 4, objet 2 × 2 par défaut) ; details : fidele (par défaut : l\'image du modèle telle quelle), calme ou tres_calme (moins de bruit, perd les petits détails) ; graine : pour refaire la même image. Un appel prend de quelques secondes à une minute.',
      schema: { type: 'object', properties: { description: { type: 'string' }, style: { type: 'string', enum: ['pixel', 'peint', 'dessin', 'realiste', 'libre'] }, sorte: { type: 'string', enum: ['sol', 'objet'] }, largeur: nombre, hauteur: nombre, details: { type: 'string', enum: ['fidele', 'calme', 'tres_calme'] }, graine: nombre }, required: ['description'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const objet = a.sorte === 'objet';
        const v = { description: String(a.description), style: a.style || 'pixel', sorte: objet ? 'objet' : 'sol', largeur: clamp(Math.round(a.largeur || (objet ? 2 : 4)), 1, 16), hauteur: clamp(Math.round(a.hauteur || (objet ? 2 : 4)), 1, 16), variantes: 1, couleurs: 'jeu', details: a.details || 'fidele', graine: a.graine || 0, modele: '', lora: 'auto' };
        const avant = { tuiles: doc.tiles.length, tampons: doc.stamps.length };
        const debut = Date.now();
        const r = await Comfy.generer(v);
        const { img, infos } = Comfy.traiter(r.images[0], v, doc);
        if (infos.vide) throw new Error('Après le détourage, il ne reste rien de l\'image : essaie une autre description ou une autre graine.');
        await Comfy.ajouter(img, v, { target: 'add' });
        const tuiles = doc.tiles.length - avant.tuiles, tampons = doc.stamps.slice(avant.tampons).map((t) => t.name);
        return `Généré en ${Math.round((Date.now() - debut) / 1000)} s (${r.recette.modele}${r.recette.lora ? ` + ${r.recette.lora}` : ''}, graine ${r.recette.graine}) : ${tuiles} tuile(s) ajoutée(s)${tuiles ? ` (n° ${avant.tuiles} à ${doc.tiles.length - 1})` : ''}${tampons.length ? `, tampon(s) ${tampons.join(', ')}` : ''}.`;
      },
    },
    importer_planche: {
      icone: 'cloud-download',
      libelle: (a) => `Importe la planche ${a.chemin}`,
      description: 'Découpe une image PNG du projet en tuiles (chemin relatif), comme Fichier › Importer une planche. Si un fichier .tuiles.json du même nom est à côté (planche nommée, voir exporter_planche_nommee), les tuiles arrivent nommées, avec leur passage, leurs animations et les tampons : pas besoin de les regarder ni de les nommer. valeurs : les réglages de la fenêtre d\'import (appelle d\'abord avec apercu: true pour les connaître, sans rien changer) : size (taille des tuiles), marge et espacement (px), la zone en tuiles (zx, zy, zw, zh), fond (auto = le damier ou la couleur unie détectés, couleur = la couleur « couleur », aucun), petits, target, skipEmpty, dedupe, tampons (un tampon par objet de plusieurs tuiles), asMap. Si le jeu en cours a des modifications non enregistrées, l\'import vers un nouveau jeu s\'arrête : enregistre-le d\'abord.',
      schema: { type: 'object', properties: { chemin: { type: 'string' }, valeurs: { type: 'object' }, apercu: { type: 'boolean' } }, required: ['chemin'] },
      faire: async (a) => {
        const fichier = await window.claude.lireFichier(a.chemin);
        const { fenetres } = await Dialogs.automatique({ valeurs: a.valeurs || {}, apercu: a.apercu, choix: 'cancel' }, () => IO.importSheet(fichier));
        return `${decrireFenetres(fenetres)}${a.apercu ? '' : `\n\n${App.doc ? `Jeu « ${App.doc.name} » : ${App.doc.tiles.length} tuile(s).` : ''}`}`;
      },
    },
    enregistrer_sous: {
      icone: 'save-as',
      libelle: (a) => `Enregistre le jeu sous ${a.chemin}`,
      description: 'Enregistre le jeu de tuiles dans un fichier .tafl du dossier du projet (chemin relatif), qui devient son fichier.',
      schema: { type: 'object', properties: { chemin: { type: 'string' } }, required: ['chemin'] },
      faire: async (a) => {
        const doc = besoinJeu();
        if (doc.game) throw new Error('C\'est un dossier de jeu : utilise enregistrer_jeu.');
        if (!/\.tafl$/i.test(a.chemin)) throw new Error('Le fichier doit finir par .tafl.');
        const chemin = await window.claude.ecrireFichier(a.chemin, IO.textBytes(IO.serialize(doc)));
        doc.path = chemin;
        doc.name = chemin.split(/[\\/]/).pop().replace(/\.tafl$/i, '');
        doc.dirty = false;
        App.refresh();
        return `Enregistré : ${chemin}.`;
      },
    },
    enregistrer_jeu: {
      icone: 'save-as',
      libelle: (a) => `Enregistre le jeu dans ${a.dossier || 'le projet'}`,
      description: 'Enregistre le jeu comme dossier de jeu dans un dossier du projet (relatif, "" = la racine du projet) : jeu.json, tuiles.tafl, cartes/<id>.json et FORMAT.md. Un simple jeu de tuiles devient un dossier de jeu. Ensuite, Ctrl+S réenregistre au même endroit.',
      schema: { type: 'object', properties: { dossier: { type: 'string' } } },
      faire: async (a) => {
        const doc = besoinJeu();
        const d = dossierRel(a.dossier);
        const ecrits = [];
        for (const [nom, bytes] of IO.gameFiles(doc)) ecrits.push(await window.claude.ecrireFichier(`${d ? `${d}/` : ''}${nom}`, bytes));
        const jeu = ecrits[ecrits.length - 1];
        await window.tafl.registerGame(jeu);
        const folder = jeu.replace(/[\\/]jeu\.json$/i, '');
        // Tafl l'enregistre une 2e fois lui-même : il retire les cartes supprimées et y copie FORMAT.md.
        const before = doc.game;
        doc.game = { folder, fichiers: before?.folder === folder ? before.fichiers : [] };
        await IO.save(doc);
        return `Jeu enregistré dans ${folder} :\n${ecrits.join('\n')}\nFORMAT.md (la description des fichiers) y est aussi.`;
      },
    },
    exporter_tuiles: {
      icone: 'export',
      libelle: (a) => `Exporte les tuiles séparées dans ${a.dossier || 'le projet'}`,
      description: 'Un PNG par tuile (00-herbe.png… ; une tuile animée donne un fichier par image) dans un dossier du projet (relatif, "" = la racine). echelle : 1 à 8.',
      schema: { type: 'object', properties: { dossier: { type: 'string' }, echelle: nombre } },
      faire: async (a) => {
        const doc = besoinJeu();
        const d = dossierRel(a.dossier);
        const ecrits = [];
        for (const [nom, bytes] of await IO.tileFiles(doc, clamp(Math.round(a.echelle || 1), 1, 8))) ecrits.push(await window.claude.ecrireFichier(`${d ? `${d}/` : ''}${nom}`, bytes));
        return `${ecrits.length} fichier(s) écrit(s) dans ${d || 'la racine du projet'}.`;
      },
    },
    exporter_tiled: {
      icone: 'export',
      libelle: (a) => `Exporte la carte pour Tiled dans ${a.dossier || 'le projet'}`,
      description: 'Exporte une carte (carte : sinon celle affichée) au format de Tiled (lu aussi par Phaser et Godot) dans un dossier du projet : <nom>.tmj, la planche <nom>-tuiles.png et <nom>-carte.png.',
      schema: { type: 'object', properties: { dossier: { type: 'string' }, carte: { type: ['string', 'number'] } } },
      faire: async (a) => {
        const doc = besoinJeu();
        choisirCarte(doc, a.carte);
        const d = dossierRel(a.dossier);
        const ecrits = [];
        for (const [nom, bytes] of await IO.mapFiles(doc)) ecrits.push(await window.claude.ecrireFichier(`${d ? `${d}/` : ''}${nom}`, bytes));
        return `Écrit :\n${ecrits.join('\n')}`;
      },
    },
    retablir: {
      icone: 'redo',
      libelle: () => 'Rétablit la modification annulée',
      description: 'Rétablit la dernière modification annulée (comme Ctrl+Y).',
      faire: () => {
        const doc = besoinJeu();
        if (!doc.redo.length) return 'Rien à rétablir.';
        App.redo();
        return 'Rétabli.';
      },
    },
  }));
  // --- Événements et données du jeu (Tafl 0.7) ---
  // Ce qui porte un sprite : le personnage a.id, ou sa tenue a.tenue (Tafl 0.16). Renvoie { id, nom, sprite,
  // tuile, personnage } ; nom dit « Léa (tenue Hiver) » pour les messages.
  function porteur(doc, a) {
    const p = Events.perso(doc, a.id);
    if (!p) throw new Error(`Pas de personnage « ${a.id} » : ${doc.data.personnages.map((o) => o.id).join(', ') || 'aucun'}.`);
    if (!a.tenue) return { ...p, personnage: p.id };
    const t = (p.tenues || []).find((x) => x.id === a.tenue);
    if (!t) throw new Error(`${p.nom} n'a pas de tenue « ${a.tenue} » (${(p.tenues || []).map((x) => x.id).join(', ') || 'aucune : personnage action tenue'}).`);
    return { id: t.id, nom: `${p.nom} (tenue ${t.nom})`, sprite: t.sprite, tuile: -1, personnage: p.id };
  }
  const CMDS_AIDE = 'Commandes ({ "type": …, champs }) : dire {qui: id d\'un personnage, "@evenement" (le personnage de l\'événement) ou "" (texte seul : panneau, narration), expression (normal, content, triste…), texte ({joueur} = nom du joueur ; une ligne vide = boîte suivante)} ; choix {options: [{texte, commandes: [...]}], 2 à 4} ; si {condition, alors: [...], sinon: [...]} ; commentaire {texte} ; fin {} ; interrupteur {id, valeur: true|false} (un nom nouveau crée l\'interrupteur) ; local {valeur} (l\'interrupteur « déjà fait » propre à l\'événement) ; attendre {ms} ; objet {action: donner|retirer, objet, nombre} ; creature {creature, niveau} (la donner) ; combat_sauvage {creature, niveau} ; combat_dresseur {dresseur} ; teleporter {carte, x, y, direction} ; quete {quete, action: commencer|etape|finir, etape (numéro, à partir de 1)} ; soigner {} ; boutique {boutique} ; ecran_ev {} ; ecran_boites {} (le PC : le joueur range ses créatures dans les boîtes) ; argent {action: donner|retirer, montant} (retirer ne descend pas sous 0) ; badge {badge: id d\'un badge des réglages} (une seule fois ; le compteur badges = nombre de badges différents, il fait monter le niveau maximum) ; personnaliser {nom: true|false, tenue: true|false} (le joueur choisit son nom et/ou la tenue du héros) ; tenue {tenue: id d\'une tenue du héros, "" = sa tenue de base}. Tafl 1.0 (pack Pokémon) : composer_equipe {nombre: 1 à 6, niveau: 1 à 100, titre, garder: true} (le joueur choisit lui-même son équipe parmi toutes les créatures du jeu, et pour chacune ses 4 attaques et son objet tenu ; garder: true = son équipe d\'avant part au PC. Pour les arènes et les duels entre amis en multijoueur). Tafl 0.31 : variable {id: id d\'une variable (action variable), action: regler|ajouter|retirer, valeur (regler : nombre ou texte ; ajouter, retirer : un nombre)} ; script {nom: une commande déclarée par commande() dans un script JS (action scripts), params: {ses réglages}} (le script de l\'événement attend qu\'elle finisse ; saga.fin() l\'arrête aussi). Pack JRPG seulement (reglages.regles = "jrpg") : groupe {action: rejoindre|quitter, personnage, niveau (0 = son niveau de départ)} (un personnage avec une classe rejoint le groupe ou la Réserve ; parti puis revenu, il garde niveau et équipement) ; combat_groupe {groupe: id d\'un groupe de monstres} (perdu : le script s\'arrête) ; dans ce pack, creature, combat_sauvage, combat_dresseur et ecran_ev ne servent pas. Pack JDR seulement (reglages.regles = "jdr", D&D 5e) : test {competence (id de competences, ou d\'une caractéristique : for, dex…), dd 1-40, qui: choix|meilleur|premier|tous|groupe, avantage, desavantage, quoi (titre sur le plateau de dés), variable (reçoit le total), reussi: [...], rate: [...]} ; sauvegarde {carac, dd, qui: tous|premier|choix, degats ("2d6", facultatif), type_degats, moitie (la moitié si réussi), etat (pour ceux qui ratent), quoi, reussi: [...] (tous ont réussi), rate: [...]} ; test_oppose {competence, qui, monstre (id de monstres_jdr) ou contre (bonus d\'un PNJ) et nom_adverse, competence_adverse, reussi: [...], rate: [...]} ; jet {formule: "1d20", "2d6+3"…, quoi, variable} ; repos {sorte: court|long} ; xp {montant, jalon: true = tout le groupe monte d\'un niveau} ; etat {action: ajouter|retirer, etat (id de etats : empoisonne, a_terre…), qui: tous|premier|choix} ; creer_personnage {} ; groupe et combat_groupe comme pour JRPG (groupe = une rencontre de groupes, monstres de monstres_jdr). Ambiance (Saga 0.11) : musique {fichier: "sons/…" (un fichier du dossier sons/ du jeu), "aucune" (silence) ou "" (la musique de la carte)} ; son {fichier: "sons/…"} (un bruitage, le script n\'attend pas) ; heure {action: avancer|regler, heures: 0 à 23} (horloge du jeu seulement). Conditions : interrupteur {id, valeur} ; local {valeur} ; objet {objet, min} ; quete {quete, etat: pas_commencee|en_cours|finie, etape (au moins, 0 = peu importe)} ; compteur {compteur: captures|dresseurs_battus|sauvages_battus|evolutions|especes_vues|especes_prises|quetes_finies|badges|pas|monstres_vaincus, min} ; argent {min} ; badge {badge} ; membre {personnage} (JRPG : il est dans le groupe ou la Réserve) ; JDR : jdr_perception {min} (Perception passive d\'un héros ≥ min : il voit le piège sans jet), jdr_maitrise {competence}, jdr_etat {etat, valeur}, jdr_classe {classe}, jdr_origine {origine}, jdr_niveau {min} (un héros au moins) ; moment {moment: matin|jour|soir|nuit} (selon l\'horloge du jeu, réglages.temps ; sans horloge, toujours « jour »). variable {id, comparaison: ==|!=|>|>=|<|<=, valeur (nombre ou texte)}. Un événement peut avoir lumiere {couleur, rayon (cases), intensite 0-100, scintille} : il éclaire quand il fait sombre.';
  const evenementSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['liste', 'voir', 'ajouter', 'modifier', 'supprimer', 'deplacer'] },
      carte: { type: ['string', 'number'] }, id: { type: 'string' }, x: nombre, y: nombre,
      type: { type: 'string', enum: Events.TYPES.map(([k]) => k) }, nom: { type: 'string' },
      personnage: { type: 'string' }, tuile: nombre,
      direction: { type: 'string', enum: Doc.DIRECTIONS.map(([k]) => k) },
      deplacement: { type: 'string', enum: Events.DEPLACEMENTS.map(([k]) => k) },
      declenchement: { type: 'string', enum: Events.DECLENCHEMENTS.map(([k]) => k) },
      traversable: { type: 'boolean' },
      obstacle: { type: 'object', properties: { sorte: { type: 'string', enum: ['couper', 'briser', 'pousser'] }, objet: { type: 'string' }, message: { type: 'string' }, repousse: { type: 'boolean' } } },
      pages: { type: 'array', items: { type: 'object' } },
      vers_x: nombre, vers_y: nombre,
    },
    required: ['action'],
  };
  const trouverEvenement = (map, a) => {
    const ev = a.id ? map.events.find((e) => e.id === a.id) : map.events.find((e) => e.x === Math.round(a.x) && e.y === Math.round(a.y));
    if (!ev) throw new Error(`Pas d'événement ${a.id || `en (${a.x}, ${a.y})`} sur ${map.id} : ${map.events.map((e) => `${e.id} (${e.x}, ${e.y})`).join(', ') || 'aucun événement'}.`);
    return ev;
  };
  // Les champs simples d'un événement donnés par Claude, vérifiés.
  function champsEvenement(doc, map, ev, a) {
    const out = { ...ev, apparence: { ...ev.apparence } };
    if (a.nom !== undefined) out.nom = String(a.nom);
    if (a.type !== undefined) out.type = a.type;
    if (a.x !== undefined && a.id) out.x = clamp(Math.round(a.x), 0, map.width - 1);
    if (a.y !== undefined && a.id) out.y = clamp(Math.round(a.y), 0, map.height - 1);
    if (a.personnage !== undefined) {
      if (a.personnage && !Events.perso(doc, a.personnage)) throw new Error(`Pas de personnage « ${a.personnage} » : ${doc.data.personnages.map((p) => p.id).join(', ') || 'aucun (crée-le avec l\'action personnage)'}.`);
      out.apparence.personnage = a.personnage;
    }
    if (a.tuile !== undefined) out.apparence.tuile = Math.round(a.tuile) === -1 ? -1 : tuileNumero(doc, a.tuile);
    for (const k of ['direction', 'deplacement', 'declenchement']) if (a[k] !== undefined) out[k] = a[k];
    if (a.traversable !== undefined) out.traversable = Boolean(a.traversable);
    if (a.obstacle !== undefined) out.obstacle = { ...(out.obstacle || {}), ...a.obstacle };
    if (a.pages !== undefined) {
      const { erreurs, pages } = Events.verifierPages(doc, a.pages);
      if (erreurs.length) throw new Error(`Script refusé :\n- ${erreurs.slice(0, 20).join('\n- ')}${erreurs.length > 20 ? `\n(et ${erreurs.length - 20} autres)` : ''}`);
      out.pages = pages;
    }
    return Events.normEvent(out, ev.id, map.width, map.height, doc.tiles.length);
  }
  const voirEvenement = (doc, ev) => `${Events.decrire(doc, ev)}\n\nScript :\n${Events.texte(doc, ev)}\n\nJSON (le format des fichiers, réutilisable dans pages) :\n${JSON.stringify(ev)}`;
  const decrireDonnees = (doc) => {
    const d = doc.data;
    return [
      `Personnages (${d.personnages.length}) :`,
      ...d.personnages.map((p) => `- ${p.id} « ${p.nom} »${p.heros ? ' [héros]' : ''}${p.couleur ? `, couleur ${p.couleur}` : ''}${p.tuile >= 0 ? `, tuile ${p.tuile}` : ''}${p.sprite ? `, sprite ${p.sprite.largeur} × ${p.sprite.hauteur} px, ${p.sprite.images} image(s) par direction` : ', pas de sprite'}, portraits : ${p.portraits.map((x) => x.expression).join(', ') || 'aucun'}${p.tenues?.length ? `, tenues : ${p.tenues.map((t) => `${t.id} « ${t.nom} »${t.sprite ? '' : ' (sans sprite)'}`).join(', ')}` : ''}${p.classe ? `, classe ${p.classe} niveau ${p.niveau}${Object.keys(p.equipement || {}).length ? `, équipement ${Object.entries(p.equipement).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}` : ''}${p.description ? `\n  ${p.description.replace(/\n/g, '\n  ')}` : ''}`),
      '',
      `Quêtes (${d.quetes.length}) :`,
      ...d.quetes.map((q) => `- ${q.id} « ${q.titre} » (${q.secondaire ? 'secondaire' : 'principale'})${q.suivante ? `, suite : ${q.suivante}` : ''}${q.personnages.length ? `, personnages : ${q.personnages.join(', ')}` : ''}${q.description ? `\n  ${q.description.replace(/\n/g, '\n  ')}` : ''}\n${q.etapes.map((e, i) => `  ${i + 1}. ${e.texte}`).join('\n')}`),
      '',
      `Interrupteurs (${d.interrupteurs.length}) :`,
      ...d.interrupteurs.map((s) => `- ${s.id} « ${s.nom} »${s.description ? ` : ${s.description}` : ''}${(() => { const u = Events.utilisations(doc, 'interrupteur', s.id); return u.length ? ` (utilisé par ${u.join(', ')})` : ''; })()}`),
      '',
      `Variables (${d.variables.length}) :`,
      ...d.variables.map((v) => `- ${v.id} « ${v.nom} », départ ${JSON.stringify(v.defaut)}${v.description ? ` : ${v.description}` : ''}`),
    ].join('\n');
  };
  // Les portraits d'un personnage côte à côte (pour que Claude les voie).
  async function planchePortraits(p) {
    const imgs = await Promise.all(p.portraits.map((x) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = x.png; })));
    const side = 160;
    const c = el('canvas', { width: Math.max(1, imgs.length) * (side + 8), height: side + 24 });
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#202028';
    g.fillRect(0, 0, c.width, c.height);
    imgs.forEach((img, k) => {
      if (img) {
        const s = Math.min(side / img.naturalWidth, side / img.naturalHeight);
        g.drawImage(img, k * (side + 8) + (side - img.naturalWidth * s) / 2, (side - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      }
      g.fillStyle = '#ffffff';
      g.font = '13px sans-serif';
      g.fillText(p.portraits[k].expression, k * (side + 8) + 4, side + 17);
    });
    return c;
  }
  const changerDonnees = (doc, label, fn) => Doc.change(doc, label, () => { doc.data = fn(structuredClone(doc.data)); });
  // Tafl 0.8 : lire ou changer une base de données (actions voir_donnees et donnee).
  async function faireDonnee(a) {
    const doc = besoinJeu();
    const sorte = a.sorte;
    if (!Donnees.SORTES.includes(sorte)) throw new Error(`sorte : ${Donnees.SORTES.join(', ')}.`);
    const sansImages = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'string' && v.startsWith('data:image') ? '(image)' : v)));
    if (sorte === 'reglages') {
      if (a.action === 'voir' || a.action === 'liste') return JSON.stringify(doc.data.reglages, null, 1);
      if (a.action !== 'modifier') throw new Error('reglages : voir ou modifier.');
      const r = Donnees.normElement('reglages', { ...doc.data.reglages, ...(a.valeurs || {}) });
      changerDonnees(doc, 'Réglages du jeu (Loki)', (d) => ({ ...d, reglages: r }));
      return JSON.stringify(r, null, 1);
    }
    const liste = doc.data[sorte];
    const kind = { types: 'type', talents: 'talent', attaques: 'attaque', creatures: 'creature', objets: 'objet', dresseurs: 'dresseur', boutiques: 'boutique', classes: 'classe', monstres: 'monstre', groupes: 'groupe' }[sorte];
    if (a.action === 'liste') {
      const q = Doc.slug(a.filtre || '', '');
      const trouves = liste.filter((o) => !q || Doc.slug(`${o.nom} ${o.id} ${o.officiel || ''}`, '').includes(q));
      const debut = clamp(Math.round(a.debut || 0), 0, Math.max(0, trouves.length - 1));
      const page = trouves.slice(debut, debut + 80);
      return `${trouves.length} ${sorte}${q ? ` pour « ${a.filtre} »` : ''}${trouves.length > 80 ? ` (de ${debut} à ${debut + page.length - 1} ; debut: ${debut + 80} pour la suite)` : ''} :\n${page.map((o) => Donnees.resumer(doc, sorte, o)).join('\n') || 'aucun'}`;
    }
    if (a.action === 'ajouter') {
      const v = a.valeurs || {};
      if (!v.nom) throw new Error('valeurs.nom : le nom de l\'élément.');
      const o = Donnees.normElement(sorte, { ...v, officiel: undefined }, liste.length);
      o.id = Events.ident(v.id || v.nom, liste, kind);
      changerDonnees(doc, `Nouveau : ${o.nom} (Loki)`, (d) => ({ ...d, [sorte]: [...d[sorte], o] }));
      return `Ajouté : ${Donnees.resumer(doc, sorte, o)}`;
    }
    const o0 = liste.find((o) => o.id === a.id);
    if (!o0) throw new Error(`Pas de ${kind} « ${a.id} ». Cherche avec action liste et filtre.`);
    if (a.action === 'voir') {
      const texte = `${JSON.stringify(sansImages(o0), null, 1)}\nUtilisé par : ${Donnees.utilisations(doc, kind, o0.id).slice(0, 30).join(', ') || 'rien encore'}.`;
      const images = [o0.sprites?.face, o0.sprites?.dos, o0.icone, o0.image].filter(Boolean);
      return images.length ? { texte, image: await planchePortraits({ portraits: images.map((png, k) => ({ png, expression: o0.image ? 'image' : ['face', 'dos', 'icône'][o0.icone ? 2 : k] })) }) } : texte;
    }
    if (a.action === 'supprimer') {
      const u = Donnees.utilisations(doc, kind, o0.id);
      changerDonnees(doc, `Supprimer ${o0.nom} (Loki)`, (d) => ({ ...d, [sorte]: d[sorte].filter((o) => o.id !== o0.id) }));
      return `${o0.id} supprimé.${u.length ? ` Attention, il était utilisé par : ${u.slice(0, 20).join(', ')}.` : ''}`;
    }
    if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
    const o = Donnees.normElement(sorte, { ...o0, ...(a.valeurs || {}), id: o0.id });
    o.id = o0.id;
    changerDonnees(doc, `Modifier ${o.nom} (Loki)`, (d) => ({ ...d, [sorte]: d[sorte].map((x) => (x.id === o.id ? o : x)) }));
    return `Modifié : ${Donnees.resumer(doc, sorte, o)}`;
  }

  ClaudePanneau.actions(avecPages({
    evenement: {
      icone: 'person',
      libelle: (a) => `Événement : ${a.action}${a.nom ? ` « ${a.nom} »` : a.id ? ` ${a.id}` : ''}`,
      description: `Les événements d'une carte (carte : id, nom ou numéro, sinon celle affichée) : personnages, panneaux, coffres, objets au sol, déclencheurs (case invisible), un par case. action : liste (tous les événements du jeu, ou de carte), voir (id, ou x et y : son script et son JSON), ajouter (type, x, y, nom, personnage, tuile, direction, deplacement, declenchement, traversable, pages ; sans pages, le modèle du type : un coffre a déjà sa page « vide »), modifier (id + les champs à changer ; pages remplace tout le script), supprimer (id), deplacer (id, vers_x, vers_y). type : ${Events.TYPES.map(([k, l]) => `${k} (${l})`).join(', ')}. deplacement : ${Events.DEPLACEMENTS.map(([k]) => k).join(', ')}. declenchement : parler (touche A), toucher (marcher dessus ou contre), auto (à l'arrivée sur la carte). obstacle (type obstacle, à la place des CS, Saga 0.7) : { sorte : couper (arbre qui disparaît), briser (rocher qui disparaît), pousser (rocher qu'on pousse d'une case en marchant contre lui), objet : l'objet du sac qu'il faut (hache, marteau, gants-de-force par défaut), message : ce que Saga dit en le regardant ("" = phrase par défaut), repousse : il revient quand le joueur quitte la carte } ; donne-lui une tuile ; sa page 1 se joue juste après le passage (souvent vide) ; un rocher poussé sur un déclencheur traversable le lance (énigme). pages : [{ conditions: [...], cache: false, commandes: [...] }] ; le moteur joue la DERNIÈRE page dont toutes les conditions sont vraies (page 1 sans condition = d'habitude ; cache: true = l'événement est absent sur cette page). ${CMDS_AIDE}`,
      schema: evenementSchema,
      faire: (a) => {
        const doc = besoinJeu();
        if (a.action === 'liste') {
          const maps = a.carte === undefined ? doc.maps : [doc.maps[carteNumero(doc, a.carte)]];
          return maps.map((m) => `${m.id} « ${m.name} » : ${m.events.length ? `\n${m.events.map((e) => `- ${Events.decrire(doc, e)}`).join('\n')}` : 'aucun événement'}`).join('\n');
        }
        const map = choisirCarte(doc, a.carte);
        if (a.action === 'voir') return voirEvenement(doc, trouverEvenement(map, a));
        if (a.action === 'ajouter') {
          if (a.x === undefined || a.y === undefined) throw new Error('x et y : la case de l\'événement.');
          const x = clamp(Math.round(a.x), 0, map.width - 1), y = clamp(Math.round(a.y), 0, map.height - 1);
          if (Doc.eventAt(map, x, y)) throw new Error(`La case (${x}, ${y}) a déjà un événement (${Doc.eventAt(map, x, y).id}) : modifie-le, ou choisis une autre case.`);
          const base = Events.create(doc, a.type || 'pnj', x, y, Events.nextId('ev', map.events));
          const ev = champsEvenement(doc, map, base, { ...a, x: undefined, y: undefined });
          Doc.change(doc, 'Nouvel événement (Loki)', () => {
            map.events = [...map.events, ev];
            const nouveaux = Events.interrupteursManquants(doc, ev);
            if (nouveaux.length) doc.data = { ...doc.data, interrupteurs: [...doc.data.interrupteurs, ...nouveaux] };
          });
          if (!App.options.showObjects) App.toggleOption('showObjects');
          return `Ajouté :\n${voirEvenement(doc, ev)}`;
        }
        const ev0 = trouverEvenement(map, a);
        if (a.action === 'supprimer') {
          Doc.change(doc, 'Supprimer l\'événement (Loki)', () => { map.events = map.events.filter((e) => e !== ev0); });
          return `${ev0.id} supprimé.\n${decrireCarte(doc)}`;
        }
        if (a.action === 'deplacer') {
          const x = clamp(Math.round(a.vers_x ?? ev0.x), 0, map.width - 1), y = clamp(Math.round(a.vers_y ?? ev0.y), 0, map.height - 1);
          const autre = Doc.eventAt(map, x, y);
          if (autre && autre !== ev0) throw new Error(`La case (${x}, ${y}) a déjà un événement (${autre.id}).`);
          Doc.change(doc, 'Déplacer l\'événement (Loki)', () => { map.events = map.events.map((e) => (e === ev0 ? { ...e, x, y } : e)); });
          return `${ev0.id} est maintenant en (${x}, ${y}).`;
        }
        if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
        const ev = champsEvenement(doc, map, ev0, a);
        const autre = Doc.eventAt(map, ev.x, ev.y);
        if (autre && autre !== ev0) throw new Error(`La case (${ev.x}, ${ev.y}) a déjà un événement (${autre.id}).`);
        Doc.change(doc, 'Modifier l\'événement (Loki)', () => {
          map.events = map.events.map((e) => (e === ev0 ? ev : e));
          const nouveaux = Events.interrupteursManquants(doc, ev);
          if (nouveaux.length) doc.data = { ...doc.data, interrupteurs: [...doc.data.interrupteurs, ...nouveaux] };
        });
        return `Modifié :\n${voirEvenement(doc, ev)}`;
      },
    },
    personnage: {
      icone: 'person',
      libelle: (a) => `Personnage : ${String(a.action || '').replace(/_/g, ' ')}${a.nom ? ` « ${a.nom} »` : a.id ? ` ${a.id}` : ''}`,
      description: 'Les personnages du jeu (Jeu › Données du jeu) : le héros, sa famille, le prof, les rivaux, les habitants récurrents… Les dialogues (commande dire, qui) et l\'apparence des événements s\'y réfèrent par leur id. action : ajouter (nom, id facultatif tiré du nom, description : rôle et personnalité, heros, couleur #rrggbb du nom dans les dialogues, tuile ; pack JRPG : classe (id), niveau de départ, equipement {arme, bouclier, casque, armure, accessoire : ids d\'objets portés}), modifier (id + les champs à changer ; l\'id ne change pas), supprimer (id), portrait (id, expression, chemin : une image PNG du projet ; remplace le portrait de cette expression), retirer_portrait (id, expression), sprite (id, chemin : une planche PNG du projet, 4 rangées face/gauche/droite/dos, images : nombre d\'images par rangée, deviné sinon), retirer_sprite (id), tenue (id du héros, nom de la tenue ; chemin : sa planche PNG, sinon une copie du sprite de base à retoucher ; une tenue du même nom est remplacée), retirer_tenue (id, nom). Les tenues : les autres apparences du héros, que le joueur choisit (commande personnaliser) ou que l\'histoire lui met (commande tenue) ; voir_sprite et dessiner_sprite les touchent avec le champ tenue. Pour voir les portraits : action donnees avec personnage ; pour le sprite : voir_sprite ; pour le dessiner pixel par pixel : dessiner_sprite.',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['ajouter', 'modifier', 'supprimer', 'portrait', 'retirer_portrait', 'sprite', 'retirer_sprite', 'tenue', 'retirer_tenue'] }, images: nombre, id: { type: 'string' }, nom: { type: 'string' }, description: { type: 'string' }, heros: { type: 'boolean' }, couleur: { type: 'string' }, tuile: nombre, expression: { type: 'string' }, chemin: { type: 'string' }, classe: { type: 'string' }, niveau: nombre, equipement: { type: 'object' } }, required: ['action'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const liste = doc.data.personnages;
        if (a.action === 'ajouter') {
          if (!a.nom) throw new Error('nom : le nom du personnage.');
          const id = Events.ident(a.id || a.nom, liste, 'personnage');
          const p = { id, nom: String(a.nom), description: String(a.description || ''), heros: Boolean(a.heros), couleur: normalizeHex(a.couleur) || '', tuile: a.tuile === undefined || Math.round(a.tuile) === -1 ? -1 : tuileNumero(doc, a.tuile), portraits: [], sprite: null, tenues: [], classe: Doc.slug(a.classe, ''), niveau: clamp(Math.round(a.niveau) || 1, 1, 999), equipement: Object.fromEntries(Donnees.PLACES.map(([k]) => [k, Doc.slug(a.equipement?.[k], '')]).filter(([, v]) => v)) };
          changerDonnees(doc, 'Nouveau personnage (Loki)', (d) => ({ ...d, personnages: [...d.personnages.map((o) => (p.heros ? { ...o, heros: false } : o)), p] }));
          return `Personnage ${id} « ${p.nom} » ajouté.`;
        }
        const p0 = liste.find((p) => p.id === a.id);
        if (!p0) throw new Error(`Pas de personnage « ${a.id} » : ${liste.map((p) => p.id).join(', ') || 'aucun'}.`);
        if (a.action === 'supprimer') {
          const u = Events.utilisations(doc, 'personnage', p0.id);
          changerDonnees(doc, 'Supprimer le personnage (Loki)', (d) => ({ ...d, personnages: d.personnages.filter((p) => p.id !== p0.id) }));
          return `${p0.id} supprimé.${u.length ? ` Attention, il était utilisé par : ${u.join(', ')}.` : ''}`;
        }
        if (a.action === 'portrait') {
          if (!a.chemin) throw new Error('chemin : l\'image du portrait, dans le projet.');
          const expression = Doc.slug(a.expression, 'normal');
          const { png, largeur, hauteur } = await Events.imagePortrait(await window.claude.lireFichier(a.chemin));
          changerDonnees(doc, 'Portrait (Loki)', (d) => ({ ...d, personnages: d.personnages.map((p) => (p.id === p0.id ? { ...p, portraits: [...p.portraits.filter((x) => x.expression !== expression), { expression, png }] } : p)) }));
          return `Portrait « ${expression} » de ${p0.nom} : ${largeur} × ${hauteur} px.`;
        }
        if (a.action === 'retirer_portrait') {
          const expression = Doc.slug(a.expression, 'normal');
          if (!p0.portraits.some((x) => x.expression === expression)) throw new Error(`${p0.nom} n'a pas de portrait « ${expression} » (${p0.portraits.map((x) => x.expression).join(', ') || 'aucun'}).`);
          changerDonnees(doc, 'Retirer un portrait (Loki)', (d) => ({ ...d, personnages: d.personnages.map((p) => (p.id === p0.id ? { ...p, portraits: p.portraits.filter((x) => x.expression !== expression) } : p)) }));
          return `Portrait « ${expression} » retiré.`;
        }
        if (a.action === 'sprite') {
          if (!a.chemin) throw new Error('chemin : la planche du sprite (PNG), dans le projet.');
          const f = await window.claude.lireFichier(a.chemin);
          const png = await Events.imagePortrait(f);
          const sprite = await Sprites.depuisPlanche(png.png, a.images ? clamp(Math.round(a.images), 1, 8) : 0);
          changerDonnees(doc, 'Sprite (Loki)', (d) => ({ ...d, personnages: d.personnages.map((p) => (p.id === p0.id ? { ...p, sprite } : p)) }));
          return `Sprite de ${p0.nom} : ${sprite.images} image(s) de ${sprite.largeur} × ${sprite.hauteur} px par direction (face, gauche, droite, dos).`;
        }
        if (a.action === 'retirer_sprite') {
          if (!p0.sprite) throw new Error(`${p0.nom} n'a pas de sprite.`);
          changerDonnees(doc, 'Retirer le sprite (Loki)', (d) => ({ ...d, personnages: d.personnages.map((p) => (p.id === p0.id ? { ...p, sprite: null } : p)) }));
          return `Sprite de ${p0.nom} retiré : sur la carte, il reprend sa tuile.`;
        }
        if (a.action === 'tenue') {
          if (!p0.heros) throw new Error(`${p0.nom} n'est pas le héros : seules les tenues du héros servent dans le jeu.`);
          if (!a.nom) throw new Error('nom : le nom de la tenue (Sportive, Hiver…).');
          let sprite = p0.sprite ? { ...p0.sprite } : null;
          if (a.chemin) sprite = await Sprites.depuisPlanche((await Events.imagePortrait(await window.claude.lireFichier(a.chemin))).png, a.images ? clamp(Math.round(a.images), 1, 8) : 0);
          const id = Doc.slug(a.nom, 'tenue');
          const tenue = { id, nom: String(a.nom), sprite };
          const autres = (p0.tenues || []).filter((t) => t.id !== id);
          changerDonnees(doc, 'Tenue du héros (Loki)', (d) => ({ ...d, personnages: d.personnages.map((p) => (p.id === p0.id ? { ...p, tenues: [...autres, tenue] } : p)) }));
          return `Tenue ${id} « ${tenue.nom} » de ${p0.nom} : ${sprite ? `${sprite.images} image(s) de ${sprite.largeur} × ${sprite.hauteur} px par direction${a.chemin ? '' : ' (copie du sprite de base : retouche-la avec dessiner_sprite et tenue)'}` : 'pas encore de sprite (dessiner_sprite avec tenue)'}.`;
        }
        if (a.action === 'retirer_tenue') {
          const id = Doc.slug(a.nom, '');
          if (!(p0.tenues || []).some((t) => t.id === id)) throw new Error(`${p0.nom} n'a pas de tenue « ${a.nom} » (${(p0.tenues || []).map((t) => t.id).join(', ') || 'aucune'}).`);
          changerDonnees(doc, 'Retirer une tenue (Loki)', (d) => ({ ...d, personnages: d.personnages.map((p) => (p.id === p0.id ? { ...p, tenues: p.tenues.filter((t) => t.id !== id) } : p)) }));
          return `Tenue ${id} retirée.`;
        }
        if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
        const p = { ...p0 };
        if (a.nom !== undefined) p.nom = String(a.nom);
        if (a.description !== undefined) p.description = String(a.description);
        if (a.heros !== undefined) p.heros = Boolean(a.heros);
        if (a.couleur !== undefined) p.couleur = normalizeHex(a.couleur) || '';
        if (a.tuile !== undefined) p.tuile = Math.round(a.tuile) === -1 ? -1 : tuileNumero(doc, a.tuile);
        if (a.classe !== undefined) p.classe = Doc.slug(a.classe, '');
        if (a.niveau !== undefined) p.niveau = clamp(Math.round(a.niveau) || 1, 1, 999);
        if (a.equipement !== undefined) p.equipement = Object.fromEntries(Donnees.PLACES.map(([k]) => [k, Doc.slug(a.equipement?.[k], '')]).filter(([, v]) => v));
        changerDonnees(doc, 'Modifier le personnage (Loki)', (d) => ({ ...d, personnages: d.personnages.map((o) => (o.id === p.id ? p : p.heros ? { ...o, heros: false } : o)) }));
        return `Personnage ${p.id} modifié.`;
      },
    },
    // --- Tafl 0.12 : les sprites des personnages (voir sprites.js) ---
    voir_sprite: {
      lecture: true,
      icone: 'person',
      libelle: (a) => `Regarde le sprite de ${a.id}`,
      description: 'Le sprite d\'un personnage sur la carte : sa taille, et les pixels de chaque image (face, gauche, droite, dos ; image 0 = debout, puis les pas), avec la planche agrandie. direction : une seule direction (bas, gauche, droite, haut), sinon toutes. tenue : l\'id d\'une tenue du héros, pour voir celle-ci.',
      schema: { type: 'object', properties: { id: { type: 'string' }, direction: { type: 'string', enum: Sprites.DIRECTIONS }, tenue: { type: 'string' } }, required: ['id'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const p = porteur(doc, a);
        if (!p.sprite) return `${p.nom} n'a pas encore de sprite${p.tuile >= 0 ? ` (sur la carte : la tuile ${p.tuile})` : ''}. Dessine-le avec dessiner_sprite (une image à la fois), ou importe une planche avec personnage action sprite.`;
        const { largeur, hauteur, images } = p.sprite;
        const frames = await Sprites.decouper(p.sprite);
        const dirs = a.direction ? [a.direction] : Sprites.DIRECTIONS;
        const texte = [`Sprite de ${p.nom} : ${images} image(s) de ${largeur} × ${hauteur} px par direction (image 0 = debout, puis les pas).`, legende(doc)];
        for (const d of dirs) {
          const r = Sprites.DIRECTIONS.indexOf(d);
          frames[r].forEach((c, k) => texte.push('', `${d} (${Sprites.NOMS[d]}), image ${k}${k === 0 ? ' (debout)' : ` (pas ${k})`} :`, ...versTexte(doc, c.getContext('2d').getImageData(0, 0, largeur, hauteur).data, largeur, hauteur)));
        }
        const planche = el('canvas', { width: largeur * images, height: hauteur * 4 });
        planche.getContext('2d').drawImage(await Sprites.charger(p.sprite.planche), 0, 0);
        return { texte: texte.join('\n'), image: agrandir(planche) };
      },
    },
    dessiner_sprite: {
      icone: 'edit',
      libelle: (a) => `Dessine le sprite de ${a.id} : ${Sprites.NOMS[a.direction] || a.direction}, image ${a.image ?? 0}${a.miroir ? ' (et son miroir)' : ''}`,
      description: 'Dessine une image du sprite d\'un personnage (comment il apparaît sur la carte), pixel par pixel comme dessiner_tuile. tenue : l\'id d\'une tenue du héros, pour dessiner celle-ci (sinon son sprite de base). direction : bas (face), gauche, droite ou haut (dos). image : 0 = debout, 1 et 2 = les pas (pied gauche, pied droit). pixels : une ligne par rangée de pixels (« . » = transparent, sinon un code de la palette) ; la première image dessinée fixe la taille de toutes (souvent largeur de la tuile × 2 fois sa hauteur, les pieds en bas). images : nombre d\'images par direction, à la création du sprite (3 par défaut). miroir : true pour gauche ou droite, dessine aussi l\'autre côté en miroir. couleurs_en_plus : { "caractère": "#rrggbb" }.',
      schema: { type: 'object', properties: { id: { type: 'string' }, tenue: { type: 'string' }, direction: { type: 'string', enum: Sprites.DIRECTIONS }, image: nombre, pixels: lignesSchema, images: nombre, miroir: { type: 'boolean' }, couleurs_en_plus: { type: 'object' } }, required: ['id', 'direction', 'pixels'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const p0 = porteur(doc, a);
        const r = Sprites.DIRECTIONS.indexOf(a.direction);
        if (r < 0) throw new Error(`direction : ${Sprites.DIRECTIONS.join(', ')}.`);
        const lignes = Array.isArray(a.pixels) ? a.pixels.map(String) : [];
        const h = lignes.length, w = lignes[0]?.length || 0;
        if (!w || !h) throw new Error('pixels : au moins une ligne.');
        const sprite = p0.sprite || Sprites.vide(w, h, clamp(Math.round(a.images || 3), 1, 8));
        if (sprite.largeur !== w || sprite.hauteur !== h) throw new Error(`Le sprite de ${p0.nom} fait ${sprite.largeur} × ${sprite.hauteur} px par image : il faut ${sprite.hauteur} lignes de ${sprite.largeur} caractères.`);
        const k = Math.round(a.image || 0);
        if (k < 0 || k >= sprite.images) throw new Error(`image : de 0 à ${sprite.images - 1} (le sprite a ${sprite.images} image(s) par direction).`);
        const enPlus = Object.fromEntries(Object.entries(a.couleurs_en_plus || {}).map(([c, v]) => [c, normalizeHex(v)]).filter(([c, v]) => c.length === 1 && v));
        const data = depuisTexte(doc, lignes, enPlus, w, h, 'une image du sprite');
        const frames = await Sprites.decouper(sprite);
        const c = el('canvas', { width: w, height: h });
        c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
        frames[r][k] = c;
        const autre = { gauche: 'droite', droite: 'gauche' }[a.direction];
        if (a.miroir && autre) frames[Sprites.DIRECTIONS.indexOf(autre)][k] = Sprites.miroir(c);
        const nouveau = { ...sprite, planche: Sprites.assembler(frames, w, h) };
        Doc.change(doc, 'Dessiner le sprite (Loki)', () => {
          for (const hex of Object.values(enPlus)) if (!doc.palette.includes(hex)) doc.palette.push(hex);
          doc.data = { ...doc.data, personnages: doc.data.personnages.map((p) => (p.id !== p0.personnage ? p : a.tenue ? { ...p, tenues: p.tenues.map((t) => (t.id === p0.id ? { ...t, sprite: nouveau } : t)) } : { ...p, sprite: nouveau })) };
        });
        Stage.render();
        const planche = el('canvas', { width: w * sprite.images, height: h * 4 });
        planche.getContext('2d').drawImage(await Sprites.charger(nouveau.planche), 0, 0);
        return { texte: `Sprite de ${p0.nom} : ${a.direction}, image ${k}${a.miroir && autre ? ` (et ${autre} en miroir)` : ''} dessinée. La planche (rangées : face, gauche, droite, dos) :`, image: agrandir(planche) };
      },
    },
    quete: {
      icone: 'book',
      libelle: (a) => `Quête : ${a.action}${a.titre ? ` « ${a.titre} »` : a.id ? ` ${a.id}` : ''}`,
      description: 'Les quêtes du jeu (histoire principale et quêtes secondaires, avec leurs étapes). Les scripts les font avancer (commande quete) et testent leur état (condition quete). action : ajouter (titre, id facultatif tiré du titre, description, secondaire, suivante : l\'id de la quête qui suit, pour le fil rouge, personnages : ids des personnages qu\'on y croise, etapes : liste de textes dans l\'ordre), modifier (id + les champs à changer ; etapes remplace toutes les étapes), supprimer (id).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['ajouter', 'modifier', 'supprimer'] }, id: { type: 'string' }, titre: { type: 'string' }, description: { type: 'string' }, secondaire: { type: 'boolean' }, suivante: { type: 'string' }, personnages: { type: 'array', items: { type: 'string' } }, etapes: { type: 'array', items: { type: 'string' } } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const liste = doc.data.quetes;
        const verifier = (q) => {
          if (q.suivante && !liste.some((o) => o.id === q.suivante) && q.suivante !== q.id) throw new Error(`suivante : pas de quête « ${q.suivante} » (${liste.map((o) => o.id).join(', ') || 'aucune'}).`);
          const inconnus = q.personnages.filter((id) => !Events.perso(doc, id));
          if (inconnus.length) throw new Error(`personnages inconnus : ${inconnus.join(', ')} (${doc.data.personnages.map((p) => p.id).join(', ') || 'aucun'}).`);
          return q;
        };
        if (a.action === 'ajouter') {
          if (!a.titre) throw new Error('titre : le titre de la quête.');
          const q = verifier({ id: Events.ident(a.id || a.titre, liste, 'quete'), titre: String(a.titre), description: String(a.description || ''), secondaire: Boolean(a.secondaire), suivante: String(a.suivante || ''), personnages: (a.personnages || []).map(String), etapes: (a.etapes || []).map((t) => ({ texte: String(t) })) });
          changerDonnees(doc, 'Nouvelle quête (Loki)', (d) => ({ ...d, quetes: [...d.quetes, q] }));
          return `Quête ${q.id} « ${q.titre} » ajoutée (${q.etapes.length} étape(s)).`;
        }
        const q0 = liste.find((q) => q.id === a.id);
        if (!q0) throw new Error(`Pas de quête « ${a.id} » : ${liste.map((q) => q.id).join(', ') || 'aucune'}.`);
        if (a.action === 'supprimer') {
          const u = Events.utilisations(doc, 'quete', q0.id);
          changerDonnees(doc, 'Supprimer la quête (Loki)', (d) => ({ ...d, quetes: d.quetes.filter((q) => q.id !== q0.id) }));
          return `${q0.id} supprimée.${u.length ? ` Attention, elle était utilisée par : ${u.join(', ')}.` : ''}`;
        }
        if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
        const q = { ...q0 };
        for (const k of ['titre', 'description', 'suivante']) if (a[k] !== undefined) q[k] = String(a[k]);
        if (a.secondaire !== undefined) q.secondaire = Boolean(a.secondaire);
        if (a.personnages !== undefined) q.personnages = a.personnages.map(String);
        if (a.etapes !== undefined) q.etapes = a.etapes.map((t) => ({ texte: String(t) }));
        verifier(q);
        changerDonnees(doc, 'Modifier la quête (Loki)', (d) => ({ ...d, quetes: d.quetes.map((o) => (o.id === q.id ? q : o)) }));
        return `Quête ${q.id} modifiée.`;
      },
    },
    interrupteur: {
      icone: 'symbol-boolean',
      libelle: (a) => `Interrupteur : ${a.action}${a.nom ? ` « ${a.nom} »` : a.id ? ` ${a.id}` : ''}`,
      description: 'Les interrupteurs du jeu : chacun retient un fait de l\'histoire (« rival battu au labo »), éteint au début d\'une partie. Les scripts les allument (commande interrupteur) et les pages les testent (condition interrupteur). action : ajouter (nom, id facultatif tiré du nom, description), modifier (id + nom, description ; l\'id ne change pas), supprimer (id).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['ajouter', 'modifier', 'supprimer'] }, id: { type: 'string' }, nom: { type: 'string' }, description: { type: 'string' } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const liste = doc.data.interrupteurs;
        if (a.action === 'ajouter') {
          if (!a.nom) throw new Error('nom : ce que retient l\'interrupteur.');
          const s0 = { id: Events.ident(a.id || a.nom, liste, 'interrupteur'), nom: String(a.nom), description: String(a.description || '') };
          changerDonnees(doc, 'Nouvel interrupteur (Loki)', (d) => ({ ...d, interrupteurs: [...d.interrupteurs, s0] }));
          return `Interrupteur ${s0.id} « ${s0.nom} » ajouté.`;
        }
        const s0 = liste.find((s) => s.id === a.id);
        if (!s0) throw new Error(`Pas d'interrupteur « ${a.id} » : ${liste.map((s) => s.id).join(', ') || 'aucun'}.`);
        if (a.action === 'supprimer') {
          const u = Events.utilisations(doc, 'interrupteur', s0.id);
          changerDonnees(doc, 'Supprimer l\'interrupteur (Loki)', (d) => ({ ...d, interrupteurs: d.interrupteurs.filter((s) => s.id !== s0.id) }));
          return `${s0.id} supprimé.${u.length ? ` Attention, il était utilisé par : ${u.join(', ')}.` : ''}`;
        }
        if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
        const s = { ...s0, ...(a.nom !== undefined ? { nom: String(a.nom) } : {}), ...(a.description !== undefined ? { description: String(a.description) } : {}) };
        changerDonnees(doc, 'Modifier l\'interrupteur (Loki)', (d) => ({ ...d, interrupteurs: d.interrupteurs.map((o) => (o.id === s.id ? s : o)) }));
        return `Interrupteur ${s.id} modifié.`;
      },
    },
    // --- Tafl 0.31 : les variables et les scripts JS (scripts-js.js, ../commun/bac-a-sable.js, SCRIPTS.md) ---
    variable: {
      icone: 'symbol-variable',
      libelle: (a) => `Variable : ${a.action}${a.nom ? ` « ${a.nom} »` : a.id ? ` ${a.id}` : ''}`,
      description: 'Les variables du jeu (Données › Variables) : chacune retient un nombre ou un texte pour toute la partie (pièces trouvées, réputation, victoires), avec sa valeur de départ. Les blocs la changent (commande variable), les pages la testent (condition variable), les scripts JS la lisent et l\'écrivent (saga.variable, saga.ajouter). action : ajouter (nom, id facultatif tiré du nom, defaut : nombre ou texte, 0 par défaut, description), modifier (id + les champs à changer ; l\'id ne change pas), supprimer (id).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['ajouter', 'modifier', 'supprimer'] }, id: { type: 'string' }, nom: { type: 'string' }, defaut: { type: ['number', 'string'] }, description: { type: 'string' } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const liste = doc.data.variables;
        if (a.action === 'ajouter') {
          if (!a.nom) throw new Error('nom : ce que retient la variable.');
          const v0 = { id: Events.ident(a.id || a.nom, liste, 'variable'), nom: String(a.nom), description: String(a.description || ''), defaut: Events.valeurVariable(a.defaut ?? 0) };
          changerDonnees(doc, 'Nouvelle variable (Loki)', (d) => ({ ...d, variables: [...d.variables, v0] }));
          return `Variable ${v0.id} « ${v0.nom} » ajoutée (départ : ${JSON.stringify(v0.defaut)}).`;
        }
        const v0 = liste.find((v) => v.id === a.id);
        if (!v0) throw new Error(`Pas de variable « ${a.id} » : ${liste.map((v) => v.id).join(', ') || 'aucune'}.`);
        if (a.action === 'supprimer') {
          const u = Events.utilisations(doc, 'variable', v0.id);
          changerDonnees(doc, 'Supprimer la variable (Loki)', (d) => ({ ...d, variables: d.variables.filter((v) => v.id !== v0.id) }));
          return `${v0.id} supprimée.${u.length ? ` Attention, elle était utilisée par : ${u.join(', ')} (et peut-être des scripts JS).` : ''}`;
        }
        if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
        const v = { ...v0 };
        for (const k of ['nom', 'description']) if (a[k] !== undefined) v[k] = String(a[k]);
        if (a.defaut !== undefined) v.defaut = Events.valeurVariable(a.defaut);
        changerDonnees(doc, 'Modifier la variable (Loki)', (d) => ({ ...d, variables: d.variables.map((o) => (o.id === v.id ? v : o)) }));
        return `Variable ${v.id} modifiée.`;
      },
    },
    scripts: {
      lecture: true,
      icone: 'file-code',
      libelle: (a) => (a.nom ? `Lit le script ${a.nom}.js` : 'Regarde les scripts JS'),
      description: 'Les scripts JS du jeu (scripts/*.js, espace Événements › Scripts). Sans nom : la liste des scripts (actif ou coupé), ce qu\'ils déclarent (commandes avec leurs réglages, formules, réactions quand()), leurs erreurs, et ce que le pack du jeu permet de remplacer (formules et leurs valeurs) ou d\'écouter (moments). nom : le code d\'un script, lignes numérotées. L\'API complète (commande, formule, quand, saga.*, des.*, donnees) est dans le SCRIPTS.md copié dans le dossier du jeu : lis-le (Read) avant d\'écrire ton premier script.',
      schema: { type: 'object', properties: { nom: { type: 'string' } } },
      faire: async (a) => {
        const doc = besoinJeu();
        ScriptsTafl.appliquer();
        const inv = await ScriptsTafl.rafraichir(doc);
        if (a.nom) {
          const s = doc.scripts.find((x) => x.nom === String(a.nom).replace(/\.js$/, ''));
          if (!s) throw new Error(`Pas de script « ${a.nom} » : ${doc.scripts.map((x) => x.nom).join(', ') || 'aucun'}.`);
          const erreurs = inv.erreurs.filter((e) => e.fichier === `scripts/${s.nom}.js`);
          return [`scripts/${s.nom}.js${s.actif === false ? ' (coupé : Saga ne le charge pas)' : ''} :`, ...String(s.code).split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`), ...erreurs.map((e) => `Erreur${e.ligne ? ` ligne ${e.ligne}` : ''} : ${e.message}`)].join('\n');
        }
        const pack = doc.data.reglages?.regles || 'pokemon';
        const formules = BacASable.formulesDuPack(pack);
        const coupees = doc.data.reglages?.scripts?.formules_coupees || [];
        const parFichier = (l, f) => l.filter((x) => x.fichier === f);
        const lignes = doc.scripts.length ? doc.scripts.map((s) => {
          const f = `scripts/${s.nom}.js`;
          const cmds = parFichier(inv.commandes, f).map((c) => `commande ${c.nom} {${Object.entries(c.params || {}).map(([k, p]) => `${k}: ${p.type}${p.defaut !== undefined && p.defaut !== '' ? ` = ${JSON.stringify(p.defaut)}` : ''}`).join(', ')}}`);
          const fos = parFichier(inv.formules, f).map((x) => `formule ${x.nom}${coupees.includes(x.nom) ? ' (coupée dans Réglages)' : ''}`);
          const qs = parFichier(inv.quand, f).map((x) => `quand ${x.moment}`);
          const err = parFichier(inv.erreurs, f).map((e) => `ERREUR${e.ligne ? ` ligne ${e.ligne}` : ''} : ${e.message}`);
          return `- ${s.nom}.js${s.actif === false ? ' [coupé]' : ''} (${String(s.code).split('\n').length} lignes) : ${[...cmds, ...fos, ...qs].join(' ; ') || 'ne déclare rien'}${err.length ? `\n  ${err.join('\n  ')}` : ''}`;
        }) : ['Aucun script pour l\'instant.'];
        return [
          `Scripts (${doc.scripts.length}) :`, ...lignes,
          `Formules du pack ${pack} qu'un script peut remplacer (formule(nom, (v) => nombre)) :`,
          ...Object.entries(formules).map(([k, f]) => `- ${k} : ${f.nom}. Rend : ${f.rend} Valeurs : ${Object.keys(f.valeurs).join(', ')}.`),
          `Moments pour quand() : ${Object.entries(BacASable.MOMENTS).map(([k, m]) => `${k}${Object.keys(m.infos).length ? ` {${Object.keys(m.infos).join(', ')}}` : ''}`).join(', ')}.`,
          `Variables : ${doc.data.variables.map((v) => `${v.id} (départ ${JSON.stringify(v.defaut)})`).join(', ') || 'aucune'}.`,
        ].join('\n');
      },
    },
    script: {
      icone: 'file-code',
      libelle: (a) => `Script ${a.nom || ''}.js : ${a.action}`,
      description: 'Écrire et ranger les scripts JS du jeu (un fichier scripts/<nom>.js chacun). action : ecrire (nom + code : crée le script ou remplace tout son code), renommer (nom + nouveau_nom ; les blocs Script parlent des commandes, pas des fichiers : rien d\'autre à changer), supprimer (nom), activer ou couper (nom : un script coupé n\'est pas chargé par Saga). nom : minuscules, chiffres et tirets. Le code tourne dans un bac à sable (pas de fichiers, de réseau, de page ; arrêté s\'il calcule plus de 0,6 s) : il déclare commande(), formule(), quand() (voir SCRIPTS.md) et n\'agit sur le jeu que par saga.* et des.*. La réponse dit ce que le script déclare et ses erreurs (ligne). Ensuite : essayer_script, puis le bloc Script dans un événement (commande { type: "script", nom, params }).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['ecrire', 'renommer', 'supprimer', 'activer', 'couper'] }, nom: { type: 'string' }, code: { type: 'string' }, nouveau_nom: { type: 'string' } }, required: ['action', 'nom'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const nom = Doc.slug(String(a.nom || '').replace(/\.js$/, ''), '').slice(0, 60);
        if (!nom) throw new Error('nom : le nom du script (minuscules, chiffres, tirets), sans .js.');
        const s0 = doc.scripts.find((x) => x.nom === nom);
        if (a.action === 'ecrire') {
          if (typeof a.code !== 'string' || !a.code.trim()) throw new Error('code : le texte JavaScript du script.');
          if (a.code.length > 200000) throw new Error('code : trop long (200 000 caractères au plus).');
          Doc.change(doc, `${s0 ? 'Modifier' : 'Nouveau'} script ${nom}.js (Loki)`, () => {
            doc.scripts = s0 ? doc.scripts.map((x) => (x.nom === nom ? { ...x, code: a.code } : x)) : [...doc.scripts, { nom, code: a.code, actif: true }];
          });
        } else {
          if (!s0) throw new Error(`Pas de script « ${nom} » : ${doc.scripts.map((x) => x.nom).join(', ') || 'aucun'}.`);
          if (a.action === 'supprimer') {
            Doc.change(doc, `Supprimer le script ${nom}.js (Loki)`, () => { doc.scripts = doc.scripts.filter((x) => x.nom !== nom); });
            return `${nom}.js supprimé (Ctrl+Z le remet).`;
          }
          if (a.action === 'renommer') {
            const neuf = Doc.slug(String(a.nouveau_nom || '').replace(/\.js$/, ''), '').slice(0, 60);
            if (!neuf) throw new Error('nouveau_nom : le nouveau nom.');
            if (doc.scripts.some((x) => x.nom === neuf)) throw new Error(`Il y a déjà un script ${neuf}.js.`);
            Doc.change(doc, `Renommer ${nom}.js en ${neuf}.js (Loki)`, () => { doc.scripts = doc.scripts.map((x) => (x.nom === nom ? { ...x, nom: neuf } : x)); });
            return `${nom}.js s'appelle maintenant ${neuf}.js.`;
          }
          if (a.action !== 'activer' && a.action !== 'couper') throw new Error(`Action inconnue : ${a.action}`);
          Doc.change(doc, `${a.action === 'activer' ? 'Activer' : 'Couper'} le script ${nom}.js (Loki)`, () => { doc.scripts = doc.scripts.map((x) => (x.nom === nom ? { ...x, actif: a.action === 'activer' } : x)); });
        }
        const inv = await ScriptsTafl.rafraichir(doc);
        const f = `scripts/${nom}.js`;
        const s = doc.scripts.find((x) => x.nom === nom);
        if (s.actif === false) return `${nom}.js est coupé : Saga ne le charge pas.`;
        const decl = [
          ...inv.commandes.filter((c) => c.fichier === f).map((c) => `commande ${c.nom} {${Object.keys(c.params || {}).join(', ')}}`),
          ...inv.formules.filter((x) => x.fichier === f).map((x) => `formule ${x.nom}`),
          ...inv.quand.filter((x) => x.fichier === f).map((x) => `quand ${x.moment}`),
        ];
        const err = inv.erreurs.filter((e) => e.fichier === f).map((e) => `ERREUR${e.ligne ? ` ligne ${e.ligne}${e.colonne ? `, colonne ${e.colonne}` : ''}` : ''} : ${e.message}`);
        const avert = ScriptsTafl.problemes(doc).filter((p) => p.script === nom && p.gravite !== 'erreur').map((p) => `À vérifier : ${p.message}`);
        return [`${nom}.js enregistré dans le jeu (Ctrl+Z l'annule). Il déclare : ${decl.join(' ; ') || 'rien'}.`, ...err, ...avert, err.length ? 'Corrige ces erreurs (le script n\'est pas chargé tant qu\'il en a).' : 'Essaie-le avec essayer_script.'].join('\n');
      },
    },
    essayer_script: {
      lecture: true,
      icone: 'play',
      libelle: (a) => `Essaie ${a.sorte} ${a.nom}`,
      description: 'Essaie une commande, une formule ou une réaction des scripts JS, comme le bouton Essayer de Tafl : dans le bac à sable, avec une fausse partie (rien ne change dans le jeu). sorte : commande (nom + params : ses réglages), formule (nom + valeurs : celles à changer dans l\'exemple ; donne aussi normal, le résultat du pack), quand (nom = le moment). reponses : les réponses du joueur aux saga.choisir(), dans l\'ordre (1 = la première ; sans réponse : la première). La réponse raconte ce que le script a fait (dialogues, objets donnés, dés…) et ses erreurs. Les combats sont gagnés.',
      schema: { type: 'object', properties: { sorte: { type: 'string', enum: ['commande', 'formule', 'quand'] }, nom: { type: 'string' }, params: { type: 'object' }, valeurs: { type: 'object' }, reponses: { type: 'array', items: { type: 'integer' } } }, required: ['sorte', 'nom'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const lignes = [];
        const sortie = { ecrire: (niveau, texte) => lignes.push(`${{ erreur: 'ERREUR', demande: '→', ok: '✓' }[niveau] || '·'} ${texte}`), vider: () => { lignes.length = 0; } };
        const inv = await ScriptsTafl.rafraichir(doc);
        if (!inv[{ commande: 'commandes', formule: 'formules', quand: 'quand' }[a.sorte]]?.some((x) => (x.nom || x.moment) === a.nom)) {
          throw new Error(`Aucun script actif ne déclare ${a.sorte}('${a.nom}'). Regarde l'action scripts.`);
        }
        await ScriptsTafl.essayer(doc, { sorte: a.sorte, nom: a.nom, params: a.params || {}, valeurs: a.valeurs, reponses: Array.isArray(a.reponses) ? [...a.reponses] : [] }, sortie);
        return lignes.join('\n').slice(0, 12000) || 'Le script n\'a rien fait.';
      },
    },
    donnees: {
      lecture: true,
      icone: 'database',
      libelle: (a) => (a.personnage ? `Regarde le personnage ${a.personnage}` : 'Regarde les données du jeu'),
      description: 'Décrit les données de l\'histoire : personnages (id, nom, héros, description, expressions des portraits), quêtes (étapes numérotées, suite, personnages), interrupteurs (avec où ils servent) et variables. personnage : un id, pour voir aussi ses portraits. Types, attaques, créatures, objets, dresseurs, boutiques et réglages : action donnee.',
      schema: { type: 'object', properties: { personnage: { type: 'string' } } },
      faire: async (a) => {
        const doc = besoinJeu();
        if (!a.personnage) return decrireDonnees(doc);
        const p = Events.perso(doc, a.personnage);
        if (!p) throw new Error(`Pas de personnage « ${a.personnage} » : ${doc.data.personnages.map((o) => o.id).join(', ') || 'aucun'}.`);
        const texte = `${p.id} « ${p.nom} »${p.heros ? ' [héros]' : ''}\n${p.description || '(pas de description)'}\nPortraits : ${p.portraits.map((x) => x.expression).join(', ') || 'aucun'}.\nSprite : ${p.sprite ? `${p.sprite.largeur} × ${p.sprite.hauteur} px, ${p.sprite.images} image(s) par direction (voir_sprite)` : 'aucun'}.\nUtilisé par : ${Events.utilisations(doc, 'personnage', p.id).join(', ') || 'rien encore'}.`;
        return p.portraits.length ? { texte, image: await planchePortraits(p) } : texte;
      },
    },
    // --- Tafl 0.8 : les bases de données (types, talents, attaques, créatures, objets, dresseurs, boutiques, réglages) ---
    voir_donnees: {
      lecture: true,
      icone: 'database',
      libelle: (a) => `Regarde ${a.sorte}${a.id ? ` ${a.id}` : a.filtre ? ` « ${a.filtre} »` : ''}`,
      description: 'Lit les bases de données du jeu, sans rien changer. sorte : types, talents, attaques, creatures, objets, dresseurs, boutiques, classes, monstres, groupes, reglages (reglages.regles dit le pack : pokemon, jrpg qui utilise types = éléments, attaques = compétences, objets, boutiques, classes, monstres, groupes, ou jdr (D&D 5e) qui utilise caracteristiques, competences, etats, origines, classes_jdr, sorts, monstres_jdr, groupes (les rencontres), objets (jdr.arme, jdr.armure, effet.des) et personnages (jdr : les pré-tirés)), et les autres sortes. action : liste (une ligne par élément ; filtre : texte cherché dans le nom ou l\'id ; debut : pour la suite, 80 lignes à la fois) ou voir (id : tout l\'élément en JSON, avec ses images et où il sert ; reglages : sans id). Pour changer : action donnee.',
      schema: { type: 'object', properties: { sorte: { type: 'string', enum: Donnees.SORTES }, action: { type: 'string', enum: ['liste', 'voir'] }, id: { type: 'string' }, filtre: { type: 'string' }, debut: nombre }, required: ['sorte', 'action'] },
      faire: (a) => faireDonnee({ ...a, action: a.action === 'voir' ? 'voir' : 'liste' }),
    },
    donnee: {
      icone: 'database',
      libelle: (a) => `${{ ajouter: 'Ajoute', modifier: 'Modifie', supprimer: 'Supprime' }[a.action] || a.action} ${a.sorte}${a.id ? ` ${a.id}` : a.valeurs?.nom ? ` « ${a.valeurs.nom} »` : ''}`,
      description: `Les bases de données du jeu (Jeu › Données du jeu). sorte : ${Donnees.SORTES.join(', ')}. action : ajouter (valeurs : l'élément ; id facultatif tiré du nom), modifier (id + valeurs : seulement les champs à changer ; l'id ne change pas), supprimer (id). Pour reglages : modifier, sans id (dont interface : { theme : verre ou pixel, accent : #rrggbb ou \"\", menus : { equipe, dex, pc, boite (noms, \"\" = ceux du pack), dex_visible, places, colonnes (0 = ceux du pack), forme_boites : grille, liste ou \"\", pages : ids du résumé parmi infos, stats, attaques ([] = toutes) } } ; badges : [{ id, nom, icone }] la liste complète, donnés par la commande badge ; regles : le pack de règles, \"pokemon\", \"jrpg\" (JRPG : niveau_max, courbe_xp rapide|normale|lente) ou \"jdr\" (JDR : jdr = les règles maison : creation {active, methodes standard|points|des, niveau_depart, nombre, pretires}, pv_niveau moyenne|jet|choix, critiques doubler|max, echec_critique, progression xp|jalons, repos normal|heroique|realiste, repos_menu, morts jets|ko, potion_bonus, tenaille, unite m|cases|pieds, mj_decide, animation_des normale|rapide|aucune ; la monnaie est reglages.monnaie, la même pour tous les packs) ; plafonds [{ badges, niveau }] ; ajustement et ecart : le niveau des dresseurs ajuste: true ; ajustement_sauvages (aucun, equipe, badges) et ecart_sauvages : le niveau des sauvages ; evolution_dresseurs et evolution_sauvages (false par défaut) : les créatures montées par l'ajustement prennent la forme de leur niveau ; seuil_amitie : l'amitié (0-255, 220 par défaut) d'une évolution mode amitie). Un article de boutique a aussi verrouille_visible (true : grisé avec son déblocage avant d'être en vente). Objet tenu Pierre Stase : effet { type: \"stase\" } ; objet qui rapproche : effet { type: \"amitie\", valeur }. Pack JRPG : classes {nom, couleur, description, stats et gains {pv, pm, force, magie, defense, esprit, agilite, chance} (niveau 1 et gain par niveau), competences [{niveau, competence: id d'une attaque}]} ; monstres {nom, numero, niveau, taille petit|moyen|grand, boss, stats (les 8), faiblesses, resistances, immunites (ids de types), statuts_immunises, poids_attaque, competences [{competence, poids}], xp, or, butin [{objet, chance %}]} (image : image_donnee) ; groupes {nom, monstres [{monstre, nombre}] (8 au plus), fuite} ; une attaque JRPG a aussi cout_pm, ranime, guerit ([statuts] ou [\"tous\"]), soin = puissance du soin, categorie physique|speciale (magie)|statut, statut poison|sommeil|paralysie|silence|cecite, stats en crans ±4 sur force|magie|defense|esprit|agilite ; un objet porté : equipement {place arme|bouclier|casque|armure|accessoire, bonus {stat: n}, element, classes}, effet soin_pm pour les PM. Un personnage du groupe a classe, niveau, equipement {place: id} (action personnage). Les zones JRPG ont rencontres [{groupe, chance}]. Pour lire : voir_donnees. Les clés de chaque sorte sont celles de FORMAT.md (« Données du jeu ») : voir_donnees sur un élément existant en montre un exemple. Les éléments importés ont « officiel » (leur nom anglais PokeAPI) ; ceux que Ragna crée n'en ont pas. Références : une créature cite ses types, talents, attaques (attaques par niveau, ct) et ses évolutions (vers, objet) par leur id ; un dresseur ses créatures ; une boutique ses articles (sorte objet ou creature, condition de déblocage : une condition des événements, par exemple { type: "compteur", compteur: "captures", min: 10 }). Natures : ${Donnees.NATURES.map(([k]) => k).join(', ')}. Tafl 1.0 : reglages.multijoueur = { echanges, duels (true par défaut : ce que les joueurs peuvent faire entre eux quand ils jouent ensemble sur le même réseau), pv_autres : "exacts" ou "etat" (ce qu\'on voit des PV des autres) }. Tafl 0.31 : reglages.scripts.formules_coupees = les formules du pack que les scripts JS ne remplacent pas (Réglages › Règles maison), par exemple ["degats"]. Tafl 1.3, module gestion (reglages.modules contient "gestion") : ressources {nom, description, icone, objet (l'objet du sac déposé en cette ressource)} ; batiments {nom, description, cout, production, consommation ([{ressource, nombre}]), jours (nuits de chantier, 0 = tout de suite), maximum (0 = sans limite), tampon (nom d'un tampon : son apparence et sa taille une fois posé), tampon_chantier, largeur et hauteur (sans tampon), porte {x, y} (la case de l'emprise qu'on traverse, ou null)} ; reglages.modules_reglages.gestion = {nom, capacite (par ressource, 0 = sans limite), menu, construire_menu (Construire dans le menu de pause), stock_depart [{ressource, nombre}]}. Le joueur pose les bâtiments dans les zones de type constructible (commande gestion_placer, ou le menu de pause).`,
      schema: { type: 'object', properties: { sorte: { type: 'string', enum: Donnees.SORTES }, action: { type: 'string', enum: ['ajouter', 'modifier', 'supprimer'] }, id: { type: 'string' }, valeurs: { type: 'object' } }, required: ['sorte', 'action'] },
      faire: (a) => {
        if (!['ajouter', 'modifier', 'supprimer'].includes(a.action)) throw new Error('action : ajouter, modifier ou supprimer (pour lire : voir_donnees).');
        return faireDonnee(a);
      },
    },
    image_donnee: {
      icone: 'file-media',
      libelle: (a) => `Image de ${a.id} (${a.cle || 'face'})`,
      description: 'Met une image du projet (chemin relatif, PNG à fond transparent) sur une créature (sorte creatures, cle face ou dos : ses sprites de combat), un objet (sorte objets, cle icone) ou un monstre JRPG (sorte monstres, cle image). Sans chemin : retire l\'image.',
      schema: { type: 'object', properties: { sorte: { type: 'string', enum: ['creatures', 'objets', 'monstres'] }, id: { type: 'string' }, cle: { type: 'string', enum: ['face', 'dos', 'icone', 'image'] }, chemin: { type: 'string' } }, required: ['sorte', 'id'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const o0 = doc.data[a.sorte]?.find((o) => o.id === a.id);
        if (!o0) throw new Error(`Pas de ${a.sorte} « ${a.id} ».`);
        const png = a.chemin ? (await Events.imagePortrait(await window.claude.lireFichier(a.chemin))).png : '';
        const o = a.sorte === 'objets' ? { ...o0, icone: png } : a.sorte === 'monstres' ? { ...o0, image: png } : { ...o0, sprites: { ...o0.sprites, [a.cle === 'dos' ? 'dos' : 'face']: png } };
        changerDonnees(doc, `Image de ${o0.nom} (Loki)`, (d) => ({ ...d, [a.sorte]: d[a.sorte].map((x) => (x.id === o.id ? o : x)) }));
        return png ? `Image mise sur ${o0.id}.` : `Image retirée de ${o0.id}.`;
      },
    },
    importer_officiel: {
      icone: 'cloud-download',
      libelle: () => 'Importe les données officielles Pokémon',
      description: 'Importe depuis Internet (PokeAPI, en français) les données officielles : 18 types et leur table, talents, attaques, créatures (statistiques, évolutions, attaques par niveau et CT, talents, capture…), objets (soins, balles, menthes, capsules, pierres…). generations : liste de 1 à 9 (toutes par défaut) ; sprites : images de face et de dos ; icones : icônes des objets ; maj : false pour seulement ajouter ce qui manque (sinon les éléments déjà importés sont mis à jour). Les éléments créés par Ragna ne sont jamais touchés. Un seul Ctrl+Z annule tout.',
      schema: { type: 'object', properties: { generations: { type: 'array', items: { type: 'number' } }, sprites: { type: 'boolean' }, icones: { type: 'boolean' }, maj: { type: 'boolean' } } },
      faire: async (a) => {
        const doc = besoinJeu();
        const imp = await Donnees.telechargerOfficiel({ generations: (a.generations || []).map(Number).filter((g) => g >= 1 && g <= 9), sprites: a.sprites !== false, icones: a.icones !== false });
        const { data, bilan } = Donnees.fusionner(doc.data, imp, { maj: a.maj !== false });
        Doc.change(doc, 'Importer les données officielles (Loki)', () => { doc.data = Events.normData(data, doc.tiles.length); });
        return `Importé : ${Object.entries(bilan).map(([k, b]) => `${k} ${b.ajoutes} ajoutés, ${b.misAJour} mis à jour`).join(' ; ')}.`;
      },
    },
    ambiance: {
      icone: 'cloud',
      libelle: (a) => `Ambiance : ${a.meteo || 'teinte'}`,
      description: `La météo, la teinte, la musique et le jour/nuit d'une carte (carte : sinon celle affichée), joués par le moteur ; Tafl en montre un aperçu. meteo : ${Donnees.METEOS.map(([k]) => k).join(', ')} ; intensite 0 à 100 ; teinte : #rrggbb (appliquée en produit sur la carte, "" = aucune) ; force 0 à 100 ; musique : "sons/…" (un fichier du dossier sons/), "aucune" (silence) ou "" (celle d'avant continue) ; fond_sonore : "sons/…" en boucle, "aucun", ou "" (selon la météo : Saga fait la pluie) ; volume_fond 0 à 100 ; jour_nuit : false pour qu'une carte extérieure ne s'assombrisse pas la nuit.`,
      schema: { type: 'object', properties: { carte: { type: ['string', 'number'] }, meteo: { type: 'string', enum: Donnees.METEOS.map(([k]) => k) }, intensite: nombre, teinte: { type: 'string' }, force: nombre, musique: { type: 'string' }, fond_sonore: { type: 'string' }, volume_fond: nombre, jour_nuit: { type: 'boolean' } } },
      faire: (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        const i = doc.maps.indexOf(map);
        const ambiance = Donnees.normAmbiance({ ...map.ambiance, ...Object.fromEntries(['meteo', 'intensite', 'teinte', 'force', 'musique', 'fond_sonore', 'volume_fond', 'jour_nuit'].filter((k) => a[k] !== undefined).map((k) => [k, a[k]])) });
        Doc.change(doc, 'Ambiance de la carte (Loki)', () => { doc.maps[i] = { ...map, ambiance }; Doc.selectMap(doc, doc.mapIndex); });
        return `Ambiance de ${map.id} : ${JSON.stringify(ambiance)}.`;
      },
    },
  }));
})();
