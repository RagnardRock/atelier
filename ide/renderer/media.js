// Images et fichiers binaires dans les onglets.
// - Une image (png, jpg, gif, webp, avif, bmp, ico) s'affiche au lieu d'être lue comme du texte,
//   avec ses dimensions et son poids. Clic sur l'image : taille réelle / ajustée à la fenêtre.
//   Si tu la réexportes depuis Photoshop, l'aperçu se met à jour tout seul.
// - Un autre fichier binaire (PSD, AI, PDF, ZIP, polices…) affiche une carte avec
//   « Ouvrir avec l'application par défaut » (Photoshop pour un .psd) et « Afficher dans l'Explorateur ».
// Le SVG reste ouvert comme du texte, puisque c'est du code que tu peux modifier.

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'];
// Toujours binaires, même vides ou très petits (un PSD tout juste créé…).
const BINARY_EXTENSIONS = ['psd', 'psb', 'ai', 'indd', 'xd', 'fig', 'sketch', 'pdf', 'zip', '7z', 'rar', 'gz', 'tar', 'exe', 'dll',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'wav', 'ogg', 'mp4', 'webm', 'mov', 'avi', 'tif', 'tiff', 'heic', 'raw', 'docx', 'xlsx', 'pptx'];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} octets`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1048576).toFixed(1).replace('.', ',')} Mo`;
}

// Appelé par loadFile (app.js) : renvoie un "fichier" image ou binaire, ou null pour un fichier texte.
async function mediaFile(path, name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const info = await window.atelier.fileInfo(path);
  let kind = null;
  let dataUrl = null;
  if (IMAGE_EXTENSIONS.includes(ext)) {
    kind = 'image';
    dataUrl = await window.atelier.fileDataUrl(path);
  } else if (info.binary || BINARY_EXTENSIONS.includes(ext)) {
    kind = 'binary';
  } else {
    return null;
  }
  // Un modèle Monaco vide, pour que le reste de l'IDE (onglets, colonnes…) le traite comme les autres.
  const model = monaco.editor.createModel('', 'plaintext', monaco.Uri.file(path));
  return { path, name, kind, size: info.size, dataUrl, model, savedVersion: model.getAlternativeVersionId() };
}

// Appelé par activate (app.js) à chaque changement d'onglet d'une colonne.
function showMedia(group, file) {
  const area = group.el.querySelector('.editor-area');
  let view = area.querySelector('.media-view');
  if (!file || !file.kind) {
    view?.remove();
    group.editor.updateOptions({ readOnly: false });
    return;
  }
  group.editor.updateOptions({ readOnly: true }); // rien ne doit pouvoir être tapé dans le modèle vide
  if (!view) {
    view = document.createElement('div');
    view.className = 'media-view';
    area.appendChild(view);
  }
  view.dataset.path = file.path;
  view.innerHTML = '';
  if (file.kind === 'image') renderImage(view, file);
  else renderBinary(view, file);
}

function mediaButtons(file) {
  const bar = document.createElement('div');
  bar.className = 'media-actions';
  const open = document.createElement('button');
  open.innerHTML = '<i class="codicon codicon-link-external"></i>Ouvrir avec l\'application par défaut';
  open.onclick = () => window.atelier.openDefault(file.path).catch((err) => notify.error(`Impossible d'ouvrir ${file.name} : ${cleanError(err)}`));
  const reveal = document.createElement('button');
  reveal.innerHTML = '<i class="codicon codicon-folder-opened"></i>Afficher dans l\'Explorateur';
  reveal.onclick = () => window.atelier.revealFile(file.path);
  bar.append(open, reveal);
  return bar;
}

function renderImage(view, file) {
  view.classList.add('image');
  view.classList.remove('binary');
  const stage = document.createElement('div');
  stage.className = 'media-stage';
  const img = document.createElement('img');
  img.alt = file.name;
  img.src = file.dataUrl;
  img.title = 'Clic : taille réelle / ajustée';
  img.onclick = () => stage.classList.toggle('actual-size');
  stage.appendChild(img);
  const info = document.createElement('div');
  info.className = 'media-info';
  info.textContent = formatSize(file.size);
  img.onload = () => { info.textContent = `${img.naturalWidth} × ${img.naturalHeight} px · ${formatSize(file.size)}`; };
  img.onerror = () => { info.textContent = `Image illisible · ${formatSize(file.size)}`; };
  const footer = document.createElement('div');
  footer.className = 'media-footer';
  footer.append(info, mediaButtons(file));
  view.append(stage, footer);
}

function renderBinary(view, file) {
  view.classList.add('binary');
  view.classList.remove('image');
  const type = fileIcon(file.name);
  const card = document.createElement('div');
  card.className = 'media-card';
  card.appendChild(iconElement(type.icon, type.color));
  const name = document.createElement('div');
  name.className = 'media-name';
  name.textContent = file.name;
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = `${formatSize(file.size)} · fichier binaire, il ne s'ouvre pas comme du texte.`;
  card.append(name, hint, mediaButtons(file));
  view.appendChild(card);
}

// Le fichier a changé sur le disque (réexport depuis Photoshop…) : on relit l'image.
async function refreshMedia(file) {
  try {
    file.size = (await window.atelier.fileInfo(file.path)).size;
    if (file.kind === 'image') file.dataUrl = await window.atelier.fileDataUrl(file.path);
  } catch {
    return; // supprimé entre-temps
  }
  for (const group of state.groups) {
    if (group.active?.file === file) showMedia(group, file);
  }
}
