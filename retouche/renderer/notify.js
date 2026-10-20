// Notifications en bas à droite (comme dans Rune).
// notify(message) : info qui disparaît seule ; notify(message, 'error') : reste jusqu'à fermeture.

const notifications = document.createElement('div');
notifications.id = 'notifications';
document.body.appendChild(notifications);

function notify(message, type = 'info', duration = 3500) {
  const icons = { info: 'info', success: 'pass', error: 'error', warning: 'warning' };
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.innerHTML = `<i class="codicon codicon-${icons[type] || 'info'}"></i><div class="message"></div>
    <button class="icon-button" title="Fermer"><i class="codicon codicon-close"></i></button>`;
  el.querySelector('.message').textContent = message;
  el.querySelector('button').onclick = () => el.remove();
  notifications.appendChild(el);
  while (notifications.children.length > 4) notifications.firstChild.remove();
  if (type !== 'error') setTimeout(() => el.remove(), duration);
}

// Les erreurs venant de main.js arrivent préfixées par "Error invoking remote method '…': Error: ".
const cleanError = (err) => String(err && err.message ? err.message : err).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');

window.addEventListener('error', (e) => notify(`Erreur inattendue : ${e.message}`, 'error'));
window.addEventListener('unhandledrejection', (e) => notify(`Erreur inattendue : ${cleanError(e.reason)}`, 'error'));
window.skald.onError((message) => notify(message, 'error'));
