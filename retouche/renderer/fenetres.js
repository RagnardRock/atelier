// Les fenêtres propres à Skald (« Nouvelle image », « Texte »), ajoutées aux fenêtres de dialogue
// communes (../commun/dialogues.js) : Dialogs.newImage(), Dialogs.text().

(() => {
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
    return Dialogs.form({
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
    return Dialogs.form({
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

  Object.assign(Dialogs, { newImage, text });
})();
