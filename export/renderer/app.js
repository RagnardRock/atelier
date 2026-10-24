// L'interface de Brokk : le projet ouvert, ses assets (colonne de gauche), les fichiers que l'asset
// choisi va produire (au centre, avec leur poids réel) et ses réglages (à droite).
//
// Rien n'est écrit dans le projet tant que tu ne cliques pas « Exporter » (ou que la surveillance
// n'est pas allumée). Les assets et leurs réglages, eux, sont gardés au fil de l'eau dans les
// réglages de Brokk, projet par projet : à la prochaine ouverture du projet, tout est là.

const App = (() => {
  let config = null;
  let configPath = '';
  let projet = null;  // { dossier, nom, type, publicDir, assetsDir, indexHtml }
  let assets = [];    // { id, source, calque, rogner, recette, nom, dossier, options, memo, etat }
  let courantId = null;
  const calculs = new Map(); // id d'asset → { cle, ctx, sorties, code, erreur }

  const courant = () => assets.find((a) => a.id === courantId) || null;
  const nouvelId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const nomFichier = (chemin) => chemin.split(/[\\/]/).pop();

  // --- Enregistrer les assets du projet dans les réglages (regroupé : une écriture toutes les 400 ms) ---
  let sauverTimer = null;
  function sauver() {
    clearTimeout(sauverTimer);
    sauverTimer = setTimeout(async () => {
      if (!projet) return;
      const garder = assets.map(({ etat, ...a }) => a); // l'état du dernier export ne se garde pas
      config.projets = { ...config.projets, [projet.dossier]: { assets: garder } };
      config = await window.brokk.writeConfig({ projets: config.projets });
    }, 400);
  }

  // --- Thème et réglages de Brokk ---
  const ACCENTS = ['#ff7a3d', '#e0a526', '#5ec8ff', '#b9a8ff', '#ff7aa8', '#4ade80', '#f5f5f5'];
  async function applyTheme(c) {
    document.documentElement.style.setProperty('--accent', c.accentColor);
    document.body.classList.toggle('glass', Boolean(c.glass));
    const { blur, needsRestart } = await window.brokk.setWindowTheme({ glass: c.glass, blur: c.windowBlur });
    document.body.classList.toggle('window-blur', blur);
    return needsRestart;
  }
  async function ouvrirReglages() {
    const blurOk = await window.brokk.blurSupported();
    const version = await window.brokk.version();
    const swatches = el('div', { className: 'accent-swatches' });
    // Ce que Claude fait sans demander, pour de bon (les familles d'actions, voir ../commun/claude.js).
    const familles = ((await window.claude.autorisations?.().catch(() => [])) || []).filter((f) => f.gardable);
    const v = await Dialogs.form({
      title: 'Réglages de Brokk',
      okLabel: 'Enregistrer',
      width: 480,
      fields: [
        { key: 'accentColor', label: 'Couleur d\'accent', type: 'color', value: config.accentColor },
        { type: 'element', element: swatches },
        { key: 'glass', label: 'Verre dépoli (glassmorphism)', type: 'checkbox', value: config.glass },
        { key: 'windowBlur', label: blurOk ? 'Flou de Windows 11 derrière la fenêtre' : 'Flou de Windows 11 (non disponible ici)', type: 'checkbox', value: config.windowBlur },
        { key: 'webpQuality', label: 'Qualité WebP par défaut', type: 'range', value: config.webpQuality, min: 30, max: 100, unit: '%' },
        { key: 'jpegQuality', label: 'Qualité JPEG par défaut', type: 'range', value: config.jpegQuality, min: 30, max: 100, unit: '%' },
        { key: 'claudeModel', label: 'Modèle de Loki (propulsé par Claude)', type: 'select', value: config.claudeModel || '', choices: [['', 'Par défaut (celui de Claude Code)'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']] },
        { key: 'claudeCommand', label: 'Commande Claude Code', type: 'text', value: config.claudeCommand || 'claude' },
        { key: 'claudeCommandes', label: 'Loki peut lancer des commandes (PowerShell, Python…) : plus lent, rarement utile', type: 'checkbox', value: Boolean(config.claudeCommandes) },
        ...(familles.length ? [
          { type: 'info', text: 'Loki fait sans me demander la permission, pour de bon :' },
          ...familles.map((f) => ({ key: `sansDemander-${f.id}`, label: f.libelle, type: 'checkbox', value: f.toujours })),
          { type: 'info', text: 'Lire et regarder ne demande jamais. Ce qui est permis seulement pour la conversation en cours se voit et se retire avec le bouclier, en haut du panneau Loki.' },
        ] : []),
        { type: 'info', text: `Les qualités par défaut servent aux nouveaux assets ; chaque asset garde la sienne (panneau Réglages).\n\nBrokk ${version}. Réglages enregistrés dans ${configPath}.` },
      ],
      onInput(values, f) {
        if (!swatches.childElementCount) {
          for (const c of ACCENTS) {
            swatches.append(el('button', { type: 'button', className: 'mini-swatch', style: `background:${c}`, onclick: () => f.setValue('accentColor', c) }));
          }
        }
        // Aperçu immédiat de la couleur et du verre.
        document.documentElement.style.setProperty('--accent', values.accentColor);
        document.body.classList.toggle('glass', values.glass);
      },
    });
    if (!v) return applyTheme(config);
    // Les cases « sansDemander-… » deviennent config.claudeSansDemander = { dessin: true, … }.
    if (familles.length) {
      v.claudeSansDemander = {};
      for (const f of familles) { if (v[`sansDemander-${f.id}`]) v.claudeSansDemander[f.id] = true; delete v[`sansDemander-${f.id}`]; }
    }
    config = await window.brokk.writeConfig(v);
    if (await applyTheme(config)) notify('Le flou de Windows 11 sera actif au prochain démarrage de Brokk.', 'info', 6000);
  }

  // --- Projets ---
  async function choisirProjet() {
    try {
      const p = await window.brokk.choisirProjet();
      if (p) await chargerProjet(p);
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }
  async function ouvrirProjet(dossier) {
    try {
      await chargerProjet(await window.brokk.ouvrirProjet(dossier));
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }
  async function chargerProjet(p) {
    projet = p;
    ({ config } = await window.brokk.readConfig());
    assets = (config.projets[p.dossier]?.assets || []).map((a) => ({ ...a }));
    courantId = assets[0]?.id || null;
    calculs.clear();
    $('#accueil').hidden = true;
    $('#layout').hidden = false;
    for (const id of ['#btn-projet', '#btn-surveiller', '#btn-tout']) $(id).hidden = false;
    $('#projet-nom').textContent = p.nom;
    $('#projet-type').textContent = p.type;
    $('#status-projet').textContent = `${p.dossier}${p.indexHtml ? ` · ${p.indexHtml}` : ''}${p.publicDir ? ` · icônes dans ${p.publicDir}/` : ''}`;
    $('#status-export').textContent = '';
    document.title = `${p.nom} · Brokk`;
    await surveiller(Boolean(config.surveiller));
    rendreTout();
  }

  // Menu du bouton projet : projets récents, autre dossier, ouvrir dans l'Explorateur.
  async function menuProjet() {
    const recents = (await window.brokk.projetsRecents()).filter((d) => d !== projet?.dossier).slice(0, 8);
    const items = recents.map((d) => [nomFichier(d), () => ouvrirProjet(d), d]);
    if (items.length) items.push(null);
    items.push(['Choisir un autre projet…', choisirProjet, 'Ctrl+O']);
    if (projet) items.push(['Ouvrir le dossier du projet', () => window.brokk.montrer(projet.dossier, '.')]);
    ouvrirMenu($('#btn-projet'), items);
  }

  function ouvrirMenu(ancre, items) {
    $$('.menu').forEach((m) => m.remove());
    const menu = el('div', { className: 'menu' });
    for (const item of items) {
      if (!item) { menu.append(el('div', { className: 'menu-sep' })); continue; }
      const [label, run, keys] = item;
      const b = el('button', { className: 'menu-item' }, el('span', { className: 'menu-label', textContent: label }), keys ? el('span', { className: 'menu-keys', textContent: keys }) : null);
      b.onclick = () => { menu.remove(); run(); };
      menu.append(b);
    }
    const r = ancre.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 4}px`;
    document.body.append(menu);
    setTimeout(() => document.addEventListener('pointerdown', function fermer(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', fermer); }
    }));
  }

  // --- Ajouter des images ---
  async function ajouter(chemins) {
    if (!projet) return notify('Choisis d\'abord un projet.', 'warning');
    if (!chemins) chemins = await window.brokk.choisirSources(projet.dossier);
    for (const chemin of chemins) {
      try {
        const source = await Sources.get(chemin);
        const asset = await dialogueNouvelAsset(source);
        if (!asset) continue;
        assets.push(asset);
        courantId = asset.id;
        sauver();
        rendreTout();
      } catch (err) {
        notify(cleanError(err), 'error');
      }
    }
    if (config.surveiller) surveiller(true);
  }

  // Petite fenêtre : quelle recette pour cette image (et quel calque pour un PSD) ?
  async function dialogueNouvelAsset(source) {
    const calques = source.type === 'psd' ? source.calques : [];
    let recette = Recettes.deviner(source.canvas, source);
    const choix = el('div', { className: 'recette-choix' });
    const dessinerChoix = () => {
      choix.innerHTML = '';
      for (const id of Recettes.liste) {
        const r = Recettes.get(id);
        const b = el('button', { type: 'button', className: `recette-option${id === recette ? ' actif' : ''}` },
          el('i', { className: `codicon codicon-${r.icone}` }),
          el('div', {}, el('b', { textContent: r.nom }), el('span', { textContent: r.description })));
        b.onclick = () => { recette = id; dessinerChoix(); };
        choix.append(b);
      }
    };
    dessinerChoix();
    const v = await Dialogs.form({
      title: `Exporter ${source.nom}`,
      okLabel: 'Ajouter',
      width: 560,
      fields: [
        { type: 'info', text: `${source.largeur} × ${source.hauteur} px${source.type === 'psd' ? ` · ${calques.length} calque(s) et groupe(s)` : ''}${source.type === 'svg' ? ' · vectoriel' : ''}` },
        ...(calques.length ? [{ key: 'calque', label: 'Calque', type: 'select', value: '', choices: choixCalques(calques) }] : []),
        { key: 'nom', label: 'Nom des fichiers', type: 'text', value: slug(source.nom.replace(/\.[^.]+$/, '')) },
        { type: 'element', element: choix },
      ],
    });
    if (!v) return null;
    const asset = { id: nouvelId(), source: source.chemin, calque: v.calque || null, rogner: Boolean(v.calque), recette, nom: slug(v.nom), dossier: '', options: {}, memo: {} };
    if (asset.calque && v.nom === slug(source.nom.replace(/\.[^.]+$/, ''))) asset.nom = slug(asset.calque.split(' / ').pop());
    const ctx = contexteDe(asset, source);
    asset.options = Recettes.get(recette).defauts(ctx);
    asset.dossier = Recettes.get(recette).dossier(projet);
    if (recette === 'og' && asset.nom === slug(source.nom.replace(/\.[^.]+$/, ''))) asset.nom = 'og-image';
    return asset;
  }

  function choixCalques(calques) {
    return [['', 'Image entière'], ...calques.map((c) => [c.chemin, `${' '.repeat(c.profondeur)}${c.groupe ? '▸ ' : ''}${c.nom}${c.cache ? ' (caché)' : ''}`])];
  }

  // --- Calcul des sorties d'un asset ---
  function contexteDe(asset, source) {
    return { projet, source, image: Sources.image(source, asset.calque, asset.rogner), config };
  }

  // Les fichiers que l'asset va produire. Recalculé seulement si un réglage ou la source a changé.
  async function calculer(asset) {
    const source = await Sources.get(asset.source);
    const cle = JSON.stringify([asset.recette, asset.options, asset.nom, asset.dossier, asset.calque, asset.rogner, source.modifie, projet.dossier]);
    const deja = calculs.get(asset.id);
    if (deja && deja.cle === cle) return deja;
    const ctx = contexteDe(asset, source);
    const recette = Recettes.get(asset.recette);
    const sorties = recette.sorties(asset, ctx);
    const calcul = { cle, ctx, sorties, code: recette.code(asset, ctx) };
    calculs.set(asset.id, calcul);
    return calcul;
  }

  // Encoder une sortie (une seule fois) : ses octets servent au poids affiché et à l'écriture.
  function octets(sortie) {
    if (!sortie.promesse) sortie.promesse = sortie.produire();
    return sortie.promesse;
  }

  // --- Affichage ---
  function rendreTout() {
    rendreListe();
    rendreApercu();
    rendreReglages();
  }

  function rendreListe() {
    const liste = $('#assets');
    liste.innerHTML = '';
    for (const a of assets) {
      const r = Recettes.get(a.recette);
      const vignette = el('canvas', { className: 'vignette checker' });
      const li = el('li', { className: `asset${a.id === courantId ? ' actif' : ''}`, title: a.source },
        vignette,
        el('div', { className: 'asset-texte' },
          el('span', { className: 'asset-nom', textContent: a.recette === 'favicon' ? 'Favicon et icônes' : a.nom }),
          el('span', { className: 'asset-recette' }, el('i', { className: `codicon codicon-${r.icone}` }), r.nom),
          el('span', { className: 'asset-source', textContent: `${nomFichier(a.source)}${a.calque ? ` › ${a.calque}` : ''}` })),
        a.etat ? el('span', { className: `etat ${a.etat}`, title: a.etat === 'ok' ? 'Exporté' : 'Erreur au dernier export' }) : null);
      li.onclick = () => { courantId = a.id; rendreTout(); };
      liste.append(li);
      // Miniature : l'image de l'asset (le calque choisi, rogné…), dessinée dès que la source est lue.
      Sources.get(a.source).then((source) => {
        const img = fit(Sources.image(source, a.calque, a.rogner), 88, 88);
        vignette.width = 88; vignette.height = 88;
        vignette.getContext('2d').drawImage(img, 0, 0);
      }).catch(() => { li.classList.add('introuvable'); li.title = `Image introuvable : ${a.source}`; });
    }
    $('#vide').hidden = assets.length > 0;
    $('#apercu').hidden = assets.length === 0;
    $('#col-reglages').hidden = assets.length === 0;
  }

  let rendu = 0; // évite qu'un ancien calcul, plus lent, écrase l'affichage d'un plus récent
  async function rendreApercu() {
    const asset = courant();
    if (!asset) return;
    const numero = ++rendu;
    const recette = Recettes.get(asset.recette);
    $('#apercu-icone').className = `codicon codicon-${recette.icone}`;
    $('#apercu-nom').textContent = recette.nom;
    let calcul;
    try {
      calcul = await calculer(asset);
    } catch (err) {
      if (numero !== rendu) return;
      $('#sorties').innerHTML = '';
      $('#sorties').append(el('p', { className: 'note alerte', textContent: cleanError(err) }));
      $('#code').textContent = '';
      $('#apercu-resume').textContent = '';
      return;
    }
    if (numero !== rendu) return;
    const { sorties } = calcul;
    const dossiers = [...new Set(sorties.map((s) => s.rel.split('/').slice(0, -1).join('/') || '.'))];
    $('#apercu-resume').textContent = `${sorties.length} fichier(s) → ${dossiers.map((d) => (d === '.' ? 'racine du projet' : `${d}/`)).join(', ')}`;
    const grille = $('#sorties');
    grille.innerHTML = '';
    let total = 0, prets = 0;
    for (const s of sorties) {
      const image = el('div', { className: 'image checker' });
      if (s.canvas) {
        const c = el('canvas');
        c.width = s.canvas.width; c.height = s.canvas.height;
        c.getContext('2d').drawImage(s.canvas, 0, 0);
        // Les toutes petites icônes (16, 32, 48 px) sont montrées agrandies, pixels visibles.
        if (s.canvas.width <= 64) { image.classList.add('petite'); c.style.width = `${Math.min(96, s.canvas.width * 2)}px`; }
        image.append(c);
      } else if (s.texte) {
        image.classList.remove('checker');
        image.append(el('div', { className: 'fichier-texte', textContent: s.texte }));
      }
      const poids = el('span', { className: 'poids', textContent: '…' });
      const tag = el('span', { className: 'tag' });
      const carte = el('div', { className: 'sortie', title: s.rel },
        image,
        el('div', { className: 'infos' },
          el('span', { className: 'nom', textContent: s.rel.split('/').pop() }),
          el('div', { className: 'details' }, el('span', { textContent: s.largeur ? `${s.largeur} × ${s.hauteur}` : s.format.toUpperCase() }), tag, poids),
          s.note ? el('span', { className: `note${s.alerte ? ' alerte' : ''}`, textContent: s.note }) : null));
      s.carte = carte;
      grille.append(carte);
      octets(s).then((b) => {
        poids.textContent = formatSize(b.byteLength);
        total += b.byteLength;
        if (++prets === sorties.length && numero === rendu) $('#code-info').textContent = `${sorties.length} fichier(s), ${formatSize(total)} en tout`;
      }).catch((err) => { poids.textContent = 'erreur'; poids.title = cleanError(err); });
      // Ce fichier existe-t-il déjà dans le projet ? (il sera remplacé)
      if (!s.ecrit) {
        window.brokk.existe(projet.dossier, s.rel).then((existe) => {
          tag.className = `tag ${existe ? 'remplace' : 'nouveau'}`;
          tag.textContent = existe ? 'remplacera' : 'nouveau';
          tag.title = existe ? 'Un fichier de ce nom existe déjà : l\'export le remplacera' : 'Ce fichier n\'existe pas encore dans le projet';
        }).catch(() => {});
      } else {
        tag.className = 'tag ecrit';
        tag.textContent = 'écrit ✓';
      }
    }
    $('#code').textContent = calcul.code;
    $('#code-info').textContent = `${sorties.length} fichier(s)`;
    if (asset.recette === 'favicon' && asset.options.indexHtml && projet.indexHtml) $('#code-info').textContent += ` · posé tout seul dans ${projet.indexHtml} à l'export`;
  }

  // Les réglages de l'asset choisi, construits à partir de la recette (aucun JSON à écrire).
  let recalculTimer = null;
  function changer(asset, modif, { reglages = false } = {}) {
    modif(asset);
    if (asset.recette && asset.options) asset.memo = { ...asset.memo, [asset.recette]: asset.options };
    asset.etat = null;
    sauver();
    clearTimeout(recalculTimer);
    recalculTimer = setTimeout(() => { rendreListe(); rendreApercu(); if (reglages) rendreReglages(); }, 180);
  }

  function champ(f, valeur, onChange) {
    const row = el('label', { className: `field field-${f.type}${f.type === 'checkbox' ? ' checkbox-row' : ''}${f.disabled ? ' desactive' : ''}` });
    let input;
    if (f.type === 'select') {
      input = el('select');
      for (const [v, l] of f.choices) input.add(new Option(l, v));
      input.value = valeur ?? '';
    } else {
      input = el('input', { type: f.type === 'range' ? 'range' : f.type });
      // Bornes d'abord : un curseur limite sa valeur à 0–100 tant qu'il ne connaît pas min et max.
      for (const k of ['min', 'max', 'step', 'placeholder']) if (f[k] !== undefined) input.setAttribute(k, f[k]);
      if (f.list) input.setAttribute('list', f.list);
      if (f.type === 'checkbox') input.checked = Boolean(valeur);
      else input.value = valeur ?? '';
    }
    if (f.disabled) input.disabled = true;
    const lire = () => (f.type === 'checkbox' ? input.checked : f.type === 'number' || f.type === 'range' ? Number(input.value) : input.value);
    row.append(el('span', { className: 'field-label', textContent: f.label }), input);
    if (f.type === 'range') {
      const nombre = el('input', { type: 'number', className: 'range-number', value: valeur });
      for (const k of ['min', 'max', 'step']) if (f[k] !== undefined) nombre.setAttribute(k, f[k]);
      nombre.oninput = () => { input.value = nombre.value; onChange(Number(nombre.value)); };
      input.addEventListener('input', () => { nombre.value = input.value; });
      row.append(nombre);
    }
    if (f.unit) row.append(el('span', { className: 'unit', textContent: f.unit }));
    input.addEventListener(f.type === 'select' || f.type === 'checkbox' || f.type === 'color' ? 'change' : 'input', () => onChange(lire()));
    if (f.type === 'color') input.addEventListener('input', () => onChange(lire()));
    const out = [row];
    if (f.aide) out.push(el('p', { className: 'aide', textContent: f.aide }));
    if (f.hidden) out.forEach((n) => { n.hidden = true; });
    return out;
  }

  async function rendreReglages() {
    const asset = courant();
    const zone = $('#reglages');
    if (!asset) { zone.innerHTML = ''; return; }
    let source;
    try {
      source = await Sources.get(asset.source);
    } catch (err) {
      zone.innerHTML = '';
      zone.append(el('p', { className: 'modal-info', textContent: `${cleanError(err)}\n\nL'image a été déplacée ou supprimée : choisis-la de nouveau.` }), el('button', { className: 'button', textContent: 'Choisir l\'image…', onclick: () => changerSource(asset) }));
      return;
    }
    if (asset.id !== courantId) return;
    const ctx = contexteDe(asset, source);
    const recette = Recettes.get(asset.recette);
    const titre = (t) => el('h3', { className: 'groupe-titre', textContent: t });
    const nodes = [];

    // Source
    nodes.push(titre('Image'));
    const ligne = el('div', { className: 'source-ligne', title: asset.source }, el('img', { className: 'checker', src: source.miniature.toDataURL() }),
      el('div', {}, el('b', { textContent: source.nom }), el('small', { textContent: `${source.largeur} × ${source.hauteur} px${source.type === 'svg' ? ' (vectoriel)' : ''}` }), el('span', { textContent: `\u200e${asset.source}` })));
    const changerBtn = el('button', { className: 'button small', textContent: 'Changer…', onclick: () => changerSource(asset) });
    changerBtn.style.marginLeft = 'auto';
    ligne.append(changerBtn);
    nodes.push(ligne);
    if (source.type === 'psd') {
      nodes.push(...champ({ type: 'select', label: 'Calque', choices: choixCalques(source.calques) }, asset.calque || '', (v) => changer(asset, (a) => { a.calque = v || null; a.rogner = Boolean(v); }, { reglages: true })));
    }
    nodes.push(...champ({ type: 'checkbox', label: 'Rogner les bords transparents', aide: source.type === 'psd' ? 'Utile pour un calque perdu au milieu d\'un grand document.' : null }, asset.rogner, (v) => changer(asset, (a) => { a.rogner = v; })));

    // Recette
    nodes.push(titre('Recette'));
    const choix = el('div', { className: 'recette-choix' });
    for (const id of Recettes.liste) {
      const r = Recettes.get(id);
      const b = el('button', { type: 'button', className: `recette-option${id === asset.recette ? ' actif' : ''}`, title: r.description },
        el('i', { className: `codicon codicon-${r.icone}` }), el('div', {}, el('b', { textContent: r.nom })));
      b.onclick = () => changerRecette(asset, id, ctx);
      choix.append(b);
    }
    nodes.push(choix, el('p', { className: 'aide', style: 'margin-left:0', textContent: recette.description }));

    // Fichiers
    nodes.push(titre('Fichiers'));
    if (asset.recette !== 'favicon') nodes.push(...champ({ type: 'text', label: 'Nom' }, asset.nom, (v) => changer(asset, (a) => { a.nom = slug(v); })));
    const suggestions = [...new Set([projet.publicDir, projet.publicDir && `${projet.publicDir}/img`, projet.assetsDir, 'src/assets', ''].filter((d) => d != null))];
    let liste = $('#dossiers-suggeres');
    if (!liste) { liste = el('datalist', { id: 'dossiers-suggeres' }); document.body.append(liste); }
    liste.innerHTML = '';
    for (const d of suggestions) liste.append(new Option(d || '(racine du projet)', d));
    nodes.push(...champ({ type: 'text', label: 'Dossier', list: 'dossiers-suggeres', placeholder: '(racine du projet)', aide: projet.publicDir ? `${projet.publicDir}/ : servi tel quel (adresse « / »). src/assets/ : importé et optimisé par Vite (adresse « @/ »).` : 'Relatif au dossier du projet.' }, asset.dossier, (v) => changer(asset, (a) => { a.dossier = joinRel(v.trim()); })));

    // Réglages de la recette
    nodes.push(titre('Réglages'));
    for (const f of recette.champs(ctx)) {
      nodes.push(...champ(f, asset.options[f.key], (v) => changer(asset, (a) => { a.options = { ...a.options, [f.key]: v }; })));
    }
    nodes.push(el('button', { className: 'button small', textContent: 'Revenir aux réglages de départ', style: 'align-self:flex-start;margin-top:6px', onclick: () => changer(asset, (a) => { a.options = recette.defauts(ctx); }, { reglages: true }) }));

    zone.innerHTML = '';
    zone.append(...nodes);
  }

  function changerRecette(asset, id, ctx) {
    if (id === asset.recette) return;
    const avant = Recettes.get(asset.recette), apres = Recettes.get(id);
    changer(asset, (a) => {
      // Le dossier suit la recette, sauf si tu l'avais changé à la main.
      if (a.dossier === avant.dossier(projet)) a.dossier = apres.dossier(projet);
      a.recette = id;
      a.options = { ...apres.defauts(ctx), ...(a.memo?.[id] || {}) };
    }, { reglages: true });
  }

  async function changerSource(asset) {
    const [chemin] = await window.brokk.choisirSources(projet.dossier);
    if (!chemin) return;
    try {
      const source = await Sources.get(chemin);
      changer(asset, (a) => {
        a.source = source.chemin;
        if (a.calque && !(source.calques || []).some((c) => c.chemin === a.calque)) a.calque = null;
      }, { reglages: true });
      if (config.surveiller) surveiller(true);
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }

  function dupliquer() {
    const a = courant();
    if (!a) return;
    const copie = { ...JSON.parse(JSON.stringify(a)), id: nouvelId(), nom: `${a.nom}-2`, etat: null };
    assets.splice(assets.indexOf(a) + 1, 0, copie);
    courantId = copie.id;
    sauver();
    rendreTout();
  }

  async function supprimer() {
    const a = courant();
    if (!a) return;
    const ok = await Dialogs.ask('Retirer cet asset ?', `« ${a.recette === 'favicon' ? 'Favicon et icônes' : a.nom} » sera retiré de la liste de Brokk.\n\nLes fichiers déjà exportés dans le projet ne sont PAS supprimés, et l'image source non plus.`, [
      { label: 'Annuler', value: false },
      { label: 'Retirer', value: true, primary: true },
    ]);
    if (!ok) return;
    const i = assets.indexOf(a);
    assets.splice(i, 1);
    calculs.delete(a.id);
    courantId = assets[Math.min(i, assets.length - 1)]?.id || null;
    sauver();
    rendreTout();
    if (config.surveiller) surveiller(true);
  }

  // --- Exporter : écrire les fichiers dans le projet ---
  async function exporter(liste, { silencieux = false } = {}) {
    if (!projet || !liste.length) return;
    let ecrits = 0, remplaces = 0, octetsTotal = 0, erreurs = 0;
    const balisesPosees = [];
    for (const asset of liste) {
      try {
        const { sorties, ctx } = await calculer(asset);
        for (const s of sorties) {
          const r = await window.brokk.ecrire(projet.dossier, s.rel, await octets(s));
          ecrits++;
          if (r.existait) remplaces++;
          octetsTotal += r.taille;
          s.ecrit = true;
        }
        // Favicon : les balises dans index.html, entre les repères <!-- brokk:icones -->.
        if (asset.recette === 'favicon' && asset.options.indexHtml && projet.indexHtml) {
          const r = await window.brokk.baliserIndex(projet.dossier, projet.indexHtml, Recettes.favicon.balises(asset, ctx));
          if (r.modifie) balisesPosees.push(r);
        }
        asset.etat = 'ok';
      } catch (err) {
        erreurs++;
        asset.etat = 'erreur';
        notify(`${asset.nom} : ${cleanError(err)}`, 'error');
      }
    }
    const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    $('#status-export').textContent = `Dernier export à ${heure} : ${ecrits} fichier(s), ${formatSize(octetsTotal)}${remplaces ? `, dont ${remplaces} remplacé(s)` : ''}`;
    rendreListe();
    rendreApercu();
    if (silencieux && !erreurs) return { ecrits };
    if (ecrits) {
      let message = `${ecrits} fichier(s) écrit(s) dans ${projet.nom}${remplaces ? ` (${remplaces} remplacé(s))` : ''}.`;
      for (const b of balisesPosees) {
        message += ` Balises des icônes posées dans ${projet.indexHtml}`;
        message += b.retirees.length ? ` (${b.retirees.length} ancienne(s) balise(s) d'icône retirée(s)).` : '.';
      }
      notify(message, erreurs ? 'warning' : 'success', 6000, [{ label: 'Voir les fichiers', run: () => window.brokk.montrer(projet.dossier, liste.length === 1 ? (liste[0].dossier || '.') : '.') }]);
    }
    return { ecrits };
  }

  // --- Surveillance : ré-exporter quand une source change ---
  async function surveiller(actif) {
    const fichiers = actif ? [...new Set(assets.map((a) => a.source))] : [];
    await window.brokk.surveiller(fichiers);
    $('#btn-surveiller').classList.toggle('actif', actif);
    $('#btn-surveiller').title = actif
      ? `Surveillance allumée : quand tu enregistres une des ${fichiers.length} image(s) source (dans Photoshop, Skald…), ses assets sont ré-exportés tout seuls. Clique pour l'éteindre.`
      : 'Ré-exporter tout seul quand une source est enregistrée (dans Photoshop, Skald…)';
  }
  async function basculerSurveillance() {
    config = await window.brokk.writeConfig({ surveiller: !config.surveiller });
    await surveiller(config.surveiller);
    notify(config.surveiller ? 'Surveillance allumée : enregistre ton PSD, Brokk ré-exporte ses assets tout seul.' : 'Surveillance éteinte.', 'info', 4000);
  }

  window.brokk.onSourceModifiee(async (chemin) => {
    Sources.oublier(chemin);
    const touches = assets.filter((a) => a.source === chemin);
    for (const a of touches) calculs.delete(a.id);
    if (!touches.length) return;
    if (config.surveiller) {
      const r = await exporter(touches, { silencieux: true });
      if (r?.ecrits) notify(`${nomFichier(chemin)} a changé : ${r.ecrits} fichier(s) ré-exporté(s).`, 'success', 4000);
    } else {
      rendreListe();
      rendreApercu();
    }
    rendreReglages();
  });

  // --- Glisser-déposer des images depuis l'Explorateur ---
  const layout = $('#layout');
  let profondeur = 0;
  layout.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { profondeur++; layout.classList.add('drop-target'); } });
  layout.addEventListener('dragleave', () => { if (--profondeur <= 0) { profondeur = 0; layout.classList.remove('drop-target'); } });
  layout.addEventListener('dragover', (e) => e.preventDefault());
  layout.addEventListener('drop', (e) => {
    e.preventDefault();
    profondeur = 0;
    layout.classList.remove('drop-target');
    const chemins = [...e.dataTransfer.files].map((f) => window.brokk.pathOfDropped(f)).filter(Boolean);
    if (chemins.length) ajouter(chemins);
  });
  // Rien ne doit remplacer la page si on lâche à côté.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // --- Raccourcis clavier ---
  window.addEventListener('keydown', (e) => {
    if (Dialogs.isOpen()) { if (e.key === 'Escape') Dialogs.close(null); return; }
    const k = e.key.toLowerCase();
    const saisie = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (e.ctrlKey && !e.altKey) {
      if (k === 'o') { e.preventDefault(); choisirProjet(); } else if (k === 'n' && projet) { e.preventDefault(); ajouter(); } else if (k === 'e' && e.shiftKey && projet) { e.preventDefault(); exporter(assets); } else if (k === 'e' && projet) { e.preventDefault(); if (courant()) exporter([courant()]); } else if (e.key === ',') { e.preventDefault(); ouvrirReglages(); }
      return;
    }
    if (!saisie && e.key === 'Delete') supprimer();
    if (!saisie && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && assets.length) {
      e.preventDefault();
      const i = assets.findIndex((a) => a.id === courantId) + (e.key === 'ArrowDown' ? 1 : -1);
      courantId = assets[Math.max(0, Math.min(assets.length - 1, i))].id;
      rendreTout();
    }
  });

  // --- Boutons ---
  $('#accueil-choisir').onclick = choisirProjet;
  $('#btn-projet').onclick = menuProjet;
  $('#btn-tout').onclick = () => (assets.length ? exporter(assets) : notify('Ajoute d\'abord une image.', 'info'));
  $('#btn-surveiller').onclick = basculerSurveillance;
  $('#btn-reglages').onclick = ouvrirReglages;
  $('#asset-ajouter').onclick = () => ajouter();
  $('#vide-ajouter').onclick = () => ajouter();
  $('#asset-dupliquer').onclick = dupliquer;
  $('#asset-supprimer').onclick = supprimer;
  $('#btn-exporter').onclick = () => courant() && exporter([courant()]);
  $('#btn-dossier').onclick = () => courant() && window.brokk.montrer(projet.dossier, courant().dossier || '.').catch((err) => notify(cleanError(err), 'error'));
  $('#btn-copier').onclick = async () => {
    await window.brokk.copierTexte($('#code').textContent);
    notify('Code copié : colle-le dans ton fichier (Ctrl+V).', 'success', 2500);
  };

  async function rendreAccueil() {
    const recents = await window.brokk.projetsRecents();
    const liste = $('#accueil-recents');
    liste.innerHTML = '';
    $('#accueil-recents-titre').hidden = !recents.length;
    for (const d of recents.slice(0, 8)) {
      const b = el('button', { className: 'recent', onclick: () => ouvrirProjet(d) },
        el('i', { className: 'codicon codicon-folder' }), el('span', { className: 'recent-name', textContent: nomFichier(d) }), el('span', { className: 'recent-path', textContent: `\u200e${d}` }));
      liste.append(b);
    }
  }

  // --- Pour Claude (claude-actions.js) : les mêmes fonctions que les boutons, sans les fenêtres ---
  async function ajouterSansDialogue(chemin, { recette, nom, calque } = {}) {
    if (!projet) throw new Error('Aucun projet ouvert dans Brokk.');
    const source = await Sources.get(chemin);
    if (calque && !(source.calques || []).some((c) => c.chemin === calque)) {
      throw new Error(`Pas de calque « ${calque} » dans ${source.nom}${source.calques?.length ? ` : ${source.calques.map((c) => c.chemin).join(', ')}` : ''}.`);
    }
    const base = slug(source.nom.replace(/\.[^.]+$/, ''));
    const asset = { id: nouvelId(), source: source.chemin, calque: calque || null, rogner: Boolean(calque), recette: null, nom: '', dossier: '', options: {}, memo: {} };
    const ctx = contexteDe(asset, source);
    asset.recette = recette || Recettes.deviner(ctx.image, source);
    if (!Recettes.get(asset.recette)) throw new Error(`Recette inconnue : ${asset.recette} (${Recettes.liste.join(', ')}).`);
    asset.nom = slug(nom || (calque ? calque.split(' / ').pop() : asset.recette === 'og' ? 'og-image' : base));
    asset.options = Recettes.get(asset.recette).defauts(ctx);
    asset.dossier = Recettes.get(asset.recette).dossier(projet);
    assets.push(asset);
    courantId = asset.id;
    sauver();
    rendreTout();
    if (config.surveiller) surveiller(true);
    return asset;
  }
  async function regler(asset, { recette, options, nom, dossier, source, calque, rogner }) {
    if (source) {
      const s = await Sources.get(source);
      changer(asset, (a) => {
        a.source = s.chemin;
        if (a.calque && !(s.calques || []).some((c) => c.chemin === a.calque)) a.calque = null;
      });
      if (config.surveiller) surveiller(true);
    }
    if (calque !== undefined) {
      const s = await Sources.get(asset.source);
      if (calque && !(s.calques || []).some((c) => c.chemin === calque)) throw new Error(`Pas de calque « ${calque} » dans ${s.nom}${s.calques?.length ? ` : ${s.calques.map((c) => c.chemin).join(', ')}` : ' (ce n\'est pas un PSD)'}.`);
      changer(asset, (a) => { a.calque = calque || null; a.rogner = Boolean(calque); });
    }
    if (rogner !== undefined) changer(asset, (a) => { a.rogner = Boolean(rogner); });
    if (recette && recette !== asset.recette) {
      if (!Recettes.get(recette)) throw new Error(`Recette inconnue : ${recette} (${Recettes.liste.join(', ')}).`);
      changerRecette(asset, recette, contexteDe(asset, await Sources.get(asset.source)));
    }
    changer(asset, (a) => {
      if (options) a.options = { ...a.options, ...options };
      if (nom) a.nom = slug(nom);
      if (dossier !== undefined) a.dossier = String(dossier).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    }, { reglages: true });
  }
  function retirer(asset) {
    const i = assets.indexOf(asset);
    if (i < 0) return;
    assets.splice(i, 1);
    calculs.delete(asset.id);
    if (courantId === asset.id) courantId = assets[Math.min(i, assets.length - 1)]?.id || null;
    sauver();
    rendreTout();
    if (config.surveiller) surveiller(true);
  }
  function choisir(asset) {
    courantId = asset.id;
    rendreTout();
  }
  function dupliquerAsset(asset) {
    courantId = asset.id;
    dupliquer();
    return courant();
  }
  async function allumerSurveillance(actif) {
    if (Boolean(config.surveiller) !== Boolean(actif)) await basculerSurveillance();
  }

  return {
    claude: {
      projet: () => projet,
      assets: () => assets,
      courant,
      calculer,
      octets,
      ouvrirProjet: (dossier) => window.brokk.ouvrirProjet(dossier).then(chargerProjet),
      ajouter: ajouterSansDialogue,
      regler,
      retirer,
      choisir,
      exporter,
      dupliquer: dupliquerAsset,
      surveiller: allumerSurveillance,
      surveillance: () => Boolean(config.surveiller),
      source: (chemin) => Sources.get(chemin),
    },
    async start() {
      const lu = await window.brokk.readConfig();
      config = lu.config;
      configPath = lu.path;
      await applyTheme(config);
      await rendreAccueil();
      // Projet ouvert depuis Atelier (clic droit sur un projet › Exporter les assets avec Brokk).
      window.brokk.onProjetExterne((dossier) => ouvrirProjet(dossier));
      window.brokk.onSourcesExternes((fichiers) => ajouter(fichiers));
      const { dossier, fichiers } = await window.brokk.demarrage();
      if (dossier) await ouvrirProjet(dossier);
      else if (config.projetsRecents[0]) {
        // Sinon, on rouvre le dernier projet (s'il existe encore).
        const recents = await window.brokk.projetsRecents();
        if (recents[0]) await ouvrirProjet(recents[0]);
      }
      if (fichiers.length && projet) ajouter(fichiers);
    },
  };
})();

App.start();
