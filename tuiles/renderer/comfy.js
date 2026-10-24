// Tafl 0.22 : générer des tuiles avec ComfyUI, sans jamais voir ComfyUI (menu Générer).
//
// Le moteur ComfyUI tourne caché, lancé par Tafl (../comfy.js). Ici, dans la fenêtre de Tafl :
// - la fenêtre « Installation et réglages de ComfyUI » : ce que Tafl a trouvé, les boutons pour
//   choisir un dossier, télécharger ComfyUI ou un modèle, démarrer et arrêter le moteur ;
// - la fenêtre « Générer » : une description, un style (pixel art, peint, dessin, réaliste ou libre),
//   un sol qui se répète ou un objet détouré, une taille en tuiles. Tafl écrit la recette (le
//   « graphe » de ComfyUI), le moteur dessine, puis post-traitement.js en fait de vraies tuiles ;
// - « Ajouter au jeu » passe l'image par l'import de planche habituel (découpe, tampons).
// La génération tourne sur la carte graphique : elle ne coûte aucun jeton à Claude.

const Comfy = (() => {
  const api = window.tafl.comfy;

  // --- Les styles : pas seulement du pixel art ---
  // positif : ajouté à la description ; negatif : ce que le modèle doit éviter ;
  // pixel : post-traitement pixel art (aplats, palette) ; lora : LoRA à prendre s'il est installé ;
  // modele : modèle à préférer (d'après son nom de fichier).
  const STYLES = [
    { id: 'pixel', nom: 'Pixel art', pixel: true, lora: /pixel/i, modele: /dreamshaper|lightning|turbo/i,
      positif: 'pixel art, 16-bit SNES RPG style, clean flat colors, crisp edges, limited palette',
      negatif: 'blurry, smooth gradient, 3d render, photo, noise, jpeg artifacts' },
    { id: 'peint', nom: 'Peint à la main', modele: /dreamshaper/i,
      positif: 'hand-painted game art, stylized, painterly texture, soft lighting, rich colors',
      negatif: 'photo, 3d render, blurry, noise' },
    { id: 'dessin', nom: 'Dessin, BD (cel shading)', modele: /dreamshaper/i,
      positif: 'cel shaded cartoon illustration, clean line art, flat colors, game asset',
      negatif: 'photo, 3d render, realistic, blurry' },
    { id: 'realiste', nom: 'Réaliste', modele: /jugger|realvis|real/i,
      positif: 'photorealistic, highly detailed, realistic texture, natural light',
      negatif: 'cartoon, illustration, painting, blurry' },
    { id: 'libre', nom: 'Libre : seulement ma description', positif: '', negatif: '' },
  ];
  const SORTES = [
    ['sol', 'Sol qui se répète (herbe, sable, eau, pavés…)'],
    ['objet', 'Objet détouré (arbre, rocher, maison, panneau…)'],
  ];
  const ENCADRE = {
    sol: { avant: 'seamless tileable texture of', apres: 'ground seen from directly above, top-down, flat, uniform, no objects, no horizon, no perspective', negatif: 'perspective, horizon, sky, objects, frame, border' },
    objet: { avant: 'a single', apres: 'centered, whole object visible, isolated on a plain flat white background, simple background, game sprite, top-down three-quarter view', negatif: 'multiple objects, cropped, cut off, ground, scenery, landscape, cast shadow, frame' },
  };
  // Combien de détails : un sol de jeu doit rester calme (un aplat et quelques marques), sinon
  // il fait du bruit une fois posé sur toute une carte. lissage : passes de post-traitement.js.
  const DETAILS = {
    peu: { nom: 'Peu : calme, de grands aplats (sols)', positif: 'simple, calm, large flat areas of color, sparse details, readable', negatif: 'busy, cluttered, noisy, too many details, tiny details, high frequency texture', lissage: 2 },
    moyen: { nom: 'Moyen', positif: '', negatif: 'cluttered, noisy', lissage: 1 },
    beaucoup: { nom: 'Beaucoup (objets riches)', positif: 'intricate details', negatif: '', lissage: 0 },
  };
  const COMMUN_NEGATIF = 'text, watermark, signature, logo, ui, frame';

  // Les modèles comme SDXL comprennent mal le français : les mots courants d'un jeu sont traduits
  // (les autres passent tels quels). La phrase envoyée au modèle s'affiche sous la description.
  const MOTS = {
    'hautes herbes': 'tall grass', 'herbe': 'grass', 'herbes': 'grass', 'pelouse': 'lawn', 'arbre': 'tree', 'arbres': 'trees', 'sapin': 'pine tree', 'sapins': 'pine trees',
    'chêne': 'oak tree', 'palmier': 'palm tree', 'buisson': 'bush', 'buissons': 'bushes', 'haie': 'hedge', 'fleur': 'flower', 'fleurs': 'flowers', 'champignon': 'mushroom',
    'maison': 'house', 'maisons': 'houses', 'toit': 'roof', 'mur': 'wall', 'murs': 'walls', 'porte': 'door', 'fenêtre': 'window', 'clôture': 'fence', 'barrière': 'fence',
    'pont': 'bridge', 'puits': 'well', 'panneau': 'signpost', 'boîte aux lettres': 'mailbox', 'lampadaire': 'street lamp', 'banc': 'bench', 'tonneau': 'barrel', 'caisse': 'crate',
    'eau': 'water', 'mer': 'sea', 'lac': 'lake', 'rivière': 'river', 'plage': 'beach', 'sable': 'sand', 'terre': 'dirt', 'boue': 'mud', 'chemin': 'dirt path', 'route': 'road',
    'pavés': 'cobblestone', 'pierre': 'stone', 'pierres': 'stones', 'rocher': 'rock', 'rochers': 'rocks', 'caillou': 'pebble', 'cailloux': 'pebbles', 'falaise': 'cliff',
    'grotte': 'cave', 'montagne': 'mountain', 'neige': 'snow', 'glace': 'ice', 'lave': 'lava', 'bois': 'wood', 'planches': 'wooden planks', 'parquet': 'wooden floor',
    'carrelage': 'tiles floor', 'tapis': 'carpet', 'forêt': 'forest', 'champ': 'field', 'ferme': 'farm', 'château': 'castle', 'tour': 'tower', 'église': 'church',
    'boutique': 'shop', 'magasin': 'shop', 'arène': 'arena', 'statue': 'statue', 'fontaine': 'fountain', 'feuilles': 'leaves', 'mousse': 'moss', 'marais': 'swamp',
    'rouge': 'red', 'bleu': 'blue', 'bleue': 'blue', 'vert': 'green', 'verte': 'green', 'jaune': 'yellow', 'blanc': 'white', 'blanche': 'white', 'noir': 'black', 'noire': 'black',
    'gris': 'grey', 'grise': 'grey', 'brun': 'brown', 'marron': 'brown', 'orange': 'orange', 'violet': 'purple', 'rose': 'pink', 'doré': 'golden', 'sombre': 'dark', 'clair': 'light',
    'vieux': 'old', 'vieille': 'old', 'petit': 'small', 'petite': 'small', 'petits': 'small', 'petites': 'small', 'grand': 'big', 'grande': 'big', 'grands': 'big', 'grandes': 'big', 'haut': 'tall', 'hauts': 'tall', 'hautes': 'tall', 'beaucoup': 'many', 'quelques': 'a few', 'mouillé': 'wet', 'sec': 'dry', 'sèche': 'dry',
    'automne': 'autumn', 'hiver': 'winter', 'été': 'summer', 'printemps': 'spring', 'nuit': 'night', 'enneigé': 'snowy', 'enneigée': 'snowy', 'fleuri': 'flowery',
    'avec': 'with', 'et': 'and', 'de': 'of', 'du': 'of', 'des': '', 'le': '', 'la': '', 'les': '', 'un': 'a', 'une': 'a', 'en': 'made of', 'sur': 'on',
  };
  function traduire(texte) {
    let t = ` ${String(texte).toLowerCase()} `;
    // Les expressions de plusieurs mots d'abord.
    for (const [fr, en] of Object.entries(MOTS).sort((a, b) => b[0].length - a[0].length)) {
      t = t.replace(new RegExp(`(?<![\\p{L}])${fr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu'), en);
    }
    return t.replace(/\s+/g, ' ').trim();
  }
  const style = (id) => STYLES.find((s) => s.id === id) || STYLES[0];
  function phrases(v) {
    const s = style(v.style), e = ENCADRE[v.sorte] || ENCADRE.sol;
    const sujet = v.traduire === false ? String(v.description).trim() : traduire(v.description);
    const d = s.id === 'libre' ? DETAILS.moyen : DETAILS[v.details] || DETAILS.peu;
    const positif = [s.id === 'libre' ? sujet : `${e.avant} ${sujet}`, s.id === 'libre' ? '' : e.apres, s.positif, d.positif].filter(Boolean).join(', ');
    const negatif = [s.negatif, s.id === 'libre' ? '' : e.negatif, d.negatif, COMMUN_NEGATIF, v.negatif].filter(Boolean).join(', ');
    return { positif, negatif };
  }

  // Taille de l'image demandée au modèle : environ 1 mégapixel (ce que SDXL sait faire),
  // aux proportions des tuiles voulues, en multiples de 64.
  function dimensions(wt, ht) {
    const a = clamp(wt / ht, 0.4, 2.5);
    const r64 = (n) => clamp(Math.round(n / 64) * 64, 512, 1536);
    const W = r64(Math.sqrt(1024 * 1024 * a));
    return { W, H: r64(W / a) };
  }
  // Réglages du calcul d'après le nom du modèle : les modèles « Lightning » ou « Turbo » sont
  // faits pour peu d'étapes (rapides) ; les autres en demandent une trentaine.
  function reglagesModele(nom) {
    if (/lightning|turbo|hyper|lcm/i.test(nom)) return { etapes: 6, cfg: 2, sampler: 'dpmpp_sde', scheduler: 'karras' };
    return { etapes: 28, cfg: 5, sampler: 'dpmpp_2m', scheduler: 'karras' };
  }

  // La recette envoyée au moteur, au format « API » de ComfyUI : chaque nœud a un numéro, son type
  // (class_type) et ses entrées ; [« 1 », 0] = la sortie 0 du nœud 1.
  function graphe(o) {
    const g = {
      1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: o.modele } },
    };
    let modele = ['1', 0], clip = ['1', 1];
    if (o.lora) {
      g[2] = { class_type: 'LoraLoader', inputs: { model: modele, clip, lora_name: o.lora, strength_model: o.forceLora ?? 1, strength_clip: o.forceLora ?? 1 } };
      modele = ['2', 0]; clip = ['2', 1];
    }
    g[3] = { class_type: 'CLIPTextEncode', inputs: { text: o.positif, clip } };
    g[4] = { class_type: 'CLIPTextEncode', inputs: { text: o.negatif, clip } };
    g[5] = { class_type: 'EmptyLatentImage', inputs: { width: o.W, height: o.H, batch_size: o.lot || 1 } };
    g[6] = { class_type: 'KSampler', inputs: { model: modele, positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0], seed: o.graine, steps: o.etapes, cfg: o.cfg, sampler_name: o.sampler, scheduler: o.scheduler, denoise: 1 } };
    g[7] = { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['1', 2] } };
    // PreviewImage : les images vont dans le dossier temporaire du moteur, pas dans ses sorties.
    g[8] = { class_type: 'PreviewImage', inputs: { images: ['7', 0] } };
    return g;
  }

  // --- Le moteur ---
  let modeles = null; // { checkpoints, loras } vus par le moteur
  let suivi = null; // qui reçoit les étapes du calcul
  let suiviTelechargement = null;
  api.onProgres((p) => suivi?.(p));
  api.onTelechargement((p) => suiviTelechargement?.(p));

  // Démarre le moteur s'il le faut, et renvoie ses modèles.
  async function pret(progres = () => {}) {
    suivi = progres;
    await api.demarrer();
    modeles = await api.modeles();
    if (!modeles.checkpoints.length) throw new Error('ComfyUI ne voit aucun modèle (checkpoint). Télécharges-en un, ou vérifie le dossier des modèles dans « Installation et réglages de ComfyUI… ».');
    return modeles;
  }
  const choisirModele = (liste, s, voulu) => (voulu && liste.includes(voulu) ? voulu : liste.find((m) => s.modele?.test(m)) || liste[0]);
  const choisirLora = (liste, s, voulu) => (voulu === '' ? '' : voulu && voulu !== 'auto' && liste.includes(voulu) ? voulu : (s.lora && liste.find((m) => s.lora.test(m))) || '');

  // Génère les images brutes (une par variante) : [{ data, width, height }].
  async function generer(v, progres = () => {}) {
    const m = await pret(progres);
    const s = style(v.style);
    const modele = choisirModele(m.checkpoints, s, v.modele);
    const lora = choisirLora(m.loras, s, v.lora);
    const auto = reglagesModele(modele);
    const { W, H } = dimensions(v.largeur, v.hauteur);
    const { positif, negatif } = phrases(v);
    const graine = v.graine > 0 ? Math.round(v.graine) : Math.floor(Math.random() * 2 ** 32);
    const o = { modele, lora, W, H, positif, negatif, graine, lot: clamp(Math.round(v.variantes) || 1, 1, 4), etapes: v.etapes > 0 ? Math.round(v.etapes) : auto.etapes, cfg: v.cfg > 0 ? v.cfg : auto.cfg, sampler: auto.sampler, scheduler: auto.scheduler };
    suivi = progres;
    const octets = await api.generer(graphe(o));
    const images = [];
    for (const b of octets) images.push(IO.pixelsOf(await IO.decodeBytes(b)));
    return { images, recette: o };
  }

  // Post-traitement d'une image brute selon les choix de la fenêtre.
  function traiter(brute, v, doc = App.doc) {
    const taille = doc?.tileSize || App.config.tileSize || 16;
    const s = style(v.style);
    const pixel = v.pixel ?? s.pixel;
    const couleurs = v.couleurs === 'jeu' || v.couleurs === undefined ? 0 : Number(v.couleurs) || 0;
    return PostTraitement.traiter(brute, {
      largeur: v.largeur * taille, hauteur: v.hauteur * taille, sorte: v.sorte, pixel,
      couleurs: couleurs || (doc ? 0 : 16), palette: pixel && !couleurs && doc ? doc.palette : null,
      tolerance: v.tolerance, marge: 0.25, echelle: Number(v.echelle) || 8, lissage: (DETAILS[v.details] || DETAILS.peu).lissage,
    });
  }
  const versCanvas = (img) => {
    const c = el('canvas', { width: img.width, height: img.height });
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return c;
  };
  // Ajoute l'image traitée au jeu par l'import de planche (découpe en tuiles, tampons…).
  async function ajouter(img, v, valeursImport) {
    const nom = `ia-${Doc.slug(traduire(v.description).slice(0, 40), 'image')}.png`;
    const bytes = await IO.canvasBytes(versCanvas(img));
    const fichier = { name: nom, bytes };
    // Un sol est plein : rien à rendre transparent, pas de tampon. Un objet est déjà détouré.
    const defauts = v.sorte === 'sol' ? { fond: 'aucun', tampons: false } : { tampons: true };
    if (valeursImport) return Dialogs.automatique({ valeurs: { ...defauts, ...valeursImport } }, () => IO.importSheet(fichier, defauts));
    return IO.importSheet(fichier, defauts);
  }

  // --- Fenêtre « Installation et réglages de ComfyUI » ---
  const taille = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} Go` : `${Math.round(n / 1e6)} Mo`);
  async function installation() {
    const corps = el('div', { className: 'comfy-installation' });
    let fermer = null;
    const ligne = (ok, titre, texte, boutons = []) => el('section', { className: `comfy-etape ${ok ? 'ok' : 'manque'}` }, [
      el('h3', {}, [icon(ok ? 'pass-filled' : 'circle-large-outline'), el('span', { textContent: titre })]),
      texte ? el('p', { className: 'modal-info', textContent: texte }) : null,
      boutons.length ? el('div', { className: 'comfy-boutons' }, boutons) : null,
    ]);
    const bouton = (texte, fn, primaire = false) => {
      const b = el('button', { type: 'button', className: `button small${primaire ? ' primary' : ''}`, textContent: texte });
      b.onclick = async () => {
        b.disabled = true;
        try { await fn(b); } catch (err) { notify(err.message, 'error', 9000); } finally { b.disabled = false; }
        await dessiner();
      };
      return b;
    };
    async function dessiner() {
      const t = await api.trouver();
      corps.replaceChildren();
      corps.append(el('p', { className: 'modal-info', textContent: 'Tafl lance ComfyUI en arrière-plan, sans fenêtre, quand tu génères, et l\'arrête quand tu fermes Tafl. Il te faut ComfyUI installé une fois (avec ses modèles) : Tafl le trouve tout seul.' }));
      corps.append(ligne(Boolean(t.code), 'ComfyUI', t.code ? `Trouvé : ${t.code}` : `Pas trouvé. Installe « ComfyUI Desktop » (Windows, NVIDIA) depuis le site officiel, ouvre-le une fois pour qu'il termine son installation, puis clique sur « Chercher à nouveau ». Si ComfyUI est ailleurs, choisis son dossier.${t.racines.length ? `\nDossiers regardés : ${t.racines.join(' · ')}` : ''}`, [
        bouton('Chercher à nouveau', async () => {}),
        bouton('Choisir le dossier de ComfyUI…', () => api.choisir('dossier')),
        ...(t.code ? [] : [bouton('Télécharger ComfyUI (site officiel)', () => api.siteOfficiel(), true)]),
      ]));
      corps.append(ligne(Boolean(t.python), 'Python de ComfyUI', t.python ? `Trouvé : ${t.python}` : 'Pas trouvé. ComfyUI Desktop l\'installe dans un dossier .venv, la version portable dans python_embeded : choisis le fichier python.exe.', [
        bouton('Choisir python.exe…', () => api.choisir('python')),
      ]));
      const f = t.fichiers || {};
      const liste = (s) => (f[s] || []).join(', ') || 'aucun';
      const telecharges = t.catalogue.map((m) => {
        const present = (f[m.dossier] || []).some((x) => x.toLowerCase() === m.fichier.toLowerCase());
        return el('div', { className: 'comfy-modele' }, [
          el('span', { textContent: `${present ? '✓' : '○'} ${m.nom} (${m.taille}) : ${m.pourquoi}` }),
          present ? null : bouton('Télécharger', (b) => telechargerAvec(b, { id: m.id }), true),
        ]);
      });
      const adresse = el('input', { type: 'text', placeholder: 'https://huggingface.co/… ou https://civitai.com/api/download/models/…', className: 'comfy-adresse' });
      const sorte = el('select', {});
      for (const [v, l] of [['checkpoints', 'Modèle complet (checkpoint)'], ['loras', 'LoRA (style)'], ['vae', 'VAE'], ['diffusion_models', 'Modèle de diffusion (Flux…)'], ['text_encoders', 'Encodeur de texte'], ['upscale_models', 'Agrandissement']]) sorte.add(new Option(l, v));
      corps.append(ligne(Boolean(f.checkpoints?.length), 'Modèles', t.modeles
        ? `Dossier : ${t.modeles}\nModèles complets (checkpoints) : ${liste('checkpoints')}\nLoRA : ${liste('loras')}${f.diffusion_models?.length ? `\nModèles de diffusion : ${liste('diffusion_models')} (pas encore utilisés par Tafl)` : ''}\nTafl utilise les modèles complets SDXL (DreamShaper XL, Juggernaut XL…). Les styles choisissent celui qui leur va le mieux.`
        : 'Dossier des modèles pas trouvé.', [
        bouton('Ouvrir le dossier', () => api.ouvrirModeles()),
        bouton('Choisir le dossier « models »…', () => api.choisir('modeles')),
      ]));
      corps.append(el('div', { className: 'comfy-catalogue' }, [
        ...telecharges,
        el('div', { className: 'comfy-modele' }, [adresse, sorte, bouton('Télécharger', (b) => {
          if (!adresse.value.trim()) throw new Error('Colle d\'abord l\'adresse du fichier du modèle.');
          return telechargerAvec(b, { url: adresse.value.trim(), dossier: sorte.value });
        })]),
      ]));
      const i = await api.infos();
      corps.append(ligne(i.enMarche, 'Moteur', i.enMarche ? `En marche sur le port ${i.port}${i.nous ? ', lancé par Tafl (il s\'arrêtera avec Tafl)' : ', un ComfyUI déjà ouvert (Tafl ne l\'arrêtera pas)'}.` : 'Arrêté. Il démarre tout seul à la première génération.', [
        i.enMarche ? bouton('Arrêter', () => api.arreter()) : bouton('Démarrer maintenant', async () => { try { await pret((p) => { if (p.texte) ecrire(p.texte); }); } finally { ecrire(''); } }, true),
        ...(i.enMarche ? [bouton('Libérer la carte graphique', async () => { await api.liberer(); notify('Les modèles ont quitté la mémoire de la carte graphique.', 'success'); })] : []),
        bouton('Oublier mes choix (tout rechercher)', () => api.oublier()),
      ]));
      if (i.lignes.length) corps.append(el('pre', { className: 'comfy-journal', textContent: i.lignes.slice(-14).join('\n') }));
    }
    const ecrire = (texte) => { const x = corps.closest('.modal')?.querySelector('.modal-extra'); if (x) x.textContent = texte; };
    async function telechargerAvec(b, quoi) {
      suiviTelechargement = (p) => { b.textContent = p.total ? `${Math.round((p.recu / p.total) * 100)} % de ${taille(p.total)}` : taille(p.recu); };
      try {
        const r = await api.telecharger(quoi);
        notify(r.deja ? `Déjà là : ${r.chemin}` : `Téléchargé : ${r.chemin}`, 'success', 6000);
        // Le moteur relit ses dossiers à chaque demande de liste : rien à redémarrer.
      } finally { suiviTelechargement = null; }
    }
    await dessiner();
    await Dialogs.form({ title: 'Installation et réglages de ComfyUI', okLabel: 'Fermer', cancelLabel: '', width: 720, fields: [{ type: 'element', element: corps }], onInput(_v, f) { fermer = f; f.card.classList.add('comfy'); } });
    return fermer;
  }

  // --- Fenêtre « Générer » ---
  async function fenetre(depart = {}) {
    const t = await api.trouver();
    if (!t.pret && !(await api.infos()).enMarche) {
      notify('Tafl ne trouve pas encore ComfyUI sur cet ordinateur : voici la fenêtre d\'installation.', 'info', 6000);
      return installation();
    }
    const doc = App.doc;
    const derniers = { style: 'pixel', sorte: 'sol', largeur: 4, hauteur: 4, variantes: 4, couleurs: 'jeu', modele: '', lora: 'auto', ...(App.config.comfyDerniers || {}), ...depart };
    const checkpoints = t.fichiers?.checkpoints || [];
    const loras = t.fichiers?.loras || [];
    const resultats = el('div', { className: 'comfy-resultats' }, [el('p', { className: 'modal-info', textContent: 'Décris ce que tu veux, choisis un style, puis « Générer ». Les variantes s\'affichent ici : clique sur celle que tu préfères, puis « Ajouter au jeu ».' })]);
    let brutes = [], traitees = [], choisie = 0, form = null, enCours = false;
    const phrase = el('p', { className: 'modal-info comfy-phrase' });

    function afficher(v) {
      if (!brutes.length) return;
      traitees = brutes.map((b) => traiter(b, v).img);
      resultats.replaceChildren();
      traitees.forEach((img, n) => {
        const zoom = Math.max(1, Math.floor(200 / Math.max(img.width * (v.sorte === 'sol' ? 2 : 1), img.height * (v.sorte === 'sol' ? 2 : 1))));
        const rep = v.sorte === 'sol' ? 2 : 1; // un sol est montré répété 2 × 2 : on voit s'il raccorde
        const c = el('canvas', { width: img.width * rep * zoom, height: img.height * rep * zoom });
        const g = c.getContext('2d');
        drawChecker(g, 0, 0, c.width, c.height, 8);
        g.imageSmoothingEnabled = false;
        const src = versCanvas(img);
        for (let y = 0; y < rep; y++) for (let x = 0; x < rep; x++) g.drawImage(src, x * img.width * zoom, y * img.height * zoom, img.width * zoom, img.height * zoom);
        const brute = el('canvas', { width: 64, height: Math.round((64 * brutes[n].height) / brutes[n].width), className: 'comfy-brute', title: 'L\'image rendue par ComfyUI, avant le post-traitement' });
        brute.getContext('2d').drawImage(versCanvas(brutes[n]), 0, 0, brute.width, brute.height);
        const carte = el('button', { type: 'button', className: `comfy-variante${n === choisie ? ' choisie' : ''}`, title: 'Choisir cette variante' }, [c, brute]);
        carte.onclick = () => { choisie = n; afficher(form.values()); };
        resultats.append(carte);
      });
    }
    const etat = (texte) => { const x = form?.card.querySelector('.modal-extra'); if (x) x.textContent = texte; };
    async function lancer(f) {
      if (enCours) { await api.interrompre(); return; }
      const v = f.values();
      if (!v.description.trim()) return notify('Écris d\'abord une description.', 'warning');
      enCours = true;
      const bouton = [...f.card.querySelectorAll('footer .button')].find((b) => b.textContent === 'Générer');
      if (bouton) bouton.textContent = 'Arrêter';
      // Pendant le calcul : une barre de progression bien visible, la phase en cours, le temps
      // écoulé, et une carte qui « respire » à la place de chaque variante attendue.
      const barre = el('div', { className: 'comfy-barre' }, [el('span')]);
      const phase = el('strong', { textContent: 'Préparation…' });
      const temps = el('span', { className: 'comfy-temps' });
      const n = clamp(Math.round(v.variantes) || 1, 1, 4);
      resultats.replaceChildren(el('div', { className: 'comfy-progres' }, [el('div', { className: 'comfy-progres-titre' }, [phase, temps]), barre]),
        ...Array.from({ length: n }, () => el('div', { className: 'comfy-attente' })));
      const debut = Date.now();
      const avancer = (pourcent, texte) => {
        barre.firstChild.style.width = `${clamp(pourcent, 2, 100)}%`;
        if (texte) phase.textContent = texte;
      };
      const minuteur = setInterval(() => { temps.textContent = `${Math.round((Date.now() - debut) / 1000)} s`; }, 250);
      avancer(3, 'Préparation…');
      try {
        const r = await generer(v, (p) => {
          if (p.texte) { avancer(8, 'Démarrage du moteur ComfyUI (la première fois, ça peut prendre une minute)'); etat(p.texte); }
          else if (p.etape === 'attente') avancer(18, 'Chargement du modèle sur la carte graphique…');
          else if (p.etape === 'calcul') {
            avancer(20 + (75 * p.valeur) / Math.max(1, p.max), `La carte graphique dessine : ${Math.round((100 * p.valeur) / Math.max(1, p.max))} %`);
            etat(`Étape ${p.valeur} sur ${p.max}`);
          }
        });
        avancer(100, 'Mise en tuiles…');
        brutes = r.images;
        choisie = 0;
        afficher(f.values());
        const ok = f.card.querySelector('footer button[type=submit]');
        if (ok) ok.disabled = false;
        etat(`${brutes.length} variante(s) en ${Math.round((Date.now() - debut) / 1000)} s · ${r.recette.modele}${r.recette.lora ? ` + ${r.recette.lora}` : ''} · graine ${r.recette.graine}`);
        await window.tafl.writeConfig({ comfyDerniers: { ...v, description: v.description } }).then((c) => { App.config = c; });
      } catch (err) {
        etat('');
        resultats.replaceChildren(el('p', { className: 'modal-info', textContent: `Pas d'image : ${err.message}` }));
        notify(err.message, 'error', 12000);
      } finally {
        clearInterval(minuteur);
        enCours = false;
        if (bouton) bouton.textContent = 'Générer';
      }
    }

    const v = await Dialogs.form({
      title: 'Générer des tuiles avec ComfyUI',
      okLabel: 'Ajouter au jeu',
      cancelLabel: 'Fermer',
      width: Math.min(1100, innerWidth - 60),
      buttons: [
        { label: 'Installation…', run: () => installation() },
        { label: 'Générer', run: (f) => lancer(f) },
      ],
      fields: [
        { type: 'element', element: resultats },
        { key: 'description', label: 'Description', type: 'textarea', rows: 2, value: derniers.description || '' },
        { type: 'element', element: phrase },
        { key: 'style', label: 'Style', type: 'select', value: derniers.style, choices: STYLES.map((s) => [s.id, s.nom]) },
        { key: 'sorte', label: 'Sorte', type: 'select', value: derniers.sorte, choices: SORTES },
        { key: 'largeur', label: 'Largeur', type: 'number', value: derniers.largeur, min: 1, max: 16, unit: 'tuiles' },
        { key: 'hauteur', label: 'Hauteur', type: 'number', value: derniers.hauteur, min: 1, max: 16, unit: 'tuiles' },
        { key: 'variantes', label: 'Variantes', type: 'number', value: derniers.variantes, min: 1, max: 4 },
        { key: 'details', label: 'Détails', type: 'select', value: DETAILS[derniers.details] ? derniers.details : 'peu', choices: Object.entries(DETAILS).map(([k, d]) => [k, d.nom]) },
        // Sans jeu ouvert, pas de « palette du jeu » : 16 couleurs.
        { key: 'couleurs', label: 'Couleurs (pixel art)', type: 'select', value: !doc && String(derniers.couleurs) === 'jeu' ? '16' : String(derniers.couleurs), choices: [...(doc ? [['jeu', 'La palette du jeu ouvert']] : []), ['8', '8 couleurs'], ['12', '12 couleurs'], ['16', '16 couleurs'], ['24', '24 couleurs'], ['32', '32 couleurs']] },
        { key: 'tolerance', label: 'Détourage du fond (objet)', type: 'range', value: derniers.tolerance ?? 48, min: 8, max: 120 },
        { key: 'negatif', label: 'À éviter (facultatif)', type: 'text', value: derniers.negatif || '' },
        { key: 'modele', label: 'Modèle', type: 'select', value: checkpoints.includes(derniers.modele) ? derniers.modele : '', choices: [['', 'Automatique (selon le style)'], ...checkpoints.map((m) => [m, m])] },
        { key: 'lora', label: 'LoRA (style en plus)', type: 'select', value: derniers.lora === '' || loras.includes(derniers.lora) ? derniers.lora : 'auto', choices: [['auto', 'Automatique (Pixel Art XL pour le pixel art)'], ['', 'Aucun'], ...loras.map((m) => [m, m])] },
        { key: 'echelle', label: 'Taille d\'un pixel dans l\'image de ComfyUI', type: 'select', value: String(derniers.echelle || 8), choices: [['4', '4 px (plus de détails)'], ['6', '6 px'], ['8', '8 px (Pixel Art XL)'], ['12', '12 px'], ['16', '16 px (plus gros pixels)']] },
        { key: 'avance', label: 'Réglages avancés', type: 'checkbox', value: false },
        { key: 'graine', label: 'Graine (0 = au hasard)', type: 'number', value: 0, min: 0 },
        { key: 'etapes', label: 'Étapes (0 = selon le modèle)', type: 'number', value: 0, min: 0, max: 80 },
        { key: 'cfg', label: 'Fidélité à la description (0 = selon le modèle)', type: 'number', value: 0, min: 0, max: 20, step: 0.5 },
      ],
      onInput(values, f) {
        form = f;
        f.card.classList.add('comfy-generer');
        const s = style(values.style);
        f.inputs.couleurs.row.hidden = !s.pixel;
        f.inputs.echelle.row.hidden = !s.pixel;
        f.inputs.tolerance.row.hidden = values.sorte !== 'objet';
        for (const k of ['graine', 'etapes', 'cfg', 'negatif', 'modele', 'lora']) f.inputs[k].row.hidden = !values.avance;
        const p = phrases(values);
        phrase.textContent = values.description.trim() ? `Envoyé au modèle : ${p.positif}` : '';
        if (!enCours) afficher(values);
        const ok = f.card.querySelector('footer button[type=submit]');
        if (ok) ok.disabled = !brutes.length;
      },
    });
    if (enCours) api.interrompre();
    if (!v || !traitees[choisie]) return null;
    await ajouter(traitees[choisie], v);
    return v;
  }

  return { STYLES, SORTES, traduire, phrases, dimensions, reglagesModele, graphe, pret, generer, traiter, ajouter, versCanvas, installation, fenetre };
})();
