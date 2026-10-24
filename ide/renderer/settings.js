// Fenêtre de réglages : tous les réglages de config.json, avec de vrais boutons.
// Chaque changement est appliqué tout de suite et enregistré dans config.json (par main.js),
// donc le fichier et la fenêtre restent d'accord. Le JSON reste accessible en bas, pour les cas
// que la fenêtre ne couvre pas.
//
// Pour ajouter un réglage : une ligne dans SECTIONS, avec sa clé de config et son type
// (toggle, segmented, range, text, number, color, shortcut, profiles, htmlRules).

const settings = (() => {
  const ACCENTS = ['#e0a526', '#ff7a59', '#f25f8b', '#b18cff', '#6c8cff', '#38bdf8', '#2dd4bf', '#7ccf62'];

  const SECTIONS = [
    { id: 'apparence', title: 'Apparence', icon: 'symbol-color', fields: [
      { key: 'theme', label: 'Thème', type: 'segmented', options: [['vs-dark', 'Sombre'], ['vs', 'Clair'], ['hc-black', 'Contraste élevé']] },
      { key: 'glass', label: 'Verre dépoli', type: 'toggle', help: 'Panneaux translucides sur un fond sombre dégradé. Thème sombre uniquement.' },
      { key: 'windowBlur', label: 'Flou Windows 11', type: 'toggle', help: 'Ton bureau se voit, flouté, à travers la fenêtre. Demande le verre dépoli et Windows 11 (22H2 ou plus récent).', needsBlur: true },
      { key: 'accentColor', label: "Couleur d'accent", type: 'color', help: 'Logo, onglet actif, curseur, boutons principaux.' },
    ] },
    { id: 'editeur', title: 'Éditeur', icon: 'code', fields: [
      { key: 'fontFamily', label: 'Police', type: 'text', help: 'Plusieurs polices séparées par des virgules : la première installée est utilisée.' },
      { key: 'fontSize', label: 'Taille du texte', type: 'range', min: 10, max: 28, unit: 'px' },
      { key: 'tabSize', label: 'Largeur des tabulations', type: 'segmented', options: [[2, '2'], [4, '4'], [8, '8']] },
      { key: 'wordWrap', label: 'Retour à la ligne automatique', type: 'toggle', on: 'on', off: 'off' },
      { key: 'minimap', label: 'Mini-carte du fichier', type: 'toggle' },
      { key: 'formatOnSave', label: 'Mettre en forme à l\'enregistrement', type: 'toggle', help: 'Prettier remet le code au propre à chaque Ctrl+S (HTML, CSS, JS, JSON, Markdown…). Sinon : Maj+Alt+F.' },
      { key: 'vueTools', label: 'Intelligence Vue (Volar)', type: 'toggle', help: 'Dans les fichiers .vue : autocomplétion des composants et des props, types au survol, erreurs soulignées, F12 pour aller à la définition. Le même moteur que l\'extension Vue de VS Code.' },
      { key: 'emmet', label: 'Emmet', type: 'toggle', help: 'En HTML et CSS, une abréviation comme ul>li*3 ou m10 s\'écrit en entier avec Tab.' },
    ] },
    { id: 'terminal', title: 'Terminal', icon: 'terminal', fields: [
      { key: 'terminalFontSize', label: 'Taille du texte', type: 'range', min: 10, max: 24, unit: 'px' },
      { key: 'terminalProfiles', label: 'Profils', type: 'profiles', help: '« default » = PowerShell sous Windows. Sinon, le nom ou le chemin du programme (cmd.exe, wsl.exe, C:\\Program Files\\Git\\bin\\bash.exe…). Les arguments sont séparés par des espaces.' },
    ] },
    { id: 'raccourcis', title: 'Raccourcis', icon: 'keyboard', fields: [
      { key: 'shortcuts', sub: 'toggleTerminal', label: 'Afficher / masquer le terminal', type: 'shortcut' },
      { key: 'shortcuts', sub: 'splitEditor', label: "Diviser l'éditeur", type: 'shortcut' },
      { key: 'shortcuts', sub: 'newProject', label: 'Nouveau projet (Vue, Vite, site HTML…)', type: 'shortcut' },
      { key: 'shortcuts', sub: 'closeColumn', label: 'Fermer la colonne (ses onglets passent à côté)', type: 'shortcut' },
      { key: 'shortcuts', sub: 'toggleClaude', label: 'Afficher / masquer le chat avec Loki', type: 'shortcut' },
      { key: 'shortcuts', sub: 'commandPalette', label: 'Palette de commandes', type: 'shortcut' },
      { key: 'shortcuts', sub: 'quickOpen', label: 'Ouvrir un fichier par son nom', type: 'shortcut' },
      { key: 'shortcuts', sub: 'searchProject', label: 'Rechercher dans le projet', type: 'shortcut' },
      { key: 'shortcuts', sub: 'replaceProject', label: 'Remplacer dans le projet', type: 'shortcut' },
      { key: 'shortcuts', sub: 'togglePreview', label: 'Aperçu dans le navigateur', type: 'shortcut' },
    ] },
    { id: 'claude', title: 'Loki', icon: 'sparkle', fields: [
      { key: 'claudeModel', label: 'Modèle', type: 'segmented', options: [['', 'Par défaut'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']], help: 'Loki est propulsé par Claude. « Par défaut » = le modèle choisi dans Claude Code. Opus est le plus fort, Haiku le plus rapide. Pris en compte à la prochaine conversation.' },
      { key: 'claudePermissionMode', label: 'Modifications de fichiers', type: 'segmented', options: [['ask', 'Demander à chaque fois'], ['acceptEdits', 'Accepter sans demander']], help: 'Pris en compte tout de suite. Les commandes demandent ton accord, sauf celles que tu as permises pour de bon sur leur carte (bouclier du panneau Loki pour les voir et les retirer).' },
      { key: 'claudeSansDemander', sub: 'web', label: 'Lire des pages et chercher sur le web sans demander', type: 'toggle' },
      { key: 'claudeSansDemander', sub: 'memoire', label: 'Retenir ou oublier des infos sur le projet sans demander', type: 'toggle', help: 'Dans la mémoire partagée avec Atelier.' },
      { key: 'claudeAtelier', label: 'Mémoire partagée avec Atelier', type: 'toggle', help: 'Loki lit la mémoire du projet ouvert et tes notes (gardées par Atelier, dans %APPDATA%\\atelier-commun), et peut y retenir une info avec ta permission. Pris en compte à la prochaine conversation.' },
      { key: 'claudeCommand', label: 'Commande Claude Code', type: 'text', help: '« claude » si Claude Code est installé avec npm. Sinon, son chemin complet.' },
    ] },
    { id: 'apercu', title: 'Aperçu', icon: 'open-preview', fields: [
      { key: 'previewLive', label: 'Mise à jour pendant la frappe', type: 'toggle', help: 'La page de l\'aperçu (et Go Live) change dès que tu tapes, sans attendre Ctrl+S. Désactivé : seulement à l\'enregistrement, comme Live Server.' },
      { key: 'previewPort', label: 'Port du serveur', type: 'number', min: 1024, max: 65535, help: 'L\'adresse devient http://127.0.0.1:<port>/. Un port fixe garde valable l\'onglet de ton navigateur d\'une session à l\'autre. S\'il est déjà pris, un port libre est choisi. 0 : un port au hasard.' },
    ] },
    { id: 'html', title: 'Vérification HTML', icon: 'checklist', fields: [
      { key: 'htmlRules', type: 'htmlRules', help: 'Règles de HTMLHint. Une règle cochée souligne le problème dans tes fichiers HTML.' },
    ] },
    { id: 'demarrage', title: 'Démarrage', icon: 'rocket', fields: [
      { key: 'projectsFolder', label: 'Dossier des projets', type: 'folder', help: 'Là où s\'ouvre « Ouvrir un dossier » (Ctrl+O), et où « Nouveau projet » crée les projets. Vide : le dernier dossier utilisé.' },
      { key: 'reopenLastFolder', label: 'Rouvrir le dernier dossier', type: 'toggle' },
      { key: 'restoreTabs', label: 'Rouvrir les onglets', type: 'toggle', help: 'En ouvrant un dossier, ses onglets de la dernière fois reviennent, avec leurs colonnes.' },
    ] },
  ];

  let blurSupported = false;
  window.atelier.blurSupported().then((ok) => { blurSupported = ok; });

  // --- Construction de la fenêtre (une seule fois) ---

  const backdrop = document.createElement('div');
  backdrop.id = 'settings';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <div class="settings-card" role="dialog" aria-label="Réglages">
      <nav class="settings-nav">
        <h2>Réglages</h2>
        <div class="settings-links"></div>
        <span class="spacer"></span>
        <button class="settings-json"><i class="codicon codicon-json"></i>Ouvrir config.json</button>
      </nav>
      <section class="settings-main">
        <header>
          <span class="settings-saved"><i class="codicon codicon-check"></i>Enregistré</span>
          <button class="icon-button settings-close" title="Fermer (Échap)"><i class="codicon codicon-close"></i></button>
        </header>
        <div class="settings-content"></div>
      </section>
    </div>`;
  document.body.appendChild(backdrop);
  const content = backdrop.querySelector('.settings-content');
  const links = backdrop.querySelector('.settings-links');
  const savedBadge = backdrop.querySelector('.settings-saved');

  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.settings-close').onclick = close;
  backdrop.querySelector('.settings-json').onclick = () => {
    close();
    openFile(state.configPath, 'config.json', { preview: false });
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !backdrop.hidden && !recording) close();
  });

  function open(sectionId) {
    render();
    backdrop.hidden = false;
    if (sectionId) scrollTo(sectionId);
  }

  function close() {
    stopRecording();
    backdrop.hidden = true;
  }

  function scrollTo(id) {
    content.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: 'start' });
  }

  // --- Enregistrement ---
  // Les changements rapprochés (glisser un curseur…) sont regroupés en une seule écriture.

  let pending = {};
  let timer = null;

  function set(key, value) {
    state.config[key] = value;
    pending[key] = value;
    applyConfig(); // aperçu immédiat, avant même l'écriture du fichier
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  async function flush() {
    const changes = pending;
    pending = {};
    let result;
    try {
      result = await window.atelier.saveConfig(changes);
    } catch (err) {
      return notify.error(`Réglages non enregistrés : ${cleanError(err)}`);
    }
    state.config = result.config;
    applyConfig();
    await syncConfigTab();
    savedBadge.classList.remove('show');
    void savedBadge.offsetWidth; // relance l'animation
    savedBadge.classList.add('show');
  }

  // config.json est ouvert dans un onglet sans modification en cours : on le recharge.
  async function syncConfigTab() {
    const file = state.files.get(state.configPath);
    if (!file || isDirty(file)) return;
    file.model.setValue(await window.atelier.readFile(state.configPath));
    file.savedVersion = file.model.getAlternativeVersionId();
    for (const t of tabsOf(file)) refreshTab(t);
  }

  // --- Affichage ---

  function render() {
    links.innerHTML = '';
    content.innerHTML = '';
    for (const section of SECTIONS) {
      const link = document.createElement('button');
      link.innerHTML = `<i class="codicon codicon-${section.icon}"></i><span></span>`;
      link.querySelector('span').textContent = section.title;
      link.onclick = () => scrollTo(section.id);
      links.appendChild(link);

      const el = document.createElement('div');
      el.className = 'settings-section';
      el.dataset.section = section.id;
      const title = document.createElement('h3');
      title.textContent = section.title;
      el.appendChild(title);
      for (const field of section.fields) el.appendChild(renderField(field));
      content.appendChild(el);
    }
  }

  function renderField(field) {
    const row = document.createElement('div');
    row.className = `setting setting-${field.type}`;
    const text = document.createElement('div');
    text.className = 'setting-text';
    if (field.label) {
      const label = document.createElement('div');
      label.className = 'setting-label';
      label.textContent = field.label;
      text.appendChild(label);
    }
    if (field.help) {
      const help = document.createElement('div');
      help.className = 'setting-help';
      help.textContent = field.help;
      text.appendChild(help);
    }
    if (field.needsBlur && !blurSupported) {
      const note = document.createElement('div');
      note.className = 'setting-help setting-note';
      note.textContent = "Pas disponible sur cette machine : l'option est enregistrée mais sans effet.";
      text.appendChild(note);
    }
    row.appendChild(text);
    // Un champ « sub » : une clé de l'objet (config.claudeSansDemander.web…).
    const value = field.sub && field.type !== 'shortcut' ? state.config[field.key]?.[field.sub] : state.config[field.key];
    const control = CONTROLS[field.type](field, value);
    control.classList.add('setting-control');
    row.appendChild(control);
    return row;
  }

  const el = (tag, className, html = '') => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    e.innerHTML = html;
    return e;
  };

  const CONTROLS = {
    toggle(field, value) {
      const on = field.on !== undefined ? value === field.on : Boolean(value);
      const button = el('button', `toggle${on ? ' on' : ''}`, '<span class="knob"></span>');
      button.setAttribute('role', 'switch');
      button.setAttribute('aria-checked', on);
      button.onclick = () => {
        const next = !button.classList.contains('on');
        button.classList.toggle('on', next);
        button.setAttribute('aria-checked', next);
        const v = field.on !== undefined ? (next ? field.on : field.off) : next;
        if (field.sub) set(field.key, { ...state.config[field.key], [field.sub]: v });
        else set(field.key, v);
      };
      return button;
    },

    segmented(field, value) {
      const group = el('div', 'segmented');
      for (const [optionValue, label] of field.options) {
        const button = el('button', optionValue === value ? 'active' : '');
        button.textContent = label;
        button.onclick = () => {
          group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === button));
          set(field.key, optionValue);
        };
        group.appendChild(button);
      }
      return group;
    },

    range(field, value) {
      const wrap = el('div', 'range');
      const input = el('input');
      Object.assign(input, { type: 'range', min: field.min, max: field.max, step: 1, value });
      const out = el('span', 'range-value');
      const show = () => {
        out.textContent = `${input.value} ${field.unit}`;
        input.style.setProperty('--fill', `${((input.value - field.min) / (field.max - field.min)) * 100}%`);
      };
      input.oninput = () => { show(); set(field.key, Number(input.value)); };
      show();
      wrap.append(input, out);
      return wrap;
    },

    text(field, value) {
      const input = el('input', 'text-input');
      input.value = value;
      input.spellcheck = false;
      input.onchange = () => set(field.key, input.value.trim());
      input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
      return input;
    },

    // Un nombre entier entre min et max (0 accepté : "au hasard"). Une valeur hors limites est refusée.
    number(field, value) {
      const input = el('input', 'text-input number-input');
      Object.assign(input, { type: 'number', min: 0, max: field.max, step: 1, value });
      input.onchange = () => {
        const n = Number(input.value);
        if (Number.isInteger(n) && (n === 0 || (n >= field.min && n <= field.max))) return set(field.key, n);
        notify.warning(`${field.label} : un nombre entre ${field.min} et ${field.max}, ou 0.`);
        input.value = state.config[field.key];
      };
      input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
      return input;
    },

    // Un dossier : son chemin (modifiable à la main), « Choisir… » pour le parcourir, et une croix pour l'effacer.
    folder(field, value) {
      const wrap = el('div', 'folder-field');
      const input = el('input', 'text-input');
      input.value = value || '';
      input.placeholder = 'Le dernier utilisé';
      input.spellcheck = false;
      input.onchange = () => set(field.key, input.value.trim());
      input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
      const pick = el('button', 'folder-pick', 'Choisir…');
      pick.onclick = async () => {
        const folder = await window.atelier.pickFolder(input.value || undefined, 'Dossier des projets').catch(() => null);
        if (folder) { input.value = folder; set(field.key, folder); }
      };
      const clear = el('button', 'icon-button', '<i class="codicon codicon-close"></i>');
      clear.title = 'Effacer';
      clear.onclick = () => { input.value = ''; set(field.key, ''); };
      wrap.append(input, pick, clear);
      return wrap;
    },

    color(field, value) {
      const wrap = el('div', 'swatches');
      const select = (color) => {
        wrap.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s.dataset.color === color));
        set(field.key, color);
      };
      for (const color of ACCENTS) {
        const swatch = el('button', `swatch${color === value ? ' active' : ''}`);
        swatch.dataset.color = color;
        swatch.style.background = color;
        swatch.title = color;
        swatch.onclick = () => { picker.value = color; select(color); };
        wrap.appendChild(swatch);
      }
      // Couleur libre : la pipette du système.
      const custom = el('label', 'swatch custom', '<i class="codicon codicon-edit"></i>');
      custom.title = 'Autre couleur';
      const picker = el('input');
      picker.type = 'color';
      picker.value = value;
      picker.oninput = () => select(picker.value);
      custom.appendChild(picker);
      wrap.appendChild(custom);
      return wrap;
    },

    shortcut(field) {
      const button = el('button', 'shortcut-button');
      const show = (combo) => {
        button.innerHTML = '';
        for (const part of combo.split('+')) {
          const kbd = document.createElement('kbd');
          kbd.textContent = part;
          button.appendChild(kbd);
        }
      };
      show(state.config.shortcuts[field.sub]);
      button.title = 'Clique, puis appuie sur la nouvelle combinaison (Échap pour annuler)';
      button.onclick = () => startRecording(button, (combo) => {
        if (combo) set('shortcuts', { ...state.config.shortcuts, [field.sub]: combo });
        show(state.config.shortcuts[field.sub]);
      });
      return button;
    },

    profiles(field, value) {
      const wrap = el('div', 'profiles');
      const profiles = value.map((p) => ({ ...p, args: [...(p.args || [])] }));
      const save = () => set(field.key, profiles.map((p) => ({ ...p })));
      const draw = () => {
        wrap.innerHTML = '';
        profiles.forEach((profile, i) => {
          const row = el('div', 'profile', `
            <input class="text-input" data-k="name" placeholder="Nom">
            <input class="text-input" data-k="command" placeholder="Commande">
            <input class="text-input" data-k="args" placeholder="Arguments">
            <button class="icon-button" title="Supprimer ce profil"><i class="codicon codicon-trash"></i></button>`);
          row.querySelector('[data-k=name]').value = profile.name;
          row.querySelector('[data-k=command]').value = profile.command;
          row.querySelector('[data-k=args]').value = profile.args.join(' ');
          row.querySelectorAll('input').forEach((input) => {
            input.spellcheck = false;
            input.onchange = () => {
              const v = input.value.trim();
              if (input.dataset.k === 'args') profile.args = v ? v.split(/\s+/) : [];
              else profile[input.dataset.k] = v;
              if (profile.name && profile.command) save();
            };
          });
          row.querySelector('button').onclick = () => {
            if (profiles.length === 1) return notify.info('Il faut garder au moins un profil.');
            profiles.splice(i, 1);
            save();
            draw();
          };
          wrap.appendChild(row);
        });
        const add = el('button', 'add-button', '<i class="codicon codicon-add"></i>Ajouter un profil');
        add.onclick = () => {
          profiles.push({ name: `Profil ${profiles.length + 1}`, command: 'cmd.exe', args: [] });
          save();
          draw();
          wrap.querySelectorAll('.profile [data-k=name]')[profiles.length - 1].select();
        };
        wrap.appendChild(add);
      };
      draw();
      return wrap;
    },

    htmlRules(field, value) {
      const wrap = el('div', 'rules');
      if (!htmlhint) return wrap;
      const defaults = htmlhint.defaultRuleset;
      const rules = Object.values(htmlhint.rules).sort((a, b) => a.id.localeCompare(b.id));
      for (const rule of rules) {
        const enabled = Boolean(rule.id in value ? value[rule.id] : defaults[rule.id]);
        const row = el('label', 'rule', `<input type="checkbox"><span class="rule-id"></span><span class="rule-desc"></span>`);
        row.querySelector('input').checked = enabled;
        row.querySelector('.rule-id').textContent = rule.id;
        row.querySelector('.rule-desc').textContent = rule.description;
        row.querySelector('input').onchange = (e) => {
          const next = { ...state.config.htmlRules };
          // On n'écrit que les différences avec les règles par défaut.
          if (e.target.checked === Boolean(defaults[rule.id])) delete next[rule.id];
          else next[rule.id] = e.target.checked;
          set(field.key, next);
        };
        wrap.appendChild(row);
      }
      return wrap;
    },
  };

  // --- Saisie d'un raccourci ---
  // On écoute la prochaine combinaison avec Ctrl ou Alt. main.js est mis en pause pour ne pas
  // l'intercepter (sinon Ctrl+J ouvrirait le terminal au lieu d'être enregistré).

  let recording = null;

  function startRecording(button, done) {
    stopRecording();
    button.classList.add('recording');
    button.textContent = 'Appuie sur la combinaison…';
    window.atelier.pauseShortcuts(true);
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return stopRecording();
      if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return;
      if (!e.ctrlKey && !e.altKey) {
        button.textContent = 'Il faut Ctrl ou Alt…';
        return;
      }
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const combo = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', key].filter(Boolean).join('+');
      stopRecording(combo);
    };
    window.addEventListener('keydown', onKey, true);
    recording = { button, done, onKey };
  }

  function stopRecording(combo) {
    if (!recording) return;
    const { button, done, onKey } = recording;
    recording = null;
    window.removeEventListener('keydown', onKey, true);
    window.atelier.pauseShortcuts(false);
    button.classList.remove('recording');
    done(combo);
  }

  return { open, close };
})();
