// Bouton « Mise à jour » (barre de titre) : vérifie s'il y a une nouvelle version d'Edda sur GitHub
// et l'installe, comme dans Rune.
// - Edda installé (Edda-Setup.exe) : il télécharge le nouvel installeur depuis la Release
//   edda-vX.Y.Z, se ferme, s'installe en silence et se relance.
// - Edda lancé depuis le clone git : il lance texte/mettre-a-jour.bat (git pull + npm install).
// Au démarrage, une vérification discrète affiche une notification si une version plus récente existe.

const Updater = (() => {
  const button = $('#btn-update');
  let busy = false;

  async function check() {
    const result = await window.edda.checkUpdate();
    const { changes } = result;
    button.classList.toggle('available', changes.length > 0);
    button.title = changes.length === 0 ? 'Chercher et installer la dernière version d\'Edda'
      : result.mode === 'installer' ? `Edda ${result.version} est disponible`
        : `${changes.length} nouveauté(s) disponible(s) sur la branche ${result.branch}`;
    return result;
  }

  async function install({ mode, version, changes }) {
    const list = changes.slice(0, 12).map((c) => `• ${c}`).join('\n');
    const more = changes.length > 12 ? `\n… et ${changes.length - 12} autre(s)` : '';
    const intro = mode === 'installer' ? `Edda ${version} est disponible :` : `${changes.length} nouveauté(s) à installer :`;
    const how = mode === 'installer'
      ? 'Edda va télécharger la nouvelle version, se fermer, s\'installer puis se relancer.'
      : 'Edda va se fermer, se mettre à jour dans une fenêtre à part, puis se relancer.';
    const go = await Dialogs.ask('Mise à jour', `${intro}\n\n${list}${more}\n\n${how}`, [
      { label: 'Plus tard', value: false },
      { label: 'Mettre à jour', value: true, primary: true },
    ]);
    if (!go) return;
    // Avant de fermer : les documents pas encore enregistrés.
    const modifies = App.claude.docs().filter((d) => d.modifie);
    if (modifies.length) {
      const choix = await Dialogs.ask('Documents pas enregistrés', `${modifies.map((d) => d.nom).join(', ')} : enregistrer avant la mise à jour ?`, [
        { label: 'Annuler', value: null },
        { label: 'Ne pas enregistrer', value: false },
        { label: 'Enregistrer', value: true, primary: true },
      ]);
      if (choix === null) return;
      if (choix) for (const d of modifies) if (!(await App.claude.enregistrer(d))) return;
    }
    if (mode === 'installer') notify(`Téléchargement d'Edda ${version}…`, 'info', 60000);
    await window.edda.installUpdate();
  }

  // Pendant le téléchargement, l'infobulle du bouton donne l'avancement.
  window.edda.onUpdateProgress((percent) => { button.title = `Téléchargement de la mise à jour : ${percent} %`; });

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
          ? `Edda ${result.version} est à jour : aucune version plus récente n'est publiée sur GitHub.`
          : 'Edda est à jour : rien de nouveau sur GitHub pour Edda.', 'success', 6000);
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
      const what = mode === 'installer' ? `Edda ${version} est disponible.` : `Une nouvelle version d'Edda est disponible (${changes.length} nouveauté(s)).`;
      notify(what, 'info', 15000, [{ label: 'Mettre à jour', run: () => button.click() }]);
    })
    .catch(() => { /* hors ligne ou GitHub injoignable : on réessaiera au prochain clic */ });

  return { check };
})();
