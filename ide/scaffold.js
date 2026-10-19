// Nouveau projet (fenêtre « Nouveau projet », Ctrl+Alt+N), côté Node.
// On lance les mêmes commandes que tu taperais dans un terminal, dans le dossier parent choisi :
//   Vue.js            : npx create-vue <nom> --router --pinia …   (l'outil officiel de Vue)
//   Vite (JS, React, Svelte) : npx create-vite <nom> --template vue|react|svelte|vanilla
//   puis, si coché   : npm install, et git init + un premier commit
// Le « site HTML simple » n'a besoin de rien : on écrit nous-mêmes index.html, css/ et js/.
//
// Les versions des outils sont fixées (pas de « @latest ») : le même clic donne toujours le même
// résultat. Pour profiter d'une nouvelle version, change-la ici.

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');

const CREATE_VUE = 'create-vue@3.24.0';
const CREATE_VITE = 'create-vite@9.3.0';

// Options de Vue proposées dans la fenêtre -> option de create-vue.
const VUE_FLAGS = { typescript: '--ts', router: '--router', pinia: '--pinia', vitest: '--vitest', eslint: '--eslint', prettier: '--prettier' };
const VITE_TEMPLATES = { 'vite-vanilla': 'vanilla', 'vite-react': 'react', 'vite-svelte': 'svelte' };

// Fichier ouvert à la fin, pour démarrer tout de suite au bon endroit.
const MAIN_FILE = {
  vue: ['src/App.vue'],
  'vite-vanilla': ['src/main.ts', 'src/main.js'],
  'vite-react': ['src/App.tsx', 'src/App.jsx'],
  'vite-svelte': ['src/App.svelte'],
  html: ['index.html'],
};

// Un nom de dossier qui est aussi un nom de paquet npm valide : minuscules, chiffres, - _ .
// C'est ce qu'exigent create-vue et create-vite, et ça évite tout souci d'espaces ou de guillemets.
const NAME = /^[a-z0-9][a-z0-9._-]{0,213}$/;

function commandFor(template, name, options) {
  if (template === 'vue') {
    const flags = Object.entries(VUE_FLAGS).filter(([key]) => options[key]).map(([, flag]) => flag);
    // Sans aucune option, create-vue poserait ses questions : --default les saute.
    return ['npx', ['-y', CREATE_VUE, name, ...(flags.length ? flags : ['--default'])]];
  }
  const base = VITE_TEMPLATES[template];
  if (!base) throw new Error(`Modèle inconnu : ${template}`);
  const tpl = options.typescript ? `${base}-ts` : base;
  return ['npx', ['-y', CREATE_VITE, name, '--template', tpl, '--no-interactive', '--no-immediate']];
}

const HTML_FILES = (name) => ({
  'index.html': `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <main>
    <h1>${name}</h1>
    <p>Ton site est prêt. Ouvre l'aperçu (Ctrl+Alt+P) pour le voir en direct.</p>
  </main>
  <script src="js/main.js"></script>
</body>
</html>
`,
  'css/style.css': `*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
  color: #1f2328;
}

main {
  max-width: 960px;
  margin: 0 auto;
  padding: 48px 24px;
}
`,
  'js/main.js': `// Le code JavaScript de ton site.
console.log('Bonjour !');
`,
  '.gitignore': 'node_modules/\n',
});

// Lance une commande et envoie chaque ligne de sa sortie à la fenêtre.
// Sous Windows, npm et npx sont des scripts .cmd : il faut passer par le shell pour les lancer.
// Aucun risque ici : le nom est vérifié (NAME) et les options viennent de nos listes.
function run(command, args, cwd, onLine, track) {
  return new Promise((resolve, reject) => {
    onLine(`> ${command} ${args.join(' ')}`, 'command');
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'], // rien sur l'entrée : un outil qui poserait une question s'arrête au lieu d'attendre
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', npm_config_yes: 'true', npm_config_fund: 'false', npm_config_update_notifier: 'false' },
    });
    track(child);
    let tail = '';
    const feed = (chunk) => {
      const lines = (tail + chunk).split(/\r?\n/);
      tail = lines.pop();
      for (const line of lines) if (line.trim()) onLine(line);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', (err) => reject(err.code === 'ENOENT'
      ? new Error(`${command} est introuvable. Installe Node.js (https://nodejs.org, version LTS), puis redémarre l'IDE.`)
      : err));
    child.on('close', (code, signal) => {
      if (tail.trim()) onLine(tail);
      track(null);
      if (signal || code === null) reject(new Error('Création annulée.'));
      else if (code === 0) resolve();
      else reject(new Error(`${command} ${args[0] === '-y' ? args[1] : args[0]} a échoué (code ${code}). Le détail est juste au-dessus.`));
    });
  });
}

function register({ handle, setRoot, readState, updateState, projectsFolder, defaultParent }) {
  let current = null; // la commande en cours, pour pouvoir l'annuler
  let cancelled = false;

  handle('project:defaults', async () => {
    // Le dossier des projets choisi dans les réglages, sinon celui du dernier projet créé.
    const { projectsFolder: last } = await readState();
    return { parent: (await projectsFolder()) || last || defaultParent() };
  });

  handle('project:create', async (event, request) => {
    const { template, name, parent, options = {}, install = true, git = true } = request || {};
    if (!NAME.test(name || '')) throw new Error('Nom invalide : minuscules, chiffres, tirets ( - ), points et soulignés ( _ ) seulement, sans espace. Exemple : mon-app');
    if (!MAIN_FILE[template]) throw new Error(`Modèle inconnu : ${template}`);
    const parentDir = path.resolve(String(parent || ''));
    if (!(await fs.stat(parentDir).then((s) => s.isDirectory(), () => false))) throw new Error(`Dossier introuvable : ${parentDir}`);
    const target = path.join(parentDir, name);
    if (await fs.stat(target).then(() => true, () => false)) throw new Error(`Le dossier ${target} existe déjà : choisis un autre nom.`);
    if (current) throw new Error('Une création est déjà en cours.');

    cancelled = false;
    const send = (line, kind = 'output') => { if (!event.sender.isDestroyed()) event.sender.send('project:log', { line, kind }); };
    const step = (label) => send(label, 'step');
    const track = (child) => { current = child; };
    const exec = (command, args, cwd) => {
      if (cancelled) throw new Error('Création annulée.');
      return run(command, args, cwd, send, track);
    };

    step('Création des fichiers');
    if (template === 'html') {
      for (const [rel, text] of Object.entries(HTML_FILES(name))) {
        const file = path.join(target, rel);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, text, 'utf8');
        send(`créé : ${rel}`);
      }
    } else {
      const [command, args] = commandFor(template, name, options);
      await exec(command, args, parentDir);
      if (!(await fs.stat(path.join(target, 'package.json')).then(() => true, () => false))) {
        throw new Error("L'outil s'est terminé sans créer le projet. Le détail est juste au-dessus.");
      }
    }

    if (install && template !== 'html') {
      step('Installation des dépendances (npm install), ça peut prendre une minute');
      await exec('npm', ['install'], target);
    }

    let gitWarning = null;
    if (git) {
      step('Dépôt Git et premier commit');
      try {
        await exec('git', ['init', '-q'], target);
        await exec('git', ['add', '-A'], target);
        await exec('git', ['commit', '-q', '-m', 'Création du projet'], target);
      } catch (err) {
        if (cancelled) throw err;
        // Pas grave : le projet est là. Souvent, Git ne connaît pas encore ton nom.
        gitWarning = 'Le projet est créé, mais le premier commit Git a échoué (le détail est au-dessus). '
          + 'Si Git ne connaît pas ton nom : git config --global user.name "Ton nom" puis git config --global user.email "toi@exemple.fr".';
        send(gitWarning, 'warning');
      }
    }

    await updateState((state) => { state.projectsFolder = parentDir; });
    const root = await setRoot(target);
    let mainFile = null;
    for (const rel of MAIN_FILE[template]) {
      const file = path.join(root, rel);
      if (await fs.stat(file).then(() => true, () => false)) { mainFile = file; break; }
    }
    step('Terminé');
    return { root, mainFile, hasDev: template !== 'html' && install, gitWarning };
  });

  handle('project:cancel', async () => {
    cancelled = true;
    if (!current) return;
    // Sous Windows, la commande tourne dans un cmd.exe : on arrête tout l'arbre de processus.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(current.pid), '/T', '/F'], { windowsHide: true });
    else current.kill();
  });
}

module.exports = { register, commandFor, NAME };
