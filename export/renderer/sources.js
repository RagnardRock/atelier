// Lire les sources : PSD (avec ses calques et ses groupes, grâce à la librairie ag-psd), SVG, PNG,
// JPEG, WebP… Chaque source lue est gardée en mémoire jusqu'à ce que le fichier change.
//
// Pour un PSD, on peut exporter :
// - l'image entière (celle que Photoshop enregistre avec « Compatibilité maximale »),
// - ou un seul calque / un seul groupe, comme « Exporter le calque » de Photoshop.

const Sources = (() => {
  const cache = new Map(); // chemin → source lue
  const ext = (name) => (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

  const PSD_BLENDS = { normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color dodge': 'color-dodge', 'color burn': 'color-burn', 'hard light': 'hard-light', 'soft light': 'soft-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity', 'linear dodge': 'lighter' };

  // Masque de fusion d'un calque (zones noires = cachées), appliqué à ses pixels.
  function applyMask(canvas, layer) {
    const m = layer.mask;
    if (!m || !m.canvas || m.disabled) return canvas;
    const alpha = newCanvas(canvas.width, canvas.height);
    const g = alpha.getContext('2d');
    g.fillStyle = `rgba(0,0,0,${(m.defaultColor ?? 0) / 255})`;
    g.fillRect(0, 0, alpha.width, alpha.height);
    const mw = m.canvas.width, mh = m.canvas.height;
    const data = m.canvas.getContext('2d').getImageData(0, 0, mw, mh);
    for (let i = 0; i < data.data.length; i += 4) { data.data[i + 3] = data.data[i]; data.data[i] = data.data[i + 1] = data.data[i + 2] = 0; }
    const piece = newCanvas(mw, mh);
    piece.getContext('2d').putImageData(data, 0, 0);
    g.clearRect((m.left ?? 0) - (layer.left ?? 0), (m.top ?? 0) - (layer.top ?? 0), mw, mh);
    g.drawImage(piece, (m.left ?? 0) - (layer.left ?? 0), (m.top ?? 0) - (layer.top ?? 0));
    const out = newCanvas(canvas.width, canvas.height);
    const o = out.getContext('2d');
    o.drawImage(canvas, 0, 0);
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(alpha, 0, 0);
    return out;
  }

  // Dessine des calques (et groupes) de PSD dans un canvas de la taille du document.
  // Les calques cachés sont sautés. Le calque que tu as choisi d'exporter, lui, s'exporte même s'il
  // est masqué dans Photoshop (voir image() : seuls ses calques internes cachés restent cachés).
  function drawChildren(psd, children, target) {
    const g = target.getContext('2d');
    let base = null; // calque sur lequel s'écrêtent les suivants (masque d'écrêtage)
    for (const child of children || []) {
      if (child.hidden) { if (!child.clipping) base = null; continue; }
      const layer = renderNode(psd, child);
      if (!layer) continue;
      if (child.clipping && base) {
        const lg = layer.getContext('2d');
        lg.globalCompositeOperation = 'destination-in';
        lg.drawImage(base, 0, 0);
      } else base = layer;
      g.globalAlpha = child.opacity ?? 1;
      g.globalCompositeOperation = PSD_BLENDS[child.blendMode] || 'source-over';
      g.drawImage(layer, 0, 0);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // Un calque ou un groupe, rendu seul dans un canvas de la taille du document (sans son opacité).
  function renderNode(psd, node) {
    if (node.children) {
      const out = newCanvas(psd.width, psd.height);
      drawChildren(psd, node.children, out);
      return out;
    }
    if (!node.canvas || !node.canvas.width) return null; // calque de réglage, forme vide…
    const out = newCanvas(psd.width, psd.height);
    out.getContext('2d').drawImage(applyMask(node.canvas, node), node.left ?? 0, node.top ?? 0);
    return out;
  }

  // Liste à plat des calques et groupes, pour le menu « Calque » : chemin « Logo / Texte ».
  function listLayers(psd) {
    const out = [];
    const walk = (children, prefix, depth) => {
      // Dans le PSD, le premier enfant est le calque du bas : on liste du haut vers le bas, comme Photoshop.
      for (const child of [...(children || [])].reverse()) {
        const chemin = `${prefix}${child.name || 'Calque'}`;
        if (child.children) {
          out.push({ chemin, nom: child.name || 'Groupe', groupe: true, cache: !!child.hidden, profondeur: depth });
          walk(child.children, `${chemin} / `, depth + 1);
        } else if (child.canvas && child.canvas.width) {
          out.push({ chemin, nom: child.name || 'Calque', groupe: false, cache: !!child.hidden, profondeur: depth });
        }
      }
    };
    walk(psd.children, '', 0);
    return out;
  }

  function findNode(psd, chemin) {
    const walk = (children, prefix) => {
      for (const child of children || []) {
        const c = `${prefix}${child.name || 'Calque'}`;
        if (c === chemin) return child;
        if (child.children && chemin.startsWith(`${c} / `)) {
          const found = walk(child.children, `${c} / `);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(psd.children, '');
  }

  async function decodeImage(bytes, nom) {
    if (ext(nom) === 'svg') {
      // SVG : c'est du vectoriel. On le dessine en grand (2048 px de côté) pour que toutes les tailles
      // produites restent nettes. Le fichier SVG lui-même peut aussi être copié tel quel (favicon.svg).
      const texte = new TextDecoder().decode(bytes);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        let w = img.naturalWidth || 512, h = img.naturalHeight || 512;
        const scale = 2048 / Math.max(w, h);
        w = Math.round(w * scale); h = Math.round(h * scale);
        const canvas = newCanvas(w, h);
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        return { type: 'svg', canvas, svg: texte };
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const canvas = newCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    return { type: 'image', canvas };
  }

  async function charger(chemin) {
    const f = await window.brokk.lireSource(chemin);
    let source;
    try {
      if (ext(f.nom) === 'psd') {
        const bytes = f.bytes;
        const psd = agPsd.readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { skipThumbnail: true, skipLinkedFilesData: true });
        let canvas = psd.canvas;
        // PSD enregistré sans « Compatibilité maximale » : pas d'image fusionnée dedans, on la recompose.
        if (!canvas || !canvas.width) {
          canvas = newCanvas(psd.width, psd.height);
          drawChildren(psd, psd.children, canvas);
        }
        source = { type: 'psd', canvas, psd, calques: listLayers(psd) };
      } else {
        source = await decodeImage(f.bytes, f.nom);
      }
    } catch (err) {
      throw new Error(`Impossible de lire ${f.nom} : ${err.message || err}`);
    }
    Object.assign(source, { chemin: f.chemin, nom: f.nom, modifie: f.modifie, largeur: source.canvas.width, hauteur: source.canvas.height });
    source.miniature = fit(source.canvas, 96, 96);
    cache.set(f.chemin, source);
    return source;
  }

  async function get(chemin) {
    return cache.get(chemin) || charger(chemin);
  }
  const oublier = (chemin) => cache.delete(chemin);

  // L'image à exporter pour un asset : la source entière ou un calque, rognée si demandé.
  function image(source, calque, rogner) {
    let canvas = source.canvas;
    if (source.type === 'psd' && calque) {
      const node = findNode(source.psd, calque);
      if (!node) throw new Error(`Le calque « ${calque} » n'existe plus dans ${source.nom}`);
      canvas = renderNode(source.psd, node) || newCanvas(1, 1);
      // Son opacité dans Photoshop est gardée (comme « Exporter le calque »).
      if ((node.opacity ?? 1) < 1) {
        const faded = newCanvas(canvas.width, canvas.height);
        const g = faded.getContext('2d');
        g.globalAlpha = node.opacity;
        g.drawImage(canvas, 0, 0);
        canvas = faded;
      }
    }
    return rogner ? trim(canvas) : canvas;
  }

  return { get, oublier, image };
})();
