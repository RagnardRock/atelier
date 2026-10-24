// Tafl 0.22 : générer des tuiles avec ComfyUI, sur la carte graphique de Ragna, sans voir ComfyUI.
//
// ComfyUI, ce sont deux choses : un « moteur » écrit en Python (il fait les calculs sur la carte
// graphique) et une page web où l'on branche des nœuds. Tafl n'a besoin que du moteur :
// - il cherche où ComfyUI est installé (ComfyUI Desktop, la version portable, ou un dossier choisi) ;
// - il démarre le moteur en arrière-plan, sans fenêtre (windowsHide), sur 127.0.0.1 seulement ;
// - il lui envoie la recette de l'image (le « graphe », construit dans renderer/comfy.js), récupère
//   les images, puis l'arrête quand Tafl se ferme.
// Si un ComfyUI tourne déjà (l'application ComfyUI ouverte), Tafl s'en sert et ne l'arrête pas.
//
// Tout ce que fait ce fichier est écrit dans le journal de Tafl (tafl.log) : en cas de souci,
// « Générer › Installation et réglages de ComfyUI… » montre aussi les dernières lignes du moteur.

const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

const PORT = 8189; // pas 8188 (ComfyUI ordinaire) ni 8000 (ComfyUI Desktop) : pas de conflit
const PORTS_CONNUS = [8188, 8000, 8001];
const DOSSIERS_MODELES = ['checkpoints', 'loras', 'vae', 'diffusion_models', 'unet', 'text_encoders', 'clip', 'clip_vision', 'embeddings', 'upscale_models', 'controlnet'];

// Les modèles que Tafl sait installer lui-même (bouton « Télécharger » de la fenêtre d'installation).
const CATALOGUE = [
  {
    id: 'pixel-art-xl',
    nom: 'Pixel Art XL (LoRA pour SDXL)',
    pourquoi: 'donne un vrai style pixel art aux modèles SDXL (DreamShaper XL, Juggernaut XL…)',
    dossier: 'loras',
    fichier: 'pixel-art-xl.safetensors',
    taille: '170 Mo',
    url: 'https://huggingface.co/nerijs/pixel-art-xl/resolve/main/pixel-art-xl.safetensors',
  },
];
// Téléchargements permis : seulement ces sites, en https.
const SITES = ['huggingface.co', 'civitai.com'];

function creer({ log, dossierTafl }) {
  const etat = {
    proc: null, // le moteur lancé par Tafl
    port: null, // le port du moteur utilisé (le nôtre ou un ComfyUI déjà ouvert)
    nous: false, // true : c'est Tafl qui l'a lancé (et qui l'arrêtera)
    demarrage: null, // promesse pendant le démarrage
    lignes: [], // les dernières lignes écrites par le moteur
    dernierUsage: 0,
    pidAdopte: 0, // un moteur lancé par un Tafl précédent qui s'est mal fermé : on l'arrêtera aussi
  };
  const fichierPid = () => path.join(dossierTafl, 'comfyui', 'moteur.pid');
  const noter = (ligne) => {
    for (const l of String(ligne).split(/\r?\n/)) {
      if (!l.trim()) continue;
      etat.lignes.push(l);
      if (etat.lignes.length > 200) etat.lignes.shift();
    }
  };
  const existe = (p) => { try { return Boolean(p) && fsSync.existsSync(p); } catch { return false; } };
  const estDossier = (p) => { try { return fsSync.statSync(p).isDirectory(); } catch { return false; } };
  const sousDossiers = (p) => { try { return fsSync.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(p, d.name)); } catch { return []; } };

  // --- Trouver ComfyUI ---
  // Le code de ComfyUI : un dossier avec main.py, nodes.py et le dossier comfy/.
  const estCode = (d) => existe(path.join(d, 'main.py')) && existe(path.join(d, 'nodes.py')) && estDossier(path.join(d, 'comfy'));
  const IGNORER = new Set(['node_modules', '.git', 'models', 'output', 'input', 'temp', 'custom_nodes', 'user', 'site-packages', 'Lib', 'lib', '__pycache__', 'web', 'comfy', 'comfy_extras']);
  // Parcourt un dossier jusqu'à `profondeur` niveaux et renvoie les dossiers qui vérifient `test`.
  function chercher(racine, test, profondeur, trouves = []) {
    if (!estDossier(racine) || trouves.length > 20) return trouves;
    if (test(racine)) { trouves.push(racine); return trouves; }
    if (profondeur <= 0) return trouves;
    // Les dossiers ignorés (models, output…) peuvent être ce qu'on cherche, mais on ne descend pas dedans.
    for (const d of sousDossiers(racine)) if (!IGNORER.has(path.basename(d)) || test(d)) chercher(d, test, profondeur - 1, trouves);
    return trouves;
  }
  // Les chemins écrits dans un fichier de réglages de ComfyUI (config.json, installations.json, .yaml).
  function cheminsDans(fichier) {
    try {
      const texte = fsSync.readFileSync(fichier, 'utf8');
      const vus = new Set();
      for (const m of texte.matchAll(/([A-Za-z]:(?:\\\\|\\|\/)[^"'\n\r]+|\/(?:home|Users|mnt|opt)\/[^"'\n\r]+)/g)) {
        const p = m[1].replace(/\\\\/g, '\\').trim().replace(/[,}\]]+$/, '');
        if (estDossier(p)) vus.add(p);
      }
      return [...vus];
    } catch { return []; }
  }
  function racines(config) {
    const env = process.env;
    const home = os.homedir();
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const roaming = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const liste = [];
    if (config.dossier) liste.push(config.dossier);
    for (const f of [path.join(roaming, 'ComfyUI', 'config.json'), path.join(roaming, 'ComfyUI', 'extra_models_config.yaml'), path.join(roaming, 'Comfy Desktop', 'installations.json'), path.join(roaming, 'Comfy Desktop', 'config.json')]) liste.push(...cheminsDans(f));
    liste.push(
      path.join(local, 'Comfy-Desktop'),
      path.join(home, 'ComfyUI-Installs'),
      path.join(roaming, 'Comfy Desktop'),
      path.join(local, 'Programs', 'ComfyUI'),
      path.join(local, 'Programs', '@comfyorgcomfyui-electron'),
      path.join(local, 'Programs', 'Comfy Desktop'),
      path.join(home, 'Documents', 'ComfyUI'),
      path.join(home, 'ComfyUI'),
      path.join(home, 'Desktop', 'ComfyUI_windows_portable'),
      path.join(home, 'Downloads', 'ComfyUI_windows_portable'),
    );
    if (process.platform === 'win32') for (const lecteur of ['C:', 'D:', 'E:']) liste.push(`${lecteur}\\ComfyUI`, `${lecteur}\\ComfyUI_windows_portable`, `${lecteur}\\AI\\ComfyUI`);
    return [...new Set(liste.map((p) => path.resolve(p)))].filter(estDossier);
  }
  const PYTHONS = process.platform === 'win32'
    ? ['.venv/Scripts/python.exe', 'venv/Scripts/python.exe', 'python_embeded/python.exe', 'python_embedded/python.exe', 'python/python.exe', 'python.exe']
    : ['.venv/bin/python', 'venv/bin/python', 'python/bin/python3', 'bin/python3'];
  // Le Python à côté du code : dans le dossier du code ou un de ses parents (version portable :
  // ComfyUI_windows_portable\python_embeded à côté de ComfyUI\), sinon dans une des racines.
  function pythonPour(code, autres) {
    const lieux = [];
    for (let d = code, n = 0; n < 4; d = path.dirname(d), n++) lieux.push(d);
    lieux.push(...autres);
    for (const d of lieux) for (const p of PYTHONS) { const f = path.join(d, p); if (existe(f)) return f; }
    // Plus loin : un .venv ou un python_embeded rangé un ou deux niveaux plus bas.
    for (const d of lieux.slice(0, 2).concat(autres)) {
      const t = chercher(d, (x) => PYTHONS.some((p) => existe(path.join(x, p))), 2);
      for (const x of t) for (const p of PYTHONS) if (existe(path.join(x, p))) return path.join(x, p);
    }
    return '';
  }
  // Le dossier des modèles : un dossier « models » qui contient checkpoints/ (ou diffusion_models/).
  const estModeles = (d) => path.basename(d).toLowerCase() === 'models' && (estDossier(path.join(d, 'checkpoints')) || estDossier(path.join(d, 'diffusion_models')));
  const nbFichiers = (d) => DOSSIERS_MODELES.reduce((n, s) => n + fichiersModeles(path.join(d, s)).length, 0);
  function fichiersModeles(d) {
    try { return fsSync.readdirSync(d).filter((f) => /\.(safetensors|ckpt|pt|pth|bin|gguf)$/i.test(f)); } catch { return []; }
  }

  function trouver(config = {}) {
    const r = racines(config);
    const essais = [];
    let code = config.code && estCode(config.code) ? config.code : '';
    if (!code) {
      for (const d of r) {
        const t = chercher(d, estCode, 4);
        essais.push(`${d} : ${t.length ? t.join(', ') : 'pas de code ComfyUI'}`);
        if (t.length) { code = t[0]; break; }
      }
    }
    const python = config.python && existe(config.python) ? config.python : code ? pythonPour(code, r) : '';
    let modeles = config.modeles && estDossier(config.modeles) ? config.modeles : '';
    if (!modeles) {
      const candidats = [];
      if (code) candidats.push(path.join(code, 'models'));
      for (const d of r) candidats.push(...chercher(d, estModeles, 3));
      const bons = [...new Set(candidats)].filter(estModeles);
      // Celui qui a le plus de modèles (ComfyUI Desktop garde parfois un dossier vide à côté du vrai).
      bons.sort((a, b) => nbFichiers(b) - nbFichiers(a));
      modeles = bons[0] || '';
    }
    const fichiers = {};
    if (modeles) for (const s of DOSSIERS_MODELES) { const f = fichiersModeles(path.join(modeles, s)); if (f.length) fichiers[s] = f; }
    return { code, python, modeles, fichiers, racines: r, essais, pret: Boolean(code && python) };
  }

  // --- Parler au moteur (seulement sur cet ordinateur : 127.0.0.1) ---
  async function requete(chemin, { port = etat.port, methode = 'GET', corps, delai = 30000, octets = false } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), delai);
    try {
      const r = await fetch(`http://127.0.0.1:${port}${chemin}`, {
        method: methode,
        headers: corps ? { 'Content-Type': 'application/json' } : undefined,
        body: corps ? JSON.stringify(corps) : undefined,
        signal: ctrl.signal,
      });
      if (!r.ok) {
        const texte = await r.text().catch(() => '');
        throw new Error(`ComfyUI a répondu ${r.status}${texte ? ` : ${texte.slice(0, 800)}` : ''}`);
      }
      return octets ? Buffer.from(await r.arrayBuffer()) : r.json();
    } finally {
      clearTimeout(t);
    }
  }
  const repond = async (port) => { try { await requete('/system_stats', { port, delai: 1200 }); return true; } catch { return false; } };

  async function demarrer(config = {}, progres = () => {}) {
    if (etat.port && (await repond(etat.port))) return infos();
    if (etat.demarrage) return etat.demarrage;
    etat.demarrage = (async () => {
      // Un ComfyUI déjà ouvert (l'application ComfyUI, ou un lancé à la main) ?
      for (const port of [config.port || PORT, ...PORTS_CONNUS]) {
        if (await repond(port)) {
          // Sur notre port, avec notre fichier moteur.pid : c'est le moteur d'un Tafl qui s'est mal fermé.
          const pid = port === (config.port || PORT) ? Number(await fs.readFile(fichierPid(), 'utf8').catch(() => 0)) : 0;
          Object.assign(etat, { port, nous: Boolean(pid), pidAdopte: pid || 0 });
          log('INFO', `ComfyUI : déjà ouvert sur le port ${port}${pid ? ` (moteur ${pid} d'un Tafl précédent, repris)` : ''}`);
          return infos();
        }
      }
      const t = trouver(config);
      if (!t.code) throw new Error('ComfyUI est introuvable sur cet ordinateur. Ouvre « Générer › Installation et réglages de ComfyUI… » pour l\'installer ou choisir son dossier.');
      if (!t.python) throw new Error(`Le code de ComfyUI est dans ${t.code}, mais Tafl ne trouve pas son Python. Choisis-le dans « Installation et réglages de ComfyUI… ».`);
      // Les modèles de Ragna, où qu'ils soient : un petit fichier de chemins pour ComfyUI.
      const dossier = path.join(dossierTafl, 'comfyui');
      for (const d of ['entree', 'sortie', 'temp']) await fs.mkdir(path.join(dossier, d), { recursive: true });
      const yaml = path.join(dossier, 'chemins-modeles.yaml');
      const args = [t.code + path.sep + 'main.py', '--listen', '127.0.0.1', '--port', String(config.port || PORT), '--disable-auto-launch',
        '--input-directory', path.join(dossier, 'entree'), '--output-directory', path.join(dossier, 'sortie'), '--temp-directory', path.join(dossier, 'temp')];
      if (t.modeles && path.resolve(t.modeles) !== path.resolve(path.join(t.code, 'models'))) {
        const base = path.dirname(t.modeles).replace(/\\/g, '/');
        const lignes = ['tafl:', `  base_path: "${base}"`, ...DOSSIERS_MODELES.map((s) => `  ${s}: models/${s}`)];
        await fs.writeFile(yaml, lignes.join('\n') + '\n', 'utf8');
        args.push('--extra-model-paths-config', yaml);
      }
      log('INFO', `ComfyUI : démarrage caché de ${t.python} ${args.join(' ')}`);
      etat.lignes = [];
      progres({ etape: 'demarrage', texte: 'Démarrage du moteur ComfyUI (la première fois, ça peut prendre une minute)…' });
      const proc = spawn(t.python, args, {
        cwd: t.code,
        windowsHide: true,
        env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      etat.proc = proc;
      etat.nous = true;
      await fs.writeFile(fichierPid(), String(proc.pid), 'utf8').catch(() => {});
      proc.stdout.on('data', (b) => noter(b.toString('utf8')));
      proc.stderr.on('data', (b) => noter(b.toString('utf8')));
      let fini = null;
      proc.on('exit', (code) => {
        fini = code;
        log('INFO', `ComfyUI : le moteur s'est arrêté (code ${code})`);
        if (etat.proc === proc) {
          Object.assign(etat, { proc: null, port: null, nous: false });
          fs.rm(fichierPid(), { force: true }).catch(() => {});
        }
      });
      proc.on('error', (err) => { fini = -1; noter(err.message); });
      const port = config.port || PORT;
      const debut = Date.now();
      while (Date.now() - debut < 300000) {
        if (fini !== null) throw new Error(`Le moteur ComfyUI s'est arrêté au démarrage. Ses derniers mots :\n${etat.lignes.slice(-12).join('\n')}`);
        if (await repond(port)) {
          etat.port = port;
          log('INFO', `ComfyUI : prêt sur le port ${port} en ${Math.round((Date.now() - debut) / 1000)} s`);
          return infos();
        }
        const derniere = etat.lignes[etat.lignes.length - 1];
        progres({ etape: 'demarrage', texte: `Démarrage du moteur ComfyUI… ${Math.round((Date.now() - debut) / 1000)} s${derniere ? ` · ${derniere.slice(0, 120)}` : ''}` });
        await new Promise((r) => setTimeout(r, 1000));
      }
      arreter();
      throw new Error('Le moteur ComfyUI ne répond toujours pas après 5 minutes.');
    })();
    try { return await etat.demarrage; } finally { etat.demarrage = null; }
  }

  // Arrête le moteur seulement si c'est Tafl qui l'a lancé (Windows : tout l'arbre de processus).
  function arreter() {
    const pid = etat.proc?.pid || etat.pidAdopte;
    if (!pid || !etat.nous) return false;
    log('INFO', `ComfyUI : arrêt du moteur (${pid})`);
    if (process.platform === 'win32') execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
    else try { process.kill(pid); } catch { /* déjà arrêté */ }
    try { fsSync.rmSync(fichierPid(), { force: true }); } catch { /* rien */ }
    Object.assign(etat, { proc: null, port: null, nous: false, pidAdopte: 0 });
    return true;
  }

  function infos() {
    return { enMarche: Boolean(etat.port), port: etat.port, nous: etat.nous, lignes: etat.lignes.slice(-40) };
  }

  // Les modèles que le moteur voit vraiment (il les liste lui-même).
  async function modeles() {
    const liste = async (noeud, champ) => {
      try {
        const o = await requete(`/object_info/${noeud}`);
        const v = o?.[noeud]?.input?.required?.[champ]?.[0];
        return Array.isArray(v) ? v : [];
      } catch { return []; }
    };
    return { checkpoints: await liste('CheckpointLoaderSimple', 'ckpt_name'), loras: await liste('LoraLoader', 'lora_name') };
  }

  // Lance un graphe et renvoie les images. progres({ etape, valeur, max }) pendant le calcul.
  async function generer(graphe, progres = () => {}) {
    if (!etat.port) throw new Error('Le moteur ComfyUI n\'est pas démarré.');
    etat.dernierUsage = Date.now();
    const client = `tafl-${process.pid}-${Date.now()}`;
    // Les étapes du calcul arrivent par un WebSocket (comme dans la page de ComfyUI).
    let ws = null;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${etat.port}/ws?clientId=${client}`);
      ws.onmessage = (m) => {
        try {
          const d = JSON.parse(typeof m.data === 'string' ? m.data : '');
          if (d.type === 'progress') progres({ etape: 'calcul', valeur: d.data.value, max: d.data.max });
        } catch { /* les aperçus binaires ne nous intéressent pas */ }
      };
    } catch { ws = null; }
    try {
      const { prompt_id: id, node_errors: erreurs } = await requete('/prompt', { methode: 'POST', corps: { prompt: graphe, client_id: client } });
      if (erreurs && Object.keys(erreurs).length) throw new Error(`ComfyUI refuse la recette : ${JSON.stringify(erreurs).slice(0, 600)}`);
      const debut = Date.now();
      progres({ etape: 'attente' });
      while (Date.now() - debut < 600000) {
        await new Promise((r) => setTimeout(r, 700));
        const h = (await requete(`/history/${id}`))?.[id];
        if (!h) continue;
        if (h.status?.status_str === 'error') {
          const msg = (h.status.messages || []).find((m) => m[0] === 'execution_error')?.[1];
          throw new Error(`ComfyUI : ${msg ? `${msg.exception_type} : ${msg.exception_message}` : 'erreur pendant le calcul'}`);
        }
        const images = Object.values(h.outputs || {}).flatMap((o) => o.images || []);
        if (!images.length && !h.status?.completed) continue;
        const resultat = [];
        for (const im of images) {
          const q = new URLSearchParams({ filename: im.filename, subfolder: im.subfolder || '', type: im.type || 'temp' });
          resultat.push(await requete(`/view?${q}`, { octets: true, delai: 60000 }));
        }
        etat.dernierUsage = Date.now();
        log('INFO', `ComfyUI : ${resultat.length} image(s) en ${Math.round((Date.now() - debut) / 1000)} s`);
        return resultat;
      }
      throw new Error('ComfyUI n\'a pas fini en 10 minutes.');
    } finally {
      try { ws?.close(); } catch { /* déjà fermé */ }
    }
  }
  // Envoie une image au moteur (dossier d'entrée de ComfyUI) : la base d'une génération « image vers image ».
  async function envoyerImage(octets, nom = 'tafl-base.png') {
    if (!etat.port) throw new Error('Le moteur ComfyUI n\'est pas démarré.');
    const corps = new FormData();
    corps.append('image', new Blob([Buffer.from(octets)], { type: 'image/png' }), nom);
    corps.append('overwrite', 'true');
    const r = await fetch(`http://127.0.0.1:${etat.port}/upload/image`, { method: 'POST', body: corps });
    if (!r.ok) throw new Error(`ComfyUI refuse l'image de base (${r.status})`);
    return (await r.json()).name || nom;
  }
  const interrompre = () => (etat.port ? requete('/interrupt', { methode: 'POST', corps: {} }).catch(() => null) : null);
  // Libère la carte graphique (les modèles quittent la mémoire vidéo) sans arrêter le moteur.
  const liberer = () => (etat.port ? requete('/free', { methode: 'POST', corps: { unload_models: true, free_memory: true } }).catch(() => null) : null);

  // --- Télécharger un modèle dans le dossier des modèles ---
  async function telecharger({ url, dossier, fichier }, modelesDossier, progres = () => {}) {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' || !SITES.some((s) => u.hostname === s || u.hostname.endsWith(`.${s}`))) throw new Error(`Téléchargement refusé : seulement depuis ${SITES.join(' ou ')}.`);
    if (!DOSSIERS_MODELES.includes(dossier)) throw new Error(`Dossier de modèles inconnu : ${dossier}`);
    if (!modelesDossier || !estDossier(modelesDossier)) throw new Error('Tafl ne connaît pas encore le dossier des modèles de ComfyUI.');
    // Hugging Face : la page d'un fichier (/blob/) devient son adresse de téléchargement (/resolve/).
    if (u.hostname === 'huggingface.co') u.pathname = u.pathname.replace('/blob/', '/resolve/');
    // Civitai : la page d'un modèle (/models/123, avec ou sans ?modelVersionId=) devient le lien de son bouton « Download ».
    const page = u.hostname.endsWith('civitai.com') && /^\/models\/(\d+)/.exec(u.pathname);
    if (page) {
      let version = u.searchParams.get('modelVersionId');
      if (!version) {
        const infos = await fetch(`https://civitai.com/api/v1/models/${page[1]}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        version = infos?.modelVersions?.[0]?.id;
        if (!version) throw new Error(`Civitai ne donne pas la version de ce modèle : ${u}. Copie plutôt le lien du bouton « Download » de la page.`);
      }
      u.href = `https://civitai.com/api/download/models/${version}`;
    }
    let nom = fichier || decodeURIComponent(u.pathname.split('/').pop() || 'modele.safetensors');
    nom = path.basename(nom).replace(/[<>:"/\\|?*]/g, '_');
    const cible = path.join(modelesDossier, dossier, nom);
    if (existe(cible)) return { chemin: cible, deja: true };
    await fs.mkdir(path.dirname(cible), { recursive: true });
    log('INFO', `ComfyUI : téléchargement de ${u} vers ${cible}`);
    const r = await fetch(u, { redirect: 'follow' });
    if (!r.ok || !r.body) throw new Error(`Téléchargement impossible (${r.status}) : ${u}`);
    // Une page web au lieu d'un fichier : souvent un lien de page, ou Civitai qui demande d'être connecté.
    if (/text\/html/i.test(r.headers.get('content-type') || '')) {
      await r.body.cancel().catch(() => {});
      throw new Error(`Ce lien mène à une page web, pas à un fichier de modèle : ${u}. Sur Civitai, certains modèles demandent d'être connecté ; télécharge-le alors dans le navigateur et range-le avec « Ouvrir le dossier des modèles ».`);
    }
    // Civitai donne le vrai nom du fichier dans l'en-tête.
    const dispo = r.headers.get('content-disposition') || '';
    const vrai = /filename="?([^";]+)"?/i.exec(dispo)?.[1];
    const final = !fichier && vrai ? path.join(modelesDossier, dossier, path.basename(vrai)) : cible;
    if (final !== cible && existe(final)) { await r.body.cancel().catch(() => {}); return { chemin: final, deja: true }; }
    const total = Number(r.headers.get('content-length')) || 0;
    const temp = `${final}.part`;
    const sortie = fsSync.createWriteStream(temp);
    let recu = 0, dernier = 0;
    try {
      for await (const morceau of r.body) {
        recu += morceau.length;
        if (!sortie.write(morceau)) await new Promise((ok) => sortie.once('drain', ok));
        if (Date.now() - dernier > 300) { dernier = Date.now(); progres({ recu, total }); }
      }
      await new Promise((ok, ko) => sortie.end((e) => (e ? ko(e) : ok())));
      await fs.rename(temp, final);
    } catch (err) {
      sortie.destroy();
      await fs.rm(temp, { force: true });
      throw err;
    }
    progres({ recu, total: total || recu });
    return { chemin: final, deja: false };
  }

  return { trouver, demarrer, arreter, infos, modeles, generer, envoyerImage, interrompre, liberer, telecharger, CATALOGUE, PORT, etat };
}

module.exports = { creer, CATALOGUE, DOSSIERS_MODELES };
