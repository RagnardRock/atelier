// Bouton « Mise à jour » (barre de titre) : vérifie s'il y a une nouvelle version de Brokk sur GitHub
// et l'installe, comme dans Rune.
// - Brokk installé (Brokk-Setup.exe) : il télécharge le nouvel installeur depuis la Release
//   brokk-vX.Y.Z, se ferme, s'installe en silence et se relance.
// - Brokk lancé depuis le clone git : il lance export/mettre-a-jour.bat (git pull + npm install).
// Au démarrage, une vérification discrète affiche une notification si une version plus récente existe.

const Updater = (() => {
  const button = $('#btn-update');
  let busy = false;

  async function check() {
    const result = await window.brokk.checkUpdate();
    const { changes } = result;
    button.classList.toggle('available', changes.length > 0);
    button.title = changes.length === 0 ? 'Chercher et installer la dernière version de Brokk'
      : result.mode === 'installer' ? `Brokk ${result.version} est disponible`
        : `${changes.length} nouveauté(s) disponible(s) sur la branche ${result.branch}`;
    return result;
  }

  async function install({ mode, version, changes }) {
    const list = changes.slice(0, 12).map((c) => `• ${c}`).join('\n');
    const more = changes.length > 12 ? `\n… et ${changes.length - 12} autre(s)` : '';
    const intro = mode === 'installer' ? `Brokk ${version} est disponible :` : `${changes.length} nouveauté(s) à installer :`;
    const how = mode === 'installer'
      ? 'Brokk va télécharger la nouvelle version, se fermer, s\'installer puis se relancer.'
      : 'Brokk va se fermer, se mettre à jour dans une fenêtre à part, puis se relancer.';
    const go = await Dialogs.ask('Mise à jour', `${intro}\n\n${list}${more}\n\n${how}`, [
      { label: 'Plus tard', value: false },
      { label: 'Mettre à jour', value: true, primary: true },
    ]);
    if (!go) return;
    // Rien à enregistrer avant de fermer : tes assets et leurs réglages sont gardés au fil de l'eau.
    if (mode === 'installer') notify(`Téléchargement de Brokk ${version}…`, 'info', 60000);
    await window.brokk.installUpdate();
  }

  // Pendant le téléchargement, l'infobulle du bouton donne l'avancement.
  window.brokk.onUpdateProgress((percent) => { button.title = `Téléchargement de la mise à jour : ${percent} %`; });

  // Clic sur le bouton : vérifier, puis proposer d'installer.
  button.onclick = async () => {
    if (busy) return;
    busy = true;
    // Pendant la vérification, l'icône tourne.
    const icon = button.querySelector('.codicon');
    icon.className = 'codicon codicon-sync codicon-modifier-spin';
    try {
      const result = await check();
      if (result.changes.length === 0) {
        notify(result.mode === 'installer'
          ? `Brokk ${result.version} est à jour : aucune version plus récente n'est publiée sur GitHub.`
          : 'Brokk est à jour : rien de nouveau sur GitHub pour Brokk.', 'success', 6000);
      }
      else await install(result);
    } catch (err) {
      notify(`Mise à jour impossible : ${cleanError(err)}`, 'error');
    } finally {
      icon.className = 'codicon codicon-cloud-download';
      busy = false;
    }
  };

  // Vérification discrète au démarrage (pas de message d'erreur si on est hors ligne).
  check()
    .then(({ mode, version, changes }) => {
      if (changes.length === 0) return;
      const what = mode === 'installer' ? `Brokk ${version} est disponible.` : `Une nouvelle version de Brokk est disponible (${changes.length} nouveauté(s)).`;
      notify(what, 'info', 15000, [{ label: 'Mettre à jour', run: () => button.click() }]);
    })
    .catch(() => { /* hors ligne ou GitHub injoignable : on réessaiera au prochain clic */ });

  return { check };
})();
