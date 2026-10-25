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
  const RESULTATS = { reussi: 'Réussi', rate: 'Raté', critique: 'Critique !', echec_critique: 'Échec critique', touche: 'Touché', manque: 'Manqué' };

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
      // En combat, le plateau passe en haut à gauche : à droite, il cacherait les héros.
      racine.classList.toggle('en-combat', Boolean(conteneur.querySelector('.combat:not([hidden])')));
      racine.hidden = false;
      racine.getAnimations().forEach((a) => a.cancel());
      racine.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: 'ease-out' });
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

    return {
      montrer,
      vitesse(v) { vitesse = DUREES[v] !== undefined ? v : 'normale'; },
      cacher() { clearTimeout(minuterie); racine.hidden = true; },
    };
  }

  return { creer };
})();
