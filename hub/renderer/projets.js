// Widget « Projets récents » : les dossiers de ton dossier de projets (D:\Projets par défaut),
// du plus récemment modifié au plus ancien, avec leur type, leur branche Git et ce qui reste à faire
// (fichiers modifiés, commits à pousser). Un clic ouvre le projet dans Rune ; l'icône dossier
// l'ouvre dans l'Explorateur. Le dossier se change dans les réglages d'Atelier.
// L'état Git est relu quand la fenêtre d'Atelier revient au premier plan (au plus une fois par minute).

const Projets = (() => {
  const liste = $('#projets-liste');
  const recherche = $('#projets-recherche');
  let donnees = { projets: [] };
  let derniereLecture = 0;

  function badgeGit(git) {
    if (!git) return null;
    const morceaux = [el('span', { className: 'branche' }, el('i', { className: 'codicon codicon-git-branch' }), git.branche)];
    if (git.modifies) morceaux.push(el('span', { className: 'pastille modifie', title: `${git.modifies} fichier(s) modifié(s) pas encore commité(s)`, textContent: `● ${git.modifies}` }));
    if (git.aPousser) morceaux.push(el('span', { className: 'pastille pousser', title: `${git.aPousser} commit(s) pas encore poussé(s) sur GitHub`, textContent: `↑ ${git.aPousser}` }));
    if (git.aRecuperer) morceaux.push(el('span', { className: 'pastille recuperer', title: `${git.aRecuperer} commit(s) sur GitHub à récupérer (git pull)`, textContent: `↓ ${git.aRecuperer}` }));
    return el('span', { className: 'projet-git' }, ...morceaux);
  }

  function render() {
    const q = recherche.value.trim().toLowerCase();
    const visibles = donnees.projets.filter((p) => !q || p.nom.toLowerCase().includes(q));
    liste.replaceChildren(...visibles.map((p) => {
      const explorer = el('button', { className: 'icon-button', title: 'Ouvrir dans l\'Explorateur' }, el('i', { className: 'codicon codicon-folder-opened' }));
      explorer.onclick = (e) => {
        e.stopPropagation();
        window.atelier.ouvrirExplorateur(p.dossier).catch((err) => notify(cleanError(err), 'error'));
      };
      const li = el('li', { title: `Ouvrir ${p.dossier} dans Rune` },
        el('div', { className: 'ligne-principale' },
          el('span', { className: 'projet-nom', textContent: p.nom }),
          p.type ? el('span', { className: `type type-${p.type.toLowerCase()}`, textContent: p.type }) : null,
          el('span', { className: 'spacer' }),
          el('span', { className: 'discret', textContent: dateRelative(p.activite) }),
          explorer),
        badgeGit(p.git));
      li.onclick = async () => {
        try {
          await window.atelier.ouvrirDansRune(p.dossier);
          notify(`${p.nom} s'ouvre dans Rune…`, 'success', 2500);
        } catch (err) {
          notify(cleanError(err), 'error');
        }
      };
      return li;
    }));
    if (!visibles.length) {
      const msg = !donnees.existe ? `Le dossier ${donnees.racine || '(aucun)'} n'existe pas. Choisis ton dossier de projets dans les réglages (Ctrl+,).`
        : q ? 'Aucun projet ne correspond.' : 'Aucun projet dans ce dossier.';
      liste.append(el('li', { className: 'vide', textContent: msg }));
    }
    $('#projets-racine').textContent = donnees.racine ? `${donnees.racine}${donnees.total > donnees.projets.length ? ` · ${donnees.projets.length} plus récents sur ${donnees.total}` : ''}` : '';
  }

  async function refresh() {
    const icon = $('#btn-projets-actualiser .codicon');
    icon.classList.add('codicon-modifier-spin');
    try {
      donnees = await window.atelier.projets();
      derniereLecture = Date.now();
      render();
    } catch (err) {
      notify(`Projets illisibles : ${cleanError(err)}`, 'error');
    } finally {
      icon.classList.remove('codicon-modifier-spin');
    }
  }

  recherche.addEventListener('input', render);
  recherche.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { recherche.value = ''; render(); }
    if (e.key === 'Enter') liste.querySelector('li:not(.vide)')?.click();
  });
  $('#btn-projets-actualiser').onclick = refresh;
  window.addEventListener('focus', () => { if (Date.now() - derniereLecture > 60_000) refresh(); });

  return { refresh };
})();
