// Icônes de fichiers : une icône Codicons + une couleur selon l'extension.
// Pour ajouter un type, ajoute une ligne dans FILE_TYPES.

const FILE_TYPES = [
  { ext: ['html', 'htm'], icon: 'code', color: '#e44d26' },
  { ext: ['css'], icon: 'symbol-color', color: '#42a5f5' },
  { ext: ['scss', 'sass', 'less'], icon: 'symbol-color', color: '#cd6799' },
  { ext: ['js', 'mjs', 'cjs'], icon: 'symbol-method', color: '#f1dd35' },
  { ext: ['ts', 'tsx', 'jsx'], icon: 'symbol-method', color: '#3d8fd1' },
  { ext: ['vue'], icon: 'code', color: '#42b883' },
  { ext: ['svelte'], icon: 'code', color: '#ff3e00' },
  { ext: ['json'], icon: 'json', color: '#f5b642' },
  { ext: ['md', 'markdown'], icon: 'markdown', color: '#5ea0ef' },
  { ext: ['php'], icon: 'code', color: '#8c9eff' },
  { ext: ['py'], icon: 'code', color: '#4b8bbe' },
  { ext: ['svg'], icon: 'file-media', color: '#ffb13b' },
  { ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif'], icon: 'file-media', color: '#b388ff' },
  { ext: ['psd', 'ai', 'eps'], icon: 'file-media', color: '#31a8ff' },
  { ext: ['pdf'], icon: 'file-pdf', color: '#ef5350' },
  { ext: ['zip', 'rar', '7z', 'gz', 'tar'], icon: 'file-zip', color: '#a1887f' },
  { ext: ['sh', 'bat', 'cmd', 'ps1'], icon: 'terminal', color: '#4caf50' },
  { ext: ['txt', 'log'], icon: 'file-text', color: '#9e9e9e' },
  { ext: ['env', 'gitignore', 'gitattributes', 'editorconfig'], icon: 'gear', color: '#9e9e9e' },
];

function fileIcon(name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : name.toLowerCase();
  const type = FILE_TYPES.find((t) => t.ext.includes(ext));
  return type || { icon: 'file', color: 'var(--muted)' };
}

// Petit élément <i> prêt à insérer.
function iconElement(icon, color) {
  const i = document.createElement('i');
  i.className = `codicon codicon-${icon} file-icon`;
  if (color) i.style.color = color;
  return i;
}
