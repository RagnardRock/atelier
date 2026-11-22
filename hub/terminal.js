// Le widget Terminal, côté processus principal : de vrais terminaux (ConPTY sous Windows, grâce à
// node-pty, comme le terminal de Rune), donc couleurs, ssh, vim, l'autocomplétion de PowerShell… marchent.
// L'affichage est fait par xterm.js dans renderer/terminal.js.
//
// Les shells proposés sont cherchés sur le PC au premier usage : PowerShell, PowerShell 7 (pwsh),
// l'invite de commandes, Git Bash, et chaque distribution WSL installée. Sous Linux / macOS : le shell
// de l'utilisateur, bash, zsh.

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let pty = null;
const terminaux = new Map(); // id -> processus node-pty
let prochainId = 1;
let shells = null;

const existe = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };

// Le chemin complet d'un programme du PATH (null s'il n'y est pas).
function dansLePath(nom) {
  const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const f = path.join(dir.replace(/"/g, ''), nom + ext);
      if (existe(f)) return f;
    }
  }
  return null;
}

// Les distributions WSL installées (« wsl -l -q » répond en UTF-16).
function distributionsWsl(wsl) {
  return new Promise((resolve) => {
    execFile(wsl, ['-l', '-q'], { encoding: 'buffer', windowsHide: true, timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const texte = stdout.includes(0) ? stdout.toString('utf16le') : stdout.toString('utf8');
      resolve(texte.split(/\r?\n/).map((l) => l.replace(/\0/g, '').trim()).filter(Boolean));
    });
  });
}

async function chercherShells() {
  if (shells) return shells;
  const liste = [];
  if (process.platform === 'win32') {
    const systeme = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
    liste.push({ id: 'powershell', nom: 'PowerShell', icone: 'terminal-powershell', commande: path.join(systeme, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoLogo'] });
    const pwsh = dansLePath('pwsh') || [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe')].find(existe);
    if (pwsh) liste.push({ id: 'pwsh', nom: 'PowerShell 7', icone: 'terminal-powershell', commande: pwsh, args: ['-NoLogo'] });
    liste.push({ id: 'cmd', nom: 'Invite de commandes', icone: 'terminal-cmd', commande: path.join(systeme, 'cmd.exe'), args: [] });
    const gitBash = [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe')].find(existe);
    if (gitBash) liste.push({ id: 'gitbash', nom: 'Git Bash', icone: 'terminal-bash', commande: gitBash, args: ['--login', '-i'] });
    const wsl = path.join(systeme, 'wsl.exe');
    if (existe(wsl)) {
      const distros = await distributionsWsl(wsl);
      if (distros.length) for (const d of distros) liste.push({ id: `wsl:${d}`, nom: `WSL · ${d}`, icone: 'terminal-linux', commande: wsl, args: ['-d', d], wsl: true });
      else liste.push({ id: 'wsl', nom: 'WSL', icone: 'terminal-linux', commande: wsl, args: [], wsl: true });
    }
  } else {
    const vus = new Set();
    const ajouter = (f, nom) => {
      if (!f || !existe(f)) return;
      const vrai = fs.realpathSync(f);
      if (vus.has(vrai)) return;
      vus.add(vrai);
      liste.push({ id: path.basename(f), nom, icone: 'terminal-bash', commande: f, args: [] });
    };
    if (process.env.SHELL) ajouter(process.env.SHELL, `${path.basename(process.env.SHELL)} (mon shell)`);
    ajouter(dansLePath('bash'), 'bash');
    ajouter(dansLePath('zsh'), 'zsh');
    ajouter(dansLePath('fish'), 'fish');
    if (!liste.length) ajouter('/bin/sh', 'sh');
  }
  shells = liste;
  return liste;
}

// Dossier de départ : celui demandé s'il existe, sinon le dossier perso.
function dossierDepart(demande) {
  try {
    if (demande && fs.statSync(demande).isDirectory()) return path.resolve(demande);
  } catch {}
  return os.homedir();
}

function brancher({ handle, ipcMain, envoyer, log }) {
  handle('term:shells', async () => (await chercherShells()).map(({ id, nom, icone }) => ({ id, nom, icone })));

  handle('term:creer', async (_event, shellId, cols, rows, dossier) => {
    pty ??= require('node-pty');
    const liste = await chercherShells();
    const shell = liste.find((s) => s.id === shellId) || liste[0];
    if (!shell) throw new Error('Aucun shell trouvé sur ce PC');
    const cwd = dossierDepart(dossier);
    const env = { ...process.env, TERM_PROGRAM: 'Atelier' };
    delete env.ELECTRON_RUN_AS_NODE;
    let proc;
    try {
      proc = pty.spawn(shell.commande, shell.args, {
        name: 'xterm-256color',
        cols: Math.max(2, cols | 0),
        rows: Math.max(1, rows | 0),
        // WSL démarre dans son propre dossier perso si on lui donne un dossier Windows qu'il ne voit pas ;
        // il comprend très bien C:\…, donc on le lui passe tel quel.
        cwd,
        env,
        useConpty: true,
      });
    } catch (err) {
      throw new Error(`« ${shell.nom} » n'a pas pu être lancé (${err.message})`);
    }
    const id = prochainId++;
    terminaux.set(id, proc);
    proc.onData((data) => envoyer('term:donnees', id, data));
    proc.onExit(({ exitCode }) => {
      terminaux.delete(id);
      envoyer('term:fin', id, exitCode);
    });
    log('INFO', `Terminal ${id} : ${shell.nom} dans ${cwd}`);
    return { id, shell: { id: shell.id, nom: shell.nom, icone: shell.icone }, dossier: cwd };
  });

  ipcMain.on('term:ecrire', (_event, id, data) => terminaux.get(id)?.write(String(data)));
  ipcMain.on('term:taille', (_event, id, cols, rows) => {
    try { terminaux.get(id)?.resize(Math.max(2, cols | 0), Math.max(1, rows | 0)); } catch {}
  });
  ipcMain.on('term:fermer', (_event, id) => {
    try { terminaux.get(id)?.kill(); } catch {}
  });
}

function toutFermer() {
  for (const p of terminaux.values()) { try { p.kill(); } catch {} }
  terminaux.clear();
}

module.exports = { brancher, toutFermer };
