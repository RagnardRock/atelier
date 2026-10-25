// La boîte de dialogue du jeu : le nom de celui qui parle (dans sa couleur), son portrait, et le
// texte qui s'écrit lettre par lettre. Aussi les choix (2 à 4 réponses) et les annonces discrètes
// (« Nouvelle quête »), en haut à droite.
//
// Elle est faite en HTML, posée sur le canvas : le texte reste net à toutes les tailles d'écran,
// et le portrait garde ses pixels carrés (image-rendering: pixelated).
// Le moteur lui passe les touches (action, retour, haut, bas) : elle ne lit pas le clavier elle-même,
// pour que clavier et manette marchent pareil.

const Dialogue = (() => {
  // Lettres par seconde, selon le réglage du joueur (Saga 0.11, réglages › Vitesse du texte).
  const VITESSES = { lente: 30, normale: 55, rapide: 110, instantanee: Infinity };

  // sons(nom) : un bruitage (curseur, valider, texte), branché par le moteur sur audio.js.
  function creer(conteneur, { sons = () => {} } = {}) {
    let vitesse = VITESSES.normale;
    const boite = el('div', { className: 'dialogue', hidden: true });
    const portrait = el('img', { className: 'dialogue-portrait', alt: '' });
    const nom = el('div', { className: 'dialogue-nom' });
    const texte = el('div', { className: 'dialogue-texte' });
    const suite = el('div', { className: 'dialogue-suite', textContent: '▼' });
    const choix = el('div', { className: 'dialogue-choix', hidden: true });
    boite.append(portrait, el('div', { className: 'dialogue-corps' }, nom, texte), suite);
    const annonces = el('div', { className: 'annonces' });
    conteneur.append(boite, choix, annonces);

    let attente = null;   // { type: 'texte' | 'choix', resoudre, ... }
    let ecrit = 0, complet = '', chrono = 0;

    function montrerBoite({ nom: n = '', couleur = '', portrait: img = '' }) {
      boite.hidden = false;
      nom.textContent = n;
      nom.hidden = !n;
      nom.style.color = couleur || '';
      portrait.hidden = !img;
      if (img) portrait.src = img;
      boite.classList.toggle('avec-portrait', Boolean(img));
    }

    // Une boîte de texte. Renvoie une promesse tenue quand le joueur appuie sur Action à la fin.
    function dire(qui, ligne) {
      montrerBoite(qui);
      complet = ligne;
      ecrit = 0;
      chrono = 0;
      texte.textContent = '';
      suite.hidden = true;
      if (vitesse === Infinity) { ecrit = complet.length; texte.textContent = complet; suite.hidden = false; }
      return new Promise((resoudre) => { attente = { type: 'texte', resoudre }; });
    }

    // Les choix, à côté de la dernière boîte (qui reste affichée). Renvoie l'indice choisi.
    function choisir(options) {
      choix.innerHTML = '';
      options.forEach((o, i) => {
        const b = el('div', { className: 'dialogue-option', textContent: o });
        b.onclick = () => { if (attente?.type === 'choix') { attente.i = i; valider(); } };
        choix.append(b);
      });
      choix.hidden = false;
      suite.hidden = true;
      const a = { type: 'choix', i: 0, n: options.length };
      surligner(a);
      return new Promise((resoudre) => { a.resoudre = resoudre; attente = a; });
    }
    function surligner(a) {
      [...choix.children].forEach((b, i) => b.classList.toggle('actif', i === a.i));
    }
    function valider() {
      const a = attente;
      attente = null;
      choix.hidden = true;
      a.resoudre(a.i);
    }

    function fermer() {
      boite.hidden = true;
      choix.hidden = true;
      attente = null;
    }

    // Les touches, envoyées par le moteur. Renvoie true si la boîte les a prises.
    function touche(t) {
      if (!attente) return false;
      if (attente.type === 'texte') {
        if (t !== 'action' && t !== 'retour') return true;
        if (ecrit < complet.length) { ecrit = complet.length; texte.textContent = complet; suite.hidden = false; return true; }
        sons('valider');
        const r = attente.resoudre;
        attente = null;
        r();
        return true;
      }
      if (t === 'haut' || t === 'bas') {
        attente.i = (attente.i + (t === 'bas' ? 1 : -1) + attente.n) % attente.n;
        surligner(attente);
        sons('curseur');
      } else if (t === 'action') { sons('valider'); valider(); }
      return true;
    }

    // Chaque image : les lettres s'écrivent.
    function avancer(dt) {
      if (attente?.type !== 'texte' || ecrit >= complet.length) return;
      chrono += dt;
      const n = Math.min(complet.length, Math.floor(chrono * vitesse));
      if (n !== ecrit) {
        if (/\S/.test(complet.slice(ecrit, n))) sons('texte');
        ecrit = n;
        texte.textContent = complet.slice(0, ecrit);
        if (ecrit >= complet.length) suite.hidden = false;
      }
    }

    // Une annonce discrète en haut à droite (« Nouvelle quête », « Partie sauvegardée »).
    function annoncer(titre, detail = '') {
      const a = el('div', { className: 'annonce' }, el('div', { className: 'annonce-titre', textContent: titre }), detail ? el('div', { className: 'annonce-detail', textContent: detail }) : null);
      annonces.append(a);
      setTimeout(() => a.classList.add('partie'), 3200);
      setTimeout(() => a.remove(), 3700);
    }

    return {
      dire, choisir, fermer, touche, avancer, annoncer,
      get ouvert() { return !boite.hidden; },
      regler({ vitesseTexte } = {}) { vitesse = VITESSES[vitesseTexte] || VITESSES.normale; },
    };
  }

  return { creer };
})();
