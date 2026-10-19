// Bouton "Mise à jour" : vérifie s'il y a des nouveautés sur GitHub et lance mettre-a-jour.bat.
// Au démarrage, une vérification discrète affiche une notification si une version plus récente existe.

const updater = (() => {
  const button = document.querySelector('#btn-update');
  let busy = false;

  async function check() {
    const { branch, changes } = await window.atelier.checkUpdate();
    button.classList.toggle('available', changes.length > 0);
    button.title = changes.length > 0
      ? `${changes.length} nouveauté(s) disponible(s) sur la branche ${branch}`
      : "Chercher et installer la dernière version d'Atelier";
    return { branch, changes };
  }

  async function install(changes) {
    const list = changes.slice(0, 15).map((c) => `• ${c}`).join('\n');
    const more = changes.length > 15 ? `\n… et ${changes.length - 15} autre(s)` : '';
    if (!confirm(`${changes.length} nouveauté(s) à installer :\n\n${list}${more}\n\nAtelier va se fermer, se mettre à jour dans une fenêtre à part, puis se relancer.`)) return;

    // Fichiers modifiés pas encore enregistrés : on prévient avant de fermer.
    const unsaved = [...state.files.values()].filter(isDirty).map((f) => f.name);
    if (unsaved.length && !confirm(`Ces fichiers ne sont pas enregistrés et leurs modifications seront perdues :\n\n${unsaved.join('\n')}\n\nContinuer quand même ?`)) return;

    await window.atelier.installUpdate();
  }

  // Clic sur le bouton : vérifier, puis proposer d'installer.
  button.onclick = async () => {
    if (busy) return;
    busy = true;
    // Pendant la vérification, l'icône tourne.
    const icon = button.querySelector('.codicon');
    icon.className = 'codicon codicon-sync codicon-modifier-spin';
    try {
      const { changes } = await check();
      if (changes.length === 0) notify.success("Atelier est à jour");
      else await install(changes);
    } catch (err) {
      notify.error(`Mise à jour impossible : ${cleanError(err)}`);
    } finally {
      icon.className = 'codicon codicon-cloud-download';
      busy = false;
    }
  };

  // Vérification discrète au démarrage (pas de message d'erreur si on est hors ligne).
  check()
    .then(({ changes }) => {
      if (changes.length === 0) return;
      notify.info(`Une nouvelle version d'Atelier est disponible (${changes.length} nouveauté(s)).`, {
        actions: [{ label: 'Mettre à jour', run: () => button.click() }],
      });
    })
    .catch((err) => window.atelier.log('INFO', `Vérification de mise à jour impossible : ${cleanError(err)}`));

  return { check };
})();
