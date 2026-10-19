// Panneau "Claude" : la conversation avec Claude Code, qui tourne dans main.js (voir ../claude.js).
// - Tes messages partent avec le contexte de l'éditeur (fichier ouvert, sélection).
// - La réponse s'affiche au fil de l'eau, en Markdown.
// - Chaque outil utilisé par Claude (lire, modifier, lancer une commande…) apparaît sur une ligne.
// - Avant une modification ou une commande, une carte te demande d'autoriser ou de refuser.
// - Quand Claude modifie un fichier ouvert, l'éditeur le recharge (Ctrl+Z pour annuler).

const claudePanel = (() => {
  const panel = document.querySelector('#claude-panel');
  const resizer = document.querySelector('#claude-resizer');
  const list = document.querySelector('#claude-messages');
  const form = document.querySelector('#claude-form');
  const input = document.querySelector('#claude-input');
  const contextEl = document.querySelector('#claude-context');
  const statusEl = document.querySelector('#claude-status');
  const stopButton = document.querySelector('#claude-stop');
  const sendButton = document.querySelector('#claude-send');

  let busy = false;
  let textBubble = null;     // bulle de réponse en cours d'écriture
  let textRaw = '';          // son texte Markdown brut
  let renderQueued = false;
  let includeContext = true; // le contexte de l'éditeur part avec le prochain message
  const tools = new Map();   // id d'outil -> { name, input, row }

  // Conversation affichée : elle est enregistrée dans l'historique (main.js › claude.js) pour
  // pouvoir y revenir. "items" est ce que le panneau affiche, dans l'ordre.
  const newConversation = () => ({ id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: '', sessionId: null, root: state.root, items: [] });
  let conv = newConversation();
  let replaying = false;     // pendant qu'on réaffiche une ancienne conversation, on n'enregistre rien
  const record = (item) => { if (!replaying) conv.items.push(item); return item; };
  function saveConversation() {
    if (!conv.items.length || !conv.root || conv.root !== state.root) return;
    window.atelier.claudeHistorySave({ id: conv.id, title: conv.title, sessionId: conv.sessionId, items: conv.items })
      .catch((err) => window.atelier.log('ERREUR', `Historique Claude : ${err.message}`));
  }

  // Outils qui écrivent dans des fichiers : après eux, on recharge le fichier dans l'éditeur.
  const WRITE_TOOLS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'];

  // --- Affichage du panneau ---

  function isOpen() { return !panel.hidden; }

  function toggle(open = !isOpen()) {
    panel.hidden = resizer.hidden = !open;
    if (open) {
      refreshContext();
      if (list.children.length === 0) showWelcome();
      input.focus();
    }
  }

  function showWelcome() {
    const el = document.createElement('div');
    el.className = 'claude-welcome';
    el.innerHTML = `
      <i class="codicon codicon-sparkle"></i>
      <p>Pose une question sur ton code, ou demande une modification.</p>
      <p class="hint">Claude voit le fichier ouvert et ta sélection, peut lire tout le projet, et te demande ton accord avant de modifier un fichier ou de lancer une commande.</p>`;
    list.appendChild(el);
  }

  // --- Contexte de l'éditeur ---

  const relative = (p) => (state.root && p.startsWith(state.root) ? p.slice(state.root.length).replace(/^[\\/]/, '') : p);

  function editorContext() {
    const tab = state.activeGroup && state.activeGroup.active;
    if (!tab || tab.file.path === state.configPath) return null;
    const editor = state.activeGroup.editor;
    const selection = editor.getSelection();
    const text = selection && !selection.isEmpty() ? tab.file.model.getValueInRange(selection) : '';
    return {
      path: relative(tab.file.path),
      language: tab.file.model.getLanguageId(),
      selection: text ? { text, start: selection.startLineNumber, end: selection.endLineNumber } : null,
    };
  }

  function refreshContext() {
    const ctx = includeContext ? editorContext() : null;
    contextEl.innerHTML = '';
    if (!ctx) return;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'context-chip';
    chip.title = 'Envoyé avec ton message. Clic pour ne pas l\'envoyer cette fois.';
    const type = fileIcon(ctx.path);
    chip.appendChild(iconElement(type.icon, type.color));
    const label = document.createElement('span');
    label.textContent = ctx.selection ? `${ctx.path} · lignes ${ctx.selection.start}-${ctx.selection.end}` : ctx.path;
    chip.appendChild(label);
    chip.insertAdjacentHTML('beforeend', '<i class="codicon codicon-close"></i>');
    chip.onclick = () => { includeContext = false; refreshContext(); };
    contextEl.appendChild(chip);
  }
  // Le contexte suit l'éditeur : changement d'onglet, de sélection…
  document.addEventListener('selectionchange', () => isOpen() && refreshContext());
  window.addEventListener('mouseup', () => isOpen() && setTimeout(refreshContext, 0));
  window.addEventListener('keyup', () => isOpen() && refreshContext());

  function withContext(text) {
    const ctx = includeContext ? editorContext() : null;
    if (!ctx) return text;
    let out = `${text}\n\n(Contexte de l'éditeur : le fichier ouvert est ${ctx.path}`;
    if (ctx.selection) out += `, et j'ai sélectionné les lignes ${ctx.selection.start} à ${ctx.selection.end} :\n\`\`\`${ctx.language}\n${ctx.selection.text}\n\`\`\`\n)`;
    else out += '.)';
    return out;
  }

  // --- Envoi ---

  function setBusy(value, label = '') {
    busy = value;
    stopButton.hidden = !value;
    sendButton.disabled = value;
    statusEl.innerHTML = value ? `<i class="codicon codicon-loading codicon-modifier-spin"></i>${label || 'Claude réfléchit…'}` : '';
  }

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    if (!state.root) return notify.info("Ouvre d'abord un dossier : Claude travaille dans le projet ouvert.");
    // Le projet a changé depuis le début de cette conversation : on en commence une nouvelle.
    if (conv.root !== state.root) await startNew();
    list.querySelector('.claude-welcome')?.remove();
    const ctx = includeContext ? editorContext() : null;
    if (!conv.title) conv.title = text.replace(/\s+/g, ' ').slice(0, 80);
    addUserBubble(text, ctx);
    saveConversation();
    input.value = '';
    autoGrow();
    setBusy(true);
    try {
      await window.atelier.claudeSend(withContext(text));
    } catch (err) {
      setBusy(false);
      addNotice('error', cleanError(err));
    }
    includeContext = true;
    refreshContext();
  }

  form.onsubmit = (e) => { e.preventDefault(); send(); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  const autoGrow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
  };
  input.addEventListener('input', autoGrow);

  stopButton.onclick = () => window.atelier.claudeInterrupt();

  function clearView() {
    endText();
    list.innerHTML = '';
    tools.clear();
    setBusy(false);
  }

  // "+" : nouvelle conversation. L'ancienne reste dans l'historique.
  async function startNew() {
    saveConversation();
    await window.atelier.claudeReset();
    clearView();
    conv = newConversation();
    document.querySelector('#claude-model').textContent = '';
    showWelcome();
  }
  document.querySelector('#claude-new').onclick = async () => { await startNew(); input.focus(); };

  // --- Historique des conversations ---

  const historyButton = document.querySelector('#claude-history');
  const historyList = document.querySelector('#claude-history-list');

  function when(ms) {
    const minutes = Math.round((Date.now() - ms) / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const d = new Date(ms);
    const today = new Date();
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return `aujourd'hui, ${time}`;
    return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}, ${time}`;
  }

  async function showHistory() {
    const conversations = state.root ? await window.atelier.claudeHistory() : [];
    historyList.innerHTML = '<div class="history-title">Conversations de ce projet</div>';
    if (!conversations.length) historyList.insertAdjacentHTML('beforeend', '<p class="hint">Aucune conversation pour l\'instant.</p>');
    for (const c of conversations) {
      const row = document.createElement('div');
      row.className = `history-item${c.id === conv.id ? ' current' : ''}`;
      row.innerHTML = '<div class="history-text"><span class="history-name"></span><span class="history-date"></span></div><button class="icon-button" title="Supprimer cette conversation"><i class="codicon codicon-trash"></i></button>';
      row.querySelector('.history-name').textContent = c.title || 'Sans titre';
      row.querySelector('.history-date').textContent = when(c.updatedAt);
      row.onclick = () => { historyList.hidden = true; openConversation(c.id); };
      row.querySelector('button').onclick = async (e) => {
        e.stopPropagation();
        await window.atelier.claudeHistoryDelete(c.id);
        if (c.id === conv.id) conv.items = []; // ne pas la réenregistrer
        showHistory();
      };
      historyList.appendChild(row);
    }
    historyList.hidden = false;
  }
  historyButton.onclick = (e) => {
    e.stopPropagation();
    if (historyList.hidden) showHistory(); else historyList.hidden = true;
  };
  document.addEventListener('click', (e) => { if (!historyList.contains(e.target)) historyList.hidden = true; });

  // Réaffiche une ancienne conversation, et la reprend : ton prochain message relance Claude Code
  // sur cette session (--resume), il se souvient donc de tout ce qui a été dit.
  async function openConversation(id) {
    if (id === conv.id) return;
    const saved = await window.atelier.claudeHistoryGet(id);
    if (!saved) return notify.error('Cette conversation est introuvable.');
    saveConversation();
    await window.atelier.claudeResume(saved.sessionId);
    clearView();
    conv = { id: saved.id, title: saved.title, sessionId: saved.sessionId, root: state.root, items: saved.items || [] };
    document.querySelector('#claude-model').textContent = '';
    replaying = true;
    for (const item of conv.items) {
      if (item.t === 'user') addUserBubble(item.text, item.meta ? { label: item.meta } : null);
      if (item.t === 'assistant') { appendText(item.text); endText(); }
      if (item.t === 'tool') addToolRow(item.icon, item.label, item.state);
    }
    replaying = false;
    if (!saved.sessionId) addNotice('info', "Claude Code n'avait pas encore répondu dans cette conversation : elle repart de zéro.");
    list.scrollTop = list.scrollHeight;
    input.focus();
  }
  document.querySelector('#claude-close').onclick = () => toggle(false);
  document.querySelector('#btn-claude').onclick = () => toggle();

  // --- Bulles ---

  function scrollDown() {
    // On ne force le défilement que si tu étais déjà en bas (pour ne pas te gêner si tu relis plus haut).
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }

  function addUserBubble(text, ctx) {
    const el = document.createElement('div');
    el.className = 'claude-msg user';
    const body = document.createElement('div');
    body.className = 'bubble';
    body.textContent = text;
    el.appendChild(body);
    const metaText = ctx && (ctx.label || (ctx.selection ? `${ctx.path} · lignes ${ctx.selection.start}-${ctx.selection.end}` : ctx.path));
    if (metaText) {
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.textContent = metaText;
      el.appendChild(meta);
    }
    record({ t: 'user', text, meta: metaText || null });
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
  }

  function addNotice(type, html) {
    endText();
    const el = document.createElement('div');
    el.className = `claude-notice ${type}`;
    el.innerHTML = `<i class="codicon codicon-${type === 'error' ? 'error' : 'info'}"></i><div></div>`;
    el.lastChild.innerHTML = html;
    list.appendChild(el);
    scrollDown();
    return el;
  }

  function appendText(text) {
    if (!textBubble) {
      textBubble = document.createElement('div');
      textBubble.className = 'claude-msg assistant';
      textBubble.innerHTML = '<div class="markdown"></div>';
      list.appendChild(textBubble);
      textRaw = '';
    }
    textRaw += text;
    if (!renderQueued) {
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        if (textBubble) textBubble.firstChild.innerHTML = renderMarkdown(textRaw);
        scrollDown();
      });
    }
  }

  // Fin d'un bloc de texte : rendu final, avec la coloration du code par Monaco.
  function endText() {
    if (!textBubble) return;
    const bubble = textBubble;
    bubble.firstChild.innerHTML = renderMarkdown(textRaw);
    textBubble = null;
    record({ t: 'assistant', text: textRaw });
    decorateCode(bubble);
  }

  function decorateCode(root) {
    for (const pre of root.querySelectorAll('pre')) {
      const code = pre.querySelector('code');
      const lang = pre.dataset.lang;
      const raw = code.textContent;
      if (lang) {
        monaco.editor.colorize(raw, lang, { tabSize: state.config.tabSize })
          .then((html) => { code.innerHTML = html; })
          .catch(() => {}); // langage inconnu de Monaco : on garde le texte brut
      }
      const copy = document.createElement('button');
      copy.className = 'icon-button copy';
      copy.title = 'Copier';
      copy.innerHTML = '<i class="codicon codicon-copy"></i>';
      copy.onclick = async () => {
        await navigator.clipboard.writeText(raw);
        copy.innerHTML = '<i class="codicon codicon-check"></i>';
        setTimeout(() => { copy.innerHTML = '<i class="codicon codicon-copy"></i>'; }, 1200);
      };
      pre.appendChild(copy);
    }
  }

  // --- Outils utilisés par Claude ---

  function describeTool(name, inp = {}) {
    const p = (x) => relative(x || '');
    switch (name) {
      case 'Read': return ['eye', `Lit ${p(inp.file_path)}`];
      case 'Edit': case 'MultiEdit': return ['edit', `Modifie ${p(inp.file_path)}`];
      case 'Write': return ['new-file', `Écrit ${p(inp.file_path)}`];
      case 'NotebookEdit': return ['notebook', `Modifie ${p(inp.notebook_path)}`];
      case 'Bash': case 'PowerShell': return ['terminal', `Lance : ${inp.command || ''}`];
      case 'Grep': return ['search', `Cherche « ${inp.pattern || ''} »`];
      case 'Glob': return ['files', `Cherche les fichiers ${inp.pattern || ''}`];
      case 'WebFetch': return ['globe', `Lit la page ${inp.url || ''}`];
      case 'WebSearch': return ['globe', `Cherche sur le web « ${inp.query || ''} »`];
      case 'TodoWrite': return ['checklist', 'Met à jour sa liste de tâches'];
      case 'Task': case 'Agent': return ['organization', `Confie une tâche à un sous-agent : ${inp.description || ''}`];
      default: return ['tools', name];
    }
  }

  const STATE_ICONS = { running: 'loading codicon-modifier-spin', done: 'check', failed: 'close' };
  function addToolRow(icon, label, rowState = 'running') {
    const row = document.createElement('div');
    row.className = `claude-tool ${rowState}`;
    row.innerHTML = `<i class="codicon codicon-${icon}"></i><span class="label"></span><i class="codicon state codicon-${STATE_ICONS[rowState] || 'circle-slash'}"></i>`;
    row.querySelector('.label').textContent = label;
    row.title = label;
    list.appendChild(row);
    return row;
  }

  function addTool({ id, name, input: inp }) {
    endText();
    const [icon, label] = describeTool(name, inp);
    const row = addToolRow(icon, label);
    const item = record({ t: 'tool', icon, label, state: 'running' });
    tools.set(id, { name, input: inp, row, item });
    setBusy(true, `${label.length > 40 ? `${label.slice(0, 40)}…` : label}`);
    scrollDown();
  }

  function toolDone({ id, isError }) {
    const tool = tools.get(id);
    if (!tool) return;
    tool.row.classList.remove('running');
    tool.row.classList.add(isError ? 'failed' : 'done');
    tool.row.querySelector('.state').className = `codicon state codicon-${isError ? 'close' : 'check'}`;
    tool.item.state = isError ? 'failed' : 'done';
    setBusy(true);
    if (!isError && WRITE_TOOLS.includes(tool.name)) {
      const path = tool.input.file_path || tool.input.notebook_path;
      if (path) reloadFromDisk(path);
      scheduleTreeRefresh();
    }
    if (!isError && ['Bash', 'PowerShell'].includes(tool.name)) scheduleTreeRefresh(); // une commande a pu créer des fichiers
  }

  let treeTimer = null;
  function scheduleTreeRefresh() {
    clearTimeout(treeTimer);
    treeTimer = setTimeout(() => state.root && refreshFolder(state.root), 400);
  }

  // --- Demandes de permission ---

  function permissionDetails(name, inp) {
    const box = document.createElement('div');
    box.className = 'perm-details';
    const pre = (cls, text) => {
      const el = document.createElement('pre');
      el.className = cls;
      el.textContent = text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
      box.appendChild(el);
    };
    if (name === 'Edit') {
      pre('diff-old', inp.old_string || '');
      pre('diff-new', inp.new_string || '');
    } else if (name === 'MultiEdit') {
      for (const e of inp.edits || []) { pre('diff-old', e.old_string || ''); pre('diff-new', e.new_string || ''); }
    } else if (name === 'Write') {
      pre('diff-new', inp.content || '');
    } else if (name === 'Bash' || name === 'PowerShell') {
      if (inp.description) {
        const d = document.createElement('p');
        d.textContent = inp.description;
        box.appendChild(d);
      }
      pre('command', inp.command || '');
    } else {
      pre('command', JSON.stringify(inp, null, 2));
    }
    return box;
  }

  function askPermission(req) {
    endText();
    const [icon, label] = describeTool(req.toolName, req.input);
    const card = document.createElement('div');
    card.className = 'claude-permission';
    card.innerHTML = `
      <div class="perm-title"><i class="codicon codicon-${icon}"></i><span></span></div>
      <div class="perm-actions">
        <button class="allow primary-button">Autoriser</button>
        <button class="always" title="Ne plus demander pour ce genre d'action pendant cette conversation">Toujours autoriser</button>
        <button class="deny">Refuser</button>
      </div>`;
    card.querySelector('.perm-title span').textContent = `Claude veut : ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
    card.insertBefore(permissionDetails(req.toolName, req.input), card.querySelector('.perm-actions'));
    if (!req.suggestions.length) card.querySelector('.always').remove();

    const answer = (decision) => {
      window.atelier.claudePermission({
        requestId: req.requestId,
        toolUseId: req.toolUseId,
        decision,
        input: req.input,
        suggestions: req.suggestions,
      });
      card.classList.add('answered', decision === 'deny' ? 'denied' : 'allowed');
      card.querySelector('.perm-actions').innerHTML = `<span class="perm-answer">${decision === 'deny' ? 'Refusé' : decision === 'always' ? 'Autorisé (et pour la suite)' : 'Autorisé'}</span>`;
      setBusy(true);
    };
    card.querySelector('.allow').onclick = () => answer('allow');
    card.querySelector('.always')?.addEventListener('click', () => answer('always'));
    card.querySelector('.deny').onclick = () => answer('deny');

    list.appendChild(card);
    setBusy(true, 'En attente de ta réponse');
    list.scrollTop = list.scrollHeight;
    if (!isOpen()) toggle(true);
    card.querySelector('.allow').focus();
  }

  // --- Événements venant de Claude Code ---

  const INSTALL_HELP = `Claude Code n'est pas installé (ou la commande <code>claude</code> est introuvable).<br>
    Pour l'installer, dans le terminal : <code>npm install -g @anthropic-ai/claude-code</code>,
    puis lance <code>claude</code> une fois pour te connecter à ton compte Claude.
    Si Claude Code est installé ailleurs, indique son chemin dans Réglages › Claude.`;

  window.atelier.onClaudeEvent((e) => {
    switch (e.kind) {
      case 'init':
        document.querySelector('#claude-model').textContent = e.model ? `· ${e.model}` : '';
        conv.sessionId = e.sessionId;
        break;
      case 'text':
        appendText(e.text);
        setBusy(true, 'Claude écrit…');
        break;
      case 'tool':
        addTool(e);
        break;
      case 'tool-result':
        toolDone(e);
        break;
      case 'permission':
        askPermission(e);
        break;
      case 'result': {
        endText();
        setBusy(false);
        // Un outil resté "en cours" (conversation interrompue) n'aura plus de réponse.
        for (const item of conv.items) if (item.t === 'tool' && item.state === 'running') item.state = 'stopped';
        for (const t of tools.values()) {
          if (t.row.classList.contains('running')) { t.row.className = 'claude-tool stopped'; t.row.querySelector('.state').className = 'codicon state codicon-circle-slash'; }
        }
        saveConversation();
        if (e.isError) {
          const text = e.text || '';
          const hint = /log ?in|auth|credential/i.test(text) ? '<br>Lance <code>claude</code> une fois dans le terminal pour te connecter.' : '';
          addNotice('error', `${escapeHtml(text || 'Claude a rencontré une erreur.')}${hint}`);
        }
        break;
      }
      case 'error':
        endText();
        setBusy(false);
        addNotice('error', e.notInstalled ? INSTALL_HELP : `Impossible de lancer Claude Code : ${escapeHtml(e.message)}`);
        break;
      case 'exit':
        endText();
        if (busy || e.notInstalled) {
          setBusy(false);
          if (e.notInstalled) addNotice('error', INSTALL_HELP);
          else addNotice('error', `Claude Code s'est arrêté sans répondre${e.code ? ` (code ${e.code})` : ''}.${e.stderr ? `<br><code>${escapeHtml(e.stderr.slice(-400))}</code>` : ''}<br>Ton prochain message reprendra la conversation.`);
        }
        break;
      default:
    }
  });

  // --- Poignée : glisser pour changer la largeur ---
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizer.classList.add('dragging');
    const right = panel.getBoundingClientRect().right;
    const onMove = (ev) => { panel.style.width = `${Math.min(Math.max(right - ev.clientX, 280), window.innerWidth * 0.6)}px`; };
    const onUp = () => {
      resizer.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  return { toggle, isOpen };
})();

// --- Petit moteur Markdown ---
// Juste ce que Claude utilise : titres, gras, italique, code, listes, citations, liens.
// Tout le texte est échappé d'abord : aucun HTML venant de la réponse n'est interprété.

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    // Les liens ne sont pas cliquables (ils ouvriraient la page dans l'IDE) : on montre l'adresse.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<span class="link" title="$2">$1</span>');
}

function renderMarkdown(source) {
  const lines = source.split('\n');
  const out = [];
  let i = 0;
  let listType = null;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*```(\w*)/.exec(line);
    if (fence) {
      closeList();
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++; // fermeture ``` (absente si le texte arrive encore)
      out.push(`<pre data-lang="${escapeHtml(fence[1])}"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)/.exec(line);
    if (heading) {
      closeList();
      out.push(`<h${heading[1].length + 2}>${renderInline(heading[2])}</h${heading[1].length + 2}>`);
    } else if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (listType !== type) { closeList(); out.push(`<${type}>`); listType = type; }
      out.push(`<li>${renderInline((bullet || numbered)[1])}</li>`);
    } else if (/^>\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ''))}</blockquote>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      // Lignes qui se suivent = un même paragraphe.
      const para = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*(```|#{1,4}\s|[-*]\s|\d+[.)]\s|>)/.test(lines[i + 1])) para.push(lines[++i]);
      out.push(`<p>${para.map(renderInline).join('<br>')}</p>`);
    }
    i++;
  }
  closeList();
  return out.join('');
}
