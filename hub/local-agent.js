// Agent local compatible avec l'API OpenAI (Ollama, LM Studio, etc.).
// Les outils sont exécutés par Atelier, jamais directement par le modèle. Les actions modifiantes
// passent par le même écran de permission que Claude Code.
const crypto = require('node:crypto');

const DEFAULT_URL = 'http://127.0.0.1:11434/v1/chat/completions';
const PREFIXE_ACTIONS = 'mcp__atelier__';
const OUTILS = [
  ['ajouter_note', "Ajoute une note dans le widget Notes. La première ligne devient son titre.", { texte: { type: 'string' }, epinglee: { type: 'boolean' } }, ['texte']],
  ['modifier_note', 'Modifie une note existante. Cherche son id dans notes.md ; remplace le texte complet si texte est fourni, et/ou son épingle.', { id: { type: 'string' }, texte: { type: 'string' }, epinglee: { type: 'boolean' } }, ['id']],
  ['supprimer_note', 'Supprime la note demandée. Si l’utilisateur donne un titre, repère la note correspondante dans notes.md et utilise son id exact. Ne demande pas l’id à l’utilisateur si une seule note correspond sans ambiguïté. Ne devine jamais l’id.', { id: { type: 'string' } }, ['id']],
  ['ajouter_evenement', 'Ajoute un évènement au calendrier.', { titre: { type: 'string' }, date: { type: 'string', description: 'Date AAAA-MM-JJ' }, heure: { type: 'string', description: 'Heure HH:MM ou vide' }, note: { type: 'string' } }, ['titre', 'date']],
  ['modifier_evenement', 'Modifie seulement les champs fournis d’un évènement. Trouve son id exact dans calendrier.md.', { id: { type: 'string' }, titre: { type: 'string' }, date: { type: 'string' }, heure: { type: 'string' }, note: { type: 'string' } }, ['id']],
  ['supprimer_evenement', 'Supprime l’évènement correspondant à la demande avec son id exact trouvé dans calendrier.md ; ne devine jamais l’id.', { id: { type: 'string' } }, ['id']],
  ['lancer_minuteur', 'Lance réellement un compte à rebours dans le widget Minuteurs d’Atelier. Utilise cet outil plutôt que de fournir du code.', { nom: { type: 'string' }, minutes: { type: 'number', description: 'Durée en minutes' } }, ['minutes']],
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
  if (activeController) {
    emit({ kind: 'error', message: 'Le modèle local est déjà en train de répondre.' });
    emit({ kind: 'result', sessionId: 'local' });
    return;
  }
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
    const systemContent =
      'Tu es Loki, l’assistant intégré à Atelier. Réponds toujours en français, sauf demande explicite contraire.\n' +
      'RÈGLES DE TRAVAIL :\n' +
      '1. Pour toute action demandée, utilise l’outil Atelier correspondant. Ne donne pas du code ou des instructions à la place d’une action que tu peux exécuter.\n' +
      '2. Avant de modifier ou supprimer une note/évènement, cherche le titre et l’identifiant dans les fichiers de contexte. Si l’utilisateur donne le titre d’une note et qu’une seule note correspond dans notes.md, appelle directement l’outil avec son id exact : ne demande jamais à l’utilisateur de fournir un id que le contexte contient déjà. Si aucune correspondance n’existe, explique que tu ne trouves pas la note. Si plusieurs notes correspondent, demande laquelle. Même règle pour les évènements avec calendrier.md. N’invente jamais d’identifiant.\n' +
      '3. Pour une demande concernant les outils, widgets, versions ou projets d’Atelier, vérifie les fichiers de contexte ci-dessous au lieu de deviner.\n' +
      '4. Après un échec d’outil, lis précisément l’erreur, corrige les arguments ou explique le blocage. Ne pars pas sur une tâche différente et ne prétends pas que l’action a réussi.\n' +
      '5. Pour une demande composée, effectue les étapes nécessaires dans l’ordre et vérifie les résultats.\n' +
      '6. Garde le sujet de la conversation et les contraintes précédentes tant que l’utilisateur ne les remplace pas. Ne change pas de langue spontanément.\n' +
      '7. Les actions modifiantes passent par la confirmation Atelier, sauf autorisation permanente configurée.\n' +
      '8. N’invente jamais le contenu des fichiers, les résultats d’outils, les versions ni les actions réalisées.\n\n' +
      'CONTEXTE ACTUEL D’ATELIER (actualisé à chaque message) :\n\n' + context;
    if (history.length === 0) {
      history.push({ role: 'system', content: systemContent });
    } else {
      history[0] = { role: 'system', content: systemContent };
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
