// Widget « Projets récents » : les dossiers de ton dossier de projets (D:\Projets par défaut),
// du plus récemment modifié au plus ancien, avec leur type, leur branche Git et ce qui reste à faire
// (fichiers modifiés, commits à pousser). Le dossier se change dans les réglages d'Atelier.
// Un clic ouvre le projet avec son outil, montré par la petite icône à gauche : Skald pour un
// projet surtout fait d'images (PSD, PNG, SVG…), Rune pour le reste. Clic droit : ouvrir avec un
// autre outil, ou choisir l'outil de ce projet pour de bon (gardé dans les réglages d'Atelier).
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
      explorer.onclick = (e) => { e.stopPropagation(); ouvrir(p, 'explorateur'); };
      const li = el('li', { title: `Ouvrir ${p.dossier} dans ${NOMS[p.outil]} (clic droit : autres choix)` },
        el('div', { className: 'ligne-principale' },
          ICONES[p.outil] ? el('img', { className: 'projet-outil', src: ICONES[p.outil], alt: NOMS[p.outil] })
            : el('i', { className: 'codicon codicon-folder projet-outil' }),
          el('span', { className: 'projet-nom', textContent: p.nom }),
          p.type ? el('span', { className: `type type-${p.type.toLowerCase()}`, textContent: p.type }) : null,
          el('span', { className: 'spacer' }),
          el('span', { className: 'discret', textContent: dateRelative(p.activite) }),
          explorer),
        badgeGit(p.git));
      li.onclick = () => ouvrir(p, p.outil);
      li.oncontextmenu = (e) => { e.preventDefault(); menuProjet(p, e.clientX, e.clientY); };
      return li;
    }));
    if (!visibles.length) {
      const msg = !donnees.existe ? `Le dossier ${donnees.racine || '(aucun)'} n'existe pas. Choisis ton dossier de projets dans les réglages (Ctrl+,).`
        : q ? 'Aucun projet ne correspond.' : 'Aucun projet dans ce dossier.';
      liste.append(el('li', { className: 'vide', textContent: msg }));
    }
    $('#projets-racine').textContent = donnees.racine ? `${donnees.racine}${donnees.total > donnees.projets.length ? ` · ${donnees.projets.length} plus récents sur ${donnees.total}` : ''}` : '';
  }

  const NOMS = { rune: 'Rune', skald: 'Skald', explorateur: 'l\'Explorateur' };
  const ICONES = { rune: 'outils/rune.svg', skald: 'outils/skald.svg' };

  async function ouvrir(p, outil) {
    try {
      await window.atelier.ouvrirProjet(p.dossier, outil);
      if (outil !== 'explorateur') notify(`${p.nom} s'ouvre dans ${NOMS[outil]}…`, 'success', 2500);
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }

  // Clic droit : ouvrir avec…, et l'outil de ce projet pour de bon.
  function menuProjet(p, x, y) {
    const auto = `Automatique (${NOMS[p.outilAuto]}, d'après les fichiers)`;
    const choix = async (outil) => {
      await window.atelier.choisirOutilProjet(p.nom, outil);
      p.outil = outil || p.outilAuto;
      render();
      notify(outil ? `${p.nom} s'ouvrira toujours dans ${NOMS[outil]}.` : `${p.nom} : outil choisi automatiquement.`, 'success', 3000);
    };
    const choisi = p.outil !== p.outilAuto || null;
    ouvrirMenu(x, y, [
      ['Ouvrir dans Rune', () => ouvrir(p, 'rune')],
      ['Ouvrir dans Skald', () => ouvrir(p, 'skald')],
      ['Ouvrir dans l\'Explorateur', () => ouvrir(p, 'explorateur')],
      null,
      'Toujours ouvrir ce projet avec',
      [auto, () => choix(null), !choisi],
      ['Rune', () => choix('rune'), choisi && p.outil === 'rune'],
      ['Skald', () => choix('skald'), choisi && p.outil === 'skald'],
      ['L\'Explorateur', () => choix('explorateur'), choisi && p.outil === 'explorateur'],
    ]);
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
