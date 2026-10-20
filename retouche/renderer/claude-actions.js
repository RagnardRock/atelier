// Ce que Claude peut faire dans Skald (panneau Claude, ../commun/claude-panneau.js).
//
// Chaque action est décrite pour Claude (description, paramètres) et faite ici, dans la fenêtre,
// avec les mêmes fonctions que les menus : tout passe par change() et s'annule avec Ctrl+Z.
// Les actions « lecture » (voir, infos) ne demandent pas la permission ; les autres affichent la
// carte Autoriser / Refuser du panneau avant de s'exécuter.

(() => {
  const besoinImage = () => {
    const doc = App.doc();
    if (!doc) throw new Error('Aucune image ouverte dans Skald. Ouvre-en une (action ouvrir) ou crée-en une (nouvelle_image).');
    return doc;
  };
  const typeCalque = (l) => (l.adjust ? `réglage (${l.adjust.type})` : l.fill ? `remplissage (${l.fill.type})` : l.text ? 'texte' : 'pixels');
  // Les calques sont numérotés du bas (0) vers le haut, comme dans doc.layers.
  const calqueNumero = (doc, index) => {
    if (index === undefined || index === null) return activeLayer(doc);
    const l = doc.layers[Number(index)];
    if (!l) throw new Error(`Pas de calque n° ${index} (il y en a ${doc.layers.length}, numérotés de 0 en bas à ${doc.layers.length - 1} en haut).`);
    return l;
  };
  const decrire = (doc) => {
    const active = activeLayer(doc);
    const lignes = [
      `Image « ${doc.name} » : ${doc.width} × ${doc.height} px${doc.path ? `, fichier ${doc.path}` : ', jamais enregistrée'}${doc.dirty ? ', modifiée' : ''}.`,
      `Calques (du bas, n° 0, vers le haut) :`,
      ...doc.layers.map((l, i) => `- n° ${i} « ${l.name} » : ${typeCalque(l)}, ${l.visible ? 'visible' : 'masqué'}, opacité ${Math.round(l.opacity * 100)} %${l.blend && l.blend !== 'source-over' ? `, fusion ${l.blend}` : ''}${l.text ? `, texte « ${l.text.content.slice(0, 60)} » (${l.text.font}, ${l.text.size} px, ${l.text.color})` : ''}, position ${l.x}, ${l.y}, taille ${l.canvas.width} × ${l.canvas.height}${l === active ? ' (calque actif)' : ''}`),
      doc.selection ? `Sélection : ${doc.selection.w} × ${doc.selection.h} px en ${doc.selection.x}, ${doc.selection.y}.` : 'Pas de sélection.',
    ];
    return lignes.join('\n');
  };
  const nombre = { type: 'number' };
  const pixels = (description) => ({ type: 'number', description });

  const REGLAGES = {
    luminosite_couleurs: [Ops.colors, 'brightness (-100 à 100), contrast (-100 à 100), saturation (-100 à 100), hue (-180 à 180°)'],
    flou: [Ops.blur, 'radius (0 à 100 px)'],
    nettete: [Ops.sharpen, 'amount (0 à 300 %), radius (0.5 à 10 px)'],
    noir_et_blanc: [Ops.grayscale, 'aucune valeur'],
    inverser: [Ops.invert, 'aucune valeur'],
    retirer_couleur: [Ops.removeColor, 'color (#rrggbb, par défaut celle du coin en haut à gauche), tolerance (0 à 100 %), softness (0 à 100 %), edges (true : seulement le fond relié aux bords)'],
    teinte_unie: [Ops.recolor, 'color (#rrggbb), strength (0 à 100 %)'],
    contour: [Ops.outline, 'color (#rrggbb), width (1 à 100 px), opacity (1 à 100 %)'],
    ombre: [Ops.shadow, 'color (#rrggbb), opacity (0 à 100 %), distance (0 à 200 px), angle (-180 à 180°), blur (0 à 150 px)'],
  };


  const pointsSchema = { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '[[x, y], [x, y], …] en px de l\'image' };
  const MODES_SELECTION = { nouvelle: 'new', ajouter: 'add', retirer: 'subtract', intersection: 'intersect' };
  // Ce que les outils reçoivent d'un vrai clic : aucune touche enfoncée, bouton gauche.
  const EVENEMENT = { altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, button: 0, preventDefault() {} };
  const point = (x, y) => {
    if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) throw new Error('Il faut x et y (en px de l\'image).');
    return { x: Number(x), y: Number(y), sx: 0, sy: 0 };
  };
  const lirePoints = (liste, min = 1) => {
    if (!Array.isArray(liste) || liste.length < min) throw new Error(`Il faut au moins ${min} point(s) : [[x, y], …].`);
    return liste.map((p) => (Array.isArray(p) ? point(p[0], p[1]) : point(p?.x, p?.y)));
  };
  // Les réglages d'un outil (taille, opacité…) changés le temps d'une action, puis remis comme avant.
  async function avecReglages(outil, valeurs, fn) {
    const reglages = Tools.settings[outil];
    const avant = { ...reglages };
    for (const [k, v] of Object.entries(valeurs)) if (v !== undefined && v !== null) reglages[k] = typeof avant[k] === 'number' ? Number(v) : v;
    try { return await fn(); } finally { Object.assign(reglages, avant); }
  }
  // Les couleurs principale / secondaire changées le temps d'une action.
  async function avecCouleurs(principale, secondaire, fn) {
    const avant = { ...App.colors };
    if (principale) App.colors.primary = couleur(principale);
    if (secondaire) App.colors.secondary = couleur(secondaire);
    try { return await fn(); } finally { Object.assign(App.colors, avant); }
  }
  const couleur = (c) => {
    const v = String(c).trim();
    if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`Couleur « ${c} » : écris-la en #rrggbb.`);
    return v.toLowerCase();
  };
  const besoinPixels = (doc, index) => {
    const l = calqueNumero(doc, index);
    if (!l) throw new Error('Ajoute d\'abord un calque.');
    if (!l.visible) throw new Error(`Le calque « ${l.name} » est masqué : affiche-le d\'abord.`);
    return l;
  };

  // --- Les menus de Skald, pour l'action menu ---
  const normal = (t) => String(t).toLowerCase().replace(/…|\.\.\./g, '').replace(/\s+/g, ' ').trim();
  const SOUS_MENU = 'Calque de remplissage ou de réglage';
  function lignesMenus() {
    const lignes = [];
    for (const [menu, items] of Object.entries(App.menus)) {
      for (const item of items()) {
        if (!Array.isArray(item)) continue;
        const [libelle, touches, run] = item;
        if (libelle.startsWith('Nouveau calque de remplissage ou de réglage')) continue; // le sous-menu, juste après
        lignes.push({ menu, libelle, touches, run });
      }
      if (menu === 'Calque') for (const [libelle, touches, run] of Adjust.menuItems().filter(Array.isArray)) lignes.push({ menu: SOUS_MENU, libelle, touches, run });
    }
    return lignes;
  }
  function ligneMenu(chemin) {
    const parts = String(chemin).split(/\s+[›>]\s+|\s*›\s*/).filter(Boolean);
    const libelle = normal(parts.pop() || '');
    const menu = parts.length ? normal(parts.join(' ')) : null;
    const lignes = lignesMenus().filter((l) => !menu || normal(l.menu) === menu || (menu === 'calque' && l.menu === SOUS_MENU));
    const trouvees = lignes.filter((l) => normal(l.libelle) === libelle);
    const ligne = trouvees[0] || (() => { const p = lignes.filter((l) => normal(l.libelle).includes(libelle)); return p.length === 1 ? p[0] : null; })();
    if (!ligne) throw new Error(`Pas de commande « ${chemin} » dans les menus. Regarde la liste avec l'action menus.`);
    return ligne;
  }
  const decrireFenetres = (fenetres) => fenetres.map((f) => (f.question
    ? `Question « ${f.titre} » : ${f.question} → ${f.reponse}`
    : `Fenêtre « ${f.titre} »${f.erreur ? ` (non validée : ${f.erreur})` : ''} :\n${f.champs.map((c) => `  - ${c.cle} : ${c.libelle} (${c.type}${c.choix ? ` : ${c.choix.join(', ')}` : ''}${c.min !== undefined ? `, ${c.min} à ${c.max}${c.unite ? ` ${c.unite}` : ''}` : ''})${f.valeurs ? ` = ${JSON.stringify(f.valeurs[c.cle])}` : ''}`).join('\n')}`)).join('\n');

  ClaudePanneau.actions({
    voir_image: {
      lecture: true,
      icone: 'eye',
      libelle: () => 'Regarde l\'image ouverte',
      description: 'Montre une capture de l\'image ouverte dans Skald (tous les calques visibles fusionnés), avec sa taille et ses calques. À utiliser avant et après une modification.',
      faire: () => {
        const doc = besoinImage();
        return { texte: decrire(doc), image: flatten(doc) };
      },
    },
    voir_calque: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Regarde le calque ${a.index ?? 'actif'}`,
      description: 'Montre un seul calque (son contenu, sans les autres). index : numéro du calque (0 = en bas) ; sans index, le calque actif.',
      schema: { type: 'object', properties: { index: nombre } },
      faire: (a) => {
        const doc = besoinImage();
        const l = calqueNumero(doc, a.index);
        return { texte: `Calque « ${l.name} » (${typeCalque(l)}), ${l.canvas.width} × ${l.canvas.height} px en ${l.x}, ${l.y}.`, image: l.canvas };
      },
    },
    infos: {
      lecture: true,
      icone: 'info',
      libelle: () => 'Regarde les images ouvertes et leurs calques',
      description: 'Liste les images ouvertes dans Skald, et décrit celle qui est affichée : taille, fichier, calques, sélection.',
      faire: () => {
        const docs = App.docs;
        if (!docs.length) return 'Aucune image ouverte.';
        return [`Images ouvertes : ${docs.map((d) => `« ${d.name} »${d === App.doc() ? ' (affichée)' : ''}`).join(', ')}.`, '', App.doc() ? decrire(App.doc()) : ''].join('\n');
      },
    },
    nouvelle_image: {
      icone: 'new-file',
      libelle: (a) => `Crée une image de ${a.largeur} × ${a.hauteur} px`,
      description: 'Crée une nouvelle image vide dans un nouvel onglet.',
      schema: { type: 'object', properties: { largeur: nombre, hauteur: nombre, fond: { type: 'string', description: '« transparent » (par défaut) ou une couleur #rrggbb' }, nom: { type: 'string' } }, required: ['largeur', 'hauteur'] },
      faire: (a) => {
        const w = Math.round(a.largeur), h = Math.round(a.hauteur);
        if (!(w >= 1 && h >= 1 && w <= 30000 && h <= 30000)) throw new Error('Largeur et hauteur entre 1 et 30000 px.');
        const canvas = newCanvas(w, h);
        const fond = a.fond && a.fond !== 'transparent' ? a.fond : null;
        if (fond) { const g = canvas.getContext('2d'); g.fillStyle = fond; g.fillRect(0, 0, w, h); }
        App.openDocument(createDocument({ name: a.nom || 'Sans titre', width: w, height: h, layers: [createLayer(fond ? 'Fond' : 'Calque 1', canvas)] }));
        return `Image « ${a.nom || 'Sans titre'} » de ${w} × ${h} px créée.`;
      },
    },
    ouvrir: {
      icone: 'folder-opened',
      libelle: (a) => `Ouvre ${a.chemin}`,
      description: 'Ouvre une image du dossier du projet (PSD, PNG, JPEG, WebP, SVG, GIF…) dans un nouvel onglet. chemin : relatif au dossier du projet.',
      schema: { type: 'object', properties: { chemin: { type: 'string' } }, required: ['chemin'] },
      faire: async (a) => {
        const fichier = await window.claude.lireFichier(a.chemin);
        App.openDocument(await IO.decode(fichier));
        return `${fichier.name} ouvert.`;
      },
    },
    redimensionner: {
      icone: 'screen-full',
      libelle: (a) => (a.pourcentage ? `Redimensionne l'image à ${a.pourcentage} %` : `Redimensionne l'image en ${a.largeur ?? 'auto'} × ${a.hauteur ?? 'auto'} px`),
      description: 'Change la taille de toute l\'image (tous les calques). Donne pourcentage, ou largeur et/ou hauteur en px (avec une seule des deux, les proportions sont gardées).',
      schema: { type: 'object', properties: { largeur: nombre, hauteur: nombre, pourcentage: nombre } },
      faire: (a) => {
        const doc = besoinImage();
        let w = a.largeur, h = a.hauteur;
        if (a.pourcentage) { w = (doc.width * a.pourcentage) / 100; h = (doc.height * a.pourcentage) / 100; }
        else if (w && !h) h = (w * doc.height) / doc.width;
        else if (h && !w) w = (h * doc.width) / doc.height;
        w = Math.round(w); h = Math.round(h);
        if (!(w >= 1 && h >= 1 && w <= 30000 && h <= 30000)) throw new Error('Donne une largeur, une hauteur ou un pourcentage valables.');
        change(doc, 'Taille de l\'image', (d) => Ops.scaleDocument(d, w, h));
        View.fit(doc);
        return `Image redimensionnée en ${w} × ${h} px.`;
      },
    },
    zone_de_travail: {
      icone: 'symbol-ruler',
      libelle: (a) => `Change la zone de travail en ${a.largeur} × ${a.hauteur} px`,
      description: 'Ajoute ou retire de l\'espace autour de l\'image, sans la redimensionner. ancre : où reste l\'image (tl, t, tr, l, c, r, bl, b, br ; c par défaut).',
      schema: { type: 'object', properties: { largeur: nombre, hauteur: nombre, ancre: { type: 'string' } }, required: ['largeur', 'hauteur'] },
      faire: (a) => {
        const doc = besoinImage();
        const w = Math.round(a.largeur), h = Math.round(a.hauteur), ancre = a.ancre || 'c';
        if (!(w >= 1 && h >= 1 && w <= 30000 && h <= 30000)) throw new Error('Largeur et hauteur entre 1 et 30000 px.');
        const dx = ancre.includes('l') ? 0 : ancre.includes('r') ? w - doc.width : Math.round((w - doc.width) / 2);
        const dy = ancre.startsWith('t') ? 0 : ancre.startsWith('b') ? h - doc.height : Math.round((h - doc.height) / 2);
        change(doc, 'Taille de la zone de travail', (d) => {
          for (const l of d.layers) { l.x += dx; l.y += dy; }
          d.width = w; d.height = h; d.selection = null;
        });
        View.fit(doc);
        return `Zone de travail : ${w} × ${h} px.`;
      },
    },
    recadrer: {
      icone: 'screen-normal',
      libelle: (a) => `Recadre sur ${a.largeur} × ${a.hauteur} px en ${a.x}, ${a.y}`,
      description: 'Garde seulement un rectangle de l\'image (x, y : coin en haut à gauche, en px).',
      schema: { type: 'object', properties: { x: nombre, y: nombre, largeur: nombre, hauteur: nombre }, required: ['x', 'y', 'largeur', 'hauteur'] },
      faire: (a) => {
        const doc = besoinImage();
        const r = { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.largeur), h: Math.round(a.hauteur) };
        if (!(r.w >= 1 && r.h >= 1)) throw new Error('Largeur et hauteur d\'au moins 1 px.');
        change(doc, 'Recadrer', (d) => {
          for (const l of d.layers) { cropLayerTo(l, r); l.x -= r.x; l.y -= r.y; }
          d.width = r.w; d.height = r.h; d.selection = null;
        });
        View.fit(doc);
        return `Image recadrée à ${r.w} × ${r.h} px.`;
      },
    },
    rogner_vide: {
      icone: 'screen-normal',
      libelle: () => 'Retire les bords transparents',
      description: 'Retire les bords entièrement transparents autour de l\'image.',
      faire: () => {
        const doc = besoinImage();
        const avant = `${doc.width} × ${doc.height}`;
        Ops.trim();
        return `Avant : ${avant} px, maintenant : ${doc.width} × ${doc.height} px.`;
      },
    },
    retoucher: {
      icone: 'color-mode',
      libelle: (a) => `Applique « ${String(a.reglage || '').replace(/_/g, ' ')} » au calque`,
      description: `Applique une retouche au calque actif (ou au calque index), seulement dans la sélection s'il y en a une. reglage et ses valeurs (toutes facultatives) :\n${Object.entries(REGLAGES).map(([k, [, v]]) => `- ${k} : ${v}`).join('\n')}`,
      schema: { type: 'object', properties: { reglage: { type: 'string', enum: Object.keys(REGLAGES) }, valeurs: { type: 'object' }, index: nombre }, required: ['reglage'] },
      faire: async (a) => {
        const doc = besoinImage();
        const r = REGLAGES[a.reglage];
        if (!r) throw new Error(`Retouche inconnue : ${a.reglage}`);
        const l = calqueNumero(doc, a.index);
        if (Adjust.isSpecial(l)) throw new Error(`Le calque « ${l.name} » est un calque de réglage ou de remplissage : il n'a pas de pixels.`);
        doc.activeId = l.id;
        await Ops.avecValeurs(a.valeurs, r[0]);
        return `« ${a.reglage.replace(/_/g, ' ')} » appliqué au calque « ${l.name} ».`;
      },
    },
    calque: {
      icone: 'layers',
      libelle: (a) => `Calque : ${String(a.action || '').replace(/_/g, ' ')}${a.index !== undefined ? ` (n° ${a.index})` : ''}`,
      description: `Agit sur les calques. action : nouveau (vide, au-dessus de l'actif), dupliquer, supprimer, fusionner_dessous, aplatir (tout fusionner), choisir (devient l'actif), renommer (nom), afficher, masquer, opacite (opacite 0 à 100), mode_fusion (fusion : ${BLEND_MODES.map(([v, l]) => `${v} = ${l}`).join(', ')}), deplacer (x, y : nouvelle position du coin en haut à gauche, ou dx, dy : décalage en px), monter, descendre. index : numéro du calque (0 = en bas), sinon le calque actif. Le reste (centrer, miroir, transformer, pixelliser…) est dans le menu Calque (action menu).`,
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['nouveau', 'dupliquer', 'supprimer', 'fusionner_dessous', 'aplatir', 'choisir', 'renommer', 'afficher', 'masquer', 'opacite', 'mode_fusion', 'deplacer', 'monter', 'descendre'] }, index: nombre, nom: { type: 'string' }, opacite: nombre, fusion: { type: 'string', enum: BLEND_MODES.map(([v]) => v) }, x: nombre, y: nombre, dx: nombre, dy: nombre }, required: ['action'] },
      faire: (a) => {
        const doc = besoinImage();
        const l = calqueNumero(doc, a.index);
        if (l) doc.activeId = l.id;
        switch (a.action) {
          case 'nouveau': Ops.insertLayer(doc, createLayer(a.nom || `Calque ${doc.layers.length + 1}`, newCanvas(doc.width, doc.height)), 'Nouveau calque'); break;
          case 'dupliquer': Ops.duplicateLayer(); break;
          case 'supprimer':
            if (doc.layers.length === 1) throw new Error('C\'est le dernier calque : une image en garde au moins un.');
            Ops.deleteLayer(l.id); break;
          case 'fusionner_dessous': Ops.mergeDown(); break;
          case 'aplatir': Ops.flattenImage(); break;
          case 'choisir': App.refresh(); break;
          case 'renommer': change(doc, 'Renommer le calque', () => { l.name = String(a.nom || l.name); }); break;
          case 'afficher': case 'masquer': change(doc, a.action === 'afficher' ? 'Afficher le calque' : 'Masquer le calque', () => { l.visible = a.action === 'afficher'; }); break;
          case 'opacite': change(doc, 'Opacité du calque', () => { l.opacity = Math.min(1, Math.max(0, Number(a.opacite) / 100)); }); break;
          case 'mode_fusion':
            if (!BLEND_MODES.some(([v]) => v === a.fusion)) throw new Error(`Mode de fusion inconnu : ${a.fusion}`);
            change(doc, 'Mode de fusion', () => { l.blend = a.fusion; }); break;
          case 'deplacer': change(doc, 'Déplacer le calque', () => {
            l.x = Math.round(a.x ?? l.x + (Number(a.dx) || 0));
            l.y = Math.round(a.y ?? l.y + (Number(a.dy) || 0));
          }); break;
          case 'monter': Ops.moveLayer(1); break;
          case 'descendre': Ops.moveLayer(-1); break;
          default: throw new Error(`Action inconnue : ${a.action}`);
        }
        return decrire(doc);
      },
    },
    selection: {
      icone: 'selection',
      libelle: (a) => `Sélection : ${a.action}${a.mode && a.mode !== 'nouvelle' ? ` (${a.mode})` : ''}`,
      description: 'Change la sélection. action : tout, rien, inverser, calque (les pixels non transparents du calque actif), rectangle ou ellipse (x, y, largeur, hauteur en px), polygone (points : [[x, y], …], comme le lasso), baguette (x, y : clique avec la baguette magique ; tolerance 0 à 100, continu, tous_calques). mode (rectangle, ellipse, polygone, baguette) : nouvelle (par défaut), ajouter, retirer, intersection. Pour un contour progressif ou étendre / réduire : action menu (Sélection › …).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['tout', 'rien', 'inverser', 'calque', 'rectangle', 'ellipse', 'polygone', 'baguette'] }, mode: { type: 'string', enum: ['nouvelle', 'ajouter', 'retirer', 'intersection'] }, x: nombre, y: nombre, largeur: nombre, hauteur: nombre, points: pointsSchema, tolerance: nombre, continu: { type: 'boolean' }, tous_calques: { type: 'boolean' } }, required: ['action'] },
      faire: (a) => {
        const doc = besoinImage();
        const mode = MODES_SELECTION[a.mode || 'nouvelle'];
        if (!mode) throw new Error(`Mode inconnu : ${a.mode}`);
        const poser = (forme) => {
          const avant = doc.selection;
          change(doc, 'Sélection', (d) => { d.selection = Sel.combine(d, avant, forme, mode); });
        };
        if (a.action === 'tout') Ops.selectAll();
        else if (a.action === 'rien') Ops.deselect();
        else if (a.action === 'inverser') Ops.invertSelection();
        else if (a.action === 'calque') Ops.selectLayerPixels();
        else if (a.action === 'rectangle' || a.action === 'ellipse') {
          const forme = a.action === 'rectangle' ? Sel.rect : Sel.ellipse;
          poser(forme(Math.round(a.x), Math.round(a.y), Math.round(a.largeur), Math.round(a.hauteur)));
        } else if (a.action === 'polygone') {
          const forme = Sel.polygon(doc, lirePoints(a.points, 3));
          if (!forme) throw new Error('Le polygone ne couvre aucun pixel de l\'image.');
          poser(forme);
        } else if (a.action === 'baguette') {
          avecReglages('wand', { tolerance: a.tolerance, contiguous: a.continu, sampleAll: a.tous_calques, mode }, () => Tools.byId.wand.down(doc, point(a.x, a.y), EVENEMENT));
        } else throw new Error(`Action inconnue : ${a.action}`);
        return doc.selection ? `Sélection : ${doc.selection.w} × ${doc.selection.h} px en ${doc.selection.x}, ${doc.selection.y}${doc.selection.rect ? '' : ' (forme libre)'}.` : 'Plus de sélection.';
      },
    },
    exporter: {
      icone: 'export',
      libelle: (a) => `Exporte l'image vers ${a.chemin}`,
      description: 'Exporte l\'image (calques visibles fusionnés) dans le dossier du projet. chemin : relatif au dossier du projet, avec l\'extension .png, .webp, .jpg ou .ico. Facultatif : qualite (1 à 100, JPEG et WebP), echelle (en %), rogner (true : retire les bords transparents), fond (#rrggbb, pour le JPEG).',
      schema: { type: 'object', properties: { chemin: { type: 'string' }, qualite: nombre, echelle: nombre, rogner: { type: 'boolean' }, fond: { type: 'string' } }, required: ['chemin'] },
      faire: async (a) => {
        const doc = besoinImage();
        const ext = String(a.chemin).split('.').pop().toLowerCase();
        const format = { png: 'png', webp: 'webp', jpg: 'jpeg', jpeg: 'jpeg', ico: 'ico' }[ext];
        if (!format) throw new Error('Extension .png, .webp, .jpg ou .ico.');
        let canvas = flatten(doc);
        if (a.rogner) {
          const b = opaqueBounds(canvas);
          if (b) { const piece = newCanvas(b.w, b.h); piece.getContext('2d').drawImage(canvas, -b.x, -b.y); canvas = piece; }
        }
        if (a.echelle && a.echelle !== 100) canvas = Ops.resample(canvas, (canvas.width * a.echelle) / 100, (canvas.height * a.echelle) / 100);
        const bytes = await IO.encode(canvas, format, a.qualite || App.config.exportQuality || 90, a.fond || '#ffffff');
        const chemin = await window.claude.ecrireFichier(a.chemin, bytes);
        return `Exporté : ${chemin} (${canvas.width} × ${canvas.height} px, ${IO.formatSize(bytes.length)}).`;
      },
    },
    enregistrer: {
      icone: 'save',
      libelle: () => 'Enregistre l\'image',
      description: 'Enregistre l\'image dans son fichier (comme Ctrl+S). Seulement pour une image qui a déjà un fichier ; sinon, utilise exporter.',
      faire: async () => {
        const doc = besoinImage();
        if (!doc.path) throw new Error('Cette image n\'a pas encore de fichier : utilise exporter, ou demande à Ragna de l\'enregistrer.');
        await IO.save(doc);
        return doc.dirty ? 'L\'enregistrement n\'a pas été fait (Ragna a peut-être annulé).' : `Enregistré dans ${doc.path}.`;
      },
    },
    annuler: {
      icone: 'discard',
      libelle: () => 'Annule la dernière modification',
      description: 'Annule la dernière modification de l\'image (comme Ctrl+Z).',
      faire: () => {
        const doc = besoinImage();
        if (!doc.undo.length) return 'Rien à annuler.';
        const label = doc.undo[doc.undo.length - 1].label;
        undo(doc);
        return `Annulé : ${label}.`;
      },
    },
  });
  // --- Tout le reste : les menus, les outils de dessin, les couleurs, les onglets ---
  ClaudePanneau.actions({
    menus: {
      lecture: true,
      icone: 'list-flat',
      libelle: () => 'Regarde les menus de Skald',
      description: 'Liste toutes les commandes des menus de Skald (Fichier, Édition, Sélection, Image, Calque, Couleurs, Logo, Affichage, et les calques de remplissage ou de réglage), avec leur raccourci. Une commande qui finit par « … » ouvre une fenêtre de réglages : champs_menu en donne les champs. Lance-les avec l\'action menu.',
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
      description: 'Donne les champs de la fenêtre qu\'ouvre une commande de menu qui finit par « … » (clé, type, choix possibles, bornes, valeur par défaut), sans rien changer : la fenêtre s\'ouvre et s\'annule aussitôt. commande : « Menu › Commande », par exemple « Couleurs › Niveaux… ».',
      schema: { type: 'object', properties: { commande: { type: 'string' } }, required: ['commande'] },
      faire: async (a) => {
        const ligne = ligneMenu(a.commande);
        if (!ligne.libelle.endsWith('…') || ligne.menu === 'Fichier') throw new Error(`« ${ligne.libelle} » n'a pas de fenêtre de réglages à lire ici : lance-la directement avec l'action menu.`);
        const { fenetres } = await Dialogs.automatique({ apercu: true }, () => ligne.run());
        return fenetres.length ? decrireFenetres(fenetres) : 'Cette commande n\'a pas ouvert de fenêtre (il faut peut-être d\'abord une image, un calque de pixels ou une sélection).';
      },
    },
    menu: {
      icone: 'play',
      libelle: (a) => `Lance « ${a.commande} »${a.valeurs && Object.keys(a.valeurs).length ? ` (${Object.entries(Array.isArray(a.valeurs) ? a.valeurs[0] || {} : a.valeurs).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`,
      description: 'Lance une commande des menus de Skald, comme si Ragna cliquait dessus (liste : action menus). commande : « Menu › Commande » (› ou >), par exemple « Image › Rotation 90° horaire » ou « Calque de remplissage ou de réglage › Niveaux… ». Si elle ouvre une fenêtre de réglages, elle se remplit avec valeurs (les clés de champs_menu ; les champs non donnés gardent leur valeur par défaut) et se valide toute seule ; s\'il y a plusieurs fenêtres à la suite, donne une liste d\'objets. choix : le bouton à prendre si une question s\'affiche (sinon le bouton principal). Les commandes qui demandent un fichier ou un dossier (Ouvrir, Enregistrer sous, Exporter…) ouvrent la fenêtre de Windows pour Ragna : préfère les actions ouvrir, exporter, enregistrer_sous et pack_icones. Ça s\'annule avec annuler.',
      schema: { type: 'object', properties: { commande: { type: 'string' }, valeurs: { type: ['object', 'array'] }, choix: { type: 'string' } }, required: ['commande'] },
      faire: async (a) => {
        const ligne = ligneMenu(a.commande);
        const doc = App.doc();
        const avant = doc?.undo.length;
        const { fenetres } = await Dialogs.automatique({ valeurs: a.valeurs, choix: a.choix }, () => ligne.run());
        const apres = App.doc();
        const fait = apres !== doc || (apres && apres.undo.length !== avant);
        const lignes = [`${ligne.menu} › ${ligne.libelle} : ${fenetres.some((f) => f.erreur) ? 'pas fait.' : fait ? 'fait.' : 'lancé (rien n\'a changé dans l\'image : vérifie avec voir_image).'}`];
        if (fenetres.length) lignes.push(decrireFenetres(fenetres));
        if (apres) lignes.push('', decrire(apres));
        return lignes.join('\n');
      },
    },
    peindre: {
      icone: 'edit',
      libelle: (a) => `${a.outil === 'gomme' ? 'Gomme' : a.outil === 'tampon' ? 'Tampon' : 'Pinceau'} : trait de ${(a.points || []).length} point(s)`,
      description: 'Trace un trait avec le pinceau, la gomme ou le tampon de duplication, sur le calque actif (ou index), dans la sélection s\'il y en a une. points : le trajet [[x, y], …] (un seul point = une touche). taille (1 à 500 px), durete (0 à 100), opacite (1 à 100), couleur (#rrggbb, pinceau ; sinon la couleur principale). Tampon : source [x, y] = l\'endroit recopié au premier point. Sur un calque de réglage ou de remplissage, le pinceau peint son masque (blanc montre l\'effet, noir le cache).',
      schema: { type: 'object', properties: { outil: { type: 'string', enum: ['pinceau', 'gomme', 'tampon'] }, points: pointsSchema, taille: nombre, durete: nombre, opacite: nombre, couleur: { type: 'string' }, source: { type: 'array', items: nombre }, tous_calques: { type: 'boolean' }, index: nombre }, required: ['points'] },
      faire: async (a) => {
        const doc = besoinImage();
        const id = { pinceau: 'brush', gomme: 'eraser', tampon: 'clone' }[a.outil || 'pinceau'];
        if (!id) throw new Error(`Outil inconnu : ${a.outil}`);
        const l = besoinPixels(doc, a.index);
        doc.activeId = l.id;
        const pts = lirePoints(a.points);
        const tool = Tools.byId[id];
        if (id === 'clone') {
          const src = lirePoints([a.source || []])[0];
          doc.cloneSource = { x: src.x, y: src.y, fresh: true };
        }
        await avecCouleurs(a.couleur, null, () => avecReglages(id, { size: a.taille, hardness: a.durete, opacity: a.opacite, sampleAll: a.tous_calques }, () => {
          tool.down(doc, pts[0], EVENEMENT);
          if (!doc.stroke) throw new Error('Le trait n\'a pas pu commencer sur ce calque.');
          for (const p of pts.slice(1)) tool.move(doc, p, EVENEMENT);
          tool.up(doc, pts[pts.length - 1], EVENEMENT);
        }));
        App.refresh();
        return `Trait posé sur « ${l.name} ».`;
      },
    },
    remplir: {
      icone: 'paintcan',
      libelle: (a) => `Pot de peinture en ${a.x}, ${a.y}`,
      description: 'Pot de peinture : remplit la zone de couleur proche du point (x, y) sur le calque actif (ou index), dans la sélection s\'il y en a une. couleur (#rrggbb, sinon la principale), tolerance (0 à 100), opacite (1 à 100), continu (true : seulement la zone reliée ; false : partout où la couleur est proche). Pour remplir toute la sélection : menu « Édition › Remplir avec la couleur principale ».',
      schema: { type: 'object', properties: { x: nombre, y: nombre, couleur: { type: 'string' }, tolerance: nombre, opacite: nombre, continu: { type: 'boolean' }, index: nombre }, required: ['x', 'y'] },
      faire: async (a) => {
        const doc = besoinImage();
        const l = besoinPixels(doc, a.index);
        if (Adjust.isSpecial(l)) throw new Error(`« ${l.name} » est un calque de réglage ou de remplissage : choisis un calque de pixels.`);
        doc.activeId = l.id;
        const avant = doc.undo.length;
        await avecCouleurs(a.couleur, null, () => avecReglages('fill', { tolerance: a.tolerance, opacity: a.opacite, contiguous: a.continu }, () => Tools.byId.fill.down(doc, point(a.x, a.y), EVENEMENT)));
        return doc.undo.length !== avant ? `Zone remplie sur « ${l.name} ».` : 'Rien n\'a été rempli (point hors de l\'image ou de la sélection).';
      },
    },
    degrade: {
      icone: 'color-mode',
      libelle: (a) => `Dégradé de ${JSON.stringify(a.de)} à ${JSON.stringify(a.a)}`,
      description: 'Trace un dégradé sur le calque actif (ou index), dans la sélection s\'il y en a une : de [x, y] (début) à a [x, y] (fin). type : lineaire ou radial ; couleur1 et couleur2 (#rrggbb ; sans couleur2 ou avec transparent: true, la couleur1 va vers le transparent) ; opacite (1 à 100).',
      schema: { type: 'object', properties: { de: { type: 'array', items: nombre }, a: { type: 'array', items: nombre }, type: { type: 'string', enum: ['lineaire', 'radial'] }, couleur1: { type: 'string' }, couleur2: { type: 'string' }, transparent: { type: 'boolean' }, opacite: nombre, index: nombre }, required: ['de', 'a'] },
      faire: async (a) => {
        const doc = besoinImage();
        const l = besoinPixels(doc, a.index);
        doc.activeId = l.id;
        const [p1, p2] = lirePoints([a.de, a.a], 2);
        const tool = Tools.byId.gradient;
        const versTransparent = a.transparent || !a.couleur2;
        await avecCouleurs(a.couleur1, a.couleur2, () => avecReglages('gradient', { type: a.type === 'radial' ? 'radial' : 'linear', colors: versTransparent ? 'pt' : 'ps', opacity: a.opacite, reverse: false }, () => {
          tool.down(doc, p1, EVENEMENT);
          tool.move(doc, p2, EVENEMENT);
          tool.up(doc, p2, EVENEMENT);
        }));
        return `Dégradé posé sur « ${l.name} ».`;
      },
    },
    forme: {
      icone: 'primitive-square',
      libelle: (a) => `Dessine : ${a.forme}`,
      description: 'Dessine une forme dans un nouveau calque (au-dessus de l\'actif). forme : rectangle, rectangle_arrondi, ellipse, ligne, fleche, polygone, etoile. Pour une forme : x, y, largeur, hauteur (le cadre). Pour ligne et fleche : de [x, y] et a [x, y]. remplir (true par défaut) avec couleur ; contour (false par défaut) avec couleur_contour et epaisseur (1 à 100 px, aussi pour les lignes) ; arrondi (px) ; cotes (3 à 24 : côtés du polygone, branches de l\'étoile).',
      schema: { type: 'object', properties: { forme: { type: 'string', enum: ['rectangle', 'rectangle_arrondi', 'ellipse', 'ligne', 'fleche', 'polygone', 'etoile'] }, x: nombre, y: nombre, largeur: nombre, hauteur: nombre, de: { type: 'array', items: nombre }, a: { type: 'array', items: nombre }, remplir: { type: 'boolean' }, couleur: { type: 'string' }, contour: { type: 'boolean' }, couleur_contour: { type: 'string' }, epaisseur: nombre, arrondi: nombre, cotes: nombre }, required: ['forme'] },
      faire: async (a) => {
        const doc = besoinImage();
        const forme = { rectangle: 'rect', rectangle_arrondi: 'rounded', ellipse: 'ellipse', ligne: 'line', fleche: 'arrow', polygone: 'polygon', etoile: 'star' }[a.forme];
        if (!forme) throw new Error(`Forme inconnue : ${a.forme}`);
        const ligne = forme === 'line' || forme === 'arrow';
        const [p1, p2] = ligne ? lirePoints([a.de, a.a], 2) : [point(a.x, a.y), point(Number(a.x) + Number(a.largeur), Number(a.y) + Number(a.hauteur))];
        const tool = Tools.byId.shape;
        const avant = doc.undo.length;
        await avecCouleurs(a.couleur, a.couleur_contour, () => avecReglages('shape', { shape: forme, fill: a.remplir ?? true, stroke: a.contour ?? false, width: a.epaisseur, radius: a.arrondi, sides: a.cotes }, () => {
          tool.down(doc, p1, EVENEMENT);
          tool.move(doc, p2, EVENEMENT);
          tool.up(doc, p2, EVENEMENT);
        }));
        if (doc.undo.length === avant) throw new Error('La forme est vide (trop petite, ni remplie ni avec contour ?).');
        return decrire(doc);
      },
    },
    texte: {
      icone: 'text-size',
      libelle: (a) => (a.index !== undefined ? `Modifie le texte du calque ${a.index}` : `Écrit « ${String(a.contenu || '').slice(0, 40)} »`),
      description: 'Écrit un texte dans un nouveau calque de texte (x, y : coin en haut à gauche du texte), ou modifie le calque de texte index (seuls les réglages donnés changent). contenu (\\n pour aller à la ligne), police (nom d\'une police installée, par défaut Segoe UI), taille (px), couleur (#rrggbb), gras, italique, alignement (left, center, right), interligne (0.6 à 3), espacement (px entre les lettres).',
      schema: { type: 'object', properties: { contenu: { type: 'string' }, x: nombre, y: nombre, index: nombre, police: { type: 'string' }, taille: nombre, couleur: { type: 'string' }, gras: { type: 'boolean' }, italique: { type: 'boolean' }, alignement: { type: 'string', enum: ['left', 'center', 'right'] }, interligne: nombre, espacement: nombre } },
      faire: async (a) => {
        const doc = besoinImage();
        const cible = a.index !== undefined ? calqueNumero(doc, a.index) : null;
        if (cible && !cible.text) throw new Error(`Le calque « ${cible.name} » n'est pas un calque de texte.`);
        const base = cible?.text || { content: '', font: Tools.lastFont || 'Segoe UI', size: 64, color: App.colors.primary, bold: false, italic: false, align: 'left', lineHeight: 1.2, letterSpacing: 0 };
        const t = { ...base };
        const champs = { contenu: 'content', police: 'font', taille: 'size', couleur: 'color', gras: 'bold', italique: 'italic', alignement: 'align', interligne: 'lineHeight', espacement: 'letterSpacing' };
        for (const [k, cle] of Object.entries(champs)) if (a[k] !== undefined) t[cle] = k === 'couleur' ? couleur(a[k]) : typeof base[cle] === 'number' ? Number(a[k]) : a[k];
        if (!String(t.content).trim()) throw new Error('Il faut un contenu.');
        if (document.fonts && !document.fonts.check(`16px "${t.font}"`)) throw new Error(`La police « ${t.font} » n'est pas installée sur ce PC.`);
        const { canvas, pad } = Tools.renderText(t);
        const nom = t.content.split('\n')[0].slice(0, 40);
        if (cible) {
          change(doc, 'Modifier le texte', () => { cible.canvas = canvas; cible.text = t; cible.name = nom; });
        } else {
          const p = point(a.x ?? 0, a.y ?? 0);
          change(doc, 'Texte', (d) => {
            const l = createLayer(nom, canvas, { x: Math.round(p.x - pad), y: Math.round(p.y - pad), text: t });
            d.layers.splice(d.layers.findIndex((x) => x.id === d.activeId) + 1, 0, l);
            d.activeId = l.id;
          });
        }
        Tools.lastFont = t.font;
        return decrire(doc);
      },
    },
    couleur_pixel: {
      lecture: true,
      icone: 'symbol-color',
      libelle: (a) => `Regarde la couleur en ${a.x}, ${a.y}`,
      description: 'Pipette : la couleur de l\'image (calques visibles) au pixel x, y, et son opacité. Ne change rien.',
      schema: { type: 'object', properties: { x: nombre, y: nombre }, required: ['x', 'y'] },
      faire: (a) => {
        const doc = besoinImage();
        const x = Math.floor(a.x), y = Math.floor(a.y);
        if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) throw new Error(`Le point ${x}, ${y} est hors de l'image (${doc.width} × ${doc.height}).`);
        const [r, g, b, al] = composite(doc).getContext('2d').getImageData(x, y, 1, 1).data;
        return al === 0 ? `Transparent en ${x}, ${y}.` : `${rgbToHex(r, g, b)} en ${x}, ${y} (opacité ${Math.round((al / 255) * 100)} %).`;
      },
    },
    couleurs: {
      icone: 'symbol-color',
      libelle: (a) => `Couleurs : ${[a.principale && `principale ${a.principale}`, a.secondaire && `secondaire ${a.secondaire}`].filter(Boolean).join(', ') || 'regarder'}`,
      description: 'Change la couleur principale et/ou la couleur secondaire de Skald (#rrggbb), celles qu\'utilisent les menus (remplir, contour…) et les outils. Sans paramètre, donne les couleurs actuelles.',
      schema: { type: 'object', properties: { principale: { type: 'string' }, secondaire: { type: 'string' } } },
      faire: (a) => {
        if (a.principale) App.setColor('primary', couleur(a.principale));
        if (a.secondaire) App.setColor('secondary', couleur(a.secondaire));
        return `Principale ${App.colors.primary}, secondaire ${App.colors.secondary}.`;
      },
    },
    regler_calque: {
      icone: 'settings',
      libelle: (a) => `Règle le calque ${a.index ?? 'actif'}`,
      description: 'Change les réglages d\'un calque de remplissage ou de réglage (niveaux, teinte / saturation, couleur unie…), comme un double-clic sur sa vignette. valeurs : les clés de sa fenêtre (la réponse les liste ; pour les connaître avant, champs_menu sur « Calque de remplissage ou de réglage › … »).',
      schema: { type: 'object', properties: { index: nombre, valeurs: { type: 'object' } } },
      faire: async (a) => {
        const doc = besoinImage();
        const l = calqueNumero(doc, a.index);
        if (!Adjust.isSpecial(l)) throw new Error(`« ${l.name} » n'est pas un calque de remplissage ou de réglage.`);
        const { fenetres } = await Dialogs.automatique({ valeurs: a.valeurs || {} }, () => Adjust.edit(l));
        return `${decrireFenetres(fenetres)}\n\n${decrire(doc)}`;
      },
    },
    onglet: {
      icone: 'files',
      libelle: (a) => `${a.action === 'fermer' ? 'Ferme' : 'Affiche'} l'onglet ${a.image ?? ''}`,
      description: 'Les onglets des images ouvertes. action : afficher (l\'image devient celle sur laquelle les autres actions travaillent) ou fermer. image : numéro (0 = le premier onglet) ou nom ; sans, l\'image affichée. Fermer une image modifiée demande sans_enregistrer: true (sinon Skald pose la question à Ragna).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['afficher', 'fermer'] }, image: { type: ['number', 'string'] }, sans_enregistrer: { type: 'boolean' } }, required: ['action'] },
      faire: async (a) => {
        const docs = App.docs;
        if (!docs.length) throw new Error('Aucune image ouverte.');
        let d = App.doc();
        if (a.image !== undefined && a.image !== null) {
          d = typeof a.image === 'number' || /^\d+$/.test(a.image) ? docs[Number(a.image)] : docs.find((x) => x.name.toLowerCase() === String(a.image).toLowerCase());
          if (!d) throw new Error(`Pas d'image « ${a.image} ». Ouvertes : ${docs.map((x, i) => `${i} = ${x.name}`).join(', ')}.`);
        }
        if (a.action === 'afficher') { App.activate(d); return `« ${d.name} » affichée.`; }
        const nom = d.name;
        const ferme = d.dirty && a.sans_enregistrer
          ? (await Dialogs.automatique({ choix: 'discard' }, () => App.closeDocument(d))).resultat
          : await App.closeDocument(d);
        return ferme ? `« ${nom} » fermée.` : `« ${nom} » n'a pas été fermée.`;
      },
    },
    retablir: {
      icone: 'redo',
      libelle: () => 'Rétablit la modification annulée',
      description: 'Rétablit la dernière modification annulée (comme Ctrl+Y).',
      faire: () => {
        const doc = besoinImage();
        if (!doc.redo.length) return 'Rien à rétablir.';
        const label = doc.redo[doc.redo.length - 1].label;
        redo(doc);
        return `Rétabli : ${label}.`;
      },
    },
    enregistrer_sous: {
      icone: 'save-as',
      libelle: (a) => `Enregistre l'image sous ${a.chemin}`,
      description: 'Enregistre l\'image dans un nouveau fichier du dossier du projet, qui devient son fichier (comme Enregistrer sous). chemin relatif au projet : .psd garde les calques ; .png, .jpg, .webp les fusionnent.',
      schema: { type: 'object', properties: { chemin: { type: 'string' } }, required: ['chemin'] },
      faire: async (a) => {
        const doc = besoinImage();
        const ext = String(a.chemin).split('.').pop().toLowerCase();
        if (!['psd', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) throw new Error('Extension .psd, .png, .jpg ou .webp.');
        const bytes = ext === 'psd' ? IO.writePsd(doc) : await IO.encode(flatten(doc), ext === 'jpg' ? 'jpeg' : ext, App.config.exportQuality || 90);
        const chemin = await window.claude.ecrireFichier(a.chemin, bytes);
        doc.path = chemin;
        doc.name = chemin.split(/[\\/]/).pop();
        doc.dirty = false;
        App.refresh();
        return `Enregistré : ${chemin} (${IO.formatSize(bytes.length)}).`;
      },
    },
    pack_icones: {
      icone: 'export',
      libelle: (a) => `Exporte un pack d'icônes dans ${a.dossier || 'le projet'}`,
      description: 'Exporte un pack d\'icônes de l\'image dans un dossier du projet (relatif ; "" = la racine) : favicon.ico (16, 32, 48 px), favicon-16.png, favicon-32.png, apple-touch-icon.png (180), icon-192.png, icon-512.png, plus tailles (ex. [64, 128]). rogner (true par défaut) retire les bords transparents d\'abord ; prefixe devant les noms.',
      schema: { type: 'object', properties: { dossier: { type: 'string' }, tailles: { type: 'array', items: nombre }, rogner: { type: 'boolean' }, prefixe: { type: 'string' } } },
      faire: async (a) => {
        const doc = besoinImage();
        const source = IO.prepareExport(doc, { trim: a.rogner ?? true, scale: 100 });
        const png = (n) => () => IO.encode(IO.squareAt(source, n), 'png');
        const fichiers = [
          ['favicon.ico', () => IO.makeIco(source, [16, 32, 48])],
          ['favicon-16.png', png(16)], ['favicon-32.png', png(32)], ['apple-touch-icon.png', png(180)], ['icon-192.png', png(192)], ['icon-512.png', png(512)],
          ...(a.tailles || []).map(Number).filter((n) => n > 0 && n <= 8192).map((n) => [`icon-${n}.png`, png(n)]),
        ];
        const dossier = String(a.dossier || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const ecrits = [];
        for (const [nom, faire] of fichiers) ecrits.push(await window.claude.ecrireFichier(`${dossier ? `${dossier}/` : ''}${a.prefixe || ''}${nom}`, await faire()));
        return `${ecrits.length} icônes écrites :\n${ecrits.join('\n')}`;
      },
    },
  });
})();
