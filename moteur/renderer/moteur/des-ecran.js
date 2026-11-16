// Le plateau de dés (Saga 0.13) : les jets du pack JDR montrés à l'écran, posés sur le jeu, les
// combats et les menus. Les dés roulent un instant, puis s'arrêtent sur leur vraie valeur (déjà tirée
// par le pack : ce plateau ne décide rien). Un 20 naturel brille, un 1 rougit ; avec l'avantage ou le
// désavantage, le d20 écarté est grisé.
//
//   montrer({ titre, lignes })   lignes : celles du journal des jets (regles/jdr/des.js) ; rend une
//                                promesse résolue quand les dés sont arrêtés (le plateau reste un moment)
//   vitesse(v)                   'normale', 'rapide' ou 'aucune' (le résultat tout de suite)

const EcranDes = (() => {
  const DUREES = { normale: 650, rapide: 260, aucune: 0 };
  const RESTE = 2600; // ms pendant lesquelles le plateau reste visible après l'arrêt des dés
  const RESULTATS = { reussi: 'Réussi', rate: 'Raté', critique: 'Critique !', echec_critique: 'Échec critique', touche: 'Touché', manque: 'Manqué', partiel: 'Réussite partielle' };

  function creer(conteneur) {
    const racine = el('div', { className: 'des-plateau', hidden: true });
    conteneur.append(racine);
    let vitesse = 'normale', minuterie = 0;
    racine.addEventListener('click', () => { racine.hidden = true; });

    // Un dé : un d20 en losange, les autres en carré, avec leur nombre de faces en petit.
    function de(x, final) {
      const d = el('span', { className: `des-de d${x.faces}${x.faces === 20 ? ' vingt' : ''}${final && !x.garde ? ' ecarte' : ''}${final && x.faces === 20 && x.garde && x.valeur === 20 ? ' max' : ''}${final && x.faces === 20 && x.garde && x.valeur === 1 ? ' min' : ''}` },
        el('span', { className: 'des-valeur', textContent: String(x.valeur) }), el('span', { className: 'des-faces', textContent: `d${x.faces}` }));
      return d;
    }
    function ligne(l) {
      const des = el('span', { className: 'des-des' }, ...l.des.map((x) => de(x, false)));
      const bonus = l.bonus ? el('span', { className: 'des-bonus', textContent: `${l.bonus > 0 ? '+' : '−'} ${Math.abs(l.bonus)}` }) : null;
      const total = el('span', { className: 'des-total', textContent: String(l.total) });
      const res = l.resultat ? el('span', { className: `des-resultat ${l.resultat}`, textContent: RESULTATS[l.resultat] || l.resultat }) : null;
      const contre = l.contre ? el('span', { className: 'des-contre', textContent: `contre ${l.contre}` }) : null;
      const mode = l.mode ? el('span', { className: 'des-mode', textContent: l.mode === 'avantage' ? 'avantage' : 'désavantage' }) : null;
      const quoi = el('div', { className: 'des-quoi' }, el('span', { className: 'des-qui', textContent: l.qui || '' }), el('span', { textContent: l.quoi && l.qui ? ` · ${l.quoi}` : l.quoi || '' }), mode);
      const corps = el('div', { className: 'des-corps' }, des, bonus, el('span', { className: 'des-egal', textContent: '=' }), total, contre, res);
      return { el: el('div', { className: 'des-ligne' }, quoi, corps), des, total, res, l };
    }

    async function montrer({ titre = '', lignes = [] } = {}) {
      if (!lignes.length) return;
      clearTimeout(minuterie);
      const l = lignes.slice(-8).map(ligne);
      racine.replaceChildren(el('div', { className: 'des-titre', textContent: titre }), ...l.map((x) => x.el));
      // En combat, le plateau passe en haut au milieu : à droite il cacherait les héros, à gauche les monstres.
      racine.classList.toggle('en-combat', Boolean(conteneur.querySelector('.combat:not([hidden])')));
      racine.hidden = false;
      racine.getAnimations().forEach((a) => a.cancel());
      const base = getComputedStyle(racine).transform; // le centrage du combat (sauf sur petit écran)
      const x = base && base !== 'none' ? `${base} ` : '';
      racine.animate([{ opacity: 0, transform: `${x}translateY(-8px)` }, { opacity: 1, transform: x.trim() || 'none' }], { duration: 160, easing: 'ease-out' });
      const duree = DUREES[vitesse] ?? DUREES.normale;
      if (duree > 0) {
        // Les dés roulent : des valeurs au hasard (purement visuelles), puis les vraies.
        for (const x of l) { x.total.style.visibility = 'hidden'; if (x.res) x.res.style.visibility = 'hidden'; }
        const t0 = performance.now();
        await new Promise((resoudre) => {
          const roule = () => {
            const k = (performance.now() - t0) / duree;
            for (const x of l) [...x.des.children].forEach((d, i) => { d.firstChild.textContent = String(1 + Math.floor(Math.random() * x.l.des[i].faces)); d.style.transform = `rotate(${Math.round((1 - k) * 40 * Math.sin(k * 20 + i))}deg)`; });
            if (k < 1) requestAnimationFrame(roule); else resoudre();
          };
          requestAnimationFrame(roule);
        });
      }
      for (const x of l) {
        x.des.replaceChildren(...x.l.des.map((d) => de(d, true)));
        x.total.style.visibility = '';
        if (x.res) { x.res.style.visibility = ''; x.res.animate([{ transform: 'scale(1.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' }); }
      }
      minuterie = setTimeout(() => { racine.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished.then(() => { racine.hidden = true; }).catch(() => {}); }, RESTE);
      if (duree > 0) await new Promise((r) => setTimeout(r, Math.min(450, duree)));
    }

    // --- Saga 1.35 : le tapis de la table (mode table) : des dés en verre qui roulent au milieu du plateau ---
    // Ouvert par un jet (il se referme seul) ou par le MJ / le joueur (touche D, le rail) : on y compose un
    // jet (les dés, une formule), on lance au bouton ou en glissant sur le tapis ; c'est la partie qui tire,
    // les dés s'arrêtent sur ses valeurs.
    const tapis = (() => {
      const boite = el('div', { className: 'des-tapis', hidden: true });
      const tete = el('div', { className: 'des-tapis-tete' });
      const totalEl = el('b', { className: 'des-tapis-total' });
      const toile = el('canvas');
      const fermer = el('button', { className: 'des-tapis-fermer', type: 'button', title: 'Fermer (Échap)' }, el('i', { className: 'codicon codicon-close' }));
      const compo = el('div', { className: 'des-tapis-compo' });
      const haut = el('div', { className: 'des-tapis-haut', title: 'Glisser : déplacer le tapis · double-clic : le remettre au centre' }, tete, totalEl);
      const coin = el('div', { className: 'des-tapis-coin', title: 'Glisser : changer la taille du tapis' });
      boite.append(haut, toile, compo, fermer, coin);
      conteneur.append(boite);
      // Saga 1.35.1 : le tapis se déplace (par son haut) et change de taille (par son coin) ; c'est retenu.
      let place = null;
      try { place = JSON.parse(localStorage.getItem('saga:des-tapis:place') || 'null'); } catch { place = null; }
      function appliquerPlace() {
        if (!place) { for (const k of ['left', 'top', 'width', 'height', 'transform']) boite.style.removeProperty(k); return; }
        const r = conteneur.getBoundingClientRect();
        const l = Math.max(300, Math.min(r.width - 16, place.l)), h = Math.max(220, Math.min(r.height - 16, place.h));
        const x = Math.max(8, Math.min(r.width - l - 8, place.x)), y = Math.max(8, Math.min(r.height - h - 8, place.y));
        Object.assign(boite.style, { left: `${x}px`, top: `${y}px`, width: `${l}px`, height: `${h}px`, transform: 'none' });
      }
      function glisserPlace(e, taille) {
        if (e.button !== 0) return;
        e.preventDefault();
        const r = conteneur.getBoundingClientRect(), b = boite.getBoundingClientRect();
        const d = { x: b.left - r.left, y: b.top - r.top, l: b.width, h: b.height }, x0 = e.clientX, y0 = e.clientY;
        const bouger = (m) => {
          place = taille ? { ...d, l: d.l + m.clientX - x0, h: d.h + m.clientY - y0 } : { ...d, x: d.x + m.clientX - x0, y: d.y + m.clientY - y0 };
          appliquerPlace();
        };
        const finir = () => {
          window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', finir);
          try { if (place) localStorage.setItem('saga:des-tapis:place', JSON.stringify(place)); } catch { /* stockage refusé */ }
        };
        window.addEventListener('pointermove', bouger);
        window.addEventListener('pointerup', finir);
      }
      haut.addEventListener('pointerdown', (e) => glisserPlace(e, false));
      coin.addEventListener('pointerdown', (e) => glisserPlace(e, true));
      haut.addEventListener('dblclick', () => { place = null; try { localStorage.removeItem('saga:des-tapis:place'); } catch { /* rien */ } appliquerPlace(); });
      window.addEventListener('resize', () => { if (!boite.hidden) appliquerPlace(); });
      let plateau = null, ouvertParMoi = false, attendu = null, lanceur = null, fin = 0, choix = {};
      const anime = () => { try { return localStorage.getItem('saga:des-animes') !== '0'; } catch { return true; } };
      function preparer() {
        boite.hidden = false;
        appliquerPlace();
        // Ouvert par un jet (pas à la main) : il laisse passer les clics vers le plateau.
        boite.classList.toggle('passif', !ouvertParMoi);
        if (!plateau) plateau = PlateauDes.creer(toile, { accent: getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ffb347', finir: () => fini?.() });
        plateau.anime = anime();
      }
      let fini = null;
      function cacher() { clearTimeout(fin); boite.hidden = true; ouvertParMoi = false; attendu = null; plateau?.vider(); }
      fermer.onclick = cacher;
      // La composition : les dés (un clic : +1, clic droit : −1), la formule, Lancer, Secret.
      const formule = el('input', { className: 'des-tapis-formule', type: 'text', placeholder: '1d20+@for', spellcheck: false, autocomplete: 'off' });
      const secret = el('input', { type: 'checkbox' });
      function dessinerCompo() {
        compo.replaceChildren();
        if (!lanceur) return;
        const puces = el('div', { className: 'des-tapis-puces' }, ...['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map((t) => {
          const b = el('button', { type: 'button', className: `des-tapis-puce${choix[t] ? ' on' : ''}` }, t === 'd100' ? 'd%' : t, choix[t] ? el('i', { textContent: String(choix[t]) }) : null);
          b.onclick = () => { choix[t] = (choix[t] || 0) + 1; ecrire(); };
          b.oncontextmenu = (e) => { e.preventDefault(); if (choix[t]) choix[t]--; ecrire(); };
          return b;
        }));
        const lancer = el('button', { type: 'button', className: 'des-tapis-lancer' }, el('i', { className: 'codicon codicon-play' }), 'Lancer');
        lancer.onclick = () => jeter({});
        compo.append(puces, el('div', { className: 'des-tapis-ligne' }, formule, el('label', { className: 'des-tapis-secret', title: lanceur.secretTitre || 'Un jet que seul le MJ voit' }, secret, el('span', { textContent: 'Secret' })), lancer));
      }
      function ecrire() {
        formule.value = Object.entries(choix).filter(([, n]) => n > 0).map(([t, n]) => `${n}${t}`).join('+');
        dessinerCompo();
      }
      formule.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); jeter({}); } e.stopPropagation(); };
      function jeter(main) {
        const f = formule.value.trim();
        if (!f || !lanceur) return;
        const types = PlateauDes.types(f);
        if (!types.length && !/^\/m\b/i.test(f)) return;
        preparer();
        clearTimeout(fin);
        tete.replaceChildren(el('span', { textContent: f }));
        totalEl.textContent = '';
        if (types.length) plateau.lancer(types, main);
        attendu = { types, depuis: performance.now() };
        lanceur.lancer(f, secret.checked);
        choix = {};
        dessinerCompo();
      }
      // Glisser sur le tapis : la main qui jette.
      let glisse = null;
      toile.addEventListener('pointerdown', (e) => { if (!lanceur) return; glisse = { x: e.offsetX, y: e.offsetY, t: performance.now() }; toile.setPointerCapture(e.pointerId); });
      toile.addEventListener('pointerup', (e) => {
        if (!glisse) return;
        const dt = Math.max(16, performance.now() - glisse.t) / 1000;
        const vx = (e.offsetX - glisse.x) / dt, vy = (e.offsetY - glisse.y) / dt;
        const g = glisse;
        glisse = null;
        if (Math.hypot(e.offsetX - g.x, e.offsetY - g.y) > 30) jeter({ x: g.x, y: g.y, vx, vy });
      });
      boite.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cacher(); e.stopPropagation(); } });

      return {
        get ouvert() { return !boite.hidden; },
        // Le lanceur : { lancer(formule, secret), formule: dernière formule }. Rester ouvert jusqu'à Fermer.
        ouvrir(l) {
          lanceur = l || lanceur;
          ouvertParMoi = true;
          preparer();
          boite.classList.remove('passif');
          plateau?.vider();
          if (!formule.value && l?.formule) formule.value = l.formule;
          tete.replaceChildren(el('span', { textContent: 'Choisis des dés, ou écris une formule (@for, @pb…) · glisse sur le tapis pour lancer' }));
          totalEl.textContent = '';
          dessinerCompo();
          setTimeout(() => formule.focus(), 30);
        },
        basculer(l) { if (!boite.hidden && ouvertParMoi) cacher(); else this.ouvrir(l); },
        cacher,
        // Un jet de la partie : les dés s'arrêtent sur ses valeurs (ceux qu'on a jetés, s'ils vont avec).
        montrer({ lignes }) {
          const des = lignes.flatMap((l) => l.des.map((d) => ({ t: `d${d.faces}`, v: d.valeur })));
          preparer();
          clearTimeout(fin);
          const types = des.map((d) => (PlateauDes.FACES[d.t] ? d.t : 'd6'));
          const deja = attendu && performance.now() - attendu.depuis < 6000 && attendu.types.join() === types.join() && plateau.des.length === types.length;
          attendu = null;
          if (!deja && types.length) plateau.lancer(types, {});
          const d = lignes[lignes.length - 1];
          tete.replaceChildren(...lignes.map((l) => el('div', { className: `des-tapis-ligne-jet${l.cache ? ' cache' : ''}` },
            l.cache ? el('i', { className: 'codicon codicon-eye-closed' }) : null,
            el('span', { textContent: [l.qui, l.quoi && l.quoi !== 'Jet' ? l.quoi : '', l.formule].filter(Boolean).join(' · ') }),
            lignes.length > 1 ? el('b', { textContent: ` = ${l.total}` }) : null,
            l.resultat ? el('span', { className: `des-resultat ${l.resultat}`, textContent: RESULTATS[l.resultat] || l.resultat }) : null)));
          totalEl.textContent = '';
          return new Promise((resoudre) => {
            const montrerTotal = () => {
              fini = null;
              totalEl.textContent = String(d.total);
              totalEl.animate?.([{ transform: 'scale(1.35)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
              if (!ouvertParMoi) fin = setTimeout(cacher, RESTE + 1200);
              resoudre();
            };
            fini = montrerTotal;
            setTimeout(() => plateau.poser(des.map((x) => x.v)), deja ? 0 : (plateau.anime ? 420 : 0));
            // Sans animation (ou plus de 10 dés), poser() suffit : le total tout de suite.
            setTimeout(() => { if (fini === montrerTotal) montrerTotal(); }, plateau.anime && types.length <= PlateauDes.MAX_ANIMES ? 4500 : 60);
          });
        },
      };
    })();
    const tapisActif = () => document.body.classList.contains('mode-table') && (() => { try { return localStorage.getItem('saga:des-tapis') !== '0'; } catch { return true; } })();
    const montrerClassique = montrer;

    return {
      montrer: (o) => (tapisActif() && o?.lignes?.length ? tapis.montrer(o) : montrerClassique(o)),
      tapis,
      vitesse(v) { vitesse = DUREES[v] !== undefined ? v : 'normale'; },
      cacher() { clearTimeout(minuterie); racine.hidden = true; },
    };
  }

  return { creer };
})();
