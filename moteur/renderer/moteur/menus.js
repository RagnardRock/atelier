// Les menus du jeu hors combat (Saga 0.5) : une liste où choisir (boutique, sac, équipe), le choix
// d'une quantité, et l'écran des EV. En HTML posé sur le jeu, avec les classes de l'écran de combat,
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

    function ouvrir(a) {
      attente = a;
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
    function liste({ titre, items, annulable = true, entete = '', note = '' }) {
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
        const a = {
          i: Math.max(0, items.findIndex((it) => !it.desactive)), resoudre,
          touche(t) {
            if (t === 'bas') pas(1);
            else if (t === 'haut') pas(-1);
            else if (t === 'action') return valider();
            else if (t === 'retour' && annulable) return fermer(null);
            surligner();
          },
        };
        ouvrir(a);
        surligner();
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
    return { liste, quantite, ev, touche, fermer: () => fermer(null), get ouvert() { return Boolean(attente); } };
  }

  return { creer, aBouge };
})();
