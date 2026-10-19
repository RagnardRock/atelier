// Panneau "Aperçu" : ton site tel qu'un navigateur l'affiche, à côté du code.
// - Bouton œil (en haut) ou Ctrl+Alt+P. Il montre le fichier HTML actif, sinon index.html.
// - La page se recharge toute seule quand un fichier du projet change (voir ../preview.js) ;
//   quand seul le CSS change, juste les styles sont rechargés.
// - Quand tu passes sur un autre onglet HTML, l'aperçu le suit.
// - Le bouton téléphone réduit la largeur à 390 px pour vérifier la version mobile.

const previewPanel = (() => {
  const panel = $('#preview-panel');
  const resizer = $('#preview-resizer');
  const frame = $('#preview-frame');
  const address = $('#preview-address');
  let base = null;      // http://127.0.0.1:<port>
  let current = '/';    // chemin de la page affichée

  const isHtml = (p) => /\.html?$/i.test(p || '');
  const activeHtml = () => {
    const tab = state.activeGroup?.active;
    return tab && isHtml(tab.file.path) ? tab.file.path : null;
  };

  async function show(file) {
    let url;
    try {
      url = await window.atelier.previewUrl(file);
    } catch (err) {
      return notify.error(`Aperçu impossible : ${cleanError(err)}`);
    }
    base = new URL(url).origin;
    go(new URL(url).pathname);
  }

  function go(path) {
    current = path.startsWith('/') ? path : `/${path}`;
    address.value = decodeURIComponent(current);
    frame.src = base + current;
  }

  async function toggle(open = panel.hidden) {
    if (open && !state.root) return notify.info("Ouvre d'abord un dossier : l'aperçu affiche les pages de ton projet.");
    panel.hidden = resizer.hidden = !open;
    $('#btn-preview').classList.toggle('active', open);
    if (open) await show(activeHtml());
    else frame.src = 'about:blank'; // la page arrête de tourner (scripts, vidéos…)
  }

  // La page affichée nous dit son adresse (script ajouté par le serveur), pour la barre d'adresse.
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || !base || e.origin !== base) return;
    if (typeof e.data?.atelierPreview === 'string') {
      current = e.data.atelierPreview;
      address.value = decodeURIComponent(current);
    }
  });

  document.addEventListener('tab-activated', (e) => {
    if (panel.hidden || !isHtml(e.detail.file.path)) return;
    window.atelier.previewUrl(e.detail.file.path).then((url) => {
      const path = new URL(url).pathname;
      if (path !== current) go(path);
    }).catch(() => {});
  });

  $('#preview-form').onsubmit = (e) => {
    e.preventDefault();
    go(address.value.trim().replace(/\\/g, '/') || '/');
  };
  $('#preview-reload').onclick = () => go(current);
  $('#preview-back').onclick = () => frame.contentWindow?.postMessage('atelier:back', base);
  $('#preview-device').onclick = () => {
    const mobile = !panel.classList.contains('mobile');
    panel.classList.toggle('mobile', mobile);
    $('#preview-device').classList.toggle('active', mobile);
  };
  $('#preview-external').onclick = () => base && window.atelier.previewExternal(base + current)
    .catch((err) => notify.error(`Impossible d'ouvrir le navigateur : ${cleanError(err)}`));
  $('#preview-close').onclick = () => toggle(false);
  $('#btn-preview').onclick = () => toggle();

  window.atelier.onShortcut((action) => { if (action === 'togglePreview') toggle(); });

  // Poignée : glisser pour changer la largeur. Pendant le glisser, le cadre ne doit pas
  // "avaler" la souris, sinon le glisser s'arrête dès qu'on passe dessus.
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizer.classList.add('dragging');
    frame.style.pointerEvents = 'none';
    const right = panel.getBoundingClientRect().right;
    const onMove = (ev) => { panel.style.width = `${Math.min(Math.max(right - ev.clientX, 320), window.innerWidth * 0.7)}px`; };
    const onUp = () => {
      resizer.classList.remove('dragging');
      frame.style.pointerEvents = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  return { toggle, show };
})();
