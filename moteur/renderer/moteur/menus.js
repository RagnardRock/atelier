// Les menus du jeu hors combat (Saga 0.5) : une liste où choisir (boutique, sac, équipe), le choix
// d'une quantité, et l'écran des EV. Saga 0.6 : la fiche d'une créature ou d'une espèce (résumé,
// Pokédex), un nom à taper (surnom, nom de boîte), et un écran libre (le PC, dans ecrans.js). En HTML posé sur le jeu, avec les classes de l'écran de combat,
// donc ils suivent le thème du jeu (verre ou pixel).
//
// Chaque menu rend une promesse (l'index choisi, la quantité, les EV… ou null si le joueur revient en
// arrière). Le moteur leur passe les touches (haut, bas, gauche, droite, action, retour) pendant qu'un
// menu est ouvert ; la souris marche aussi.

const Menus = (() => {
  // La souris ne choisit une ligne que si elle a vraiment bougé : quand un menu s'ouvre sous une souris
  // immobile, Chromium envoie des mouseenter/mousemove « fantômes » qui voleraient le choix du clavier.
  let avant = null, ici = null;
  window.addEventListener('mousemove', (e) => { avant = ici; ici = `${e.screenX},${e.screenY}`; }, true);
  const aBouge = () => avant !== ici;

  function creer(conteneur) {
    const racine = el('div', { className: 'menu-ecran', hidden: true });
    const boite = el('div', { className: 'combat-liste menu-boite' });
    racine.append(boite);
    racine.addEventListener('contextmenu', (e) => { e.preventDefault(); touche('retour'); });
    conteneur.append(racine);
    let attente = null; // le menu ouvert : { touche(t), … }

    function ouvrir(a, large = false) {
      attente = a;
      boite.classList.toggle('menu-large', large);
      racine.hidden = false;
    }
    function fermer(valeur) {
      const a = attente;
      attente = null;
      racine.hidden = true;
      a?.resoudre(valeur);
    }
    const tete = (titre, entete) => el('div', { className: 'combat-liste-titre menu-tete' },
      el('span', { textContent: titre }), entete ? el('span', { className: 'menu-entete', textContent: entete }) : null);
    const aide = (texte) => el('div', { className: 'combat-liste-aide', textContent: texte });

    // --- Une liste : items [{ texte, detail, image, pv (0 à 1), desactive }] ---
    // depart : la ligne choisie au début ; saut : gauche/droite avancent de tant de lignes (le Pokédex).
    function liste({ titre, items, annulable = true, entete = '', note = '', depart = -1, saut = 0, large = false }) {
      return new Promise((resoudre) => {
        boite.replaceChildren(tete(titre, entete));
        if (note) boite.append(el('div', { className: 'menu-note', textContent: note }));
        const lignes = items.map((it, i) => {
          const l = el('button', { className: `combat-liste-ligne${it.desactive ? ' desactive' : ''}` },
            it.image ? el('img', { src: it.image, alt: '' }) : el('span', { className: 'combat-liste-img' }),
            el('span', { className: 'combat-liste-texte', textContent: it.texte }),
            it.pv != null ? el('span', { className: 'combat-liste-pv' }, el('span', { style: `width: ${Math.round(it.pv * 100)}%`, className: `niveau-${it.pv > 0.5 ? 'haut' : it.pv > 0.2 ? 'moyen' : 'bas'}` })) : el('span'),
            el('span', { className: 'combat-liste-detail', textContent: it.detail || '' }));
          l.onclick = () => { if (attente === a && !it.desactive) { a.i = i; valider(); } };
          l.onmousedown = (e) => e.preventDefault();
          l.onmousemove = () => { if (aBouge() && attente === a && !it.desactive && a.i !== i) { a.i = i; surligner(); } };
          boite.append(l);
          return l;
        });
        if (!items.length) boite.append(el('div', { className: 'menu-vide', textContent: 'Rien ici.' }));
        if (annulable) boite.append(aide('Échap, Retour arrière, X ou clic droit : revenir'));
        const surligner = () => { lignes.forEach((l, i) => l.classList.toggle('actif', i === a.i)); lignes[a.i]?.scrollIntoView({ block: 'nearest' }); };
        const pas = (d) => { const n = items.length; for (let k = 1; k <= n; k++) { const j = (a.i + d * k + n * k) % n; if (!items[j].desactive) { a.i = j; return; } } };
        const valider = () => { if (items[a.i] && !items[a.i].desactive) fermer(a.i); };
        const sauter = (d) => {
          let j = Math.max(0, Math.min(items.length - 1, a.i + d * saut));
          while (items[j]?.desactive && j !== a.i) j += d > 0 ? -1 : 1; // la plus proche qu'on peut choisir
          a.i = j;
        };
        const a = {
          i: items[depart] && !items[depart].desactive ? depart : Math.max(0, items.findIndex((it) => !it.desactive)), resoudre,
          touche(t) {
            if (t === 'bas') pas(1);
            else if (t === 'haut') pas(-1);
            else if (saut && (t === 'gauche' || t === 'droite')) sauter(t === 'droite' ? 1 : -1);
            else if (t === 'action') return valider();
            else if (t === 'retour' && annulable) return fermer(null);
            surligner();
          },
        };
        ouvrir(a, large);
        surligner();
      });
    }

    // --- Une fiche (Saga 0.6) : fiches [{ titre, sousTitre, image, etiquettes, pages }] (voir
    // regles/pokemon/fiches.js), i : celle à montrer. Gauche/droite : page suivante ; haut/bas : la
    // créature d'avant/d'après. Rend l'index de la dernière fiche montrée quand le joueur revient.
    function fiche({ fiches, i = 0, page = 0 }) {
      return new Promise((resoudre) => {
        const a = { i, page, resoudre };
        function montrer() {
          const f = fiches[a.i];
          a.page = Math.max(0, Math.min(f.pages.length - 1, a.page));
          const p = f.pages[a.page];
          const onglets = el('div', { className: 'fiche-onglets' }, ...f.pages.map((x, k) => {
            const b = el('button', { className: `fiche-onglet${k === a.page ? ' actif' : ''}`, type: 'button', textContent: x.nom });
            b.onclick = () => { a.page = k; montrer(); };
            b.onmousedown = (e) => e.preventDefault();
            return b;
          }));
          const lignes = (p.lignes || []).map((l) => el('div', { className: 'fiche-ligne', style: l.couleur ? `--couleur: ${l.couleur}` : '' },
            el('span', { className: 'fiche-nom', textContent: l.nom }),
            el('span', { className: 'fiche-valeur', textContent: l.valeur ?? '' }),
            el('span', { className: 'fiche-detail', textContent: l.detail || '' }),
            l.barre != null ? el('span', { className: 'fiche-barre' }, el('span', { style: `width: ${Math.round(Math.max(0, Math.min(1, l.barre)) * 100)}%` })) : null));
          boite.replaceChildren(
            el('div', { className: 'fiche-tete' },
              f.image ? el('img', { className: 'fiche-image', src: f.image, alt: '' }) : el('span', { className: 'fiche-image' }),
              el('div', { className: 'fiche-noms' },
                el('div', { className: 'fiche-titre', textContent: f.titre }),
                el('div', { className: 'fiche-sous', textContent: f.sousTitre || '' }),
                el('div', { className: 'fiche-types' }, ...(f.etiquettes || []).map((t) => el('span', { className: 'combat-type', textContent: t.texte, style: t.couleur ? `background: ${t.couleur}` : '' })))),
              fiches.length > 1 ? el('span', { className: 'menu-entete', textContent: `${a.i + 1} / ${fiches.length}` }) : null),
            onglets,
            el('div', { className: 'fiche-page' }, p.texte ? el('p', { className: 'fiche-texte', textContent: p.texte }) : null, ...lignes),
            aide([f.pages.length > 1 ? 'Gauche/droite : page' : '', fiches.length > 1 ? 'Haut/bas : la suivante' : '', 'Échap : revenir'].filter(Boolean).join(' · ')));
        }
        a.touche = (t) => {
          const n = fiches[a.i].pages.length;
          if (t === 'gauche') a.page = (a.page - 1 + n) % n;
          else if (t === 'droite' || t === 'action') a.page = (a.page + 1) % n;
          else if (t === 'bas' && fiches.length > 1) a.i = (a.i + 1) % fiches.length;
          else if (t === 'haut' && fiches.length > 1) a.i = (a.i - 1 + fiches.length) % fiches.length;
          else if (t === 'retour') return fermer(a.i);
          montrer();
        };
        ouvrir(a, true);
        montrer();
      });
    }

    // --- Un nom à taper (surnom, nom d'une boîte). Rend le texte, ou null (Échap). ---
    function texte({ titre, valeur = '', max = 12, note = '', vide = '' }) {
      return new Promise((resoudre) => {
        const entree = el('input', { className: 'perso-nom menu-texte', type: 'text', maxLength: max, value: valeur, spellcheck: false, autocomplete: 'off' });
        const valider = () => fermer(entree.value.trim().slice(0, max));
        // Entrée et Échap dans le champ : ici (le moteur ne lit pas les touches tapées dans un champ).
        entree.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); valider(); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(null); }
          else e.stopPropagation();
        });
        boite.replaceChildren(tete(titre), note ? el('div', { className: 'menu-note', textContent: note }) : '', entree,
          el('button', { className: 'combat-liste-ligne actif menu-ok', type: 'button', textContent: 'Valider', onclick: valider }),
          aide(`Entrée : valider · Échap : revenir${vide ? ` · Laisser vide : ${vide}` : ''}`));
        ouvrir({ resoudre, touche(t) { if (t === 'retour') fermer(null); } });
        setTimeout(() => { entree.focus(); entree.select(); }, 0);
      });
    }

    // --- Un écran libre (le PC) : construire(boite, fermer) remplit la boîte et rend { touche(t) }. ---
    function ecran(construire) {
      return new Promise((resoudre) => {
        boite.replaceChildren();
        const a = { resoudre, touche: () => {} };
        ouvrir(a, true);
        Object.assign(a, construire(boite, fermer, aide));
      });
    }

    // --- Combien ? (gauche/droite : ±1, haut/bas : ±10) ---
    function quantite({ titre, prix = 0, max = 99, monnaie = '', verbe = 'Acheter' }) {
      return new Promise((resoudre) => {
        let n = 1;
        const nombre = el('span', { className: 'menu-quantite-n' });
        const total = el('span', { className: 'menu-quantite-total' });
        const maj = () => { nombre.textContent = `× ${n}`; total.textContent = prix ? `${n * prix} ${monnaie}` : ''; };
        const bouton = (txt, f) => el('button', { className: 'perso-fleche', type: 'button', textContent: txt, onclick: () => { f(); maj(); } });
        const changer = (d) => { n = Math.max(1, Math.min(max, n + d)); };
        boite.replaceChildren(tete(titre),
          el('div', { className: 'menu-quantite' }, bouton('◀', () => changer(-1)), nombre, bouton('▶', () => changer(1)), total),
          el('button', { className: 'combat-liste-ligne actif menu-ok', type: 'button', textContent: verbe, onclick: () => fermer(n) }),
          aide('Gauche/droite : ±1 · Haut/bas : ±10 · Action : valider · Échap : revenir'));
        maj();
        ouvrir({
          resoudre,
          touche(t) {
            if (t === 'gauche') changer(-1);
            else if (t === 'droite') changer(1);
            else if (t === 'haut') changer(10);
            else if (t === 'bas') changer(-10);
            else if (t === 'action') return fermer(n);
            else if (t === 'retour') return fermer(null);
            maj();
          },
        });
      });
    }

    // --- L'écran des EV : stats [{ id, nom }], evs { id: valeur }, apercu(evs) → { id: texte } ---
    // 252 au plus par stat, 510 en tout ; par pas de 4 (4 EV = 1 point de stat au niveau 100).
    function ev({ titre, stats, evs, apercu, parStat = 252, total = 510 }) {
      return new Promise((resoudre) => {
        const v = { ...evs };
        const somme = () => stats.reduce((s, x) => s + (v[x.id] || 0), 0);
        const lignes = [], curseurs = [], valeurs = [], effets = [];
        const reste = el('span', { className: 'menu-entete' });
        boite.replaceChildren(el('div', { className: 'combat-liste-titre menu-tete' }, el('span', { textContent: titre }), reste));
        stats.forEach((s, i) => {
          const curseur = el('input', { type: 'range', min: 0, max: parStat, step: 4, value: v[s.id] || 0, className: 'menu-ev-curseur' });
          curseur.addEventListener('input', () => { regler(i, Number(curseur.value)); });
          const valeur = el('span', { className: 'menu-ev-valeur' });
          const effet = el('span', { className: 'combat-liste-detail' });
          const l = el('div', { className: 'combat-liste-ligne menu-ev-ligne' }, el('span', { className: 'combat-liste-texte', textContent: s.nom }), curseur, valeur, effet);
          l.onmousemove = () => { if (aBouge() && a.i !== i) { a.i = i; surligner(); } };
          boite.append(l);
          lignes.push(l); curseurs.push(curseur); valeurs.push(valeur); effets.push(effet);
        });
        const zero = el('button', { className: 'combat-liste-ligne menu-ok', type: 'button', textContent: 'Tout remettre à zéro', onclick: () => { for (const s of stats) v[s.id] = 0; maj(); } });
        const ok = el('button', { className: 'combat-liste-ligne menu-ok', type: 'button', textContent: 'Valider', onclick: () => fermer({ ...v }) });
        zero.onmousemove = () => { if (aBouge() && a.i !== stats.length) { a.i = stats.length; surligner(); } };
        ok.onmousemove = () => { if (aBouge() && a.i !== stats.length + 1) { a.i = stats.length + 1; surligner(); } };
        lignes.push(zero, ok);
        boite.append(zero, ok, aide('Haut/bas : choisir · Gauche/droite : −4/+4 (ou glisser) · Échap : revenir sans changer'));
        function regler(i, valeur) {
          const s = stats[i];
          const libre = total - (somme() - (v[s.id] || 0));
          v[s.id] = Math.max(0, Math.min(parStat, libre, Math.round(valeur / 4) * 4 || Math.round(valeur)));
          maj();
        }
        function maj() {
          const apres = apercu ? apercu(v) : {};
          stats.forEach((s, i) => {
            curseurs[i].value = v[s.id] || 0;
            valeurs[i].textContent = String(v[s.id] || 0);
            effets[i].textContent = apres[s.id] ?? '';
          });
          reste.textContent = `Restants : ${total - somme()} / ${total}`;
        }
        const surligner = () => lignes.forEach((l, i) => l.classList.toggle('actif', i === a.i));
        const a = {
          i: 0, resoudre,
          touche(t) {
            const n = lignes.length;
            if (t === 'bas') a.i = (a.i + 1) % n;
            else if (t === 'haut') a.i = (a.i - 1 + n) % n;
            else if ((t === 'gauche' || t === 'droite') && a.i < stats.length) regler(a.i, (v[stats[a.i].id] || 0) + (t === 'droite' ? 4 : -4));
            else if (t === 'action' && a.i === stats.length) { for (const s of stats) v[s.id] = 0; maj(); }
            else if (t === 'action' && a.i === stats.length + 1) return fermer({ ...v });
            else if (t === 'retour') return fermer(null);
            surligner();
          },
        };
        ouvrir(a);
        maj();
        surligner();
      });
    }

    function touche(t) { attente?.touche(t); }
    return { liste, quantite, ev, fiche, texte, ecran, touche, fermer: () => fermer(null), get ouvert() { return Boolean(attente); } };
  }

  return { creer, aBouge };
})();
