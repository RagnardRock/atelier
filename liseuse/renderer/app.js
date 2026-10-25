// L'interface de Kenning : elle passe de la bibliothèque à la lecture, applique le thème, ouvre les
// réglages, reçoit les livres glissés sur la fenêtre ou ouverts depuis l'Explorateur, et répartit
// les raccourcis clavier. La bibliothèque (bibliotheque.js) et la lecture (lecture.js) font le reste.

import { etat, ecrireConfig } from './etat.js';
import { Bibliotheque } from './bibliotheque.js';
import { Lecture } from './lecture.js';

const K = window.kenning;

// --- Thème et réglages ---
const ACCENTS = ['#b9a3ff', '#8fb4ff', '#5ec8ff', '#7ee0c3', '#ffc35c', '#ff9a76', '#ff7aa8'];

async function applyTheme(c) {
  document.documentElement.style.setProperty('--accent', c.accentColor);
  document.body.classList.toggle('glass', Boolean(c.glass));
  const { blur, needsRestart } = await K.setWindowTheme({ glass: c.glass, blur: c.windowBlur });
  document.body.classList.toggle('window-blur', blur);
  return needsRestart;
}

async function ouvrirReglages() {
  const config = etat.config;
  const blurOk = await K.blurSupported();
  const version = await K.version();
  const swatches = el('div', { className: 'accent-swatches' });
  const familles = ((await window.claude.autorisations?.().catch(() => [])) || []).filter((f) => f.gardable);
  const v = await Dialogs.form({
    title: 'Réglages de Kenning',
    okLabel: 'Enregistrer',
    width: 540,
    fields: [
      { key: 'accentColor', label: 'Couleur d\'accent', type: 'color', value: config.accentColor },
      { type: 'element', element: swatches },
      { key: 'glass', label: 'Verre dépoli (glassmorphism)', type: 'checkbox', value: config.glass },
      { key: 'windowBlur', label: blurOk ? 'Flou de Windows 11 derrière la fenêtre' : 'Flou de Windows 11 (non disponible ici)', type: 'checkbox', value: config.windowBlur },
      { key: 'rouvrir', label: 'Au démarrage, rouvrir le livre que je lisais', type: 'checkbox', value: config.rouvrir },
      { type: 'info', text: `Dossiers surveillés : ${(config.dossiers || []).length ? config.dossiers.join(', ') : 'aucun'} (bouton « Dossiers » de la bibliothèque). La police, la taille et le thème des pages se règlent pendant la lecture, avec le bouton Aa.` },
      { key: 'claudeModel', label: 'Modèle de Loki (propulsé par Claude)', type: 'select', value: config.claudeModel || '', choices: [['', 'Par défaut (celui de Claude Code)'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']] },
      { key: 'claudeCommand', label: 'Commande Claude Code', type: 'text', value: config.claudeCommand || 'claude' },
      { key: 'claudeCommandes', label: 'Loki peut lancer des commandes (PowerShell, Python…) : plus lent, rarement utile', type: 'checkbox', value: Boolean(config.claudeCommandes) },
      ...(familles.length ? [
        { type: 'info', text: 'Loki fait sans me demander la permission, pour de bon :' },
        ...familles.map((f) => ({ key: `sansDemander-${f.id}`, label: f.libelle, type: 'checkbox', value: f.toujours })),
        { type: 'info', text: 'Lire la bibliothèque et le livre ouvert ne demande jamais. Ce qui est permis seulement pour la conversation en cours se voit et se retire avec le bouclier, en haut du panneau Loki.' },
      ] : []),
      { type: 'info', text: `Kenning ${version}. Réglages et bibliothèque enregistrés dans ${etat.dossierDonnees}.` },
    ],
    onInput(values, f) {
      if (!swatches.childElementCount) {
        for (const c of ACCENTS) swatches.append(el('button', { type: 'button', className: 'mini-swatch', style: `background:${c}`, onclick: () => f.setValue('accentColor', c) }));
      }
      document.documentElement.style.setProperty('--accent', values.accentColor);
      document.body.classList.toggle('glass', values.glass);
    },
  });
  if (!v) return applyTheme(etat.config);
  if (familles.length) {
    v.claudeSansDemander = {};
    for (const f of familles) { if (v[`sansDemander-${f.id}`]) v.claudeSansDemander[f.id] = true; delete v[`sansDemander-${f.id}`]; }
  }
  await ecrireConfig(v);
  if (await applyTheme(etat.config)) notify('Le flou de Windows 11 sera actif au prochain démarrage de Kenning.', 'info', 6000);
}

// --- Passer de la bibliothèque à la lecture ---

function montrerBibliotheque() {
  $('#vue-lecture').hidden = true;
  $('#vue-biblio').hidden = false;
  $('#btn-retour').hidden = true;
  $('#titre-livre').textContent = '';
  document.title = 'Kenning';
  document.body.classList.remove('en-lecture', 'immersif');
  Bibliotheque.rendre();
}
Lecture.quandQuitter(montrerBibliotheque);

async function ouvrirLivre(id) {
  if (Bibliotheque.introuvable(id)) {
    const l = Bibliotheque.livre(id);
    notify(`Le fichier de « ${l.titre} » est introuvable (${l.chemin}). S'il a été déplacé dans un dossier surveillé, Kenning le retrouvera tout seul.`, 'warning', 10000);
    return;
  }
  await Lecture.ouvrir(id);
}

// Des fichiers glissés sur la fenêtre, ou ouverts depuis l'Explorateur (double-clic sur un EPUB) :
// ajoutés à la bibliothèque ; un seul livre est ouvert tout de suite.
// Un dossier glissé apporte tous les livres qu'il contient (sous-dossiers compris).
async function recevoirFichiers(chemins, { ouvrir = true } = {}) {
  if (!chemins.length) return;
  const livres = [];
  for (const c of chemins) {
    if (await K.dossierExiste(c)) { livres.push(...(await K.scanner([c])).map((f) => f.chemin)); ouvrir = false; } else livres.push(c);
  }
  await Bibliotheque.importer(livres);
  if (ouvrir && chemins.length === 1) {
    const l = Bibliotheque.liste().find((x) => x.chemin.toLowerCase() === String(chemins[0]).toLowerCase());
    if (l) await ouvrirLivre(l.id);
  }
}

// --- Glisser-déposer des fichiers sur la fenêtre ---
let profondeur = 0;
const fichiersGlisses = (e) => e.dataTransfer?.types.includes('Files');
window.addEventListener('dragenter', (e) => { if (fichiersGlisses(e)) { profondeur++; document.body.classList.add('drop-target'); } });
window.addEventListener('dragleave', (e) => { if (!fichiersGlisses(e)) return; profondeur = Math.max(0, profondeur - 1); if (!profondeur) document.body.classList.remove('drop-target'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  profondeur = 0;
  document.body.classList.remove('drop-target');
  const chemins = [...(e.dataTransfer?.files || [])].map((f) => K.pathOfDropped(f)).filter(Boolean);
  recevoirFichiers(chemins).catch((err) => notify(cleanError(err), 'error'));
});

// --- Raccourcis clavier ---
window.addEventListener('keydown', (e) => {
  if (Dialogs.isOpen()) { if (e.key === 'Escape') Dialogs.close(null); return; }
  if (Menu.estOuvert()) return;
  if (e.ctrlKey && !e.altKey && e.key === ',') { e.preventDefault(); ouvrirReglages(); return; }
  if (Lecture.ouvert() && !$('#vue-lecture').hidden) { Lecture.clavier(e); return; }
  if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'o') { e.preventDefault(); Bibliotheque.choisirEtAjouter(); return; }
  if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); Bibliotheque.focusRecherche(); }
});

$('#btn-reglages').onclick = ouvrirReglages;
$('#btn-retour').onclick = () => Lecture.fermer();

// --- Démarrage ---
async function demarrer() {
  const lu = await K.readConfig();
  etat.config = lu.config;
  etat.configPath = lu.path;
  etat.dossierDonnees = lu.dossierDonnees;
  await applyTheme(etat.config);
  await Bibliotheque.demarrer({ ouvrir: (id) => ouvrirLivre(id).catch((err) => notify(cleanError(err), 'error')) });
  K.onLivresExternes((fichiers) => recevoirFichiers(fichiers));
  const fichiers = await K.demarrage();
  if (fichiers.length) await recevoirFichiers(fichiers);
  else if (etat.config.rouvrir && etat.config.ouvert && Bibliotheque.livre(etat.config.ouvert)) await ouvrirLivre(etat.config.ouvert);
}

// Pour Loki (claude-actions.js) et pour les essais.
window.Kenning = { Bibliotheque, Lecture, montrerBibliotheque, ouvrirLivre, etat };

// Les actions de Loki d'abord : elles doivent exister même si un livre refuse de s'ouvrir au démarrage.
await import('./claude-actions.js');
demarrer().catch((err) => notify(cleanError(err), 'error'));
