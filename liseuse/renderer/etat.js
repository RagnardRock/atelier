// Ce que tous les modules de l'interface partagent : les réglages (config.json, lus et écrits par
// main.js) et l'endroit où ils sont rangés.

export const etat = {
  config: null,
  configPath: '',
  dossierDonnees: '',
};

// main.js renvoie les réglages complets. Des réglages de lecture pas encore écrits (voir plus bas)
// partent avec, et ne sont pas écrasés par la réponse : sinon un thème choisi juste avant
// reviendrait à l'ancien.
export async function ecrireConfig(changes) {
  if (delai) { clearTimeout(delai); delai = null; changes = { lecture: etat.config.lecture, ...changes }; }
  const config = await window.kenning.writeConfig(changes);
  if (delai) config.lecture = etat.config.lecture;
  etat.config = config;
  return etat.config;
}

// Les réglages de lecture se modifient souvent (un curseur qu'on fait glisser) : on attend que ça se
// calme avant d'écrire sur le disque.
let delai = null;
export function ecrireLecturePlusTard() {
  clearTimeout(delai);
  delai = setTimeout(() => { delai = null; ecrireConfig({ lecture: etat.config.lecture }).catch(() => {}); }, 500);
}
