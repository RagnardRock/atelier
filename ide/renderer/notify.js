// Notifications en bas à droite + capture des erreurs imprévues.
// - notify.info / notify.success : disparaissent seules après quelques secondes.
// - notify.error : restent affichées jusqu'à ce que tu les fermes, et sont écrites dans atelier.log.

const notify = (() => {
  const container = document.createElement('div');
  container.id = 'notifications';
  document.body.appendChild(container);

  function show(type, message, { sticky = false, actions = [] } = {}) {
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.innerHTML = '<span class="message"></span><span class="actions"></span><button class="dismiss" title="Fermer">×</button>';
    el.querySelector('.message').textContent = message;
    for (const { label, run } of actions) {
      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = () => { run(); el.remove(); };
      el.querySelector('.actions').appendChild(button);
    }
    el.querySelector('.dismiss').onclick = () => el.remove();
    container.appendChild(el);
    // Au-delà de 5 notifications, on retire les plus anciennes.
    while (container.children.length > 5) container.firstChild.remove();
    if (!sticky) setTimeout(() => el.remove(), 4000);
  }

  // Bouton "Voir le journal" : ouvre atelier.log dans un onglet de l'IDE.
  const openLog = {
    label: 'Voir le journal',
    run: async () => openFile(await window.atelier.getLogPath(), 'atelier.log'),
  };

  return {
    info: (message, { actions = [] } = {}) => show('info', message, { sticky: actions.length > 0, actions }),
    success: (message) => show('success', message),
    error: (message, { log = true } = {}) => {
      if (log) window.atelier.log('ERREUR', `[interface] ${message}`);
      show('error', message, { sticky: true, actions: [openLog] });
    },
    warning: (message) => show('warning', message, { sticky: true, actions: [openLog] }),
  };
})();

// Les erreurs venant de main.js arrivent préfixées par
// "Error invoking remote method 'file:read': Error: ..." : on garde seulement la fin, lisible.
function cleanError(err) {
  return String(err && err.message ? err.message : err).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
}

// Monaco annule ses calculs en cours quand on ferme ou déplace un onglet, avec une erreur
// "Canceled". C'est normal : on ne la signale pas.
const isMonacoCancel = (err) => err && (err.name === 'Canceled' || err.message === 'Canceled');

// Toute erreur JavaScript non prévue dans l'interface finit en notification + journal,
// au lieu de passer inaperçue dans la console.
window.addEventListener('error', (e) => {
  if (isMonacoCancel(e.error)) return;
  notify.error(`Erreur inattendue : ${e.message}`, { log: false });
  window.atelier.log('ERREUR', `[interface] ${e.error && e.error.stack ? e.error.stack : e.message}`);
});
window.addEventListener('unhandledrejection', (e) => {
  if (isMonacoCancel(e.reason)) return;
  notify.error(`Erreur inattendue : ${cleanError(e.reason)}`);
});

// Erreurs signalées par main.js (déjà écrites dans le journal de son côté).
window.atelier.onAppError((message) => notify.error(message, { log: false }));
