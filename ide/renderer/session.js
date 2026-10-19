// Onglets de la dernière session : quand tu rouvres un dossier, ses onglets reviennent, dans
// leurs colonnes, avec l'onglet actif de chacune. Ils sont retenus dans state.json (main.js),
// pour chaque dossier, à chaque ouverture, fermeture ou déplacement d'onglet.
// Réglage « Rouvrir les onglets » (restoreTabs) dans Réglages › Démarrage.

let restoringSession = false;

function sessionSnapshot() {
  // Seulement les fichiers du dossier ouvert (pas config.json, ni ceux d'un autre dossier).
  const inRoot = (p) => p !== state.configPath && (p.startsWith(`${state.root}\\`) || p.startsWith(`${state.root}/`));
  const groups = state.groups
    .map((g) => {
      const tabs = g.tabs.filter((t) => inRoot(t.file.path));
      return { group: g, files: tabs.map((t) => t.file.path), active: Math.max(tabs.indexOf(g.active), 0) };
    })
    .filter((g) => g.files.length);
  return {
    groups: groups.map(({ files, active }) => ({ files, active })),
    activeGroup: Math.max(groups.findIndex((g) => g.group === state.activeGroup), 0),
  };
}

let sessionTimer = null;
function saveSessionSoon() {
  if (restoringSession || !state.root) return;
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    window.atelier.saveSession(sessionSnapshot()).catch(() => {});
  }, 400);
}
document.addEventListener('tabs-changed', saveSessionSoon);
document.addEventListener('tab-activated', saveSessionSoon);

// Appelé par showRoot (app.js) après l'ouverture d'un dossier.
async function restoreSession() {
  // Des onglets sont déjà ouverts (dossier changé en cours de route) : on n'y touche pas.
  if (state.groups.some((g) => g.tabs.length)) return;
  const session = await window.atelier.getSession().catch(() => null);
  if (!session?.groups?.length) return;
  restoringSession = true;
  try {
    let group = state.groups[0];
    for (const [i, saved] of session.groups.entries()) {
      if (i > 0) group = createGroup(group);
      for (const path of saved.files) {
        // Un fichier supprimé depuis est simplement ignoré (sans message d'erreur).
        const file = await getFile(path, baseName(path)).catch(() => null);
        if (file) addTab(group, file);
      }
      const active = group.tabs[saved.active] || group.tabs[0];
      if (active) activate(active);
    }
    // Colonnes restées vides (tous leurs fichiers ont disparu) : on les retire.
    for (const g of [...state.groups]) if (!g.tabs.length) removeGroup(g);
    const target = state.groups[session.activeGroup];
    if (target?.active) activate(target.active);
    updateWelcome();
  } finally {
    restoringSession = false;
  }
}
