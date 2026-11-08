// Les commandes tactiles (Saga 1.28) : une croix et des boutons par-dessus le jeu, pour jouer au doigt
// sur une tablette ou un téléphone (le jeu exporté en web), ou sur un écran tactile de PC.
//
// - La croix (à gauche) : on pose le doigt et on glisse d'une direction à l'autre, comme une manette.
// - A : Action (parler, valider). B : Retour, et Courir tant qu'on le tient (comme le B d'une manette).
// - En haut à droite : le menu du jeu (Échap, Start) et le raccourci (Tab, Select) si le jeu le veut.
// - Sur la carte du monde : un seul bouton, pour la fermer.
//
// Elles passent par le moteur comme la manette (moteur.tactile) : rien ne simule le clavier, donc les
// touches choisies par le joueur ne changent rien. Les réglages viennent du jeu (Tafl › Réglages ›
// Interface › Commandes tactiles) ou du joueur (Options) : quand les montrer, leur taille, leur opacité.
// En « automatique », elles apparaissent au premier toucher de l'écran et s'effacent dès qu'on joue au
// clavier ou à la manette.

const Tactile = (() => {
  const DEFAUT = { mode: 'auto', taille: 100, opacite: 60, carnet: true };
  let hote = null;
  let racine = null;
  let parties = {};
  let doigtVu = false; // en automatique : le joueur a touché l'écran (et n'a pas repris le clavier depuis)
  let dirAvant = null;
  let avant = '';

  const tactileProbable = () => {
    try { return window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches; } catch { return false; }
  };

  // Les réglages qui comptent : ceux du joueur s'il en a choisi, sinon ceux du jeu.
  function reglage() {
    const r = { ...DEFAUT, ...(hote?.reglageJeu?.() || {}) };
    const joueur = hote?.reglageJoueur?.() || 'jeu';
    if (['auto', 'toujours', 'jamais'].includes(joueur)) r.mode = joueur;
    if (!['auto', 'toujours', 'jamais'].includes(r.mode)) r.mode = 'auto';
    r.taille = Math.min(160, Math.max(60, Number(r.taille) || 100));
    r.opacite = Math.min(100, Math.max(20, Number(r.opacite) || 60));
    return r;
  }

  const vibrer = () => { try { navigator.vibrate?.(8); } catch { /* pas de vibreur */ } };
  const moteur = () => hote?.moteur?.();

  function bouton(classe, texte, titre) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tactile-bouton ${classe}`;
    b.textContent = texte;
    b.setAttribute('aria-label', titre);
    b.tabIndex = -1;
    return b;
  }

  // Un bouton qui agit dès qu'on le touche (pas au relâcher, comme une vraie manette).
  function presser(b, appui, relache) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch { /* rien */ }
      b.classList.add('appuye');
      vibrer();
      appui();
    });
    const fin = () => { if (!b.classList.contains('appuye')) return; b.classList.remove('appuye'); relache?.(); };
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, fin);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    sansClic(b);
  }
  // Pas de clic « souris » après le toucher : il tomberait sur ce qui vient de s'ouvrir dessous (le menu).
  function sansClic(e) {
    e.addEventListener('touchstart', (ev) => ev.preventDefault(), { passive: false });
    e.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
  }

  // La croix : la direction vient de l'angle entre le doigt et le centre ; au milieu, rien.
  function croix() {
    const c = document.createElement('div');
    c.className = 'tactile-croix';
    c.setAttribute('aria-label', 'Croix directionnelle');
    for (const d of ['haut', 'bas', 'gauche', 'droite']) {
      const f = document.createElement('span');
      f.className = `tactile-fleche ${d}`;
      f.dataset.dir = d;
      c.append(f);
    }
    let doigt = null;
    const diriger = (dir) => {
      if (dir === dirAvant) return;
      dirAvant = dir;
      for (const f of c.children) f.classList.toggle('appuye', f.dataset.dir === dir);
      if (dir) vibrer();
      moteur()?.tactile?.diriger(dir);
    };
    const lire = (e) => {
      const r = c.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.12) return null;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'droite' : 'gauche') : (dy > 0 ? 'bas' : 'haut');
    };
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      doigt = e.pointerId;
      try { c.setPointerCapture(e.pointerId); } catch { /* rien */ }
      diriger(lire(e));
    });
    c.addEventListener('pointermove', (e) => { if (e.pointerId === doigt) diriger(lire(e)); });
    const fin = (e) => { if (e.pointerId !== doigt) return; doigt = null; diriger(null); };
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) c.addEventListener(t, fin);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    sansClic(c);
    c.lacher = () => { doigt = null; diriger(null); };
    return c;
  }

  function construire(parent) {
    racine = document.createElement('div');
    racine.id = 'tactile';
    racine.hidden = true;
    const a = bouton('tactile-a', 'A', 'Action');
    const b = bouton('tactile-b', 'B', 'Retour (tenir : courir)');
    const menu = bouton('tactile-menu', '☰', 'Menu du jeu');
    const carnet = bouton('tactile-carnet', '▤', 'Raccourci');
    const fermer = bouton('tactile-fermer', '✕', 'Fermer la carte');
    const c = croix();
    presser(a, () => moteur()?.tactile?.appuyer('action'));
    presser(b, () => { moteur()?.tactile?.appuyer('retour'); moteur()?.tactile?.courir(true); }, () => moteur()?.tactile?.courir(false));
    presser(menu, () => hote.menu?.());
    presser(carnet, () => hote.carnet?.());
    presser(fermer, () => hote.fermerCarte?.());
    const boutons = document.createElement('div');
    boutons.className = 'tactile-boutons';
    boutons.append(b, a);
    const haut = document.createElement('div');
    haut.className = 'tactile-haut';
    haut.append(carnet, menu, fermer);
    racine.append(c, boutons, haut);
    parties = { croix: c, a, b, menu, carnet, fermer };
    parent.append(racine);
  }

  // À chaque image : faut-il les montrer, et lesquelles ?
  function tour() {
    requestAnimationFrame(tour);
    if (!racine || !hote) return;
    const r = reglage();
    const etat = hote.etat?.() || 'cache'; // cache, libre, script, combat, carte
    const voulu = r.mode === 'toujours' || (r.mode === 'auto' && doigtVu);
    const montre = voulu && etat !== 'cache';
    const cle = `${montre}|${etat}|${r.taille}|${r.opacite}|${r.carnet}`;
    if (cle === avant) return;
    avant = cle;
    if (!montre || etat === 'carte') parties.croix.lacher?.();
    racine.hidden = !montre;
    racine.dataset.etat = etat;
    document.body.style.setProperty('--tactile-taille', String(r.taille / 100));
    document.body.style.setProperty('--tactile-opacite', String(r.opacite / 100));
    const carte = etat === 'carte';
    parties.croix.hidden = carte;
    parties.a.hidden = carte;
    parties.b.hidden = carte;
    parties.fermer.hidden = !carte;
    parties.menu.hidden = carte || etat !== 'libre';
    parties.carnet.hidden = carte || etat !== 'libre' || !r.carnet;
    document.body.classList.toggle('tactile', montre);
  }

  // En automatique : le doigt les fait venir, le clavier et la manette les renvoient.
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') doigtVu = true; }, { capture: true, passive: true });
  window.addEventListener('keydown', (e) => { if (e.isTrusted && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) doigtVu = false; }, { capture: true, passive: true });
  window.addEventListener('gamepadconnected', () => { doigtVu = false; });
  if (tactileProbable()) doigtVu = true;

  return {
    // o : { parent, moteur(), etat(), menu(), carnet(), fermerCarte(), reglageJeu(), reglageJoueur() }
    demarrer(o) {
      hote = o;
      construire(o.parent);
      requestAnimationFrame(tour);
    },
    get visibles() { return Boolean(racine && !racine.hidden); },
    DEFAUT,
  };
})();
