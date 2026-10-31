// La manette dans l'interface autour du jeu (Saga 0.11) : le menu de pause, le carnet, les réglages, les
// questions (« Continuer la partie ? ») et l'accueil. Dans le jeu lui-même, c'est le moteur qui lit la
// manette ; ici, on la lit seulement quand une de ces fenêtres est ouverte.
//
// La croix (ou le stick) passe d'un bouton à l'autre ; à gauche et à droite, elle règle un curseur ou une
// liste. A appuie sur le bouton choisi, B ferme. Start ouvre et ferme la pause, Select le carnet.

const Pad = (() => {
  const FOCUSABLES = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
  let reglages = { cibles: () => [], start: () => {}, select: () => {}, actions: () => {}, boutons: () => ({}) };
  let avant = { dir: null, a: false, b: false, start: false, select: false, y: false };
  let prochain = 0; // quand la direction tenue se répète
  const ignores = new Set(); // des boutons à ignorer jusqu'à ce qu'ils soient relâchés

  const visible = (e) => e.offsetParent !== null && !e.disabled && !e.closest('[hidden]');
  function choisir(e) {
    for (const x of document.querySelectorAll('.pad-focus')) x.classList.remove('pad-focus');
    if (!e) return;
    e.focus({ preventScroll: false });
    e.classList.add('pad-focus');
    e.scrollIntoView?.({ block: 'nearest' });
  }
  function deplacer(racine, sens) {
    const liste = [...racine.querySelectorAll(FOCUSABLES)].filter(visible);
    if (!liste.length) return;
    const i = liste.indexOf(document.activeElement);
    choisir(liste[i < 0 ? 0 : (i + sens + liste.length) % liste.length]);
  }
  // Gauche, droite : régler un curseur ou une liste ; sinon, passer au bouton d'à côté.
  function regler(racine, sens) {
    const e = document.activeElement;
    if (racine.contains(e) && e.matches('input[type=range]')) {
      const pas = Number(e.step) || 1;
      e.value = Math.min(Number(e.max), Math.max(Number(e.min), Number(e.value) + sens * pas * (Number(e.max) - Number(e.min) > 40 ? 5 : 1)));
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
      choisir(e);
      return;
    }
    if (racine.contains(e) && e.matches('select')) {
      e.selectedIndex = Math.min(e.options.length - 1, Math.max(0, e.selectedIndex + sens));
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    deplacer(racine, sens);
  }
  function appuyer(racine) {
    let e = document.activeElement;
    if (!racine.contains(e) || !visible(e)) { deplacer(racine, 0); e = document.activeElement; }
    if (!racine.contains(e)) return;
    if (e.matches('select')) { regler(racine, 1); return; }
    if (e.matches('input[type=range], input[type=number], input[type=text], textarea')) return;
    e.click();
  }

  function tour() {
    requestAnimationFrame(tour);
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (!pad) return;
    const b = reglages.boutons();
    const presse = (liste, def) => (Array.isArray(liste) ? liste : def).some((i) => pad.buttons[i]?.pressed && !ignores.has(i));
    for (const i of [...ignores]) if (!pad.buttons[i]?.pressed) ignores.delete(i);
    const [ax, ay] = [pad.axes[0] || 0, pad.axes[1] || 0];
    const dir = pad.buttons[12]?.pressed || ay < -0.5 ? 'haut' : pad.buttons[13]?.pressed || ay > 0.5 ? 'bas'
      : pad.buttons[14]?.pressed || ax < -0.5 ? 'gauche' : pad.buttons[15]?.pressed || ax > 0.5 ? 'droite' : null;
    const etat = { dir, a: presse(b.action, [0]), b: presse(b.retour, [1]), start: presse(b.pause, [9]), select: presse(b.carnet, [8]), y: presse(b.actions, [3]) };
    const prec = avant;
    const nouveau = (k) => etat[k] && !prec[k];
    const maintenant = performance.now();
    let pas = null;
    if (dir && dir !== avant.dir) { pas = dir; prochain = maintenant + 380; }
    else if (dir && maintenant >= prochain) { pas = dir; prochain = maintenant + 110; }
    avant = etat;
    // On attend une touche dans Réglages › Commandes : la manette sert à ça, pas à naviguer.
    if (document.querySelector('.pastille.ecoute')) return;
    if (nouveau('start')) { reglages.start(); return; }
    if (nouveau('select')) { reglages.select(); return; }
    if (nouveau('y')) { reglages.actions(); return; } // Saga 1.6.1 : les actions du jeu (Y)
    const c = reglages.cibles().find((x) => x && x.racine && visible(x.racine));
    if (!c) return;
    if (!c.racine.contains(document.activeElement) && (pas || etat.a)) { deplacer(c.racine, 0); if (!etat.a) return; }
    if (pas === 'haut' || pas === 'bas') deplacer(c.racine, pas === 'bas' ? 1 : -1);
    else if (pas) regler(c.racine, pas === 'droite' ? 1 : -1);
    if (nouveau('a')) appuyer(c.racine);
    else if (nouveau('b')) c.fermer?.();
  }
  // La souris reprend la main : plus de cadre de manette.
  window.addEventListener('pointermove', () => { for (const x of document.querySelectorAll('.pad-focus')) x.classList.remove('pad-focus'); });

  return {
    // cibles() : les fenêtres ouvertes, de la plus haute à la plus basse : [{ racine, fermer }].
    demarrer(o) { reglages = { ...reglages, ...o }; requestAnimationFrame(tour); },
    ignorer(i) { ignores.add(i); },
  };
})();
