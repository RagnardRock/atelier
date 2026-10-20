// Widget « Claude » : une conversation avec Claude Code, qui tourne dans main.js (voir ../claude.js).
// - Claude connaît tes notes, ton calendrier et tes projets récents (avec leurs derniers commits) :
//   Atelier les lui prépare avant chacun de tes messages.
// - Il ne fait que lire : rien n'est modifié, aucune commande n'est lancée.
// - La réponse s'affiche au fil de l'eau, en Markdown. Chaque fichier qu'il lit apparaît sur une ligne.
// - La conversation est gardée dans %APPDATA%\atelier-hub\claude.json : elle est toujours là au
//   prochain démarrage d'Atelier, et Claude s'en souvient (--resume). « + » en commence une nouvelle.

const ClaudeWidget = (() => {
  const liste = $('#claude-messages');
  const saisie = $('#claude-saisie');
  const btnEnvoyer = $('#btn-claude-envoyer');
  const etat = $('#claude-etat');

  let occupe = false;
  let bulle = null;        // réponse en cours d'écriture
  let brut = '';           // son texte Markdown
  let rendreBientot = false;
  const outils = new Map(); // id d'outil -> { ligne, item }
  let conv = { sessionId: null, items: [] };

  const SUGGESTIONS = [
    'Qu\'est-ce qui m\'attend cette semaine ?',
    'Quels projets ont avancé ces derniers jours ?',
    'Résume mes notes épinglées',
    'Qu\'est-ce que j\'ai laissé en cours (pas commité, pas poussé) ?',
  ];

  const enregistrer = () => window.atelier.ecrireDonnees('claude', conv).catch(() => {});

  function setOccupe(valeur, texte = '') {
    occupe = valeur;
    btnEnvoyer.title = valeur ? 'Arrêter Claude (Échap)' : 'Envoyer (Entrée)';
    btnEnvoyer.firstChild.className = `codicon codicon-${valeur ? 'debug-stop' : 'send'}`;
    btnEnvoyer.classList.toggle('stop', valeur);
    etat.replaceChildren(...(valeur ? [el('i', { className: 'codicon codicon-loading codicon-modifier-spin' }), texte || 'Claude réfléchit…'] : []));
  }

  function enBas() {
    if (liste.scrollHeight - liste.scrollTop - liste.clientHeight < 120) liste.scrollTop = liste.scrollHeight;
  }

  function accueil() {
    const chips = SUGGESTIONS.map((s) => {
      const b = el('button', { className: 'claude-suggestion', textContent: s });
      b.onclick = () => envoyer(s);
      return b;
    });
    liste.replaceChildren(el('div', { className: 'claude-accueil' },
      el('i', { className: 'codicon codicon-sparkle' }),
      el('p', { textContent: 'Demande-moi ce que tu veux sur tes notes, ton calendrier ou tes projets.' }),
      el('p', { className: 'discret', textContent: 'Je ne fais que lire : je ne modifie rien et ne lance aucune commande.' }),
      el('div', { className: 'claude-suggestions' }, ...chips)));
  }

  // --- Affichage ---

  function bulleUtilisateur(texte) {
    liste.querySelector('.claude-accueil')?.remove();
    liste.append(el('div', { className: 'claude-msg user' }, el('div', { className: 'bulle', textContent: texte })));
    liste.scrollTop = liste.scrollHeight;
  }

  function bulleClaude(texte) {
    const b = el('div', { className: 'claude-msg assistant' }, el('div', { className: 'markdown' }));
    b.firstChild.innerHTML = renderMarkdown(texte);
    liste.append(b);
    return b;
  }

  function avis(type, texte) {
    finTexte();
    liste.append(el('div', { className: `claude-avis ${type}` },
      el('i', { className: `codicon codicon-${type === 'erreur' ? 'error' : 'info'}` }), el('div', { textContent: texte })));
    enBas();
  }

  function ligneOutil(icone, libelle, etatOutil) {
    const icones = { encours: 'loading codicon-modifier-spin', fait: 'check', echec: 'close' };
    const ligne = el('div', { className: `claude-outil ${etatOutil}`, title: libelle },
      el('i', { className: `codicon codicon-${icone}` }),
      el('span', { className: 'libelle', textContent: libelle }),
      el('i', { className: `codicon etat codicon-${icones[etatOutil] || 'circle-slash'}` }));
    liste.append(ligne);
    return ligne;
  }

  function texte(morceau) {
    if (!bulle) {
      liste.querySelector('.claude-accueil')?.remove();
      bulle = bulleClaude('');
      brut = '';
    }
    brut += morceau;
    if (!rendreBientot) {
      rendreBientot = true;
      requestAnimationFrame(() => {
        rendreBientot = false;
        if (bulle) bulle.firstChild.innerHTML = renderMarkdown(brut);
        enBas();
      });
    }
  }

  function finTexte() {
    if (!bulle) return;
    bulle.firstChild.innerHTML = renderMarkdown(brut);
    conv.items.push({ t: 'assistant', text: brut });
    bulle = null;
  }

  // Ce que Claude lit, dit simplement.
  function decrireOutil(nom, inp = {}) {
    const fichier = String(inp.file_path || '').split(/[\\/]/).pop();
    const CONTEXTE = { 'notes.md': 'Lit tes notes', 'calendrier.md': 'Lit ton calendrier', 'projets.md': 'Lit l\'état de tes projets', 'CLAUDE.md': 'Relit ses consignes' };
    switch (nom) {
      case 'Read': return ['eye', CONTEXTE[fichier] || `Lit ${inp.file_path || ''}`];
      case 'Grep': return ['search', `Cherche « ${inp.pattern || ''} »`];
      case 'Glob': return ['files', `Cherche les fichiers ${inp.pattern || ''}`];
      default: return ['tools', nom];
    }
  }

  function outil({ id, name, input }) {
    finTexte();
    const [icone, libelle] = decrireOutil(name, input);
    const item = { t: 'tool', icon: icone, label: libelle, state: 'encours' };
    conv.items.push(item);
    outils.set(id, { ligne: ligneOutil(icone, libelle, 'encours'), item });
    setOccupe(true, libelle.length > 50 ? `${libelle.slice(0, 50)}…` : libelle);
    enBas();
  }

  function outilFini({ id, isError }) {
    const o = outils.get(id);
    if (!o) return;
    o.item.state = isError ? 'echec' : 'fait';
    o.ligne.className = `claude-outil ${o.item.state}`;
    o.ligne.querySelector('.etat').className = `codicon etat codicon-${isError ? 'close' : 'check'}`;
    setOccupe(true);
  }

  // Les outils encore « en cours » à la fin d'une réponse (réponse arrêtée) : barrés.
  function arreterOutils() {
    for (const o of outils.values()) {
      if (o.item.state !== 'encours') continue;
      o.item.state = 'arrete';
      o.ligne.className = 'claude-outil arrete';
      o.ligne.querySelector('.etat').className = 'codicon etat codicon-circle-slash';
    }
    outils.clear();
  }

  // --- Évènements venant de Claude Code ---

  window.atelier.onClaude((e) => {
    switch (e.kind) {
      case 'init':
        conv.sessionId = e.sessionId;
        if (e.model) $('#claude-modele').textContent = e.model.replace(/^claude-/, '');
        break;
      case 'text': texte(e.text); break;
      case 'tool': outil(e); break;
      case 'tool-result': outilFini(e); break;
      case 'denied': avis('info', `Claude voulait utiliser ${e.toolName} : refusé, il ne peut que lire.`); break;
      case 'result':
        finTexte();
        arreterOutils();
        if (e.sessionId) conv.sessionId = e.sessionId;
        if (e.isError && e.text) avis('erreur', e.text);
        setOccupe(false);
        enregistrer();
        break;
      case 'error':
      case 'exit':
        finTexte();
        arreterOutils();
        if (e.notInstalled) {
          avis('erreur', 'Claude Code est introuvable sur ce PC. Installe-le (claude.com/claude-code), ou indique le chemin de la commande dans les réglages d\'Atelier (Ctrl+,).');
        } else if (e.kind === 'error' || (occupe && e.code)) {
          avis('erreur', `Claude s'est arrêté${e.code ? ` (code ${e.code})` : ''}. ${e.stderr || e.message || ''}`.trim());
        }
        setOccupe(false);
        enregistrer();
        break;
    }
  });

  // --- Envoyer, arrêter, recommencer ---

  async function envoyer(texteMessage = saisie.value) {
    const t = texteMessage.trim();
    if (!t || occupe) return;
    saisie.value = '';
    ajusterSaisie();
    bulleUtilisateur(t);
    conv.items.push({ t: 'user', text: t });
    setOccupe(true, 'Atelier prépare tes notes, ton calendrier et tes projets…');
    try {
      await window.atelier.claudeEnvoyer(t);
    } catch (err) {
      avis('erreur', cleanError(err));
      setOccupe(false);
    }
  }

  async function nouvelle() {
    if (occupe) await window.atelier.claudeInterrompre();
    await window.atelier.claudeNouvelle();
    finTexte();
    outils.clear();
    conv = { sessionId: null, items: [] };
    setOccupe(false);
    $('#claude-modele').textContent = '';
    accueil();
    enregistrer();
    saisie.focus();
  }

  function ajusterSaisie() {
    saisie.style.height = 'auto';
    saisie.style.height = `${Math.min(saisie.scrollHeight, 160)}px`;
  }

  saisie.addEventListener('input', ajusterSaisie);
  saisie.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }
    if (e.key === 'Escape' && occupe) { e.preventDefault(); window.atelier.claudeInterrompre(); }
  });
  btnEnvoyer.onclick = () => (occupe ? window.atelier.claudeInterrompre() : envoyer());
  $('#btn-claude-nouvelle').onclick = nouvelle;
  $('#btn-claude-dossier').onclick = () => window.atelier.claudeOuvrirDossier().catch((err) => notify(cleanError(err), 'error'));

  // Au démarrage : on réaffiche la dernière conversation, et Claude la reprendra au prochain message.
  async function start() {
    const garde = await window.atelier.lireDonnees('claude', null);
    if (garde && Array.isArray(garde.items) && garde.items.length) {
      conv = { sessionId: garde.sessionId || null, items: garde.items };
      liste.replaceChildren();
      for (const item of conv.items) {
        if (item.t === 'user') bulleUtilisateur(item.text);
        else if (item.t === 'assistant') bulleClaude(item.text);
        else if (item.t === 'tool') ligneOutil(item.icon, item.label, item.state === 'encours' ? 'arrete' : item.state);
      }
      liste.scrollTop = liste.scrollHeight;
      await window.atelier.claudeReprendre(conv.sessionId);
    } else {
      accueil();
    }
  }

  return { start };
})();

// --- Petit moteur Markdown (le même que dans le panneau Claude de Rune) ---
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
    // Les liens ne sont pas cliquables : on montre l'adresse au survol.
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
