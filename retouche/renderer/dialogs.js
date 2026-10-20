// Fenêtres de dialogue (plaque de verre au milieu de l'écran) : un seul modèle, Dialogs.form,
// construit chaque fenêtre à partir d'une liste de champs. Les autres fonctions l'utilisent.
//
// Un champ : { key, label, type, value, ... } avec type parmi
//   number, range (curseur + nombre), select, checkbox, color, text, textarea, info (texte seul).
// onInput(values, form) est appelé à chaque modification (pour l'aperçu en direct).

const Dialogs = (() => {
  const root = $('#modal-root');
  let open = null;

  function form({ title, fields, okLabel = 'OK', cancelLabel = 'Annuler', onInput, extra, width = 420, buttons = [] }) {
    close(null);
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const card = document.createElement('form');
      card.className = 'modal';
      card.style.width = `${width}px`;
      card.innerHTML = `<header><span class="modal-title"></span><button type="button" class="icon-button close" title="Fermer (Échap)"><i class="codicon codicon-close"></i></button></header><div class="modal-body"></div><footer><span class="modal-extra"></span></footer>`;
      card.querySelector('.modal-title').textContent = title;
      const body = card.querySelector('.modal-body');
      const inputs = {};

      for (const f of fields) {
        if (f.type === 'info') {
          const p = document.createElement('p');
          p.className = 'modal-info';
          p.textContent = f.text;
          body.appendChild(p);
          continue;
        }
        if (f.type === 'element') { body.appendChild(f.element); continue; }
        const row = document.createElement('label');
        row.className = `field field-${f.type}`;
        if (f.hidden) row.hidden = true;
        const name = document.createElement('span');
        name.className = 'field-label';
        name.textContent = f.label;
        row.appendChild(name);
        let input;
        if (f.type === 'select') {
          input = document.createElement('select');
          for (const [value, label] of f.choices) input.add(new Option(label, value));
          input.value = f.value;
        } else if (f.type === 'textarea') {
          input = document.createElement('textarea');
          input.value = f.value ?? '';
          input.rows = f.rows || 3;
        } else {
          input = document.createElement('input');
          input.type = f.type === 'range' ? 'range' : f.type;
          // Bornes d'abord : un curseur limite sa valeur à 0–100 tant qu'il ne connaît pas min et max.
          for (const k of ['min', 'max', 'step', 'placeholder', 'list']) if (f[k] !== undefined) input.setAttribute(k, f[k]);
          if (f.type === 'checkbox') input.checked = Boolean(f.value);
          else input.value = f.value ?? '';
        }
        input.name = f.key;
        row.appendChild(input);
        if (f.type === 'range') {
          // Le nombre à côté du curseur se modifie aussi au clavier.
          const number = document.createElement('input');
          number.type = 'number';
          number.className = 'range-number';
          for (const k of ['min', 'max', 'step']) if (f[k] !== undefined) number.setAttribute(k, f[k]);
          number.value = f.value;
          number.oninput = () => { input.value = number.value; input.dispatchEvent(new Event('input', { bubbles: true })); };
          input.addEventListener('input', () => { if (document.activeElement !== number) number.value = input.value; });
          row.appendChild(number);
          if (f.unit) { const u = document.createElement('span'); u.className = 'unit'; u.textContent = f.unit; row.appendChild(u); }
        } else if (f.unit) {
          const u = document.createElement('span'); u.className = 'unit'; u.textContent = f.unit; row.appendChild(u);
        }
        if (f.type === 'checkbox') row.classList.add('checkbox-row');
        inputs[f.key] = { input, field: f, row };
        body.appendChild(row);
      }

      const values = () => {
        const out = {};
        for (const [key, { input, field }] of Object.entries(inputs)) {
          if (field.type === 'checkbox') out[key] = input.checked;
          else if (field.type === 'number' || field.type === 'range') out[key] = Number(input.value);
          else out[key] = input.value;
        }
        return out;
      };
      const api = { inputs, values, card, body, setValue(key, v) { const i = inputs[key]; if (!i) return; if (i.field.type === 'checkbox') i.input.checked = v; else i.input.value = v; i.input.dispatchEvent(new Event('input', { bubbles: true })); } };

      const footer = card.querySelector('footer');
      for (const b of buttons) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button';
        button.textContent = b.label;
        button.onclick = () => b.run(api);
        footer.appendChild(button);
      }
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'button';
      cancel.textContent = cancelLabel;
      const ok = document.createElement('button');
      ok.type = 'submit';
      ok.className = 'button primary';
      ok.textContent = okLabel;
      if (cancelLabel) footer.append(cancel);
      footer.append(ok);
      if (extra) card.querySelector('.modal-extra').append(extra);

      const finish = (result) => {
        overlay.remove();
        if (open?.overlay === overlay) open = null;
        resolve(result);
      };
      card.addEventListener('input', () => onInput?.(values(), api));
      card.addEventListener('change', (e) => { if (e.target.type === 'range') e.target.blur(); });
      card.onsubmit = (e) => { e.preventDefault(); finish(values()); };
      cancel.onclick = () => finish(null);
      card.querySelector('.close').onclick = () => finish(null);
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) finish(null); });
      overlay.appendChild(card);
      root.appendChild(overlay);
      open = { overlay, finish };
      onInput?.(values(), api);
      const first = card.querySelector('textarea, input:not([type=range]):not([type=checkbox]), select');
      (first || ok).focus();
      if (first?.select) first.select();
    });
  }

  function close(result) { open?.finish(result); }
  const isOpen = () => Boolean(open);

  // Petite question : renvoie la valeur du bouton choisi, ou null.
  function ask(title, message, choices) {
    close(null);
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const card = document.createElement('div');
      card.className = 'modal';
      card.style.width = '440px';
      card.innerHTML = '<header><span class="modal-title"></span></header><div class="modal-body"><p class="modal-info"></p></div><footer></footer>';
      card.querySelector('.modal-title').textContent = title;
      card.querySelector('.modal-info').textContent = message;
      const finish = (v) => { overlay.remove(); open = null; resolve(v); };
      for (const c of choices) {
        const b = document.createElement('button');
        b.className = `button${c.primary ? ' primary' : ''}`;
        b.textContent = c.label;
        b.onclick = () => finish(c.value);
        card.querySelector('footer').appendChild(b);
      }
      overlay.appendChild(card);
      root.appendChild(overlay);
      open = { overlay, finish };
      card.querySelector('.button.primary')?.focus();
    });
  }

  // --- Nouvelle image ---
  const PRESETS = [
    ['logo', 'Logo carré : 1024 × 1024', 1024, 1024, 'transparent'],
    ['favicon', 'Icône / favicon : 512 × 512', 512, 512, 'transparent'],
    ['hd', 'Écran Full HD : 1920 × 1080', 1920, 1080, 'white'],
    ['4k', 'Écran 4K : 3840 × 2160', 3840, 2160, 'white'],
    ['ultrawide', 'Ultralarge : 3440 × 1440', 3440, 1440, 'white'],
    ['post', 'Publication carrée : 1080 × 1080', 1080, 1080, 'white'],
    ['story', 'Story / vertical : 1080 × 1920', 1080, 1920, 'white'],
    ['og', 'Aperçu de lien (Open Graph) : 1200 × 630', 1200, 630, 'white'],
    ['a4', 'A4 à 300 dpi : 2480 × 3508', 2480, 3508, 'white'],
    ['custom', 'Personnalisée', null, null, null],
  ];
  function newImage(clipboardSize) {
    const presets = clipboardSize ? [['clipboard', `Taille du presse-papiers : ${clipboardSize.width} × ${clipboardSize.height}`, clipboardSize.width, clipboardSize.height, 'transparent'], ...PRESETS] : PRESETS;
    let last = {};
    try { last = JSON.parse(localStorage.getItem('skald.new') || '{}'); } catch { last = {}; }
    const start = presets.find((p) => p[0] === (last.preset || 'logo')) || presets[0];
    return form({
      title: 'Nouvelle image',
      okLabel: 'Créer',
      fields: [
        { key: 'name', label: 'Nom', type: 'text', value: 'Sans titre' },
        { key: 'preset', label: 'Modèle', type: 'select', value: start[0], choices: presets.map((p) => [p[0], p[1]]) },
        { key: 'width', label: 'Largeur', type: 'number', value: last.preset === 'custom' ? last.width : start[2], min: 1, max: 30000, unit: 'px' },
        { key: 'height', label: 'Hauteur', type: 'number', value: last.preset === 'custom' ? last.height : start[3], min: 1, max: 30000, unit: 'px' },
        { key: 'background', label: 'Fond', type: 'select', value: last.background || start[4], choices: [['transparent', 'Transparent'], ['white', 'Blanc'], ['black', 'Noir'], ['secondary', 'Couleur secondaire']] },
      ],
      onInput(v, f) {
        const preset = presets.find((p) => p[0] === v.preset);
        if (f.lastPreset !== v.preset && preset && preset[2]) {
          f.inputs.width.input.value = preset[2];
          f.inputs.height.input.value = preset[3];
          f.inputs.background.input.value = preset[4];
        }
        // Taille tapée à la main : le modèle passe sur « Personnalisée ».
        if (f.lastPreset === v.preset && preset?.[2] && (v.width !== preset[2] || v.height !== preset[3])) f.inputs.preset.input.value = 'custom';
        f.lastPreset = f.inputs.preset.input.value;
      },
    }).then((v) => {
      if (!v) return null;
      try { localStorage.setItem('skald.new', JSON.stringify({ preset: v.preset, width: v.width, height: v.height, background: v.background })); } catch { /* pas grave */ }
      return v;
    });
  }

  // --- Texte ---
  const FONTS = ['Segoe UI', 'Segoe UI Variable Display', 'Bahnschrift', 'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Cascadia Code', 'Constantia', 'Corbel', 'Georgia', 'Impact', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Comic Sans MS', 'Franklin Gothic Medium', 'Gabriola', 'Ink Free', 'Segoe Print', 'Segoe Script'];
  let fontsLoaded = false;
  async function fontList() {
    const list = $('#font-list');
    if (fontsLoaded) return;
    fontsLoaded = true;
    let names = FONTS;
    // Toutes les polices installées sur le PC (API du navigateur), si Windows la laisse répondre.
    try {
      if (window.queryLocalFonts) {
        const fonts = await window.queryLocalFonts();
        const families = [...new Set(fonts.map((f) => f.family))];
        if (families.length) names = families.sort((a, b) => a.localeCompare(b));
      }
    } catch { /* on garde la liste de base */ }
    list.innerHTML = '';
    for (const n of names) list.appendChild(new Option(n, n));
  }
  async function text(initial, editing) {
    await fontList();
    return form({
      title: editing ? 'Modifier le texte' : 'Nouveau texte',
      okLabel: editing ? 'Appliquer' : 'Ajouter',
      width: 480,
      fields: [
        { key: 'content', label: 'Texte', type: 'textarea', value: initial.content, rows: 3 },
        { key: 'font', label: 'Police', type: 'text', value: initial.font, list: 'font-list' },
        { key: 'size', label: 'Taille', type: 'number', value: initial.size, min: 4, max: 2000, unit: 'px' },
        { key: 'color', label: 'Couleur', type: 'color', value: initial.color },
        { key: 'bold', label: 'Gras', type: 'checkbox', value: initial.bold },
        { key: 'italic', label: 'Italique', type: 'checkbox', value: initial.italic },
        { key: 'align', label: 'Alignement', type: 'select', value: initial.align, choices: [['left', 'À gauche'], ['center', 'Centré'], ['right', 'À droite']] },
        { key: 'lineHeight', label: 'Interligne', type: 'range', value: initial.lineHeight ?? 1.2, min: 0.6, max: 3, step: 0.05 },
        { key: 'letterSpacing', label: 'Espacement', type: 'range', value: initial.letterSpacing ?? 0, min: -20, max: 100, step: 0.5, unit: 'px' },
      ],
      onInput(v, f) {
        // Aperçu du rendu dans la fenêtre elle-même.
        let preview = f.body.querySelector('.text-preview');
        if (!preview) {
          preview = document.createElement('div');
          preview.className = 'text-preview checker';
          f.body.appendChild(preview);
        }
        preview.innerHTML = '';
        if (!v.content.trim()) return;
        const { canvas } = Tools.renderText(v);
        preview.appendChild(canvas);
      },
    });
  }

  return { form, ask, close, isOpen, newImage, text };
})();
