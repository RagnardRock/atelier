// Panneau Git, côté Node : on lance la commande `git` installée sur ton PC (Git for Windows),
// dans le dossier ouvert, et on traduit ses réponses pour l'interface.
// Ce sont exactement les commandes que tu taperais dans un terminal :
//   état      : git status --porcelain=v1 -z --branch
//   ancienne version d'un fichier : git show HEAD:chemin
//   indexer   : git add -- fichiers        désindexer : git restore --staged -- fichiers
//   valider   : git commit -F -  (le message passe par l'entrée standard : aucun souci d'accents ou de guillemets)
//   envoyer   : git push (git push -u origin <branche> la première fois)
//   récupérer : git pull --ff-only

const { spawn } = require('node:child_process');
const path = require('node:path');

// GIT_TERMINAL_PROMPT=0 : si git a besoin d'un mot de passe, il échoue avec un message au lieu
// d'attendre une réponse dans un terminal invisible. Sous Windows, Git Credential Manager ouvre
// sa propre fenêtre de connexion, qui reste possible.
function run(cwd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => reject(e.code === 'ENOENT'
      ? new Error("Git n'est pas installé (ou introuvable). Installe Git for Windows : https://git-scm.com/download/win")
      : e));
    child.on('close', (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error((err || out).trim() || `git ${args[0]} a échoué (code ${code})`));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

// "## main...origin/main [ahead 1, behind 2]" -> { branch, upstream, ahead, behind }
function parseBranch(line) {
  const info = { branch: null, upstream: null, ahead: 0, behind: 0 };
  const m = /^## (?:No commits yet on |Initial commit on )?(.+?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/.exec(line);
  if (!m) return info;
  info.branch = m[1] === 'HEAD (no branch)' ? null : m[1];
  info.upstream = m[2] || null;
  for (const part of (m[3] || '').split(', ')) {
    const n = /^(ahead|behind) (\d+)$/.exec(part);
    if (n) info[n[1]] = Number(n[2]);
  }
  return info;
}

async function status(root) {
  let out;
  try {
    ({ out } = await run(root, ['status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all']));
  } catch (err) {
    if (/not a git repository/i.test(err.message)) return { isRepo: false };
    throw err;
  }
  const entries = out.split('\0');
  const result = { isRepo: true, ...parseBranch(entries[0] || ''), files: [] };
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i];
    if (e.length < 4) continue;
    const index = e[0];   // état dans l'index (ce qui sera validé)
    const work = e[1];    // état dans tes fichiers
    const rel = e.slice(3);
    const file = { rel, path: path.join(root, rel), index, work };
    if (index === 'R' || index === 'C') file.from = entries[++i]; // renommé : l'ancien nom suit
    result.files.push(file);
  }
  result.files.sort((a, b) => a.rel.localeCompare(b.rel));
  return result;
}

function register({ handle, getRoot, assertAllowed }) {
  const root = () => {
    const r = getRoot();
    if (!r) throw new Error("Ouvre d'abord un dossier.");
    return r;
  };
  const rels = (list) => {
    const r = root();
    return list.map((p) => {
      const full = path.resolve(r, p);
      assertAllowed(full);
      return path.relative(r, full) || '.';
    });
  };

  handle('git:status', async () => status(root()));
  handle('git:init', async () => { await run(root(), ['init']); });
  // Le contenu d'un fichier dans le dernier commit (vide s'il est nouveau).
  handle('git:head', async (_event, file) => {
    const [rel] = rels([file]);
    try {
      return (await run(root(), ['show', `HEAD:${rel.split(path.sep).join('/')}`])).out;
    } catch {
      return '';
    }
  });
  handle('git:stage', async (_event, files) => { await run(root(), ['add', '--', ...rels(files)]); });
  handle('git:unstage', async (_event, files) => {
    try {
      await run(root(), ['restore', '--staged', '--', ...rels(files)]);
    } catch {
      await run(root(), ['rm', '--cached', '-r', '--quiet', '--', ...rels(files)]); // dépôt sans aucun commit
    }
  });
  // Valider. S'il n'y a rien d'indexé, on valide toutes les modifications (comme VS Code).
  handle('git:commit', async (_event, message) => {
    const text = String(message || '').trim();
    if (!text) throw new Error('Écris un message qui décrit tes modifications.');
    const r = root();
    const { files } = await status(r);
    const staged = files.filter((f) => f.index !== ' ' && f.index !== '?');
    if (!staged.length) await run(r, ['add', '-A']);
    try {
      await run(r, ['commit', '-F', '-'], `${text}\n`);
    } catch (err) {
      if (/user\.email|user\.name|tell me who you are/i.test(err.message)) {
        throw new Error('Git ne connaît pas encore ton nom. Dans le terminal : git config --global user.name "Ton nom" puis git config --global user.email "toi@exemple.fr"');
      }
      throw err;
    }
    return { all: !staged.length };
  });
  handle('git:push', async () => {
    const r = root();
    const s = await status(r);
    if (!s.branch) throw new Error("Tu n'es sur aucune branche.");
    const args = s.upstream ? ['push'] : ['push', '-u', 'origin', s.branch];
    try {
      await run(r, args);
    } catch (err) {
      if (/does not appear to be a git repository|No configured push destination|'origin'/i.test(err.message)) {
        throw new Error("Ce dépôt n'est relié à aucun dépôt en ligne (origin). Crée-le sur GitHub, puis dans le terminal : git remote add origin <adresse>");
      }
      if (/rejected|fetch first|non-fast-forward/i.test(err.message)) {
        throw new Error("Le dépôt en ligne a des commits que tu n'as pas : récupère-les d'abord (bouton Récupérer), puis renvoie.");
      }
      throw err;
    }
  });
  handle('git:pull', async () => {
    try {
      await run(root(), ['pull', '--ff-only']);
    } catch (err) {
      if (/Not possible to fast-forward|diverging/i.test(err.message)) {
        throw new Error('Ta branche et celle en ligne ont chacune des commits différents : il faut les fusionner dans le terminal (git pull).');
      }
      throw err;
    }
  });
}

module.exports = { register, status };
