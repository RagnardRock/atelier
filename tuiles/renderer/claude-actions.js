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
    if (App.mode !== 'map') App.setMode('map');
    return doc.map;
  };
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
  const nombre = { type: 'number' };
  const lignesSchema = { type: 'array', items: { type: 'string' } };

  ClaudePanneau.actions({
    infos: {
      lecture: true,
      icone: 'info',
      libelle: () => 'Regarde le jeu de tuiles',
      description: 'Décrit le jeu ouvert : dossier de jeu ou simple jeu de tuiles, taille des tuiles, liste des tuiles (numéro, nom, images, passage), palette, cartes, départ du joueur, nombre de personnages, quêtes et interrupteurs, et pour la carte affichée ses calques (profondeur, opacité, fusion, parallaxe), zones, téléporteurs et événements.',
      faire: () => {
        const doc = besoinJeu();
        return [
          `${doc.game ? `Dossier de jeu « ${doc.name} »${doc.game.folder ? ` (${doc.game.folder})` : ', pas encore enregistré'}` : `Jeu de tuiles « ${doc.name} »${doc.path ? ` (${doc.path})` : ', jamais enregistré'}`}${doc.dirty ? ', modifié' : ''}. Tuiles de ${doc.tileSize} × ${doc.tileSize} px. Mode affiché : ${App.mode === 'map' ? 'Carte' : 'Tuile'}.`,
          `Tuiles (${doc.tiles.length}) : ${doc.tiles.map((t, i) => `${i} « ${t.name} »${t.frames.length > 1 ? ` (${t.frames.length} images, ${t.duration} ms)` : ''}${t.passage && t.passage !== 'auto' ? ` [${t.passage}]` : ''}${i === doc.current ? ' [choisie]' : ''}`).join(', ')}.`,
          `Cartes (${doc.maps.length}) : ${listeCartes(doc)}. Départ du joueur : ${doc.depart ? `${doc.depart.carte} (${doc.depart.x}, ${doc.depart.y}), regard ${doc.depart.direction}` : 'pas encore placé'}.`,
          `Tampons (objets de plusieurs tuiles, action tampon) : ${doc.stamps.length ? doc.stamps.map((st, k) => `${k} « ${st.name} » ${st.w} × ${st.h}`).join(', ') : 'aucun'}.`,
          `Palette : ${doc.palette.map((c, i) => `${CODES[i] ?? '?'} ${c}`).join(', ')}.`,
          `Données du jeu : ${doc.data.personnages.length} personnage(s), ${doc.data.quetes.length} quête(s), ${doc.data.interrupteurs.length} interrupteur(s) (détails : action donnees) ; ${Donnees.SORTES.filter((k) => k !== 'reglages').map((k) => `${doc.data[k].length} ${k}`).join(', ')} (action donnee). Événements : ${doc.maps.reduce((n, m) => n + m.events.length, 0)} sur toutes les cartes.`,
          decrireCarte(doc),
        ].join('\n');
      },
    },
    voir_tuiles: {
      lecture: true,
      icone: 'eye',
      libelle: () => 'Regarde toutes les tuiles',
      description: 'Montre la planche de toutes les tuiles (agrandie), dans l\'ordre de leurs numéros, de gauche à droite puis de haut en bas.',
      faire: () => {
        const doc = besoinJeu();
        const colonnes = Math.min(doc.tiles.length, 8);
        const cats = [...new Set(doc.tiles.map((t) => t.categorie || ''))].filter(Boolean).map((c) => `${c} : ${doc.tiles.map((t, i) => (t.categorie === c ? i : -1)).filter((i) => i >= 0).join(', ')}`);
        return { texte: `${doc.tiles.length} tuiles, ${colonnes} par ligne, numérotées à partir de 0.${cats.length ? `\nCatégories (numéros des tuiles) :\n${cats.join('\n')}` : ' Aucune catégorie (action ranger_tuiles pour en créer).'}`, image: agrandir(IO.sheetCanvas(doc, colonnes, 1, 0, false), 768) };
      },
    },
    voir_tuile: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Regarde la tuile ${a.index ?? 'choisie'}`,
      description: 'Montre une tuile agrandie et ses pixels en texte (une ligne par rangée, voir la légende). index : numéro de la tuile (sinon la tuile choisie) ; image : numéro de l\'image pour une tuile animée.',
      schema: { type: 'object', properties: { index: nombre, image: nombre } },
      faire: (a) => {
        const doc = besoinJeu();
        const i = tuileNumero(doc, a.index);
        const t = doc.tiles[i];
        const k = clamp(Number(a.image) || 0, 0, t.frames.length - 1);
        return {
          texte: [`Tuile ${i} « ${t.name} », image ${k + 1} sur ${t.frames.length}.`, legende(doc), '', ...versTexte(doc, t.frames[k])].join('\n'),
          image: agrandir(Doc.tileCanvas(t, doc.tileSize, k), 256),
        };
      },
    },
    voir_carte: {
      lecture: true,
      icone: 'eye',
      libelle: () => 'Regarde la carte',
      description: 'Montre une carte (calques visibles ; carte : id, nom ou numéro, sinon la carte affichée, qui devient affichée), la liste de ses zones, téléporteurs et événements, et pour une carte de 40 × 40 cases au plus, le numéro de tuile de chaque case par calque (« . » = vide) et le passage final (. libre, # bloqué, v ^ < > rebords).',
      schema: { type: 'object', properties: { carte: { type: ['string', 'number'] } } },
      faire: (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        const lignes = [decrireCarte(doc)];
        if (map.width <= 40 && map.height <= 40) {
          for (const layer of map.layers) {
            lignes.push('', `Calque ${layer.name} (numéros séparés par des espaces, une ligne par rangée) :`);
            for (let y = 0; y < map.height; y++) lignes.push(Array.from(layer.cells.subarray(y * map.width, (y + 1) * map.width), (c) => (c < 0 ? '.' : String(c))).join(' '));
          }
          const final = Doc.collisions(doc, map);
          lignes.push('', 'Passage final (. libre, # bloqué, v ^ < > rebord à sauter dans ce sens) :');
          for (let y = 0; y < map.height; y++) lignes.push(Array.from(final.subarray(y * map.width, (y + 1) * map.width), (c) => PASSAGE_CARS[c]).join(''));
        }
        return { texte: lignes.join('\n'), image: agrandir(IO.mapCanvas(doc, 1), 1024), max: 1024 };
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
        Doc.change(doc, a.index === undefined || a.index === null ? 'Nouvelle tuile (Claude)' : 'Dessiner la tuile (Claude)', () => {
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
        return `Tuile ${i} « ${doc.tiles[i].name} » dessinée.`;
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
          if (unused.length) Doc.change(doc, 'Supprimer les tuiles inutilisées (Claude)', () => Doc.removeTiles(doc, new Set(unused)));
        } else throw new Error(`Action inconnue : ${a.action}`);
        return `Fait. ${avant !== doc.tiles.length ? `${avant - doc.tiles.length} tuile(s) en moins, ` : ''}${doc.tiles.length} tuiles maintenant (les numéros ont pu changer).`;
      },
    },
    poser_tuiles: {
      icone: 'symbol-array',
      libelle: (a) => `Pose la tuile ${a.tuile} sur la carte (${a.largeur || 1} × ${a.hauteur || 1} cases)`,
      description: 'Remplit un rectangle de cases d\'une carte avec une tuile. x, y : case en haut à gauche (0, 0 = coin en haut à gauche) ; largeur, hauteur en cases (1 par défaut) ; tuile : numéro (-1 pour effacer) ; calque : numéro ou nom (Sol, Décor…), sinon le calque choisi ; carte : id, nom ou numéro, sinon la carte affichée.',
      schema: { type: 'object', properties: { tuile: nombre, x: nombre, y: nombre, largeur: nombre, hauteur: nombre, calque: { type: ['string', 'number'] }, carte: { type: ['string', 'number'] } }, required: ['tuile', 'x', 'y'] },
      faire: (a) => {
        const doc = besoinJeu();
        choisirCarte(doc, a.carte);
        const t = Math.round(a.tuile);
        if (t !== -1) tuileNumero(doc, t);
        const li = calqueNumero(doc, a.calque);
        const { map } = doc;
        const x0 = clamp(Math.round(a.x), 0, map.width - 1), y0 = clamp(Math.round(a.y), 0, map.height - 1);
        const x1 = clamp(x0 + Math.round(a.largeur || 1), 1, map.width), y1 = clamp(y0 + Math.round(a.hauteur || 1), 1, map.height);
        Doc.change(doc, 'Poser des tuiles (Claude)', () => {
          const { cells } = Doc.layerForEdit(doc, li);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells[y * map.width + x] = t;
        });
        if (App.mode !== 'map') App.setMode('map');
        return `${(x1 - x0) * (y1 - y0)} case(s) du calque ${map.layers[li].name} ${t === -1 ? 'effacée(s)' : `remplie(s) avec la tuile ${t}`}.`;
      },
    },
    voir_tampons: {
      lecture: true,
      icone: 'eye',
      libelle: () => 'Regarde les tampons',
      description: 'Montre les tampons (objets de plusieurs tuiles : arbres, maisons…) : numéro, nom, taille, numéros de tuile de chaque rangée, et leur image.',
      faire: () => {
        const doc = besoinJeu();
        if (!doc.stamps.length) return 'Aucun tampon.';
        const texte = doc.stamps.map((st, k) => `${k} « ${st.name} » ${st.w} × ${st.h}${st.dessus ? `, ${st.dessus} rangée(s) au-dessus du joueur` : ''} : ${Array.from({ length: st.h }, (_v, j) => st.cells.slice(j * st.w, (j + 1) * st.w).map((c) => (c < 0 ? '.' : c)).join(' ')).join(' / ')}`).join('\n');
        // Une planche des tampons, côte à côte, pour les voir.
        const s = doc.tileSize, montres = doc.stamps.slice(0, 48);
        const largeur = Math.min(1024, montres.reduce((n, st) => n + (st.w * s + 4), 0));
        const out = el('canvas', { width: Math.max(1, largeur), height: 1 });
        let x = 0, y = 0, haut = 0;
        const places = montres.map((st) => {
          if (x && x + st.w * s > largeur) { x = 0; y += haut + 4; haut = 0; }
          const p = { st, x, y };
          x += st.w * s + 4;
          haut = Math.max(haut, st.h * s);
          return p;
        });
        out.height = y + haut;
        const g = out.getContext('2d');
        for (const p of places) g.drawImage(Panels.stampCanvas(doc, p.st, Math.max(p.st.w, p.st.h) * s), p.x, p.y);
        return { texte: `${doc.stamps.length} tampon(s) (numéros de tuile par rangée, « / » entre les rangées) :\n${texte}`, image: agrandir(out, 768) };
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
          Doc.change(doc, 'Nouveau tampon (Claude)', () => { doc.stamps = [...doc.stamps, st]; });
          return `Tampon ${doc.stamps.length - 1} « ${st.name} » (${w} × ${h}) créé.`;
        }
        const i = numero();
        const st = doc.stamps[i];
        if (a.action === 'reglages') {
          const name = a.nom ? String(a.nom) : st.name, dessus = a.dessus === undefined ? st.dessus : clamp(Math.round(a.dessus), 0, st.h);
          Doc.change(doc, 'Réglages du tampon (Claude)', () => { doc.stamps = doc.stamps.map((o, k) => (k === i ? { ...o, name, dessus } : o)); });
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
          Doc.change(doc, a.action === 'poser' ? 'Poser un tampon (Claude)' : 'Effacer un tampon (Claude)', () => { n = Doc.placeStamp(doc, st, Math.round(a.x || 0), Math.round(a.y || 0), li, a.action === 'effacer'); });
          return `Tampon « ${st.name} » ${a.action === 'poser' ? 'posé' : 'effacé'} en (${Math.round(a.x || 0)}, ${Math.round(a.y || 0)}) : ${n} case(s).`;
        }
        throw new Error(`Action inconnue : ${a.action}`);
      },
    },
    ecrire_carte: {
      icone: 'symbol-array',
      libelle: (a) => `Écrit ${a.lignes?.length || 0} rangée(s) de la carte`,
      description: 'Écrit plusieurs cases d\'un coup : lignes = une chaîne par rangée, avec les numéros de tuile séparés par des espaces (« . » = vide, « _ » = ne pas toucher). x, y : où commence la première case (0, 0 par défaut) ; calque : numéro ou nom, sinon le calque choisi ; carte : id, nom ou numéro, sinon la carte affichée.',
      schema: { type: 'object', properties: { lignes: lignesSchema, x: nombre, y: nombre, calque: { type: ['string', 'number'] }, carte: { type: ['string', 'number'] } }, required: ['lignes'] },
      faire: (a) => {
        const doc = besoinJeu();
        choisirCarte(doc, a.carte);
        const li = calqueNumero(doc, a.calque);
        const { map } = doc;
        const x0 = Math.round(a.x || 0), y0 = Math.round(a.y || 0);
        let n = 0;
        Doc.change(doc, 'Écrire la carte (Claude)', () => {
          const { cells } = Doc.layerForEdit(doc, li);
          (a.lignes || []).forEach((ligne, dy) => {
            String(ligne).trim().split(/\s+/).forEach((v, dx) => {
              const x = x0 + dx, y = y0 + dy;
              if (v === '_' || x < 0 || y < 0 || x >= map.width || y >= map.height) return;
              const t = v === '.' ? -1 : Number(v);
              if (!Number.isInteger(t) || t < -1 || t >= doc.tiles.length) throw new Error(`« ${v} » (rangée ${dy + 1}) n'est pas un numéro de tuile (0 à ${doc.tiles.length - 1}, ou .).`);
              cells[y * map.width + x] = t;
              n++;
            });
          });
        });
        if (App.mode !== 'map') App.setMode('map');
        return `${n} case(s) écrite(s) sur le calque ${map.layers[li].name}.`;
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
      libelle: (a) => `Affiche le mode ${a.mode === 'carte' ? 'Carte' : 'Tuile'}`,
      description: 'Change ce que montre la fenêtre de Tafl : tuile (la tuile choisie, agrandie) ou carte.',
      schema: { type: 'object', properties: { mode: { type: 'string', enum: ['tuile', 'carte'] } }, required: ['mode'] },
      faire: (a) => { besoinJeu(); App.setMode(a.mode === 'carte' ? 'map' : 'tile'); return 'Fait.'; },
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
  });
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

  ClaudePanneau.actions({
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
          Doc.change(doc, 'Nouveau calque (Claude)', () => Doc.addLayer(doc, at, { name: a.nom || `Calque ${map.layers.length + 1}`, profondeur: Doc.PROFONDEURS.some(([k]) => k === a.profondeur) ? a.profondeur : 'dessous' }));
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
          Doc.change(doc, 'Dupliquer le calque (Claude)', () => Doc.addLayer(doc, li + 1, { ...l, name: a.nom || `${l.name} (copie)`, cells: l.cells.slice(), parallaxe: { ...l.parallaxe } }));
          App.selectLayer(li + 1);
        } else if (a.action === 'supprimer') {
          if (map.layers.length < 2) throw new Error('C\'est le dernier calque de la carte.');
          Doc.change(doc, 'Supprimer le calque (Claude)', () => Doc.removeLayer(doc, li));
          App.selectLayer(clamp(li - 1, 0, doc.map.layers.length - 1));
        } else if (a.action === 'monter' || a.action === 'descendre') {
          const to = li + (a.action === 'monter' ? 1 : -1);
          if (to < 0 || to >= map.layers.length) throw new Error(`Le calque est déjà tout ${a.action === 'monter' ? 'en haut' : 'en bas'}.`);
          Doc.change(doc, 'Déplacer le calque (Claude)', () => Doc.moveLayer(doc, li, to));
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
          Doc.change(doc, 'Réglages du calque (Claude)', () => Doc.setLayer(doc, li, props));
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
          Doc.change(doc, a.action === 'nouvelle' ? 'Nouvelle carte (Claude)' : 'Dupliquer la carte (Claude)', () => Doc.addMap(doc, a.action === 'dupliquer' ? { name, copyOf: map } : { name, width: clamp(Math.round(a.largeur || map.width), 1, 256), height: clamp(Math.round(a.hauteur || map.height), 1, 256), groupe: a.groupe === undefined ? map.groupe : String(a.groupe).trim().slice(0, 60), interieur: a.interieur === true }));
          Stage.reset();
        } else if (a.action === 'renommer') {
          if (!a.nom) throw new Error('nom : le nouveau nom de la carte.');
          Doc.change(doc, 'Renommer la carte (Claude)', () => { doc.maps[doc.mapIndex] = { ...map, name: String(a.nom) }; Doc.selectMap(doc, doc.mapIndex); });
        } else if (a.action === 'supprimer') {
          if (doc.maps.length < 2) throw new Error('C\'est la seule carte du jeu.');
          Doc.change(doc, 'Supprimer la carte (Claude)', () => Doc.removeMap(doc, doc.mapIndex));
          Stage.reset();
        } else if (a.action === 'deplacer') {
          const to = Math.round(a.position);
          if (!(to >= 0 && to < doc.maps.length)) throw new Error(`position : de 0 à ${doc.maps.length - 1}.`);
          Doc.change(doc, 'Déplacer la carte (Claude)', () => Doc.moveMap(doc, doc.mapIndex, to));
        } else if (a.action === 'grouper') {
          if (a.groupe === undefined) throw new Error('groupe : le nom du groupe ("" = sans groupe).');
          const groupe = String(a.groupe).trim().slice(0, 60);
          const i = doc.maps.indexOf(map);
          const last = doc.maps.reduce((k, o, j) => (o.groupe === groupe && groupe && j !== i ? j : k), -1);
          App.placeMap(i, last >= 0 ? last + 1 : i, groupe);
        } else if (a.action === 'interieur') {
          if (typeof a.interieur !== 'boolean') throw new Error('interieur : true (maison, grotte…) ou false (ville, route).');
          const i = doc.maps.indexOf(map);
          if (Boolean(map.interieur) !== a.interieur) Doc.change(doc, a.interieur ? 'Carte intérieure (Claude)' : 'Carte extérieure (Claude)', () => { doc.maps[i] = { ...map, interieur: a.interieur }; Doc.selectMap(doc, doc.mapIndex); });
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
          Doc.change(doc, 'Placer la carte sur la carte monde (Claude)', () => { doc.maps[i] = { ...map, monde: { x: Math.round(a.x), y: Math.round(a.y) } }; Doc.selectMap(doc, doc.mapIndex); });
        } else if (a.action === 'replacer') {
          const seule = a.carte !== undefined ? choisirCarte(doc, a.carte) : null;
          Doc.change(doc, 'Replacer les cartes sur la carte monde (Claude)', () => {
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
        Doc.change(doc, 'Peindre le passage (Claude)', () => {
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
      description: `Les zones d'une carte (carte : sinon celle affichée) : des rectangles de cases. action : ajouter (nom, type, x, y, largeur, hauteur, objet_requis, taux, rencontres), modifier (id + les champs à changer), supprimer (id). rencontres : les créatures sauvages qui surgissent [{ creature (id), niveau_min, niveau_max, chance (%) }] ; taux : % de chance de rencontre à chaque pas (10 par défaut). type : ${Doc.ZONES.map(([k, l]) => `${k} (${l})`).join(', ')}. objet_requis : l'objet qu'il faut pour y entrer (par exemple « planche-de-surf » pour l'eau, à la place des CS).`,
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['ajouter', 'modifier', 'supprimer'] }, id: { type: 'string' }, nom: { type: 'string' }, type: { type: 'string', enum: Doc.ZONES.map(([k]) => k) }, x: nombre, y: nombre, largeur: nombre, hauteur: nombre, objet_requis: { type: 'string' }, taux: nombre, rencontres: { type: 'array', items: { type: 'object' } }, carte: { type: ['string', 'number'] } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        const z0 = a.id ? map.zones.find((z) => z.id === a.id) : null;
        if (a.action !== 'ajouter' && !z0) throw new Error(`Pas de zone « ${a.id} » sur ${map.id} : ${map.zones.map((z) => z.id).join(', ') || 'aucune zone'}.`);
        if (a.action === 'supprimer') {
          Doc.change(doc, 'Supprimer la zone (Claude)', () => { map.zones = map.zones.filter((z) => z !== z0); });
          return decrireCarte(doc);
        }
        const base = z0 || { id: (() => { let n = map.zones.length + 1; while (map.zones.some((z) => z.id === `zone-${n}`)) n++; return `zone-${n}`; })(), name: '', type: 'herbes', objet: '', x: 0, y: 0, w: 1, h: 1 };
        const x = clamp(Math.round(a.x ?? base.x), 0, map.width - 1), y = clamp(Math.round(a.y ?? base.y), 0, map.height - 1);
        const type = a.type ?? base.type;
        if (!Doc.ZONES.some(([k]) => k === type)) throw new Error(`type : ${Doc.ZONES.map(([k]) => k).join(', ')}.`);
        const zone = { ...base, name: String(a.nom ?? base.name), type, objet: String(a.objet_requis ?? base.objet ?? ''), x, y, w: clamp(Math.round(a.largeur ?? base.w), 1, map.width - x), h: clamp(Math.round(a.hauteur ?? base.h), 1, map.height - y), taux: clamp(Math.round(a.taux ?? base.taux ?? 10), 0, 100), rencontres: a.rencontres !== undefined ? Donnees.normRencontres(a.rencontres) : base.rencontres || [] };
        const inconnues = zone.rencontres.filter((r) => doc.data.creatures.length && !doc.data.creatures.some((c) => c.id === r.creature)).map((r) => r.creature);
        if (inconnues.length) throw new Error(`Créatures inconnues : ${inconnues.join(', ')} (cherche avec voir_donnees, sorte creatures, action liste).`);
        Doc.change(doc, z0 ? 'Modifier la zone (Claude)' : 'Nouvelle zone (Claude)', () => { map.zones = z0 ? map.zones.map((z) => (z === z0 ? zone : z)) : [...map.zones, zone]; });
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
          Doc.change(doc, 'Supprimer le téléporteur (Claude)', () => { map.warps = map.warps.filter((w) => w !== w0); });
          return decrireCarte(doc);
        }
        const x = clamp(Math.round(a.x ?? w0?.x ?? 0), 0, map.width - 1), y = clamp(Math.round(a.y ?? w0?.y ?? 0), 0, map.height - 1);
        if (a.action === 'ajouter' && map.warps.some((w) => w.x === x && w.y === y)) throw new Error(`Il y a déjà un téléporteur en (${x}, ${y}) : utilise modifier.`);
        const dest = a.vers_carte === undefined ? Doc.mapById(doc, w0?.carte) : doc.maps[carteNumero(doc, a.vers_carte)];
        if (!dest) throw new Error('vers_carte : la carte d\'arrivée (id, nom ou numéro).');
        // Même fenêtre que l'outil Téléporteur, remplie et validée toute seule.
        const valeurs = { carte: dest.id, tx: Math.round(a.vers_x ?? w0?.tx ?? 0), ty: Math.round(a.vers_y ?? w0?.ty ?? 0), direction: a.direction ?? w0?.direction ?? 'bas' };
        if (!w0) valeurs.retour = Boolean(a.retour);
        if (w0 && (w0.x !== x || w0.y !== y)) Doc.change(doc, 'Déplacer le téléporteur (Claude)', () => { map.warps = map.warps.map((w) => (w === w0 ? { ...w, x, y } : w)); });
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
    importer_planche: {
      icone: 'cloud-download',
      libelle: (a) => `Importe la planche ${a.chemin}`,
      description: 'Découpe une image PNG du projet en tuiles (chemin relatif), comme Fichier › Importer une planche. valeurs : les réglages de la fenêtre d\'import (appelle d\'abord avec apercu: true pour les connaître, sans rien changer) : size (taille des tuiles), marge et espacement (px), la zone en tuiles (zx, zy, zw, zh), fond (auto = le damier ou la couleur unie détectés, couleur = la couleur « couleur », aucun), petits, target, skipEmpty, dedupe, tampons (un tampon par objet de plusieurs tuiles), asMap. Si le jeu en cours a des modifications non enregistrées, l\'import vers un nouveau jeu s\'arrête : enregistre-le d\'abord.',
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
  });
  // --- Événements et données du jeu (Tafl 0.7) ---
  const CMDS_AIDE = 'Commandes ({ "type": …, champs }) : dire {qui: id d\'un personnage, "@evenement" (le personnage de l\'événement) ou "" (texte seul : panneau, narration), expression (normal, content, triste…), texte ({joueur} = nom du joueur ; une ligne vide = boîte suivante)} ; choix {options: [{texte, commandes: [...]}], 2 à 4} ; si {condition, alors: [...], sinon: [...]} ; commentaire {texte} ; fin {} ; interrupteur {id, valeur: true|false} (un nom nouveau crée l\'interrupteur) ; local {valeur} (l\'interrupteur « déjà fait » propre à l\'événement) ; attendre {ms} ; objet {action: donner|retirer, objet, nombre} ; creature {creature, niveau} (la donner) ; combat_sauvage {creature, niveau} ; combat_dresseur {dresseur} ; teleporter {carte, x, y, direction} ; quete {quete, action: commencer|etape|finir, etape (numéro, à partir de 1)} ; soigner {} ; boutique {boutique} ; ecran_ev {}. Conditions : interrupteur {id, valeur} ; local {valeur} ; objet {objet, min} ; quete {quete, etat: pas_commencee|en_cours|finie, etape (au moins, 0 = peu importe)} ; compteur {compteur: captures|dresseurs_battus|evolutions|badges|pas, min}.';
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
      ...d.personnages.map((p) => `- ${p.id} « ${p.nom} »${p.heros ? ' [héros]' : ''}${p.couleur ? `, couleur ${p.couleur}` : ''}${p.tuile >= 0 ? `, tuile ${p.tuile}` : ''}${p.sprite ? `, sprite ${p.sprite.largeur} × ${p.sprite.hauteur} px, ${p.sprite.images} image(s) par direction` : ', pas de sprite'}, portraits : ${p.portraits.map((x) => x.expression).join(', ') || 'aucun'}${p.description ? `\n  ${p.description.replace(/\n/g, '\n  ')}` : ''}`),
      '',
      `Quêtes (${d.quetes.length}) :`,
      ...d.quetes.map((q) => `- ${q.id} « ${q.titre} » (${q.secondaire ? 'secondaire' : 'principale'})${q.suivante ? `, suite : ${q.suivante}` : ''}${q.personnages.length ? `, personnages : ${q.personnages.join(', ')}` : ''}${q.description ? `\n  ${q.description.replace(/\n/g, '\n  ')}` : ''}\n${q.etapes.map((e, i) => `  ${i + 1}. ${e.texte}`).join('\n')}`),
      '',
      `Interrupteurs (${d.interrupteurs.length}) :`,
      ...d.interrupteurs.map((s) => `- ${s.id} « ${s.nom} »${s.description ? ` : ${s.description}` : ''}${(() => { const u = Events.utilisations(doc, 'interrupteur', s.id); return u.length ? ` (utilisé par ${u.join(', ')})` : ''; })()}`),
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
      changerDonnees(doc, 'Réglages du jeu (Claude)', (d) => ({ ...d, reglages: r }));
      return JSON.stringify(r, null, 1);
    }
    const liste = doc.data[sorte];
    const kind = { types: 'type', talents: 'talent', attaques: 'attaque', creatures: 'creature', objets: 'objet', dresseurs: 'dresseur', boutiques: 'boutique' }[sorte];
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
      changerDonnees(doc, `Nouveau : ${o.nom} (Claude)`, (d) => ({ ...d, [sorte]: [...d[sorte], o] }));
      return `Ajouté : ${Donnees.resumer(doc, sorte, o)}`;
    }
    const o0 = liste.find((o) => o.id === a.id);
    if (!o0) throw new Error(`Pas de ${kind} « ${a.id} ». Cherche avec action liste et filtre.`);
    if (a.action === 'voir') {
      const texte = `${JSON.stringify(sansImages(o0), null, 1)}\nUtilisé par : ${Donnees.utilisations(doc, kind, o0.id).slice(0, 30).join(', ') || 'rien encore'}.`;
      const images = [o0.sprites?.face, o0.sprites?.dos, o0.icone].filter(Boolean);
      return images.length ? { texte, image: await planchePortraits({ portraits: images.map((png, k) => ({ png, expression: ['face', 'dos', 'icône'][o0.icone ? 2 : k] })) }) } : texte;
    }
    if (a.action === 'supprimer') {
      const u = Donnees.utilisations(doc, kind, o0.id);
      changerDonnees(doc, `Supprimer ${o0.nom} (Claude)`, (d) => ({ ...d, [sorte]: d[sorte].filter((o) => o.id !== o0.id) }));
      return `${o0.id} supprimé.${u.length ? ` Attention, il était utilisé par : ${u.slice(0, 20).join(', ')}.` : ''}`;
    }
    if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
    const o = Donnees.normElement(sorte, { ...o0, ...(a.valeurs || {}), id: o0.id });
    o.id = o0.id;
    changerDonnees(doc, `Modifier ${o.nom} (Claude)`, (d) => ({ ...d, [sorte]: d[sorte].map((x) => (x.id === o.id ? o : x)) }));
    return `Modifié : ${Donnees.resumer(doc, sorte, o)}`;
  }

  ClaudePanneau.actions({
    evenement: {
      icone: 'person',
      libelle: (a) => `Événement : ${a.action}${a.nom ? ` « ${a.nom} »` : a.id ? ` ${a.id}` : ''}`,
      description: `Les événements d'une carte (carte : id, nom ou numéro, sinon celle affichée) : personnages, panneaux, coffres, objets au sol, déclencheurs (case invisible), un par case. action : liste (tous les événements du jeu, ou de carte), voir (id, ou x et y : son script et son JSON), ajouter (type, x, y, nom, personnage, tuile, direction, deplacement, declenchement, traversable, pages ; sans pages, le modèle du type : un coffre a déjà sa page « vide »), modifier (id + les champs à changer ; pages remplace tout le script), supprimer (id), deplacer (id, vers_x, vers_y). type : ${Events.TYPES.map(([k, l]) => `${k} (${l})`).join(', ')}. deplacement : ${Events.DEPLACEMENTS.map(([k]) => k).join(', ')}. declenchement : parler (touche A), toucher (marcher dessus ou contre), auto (à l'arrivée sur la carte). pages : [{ conditions: [...], cache: false, commandes: [...] }] ; le moteur joue la DERNIÈRE page dont toutes les conditions sont vraies (page 1 sans condition = d'habitude ; cache: true = l'événement est absent sur cette page). ${CMDS_AIDE}`,
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
          Doc.change(doc, 'Nouvel événement (Claude)', () => {
            map.events = [...map.events, ev];
            const nouveaux = Events.interrupteursManquants(doc, ev);
            if (nouveaux.length) doc.data = { ...doc.data, interrupteurs: [...doc.data.interrupteurs, ...nouveaux] };
          });
          if (!App.options.showObjects) App.toggleOption('showObjects');
          return `Ajouté :\n${voirEvenement(doc, ev)}`;
        }
        const ev0 = trouverEvenement(map, a);
        if (a.action === 'supprimer') {
          Doc.change(doc, 'Supprimer l\'événement (Claude)', () => { map.events = map.events.filter((e) => e !== ev0); });
          return `${ev0.id} supprimé.\n${decrireCarte(doc)}`;
        }
        if (a.action === 'deplacer') {
          const x = clamp(Math.round(a.vers_x ?? ev0.x), 0, map.width - 1), y = clamp(Math.round(a.vers_y ?? ev0.y), 0, map.height - 1);
          const autre = Doc.eventAt(map, x, y);
          if (autre && autre !== ev0) throw new Error(`La case (${x}, ${y}) a déjà un événement (${autre.id}).`);
          Doc.change(doc, 'Déplacer l\'événement (Claude)', () => { map.events = map.events.map((e) => (e === ev0 ? { ...e, x, y } : e)); });
          return `${ev0.id} est maintenant en (${x}, ${y}).`;
        }
        if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
        const ev = champsEvenement(doc, map, ev0, a);
        const autre = Doc.eventAt(map, ev.x, ev.y);
        if (autre && autre !== ev0) throw new Error(`La case (${ev.x}, ${ev.y}) a déjà un événement (${autre.id}).`);
        Doc.change(doc, 'Modifier l\'événement (Claude)', () => {
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
      description: 'Les personnages du jeu (Jeu › Données du jeu) : le héros, sa famille, le prof, les rivaux, les habitants récurrents… Les dialogues (commande dire, qui) et l\'apparence des événements s\'y réfèrent par leur id. action : ajouter (nom, id facultatif tiré du nom, description : rôle et personnalité, heros, couleur #rrggbb du nom dans les dialogues, tuile), modifier (id + les champs à changer ; l\'id ne change pas), supprimer (id), portrait (id, expression, chemin : une image PNG du projet ; remplace le portrait de cette expression), retirer_portrait (id, expression), sprite (id, chemin : une planche PNG du projet, 4 rangées face/gauche/droite/dos, images : nombre d\'images par rangée, deviné sinon), retirer_sprite (id). Pour voir les portraits : action donnees avec personnage ; pour le sprite : voir_sprite ; pour le dessiner pixel par pixel : dessiner_sprite.',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['ajouter', 'modifier', 'supprimer', 'portrait', 'retirer_portrait', 'sprite', 'retirer_sprite'] }, images: nombre, id: { type: 'string' }, nom: { type: 'string' }, description: { type: 'string' }, heros: { type: 'boolean' }, couleur: { type: 'string' }, tuile: nombre, expression: { type: 'string' }, chemin: { type: 'string' } }, required: ['action'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const liste = doc.data.personnages;
        if (a.action === 'ajouter') {
          if (!a.nom) throw new Error('nom : le nom du personnage.');
          const id = Events.ident(a.id || a.nom, liste, 'personnage');
          const p = { id, nom: String(a.nom), description: String(a.description || ''), heros: Boolean(a.heros), couleur: normalizeHex(a.couleur) || '', tuile: a.tuile === undefined || Math.round(a.tuile) === -1 ? -1 : tuileNumero(doc, a.tuile), portraits: [], sprite: null };
          changerDonnees(doc, 'Nouveau personnage (Claude)', (d) => ({ ...d, personnages: [...d.personnages.map((o) => (p.heros ? { ...o, heros: false } : o)), p] }));
          return `Personnage ${id} « ${p.nom} » ajouté.`;
        }
        const p0 = liste.find((p) => p.id === a.id);
        if (!p0) throw new Error(`Pas de personnage « ${a.id} » : ${liste.map((p) => p.id).join(', ') || 'aucun'}.`);
        if (a.action === 'supprimer') {
          const u = Events.utilisations(doc, 'personnage', p0.id);
          changerDonnees(doc, 'Supprimer le personnage (Claude)', (d) => ({ ...d, personnages: d.personnages.filter((p) => p.id !== p0.id) }));
          return `${p0.id} supprimé.${u.length ? ` Attention, il était utilisé par : ${u.join(', ')}.` : ''}`;
        }
        if (a.action === 'portrait') {
          if (!a.chemin) throw new Error('chemin : l\'image du portrait, dans le projet.');
          const expression = Doc.slug(a.expression, 'normal');
          const { png, largeur, hauteur } = await Events.imagePortrait(await window.claude.lireFichier(a.chemin));
          changerDonnees(doc, 'Portrait (Claude)', (d) => ({ ...d, personnages: d.personnages.map((p) => (p.id === p0.id ? { ...p, portraits: [...p.portraits.filter((x) => x.expression !== expression), { expression, png }] } : p)) }));
          return `Portrait « ${expression} » de ${p0.nom} : ${largeur} × ${hauteur} px.`;
        }
        if (a.action === 'retirer_portrait') {
          const expression = Doc.slug(a.expression, 'normal');
          if (!p0.portraits.some((x) => x.expression === expression)) throw new Error(`${p0.nom} n'a pas de portrait « ${expression} » (${p0.portraits.map((x) => x.expression).join(', ') || 'aucun'}).`);
          changerDonnees(doc, 'Retirer un portrait (Claude)', (d) => ({ ...d, personnages: d.personnages.map((p) => (p.id === p0.id ? { ...p, portraits: p.portraits.filter((x) => x.expression !== expression) } : p)) }));
          return `Portrait « ${expression} » retiré.`;
        }
        if (a.action === 'sprite') {
          if (!a.chemin) throw new Error('chemin : la planche du sprite (PNG), dans le projet.');
          const f = await window.claude.lireFichier(a.chemin);
          const png = await Events.imagePortrait(f);
          const sprite = await Sprites.depuisPlanche(png.png, a.images ? clamp(Math.round(a.images), 1, 8) : 0);
          changerDonnees(doc, 'Sprite (Claude)', (d) => ({ ...d, personnages: d.personnages.map((p) => (p.id === p0.id ? { ...p, sprite } : p)) }));
          return `Sprite de ${p0.nom} : ${sprite.images} image(s) de ${sprite.largeur} × ${sprite.hauteur} px par direction (face, gauche, droite, dos).`;
        }
        if (a.action === 'retirer_sprite') {
          if (!p0.sprite) throw new Error(`${p0.nom} n'a pas de sprite.`);
          changerDonnees(doc, 'Retirer le sprite (Claude)', (d) => ({ ...d, personnages: d.personnages.map((p) => (p.id === p0.id ? { ...p, sprite: null } : p)) }));
          return `Sprite de ${p0.nom} retiré : sur la carte, il reprend sa tuile.`;
        }
        if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
        const p = { ...p0 };
        if (a.nom !== undefined) p.nom = String(a.nom);
        if (a.description !== undefined) p.description = String(a.description);
        if (a.heros !== undefined) p.heros = Boolean(a.heros);
        if (a.couleur !== undefined) p.couleur = normalizeHex(a.couleur) || '';
        if (a.tuile !== undefined) p.tuile = Math.round(a.tuile) === -1 ? -1 : tuileNumero(doc, a.tuile);
        changerDonnees(doc, 'Modifier le personnage (Claude)', (d) => ({ ...d, personnages: d.personnages.map((o) => (o.id === p.id ? p : p.heros ? { ...o, heros: false } : o)) }));
        return `Personnage ${p.id} modifié.`;
      },
    },
    // --- Tafl 0.12 : les sprites des personnages (voir sprites.js) ---
    voir_sprite: {
      lecture: true,
      icone: 'person',
      libelle: (a) => `Regarde le sprite de ${a.id}`,
      description: 'Le sprite d\'un personnage sur la carte : sa taille, et les pixels de chaque image (face, gauche, droite, dos ; image 0 = debout, puis les pas), avec la planche agrandie. direction : une seule direction (bas, gauche, droite, haut), sinon toutes.',
      schema: { type: 'object', properties: { id: { type: 'string' }, direction: { type: 'string', enum: Sprites.DIRECTIONS } }, required: ['id'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const p = Events.perso(doc, a.id);
        if (!p) throw new Error(`Pas de personnage « ${a.id} » : ${doc.data.personnages.map((o) => o.id).join(', ') || 'aucun'}.`);
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
      description: 'Dessine une image du sprite d\'un personnage (comment il apparaît sur la carte), pixel par pixel comme dessiner_tuile. direction : bas (face), gauche, droite ou haut (dos). image : 0 = debout, 1 et 2 = les pas (pied gauche, pied droit). pixels : une ligne par rangée de pixels (« . » = transparent, sinon un code de la palette) ; la première image dessinée fixe la taille de toutes (souvent largeur de la tuile × 2 fois sa hauteur, les pieds en bas). images : nombre d\'images par direction, à la création du sprite (3 par défaut). miroir : true pour gauche ou droite, dessine aussi l\'autre côté en miroir. couleurs_en_plus : { "caractère": "#rrggbb" }.',
      schema: { type: 'object', properties: { id: { type: 'string' }, direction: { type: 'string', enum: Sprites.DIRECTIONS }, image: nombre, pixels: lignesSchema, images: nombre, miroir: { type: 'boolean' }, couleurs_en_plus: { type: 'object' } }, required: ['id', 'direction', 'pixels'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const p0 = Events.perso(doc, a.id);
        if (!p0) throw new Error(`Pas de personnage « ${a.id} » : ${doc.data.personnages.map((o) => o.id).join(', ') || 'aucun'}.`);
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
        Doc.change(doc, 'Dessiner le sprite (Claude)', () => {
          for (const hex of Object.values(enPlus)) if (!doc.palette.includes(hex)) doc.palette.push(hex);
          doc.data = { ...doc.data, personnages: doc.data.personnages.map((p) => (p.id === p0.id ? { ...p, sprite: nouveau } : p)) };
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
          changerDonnees(doc, 'Nouvelle quête (Claude)', (d) => ({ ...d, quetes: [...d.quetes, q] }));
          return `Quête ${q.id} « ${q.titre} » ajoutée (${q.etapes.length} étape(s)).`;
        }
        const q0 = liste.find((q) => q.id === a.id);
        if (!q0) throw new Error(`Pas de quête « ${a.id} » : ${liste.map((q) => q.id).join(', ') || 'aucune'}.`);
        if (a.action === 'supprimer') {
          const u = Events.utilisations(doc, 'quete', q0.id);
          changerDonnees(doc, 'Supprimer la quête (Claude)', (d) => ({ ...d, quetes: d.quetes.filter((q) => q.id !== q0.id) }));
          return `${q0.id} supprimée.${u.length ? ` Attention, elle était utilisée par : ${u.join(', ')}.` : ''}`;
        }
        if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
        const q = { ...q0 };
        for (const k of ['titre', 'description', 'suivante']) if (a[k] !== undefined) q[k] = String(a[k]);
        if (a.secondaire !== undefined) q.secondaire = Boolean(a.secondaire);
        if (a.personnages !== undefined) q.personnages = a.personnages.map(String);
        if (a.etapes !== undefined) q.etapes = a.etapes.map((t) => ({ texte: String(t) }));
        verifier(q);
        changerDonnees(doc, 'Modifier la quête (Claude)', (d) => ({ ...d, quetes: d.quetes.map((o) => (o.id === q.id ? q : o)) }));
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
          changerDonnees(doc, 'Nouvel interrupteur (Claude)', (d) => ({ ...d, interrupteurs: [...d.interrupteurs, s0] }));
          return `Interrupteur ${s0.id} « ${s0.nom} » ajouté.`;
        }
        const s0 = liste.find((s) => s.id === a.id);
        if (!s0) throw new Error(`Pas d'interrupteur « ${a.id} » : ${liste.map((s) => s.id).join(', ') || 'aucun'}.`);
        if (a.action === 'supprimer') {
          const u = Events.utilisations(doc, 'interrupteur', s0.id);
          changerDonnees(doc, 'Supprimer l\'interrupteur (Claude)', (d) => ({ ...d, interrupteurs: d.interrupteurs.filter((s) => s.id !== s0.id) }));
          return `${s0.id} supprimé.${u.length ? ` Attention, il était utilisé par : ${u.join(', ')}.` : ''}`;
        }
        if (a.action !== 'modifier') throw new Error(`Action inconnue : ${a.action}`);
        const s = { ...s0, ...(a.nom !== undefined ? { nom: String(a.nom) } : {}), ...(a.description !== undefined ? { description: String(a.description) } : {}) };
        changerDonnees(doc, 'Modifier l\'interrupteur (Claude)', (d) => ({ ...d, interrupteurs: d.interrupteurs.map((o) => (o.id === s.id ? s : o)) }));
        return `Interrupteur ${s.id} modifié.`;
      },
    },
    donnees: {
      lecture: true,
      icone: 'database',
      libelle: (a) => (a.personnage ? `Regarde le personnage ${a.personnage}` : 'Regarde les données du jeu'),
      description: 'Décrit les données de l\'histoire : personnages (id, nom, héros, description, expressions des portraits), quêtes (étapes numérotées, suite, personnages) et interrupteurs (avec où ils servent). personnage : un id, pour voir aussi ses portraits. Types, attaques, créatures, objets, dresseurs, boutiques et réglages : action donnee.',
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
      description: 'Lit les bases de données du jeu, sans rien changer. sorte : types, talents, attaques, creatures, objets, dresseurs, boutiques, reglages. action : liste (une ligne par élément ; filtre : texte cherché dans le nom ou l\'id ; debut : pour la suite, 80 lignes à la fois) ou voir (id : tout l\'élément en JSON, avec ses images et où il sert ; reglages : sans id). Pour changer : action donnee.',
      schema: { type: 'object', properties: { sorte: { type: 'string', enum: Donnees.SORTES }, action: { type: 'string', enum: ['liste', 'voir'] }, id: { type: 'string' }, filtre: { type: 'string' }, debut: nombre }, required: ['sorte', 'action'] },
      faire: (a) => faireDonnee({ ...a, action: a.action === 'voir' ? 'voir' : 'liste' }),
    },
    donnee: {
      icone: 'database',
      libelle: (a) => `${{ ajouter: 'Ajoute', modifier: 'Modifie', supprimer: 'Supprime' }[a.action] || a.action} ${a.sorte}${a.id ? ` ${a.id}` : a.valeurs?.nom ? ` « ${a.valeurs.nom} »` : ''}`,
      description: `Les bases de données du jeu (Jeu › Données du jeu). sorte : ${Donnees.SORTES.join(', ')}. action : ajouter (valeurs : l'élément ; id facultatif tiré du nom), modifier (id + valeurs : seulement les champs à changer ; l'id ne change pas), supprimer (id). Pour reglages : modifier, sans id. Pour lire : voir_donnees. Les clés de chaque sorte sont celles de FORMAT.md (« Données du jeu ») : voir_donnees sur un élément existant en montre un exemple. Les éléments importés ont « officiel » (leur nom anglais PokeAPI) ; ceux que Ragna crée n'en ont pas. Références : une créature cite ses types, talents, attaques (attaques par niveau, ct) et ses évolutions (vers, objet) par leur id ; un dresseur ses créatures ; une boutique ses articles (sorte objet ou creature, condition de déblocage : une condition des événements, par exemple { type: "compteur", compteur: "captures", min: 10 }). Natures : ${Donnees.NATURES.map(([k]) => k).join(', ')}.`,
      schema: { type: 'object', properties: { sorte: { type: 'string', enum: Donnees.SORTES }, action: { type: 'string', enum: ['ajouter', 'modifier', 'supprimer'] }, id: { type: 'string' }, valeurs: { type: 'object' } }, required: ['sorte', 'action'] },
      faire: (a) => {
        if (!['ajouter', 'modifier', 'supprimer'].includes(a.action)) throw new Error('action : ajouter, modifier ou supprimer (pour lire : voir_donnees).');
        return faireDonnee(a);
      },
    },
    image_donnee: {
      icone: 'file-media',
      libelle: (a) => `Image de ${a.id} (${a.cle || 'face'})`,
      description: 'Met une image du projet (chemin relatif, PNG à fond transparent) sur une créature (sorte creatures, cle face ou dos : ses sprites de combat) ou un objet (sorte objets, cle icone). Sans chemin : retire l\'image.',
      schema: { type: 'object', properties: { sorte: { type: 'string', enum: ['creatures', 'objets'] }, id: { type: 'string' }, cle: { type: 'string', enum: ['face', 'dos', 'icone'] }, chemin: { type: 'string' } }, required: ['sorte', 'id'] },
      faire: async (a) => {
        const doc = besoinJeu();
        const o0 = doc.data[a.sorte]?.find((o) => o.id === a.id);
        if (!o0) throw new Error(`Pas de ${a.sorte} « ${a.id} ».`);
        const png = a.chemin ? (await Events.imagePortrait(await window.claude.lireFichier(a.chemin))).png : '';
        const o = a.sorte === 'objets' ? { ...o0, icone: png } : { ...o0, sprites: { ...o0.sprites, [a.cle === 'dos' ? 'dos' : 'face']: png } };
        changerDonnees(doc, `Image de ${o0.nom} (Claude)`, (d) => ({ ...d, [a.sorte]: d[a.sorte].map((x) => (x.id === o.id ? o : x)) }));
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
        Doc.change(doc, 'Importer les données officielles (Claude)', () => { doc.data = Events.normData(data, doc.tiles.length); });
        return `Importé : ${Object.entries(bilan).map(([k, b]) => `${k} ${b.ajoutes} ajoutés, ${b.misAJour} mis à jour`).join(' ; ')}.`;
      },
    },
    ambiance: {
      icone: 'cloud',
      libelle: (a) => `Ambiance : ${a.meteo || 'teinte'}`,
      description: `La météo et la teinte d'une carte (carte : sinon celle affichée), jouées par le moteur ; Tafl en montre un aperçu. meteo : ${Donnees.METEOS.map(([k]) => k).join(', ')} ; intensite 0 à 100 ; teinte : #rrggbb (appliquée en produit sur la carte, "" = aucune) ; force 0 à 100.`,
      schema: { type: 'object', properties: { carte: { type: ['string', 'number'] }, meteo: { type: 'string', enum: Donnees.METEOS.map(([k]) => k) }, intensite: nombre, teinte: { type: 'string' }, force: nombre } },
      faire: (a) => {
        const doc = besoinJeu();
        const map = choisirCarte(doc, a.carte);
        const i = doc.maps.indexOf(map);
        const ambiance = Donnees.normAmbiance({ ...map.ambiance, ...Object.fromEntries(['meteo', 'intensite', 'teinte', 'force'].filter((k) => a[k] !== undefined).map((k) => [k, a[k]])) });
        Doc.change(doc, 'Ambiance de la carte (Claude)', () => { doc.maps[i] = { ...map, ambiance }; Doc.selectMap(doc, doc.mapIndex); });
        return `Ambiance de ${map.id} : ${JSON.stringify(ambiance)}.`;
      },
    },
  });
})();
