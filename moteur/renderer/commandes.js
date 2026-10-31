// Réglages › Commandes (Saga 0.11) : les touches du clavier et les boutons de la manette, que le joueur
// change à sa main. Une ligne par commande (haut, bas… pause, carnet) : ses touches en pastilles
// (un clic retire la pastille), « + » attend la touche à ajouter. Même chose pour la manette.
//
// On garde la position physique des touches (event.code). Le nom affiché est celui du clavier du
// joueur quand Chromium le connaît (Z sur un clavier AZERTY pour « KeyW »).

const Commandes = (() => {
  const NOMS = {
    haut: 'Haut', bas: 'Bas', gauche: 'Gauche', droite: 'Droite',
    action: 'Action (parler, valider)', retour: 'Retour', courir: 'Courir (tenir)', pause: 'Pause', carnet: 'Carnet',
  };
  // Les boutons d'une manette « standard » (Xbox ; PlayStation : A = ✕, B = ○, X = □, Y = △).
  const BOUTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3', 'Haut', 'Bas', 'Gauche', 'Droite', 'Home'];
  const SPECIALES = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Espace', Enter: 'Entrée', NumpadEnter: 'Entrée (pavé)',
    Backspace: 'Retour arrière', Escape: 'Échap', Tab: 'Tab', ShiftLeft: 'Maj gauche', ShiftRight: 'Maj droite',
    ControlLeft: 'Ctrl gauche', ControlRight: 'Ctrl droite', AltLeft: 'Alt', AltRight: 'Alt Gr', CapsLock: 'Verr. Maj',
  };
  let disposition = null;
  navigator.keyboard?.getLayoutMap?.().then((m) => { disposition = m; }).catch(() => {});
  function nomTouche(code) {
    if (SPECIALES[code]) return SPECIALES[code];
    const k = disposition?.get(code);
    if (k) return k.length === 1 ? k.toUpperCase() : k;
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Pavé ');
  }
  const nomBouton = (i) => BOUTONS[i] || `Bouton ${i}`;

  // Un bouton de manette appuyé (le premier trouvé), ou -1.
  function boutonAppuye() {
    for (const p of navigator.getGamepads?.() || []) {
      if (!p) continue;
      const i = p.buttons.findIndex((b) => b.pressed);
      if (i >= 0) return i;
    }
    return -1;
  }

  // touches, manette : les réglages du joueur (null = ceux par défaut). Rend { element, valeurs() }.
  function editeur(touches, manette) {
    const copie = (o, def) => Object.fromEntries(Object.keys(def).map((k) => [k, [...(Array.isArray(o?.[k]) ? o[k] : def[k])]]));
    let t = copie(touches, Moteur.TOUCHES_DEFAUT), m = copie(manette, Moteur.MANETTE_DEFAUT);
    let ecoute = null; // { sorte: 'touche' | 'bouton', commande, bouton } : on attend une touche
    const table = el('div', { className: 'commandes' });
    const element = el('div', { className: 'commandes-bloc' },
      el('div', { className: 'commandes-tete' }, el('span', { textContent: 'Commande' }), el('span', { textContent: 'Clavier' }), el('span', { textContent: 'Manette' })),
      table,
      el('div', { className: 'commandes-pied' },
        el('span', { className: 'discret', textContent: 'Clic sur une pastille : la retirer. La croix et le stick gauche de la manette déplacent toujours.' }),
        el('button', { type: 'button', className: 'button small', textContent: 'Par défaut', onclick: () => { t = copie(null, Moteur.TOUCHES_DEFAUT); m = copie(null, Moteur.MANETTE_DEFAUT); arreter(); dessiner(); } })));

    const pastille = (texte, retirer) => el('button', { type: 'button', className: 'pastille', textContent: texte, title: 'Retirer', onclick: retirer });
    function dessiner() {
      table.innerHTML = '';
      for (const c of Moteur.COMMANDES) {
        const clavier = el('div', { className: 'commandes-cases' },
          ...t[c].map((code) => pastille(nomTouche(code), () => { t[c] = t[c].filter((x) => x !== code); dessiner(); })),
          el('button', { type: 'button', className: `pastille plus${ecoute?.sorte === 'touche' && ecoute.commande === c ? ' ecoute' : ''}`, textContent: ecoute?.sorte === 'touche' && ecoute.commande === c ? 'Appuie…' : '+', title: 'Ajouter une touche', onclick: () => ecouter('touche', c) }));
        const pad = m[c]
          ? el('div', { className: 'commandes-cases' },
            ...m[c].map((b) => pastille(nomBouton(b), () => { m[c] = m[c].filter((x) => x !== b); dessiner(); })),
            el('button', { type: 'button', className: `pastille plus${ecoute?.sorte === 'bouton' && ecoute.commande === c ? ' ecoute' : ''}`, textContent: ecoute?.sorte === 'bouton' && ecoute.commande === c ? 'Appuie…' : '+', title: 'Ajouter un bouton (appuie-le sur la manette)', onclick: () => ecouter('bouton', c) }))
          : el('div', { className: 'commandes-cases discret', textContent: 'Croix, stick' });
        table.append(el('div', { className: 'commandes-ligne' }, el('span', { className: 'commandes-nom', textContent: NOMS[c] }), clavier, pad));
      }
    }

    // Attendre la touche (au clavier) ou le bouton (à la manette) à ajouter.
    function onKey(e) {
      if (!ecoute || ecoute.sorte !== 'touche') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const c = ecoute.commande;
      if (!t[c].includes(e.code)) t[c].push(e.code);
      arreter();
      dessiner();
    }
    let minuterie = 0;
    function ecouter(sorte, commande) {
      arreter();
      ecoute = { sorte, commande };
      if (sorte === 'touche') window.addEventListener('keydown', onKey, true);
      else {
        // Le bouton qui a servi à cliquer « + » (A, à la manette) est d'abord relâché.
        let pret = boutonAppuye() < 0;
        minuterie = setInterval(() => {
          const b = boutonAppuye();
          if (!pret) { pret = b < 0; return; }
          if (b < 0) return;
          if (!m[commande].includes(b)) m[commande].push(b);
          arreter();
          dessiner();
          Pad.ignorer(b); // ce bouton ne doit pas aussi valider la fenêtre
        }, 30);
      }
      dessiner();
    }
    function arreter() {
      ecoute = null;
      window.removeEventListener('keydown', onKey, true);
      clearInterval(minuterie);
    }
    dessiner();
    return {
      element,
      get ecoute() { return Boolean(ecoute); },
      arreter,
      valeurs() {
        arreter();
        // Une commande sans aucune touche : on lui rend celles par défaut (sinon on ne pourrait plus bouger).
        for (const c of Object.keys(t)) if (!t[c].length && !(m[c]?.length)) t[c] = [...Moteur.TOUCHES_DEFAUT[c]];
        return { touches: t, manette: m };
      },
    };
  }

  return { editeur, nomTouche, nomBouton };
})();
