// Panneau "Serveurs" : tes serveurs favoris, connexion SSH en un clic.
// Les fiches sont enregistrées par main.js dans servers.json (jamais de mot de passe).

const serversPanel = (() => {
  const list = document.querySelector('#server-list');
  const form = document.querySelector('#server-form');
  const addButton = document.querySelector('#server-add');
  const errorEl = document.querySelector('#server-form-error');
  let servers = [];
  let editingId = null; // null = ajout, sinon id du serveur modifié

  // --- Onglets Fichiers / Serveurs de la barre latérale ---
  document.querySelectorAll('#side-tabs button').forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll('#side-tabs button').forEach((b) => b.classList.toggle('active', b === button));
      document.querySelectorAll('.side-view').forEach((v) => { v.hidden = v.id !== button.dataset.view; });
    };
  });

  function describe(s) {
    const target = s.user ? `${s.user}@${s.host}` : s.host;
    return s.port && s.port !== 22 ? `${target}:${s.port}` : target;
  }

  function render() {
    list.innerHTML = '';
    if (servers.length === 0) {
      list.innerHTML = '<p class="hint">Aucun serveur pour l\'instant.</p>';
      return;
    }
    for (const server of servers) {
      const row = document.createElement('div');
      row.className = 'server';
      row.title = `Se connecter à ${server.name}`;
      row.innerHTML = `
        <span class="server-info"><span class="server-name"></span><span class="server-target"></span></span>
        <span class="server-actions">
          <button class="edit" title="Modifier">✎</button>
          <button class="delete" title="Supprimer">🗑</button>
        </span>`;
      row.querySelector('.server-name').textContent = server.name;
      row.querySelector('.server-target').textContent = describe(server);

      row.onclick = () => terminalPanel.connect(server).catch((err) => flash(err.message));
      row.querySelector('.edit').onclick = (e) => { e.stopPropagation(); openForm(server); };
      row.querySelector('.delete').onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Supprimer le serveur « ${server.name} » ?`)) return;
        servers = await window.atelier.deleteServer(server.id);
        render();
      };
      list.appendChild(row);
    }
  }

  // --- Formulaire d'ajout / modification ---

  function openForm(server) {
    editingId = server ? server.id : null;
    document.querySelector('#server-form-title').textContent = server ? `Modifier ${server.name}` : 'Nouveau serveur';
    form.reset();
    for (const key of ['name', 'host', 'user', 'port', 'keyFile']) {
      if (server && server[key] !== undefined) form.elements[key].value = server[key];
    }
    errorEl.textContent = '';
    form.hidden = false;
    addButton.hidden = true;
    form.elements.name.focus();
  }

  function closeForm() {
    form.hidden = true;
    addButton.hidden = false;
  }

  addButton.onclick = () => openForm(null);
  document.querySelector('#server-cancel').onclick = closeForm;
  document.querySelector('#server-key-pick').onclick = async () => {
    const file = await window.atelier.pickKeyFile();
    if (file) form.elements.keyFile.value = file;
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (editingId) data.id = editingId;
    try {
      servers = await window.atelier.saveServer(data);
    } catch (err) {
      // Message d'erreur de main.js, sans le préfixe technique d'Electron.
      errorEl.textContent = err.message.replace(/^.*Error: /, '');
      return;
    }
    closeForm();
    render();
    flash(`Serveur enregistré : ${data.name}`);
  };

  window.atelier.listServers().then((loaded) => { servers = loaded; render(); });

  return { render };
})();
