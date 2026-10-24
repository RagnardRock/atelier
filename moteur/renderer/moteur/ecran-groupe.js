// L'écran des combats en groupe (Saga 0.8), pour les packs de règles qui le demandent (ecran:
// 'groupe', comme le pack JRPG) : les monstres à gauche, les héros à droite vus de côté (leur sprite
// de carte, tourné vers la gauche), la boîte des messages et le tableau du groupe en bas.
//
// Comme ecran-combat.js, il ne connaît pas les règles : le combat lui demande tout avec des promesses
// (un message, l'ordre d'un héros, une liste, une cible, une animation) et lui dit quoi montrer. Il suit
// les thèmes verre et pixel, au clavier, à la manette et à la souris (clic droit = retour).
//
// Ce qu'il sait faire (REGLES.md › « L'écran de combat en groupe ») :
//   ouvrir({ jeu, fond, heros: [vue], ennemis: [vue], boss })   vue d'un héros : { nom, apparence, pv, pvMax,
//       pm, pmMax, statut, ko } ; vue d'un monstre : { nom, image, taille: petit|moyen|grand, boss, ko }
//   heros(i, vue), ennemi(i, vue)         mettre à jour
//   message(texte, { attendre, fanfare })  attendre : jusqu'à la touche Action ; sinon il passe tout seul
//   bandeau(texte)                         le nom de l'action en cours, en haut ('' : le cacher)
//   commande(i, items)                     l'ordre du héros i : items [{ id, texte, icone, desactive }] → id, ou null (Retour)
//   liste(titre, items, annulable)         → index ou null ; items [{ texte, detail, image, couleur, desactive }]
//   cible({ camp, tous, possibles, depart }) → index (ou -1 pour « tous »), ou null (Retour)
//   animer(camp, i, nom)                   avance, recule, attaque, touche, esquive, ko, ranime, soin, hausse, baisse
//   nombre(camp, i, texte, sorte)          un nombre qui monte : degats, critique, soin, pm, rate, info, hausse, baisse
//   effet(cibles: [[camp, i]], couleur)    l'éclat d'un sort sur ses cibles
//   fermer(), touche(t), avancer(dt), ouvert

const EcranGroupe = (() => {
  const VITESSE = 80; // lettres par seconde
  const PAUSE_AUTO = 0.7; // secondes qu'un message sans « attendre » reste écrit
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

  function creer(conteneur) {
    const racine = el('div', { className: 'combat groupe', hidden: true });
    const scene = el('div', { className: 'combat-scene' });
    const zoneEnnemis = el('div', { className: 'gr-ennemis' });
    const zoneHeros = el('div', { className: 'gr-heros' });
    const bandeauEl = el('div', { className: 'gr-bandeau', hidden: true });
    scene.append(zoneEnnemis, zoneHeros, bandeauEl);
    const texte = el('div', { className: 'combat-texte' });
    const suite = el('div', { className: 'combat-suite', textContent: '▼', hidden: true });
    const menu = el('div', { className: 'gr-menu', hidden: true });
    const tableau = el('div', { className: 'gr-equipe' });
    const bas = el('div', { className: 'combat-bas' }, el('div', { className: 'combat-boite gr-boite' }, texte, suite, menu), tableau);
    const liste = el('div', { className: 'combat-liste', hidden: true });
    const flash = el('div', { className: 'combat-flash' });
    racine.append(scene, bas, liste, flash);
    racine.addEventListener('contextmenu', (e) => { e.preventDefault(); touche('retour'); });
    conteneur.append(racine);

    let jeu = null;
    let attente = null; // ce que le joueur doit faire : { type, … }
    let complet = '', ecrit = 0, chrono = 0, auto = 0;
    const unites = { heros: [], ennemis: [] }; // { el, img, vue, lignes… }

    // --- Les héros : leur sprite de côté (tourné vers la gauche), debout ou en marche ---
    const imagesHeros = (vue) => {
      const a = vue.apparence;
      if (!a) return { debout: '', pas: [] };
      const n = a.sprite?.images || 3;
      return { debout: Sprites.vignette(jeu, a, 'gauche', 0), pas: Array.from({ length: Math.max(0, n - 1) }, (_, k) => Sprites.vignette(jeu, a, 'gauche', k + 1)) };
    };
    function creerHeros(vue, i) {
      const img = el('img', { className: 'gr-sprite', alt: '' });
      const vide = el('div', { className: 'gr-sprite gr-sprite-vide' });
      const boite = el('div', { className: 'gr-perso', style: `--rang: ${i}` }, el('div', { className: 'gr-ombre' }), img, vide, el('div', { className: 'gr-curseur', textContent: '◀' }));
      const nom = el('span', { className: 'gr-nom' });
      const pvTexte = el('span', { className: 'gr-pv-texte' });
      const barre = el('span', { className: 'gr-pv-barre' });
      const pmTexte = el('span', { className: 'gr-pm' });
      const statut = el('span', { className: 'gr-statut' });
      const ligne = el('div', { className: 'gr-ligne' }, nom, statut, el('span', { className: 'gr-pv' }, el('span', { className: 'gr-pv-fond' }, barre), pvTexte), pmTexte);
      const u = { el: boite, img, vide, ligne, nom, pvTexte, barre, pmTexte, statut, vue, images: imagesHeros(vue), camp: 'heros', i };
      ligne.onclick = () => clicUnite(u);
      boite.onclick = () => clicUnite(u);
      boite.onmousemove = () => survolUnite(u);
      return u;
    }
    function majHeros(u, vue) {
      u.vue = vue;
      u.nom.textContent = vue.nom;
      u.statut.textContent = vue.statut || '';
      u.pvTexte.textContent = `${vue.pv}/${vue.pvMax}`;
      const k = Math.max(0, Math.min(1, vue.pv / Math.max(1, vue.pvMax)));
      u.barre.style.width = `${k * 100}%`;
      u.barre.dataset.niveau = k > 0.5 ? 'haut' : k > 0.2 ? 'moyen' : 'bas';
      u.pmTexte.textContent = `${vue.pm}/${vue.pmMax} PM`;
      u.ligne.classList.toggle('ko', vue.ko);
      u.el.classList.toggle('ko', vue.ko);
      if (u.images.debout) { u.img.src = u.marche ? u.img.src : u.images.debout; u.img.hidden = false; u.vide.hidden = true; }
      else { u.img.hidden = true; u.vide.hidden = false; u.vide.textContent = (vue.nom || '?')[0]; }
    }
    // --- Les monstres ---
    function creerEnnemi(vue, i) {
      const img = el('img', { className: 'gr-sprite', alt: '' });
      const vide = el('div', { className: 'gr-sprite gr-sprite-vide' });
      const nom = el('div', { className: 'gr-etiquette' });
      const boite = el('div', { className: `gr-monstre taille-${vue.boss ? 'boss' : vue.taille || 'moyen'}` }, el('div', { className: 'gr-ombre' }), img, vide, nom, el('div', { className: 'gr-curseur', textContent: '▶' }));
      const u = { el: boite, img, vide, nomEl: nom, vue, camp: 'ennemis', i };
      boite.onclick = () => clicUnite(u);
      boite.onmousemove = () => survolUnite(u);
      return u;
    }
    function majEnnemi(u, vue) {
      u.vue = vue;
      u.nomEl.textContent = vue.nom;
      if (vue.image) { if (u.img.getAttribute('src') !== vue.image) u.img.src = vue.image; u.img.hidden = false; u.vide.hidden = true; }
      else { u.img.hidden = true; u.vide.hidden = false; u.vide.textContent = (vue.nom || '?')[0]; }
      u.el.classList.toggle('ko', vue.ko);
    }

    // --- Ouvrir et fermer ---
    async function ouvrir({ jeu: j, fond = 'herbes', heros = [], ennemis = [], boss = false }) {
      jeu = j;
      racine.hidden = false;
      racine.dataset.fond = fond;
      racine.classList.toggle('boss', boss);
      liste.hidden = true;
      menu.hidden = true;
      bandeauEl.hidden = true;
      texte.textContent = '';
      unites.heros = heros.map(creerHeros);
      unites.ennemis = ennemis.map(creerEnnemi);
      unites.heros.forEach((u, i) => majHeros(u, heros[i]));
      unites.ennemis.forEach((u, i) => majEnnemi(u, ennemis[i]));
      zoneHeros.replaceChildren(...unites.heros.map((u) => u.el));
      zoneHeros.style.setProperty('--n', unites.heros.length);
      zoneEnnemis.replaceChildren(...unites.ennemis.map((u) => u.el));
      tableau.replaceChildren(...unites.heros.map((u) => u.ligne));
      // Le flash d'entrée, puis le fond qui s'ouvre ; les monstres glissent de la gauche, les héros de la droite.
      await Promise.all([
        flash.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 0.85 }, { opacity: 0 }], { duration: 650 }).finished,
        scene.animate([{ clipPath: 'inset(50% 0 50% 0)' }, { clipPath: 'inset(50% 0 50% 0)', offset: 0.4 }, { clipPath: 'inset(0 0 0 0)' }], { duration: 750, easing: 'ease-out' }).finished,
        ...unites.ennemis.map((u, k) => u.el.animate([{ transform: 'translateX(-60vw)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: 380 + k * 40, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' }).finished),
        ...unites.heros.map((u, k) => u.el.animate([{ transform: 'translateX(40vw)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: 420 + k * 60, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' }).finished),
      ]);
    }
    function fermer() {
      racine.hidden = true;
      attente = null;
      for (const u of [...unites.heros, ...unites.ennemis]) clearInterval(u.marche);
    }

    // --- Les messages ---
    function message(t, { attendre: att = false, fanfare = false } = {}) {
      menu.hidden = true;
      complet = String(t);
      ecrit = 0;
      chrono = 0;
      auto = 0;
      texte.textContent = '';
      suite.hidden = true;
      if (fanfare) texte.animate([{ transform: 'scale(1.06)', color: 'var(--accent)' }, { transform: 'none' }], { duration: 600, easing: 'ease-out' });
      return new Promise((resoudre) => { attente = { type: 'texte', attendre: att, resoudre }; });
    }
    function avancer(dt) {
      const a = attente;
      if (a?.type !== 'texte') return;
      if (ecrit < complet.length) {
        chrono += dt;
        const n = Math.min(complet.length, Math.floor(chrono * VITESSE));
        if (n !== ecrit) {
          ecrit = n;
          texte.textContent = complet.slice(0, n);
          if (ecrit >= complet.length && a.attendre) suite.hidden = false;
        }
        return;
      }
      // Un message qui n'attend pas le joueur s'en va tout seul, un instant après être écrit.
      if (!a.attendre) {
        auto += dt;
        if (auto >= PAUSE_AUTO) { attente = null; a.resoudre(); }
      }
    }
    function bandeau(t) {
      bandeauEl.textContent = t || '';
      bandeauEl.hidden = !t;
      if (t) bandeauEl.animate([{ transform: 'translate(-50%, -12px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: 220, easing: 'ease-out' });
    }

    // --- L'ordre d'un héros : un menu en colonne ---
    function commande(i, items) {
      const u = unites.heros[i];
      complet = `${u?.vue.nom || ''} ?`;
      ecrit = complet.length;
      texte.textContent = complet;
      suite.hidden = true;
      unites.heros.forEach((h, k) => { h.ligne.classList.toggle('actif', k === i); h.el.classList.toggle('pret', k === i); });
      const boutons = items.map((it) => el('button', { className: `combat-choix gr-choix${it.desactive ? ' desactive' : ''}` }, el('i', { className: `codicon codicon-${it.icone || 'circle-filled'}` }), el('span', { textContent: it.texte })));
      menu.replaceChildren(...boutons);
      menu.hidden = false;
      return new Promise((resoudre) => {
        const a = { type: 'menu', i: Math.max(0, items.findIndex((it) => !it.desactive)), items, boutons, resoudre };
        const fin = (v) => { attente = null; menu.hidden = true; unites.heros.forEach((h) => { h.ligne.classList.remove('actif'); h.el.classList.remove('pret'); }); resoudre(v); };
        a.fin = fin;
        boutons.forEach((b, k) => {
          b.onclick = () => { if (attente === a && !items[k].desactive) fin(items[k].id); };
          b.onmousemove = () => { if (Menus.aBouge() && attente === a && !items[k].desactive && a.i !== k) { a.i = k; surlignerMenu(); } };
        });
        attente = a;
        surlignerMenu();
      });
    }
    function surlignerMenu() {
      const a = attente;
      a.boutons.forEach((b, k) => b.classList.toggle('actif', k === a.i));
    }

    // --- Une liste (compétences, objets) ---
    function choisir(titre, items, annulable) {
      liste.replaceChildren(el('div', { className: 'combat-liste-titre', textContent: titre }));
      const lignes = items.map((it, i) => {
        const l = el('button', { className: `combat-liste-ligne${it.desactive ? ' desactive' : ''}`, style: it.couleur ? `--type: ${it.couleur}` : '' },
          it.image ? el('img', { src: it.image, alt: '' }) : el('span', { className: `combat-liste-img${it.couleur ? ' pastille' : ''}` }),
          el('span', { className: 'combat-liste-texte', textContent: it.texte }),
          el('span'),
          el('span', { className: 'combat-liste-detail', textContent: it.detail || '' }));
        liste.append(l);
        return l;
      });
      if (!items.length) liste.append(el('div', { className: 'menu-vide', textContent: 'Rien ici.' }));
      if (annulable) liste.append(el('div', { className: 'combat-liste-aide', textContent: 'Échap, Retour arrière, X ou clic droit : revenir' }));
      liste.hidden = false;
      return new Promise((resoudre) => {
        const a = { type: 'liste', i: Math.max(0, items.findIndex((it) => !it.desactive)), items, lignes, annulable, resoudre };
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

    // --- Choisir une cible : un curseur sur un monstre ou un héros (ou sur tous) ---
    function cible({ camp, tous = false, possibles = [], depart = -1 }) {
      const l = unites[camp];
      const ok = (k) => possibles[k] !== false && Boolean(l[k]);
      let i = ok(depart) ? depart : l.findIndex((x, k) => ok(k));
      if (i < 0) return Promise.resolve(null);
      return new Promise((resoudre) => {
        const a = { type: 'cible', camp, tous, ok, i, resoudre };
        attente = a;
        surlignerCible();
      });
    }
    function surlignerCible() {
      const a = attente;
      for (const camp of ['heros', 'ennemis']) unites[camp].forEach((u, k) => u.el.classList.toggle('vise', camp === a.camp && a.ok(k) && (a.tous || k === a.i)));
      unites.heros.forEach((u, k) => u.ligne.classList.toggle('vise', a.camp === 'heros' && a.ok(k) && (a.tous || k === a.i)));
      const u = unites[a.camp][a.i];
      complet = a.tous ? (a.camp === 'heros' ? 'Tout le groupe' : 'Tous les ennemis') : u?.vue.nom || '';
      ecrit = complet.length;
      texte.textContent = `▶ ${complet}`;
    }
    function finCible(v) {
      const a = attente;
      attente = null;
      for (const camp of ['heros', 'ennemis']) unites[camp].forEach((u) => { u.el.classList.remove('vise'); u.ligne?.classList.remove('vise'); });
      a.resoudre(v);
    }
    function clicUnite(u) {
      const a = attente;
      if (a?.type !== 'cible' || a.camp !== u.camp || !a.ok(u.i)) return;
      finCible(a.tous ? -1 : u.i);
    }
    function survolUnite(u) {
      const a = attente;
      if (a?.type !== 'cible' || a.tous || a.camp !== u.camp || !a.ok(u.i) || a.i === u.i || !Menus.aBouge()) return;
      a.i = u.i;
      surlignerCible();
    }

    // --- Les animations ---
    const cibleDe = (u) => (u.img.hidden ? u.vide : u.img);
    // La marche sur place d'un héros qui avance : les images de pas tournent.
    function marcher(u, oui) {
      clearInterval(u.marche);
      u.marche = 0;
      if (!oui || !u.images.pas.length) { if (u.images.debout) u.img.src = u.images.debout; return; }
      let k = 0;
      u.marche = setInterval(() => { u.img.src = u.images.pas[k++ % u.images.pas.length]; }, 120);
    }
    async function animer(camp, i, nom) {
      const u = unites[camp][i];
      if (!u) return;
      const c = cibleDe(u);
      switch (nom) {
        case 'avance':
          marcher(u, true);
          await u.el.animate([{ transform: 'none' }, { transform: 'translateX(-7vh)' }], { duration: 240, easing: 'ease-out', fill: 'forwards' }).finished;
          marcher(u, false);
          return;
        case 'recule':
          marcher(u, true);
          await u.el.animate([{ transform: 'translateX(-7vh)' }, { transform: 'none' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished;
          marcher(u, false);
          u.el.getAnimations().forEach((x) => x.cancel());
          return;
        case 'attaque':
          await c.animate([{ filter: 'none', transform: 'none' }, { filter: 'brightness(2.2)', transform: 'translateX(2.5vh) scale(1.05)' }, { filter: 'none', transform: 'none' }], { duration: 320, easing: 'ease-out' }).finished;
          return;
        case 'touche':
          await c.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-6px)', opacity: 0.2 }, { transform: 'translateX(6px)', opacity: 1 }, { transform: 'translateX(-4px)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 340 }).finished;
          return;
        case 'esquive':
          await c.animate([{ transform: 'none' }, { transform: `translateX(${camp === 'heros' ? '' : '-'}3vh)` }, { transform: 'none' }], { duration: 300, easing: 'ease-out' }).finished;
          return;
        case 'ko':
          if (camp === 'ennemis') {
            await u.el.animate([{ opacity: 1, filter: 'none' }, { opacity: 0.9, filter: 'brightness(3) sepia(1) hue-rotate(-50deg) saturate(5)' }, { opacity: 0, filter: 'brightness(3) sepia(1) hue-rotate(-50deg) saturate(5)' }], { duration: 560, easing: 'ease-in', fill: 'forwards' }).finished;
          } else await attendre(250);
          return;
        case 'ranime':
          u.el.getAnimations().forEach((x) => x.cancel());
          await c.animate([{ filter: 'brightness(4)', opacity: 0.3 }, { filter: 'none', opacity: 1 }], { duration: 600, easing: 'ease-out' }).finished;
          return;
        case 'soin':
          await c.animate([{ filter: 'none' }, { filter: 'drop-shadow(0 0 12px #7dffb0) brightness(1.4)' }, { filter: 'none' }], { duration: 480 }).finished;
          return;
        case 'hausse':
        case 'baisse':
          await c.animate([{ filter: 'none' }, { filter: `drop-shadow(0 0 12px ${nom === 'hausse' ? '#ff9d4a' : '#4aa8ff'})` }, { filter: 'none' }], { duration: 480 }).finished;
          return;
        default:
      }
    }
    // Un nombre qui monte et s'efface, au-dessus du combattant.
    function nombre(camp, i, t, sorte = 'degats') {
      const u = unites[camp][i];
      if (!u) return;
      const n = el('div', { className: `gr-nombre ${sorte}`, textContent: t });
      u.el.append(n);
      const anim = n.animate([
        { transform: 'translate(-50%, 0) scale(0.7)', opacity: 0 },
        { transform: 'translate(-50%, -18px) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -30px) scale(1)', opacity: 1, offset: 0.75 },
        { transform: 'translate(-50%, -42px)', opacity: 0 },
      ], { duration: 1000, easing: 'ease-out' });
      anim.finished.then(() => n.remove());
    }
    // L'éclat d'un sort : un halo de sa couleur sur chaque cible.
    async function effet(cibles, couleur = '#ffffff') {
      await Promise.all(cibles.map(([camp, i]) => {
        const u = unites[camp][i];
        if (!u) return null;
        const h = el('div', { className: 'gr-halo', style: `--couleur: ${couleur}` });
        u.el.append(h);
        return h.animate([{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.3)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.4 }, { opacity: 0, transform: 'translate(-50%, -50%) scale(1.4)' }], { duration: 520, easing: 'ease-out' }).finished.then(() => h.remove());
      }));
    }

    // --- Les touches, envoyées par le moteur ---
    function touche(t) {
      const a = attente;
      if (!a) return;
      if (a.type === 'texte') {
        if (t !== 'action' && t !== 'retour') return;
        if (ecrit < complet.length) { ecrit = complet.length; texte.textContent = complet; if (a.attendre) suite.hidden = false; return; }
        attente = null;
        a.resoudre();
        return;
      }
      if (a.type === 'menu') {
        const n = a.items.length;
        const pas = (d) => { for (let k = 1; k <= n; k++) { const j = (a.i + d * k + n * k) % n; if (!a.items[j].desactive) { a.i = j; return; } } };
        if (t === 'bas') pas(1);
        else if (t === 'haut') pas(-1);
        else if (t === 'action') { if (!a.items[a.i]?.desactive) a.fin(a.items[a.i].id); return; }
        else if (t === 'retour') { a.fin(null); return; }
        surlignerMenu();
        return;
      }
      if (a.type === 'liste') {
        const n = a.items.length;
        const pas = (d) => { for (let k = 1; k <= n; k++) { const j = (a.i + d * k + n * k) % n; if (!a.items[j].desactive) { a.i = j; return; } } };
        if (t === 'bas') pas(1);
        else if (t === 'haut') pas(-1);
        else if (t === 'action') { if (a.items[a.i] && !a.items[a.i].desactive) validerListe(); return; }
        else if (t === 'retour' && a.annulable) { validerListe(true); return; }
        surlignerListe();
        return;
      }
      if (a.type === 'cible') {
        if (t === 'action') { finCible(a.tous ? -1 : a.i); return; }
        if (t === 'retour') { finCible(null); return; }
        if (a.tous) return;
        const n = unites[a.camp].length;
        const d = t === 'bas' || t === 'droite' ? 1 : t === 'haut' || t === 'gauche' ? -1 : 0;
        if (!d) return;
        for (let k = 1; k <= n; k++) { const j = (a.i + d * k + n * k) % n; if (a.ok(j)) { a.i = j; break; } }
        surlignerCible();
      }
    }

    return {
      ouvrir, fermer, message, avancer, bandeau, commande, liste: choisir, cible, animer, nombre, effet, touche,
      heros: (i, vue) => { if (unites.heros[i]) majHeros(unites.heros[i], vue); },
      ennemi: (i, vue) => { if (unites.ennemis[i]) majEnnemi(unites.ennemis[i], vue); },
      get ouvert() { return !racine.hidden; },
    };
  }

  return { creer };
})();
