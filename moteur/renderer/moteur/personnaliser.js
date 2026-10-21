// L'écran « personnaliser » (Saga 0.5, commande personnaliser de Tafl 0.16) : le joueur tape son nom
// et/ou choisit la tenue du héros. En HTML posé sur le jeu, comme la boîte de dialogue, et il suit le
// thème du jeu (verre ou pixel).
//
// ouvrir({ nom, tenues, tenue, demanderNom, demanderTenue }) rend une promesse { nom, tenue } quand le
// joueur valide. tenues : [{ id, nom, sprite }], la tenue de base ayant l'id ''. Au clavier : on tape le
// nom, Entrée valide ; haut/bas (et gauche/droite hors du champ) changent de tenue. La souris marche aussi.

const Personnaliser = (() => {
  const NOM_MAX = 12;

  function creer(conteneur) {
    const racine = el('div', { className: 'perso-ecran', hidden: true });
    conteneur.append(racine);
    let ouvert = null; // { resoudre, … } quand l'écran est là
    let boucle = 0;

    // Les touches : en phase de capture, pour que le moteur (et la pause) ne les voient pas.
    window.addEventListener('keydown', (e) => {
      if (!ouvert) return;
      if (e.key === 'Enter' || e.key === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); ouvert.valider(); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return; }
      const champ = e.target.closest?.('input');
      // Gauche/droite hors du champ du nom, haut/bas partout : changer de tenue.
      const fleche = { ArrowUp: -1, ArrowDown: 1, ...(champ ? {} : { ArrowLeft: -1, ArrowRight: 1 }) }[e.key];
      if (fleche && ouvert.changerTenue) {
        e.preventDefault(); e.stopImmediatePropagation();
        ouvert.changerTenue(fleche);
        return;
      }
      if (!champ) e.stopImmediatePropagation();
    }, true);

    function ouvrir({ nom = '', tenues = [], tenue = '', demanderNom = true, demanderTenue = false } = {}) {
      return new Promise((resoudre) => {
        const choix = { nom, tenue: tenues.some((t) => t.id === tenue) ? tenue : (tenues[0]?.id ?? '') };
        const carte = el('div', { className: 'perso-carte' });
        carte.append(el('div', { className: 'perso-titre', textContent: demanderNom && demanderTenue ? 'Qui es-tu ?' : demanderNom ? 'Comment t\'appelles-tu ?' : 'Quelle tenue ?' }));

        // L'aperçu : le héros qui marche vers nous, dans la tenue choisie.
        const apercu = el('canvas', { className: 'perso-apercu', width: 48, height: 72 });
        const ctx = apercu.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const sprite = () => tenues.find((t) => t.id === choix.tenue)?.sprite || tenues[0]?.sprite || null;

        let entree = null;
        if (demanderNom) {
          entree = el('input', { className: 'perso-nom', type: 'text', maxLength: NOM_MAX, value: nom, spellcheck: false, autocomplete: 'off' });
          entree.addEventListener('input', () => { choix.nom = entree.value; });
          carte.append(el('label', { className: 'perso-label', textContent: 'Ton nom' }), entree);
        }
        let nomTenue = null;
        if (demanderTenue && tenues.length > 1) {
          nomTenue = el('span', { className: 'perso-tenue-nom' });
          const fleche = (d, txt) => el('button', { className: 'perso-fleche', type: 'button', textContent: txt, onclick: () => ouvert.changerTenue(d) });
          carte.append(el('label', { className: 'perso-label', textContent: 'Ta tenue' }),
            el('div', { className: 'perso-tenue' }, fleche(-1, '◀'), apercu, fleche(1, '▶')), nomTenue);
        } else carte.insertBefore(apercu, carte.children[1]);
        const erreur = el('div', { className: 'perso-erreur' });
        const ok = el('button', { className: 'perso-ok', type: 'button', textContent: 'C\'est moi !', onclick: () => ouvert.valider() });
        carte.append(erreur, ok, el('div', { className: 'perso-aide', textContent: demanderTenue && tenues.length > 1 ? 'Haut/bas ou ◀ ▶ : changer de tenue · Entrée : valider' : 'Entrée : valider' }));
        racine.replaceChildren(carte);
        racine.hidden = false;

        const majTenue = () => { if (nomTenue) nomTenue.textContent = tenues.find((t) => t.id === choix.tenue)?.nom || 'Tenue de base'; };
        majTenue();
        const t0 = performance.now();
        const dessiner = (maintenant) => {
          boucle = requestAnimationFrame(dessiner);
          ctx.clearRect(0, 0, apercu.width, apercu.height);
          const pas = Math.floor((maintenant - t0) / 260);
          const s = sprite();
          // 16 px de case, dessinée 2 fois plus grande ; les pieds en bas du canvas.
          ctx.save();
          ctx.scale(2, 2);
          if (s) Sprites.dessinerSprite(ctx, s, 'bas', pas % 2 ? pas : 0, 4, 18, 16);
          else Sprites.dessiner(ctx, '#d94a4a', 'bas', pas % 2 ? 1 + (pas >> 1) % 2 : 0, 4, 18, 16);
          ctx.restore();
        };
        boucle = requestAnimationFrame(dessiner);

        ouvert = {
          changerTenue: demanderTenue && tenues.length > 1 ? (d) => {
            const i = tenues.findIndex((t) => t.id === choix.tenue);
            choix.tenue = tenues[(i + d + tenues.length) % tenues.length].id;
            majTenue();
          } : null,
          valider() {
            const propre = String(choix.nom || '').trim().slice(0, NOM_MAX);
            if (demanderNom && !propre) { erreur.textContent = 'Il faut un nom !'; entree?.focus(); return; }
            cancelAnimationFrame(boucle);
            racine.hidden = true;
            ouvert = null;
            resoudre({ nom: demanderNom ? propre : nom, tenue: choix.tenue });
          },
        };
        if (entree) setTimeout(() => { entree.focus(); entree.select(); }, 0);
      });
    }
    function fermer() {
      cancelAnimationFrame(boucle);
      racine.hidden = true;
      ouvert = null;
    }
    return { ouvrir, fermer, get ouvert() { return Boolean(ouvert); } };
  }

  return { creer };
})();
