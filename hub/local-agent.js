// Agent local compatible avec l'API OpenAI (Ollama, LM Studio, etc.).
// Les outils sont exécutés par Atelier, jamais directement par le modèle. Les actions modifiantes
// passent par le même écran de permission que Claude Code.
const crypto = require('node:crypto');

const DEFAULT_URL = 'http://127.0.0.1:11434/v1/chat/completions';
const PREFIXE_ACTIONS = 'mcp__atelier__';
const OUTILS = [
  ['ajouter_note', "Ajoute une note. La première ligne devient son titre.", { texte: { type: 'string' }, epinglee: { type: 'boolean' } }, ['texte']],
  ['modifier_note', 'Remplace le texte complet d’une note existante et/ou son épingle.', { id: { type: 'string' }, texte: { type: 'string' }, epinglee: { type: 'boolean' } }, ['id']],
  ['supprimer_note', 'Supprime une note existante.', { id: { type: 'string' } }, ['id']],
  ['ajouter_evenement', 'Ajoute un évènement au calendrier.', { titre: { type: 'string' }, date: { type: 'string', description: 'Date AAAA-MM-JJ' }, heure: { type: 'string', description: 'Heure HH:MM ou vide' }, note: { type: 'string' } }, ['titre', 'date']],
  ['modifier_evenement', 'Modifie les champs fournis d’un évènement existant.', { id: { type: 'string' }, titre: { type: 'string' }, date: { type: 'string' }, heure: { type: 'string' }, note: { type: 'string' } }, ['id']],
  ['supprimer_evenement', 'Supprime un évènement existant.', { id: { type: 'string' } }, ['id']],
  ['lancer_minuteur', 'Lance un minuteur dans Atelier.', { nom: { type: 'string' }, minutes: { type: 'number', description: 'Durée en minutes' } }, ['minutes']],
  ['ouvrir_projet', 'Ouvre un projet récent dans son outil ou l’outil indiqué.', { nom: { type: 'string' }, outil: { type: 'string' } }, ['nom']],
  ['lancer_outil', 'Lance un outil Atelier installé.', { outil: { type: 'string' } }, ['outil']],
  ['installer_outil', 'Installe ou met à jour un outil Atelier.', { outil: { type: 'string' }, attendre: { type: 'boolean' } }, ['outil']],
  ['desinstaller_outil', 'Désinstalle un outil Atelier. Seulement si demandé.', { outil: { type: 'string' } }, ['outil']],
  ['verifier_mises_a_jour', 'Relit les dernières versions des outils sans rien modifier.', {}, []],
  ['calculer', 'Calcule une expression avec la calculatrice Atelier. Utilise-le pour les calculs.', { calcul: { type: 'string' } }, ['calcul']],
  ['retenir_projet', 'Mémorise une information courte sur un projet.', { projet: { type: 'string' }, texte: { type: 'string' } }, ['projet', 'texte']],
  ['oublier_projet', 'Oublie une information mémorisée sur un projet.', { projet: { type: 'string' }, id: { type: 'string' } }, ['projet', 'id']],
].map(([name, description, properties, required]) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
}));

const FAMILLES = {
  ajouter_note: 'notes', modifier_note: 'notes', supprimer_note: 'notes',
  ajouter_evenement: 'calendrier', modifier_evenement: 'calendrier', supprimer_evenement: 'calendrier',
  lancer_minuteur: 'minuteurs', ouvrir_projet: 'projets', lancer_outil: 'projets',
  retenir_projet: 'memoire', oublier_projet: 'memoire',
  installer_outil: 'installation', desinstaller_outil: 'installation',
  calculer: 'lecture', verifier_mises_a_jour: 'lecture',
};
const FAMILLES_TOUJOURS = ['notes', 'calendrier', 'minuteurs', 'projets', 'memoire', 'installation'];

async function completion({ baseUrl = DEFAULT_URL, model, messages, tools, signal }) {
  if (!model || typeof model !== 'string') throw new Error('Indique le nom du modèle local dans les réglages de Loki.');
  let url;
  try { url = new URL(baseUrl); } catch { throw new Error('Adresse du serveur local invalide.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Le serveur local doit utiliser HTTP ou HTTPS.');
  const response = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', stream: false }),
    signal,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 600);
    throw new Error(`Le serveur local répond ${response.status} : ${detail || response.statusText}`);
  }
  const data = await response.json();
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('Réponse invalide du serveur local : aucun message.');
  return message;
}

let history = [];
let activeController = null;
let currentModel = null;
let currentBaseUrl = null;
let pendingPermissions = new Map();

function demanderPermission({ requestId, autoriser }) {
  const pending = pendingPermissions.get(requestId);
  if (!pending) return false;
  pendingPermissions.delete(requestId);
  pending.resolve(Boolean(autoriser));
  return true;
}

async function send({ baseUrl = DEFAULT_URL, model, text, context = '', actions = true, config = {}, sender, emit, log, executerAction }) {
  if (activeController) throw new Error('Le modèle local est déjà en train de répondre.');
  if (!model) {
    emit({ kind: 'error', message: 'Modèle local manquant. Vérifie les réglages de Loki.' });
    emit({ kind: 'result' });
    return;
  }
  if (model !== currentModel || baseUrl !== currentBaseUrl) {
    history = [];
    currentModel = model;
    currentBaseUrl = baseUrl;
  }
  const controller = new AbortController();
  activeController = controller;
  const sessionId = 'local';
  try {
    if (history.length === 0) {
      history.push({ role: 'system', content:
        'Tu es Loki, l’assistant intégré à Atelier. Réponds en français sauf demande contraire. ' +
        'Tu peux utiliser les outils Atelier fournis. Pour toute action, appelle l’outil : ne prétends jamais avoir agi sans résultat. ' +
        'Les actions qui changent les données demandent confirmation dans Atelier, sauf si la famille est autorisée sans demander. ' +
        'N’invente jamais les résultats des outils.\n\n' + context });
    }
    history.push({ role: 'user', content: text });
    emit({ kind: 'init', sessionId, model });
    const tools = actions && config.claudeActions !== false ? OUTILS : OUTILS.filter(t => ['calculer','verifier_mises_a_jour'].includes(t.function.name));
    let termine = false;
    for (let tour = 0; tour < 8 && !termine; tour++) {
      const message = await completion({ baseUrl, model, messages: history, tools, signal: controller.signal });
      history.push(message);
      if (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
        if (typeof message.content === 'string' && message.content) emit({ kind: 'text', text: message.content });
        termine = true;
        break;
      }
      for (const call of message.tool_calls) {
        const fn = call.function || {};
        const action = fn.name;
        const toolUseId = call.id || crypto.randomUUID();
        let args;
        try { args = JSON.parse(fn.arguments || '{}'); } catch { args = null; }
        const famille = FAMILLES[action];
        emit({ kind: 'tool', id: toolUseId, name: PREFIXE_ACTIONS + action, input: args || {} });
        let result;
        if (!famille || !args || typeof args !== 'object' || Array.isArray(args)) {
          result = { erreur: !famille ? 'Outil inconnu ou non autorisé.' : 'Arguments JSON invalides.' };
          emit({ kind: 'denied', toolName: fn.name, input: args || {} });
        } else if (!actions && famille !== 'lecture') {
          result = { erreur: 'Les actions dans Atelier sont désactivées dans les réglages.' };
          emit({ kind: 'denied', toolName: fn.name, input: args });
        } else {
          let autoriser = famille === 'lecture' || Boolean(config.claudeSansDemander?.[famille]);
          if (!autoriser) {
            const requestId = `local-${crypto.randomUUID()}`;
            autoriser = await new Promise(resolve => {
              pendingPermissions.set(requestId, { resolve });
              emit({ kind: 'permission', requestId, toolUseId, action, famille, input: args });
            });
          }
          if (controller.signal.aborted) throw Object.assign(new Error('Interrompu'), { name: 'AbortError' });
          if (!autoriser) result = { erreur: 'Action refusée par Ragna.' };
          else {
            try { result = await executerAction(action, args, log); }
            catch (err) { result = { erreur: err.message || String(err) }; }
          }
        }
        emit({ kind: 'tool-result', id: toolUseId, isError: Boolean(result?.erreur) });
        history.push({ role: 'tool', tool_call_id: toolUseId, content: String(result?.erreur || result?.texte || 'Fait.') });
      }
    }
    if (!termine) throw new Error('Loki a atteint la limite de 8 cycles d’outils pour un message.');
    emit({ kind: 'result', sessionId });
  } catch (err) {
    if (err.name !== 'AbortError') {
      log?.('ERREUR', `Loki local : ${err.message}`);
      emit({ kind: 'error', message: err.message });
    } else emit({ kind: 'notice', message: 'Réponse locale interrompue.' });
    emit({ kind: 'result', sessionId });
  } finally {
    for (const [id, pending] of pendingPermissions) { pending.resolve(false); pendingPermissions.delete(id); }
    if (activeController === controller) activeController = null;
  }
}

function interrupt() {
  activeController?.abort();
  for (const [id, pending] of pendingPermissions) { pending.resolve(false); pendingPermissions.delete(id); }
}
function reset() {
  interrupt();
  history = [];
  currentModel = null;
  currentBaseUrl = null;
}
module.exports = { completion, send, interrupt, reset, demanderPermission, FAMILLES, FAMILLES_TOUJOURS, DEFAULT_URL };
