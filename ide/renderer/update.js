// Bouton "Mise à jour" : vérifie s'il y a une nouvelle version sur GitHub et l'installe.
// - Rune installé (Rune-Setup.exe) : il télécharge le nouvel installeur depuis les versions GitHub,
//   se ferme, s'installe en silence et se relance.
// - Rune lancé depuis le clone git : il lance mettre-a-jour.bat (git pull + npm install).
// Au démarrage, une vérification discrète affiche une notification si une version plus récente existe.

const updater = (() => {
  const button = document.querySelector('#btn-update');
  let busy = false;

  async function check() {
    const result = await window.atelier.checkUpdate();
    const { changes } = result;
    button.classList.toggle('available', changes.length > 0);
    button.title = changes.length === 0 ? 'Chercher et installer la dernière version de Rune'
      : result.mode === 'installer' ? `Rune ${result.version} est disponible`
        : `${changes.length} nouveauté(s) disponible(s) sur la branche ${result.branch}`;
    return result;
  }

  async function install({ mode, version, changes }) {
    const list = changes.slice(0, 15).map((c) => `• ${c}`).join('\n');
    const more = changes.length > 15 ? `\n… et ${changes.length - 15} autre(s)` : '';
    const intro = mode === 'installer' ? `Rune ${version} est disponible :` : `${changes.length} nouveauté(s) à installer :`;
    const how = mode === 'installer'
      ? 'Rune va télécharger la nouvelle version, se fermer, s\'installer puis se relancer.'
      : 'Rune va se fermer, se mettre à jour dans une fenêtre à part, puis se relancer.';
    if (!confirm(`${intro}\n\n${list}${more}\n\n${how}`)) return;

    // Fichiers modifiés pas encore enregistrés : on prévient avant de fermer.
    const unsaved = [...state.files.values()].filter(isDirty).map((f) => f.name);
    if (unsaved.length && !confirm(`Ces fichiers ne sont pas enregistrés et leurs modifications seront perdues :\n\n${unsaved.join('\n')}\n\nContinuer quand même ?`)) return;

    if (mode === 'installer') notify.info(`Téléchargement de Rune ${version}…`);
    await window.atelier.installUpdate();
  }

  // Pendant le téléchargement, l'infobulle du bouton donne l'avancement.
  window.atelier.onUpdateProgress((percent) => { button.title = `Téléchargement de la mise à jour : ${percent} %`; });

  // Clic sur le bouton : vérifier, puis proposer d'installer.
  button.onclick = async () => {
    if (busy) return;
    busy = true;
    // Pendant la vérification, l'icône tourne.
    const icon = button.querySelector('.codicon');
    icon.className = 'codicon codicon-sync codicon-modifier-spin';
    try {
      const result = await check();
      if (result.changes.length === 0) notify.success('Rune est à jour');
      else await install(result);
    } catch (err) {
      notify.error(`Mise à jour impossible : ${cleanError(err)}`);
    } finally {
      icon.className = 'codicon codicon-cloud-download';
      busy = false;
    }
  };

  // Vérification discrète au démarrage (pas de message d'erreur si on est hors ligne).
  check()
    .then(({ mode, version, changes }) => {
      if (changes.length === 0) return;
      const what = mode === 'installer' ? `Rune ${version} est disponible.` : `Une nouvelle version de Rune est disponible (${changes.length} nouveauté(s)).`;
      notify.info(what, { actions: [{ label: 'Mettre à jour', run: () => button.click() }] });
    })
    .catch((err) => window.atelier.log('INFO', `Vérification de mise à jour impossible : ${cleanError(err)}`));

  return { check };
})();
