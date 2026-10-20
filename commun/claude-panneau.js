// Panneau « Claude » des outils de l'Atelier (Skald, Tafl, Brokk) : le côté interface.
// Le même fichier sert aux trois outils (voir commun/LISEZMOI.md). Il construit lui-même son panneau,
// à droite de la fenêtre, et un bouton étincelle dans la barre de titre. Ctrl+Maj+K l'affiche ou le masque.
//
// - Ta question part vers Claude Code (commun/claude.js), qui travaille dans le dossier du projet.
// - La réponse s'affiche au fil de l'eau, en Markdown.
// - Chaque outil utilisé par Claude (lire, modifier, retenir…) apparaît sur une ligne.
// - Avant une modification, une commande ou une info à retenir, une carte te demande Autoriser / Refuser.
// - Les conversations sont gardées par projet (bouton horloge), comme dans Rune.
//
// Pour l'utiliser : <link rel="stylesheet" href="../commun/claude-panneau.css"> et, en dernier,
// <script src="../commun/claude-panneau.js" data-outil="Skald" data-bienvenue="…"></script>.
// (Les réglages data-… évitent un script dans la page, que la sécurité de la fenêtre interdit.)

const ClaudePanneau = (() => {
  const api = () => window.claude; // exposé par preload.js
  let panel, list, input, statusEl, stopButton, sendButton, historyList, projetEl, modelEl, titleButton;
  let outil = 'l\'outil';
  let bienvenue = '';
  let busy = false;
  let textBubble = null;
  let textRaw = '';
  let renderQueued = false;
  const tools = new Map(); // id d'outil -> { name, input, row, item }
  let projetActuel = null; // { dossier, nom, source } ou null

  // --- Conversation affichée (enregistrée dans l'historique pour y revenir) ---
  const newConversation = () => ({ id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: '', sessionId: null, items: [] });
  let conv = newConversation();
  let replaying = false;
  const record = (item) => { if (!replaying) conv.items.push(item); return item; };
  function saveConversation() {
    if (!conv.items.length) return;
    api().historySave({ id: conv.id, title: conv.title, sessionId: conv.sessionId, items: conv.items }).catch(() => {});
  }

  function init(options = {}) {
    outil = options.outil || outil;
    bienvenue = options.bienvenue || 'Pose une question, ou demande un coup de main.';
    build();
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyK') { e.preventDefault(); toggle(); }
    }, true);
    api().onEvent(onEvent);
    try { if (localStorage.getItem('claude-panneau-ouvert') === '1') toggle(true); } catch { /* stockage indisponible */ }
  }

  // --- Construction du panneau ---
  function build() {
    titleButton = document.createElement('button');
    titleButton.className = 'icon-button claude-bouton-titre';
    titleButton.title = 'Discuter avec Claude (Ctrl+Maj+K)';
    titleButton.innerHTML = '<i class="codicon codicon-sparkle"></i>';
    titleButton.onclick = () => toggle();
    const actions = document.querySelector('#titlebar .title-actions');
    if (actions) actions.appendChild(titleButton);

    panel = document.createElement('aside');
    panel.className = 'claude-panneau';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="cp-poignee" title="Glisser pour changer la largeur"></div>
      <header class="cp-entete">
        <span class="cp-titre"><i class="codicon codicon-sparkle"></i>Claude <span class="cp-modele"></span></span>
        <span class="cp-espace"></span>
        <button class="icon-button cp-historique" title="Conversations précédentes de ce projet"><i class="codicon codicon-history"></i></button>
        <button class="icon-button cp-nouvelle" title="Nouvelle conversation"><i class="codicon codicon-add"></i></button>
        <button class="icon-button cp-fermer" title="Masquer (Ctrl+Maj+K)"><i class="codicon codicon-chevron-right"></i></button>
      </header>
      <div class="cp-projet"></div>
      <div class="cp-liste-historique" hidden></div>
      <div class="cp-messages"></div>
      <form class="cp-formulaire">
        <textarea class="cp-saisie" rows="1" placeholder="Écris à Claude… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"></textarea>
        <div class="cp-actions">
          <span class="cp-statut"></span>
          <button type="button" class="icon-button cp-stop" title="Arrêter" hidden><i class="codicon codicon-debug-stop"></i></button>
          <button type="submit" class="icon-button cp-envoyer" title="Envoyer (Entrée)"><i class="codicon codicon-send"></i></button>
        </div>
      </form>`;
    document.body.appendChild(panel);
    const $ = (s) => panel.querySelector(s);
    list = $('.cp-messages');
    input = $('.cp-saisie');
    statusEl = $('.cp-statut');
    stopButton = $('.cp-stop');
    sendButton = $('.cp-envoyer');
    historyList = $('.cp-liste-historique');
    projetEl = $('.cp-projet');
    modelEl = $('.cp-modele');

    $('.cp-formulaire').onsubmit = (e) => { e.preventDefault(); send(); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
      e.stopPropagation(); // les raccourcis de l'outil (B, V, Suppr…) ne doivent pas se déclencher en écrivant
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('input', autoGrow);
    stopButton.onclick = () => api().interrupt();
    $('.cp-nouvelle').onclick = async () => { await startNew(); input.focus(); };
    $('.cp-fermer').onclick = () => toggle(false);
    $('.cp-historique').onclick = (e) => {
      e.stopPropagation();
      if (historyList.hidden) showHistory(); else historyList.hidden = true;
    };
    document.addEventListener('click', (e) => { if (!historyList.contains(e.target)) historyList.hidden = true; });

    // Poignée : glisser pour changer la largeur (gardée pour la prochaine fois).
    const poignee = $('.cp-poignee');
    try { const w = Number(localStorage.getItem('claude-panneau-largeur')); if (w) setWidth(w); } catch { /* rien */ }
    poignee.addEventListener('mousedown', (e) => {
      e.preventDefault();
      poignee.classList.add('dragging');
      const onMove = (ev) => setWidth(window.innerWidth - ev.clientX);
      const onUp = () => {
        poignee.classList.remove('dragging');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        try { localStorage.setItem('claude-panneau-largeur', String(panel.offsetWidth)); } catch { /* rien */ }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  function setWidth(w) {
    const largeur = Math.round(Math.min(Math.max(w, 300), window.innerWidth * 0.6));
    document.documentElement.style.setProperty('--claude-largeur', `${largeur}px`);
    window.dispatchEvent(new Event('resize')); // le canevas de l'outil se recale
  }

  function isOpen() { return panel && !panel.hidden; }

  function toggle(open = !isOpen()) {
    panel.hidden = !open;
    document.body.classList.toggle('claude-ouvert', open);
    titleButton.classList.toggle('active', open);
    try { localStorage.setItem('claude-panneau-ouvert', open ? '1' : '0'); } catch { /* rien */ }
    window.dispatchEvent(new Event('resize'));
    if (open) {
      refreshProjet();
      if (!list.children.length) showWelcome();
      input.focus();
    }
  }

  async function refreshProjet() {
    projetActuel = await api().projet().catch(() => null);
    projetEl.innerHTML = '';
    const icon = document.createElement('i');
    icon.className = `codicon codicon-${projetActuel ? 'folder' : 'circle-slash'}`;
    const label = document.createElement('span');
    label.textContent = projetActuel
      ? `Projet : ${projetActuel.nom}${projetActuel.source === 'dernier' ? ' (le dernier ouvert depuis Atelier)' : ''}`
      : 'Aucun projet : ouvre-en un depuis Atelier pour que Claude s\'en souvienne';
    projetEl.title = projetActuel ? projetActuel.dossier : '';
    projetEl.append(icon, label);
  }

  function showWelcome() {
    const el = document.createElement('div');
    el.className = 'cp-bienvenue';
    el.innerHTML = '<i class="codicon codicon-sparkle"></i><p></p><p class="hint"></p>';
    el.children[1].textContent = bienvenue;
    el.children[2].textContent = `Claude connaît la mémoire du projet et tes notes (gardées par Atelier), peut lire les fichiers du projet, et te demande ton accord avant de modifier quoi que ce soit.`;
    list.appendChild(el);
  }

  // --- Envoi ---
  function setBusy(value, label = '') {
    busy = value;
    stopButton.hidden = !value;
    sendButton.disabled = value;
    statusEl.innerHTML = value ? '<i class="codicon codicon-loading codicon-modifier-spin"></i><span></span>' : '';
    if (value) statusEl.lastChild.textContent = label || 'Claude réfléchit…';
  }
  const autoGrow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
  };

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    list.querySelector('.cp-bienvenue')?.remove();
    if (!conv.title) conv.title = text.replace(/\s+/g, ' ').slice(0, 80);
    addUserBubble(text);
    saveConversation();
    input.value = '';
    autoGrow();
    setBusy(true);
    try {
      await api().send(text);
    } catch (err) {
      setBusy(false);
      addNotice('error', escapeHtml(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')));
    }
  }

  function clearView() {
    endText();
    list.innerHTML = '';
    tools.clear();
    setBusy(false);
  }

  async function startNew() {
    saveConversation();
    await api().reset();
    clearView();
    conv = newConversation();
    modelEl.textContent = '';
    refreshProjet();
    showWelcome();
  }

  // --- Historique ---
  function when(ms) {
    const minutes = Math.round((Date.now() - ms) / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const d = new Date(ms);
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return `aujourd'hui, ${time}`;
    return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}, ${time}`;
  }

  async function showHistory() {
    const conversations = await api().history();
    historyList.innerHTML = '<div class="cp-historique-titre">Conversations de ce projet</div>';
    if (!conversations.length) historyList.insertAdjacentHTML('beforeend', '<p class="hint">Aucune conversation pour l\'instant.</p>');
    for (const c of conversations) {
      const row = document.createElement('div');
      row.className = `cp-historique-ligne${c.id === conv.id ? ' current' : ''}`;
      row.innerHTML = '<div class="cp-historique-texte"><span class="nom"></span><span class="date"></span></div><button class="icon-button" title="Supprimer cette conversation"><i class="codicon codicon-trash"></i></button>';
      row.querySelector('.nom').textContent = c.title || 'Sans titre';
      row.querySelector('.date').textContent = when(c.updatedAt);
      row.onclick = () => { historyList.hidden = true; openConversation(c.id); };
      row.querySelector('button').onclick = async (e) => {
        e.stopPropagation();
        await api().historyDelete(c.id);
        if (c.id === conv.id) conv.items = [];
        showHistory();
      };
      historyList.appendChild(row);
    }
    historyList.hidden = false;
  }

  async function openConversation(id) {
    if (id === conv.id) return;
    const saved = await api().historyGet(id);
    if (!saved) return;
    saveConversation();
    await api().resume(saved.sessionId);
    clearView();
    conv = { id: saved.id, title: saved.title, sessionId: saved.sessionId, items: saved.items || [] };
    modelEl.textContent = '';
    replaying = true;
    for (const item of conv.items) {
      if (item.t === 'user') addUserBubble(item.text);
      if (item.t === 'assistant') { appendText(item.text); endText(); }
      if (item.t === 'tool') addToolRow(item.icon, item.label, item.state);
    }
    replaying = false;
    if (!saved.sessionId) addNotice('info', "Claude Code n'avait pas encore répondu dans cette conversation : elle repart de zéro.");
    list.scrollTop = list.scrollHeight;
    input.focus();
  }

  // --- Bulles ---
  function scrollDown() {
    if (list.scrollHeight - list.scrollTop - list.clientHeight < 120) list.scrollTop = list.scrollHeight;
  }

  function addUserBubble(text) {
    const el = document.createElement('div');
    el.className = 'cp-msg user';
    const body = document.createElement('div');
    body.className = 'bubble';
    body.textContent = text;
    el.appendChild(body);
    record({ t: 'user', text });
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
  }

  function addNotice(type, html) {
    endText();
    const el = document.createElement('div');
    el.className = `cp-notice ${type}`;
    el.innerHTML = `<i class="codicon codicon-${type === 'error' ? 'error' : 'info'}"></i><div></div>`;
    el.lastChild.innerHTML = html;
    list.appendChild(el);
    scrollDown();
  }

  function appendText(text) {
    if (!textBubble) {
      textBubble = document.createElement('div');
      textBubble.className = 'cp-msg assistant';
      textBubble.innerHTML = '<div class="cp-markdown"></div>';
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

  function endText() {
    if (!textBubble) return;
    const bubble = textBubble;
    bubble.firstChild.innerHTML = renderMarkdown(textRaw);
    textBubble = null;
    record({ t: 'assistant', text: textRaw });
    for (const pre of bubble.querySelectorAll('pre')) {
      const raw = pre.textContent;
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
  const court = (p) => {
    const s = String(p || '');
    const racine = projetActuel?.dossier;
    return racine && s.startsWith(racine) ? s.slice(racine.length).replace(/^[\\/]/, '') : s.split(/[\\/]/).pop();
  };
  function describeTool(name, inp = {}) {
    switch (name) {
      case 'Read': return ['eye', `Lit ${court(inp.file_path)}`];
      case 'Edit': case 'MultiEdit': return ['edit', `Modifie ${court(inp.file_path)}`];
      case 'Write': return ['new-file', `Écrit ${court(inp.file_path)}`];
      case 'Bash': case 'PowerShell': return ['terminal', `Lance : ${inp.command || ''}`];
      case 'Grep': return ['search', `Cherche « ${inp.pattern || ''} »`];
      case 'Glob': return ['files', `Cherche les fichiers ${inp.pattern || ''}`];
      case 'WebFetch': return ['globe', `Lit la page ${inp.url || ''}`];
      case 'WebSearch': return ['globe', `Cherche sur le web « ${inp.query || ''} »`];
      case 'TodoWrite': return ['checklist', 'Met à jour sa liste de tâches'];
      case 'Task': case 'Agent': return ['organization', `Confie une tâche à un sous-agent : ${inp.description || ''}`];
      case 'mcp__atelier__lire_contexte': return ['bookmark', 'Lit la mémoire du projet (Atelier)'];
      case 'mcp__atelier__lire_notes': return ['note', 'Lit tes notes (Atelier)'];
      case 'mcp__atelier__retenir_projet': return ['bookmark', `Retient : ${inp.texte || ''}`];
      case 'mcp__atelier__oublier_projet': return ['bookmark', `Oublie l'info ${inp.id || ''} du projet`];
      default: return ['tools', name];
    }
  }

  const STATE_ICONS = { running: 'loading codicon-modifier-spin', done: 'check', failed: 'close' };
  function addToolRow(icon, label, rowState = 'running') {
    const row = document.createElement('div');
    row.className = `cp-outil ${rowState}`;
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
    setBusy(true, label.length > 40 ? `${label.slice(0, 40)}…` : label);
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
  }

  // --- Demandes de permission ---
  function permissionDetails(name, inp) {
    const box = document.createElement('div');
    box.className = 'cp-details';
    const pre = (cls, text) => {
      const el = document.createElement('pre');
      el.className = cls;
      el.textContent = text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
      box.appendChild(el);
    };
    if (name === 'Edit') { pre('diff-old', inp.old_string || ''); pre('diff-new', inp.new_string || ''); }
    else if (name === 'MultiEdit') for (const e of inp.edits || []) { pre('diff-old', e.old_string || ''); pre('diff-new', e.new_string || ''); }
    else if (name === 'Write') pre('diff-new', inp.content || '');
    else if (name === 'Bash' || name === 'PowerShell') {
      if (inp.description) { const d = document.createElement('p'); d.textContent = inp.description; box.appendChild(d); }
      pre('command', inp.command || '');
    } else if (name === 'mcp__atelier__retenir_projet') pre('diff-new', inp.texte || '');
    else pre('command', JSON.stringify(inp, null, 2));
    return box;
  }

  function askPermission(req) {
    endText();
    const [icon, label] = describeTool(req.toolName, req.input);
    const card = document.createElement('div');
    card.className = 'cp-permission';
    card.innerHTML = `
      <div class="cp-perm-titre"><i class="codicon codicon-${icon}"></i><span></span></div>
      <div class="cp-perm-actions">
        <button class="allow primary-button">Autoriser</button>
        <button class="always" title="Ne plus demander pour ce genre d'action pendant cette conversation">Toujours autoriser</button>
        <button class="deny">Refuser</button>
      </div>`;
    card.querySelector('.cp-perm-titre span').textContent = `Claude veut : ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
    card.insertBefore(permissionDetails(req.toolName, req.input), card.querySelector('.cp-perm-actions'));
    if (!req.suggestions.length) card.querySelector('.always').remove();
    const answer = (decision) => {
      api().permission({ requestId: req.requestId, toolUseId: req.toolUseId, decision, input: req.input, suggestions: req.suggestions });
      card.classList.add('answered', decision === 'deny' ? 'denied' : 'allowed');
      card.querySelector('.cp-perm-actions').innerHTML = `<span class="cp-perm-reponse">${decision === 'deny' ? 'Refusé' : decision === 'always' ? 'Autorisé (et pour la suite)' : 'Autorisé'}</span>`;
      setBusy(true);
    };
    card.querySelector('.allow').onclick = () => answer('allow');
    card.querySelector('.always')?.addEventListener('click', () => answer('always'));
    card.querySelector('.deny').onclick = () => answer('deny');
    list.appendChild(card);
    setBusy(true, 'En attente de ta réponse');
    if (!isOpen()) toggle(true);
    list.scrollTop = list.scrollHeight;
    card.querySelector('.allow').focus();
  }

  // --- Événements venant de Claude Code ---
  const INSTALL_HELP = `Claude Code n'est pas installé (ou la commande <code>claude</code> est introuvable).<br>
    Pour l'installer, dans un terminal : <code>npm install -g @anthropic-ai/claude-code</code>,
    puis lance <code>claude</code> une fois pour te connecter à ton compte Claude.
    S'il est installé ailleurs, indique son chemin dans les réglages.`;

  function onEvent(e) {
    switch (e.kind) {
      case 'init':
        modelEl.textContent = e.model ? `· ${e.model}` : '';
        conv.sessionId = e.sessionId;
        break;
      case 'text':
        appendText(e.text);
        setBusy(true, 'Claude écrit…');
        break;
      case 'tool': addTool(e); break;
      case 'tool-result': toolDone(e); break;
      case 'permission': askPermission(e); break;
      case 'result': {
        endText();
        setBusy(false);
        for (const item of conv.items) if (item.t === 'tool' && item.state === 'running') item.state = 'stopped';
        for (const t of tools.values()) {
          if (t.row.classList.contains('running')) { t.row.className = 'cp-outil stopped'; t.row.querySelector('.state').className = 'codicon state codicon-circle-slash'; }
        }
        saveConversation();
        if (e.isError) {
          const text = e.text || '';
          const hint = /log ?in|auth|credential/i.test(text) ? '<br>Lance <code>claude</code> une fois dans un terminal pour te connecter.' : '';
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
  }

  // --- Petit moteur Markdown (même que Rune) : tout le texte est échappé d'abord ---
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function renderInline(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
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
        i++;
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
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
        const para = [line];
        while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*(```|#{1,4}\s|[-*]\s|\d+[.)]\s|>)/.test(lines[i + 1])) para.push(lines[++i]);
        out.push(`<p>${para.map(renderInline).join('<br>')}</p>`);
      }
      i++;
    }
    closeList();
    return out.join('');
  }

  const script = document.currentScript;
  const demarrer = () => init({ outil: script?.dataset.outil, bienvenue: script?.dataset.bienvenue });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();

  return { init, toggle, isOpen, refreshProjet };
})();
