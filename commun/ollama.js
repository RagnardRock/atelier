// L'IA locale de Loki : Ollama, qui fait tourner un modèle de langage sur la carte graphique du PC.
//
// Quand Claude n'est pas là (pas d'abonnement, limite atteinte, pas d'Internet), Loki peut répondre
// avec un modèle « ouvert » (Qwen, Mistral, Llama…) qui tourne chez toi. Ollama, c'est le programme
// qui les télécharge et les fait tourner : un petit serveur sur http://127.0.0.1:11434.
//
// Ce fichier sert à tout le monde (recopié dans chaque outil, comme claude.js) :
// - Atelier l'installe et gère les modèles (Réglages › IA locale) ;
// - les outils lui parlent (loki-local.js) et le démarrent s'il ne tourne pas.
// Le modèle choisi et la taille de sa mémoire sont dans le dossier partagé de l'Atelier
// (%APPDATA%\atelier-commun\ia-locale.json), le même pour tous les outils.
//
// La carte graphique est partagée avec ComfyUI (Tafl) : un seul gros modèle à la fois. liberer()
// sort les modèles d'Ollama de la mémoire vidéo (Tafl l'appelle avant de générer des images).

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const ADRESSE = 'http://127.0.0.1:11434';
const SITE = 'https://ollama.com/download';
const INSTALLEUR = 'https://ollama.com/download/OllamaSetup.exe';

// Les modèles que l'Atelier propose (ils savent tous appeler des actions). taille : à télécharger ;
// memoire : carte graphique conseillée. reflexion : le modèle sait « réfléchir » avant de répondre.
const CATALOGUE = [
  { nom: 'qwen3:14b', libelle: 'Qwen3 14B', taille: '9,3 Go', memoire: '12 Go', reflexion: true, pourquoi: 'le plus solide pour enchaîner des actions sur une carte de 12 Go (RTX 4070)' },
  { nom: 'mistral-nemo:12b', libelle: 'Mistral Nemo 12B', taille: '7,1 Go', memoire: '10 Go', pourquoi: 'bon en français, réponses naturelles ; un peu moins rigoureux sur les actions' },
  { nom: 'qwen3:8b', libelle: 'Qwen3 8B', taille: '5,2 Go', memoire: '8 Go', reflexion: true, pourquoi: 'plus rapide, un peu moins fiable' },
  { nom: 'llama3.1:8b', libelle: 'Llama 3.1 8B', taille: '4,9 Go', memoire: '8 Go', pourquoi: 'rapide, correct en français' },
  { nom: 'qwen3:4b', libelle: 'Qwen3 4B', taille: '2,6 Go', memoire: '4 Go', reflexion: true, pourquoi: 'pour les PC modestes : questions simples seulement' },
];
const DEFAUT = { modele: 'qwen3:14b', contexte: 12288, reflexion: true };

let communDir = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'atelier-commun');
const reglagesFichier = () => path.join(communDir, 'ia-locale.json');

async function reglages() {
  try { return { ...DEFAUT, ...JSON.parse(await fsp.readFile(reglagesFichier(), 'utf8')) }; } catch { return { ...DEFAUT }; }
}
async function changerReglages(changements) {
  const r = { ...(await reglages()), ...changements };
  await fsp.mkdir(communDir, { recursive: true });
  await fsp.writeFile(`${reglagesFichier()}.tmp`, JSON.stringify(r, null, 2), 'utf8');
  await fsp.rename(`${reglagesFichier()}.tmp`, reglagesFichier());
  return r;
}

async function requete(chemin, { methode = 'GET', corps, delai = 8000, signal } = {}) {
  const r = await fetch(`${ADRESSE}${chemin}`, {
    method: methode,
    headers: corps ? { 'Content-Type': 'application/json' } : undefined,
    body: corps ? JSON.stringify(corps) : undefined,
    signal: signal || AbortSignal.timeout(delai),
  });
  if (!r.ok) {
    const texte = await r.text().catch(() => '');
    let message = texte;
    try { message = JSON.parse(texte).error || texte; } catch { /* texte brut */ }
    const err = new Error(`Ollama : ${message || `erreur ${r.status}`}`);
    err.status = r.status;
    throw err;
  }
  return r;
}

// Où Ollama est installé (Windows : l'installeur officiel le met dans %LOCALAPPDATA%\Programs\Ollama).
function executable() {
  const candidats = process.platform === 'win32'
    ? [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe')]
    : ['/usr/local/bin/ollama', '/usr/bin/ollama', '/opt/homebrew/bin/ollama'];
  return candidats.find((f) => { try { return fs.existsSync(f); } catch { return false; } }) || null;
}

async function version() {
  try { return (await (await requete('/api/version', { delai: 1500 })).json()).version || '?'; } catch { return null; }
}

// Démarre le serveur d'Ollama s'il ne tourne pas (sans fenêtre). Il continue après la fermeture de
// l'outil : il ne prend presque rien tant qu'aucun modèle n'est chargé.
let demarrage = null;
async function demarrer(log = () => {}) {
  if (await version()) return true;
  if (demarrage) return demarrage;
  const exe = executable();
  if (!exe) return false;
  demarrage = (async () => {
    log('INFO', `Ollama : démarrage de ${exe}`);
    const proc = spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
    proc.on('error', (err) => log('ERREUR', `Ollama : ${err.message}`));
    proc.unref();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await version()) return true;
    }
    return false;
  })().finally(() => { demarrage = null; });
  return demarrage;
}

// { installe, actif, version, modeles: [{ nom, taille }], enMemoire: [{ nom, vram }], reglages, catalogue }
async function etat() {
  const v = await version();
  const r = await reglages();
  const base = { installe: Boolean(v || executable()), actif: Boolean(v), version: v, modeles: [], enMemoire: [], reglages: r, catalogue: CATALOGUE, windows: process.platform === 'win32' };
  if (!v) return base;
  try {
    const tags = await (await requete('/api/tags')).json();
    base.modeles = (tags.models || []).map((m) => ({ nom: m.name, taille: m.size, parametres: m.details?.parameter_size || '' }));
    const ps = await (await requete('/api/ps')).json();
    base.enMemoire = (ps.models || []).map((m) => ({ nom: m.name, vram: m.size_vram || 0 }));
  } catch { /* serveur qui démarre encore */ }
  return base;
}

// Lit une réponse d'Ollama en flux : un objet JSON par ligne.
async function* lignes(reponse) {
  const decodeur = new TextDecoder();
  let reste = '';
  for await (const morceau of reponse.body) {
    reste += decodeur.decode(morceau, { stream: true });
    let i;
    while ((i = reste.indexOf('\n')) >= 0) {
      const ligne = reste.slice(0, i).trim();
      reste = reste.slice(i + 1);
      if (!ligne) continue;
      let objet;
      try { objet = JSON.parse(ligne); } catch { continue; }
      if (objet.error) throw new Error(`Ollama : ${objet.error}`);
      yield objet;
    }
  }
}

// Télécharge un modèle (progres({ statut, recu, total })). Le nom suit Ollama : « qwen3:14b ».
const NOM_MODELE = /^[a-z0-9][\w.\-/]{0,80}(:[\w.\-]{1,40})?$/i;
async function telecharger(nom, progres = () => {}, signal) {
  if (!NOM_MODELE.test(String(nom))) throw new Error(`Nom de modèle invalide : ${nom}`);
  const r = await requete('/api/pull', { methode: 'POST', corps: { model: nom, stream: true }, signal: signal || AbortSignal.timeout(6 * 3600_000) });
  for await (const l of lignes(r)) progres({ statut: l.status || '', recu: l.completed || 0, total: l.total || 0 });
}
async function supprimer(nom) {
  if (!NOM_MODELE.test(String(nom))) throw new Error(`Nom de modèle invalide : ${nom}`);
  await requete('/api/delete', { methode: 'DELETE', corps: { model: nom } });
}

// Sort tous les modèles de la mémoire vidéo (keep_alive 0). Sans erreur si Ollama ne tourne pas.
async function liberer() {
  try {
    const ps = await (await requete('/api/ps', { delai: 1500 })).json();
    await Promise.all((ps.models || []).map((m) => requete('/api/generate', { methode: 'POST', corps: { model: m.name, keep_alive: 0 } }).catch(() => null)));
    return (ps.models || []).length;
  } catch {
    return 0;
  }
}

// Une réponse du modèle, en flux. surTexte(t) / surReflexion() au fil de l'eau ; renvoie
// { contenu, appels: [{ name, arguments }], jetons: { lus, ecrits } }.
async function discuter({ modele, messages, outils, contexte, reflexion, signal, surTexte = () => {}, surReflexion = () => {} }) {
  const corps = {
    model: modele,
    messages,
    stream: true,
    keep_alive: '10m',
    options: { num_ctx: contexte || DEFAUT.contexte },
  };
  if (outils?.length) corps.tools = outils;
  if (reflexion !== undefined) corps.think = Boolean(reflexion);
  let r;
  try {
    r = await requete('/api/chat', { methode: 'POST', corps, signal: signal || AbortSignal.timeout(30 * 60_000) });
  } catch (err) {
    // Un modèle qui ne sait pas réfléchir : on réessaie sans.
    if (err.status === 400 && corps.think !== undefined && /think/i.test(err.message)) {
      delete corps.think;
      r = await requete('/api/chat', { methode: 'POST', corps, signal: signal || AbortSignal.timeout(30 * 60_000) });
    } else throw err;
  }
  let contenu = '';
  const appels = [];
  const jetons = { lus: 0, ecrits: 0 };
  for await (const l of lignes(r)) {
    const m = l.message || {};
    if (m.thinking) surReflexion(m.thinking);
    if (m.content) { contenu += m.content; surTexte(m.content); }
    for (const a of m.tool_calls || []) {
      let args = a.function?.arguments ?? {};
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
      appels.push({ name: a.function?.name || '', arguments: args && typeof args === 'object' ? args : {} });
    }
    if (l.done) { jetons.lus = l.prompt_eval_count || 0; jetons.ecrits = l.eval_count || 0; }
  }
  return { contenu, appels, jetons };
}

// Windows : télécharge l'installeur officiel et le lance (il montre sa progression, sans question).
async function installer(progres = () => {}, log = () => {}) {
  if (process.platform !== 'win32') throw new Error(`Installe Ollama depuis ${SITE}, puis reviens ici.`);
  const cible = path.join(os.tmpdir(), 'OllamaSetup.exe');
  log('INFO', `Ollama : téléchargement de ${INSTALLEUR}`);
  const r = await fetch(INSTALLEUR, { redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error(`Téléchargement de l'installeur impossible (${r.status})`);
  const total = Number(r.headers.get('content-length')) || 0;
  const sortie = fs.createWriteStream(cible);
  let recu = 0, dernier = 0;
  for await (const morceau of r.body) {
    recu += morceau.length;
    if (!sortie.write(morceau)) await new Promise((ok) => sortie.once('drain', ok));
    if (Date.now() - dernier > 300) { dernier = Date.now(); progres({ statut: 'téléchargement', recu, total }); }
  }
  await new Promise((ok, ko) => sortie.end((e) => (e ? ko(e) : ok())));
  progres({ statut: 'installation', recu, total: total || recu });
  log('INFO', 'Ollama : lancement de l\'installeur');
  await new Promise((ok, ko) => {
    const p = spawn(cible, ['/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: false });
    p.on('error', ko);
    p.on('exit', (code) => (code === 0 ? ok() : ko(new Error(`L'installeur d'Ollama s'est arrêté (code ${code})`))));
  });
  await fsp.rm(cible, { force: true }).catch(() => {});
  return demarrer(log);
}

function configurer({ commun } = {}) { if (commun) communDir = commun; }

module.exports = { configurer, reglages, changerReglages, etat, demarrer, version, executable, telecharger, supprimer, liberer, discuter, installer, CATALOGUE, DEFAUT, SITE };
