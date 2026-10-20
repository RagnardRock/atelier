// Les recettes : ce qu'un asset produit à partir de son image.
//
// Chaque recette décrit :
// - champs : ses réglages, affichés dans le panneau de droite (pas de JSON à écrire) ;
// - defauts(contexte) : ses réglages de départ, adaptés au projet et à l'image ;
// - sorties(asset, contexte) : la liste des fichiers produits, chacun avec sa fonction produire()
//   qui renvoie les octets à écrire ;
// - code(asset, contexte) : le code HTML (ou Vue) à coller pour utiliser ces fichiers.
// contexte = { projet, source, image (le canvas à exporter), config }.

const Recettes = (() => {
  // Adresse d'un fichier vu depuis le site :
  // - dans public/ → « /chemin » (Vite et Vue servent public/ tel quel à la racine du site) ;
  // - dans src/ → « @/chemin » (Vite l'importe, lui ajoute une empreinte et l'optimise) ;
  // - ailleurs → le chemin relatif depuis la racine du projet.
  function url(projet, rel) {
    const p = projet.publicDir;
    if (p && (rel === p || rel.startsWith(`${p}/`))) return `/${rel.slice(p.length + 1)}`;
    if (rel.startsWith('src/')) return `@/${rel.slice(4)}`;
    return projet.publicDir ? `/${rel}` : rel;
  }

  const qualiteDefaut = (ctx, format) => (format === 'jpeg' ? ctx.config.jpegQuality : ctx.config.webpQuality);
  const secoursDefaut = (ctx) => (hasTransparency(ctx.image) ? 'png' : 'jpeg');

  // Une sortie image : on prépare le canvas tout de suite (pour la miniature) et on encode à la demande.
  const sortieImage = (rel, canvas, format, qualite, extra = {}) => ({
    rel, format, largeur: canvas.width, hauteur: canvas.height, canvas,
    produire: () => encode(canvas, format, qualite), ...extra,
  });

  const RECETTES = {
    // --- Favicon et icônes d'appli ---
    favicon: {
      nom: 'Favicon et icônes du site',
      icone: 'star-full',
      description: 'favicon.ico, icône SVG, apple-touch-icon, icônes 192 et 512 (dont « maskable » pour Android), site.webmanifest, et les balises dans index.html.',
      dossier: (projet) => projet.publicDir || '',
      champs: (ctx) => [
        { key: 'marge', label: 'Marge autour du logo', type: 'range', min: 0, max: 30, unit: '%' },
        { key: 'fond', label: 'Fond (Apple, Android)', type: 'color', aide: 'L\'icône de l\'écran d\'accueil de l\'iPhone et l\'icône « maskable » d\'Android ne peuvent pas être transparentes.' },
        { key: 'nomAppli', label: 'Nom du site', type: 'text' },
        { key: 'nomCourt', label: 'Nom court', type: 'text', placeholder: '12 lettres max.' },
        { key: 'couleurTheme', label: 'Couleur du thème', type: 'color', aide: 'Couleur de la barre du navigateur sur mobile.' },
        { key: 'svg', label: 'Copier aussi le SVG (net à toutes les tailles)', type: 'checkbox', hidden: ctx.source.type !== 'svg' },
        { key: 'manifest', label: 'Créer site.webmanifest (site installable)', type: 'checkbox' },
        { key: 'indexHtml', label: ctx.projet.indexHtml ? `Poser les balises dans ${ctx.projet.indexHtml}` : 'Poser les balises dans index.html (introuvable ici)', type: 'checkbox', disabled: !ctx.projet.indexHtml },
      ],
      defauts: (ctx) => ({ marge: 0, fond: '#ffffff', nomAppli: ctx.projet.nom, nomCourt: ctx.projet.nom.slice(0, 12), couleurTheme: '#101014', svg: true, manifest: true, indexHtml: Boolean(ctx.projet.indexHtml) }),
      sorties(asset, ctx) {
        const o = asset.options;
        const carre = (taille, extra = {}) => fit(ctx.image, taille, taille, { marge: o.marge, ...extra });
        const r = (nom) => joinRel(asset.dossier, nom);
        // Android découpe les icônes « maskable » en cercle ou en goutte : le logo doit tenir dans
        // le cercle central (80 % de l'icône), d'où 10 % de marge en plus de chaque côté.
        const out = [
          { ...sortieImage(r('favicon.ico'), carre(48), 'ico'), largeur: 48, hauteur: 48, note: '16, 32 et 48 px dans un seul fichier', produire: () => makeIco(carre(256), [16, 32, 48]) },
        ];
        if (ctx.source.type === 'svg' && o.svg) out.push({ rel: r('icon.svg'), format: 'svg', canvas: carre(128), largeur: null, hauteur: null, note: 'Vectoriel, copié tel quel', produire: async () => new TextEncoder().encode(ctx.source.svg) });
        out.push(
          sortieImage(r('apple-touch-icon.png'), carre(180, { fond: o.fond, marge: Math.max(o.marge, 6) }), 'png', 100, { note: 'Écran d\'accueil iPhone / iPad' }),
          sortieImage(r('icon-192.png'), carre(192), 'png', 100),
          sortieImage(r('icon-512.png'), carre(512), 'png', 100),
          sortieImage(r('icon-512-maskable.png'), carre(512, { fond: o.fond, marge: o.marge + 10 }), 'png', 100, { note: 'Android (découpée en cercle)' }),
        );
        if (o.manifest) {
          const icone = (nom, taille, extra = {}) => ({ src: url(ctx.projet, r(nom)), sizes: `${taille}x${taille}`, type: 'image/png', ...extra });
          const manifest = {
            name: o.nomAppli || ctx.projet.nom,
            short_name: o.nomCourt || o.nomAppli || ctx.projet.nom,
            icons: [icone('icon-192.png', 192), icone('icon-512.png', 512), icone('icon-512-maskable.png', 512, { purpose: 'maskable' })],
            theme_color: o.couleurTheme,
            background_color: o.fond,
            display: 'standalone',
          };
          out.push({ rel: r('site.webmanifest'), format: 'json', canvas: null, texte: JSON.stringify(manifest, null, 2), note: 'Nom, couleurs et icônes du site installé', produire: async () => new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`) });
        }
        return out;
      },
      // Les balises recommandées aujourd'hui : un .ico pour les vieux navigateurs, le SVG pour les
      // récents, l'icône Apple et le manifeste (qui donne les icônes 192 et 512 à Android).
      balises(asset, ctx) {
        const o = asset.options;
        const u = (nom) => url(ctx.projet, joinRel(asset.dossier, nom));
        const b = [`<link rel="icon" href="${u('favicon.ico')}" sizes="32x32">`];
        if (ctx.source.type === 'svg' && o.svg) b.push(`<link rel="icon" href="${u('icon.svg')}" type="image/svg+xml">`);
        b.push(`<link rel="apple-touch-icon" href="${u('apple-touch-icon.png')}">`);
        if (o.manifest) b.push(`<link rel="manifest" href="${u('site.webmanifest')}">`);
        b.push(`<meta name="theme-color" content="${o.couleurTheme}">`);
        return b;
      },
      code(asset, ctx) {
        const intro = ctx.projet.type === 'Nuxt'
          ? '<!-- Nuxt : mets ces balises dans nuxt.config (app.head.link / app.head.meta) -->'
          : `<!-- Dans le <head> de ${ctx.projet.indexHtml || 'index.html'} -->`;
        return [intro, ...this.balises(asset, ctx)].join('\n');
      },
    },

    // --- Image @1x / @2x ---
    image: {
      nom: 'Image nette (@1x, @2x)',
      icone: 'device-desktop',
      description: 'Une image affichée à une taille fixe (logo d\'en-tête, illustration…), en WebP léger avec une version @2x pour les écrans haute densité, et un PNG ou JPEG de secours.',
      dossier: (projet) => projet.assetsDir,
      champs: () => [
        { key: 'largeur', label: 'Largeur affichée', type: 'number', min: 1, max: 10000, unit: 'px', aide: 'La largeur dans ta page (en px CSS). La version @2x fait le double.' },
        { key: 'x2', label: 'Version @2x (écrans Retina, 4K)', type: 'checkbox' },
        { key: 'x3', label: 'Version @3x (téléphones)', type: 'checkbox' },
        { key: 'webp', label: 'WebP (léger, lu par tous les navigateurs récents)', type: 'checkbox' },
        { key: 'secours', label: 'Format de secours', type: 'select', choices: [['png', 'PNG (garde la transparence)'], ['jpeg', 'JPEG (photos)'], ['aucun', 'Aucun (WebP seulement)']] },
        { key: 'qualite', label: 'Qualité WebP / JPEG', type: 'range', min: 30, max: 100, unit: '%' },
      ],
      defauts: (ctx) => ({ largeur: Math.max(1, Math.round(ctx.image.width / 2)), x2: true, x3: false, webp: true, secours: secoursDefaut(ctx), qualite: ctx.config.webpQuality }),
      densites: (o) => [1, ...(o.x2 ? [2] : []), ...(o.x3 ? [3] : [])],
      sorties(asset, ctx) {
        const o = asset.options;
        const ratio = ctx.image.height / ctx.image.width;
        const formats = [...(o.webp ? ['webp'] : []), ...(o.secours !== 'aucun' ? [o.secours] : [])];
        const out = [];
        for (const format of formats) {
          for (const d of this.densites(o)) {
            const w = Math.round(o.largeur * d), h = Math.round(o.largeur * ratio * d);
            const canvas = resample(ctx.image, w, h);
            const agrandie = w > ctx.image.width + 1;
            out.push(sortieImage(joinRel(asset.dossier, `${asset.nom}${d > 1 ? `@${d}x` : ''}.${EXTENSION[format]}`), canvas, format, o.qualite,
              { note: agrandie ? `Agrandie : l'image d'origine ne fait que ${ctx.image.width} px de large` : `${d}x`, alerte: agrandie }));
          }
        }
        return out;
      },
      code(asset, ctx) {
        const o = asset.options;
        const u = (d, format) => url(ctx.projet, joinRel(asset.dossier, `${asset.nom}${d > 1 ? `@${d}x` : ''}.${EXTENSION[format]}`));
        const set = (format) => this.densites(o).map((d) => `${u(d, format)} ${d}x`).join(', ');
        const h = Math.round(o.largeur * ctx.image.height / ctx.image.width);
        const dims = `width="${o.largeur}" height="${h}" alt=""`;
        if (o.secours === 'aucun') return `<img src="${u(1, 'webp')}" srcset="${set('webp')}" ${dims}>`;
        if (!o.webp) return `<img src="${u(1, o.secours)}" srcset="${set(o.secours)}" ${dims}>`;
        return `<picture>\n  <source type="image/webp" srcset="${set('webp')}">\n  <img src="${u(1, o.secours)}" srcset="${set(o.secours)}" ${dims}>\n</picture>`;
      },
    },

    // --- Image responsive ---
    responsive: {
      nom: 'Image responsive (plusieurs largeurs)',
      icone: 'screen-full',
      description: 'Une grande image (bannière, photo de fond…) en plusieurs largeurs : le navigateur télécharge seulement celle qui convient à l\'écran, du téléphone à ton écran ultralarge.',
      dossier: (projet) => projet.assetsDir,
      champs: () => [
        { key: 'largeurs', label: 'Largeurs', type: 'text', placeholder: '480, 960, 1440, 1920', aide: 'Séparées par des virgules. Une largeur plus grande que l\'image d\'origine est ignorée (pas d\'agrandissement flou).' },
        { key: 'sizes', label: 'Largeur dans la page', type: 'text', placeholder: '100vw', aide: 'L\'attribut sizes : 100vw = toute la largeur de l\'écran, 50vw = la moitié, ou par exemple « (min-width: 1200px) 1200px, 100vw ».' },
        { key: 'webp', label: 'WebP', type: 'checkbox' },
        { key: 'secours', label: 'Format de secours', type: 'select', choices: [['jpeg', 'JPEG (photos)'], ['png', 'PNG (transparence)'], ['aucun', 'Aucun (WebP seulement)']] },
        { key: 'qualite', label: 'Qualité WebP / JPEG', type: 'range', min: 30, max: 100, unit: '%' },
      ],
      defauts: (ctx) => ({ largeurs: '480, 960, 1440, 1920, 2560', sizes: '100vw', webp: true, secours: secoursDefaut(ctx), qualite: ctx.config.webpQuality }),
      largeurs(o, ctx) {
        const voulues = [...new Set(String(o.largeurs).split(/[,; ]+/).map(Number).filter((n) => n > 0 && n <= 10000))].sort((a, b) => a - b);
        const gardees = voulues.filter((w) => w <= ctx.image.width);
        // Si l'image est plus petite que toutes les largeurs demandées, on garde au moins sa taille d'origine.
        return gardees.length ? gardees : [ctx.image.width];
      },
      sorties(asset, ctx) {
        const o = asset.options;
        const formats = [...(o.webp ? ['webp'] : []), ...(o.secours !== 'aucun' ? [o.secours] : [])];
        const ratio = ctx.image.height / ctx.image.width;
        const out = [];
        for (const format of formats) {
          for (const w of this.largeurs(o, ctx)) {
            out.push(sortieImage(joinRel(asset.dossier, `${asset.nom}-${w}w.${EXTENSION[format]}`), resample(ctx.image, w, Math.round(w * ratio)), format, o.qualite));
          }
        }
        return out;
      },
      code(asset, ctx) {
        const o = asset.options;
        const ws = this.largeurs(o, ctx);
        const u = (w, format) => url(ctx.projet, joinRel(asset.dossier, `${asset.nom}-${w}w.${EXTENSION[format]}`));
        const set = (format) => ws.map((w) => `${u(w, format)} ${w}w`).join(', ');
        const grande = ws[ws.length - 1];
        const dims = `width="${grande}" height="${Math.round(grande * ctx.image.height / ctx.image.width)}" alt="" loading="lazy" decoding="async"`;
        const sizes = o.sizes || '100vw';
        const principal = o.secours === 'aucun' ? 'webp' : o.secours;
        const img = `<img src="${u(grande, principal)}" srcset="${set(principal)}" sizes="${sizes}" ${dims}>`;
        if (!o.webp || o.secours === 'aucun') return img;
        return `<picture>\n  <source type="image/webp" srcset="${set('webp')}" sizes="${sizes}">\n  ${img}\n</picture>`;
      },
    },

    // --- Partage (Open Graph) ---
    og: {
      nom: 'Image de partage (Open Graph)',
      icone: 'link-external',
      description: 'L\'aperçu affiché quand on partage un lien vers ton site (Discord, Slack, Facebook, LinkedIn, X…) : 1200 × 630 px.',
      dossier: (projet) => projet.publicDir || '',
      champs: () => [
        { key: 'largeur', label: 'Largeur', type: 'number', min: 100, max: 4000, unit: 'px' },
        { key: 'hauteur', label: 'Hauteur', type: 'number', min: 100, max: 4000, unit: 'px' },
        { key: 'cadrage', label: 'Cadrage', type: 'select', choices: [['contenir', 'Toute l\'image visible (logo centré)'], ['couvrir', 'Remplir le cadre (coupe ce qui dépasse)']] },
        { key: 'marge', label: 'Marge', type: 'range', min: 0, max: 40, unit: '%' },
        { key: 'fond', label: 'Fond', type: 'color' },
        { key: 'format', label: 'Format', type: 'select', choices: [['png', 'PNG'], ['jpeg', 'JPEG (plus léger)']] },
        { key: 'site', label: 'Adresse du site', type: 'text', placeholder: 'https://mon-site.fr', aide: 'Les réseaux sociaux veulent une adresse complète pour l\'image.' },
      ],
      defauts: (ctx) => {
        // Un logo (transparent) est posé entier au centre ; une photo remplit le cadre.
        const logo = hasTransparency(ctx.image);
        return { largeur: 1200, hauteur: 630, cadrage: logo ? 'contenir' : 'couvrir', marge: logo ? 18 : 0, fond: '#101014', format: 'png', site: '' };
      },
      sorties(asset, ctx) {
        const o = asset.options;
        const canvas = fit(ctx.image, o.largeur, o.hauteur, { mode: o.cadrage, marge: o.marge, fond: o.fond });
        return [sortieImage(joinRel(asset.dossier, `${asset.nom}.${EXTENSION[o.format]}`), canvas, o.format, ctx.config.jpegQuality, { note: 'Aperçu de lien' })];
      },
      code(asset, ctx) {
        const o = asset.options;
        const chemin = url(ctx.projet, joinRel(asset.dossier, `${asset.nom}.${EXTENSION[o.format]}`));
        const site = (o.site || 'https://mon-site.fr').replace(/\/$/, '');
        const complet = chemin.startsWith('/') ? `${site}${chemin}` : `${site}/${chemin.replace(/^@\//, '')}`;
        return [
          `<meta property="og:image" content="${complet}">`,
          `<meta property="og:image:width" content="${o.largeur}">`,
          `<meta property="og:image:height" content="${o.hauteur}">`,
          '<meta name="twitter:card" content="summary_large_image">',
        ].join('\n');
      },
    },

    // --- Tailles libres ---
    libre: {
      nom: 'Tailles libres',
      icone: 'symbol-ruler',
      description: 'Les tailles que tu veux, dans le format que tu veux : vignettes, icônes d\'une appli, images pour un réseau social…',
      dossier: (projet) => projet.assetsDir,
      champs: () => [
        { key: 'tailles', label: 'Tailles', type: 'text', placeholder: '64, 128x96, 256', aide: '« 128 » = 128 px de large (hauteur proportionnelle), « 128x96 » = un cadre de 128 × 96 px.' },
        { key: 'format', label: 'Format', type: 'select', choices: [['png', 'PNG'], ['webp', 'WebP'], ['jpeg', 'JPEG'], ['ico', 'ICO (16, 32 et 48 px)']] },
        { key: 'cadrage', label: 'Dans un cadre', type: 'select', choices: [['contenir', 'Toute l\'image visible'], ['couvrir', 'Remplir (coupe ce qui dépasse)'], ['etirer', 'Étirer (déforme)']] },
        { key: 'fondPlein', label: 'Fond plein (sinon transparent)', type: 'checkbox' },
        { key: 'fond', label: 'Couleur du fond', type: 'color' },
        { key: 'qualite', label: 'Qualité WebP / JPEG', type: 'range', min: 30, max: 100, unit: '%' },
      ],
      defauts: (ctx) => ({ tailles: '64, 128, 256, 512', format: 'png', cadrage: 'contenir', fondPlein: false, fond: '#ffffff', qualite: ctx.config.webpQuality }),
      tailles(o, ctx) {
        return String(o.tailles).split(/[,; ]+/).map((t) => t.trim().toLowerCase()).filter(Boolean).map((t) => {
          const m = t.match(/^(\d+)(?:[x×*](\d+))?$/);
          if (!m) return null;
          const w = Math.min(10000, Number(m[1]));
          const cadre = Boolean(m[2]);
          const h = cadre ? Math.min(10000, Number(m[2])) : Math.max(1, Math.round(w * ctx.image.height / ctx.image.width));
          return w > 0 && h > 0 ? { w, h, cadre } : null;
        }).filter(Boolean);
      },
      sorties(asset, ctx) {
        const o = asset.options;
        return this.tailles(o, ctx).map(({ w, h, cadre }) => {
          const canvas = cadre ? fit(ctx.image, w, h, { mode: o.cadrage, fond: o.fondPlein ? o.fond : null }) : (() => {
            const c = resample(ctx.image, w, h);
            if (!o.fondPlein) return c;
            return fit(c, w, h, { fond: o.fond });
          })();
          const nom = `${asset.nom}-${cadre ? `${w}x${h}` : w}.${EXTENSION[o.format]}`;
          if (o.format === 'ico') return { ...sortieImage(joinRel(asset.dossier, nom), canvas, 'png', 100), format: 'ico', produire: () => makeIco(canvas, [16, 32, 48]) };
          return sortieImage(joinRel(asset.dossier, nom), canvas, o.format, o.qualite, { alerte: w > ctx.image.width + 1, note: w > ctx.image.width + 1 ? 'Agrandie' : '' });
        });
      },
      code(asset, ctx) {
        return this.sorties(asset, ctx).map((s) => url(ctx.projet, s.rel)).join('\n');
      },
    },
  };

  // Recette proposée pour une nouvelle image : un SVG ou une image carrée → favicon ;
  // une image très large → responsive ; sinon une image @1x/@2x.
  function deviner(image, source) {
    const ratio = image.width / image.height;
    if (source.type === 'svg' && ratio > 0.8 && ratio < 1.25) return 'favicon';
    if (ratio > 0.9 && ratio < 1.1 && image.width <= 2048) return 'favicon';
    if (image.width >= 1600) return 'responsive';
    return 'image';
  }

  return { ...RECETTES, liste: Object.keys(RECETTES), get: (id) => RECETTES[id], url, deviner };
})();
