// Moteur local compatible avec l'API OpenAI (Ollama, LM Studio, etc.).
// Ce module ne lance aucun programme et ne touche pas directement aux données d'Atelier.
// Les appels d'outils sont renvoyés à l'appelant, qui reste responsable des permissions.
const DEFAULT_URL = 'http://127.0.0.1:11434/v1/chat/completions';

async function completion({ baseUrl = DEFAULT_URL, model, messages, tools, signal }) {
  if (!model || typeof model !== 'string') throw new Error('Indique le nom du modèle local dans les réglages de Loki.');
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Adresse du serveur local invalide.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Le serveur local doit utiliser HTTP ou HTTPS.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      ...(Array.isArray(tools) && tools.length ? { tools, tool_choice: 'auto' } : {}),
      stream: false,
    }),
    signal,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 600);
    throw new Error(`Le serveur local répond ${response.status} : ${detail || response.statusText}`);
  }
  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice?.message) throw new Error('Réponse invalide du serveur local : aucun message.');
  return choice.message;
}


let history = [];
let activeController = null;
let currentModel = null;
let currentBaseUrl = null;

async function send({ baseUrl = DEFAULT_URL, model, text, context = '', sender, emit, log }) {
  if (activeController) throw new Error('Le modèle local est déjà en train de répondre.');
  if (!model) {
    emit({ kind: 'error', message: 'Modèle local manquant. Dans les réglages, indique claudeModel avec le préfixe local:, par exemple local:qwen2.5:7b.' });
    emit({ kind: 'result' });
    return;
  }
  if (model !== currentModel || baseUrl !== currentBaseUrl) {
    history = [];
    currentModel = model;
    currentBaseUrl = baseUrl;
  }
  activeController = new AbortController();
  const controller = activeController;
  try {
    if (context && history.length === 0) {
      history.push({ role: 'system', content: 'Tu es Loki, l’assistant intégré à Atelier. Réponds en français sauf demande contraire. Dans cette première version locale, tu peux consulter le contexte fourni mais tu ne disposes pas encore d’outils pour exécuter des actions dans Atelier. Ne prétends jamais avoir ajouté une note, modifié le calendrier, lancé un minuteur ou exécuté une autre action.\n\n' + context });
    }
    history.push({ role: 'user', content: text });
    emit({ kind: 'init', sessionId: 'local' });
    const message = await completion({ baseUrl, model, messages: history, signal: controller.signal });
    const answer = typeof message.content === 'string' ? message.content : '';
    if (answer) {
      history.push({ role: 'assistant', content: answer });
      emit({ kind: 'text', text: answer });
    }
    emit({ kind: 'result', sessionId: 'local' });
  } catch (err) {
    if (err.name !== 'AbortError') {
      log?.('ERREUR', `Loki local : ${err.message}`);
      emit({ kind: 'error', message: err.message });
    } else emit({ kind: 'notice', message: 'Réponse locale interrompue.' });
    emit({ kind: 'result', sessionId: 'local' });
  } finally {
    if (activeController === controller) activeController = null;
  }
}

function interrupt() {
  activeController?.abort();
}

function reset() {
  interrupt();
  history = [];
  currentModel = null;
  currentBaseUrl = null;
}

module.exports = { completion, send, interrupt, reset, DEFAULT_URL };
