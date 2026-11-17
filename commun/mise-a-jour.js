// Bouton « Mise à jour » (barre de titre), commun aux outils de l'Atelier (recopié dans
// <outil>/commun/ par copier.js). Il vérifie s'il y a une nouvelle version de l'outil sur GitHub et
// l'installe :
// - outil installé (<Outil>-Setup.exe) : il télécharge le nouvel installeur depuis la Release
//   <outil>-vX.Y.Z, se ferme, s'installe en silence et se relance ;
// - outil lancé depuis le clone git : il lance <dossier>/mettre-a-jour.bat (git pull + npm install).
// Au démarrage, une vérification discrète affiche une notification si une version plus récente existe.
//
// La balise dit quel pont de l'outil utiliser et son nom :
//   <script src="../commun/mise-a-jour.js" data-api="brokk" data-nom="Brokk"></script>
// Avant de fermer pour s'installer, si l'outil a App.avantMiseAJour(), elle est appelée : elle propose
// d'enregistrer ce qui ne l'est pas, et rend false pour tout annuler.
// Il faut la page : un bouton #btn-update, la fonction $, notify et Dialogs (notifications.js, dialogues.js).

const Updater = (() => {
  const { api: nomApi, nom } = document.currentScript.dataset;
  const api = window[nomApi];
  // « de Brokk », « d'Edda » : l'élision devant une voyelle.
  const de = `${/^[AEIOUYÉÈÊaeiouyéèê]/.test(nom) ? 'd\'' : 'de '}${nom}`;
  const button = $('#btn-update');
  // Un jeu exporté (mode joueur de Saga) ou l'écran des joueurs ne cherche pas de mise à jour.
  if (!api || !button || api.joueur || api.ecranJoueurs) return { check: async () => ({ changes: [] }) };
  let busy = false;

  async function check() {
    const result = await api.checkUpdate();
    const { changes } = result;
    button.classList.toggle('available', changes.length > 0);
    button.title = changes.length === 0 ? `Chercher et installer la dernière version ${de}`
      : result.mode === 'installer' ? `${nom} ${result.version} est disponible`
        : `${changes.length} nouveauté(s) disponible(s) sur la branche ${result.branch}`;
    return result;
  }

  async function install({ mode, version, changes }) {
    const list = changes.slice(0, 12).map((c) => `• ${c}`).join('\n');
    const more = changes.length > 12 ? `\n… et ${changes.length - 12} autre(s)` : '';
    const intro = mode === 'installer' ? `${nom} ${version} est disponible :` : `${changes.length} nouveauté(s) à installer :`;
    const how = mode === 'installer'
      ? `${nom} va télécharger la nouvelle version, se fermer, s'installer puis se relancer.`
      : `${nom} va se fermer, se mettre à jour dans une fenêtre à part, puis se relancer.`;
    const go = await Dialogs.ask('Mise à jour', `${intro}\n\n${list}${more}\n\n${how}`, [
      { label: 'Plus tard', value: false },
      { label: 'Mettre à jour', value: true, primary: true },
    ]);
    if (!go) return;
    // Ce qui n'est pas enregistré : l'outil le propose (ou annule).
    if (typeof App !== 'undefined' && App.avantMiseAJour && (await App.avantMiseAJour()) === false) return;
    if (mode === 'installer') notify(`Téléchargement ${de} ${version}…`, 'info', 60000);
    await api.installUpdate();
  }

  // Pendant le téléchargement, l'infobulle du bouton donne l'avancement.
  api.onUpdateProgress((percent) => { button.title = `Téléchargement de la mise à jour : ${percent} %`; });

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
          ? `${nom} ${result.version} est à jour : aucune version plus récente n'est publiée sur GitHub.`
          : `${nom} est à jour : rien de nouveau sur GitHub pour ${nom}.`, 'success', 6000);
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
      const what = mode === 'installer' ? `${nom} ${version} est disponible.` : `Une nouvelle version ${de} est disponible (${changes.length} nouveauté(s)).`;
      notify(what, 'info', 15000, [{ label: 'Mettre à jour', run: () => button.click() }]);
    })
    .catch(() => { /* hors ligne ou GitHub injoignable : on réessaiera au prochain clic */ });

  return { check };
})();
