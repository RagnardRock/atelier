// Panneau "Aperçu" : ton site tel qu'un navigateur l'affiche, à côté du code.
// - Bouton œil (en haut) ou Ctrl+Alt+P. Il montre le fichier HTML actif, sinon index.html.
// - La page se recharge toute seule quand un fichier du projet change (voir ../preview.js) ;
//   quand seul le CSS change, juste les styles sont rechargés.
// - Quand tu passes sur un autre onglet HTML, l'aperçu le suit.
// - Le bouton téléphone réduit la largeur à 390 px pour vérifier la version mobile.
// - Pendant la frappe (réglage "previewLive"), le texte pas encore enregistré est envoyé au
//   serveur : la page change sans attendre Ctrl+S.
// - « Go Live », dans la barre du bas, ouvre le site dans ton navigateur habituel, sans le panneau.
//   Une fois le serveur lancé, il affiche son port (5500 par défaut, réglable dans Réglages > Aperçu).

const previewPanel = (() => {
  const panel = $('#preview-panel');
  const resizer = $('#preview-resizer');
  const frame = $('#preview-frame');
  const address = $('#preview-address');
  const live = $('#status-live');
  let base = null;      // http://127.0.0.1:<port>
  let current = '/';    // chemin de la page affichée
  let portSetting = null;
  let liveSetting = null;
  const draftTimers = new Map();

  // Fichiers dont la page dépend : ceux-là partent en brouillon pendant la frappe.
  const WEB = /\.(html?|css|m?js|json|svg|xml|txt)$/i;

  const isHtml = (p) => /\.html?$/i.test(p || '');
  const activeHtml = () => {
    const tab = state.activeGroup?.active;
    return tab && isHtml(tab.file.path) ? tab.file.path : null;
  };

  // Démarre le serveur si besoin (main.js) et renvoie l'adresse de la page d'un fichier.
  async function serverUrl(file) {
    const url = await window.atelier.previewUrl(file, state.config.previewPort);
    const first = !base;
    base = new URL(url).origin;
    live.classList.add('running');
    live.querySelector('span').textContent = `Live · ${new URL(url).port}`;
    live.title = `Le serveur tourne sur ${base}/ : clic pour ouvrir la page dans ton navigateur`;
    if (first) syncAllDrafts(); // les modifications faites avant le démarrage
    return url;
  }

  async function show(file) {
    let url;
    try {
      url = await serverUrl(file);
    } catch (err) {
      return notify.error(`Aperçu impossible : ${cleanError(err)}`);
    }
    go(new URL(url).pathname);
  }

  // « Go Live » : la page du fichier HTML actif (sinon l'accueil du site) dans ton navigateur.
  async function goLive() {
    if (!state.root) return notify.info("Ouvre d'abord un dossier : Go Live sert les pages de ton projet.");
    try {
      await window.atelier.previewExternal(await serverUrl(activeHtml()));
    } catch (err) {
      notify.error(`Go Live impossible : ${cleanError(err)}`);
    }
  }

  // --- Mise à jour pendant la frappe ---
  // Un fichier modifié mais pas enregistré : son texte part au serveur après une courte pause.
  // Enregistré (ou modifications abandonnées) : null, le serveur revient au fichier du disque.
  const liveEnabled = () => state.config.previewLive !== false;

  function sendDraft(file, quiet = false) {
    clearTimeout(draftTimers.get(file.path));
    draftTimers.delete(file.path);
    const text = !file.model.isDisposed() && isDirty(file) ? file.model.getValue() : null;
    window.atelier.previewDraft(file.path, text, quiet).catch(() => {});
  }

  function syncAllDrafts() {
    if (!liveEnabled()) return;
    for (const file of state.files.values()) {
      if (!file.kind && WEB.test(file.path) && isDirty(file)) sendDraft(file);
    }
  }

  document.addEventListener('file-edited', (e) => {
    const file = e.detail;
    if (!base || !liveEnabled() || !WEB.test(file.path)) return;
    clearTimeout(draftTimers.get(file.path));
    draftTimers.set(file.path, setTimeout(() => sendDraft(file), 300));
  });
  // Après Ctrl+S, le disque a la même version : le serveur la reprend sans recharger une fois de
  // plus (la surveillance du dossier recharge déjà la page).
  document.addEventListener('file-saved', (e) => { if (base && !e.detail.kind) sendDraft(e.detail, true); });
  document.addEventListener('file-released', (e) => {
    clearTimeout(draftTimers.get(e.detail.path));
    draftTimers.delete(e.detail.path);
    if (base) window.atelier.previewDraft(e.detail.path, null).catch(() => {});
  });

  // Réglages modifiés : port changé → le serveur redémarre dessus ; mise à jour pendant la frappe
  // coupée → les brouillons disparaissent et la page revient aux fichiers enregistrés.
  function applyConfig(c) {
    const port = c.previewPort;
    const liveOn = c.previewLive !== false;
    const portChanged = portSetting !== null && port !== portSetting;
    const liveChanged = liveSetting !== null && liveOn !== liveSetting;
    portSetting = port;
    liveSetting = liveOn;
    if (!base) return;
    if (liveChanged) {
      if (liveOn) syncAllDrafts();
      else window.atelier.previewClearDrafts().catch(() => {});
    }
    if (portChanged) {
      serverUrl(null).then(() => { if (!panel.hidden) go(current); })
        .catch((err) => notify.error(`Aperçu : ${cleanError(err)}`));
    }
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
    window.atelier.previewUrl(e.detail.file.path, state.config.previewPort).then((url) => {
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
  live.onclick = goLive;

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

  return { toggle, show, goLive, applyConfig };
})();
