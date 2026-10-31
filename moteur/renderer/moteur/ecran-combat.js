// L'écran des combats (Saga 0.3) : en HTML posé sur le jeu, comme la boîte de dialogue, pour que
// les textes restent nets et que les sprites des créatures gardent leurs pixels carrés.
//
// combat.js lui demande tout avec des promesses : un message (attendu jusqu'à la touche Action),
// le menu (Attaque, Sac, Équipe, Fuite), une attaque, une créature dans une liste, une animation.
// Le moteur lui passe les touches (action, retour, haut, bas, gauche, droite) : clavier et manette
// marchent pareil, et la souris aussi (clic droit = retour). Retour : Retour arrière, X, Échap, B.

const EcranCombat = (() => {
  const VITESSE = 70; // lettres par seconde
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

  function creer(conteneur) {
    const racine = el('div', { className: 'combat', hidden: true });
    const scene = el('div', { className: 'combat-scene' });
    const cotes = {};
    for (const cote of ['adversaire', 'joueur']) {
      const nom = el('span', { className: 'combat-nom' });
      const niveau = el('span', { className: 'combat-niveau' });
      const statut = el('span', { className: 'combat-statut', hidden: true });
      const typesEl = el('div', { className: 'combat-types' });
      // Saga 1.3 : les pastilles d'état (étages de statistiques, confusion, objet tenu).
      const etatsEl = el('div', { className: 'combat-etats' });
      const barre = el('div', { className: 'combat-pv-barre' });
      const pvTexte = el('div', { className: 'combat-pv-texte' });
      const xp = el('div', { className: 'combat-xp-barre' });
      const carte = el('div', { className: 'combat-carte' },
        el('div', { className: 'combat-ligne' }, nom, statut, niveau),
        el('div', { className: 'combat-pv' }, el('span', { className: 'combat-pv-label', textContent: 'PV' }), el('div', { className: 'combat-pv-fond' }, barre)),
        cote === 'joueur' ? pvTexte : typesEl,
        cote === 'joueur' ? el('div', { className: 'combat-xp' }, xp) : null);
      const sprite = el('img', { className: 'combat-sprite', alt: '' });
      const vide = el('div', { className: 'combat-sprite combat-sprite-vide' });
      const balle = el('div', { className: 'combat-balle', hidden: true });
      const place = el('div', { className: 'combat-place' }, el('div', { className: 'combat-sol' }), sprite, vide, balle, etatsEl);
      const bloc = el('div', { className: `combat-cote ${cote}` }, carte, place);
      scene.append(bloc);
      cotes[cote] = { nom, niveau, statut, typesEl, etatsEl, barre, pvTexte, xp, carte, sprite, vide, balle, place, bloc, pv: 0, pvMax: 1 };
    }
    const badge = el('div', { className: 'combat-dresseur', hidden: true });
    scene.append(badge);
    const texte = el('div', { className: 'combat-texte' });
    const suite = el('div', { className: 'combat-suite', textContent: '▼', hidden: true });
    const menu = el('div', { className: 'combat-menu', hidden: true });
    const bas = el('div', { className: 'combat-bas' }, el('div', { className: 'combat-boite' }, texte, suite), menu);
    const liste = el('div', { className: 'combat-liste', hidden: true });
    const flash = el('div', { className: 'combat-flash' });
    // Le journal du combat (Saga 1.2) : tout ce qui a été dit, pour relire ce qu'on a raté.
    const journalLignes = el('div', { className: 'combat-journal-lignes' });
    const journal = el('div', { className: 'combat-journal', hidden: true },
      el('div', { className: 'combat-journal-tete' }, el('b', { textContent: 'Journal du combat' }), el('span', { textContent: 'J : fermer' })),
      journalLignes);
    const boutonJournal = el('button', { className: 'combat-journal-bouton', type: 'button', title: 'Journal du combat (J)' },
      el('i', { className: 'codicon codicon-list-unordered' }));
    boutonJournal.onclick = () => basculerJournal();
    // J ouvre et ferme le journal (et Échap le ferme), sans que la touche aille au combat.
    window.addEventListener('keydown', (e) => {
      if (racine.hidden) return;
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); e.stopImmediatePropagation(); basculerJournal(); }
      else if (e.key === 'Escape' && !journal.hidden) { e.preventDefault(); e.stopImmediatePropagation(); basculerJournal(false); }
    }, true);
    racine.append(scene, bas, liste, journal, boutonJournal, flash);
    // Clic droit : comme la touche Retour (revenir en arrière dans les menus).
    racine.addEventListener('contextmenu', (e) => { e.preventDefault(); touche('retour'); });
    conteneur.append(racine);

    let attente = null; // ce que le joueur doit faire : { type, … }
    let complet = '', ecrit = 0, chrono = 0;

    // --- Les créatures ---
    function creature(cote, e) {
      const c = cotes[cote];
      c.nom.textContent = e.nom;
      c.niveau.textContent = `N.${e.niveau}`;
      c.nom.dataset.sexe = e.sexe || '';
      c.statut.hidden = !e.statut;
      c.statut.textContent = e.statut;
      c.statut.className = `combat-statut statut-${e.statut.toLowerCase()}`;
      c.typesEl.replaceChildren(...(e.types || []).map((t) => el('span', { className: 'combat-type', textContent: t.nom, style: `background: ${t.couleur}` })));
      if (e.image) { c.sprite.src = e.image; c.sprite.hidden = false; c.vide.hidden = true; }
      else { c.sprite.hidden = true; c.vide.hidden = false; c.vide.textContent = (e.nom || '?')[0]; }
      c.sprite.classList.toggle('chromatique', Boolean(e.chromatique));
      barrePv(cote, e.pv, e.pvMax);
      if (cote === 'joueur') c.xp.style.width = `${Math.round(e.xp * 100)}%`;
    }
    // Ce qui est en cours sur une créature, en pastilles : « Atq +2 », « Confus », « Restes ».
    function etats(cote, liste) {
      const c = cotes[cote];
      if (!c) return;
      c.etatsEl.replaceChildren(...(liste || []).map((x) => el('span', {
        className: `combat-etat${x.sens > 0 ? ' monte' : x.sens < 0 ? ' baisse' : ''}`, textContent: x.texte, title: x.detail || x.texte,
      })));
    }
    function barrePv(cote, pv, max) {
      const c = cotes[cote];
      c.pv = pv;
      c.pvMax = max;
      const k = Math.max(0, Math.min(1, pv / Math.max(1, max)));
      c.barre.style.width = `${k * 100}%`;
      c.barre.dataset.niveau = k > 0.5 ? 'haut' : k > 0.2 ? 'moyen' : 'bas';
      c.pvTexte.textContent = `${pv} / ${max}`;
    }
    // Les PV glissent vers leur nouvelle valeur (et les chiffres suivent).
    async function pv(cote, nouveau, max) {
      const c = cotes[cote];
      const depart = c.pv, duree = Math.min(900, 250 + Math.abs(nouveau - depart) * 12);
      const t0 = performance.now();
      for (;;) {
        const k = Math.min(1, (performance.now() - t0) / duree);
        barrePv(cote, Math.round(depart + (nouveau - depart) * k), max);
        if (k >= 1) break;
        await new Promise(requestAnimationFrame);
      }
      await attendre(120);
    }
    // L'expérience : la barre se remplit (une fois par niveau gagné), puis repart.
    async function xp(ratio, niveaux) {
      const b = cotes.joueur.xp;
      for (let i = 0; i < niveaux; i++) {
        b.style.width = '100%';
        await attendre(420);
        b.style.transition = 'none';
        b.style.width = '0%';
        void b.offsetWidth;
        b.style.transition = '';
      }
      b.style.width = `${Math.round(ratio * 100)}%`;
      await attendre(450);
    }

    // --- Les animations (Web Animations : on attend leur fin) ---
    const ANIMS = {
      sortie: (c) => [c.place, [{ transform: 'none', opacity: 1 }, { transform: 'scale(0.2)', opacity: 0 }], 320],
      touche: (c) => [c.sprite.hidden ? c.vide : c.sprite, [{ opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }], 380],
      ko: (c) => [c.place, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(45%)', opacity: 0 }], 480],
      monte: (c) => [c.sprite.hidden ? c.vide : c.sprite, [{ filter: 'none' }, { filter: 'drop-shadow(0 0 14px #ff9d4a) brightness(1.3)' }, { filter: 'none' }], 520],
      baisse: (c) => [c.sprite.hidden ? c.vide : c.sprite, [{ filter: 'none' }, { filter: 'drop-shadow(0 0 14px #4aa8ff) brightness(0.8)' }, { filter: 'none' }], 520],
      evolution: (c) => [c.sprite.hidden ? c.vide : c.sprite, [{ filter: 'brightness(1)' }, { filter: 'brightness(8)' }, { filter: 'brightness(1)' }, { filter: 'brightness(8)' }, { filter: 'brightness(8)' }, { filter: 'brightness(1)' }], 1800],
    };
    // Faire apparaître une créature (et sa carte). Celle de l'adversaire glisse depuis la droite ;
    // celle du joueur sort d'une balle lancée depuis la gauche, dans un éclair blanc.
    async function entree(c, cote, cible) {
      for (const e of [c.place, c.sprite, c.vide, c.carte]) e.getAnimations().forEach((x) => x.cancel());
      if (cote === 'joueur') {
        c.place.style.opacity = '';
        cible.style.opacity = '0';
        c.balle.hidden = false;
        await c.balle.animate([
          { transform: 'translate(-260%, -160%) rotate(-360deg) scale(0.7)', opacity: 0 },
          { transform: 'translate(-60%, -120%) rotate(-120deg)', opacity: 1, offset: 0.5 },
          { transform: 'none', opacity: 1 },
        ], { duration: 520, easing: 'ease-in' }).finished;
        c.balle.hidden = true;
        cible.style.opacity = '';
        await cible.animate([
          { transform: 'scale(0.1)', transformOrigin: '50% 100%', opacity: 0, filter: 'brightness(6)' },
          { transform: 'scale(1.08)', transformOrigin: '50% 100%', opacity: 1, filter: 'brightness(3)', offset: 0.6 },
          { transform: 'none', transformOrigin: '50% 100%', opacity: 1, filter: 'none' },
        ], { duration: 460, easing: 'ease-out' }).finished;
      } else {
        c.place.style.opacity = '';
        await c.place.animate([{ transform: 'translateX(70%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' }).finished;
      }
      c.carte.style.opacity = '';
      await c.carte.animate([{ transform: `translateX(${cote === 'joueur' ? '24px' : '-24px'})`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' }).finished;
    }
    async function animer(cote, nom) {
      const c = cotes[cote];
      const cible = c.sprite.hidden ? c.vide : c.sprite;
      if (nom === 'entree') { await entree(c, cote, cible); return; }
      if (nom === 'capture') {
        c.balle.hidden = false;
        await Promise.all([
          c.balle.animate([{ transform: 'translate(-180%, 120%) scale(0.6)', opacity: 0 }, { transform: 'translate(0, -40%)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'ease-out' }).finished,
          cible.animate([{ transform: 'none', opacity: 1, filter: 'none' }, { transform: 'scale(0.1)', opacity: 0, filter: 'brightness(5)' }], { duration: 520, delay: 300, fill: 'forwards' }).finished,
        ]);
        return;
      }
      if (nom === 'secoue') {
        await c.balle.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-24deg)' }, { transform: 'rotate(18deg)' }, { transform: 'rotate(0)' }], { duration: 520 }).finished;
        await attendre(350);
        return;
      }
      if (nom === 'attrape') {
        await c.balle.animate([{ filter: 'none' }, { filter: 'brightness(0.55)' }], { duration: 300, fill: 'forwards' }).finished;
        return;
      }
      if (nom === 'sort') {
        c.balle.hidden = true;
        cible.getAnimations().forEach((a) => a.cancel());
        await cible.animate([{ transform: 'scale(0.1)', opacity: 0, filter: 'brightness(5)' }, { transform: 'none', opacity: 1, filter: 'none' }], { duration: 380 }).finished;
        return;
      }
      const a = ANIMS[nom];
      if (!a) return;
      const [elmt, images, duree] = a(c, cote);
      const anim = elmt.animate(images, { duration: duree, easing: 'ease-out', fill: nom === 'ko' || nom === 'sortie' ? 'forwards' : 'none' });
      await anim.finished;
      // Une créature partie ou K.O. emporte sa carte : la suivante la ramènera en entrant.
      if (nom === 'ko' || nom === 'sortie') {
        await c.carte.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).finished;
        c.carte.style.opacity = '0';
      }
    }

    // L'évolution (Saga 0.7) : la créature clignote de blanc de plus en plus vite, puis devient
    // `image`. Retour (B, Échap, X, clic droit) pendant l'animation l'arrête. Rend true si elle a évolué.
    async function evolution(cote, image) {
      const c = cotes[cote];
      const cible = c.sprite.hidden ? c.vide : c.sprite;
      complet = 'Retour (B, Échap) : l\'arrêter';
      ecrit = complet.length;
      texte.textContent = complet;
      suite.hidden = true;
      const anim = cible.animate([
        { filter: 'brightness(1)' }, { filter: 'brightness(8)', offset: 0.12 }, { filter: 'brightness(1)', offset: 0.24 },
        { filter: 'brightness(8)', offset: 0.36 }, { filter: 'brightness(1)', offset: 0.46 }, { filter: 'brightness(8)', offset: 0.55 },
        { filter: 'brightness(1)', offset: 0.62 }, { filter: 'brightness(8)', offset: 0.68 }, { filter: 'brightness(8)' },
      ], { duration: 3200, easing: 'ease-in', fill: 'forwards' });
      const arretee = await new Promise((resoudre) => {
        const a = { type: 'evolution', resoudre: (v) => { if (attente === a) attente = null; resoudre(v); } };
        attente = a;
        anim.finished.then(() => a.resoudre(false), () => a.resoudre(true));
      });
      if (arretee) { anim.cancel(); return false; }
      if (image) { c.sprite.src = image; c.sprite.hidden = false; c.vide.hidden = true; }
      anim.cancel();
      await cible.animate([{ filter: 'brightness(8)' }, { filter: 'brightness(1)' }], { duration: 500, easing: 'ease-out' }).finished;
      return true;
    }

    // --- Le journal (Saga 1.2) ---
    function noter(ligne) {
      if (!ligne || journalLignes.lastChild?.textContent === ligne) return;
      journalLignes.append(el('p', { className: 'combat-journal-ligne', textContent: ligne }));
      while (journalLignes.children.length > 200) journalLignes.firstChild.remove();
      journalLignes.scrollTop = journalLignes.scrollHeight;
    }
    function basculerJournal(ouvrir = journal.hidden) {
      journal.hidden = !ouvrir;
      if (ouvrir) journalLignes.scrollTop = journalLignes.scrollHeight;
    }

    // --- Les messages ---
    // o peut arriver à null (les appels renvoyés par le réseau en duel) : pas de décomposition directe.
    function message(t, o) {
      const { qui = '', discret = false } = o || {};
      menu.hidden = true;
      complet = qui ? `${qui} : « ${t} »` : String(t);
      ecrit = 0;
      chrono = 0;
      texte.textContent = '';
      suite.hidden = true;
      if (!discret) noter(complet); // « Au tour de… » n'encombre pas le journal
      return new Promise((resoudre) => { attente = { type: 'texte', resoudre }; });
    }
    function avancer(dt) {
      if (attente?.type !== 'texte' || ecrit >= complet.length) return;
      chrono += dt;
      const n = Math.min(complet.length, Math.floor(chrono * VITESSE));
      if (n !== ecrit) {
        ecrit = n;
        texte.textContent = complet.slice(0, n);
        if (ecrit >= complet.length) suite.hidden = false;
      }
    }

    // --- Le menu et les attaques : une grille 2 × 2 ---
    function grille(boutons, { annulable, info }) {
      menu.replaceChildren(...boutons.map((b) => b.el));
      menu.hidden = false;
      suite.hidden = true;
      return new Promise((resoudre) => {
        const a = { type: 'grille', i: 0, boutons, annulable, resoudre, info };
        boutons.forEach((b, i) => { b.el.onclick = () => { if (attente === a) { a.i = i; valider(); } }; b.el.onmousemove = () => { if (Menus.aBouge() && attente === a && a.i !== i) { a.i = i; surligner(); } }; });
        attente = a;
        surligner();
      });
    }
    function surligner() {
      const a = attente;
      a.boutons.forEach((b, i) => b.el.classList.toggle('actif', i === a.i));
      a.info?.(a.i);
    }
    function valider() {
      const a = attente;
      attente = null;
      menu.hidden = true;
      a.resoudre(a.boutons[a.i].valeur);
    }
    function menuPrincipal(nom, dresseur) {
      complet = `Que doit faire ${nom} ?`;
      ecrit = complet.length;
      texte.textContent = complet;
      const b = (valeur, libelle, icone) => ({ valeur, el: el('button', { className: `combat-choix choix-${valeur}` }, el('i', { className: `codicon codicon-${icone}` }), el('span', { textContent: libelle })) });
      return grille([b('attaque', 'Attaque', 'flame'), b('sac', 'Sac', 'briefcase'), b('equipe', 'Équipe', 'organization'), b('fuite', dresseur ? 'Fuite' : 'Fuite', 'run-all')], { annulable: false });
    }
    function attaques(liste) {
      const boutons = liste.map((a, i) => ({
        valeur: i,
        el: el('button', { className: 'combat-choix combat-attaque', style: `--type: ${a.couleur}`, disabled: false },
          el('span', { className: 'combat-attaque-nom', textContent: a.nom }),
          el('span', { className: 'combat-attaque-info' }, el('span', { className: 'combat-type', textContent: a.type || '—', style: `background: ${a.couleur}` }), el('span', { className: a.pp ? '' : 'vide', textContent: `PP ${a.pp}/${a.ppMax}` }))),
      }));
      complet = 'Quelle attaque ?  (Échap : revenir)';
      ecrit = complet.length;
      texte.textContent = complet;
      menu.classList.add('attaques');
      return grille(boutons, { annulable: true }).finally(() => menu.classList.remove('attaques'));
    }

    // --- Une liste (l'équipe, le sac, l'attaque à oublier) ---
    function choisir(titre, items, annulable) {
      liste.replaceChildren(el('div', { className: 'combat-liste-titre', textContent: titre }));
      const lignes = items.map((it, i) => {
        const l = el('button', { className: `combat-liste-ligne${it.desactive ? ' desactive' : ''}` },
          it.image ? el('img', { src: it.image, alt: '' }) : el('span', { className: 'combat-liste-img' }),
          el('span', { className: 'combat-liste-texte', textContent: it.texte }),
          it.pv != null ? el('span', { className: 'combat-liste-pv' }, el('span', { style: `width: ${Math.round(it.pv * 100)}%`, className: `niveau-${it.pv > 0.5 ? 'haut' : it.pv > 0.2 ? 'moyen' : 'bas'}` })) : null,
          el('span', { className: 'combat-liste-detail', textContent: it.detail || '' }));
        liste.append(l);
        return l;
      });
      if (annulable) liste.append(el('div', { className: 'combat-liste-aide', textContent: 'Échap, Retour arrière, X ou clic droit : revenir' }));
      liste.hidden = false;
      return new Promise((resoudre) => {
        const premier = items.findIndex((it) => !it.desactive);
        const a = { type: 'liste', i: Math.max(0, premier), items, lignes, annulable, resoudre };
        lignes.forEach((l, i) => {
          l.onclick = () => { if (attente === a && !items[i].desactive) { a.i = i; validerListe(); } };
          l.onmousemove = () => { if (Menus.aBouge() && attente === a && !items[i].desactive && a.i !== i) { a.i = i; surlignerListe(); } };
        });
        attente = a;
        surlignerListe();
      });
    }
    function surlignerListe() {
      const a = attente;
      a.lignes.forEach((l, i) => l.classList.toggle('actif', i === a.i));
      a.lignes[a.i]?.scrollIntoView({ block: 'nearest' });
    }
    function validerListe(annule = false) {
      const a = attente;
      attente = null;
      liste.hidden = true;
      a.resoudre(annule ? null : a.i);
    }

    // --- Les touches, envoyées par le moteur ---
    function touche(t) {
      const a = attente;
      if (!a) return;
      if (a.type === 'evolution') { if (t === 'retour') a.resoudre(true); return; }
      if (a.type === 'texte') {
        if (t !== 'action' && t !== 'retour') return;
        if (ecrit < complet.length) { ecrit = complet.length; texte.textContent = complet; suite.hidden = false; return; }
        attente = null;
        a.resoudre();
        return;
      }
      if (a.type === 'grille') {
        const n = a.boutons.length;
        if (t === 'droite' && a.i % 2 === 0 && a.i + 1 < n) a.i++;
        else if (t === 'gauche' && a.i % 2 === 1) a.i--;
        else if (t === 'bas' && a.i + 2 < n) a.i += 2;
        else if (t === 'haut' && a.i >= 2) a.i -= 2;
        else if (t === 'action') { valider(); return; }
        else if (t === 'retour' && a.annulable) { attente = null; menu.hidden = true; a.resoudre(null); return; }
        surligner();
        return;
      }
      if (a.type === 'liste') {
        const n = a.items.length;
        const pas = (d) => { for (let k = 1; k <= n; k++) { const j = (a.i + d * k + n * k) % n; if (!a.items[j].desactive) { a.i = j; return; } } };
        if (t === 'bas') pas(1);
        else if (t === 'haut') pas(-1);
        else if (t === 'action') { if (!a.items[a.i]?.desactive) validerListe(); return; }
        else if (t === 'retour' && a.annulable) { validerListe(true); return; }
        surlignerListe();
      }
    }

    // --- Ouvrir et fermer ---
    async function ouvrir({ fond = 'herbes', dresseur = null } = {}) {
      racine.hidden = false;
      racine.dataset.fond = fond;
      liste.hidden = true;
      menu.hidden = true;
      texte.textContent = '';
      journalLignes.innerHTML = '';
      for (const cote of ['joueur', 'adversaire']) etats(cote, []); // un nouveau combat, un journal neuf
      journal.hidden = true;
      // Les créatures et leurs cartes restent cachées jusqu'à leur entrée (animer('…', 'entree')).
      for (const c of Object.values(cotes)) {
        c.balle.hidden = true;
        for (const e of [c.place, c.sprite, c.vide, c.carte, c.balle]) e.getAnimations().forEach((a) => a.cancel());
        c.place.style.opacity = '0';
        c.carte.style.opacity = '0';
      }
      badge.hidden = !dresseur;
      if (dresseur) badge.replaceChildren(...(dresseur.portrait ? [el('img', { src: dresseur.portrait, alt: '' })] : []), el('span', { textContent: dresseur.nom }));
      // Le flash d'entrée en combat, puis le fond qui s'ouvre (le combat attend la fin).
      await Promise.all([
        flash.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 0.85 }, { opacity: 0 }], { duration: 650 }).finished,
        scene.animate([{ clipPath: 'inset(50% 0 50% 0)' }, { clipPath: 'inset(50% 0 50% 0)', offset: 0.4 }, { clipPath: 'inset(0 0 0 0)' }], { duration: 750, easing: 'ease-out' }).finished,
        dresseur ? badge.animate([{ transform: 'translate(-50%, -150%)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: 400, delay: 500, easing: 'ease-out', fill: 'backwards' }).finished : null,
      ]);
    }
    function fermer() {
      racine.hidden = true;
      attente = null;
    }

    return {
      ouvrir, fermer, creature, etats, pv, xp, animer, evolution, message, avancer, touche,
      menu: menuPrincipal, attaques, liste: choisir, journal: basculerJournal, noter,
      get ouvert() { return !racine.hidden; },
    };
  }

  return { creer };
})();
