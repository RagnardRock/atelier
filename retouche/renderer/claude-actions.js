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
      ...doc.layers.map((l, i) => `- n° ${i} « ${l.name} » : ${typeCalque(l)}, ${l.visible ? 'visible' : 'masqué'}, opacité ${Math.round(l.opacity * 100)} %, position ${l.x}, ${l.y}, taille ${l.canvas.width} × ${l.canvas.height}${l === active ? ' (calque actif)' : ''}`),
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
      description: 'Agit sur les calques. action : nouveau (vide, au-dessus de l\'actif), dupliquer, supprimer, fusionner_dessous, aplatir (tout fusionner), choisir (devient l\'actif), renommer (nom), afficher, masquer, opacite (opacite 0 à 100), monter, descendre. index : numéro du calque (0 = en bas), sinon le calque actif.',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['nouveau', 'dupliquer', 'supprimer', 'fusionner_dessous', 'aplatir', 'choisir', 'renommer', 'afficher', 'masquer', 'opacite', 'monter', 'descendre'] }, index: nombre, nom: { type: 'string' }, opacite: nombre }, required: ['action'] },
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
          case 'monter': Ops.moveLayer(1); break;
          case 'descendre': Ops.moveLayer(-1); break;
          default: throw new Error(`Action inconnue : ${a.action}`);
        }
        return decrire(doc);
      },
    },
    selection: {
      icone: 'selection',
      libelle: (a) => `Sélection : ${a.action}`,
      description: 'Change la sélection. action : tout, rien, inverser, rectangle (x, y, largeur, hauteur en px), ellipse (même chose), calque (les pixels non transparents du calque actif).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['tout', 'rien', 'inverser', 'rectangle', 'ellipse', 'calque'] }, x: nombre, y: nombre, largeur: nombre, hauteur: nombre }, required: ['action'] },
      faire: (a) => {
        const doc = besoinImage();
        if (a.action === 'tout') Ops.selectAll();
        else if (a.action === 'rien') Ops.deselect();
        else if (a.action === 'inverser') Ops.invertSelection();
        else if (a.action === 'calque') Ops.selectLayerPixels();
        else if (a.action === 'rectangle' || a.action === 'ellipse') {
          const forme = a.action === 'rectangle' ? Sel.rect : Sel.ellipse;
          change(doc, 'Sélection', (d) => { d.selection = forme(Math.round(a.x), Math.round(a.y), Math.round(a.largeur), Math.round(a.hauteur)); });
        } else throw new Error(`Action inconnue : ${a.action}`);
        return doc.selection ? `Sélection : ${doc.selection.w} × ${doc.selection.h} px en ${doc.selection.x}, ${doc.selection.y}.` : 'Plus de sélection.';
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
})();
