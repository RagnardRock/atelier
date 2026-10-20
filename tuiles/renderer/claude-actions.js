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
  const legende = (doc) => `Légende des pixels : « . » = transparent, ${doc.palette.map((c, i) => `${CODES[i] ?? '?'} = ${c}`).join(', ')}.`;

  // Pixels d'une image de tuile -> lignes de texte.
  function versTexte(doc, data) {
    const s = doc.tileSize;
    const index = new Map(doc.palette.map((c, i) => [c.toLowerCase(), CODES[i]]));
    const lignes = [];
    for (let y = 0; y < s; y++) {
      let ligne = '';
      for (let x = 0; x < s; x++) {
        const k = (y * s + x) * 4;
        const hex = rgbaToHex(data[k], data[k + 1], data[k + 2], data[k + 3]);
        ligne += hex ? (index.get(hex.slice(0, 7)) || '?') : '.';
      }
      lignes.push(ligne);
    }
    return lignes;
  }
  // Lignes de texte -> pixels (couleurs : la palette, ou couleurs_en_plus { caractère: '#rrggbb' }).
  function depuisTexte(doc, lignes, enPlus = {}) {
    const s = doc.tileSize;
    if (!Array.isArray(lignes) || lignes.length !== s) throw new Error(`Il faut ${s} lignes de ${s} caractères (la tuile fait ${s} × ${s} pixels).`);
    const data = new Uint8ClampedArray(s * s * 4);
    lignes.forEach((ligne, y) => {
      const l = String(ligne);
      if (l.length !== s) throw new Error(`La ligne ${y + 1} fait ${l.length} caractères au lieu de ${s}.`);
      for (let x = 0; x < s; x++) {
        const c = l[x];
        if (c === '.' || c === ' ') continue;
        const hex = enPlus[c] || doc.palette[CODES.indexOf(c)];
        if (!hex) throw new Error(`Caractère « ${c} » (ligne ${y + 1}) : pas dans la palette ni dans couleurs_en_plus.`);
        data.set(hexToRgba(hex), (y * s + x) * 4);
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
  const decrireCarte = (doc) => `Carte : ${doc.map.width} × ${doc.map.height} cases de ${doc.tileSize} px. Calques : ${doc.map.layers.map((l, i) => `${i} = ${l.name}${l.visible ? '' : ' (masqué)'}`).join(', ')}.`;
  const nombre = { type: 'number' };
  const lignesSchema = { type: 'array', items: { type: 'string' } };

  ClaudePanneau.actions({
    infos: {
      lecture: true,
      icone: 'info',
      libelle: () => 'Regarde le jeu de tuiles',
      description: 'Décrit le jeu de tuiles ouvert : taille des tuiles, liste des tuiles (numéro, nom, nombre d\'images), palette, carte et calques.',
      faire: () => {
        const doc = besoinJeu();
        return [
          `Jeu « ${doc.name} »${doc.path ? ` (${doc.path})` : ', jamais enregistré'}${doc.dirty ? ', modifié' : ''}. Tuiles de ${doc.tileSize} × ${doc.tileSize} px. Mode affiché : ${App.mode === 'map' ? 'Carte' : 'Tuile'}.`,
          `Tuiles (${doc.tiles.length}) : ${doc.tiles.map((t, i) => `${i} « ${t.name} »${t.frames.length > 1 ? ` (${t.frames.length} images, ${t.duration} ms)` : ''}${i === doc.current ? ' [choisie]' : ''}`).join(', ')}.`,
          `Palette : ${doc.palette.map((c, i) => `${CODES[i] ?? '?'} ${c}`).join(', ')}.`,
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
        return { texte: `${doc.tiles.length} tuiles, ${colonnes} par ligne, numérotées à partir de 0.`, image: agrandir(IO.sheetCanvas(doc, colonnes, 1, 0, false), 768) };
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
      description: 'Montre la carte (calques visibles), et pour une carte de 40 × 40 cases au plus, le numéro de tuile de chaque case par calque (« . » = vide).',
      faire: () => {
        const doc = besoinJeu();
        const { map } = doc;
        const lignes = [decrireCarte(doc)];
        if (map.width <= 40 && map.height <= 40) {
          for (const layer of map.layers) {
            lignes.push('', `Calque ${layer.name} (numéros séparés par des espaces, une ligne par rangée) :`);
            for (let y = 0; y < map.height; y++) lignes.push(Array.from(layer.cells.subarray(y * map.width, (y + 1) * map.width), (c) => (c < 0 ? '.' : String(c))).join(' '));
          }
        }
        return { texte: lignes.join('\n'), image: agrandir(IO.mapCanvas(doc, 1), 1024), max: 1024 };
      },
    },
    nouveau_jeu: {
      icone: 'new-file',
      libelle: (a) => `Crée un jeu de tuiles de ${a.taille_tuile || 16} px`,
      description: 'Crée un nouveau jeu de tuiles (remplace celui ouvert, Tafl propose d\'abord de l\'enregistrer). taille_tuile : 8 à 64 px (16 par défaut) ; carte : largeur et hauteur en cases.',
      schema: { type: 'object', properties: { nom: { type: 'string' }, taille_tuile: nombre, largeur_carte: nombre, hauteur_carte: nombre } },
      faire: async (a) => {
        const tileSize = clamp(Math.round(a.taille_tuile || App.config.tileSize || 16), 4, 128);
        const palette = (PALETTES.find((p) => p.id === App.config.palette) || PALETTES[0]).couleurs;
        const doc = Doc.create({ name: a.nom || 'Sans titre', tileSize, palette, mapWidth: clamp(Math.round(a.largeur_carte || 20), 1, 256), mapHeight: clamp(Math.round(a.hauteur_carte || 15), 1, 256) });
        await App.setDocument(doc);
        if (App.doc !== doc) throw new Error('Ragna a gardé le jeu ouvert.');
        return `Jeu « ${doc.name} » créé : tuiles de ${tileSize} px, carte de ${doc.map.width} × ${doc.map.height} cases.`;
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
      description: 'Agit sur une tuile (index, sinon la tuile choisie). action : choisir, renommer (nom), dupliquer, supprimer, vider, miroir_horizontal, miroir_vertical, tourner_droite, tourner_gauche.',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['choisir', 'renommer', 'dupliquer', 'supprimer', 'vider', 'miroir_horizontal', 'miroir_vertical', 'tourner_droite', 'tourner_gauche'] }, index: nombre, nom: { type: 'string' } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinJeu();
        const i = tuileNumero(doc, a.index);
        const t = doc.tiles[i];
        // Tourner à gauche = trois quarts de tour à droite.
        const transform = { miroir_horizontal: ['flipH'], miroir_vertical: ['flipV'], tourner_droite: ['rotate'], tourner_gauche: ['rotate', 'rotate', 'rotate'] }[a.action];
        if (a.action === 'choisir') App.selectTile(i);
        else if (a.action === 'renommer') Doc.change(doc, 'Renommer la tuile', () => { t.name = String(a.nom || t.name); });
        else if (a.action === 'dupliquer') Doc.change(doc, 'Dupliquer la tuile', () => { doc.current = Doc.addTile(doc, t.frames.map((f) => f.slice()), Doc.uniqueName(doc, t.name.replace(/-\d+$/, '')), i + 1, t.duration); });
        else if (a.action === 'supprimer') {
          if (doc.tiles.length === 1) throw new Error('C\'est la dernière tuile : un jeu en garde au moins une.');
          Doc.change(doc, 'Supprimer la tuile', () => { Doc.removeTile(doc, i); doc.current = clamp(i, 0, doc.tiles.length - 1); });
        } else if (a.action === 'vider') Doc.change(doc, 'Vider la tuile', () => { const tt = Doc.tileForEdit(doc, i); tt.frames = tt.frames.map((f) => new Uint8ClampedArray(f.length)); Doc.touch(tt); });
        else if (transform) {
          Doc.change(doc, a.action.replace(/_/g, ' '), () => { for (const kind of transform) Doc.transformTile(doc, i, Doc.TRANSFORMS[kind]); });
        } else throw new Error(`Action inconnue : ${a.action}`);
        App.refresh();
        return `Fait. Il y a maintenant ${doc.tiles.length} tuiles.`;
      },
    },
    poser_tuiles: {
      icone: 'symbol-array',
      libelle: (a) => `Pose la tuile ${a.tuile} sur la carte (${a.largeur || 1} × ${a.hauteur || 1} cases)`,
      description: 'Remplit un rectangle de cases de la carte avec une tuile. x, y : case en haut à gauche (0, 0 = coin en haut à gauche) ; largeur, hauteur en cases (1 par défaut) ; tuile : numéro (-1 pour effacer) ; calque : numéro ou nom (Sol, Décor), sinon le calque choisi.',
      schema: { type: 'object', properties: { tuile: nombre, x: nombre, y: nombre, largeur: nombre, hauteur: nombre, calque: { type: ['string', 'number'] } }, required: ['tuile', 'x', 'y'] },
      faire: (a) => {
        const doc = besoinJeu();
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
    ecrire_carte: {
      icone: 'symbol-array',
      libelle: (a) => `Écrit ${a.lignes?.length || 0} rangée(s) de la carte`,
      description: 'Écrit plusieurs cases d\'un coup : lignes = une chaîne par rangée, avec les numéros de tuile séparés par des espaces (« . » = vide, « _ » = ne pas toucher). x, y : où commence la première case (0, 0 par défaut) ; calque : numéro ou nom, sinon le calque choisi.',
      schema: { type: 'object', properties: { lignes: lignesSchema, x: nombre, y: nombre, calque: { type: ['string', 'number'] } }, required: ['lignes'] },
      faire: (a) => {
        const doc = besoinJeu();
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
      description: 'Change la taille de la carte (en cases). Les cases existantes restent en place, depuis le coin en haut à gauche.',
      schema: { type: 'object', properties: { largeur: nombre, hauteur: nombre }, required: ['largeur', 'hauteur'] },
      faire: (a) => {
        const doc = besoinJeu();
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
      description: 'Exporte la carte en image PNG dans le dossier du projet (chemin relatif, en .png ; echelle 1 à 4).',
      schema: { type: 'object', properties: { chemin: { type: 'string' }, echelle: nombre }, required: ['chemin'] },
      faire: async (a) => {
        const doc = besoinJeu();
        if (!/\.png$/i.test(a.chemin)) throw new Error('Le fichier doit finir par .png.');
        const c = IO.mapCanvas(doc, clamp(Math.round(a.echelle || 1), 1, 4));
        const chemin = await window.claude.ecrireFichier(a.chemin, await IO.canvasBytes(c));
        return `Carte exportée : ${chemin} (${c.width} × ${c.height} px).`;
      },
    },
    enregistrer: {
      icone: 'save',
      libelle: () => 'Enregistre le jeu de tuiles',
      description: 'Enregistre le jeu de tuiles (comme Ctrl+S). Si le jeu n\'a pas encore de fichier, Tafl demande à Ragna où l\'enregistrer.',
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
})();
