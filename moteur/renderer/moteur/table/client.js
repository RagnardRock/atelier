// Le mode table (Saga 0.14) : l'écran des joueurs. Une fenêtre à part (sur la télé, un 2e écran), qui
// montre le plateau tel que les joueurs ont le droit de le voir.
//
// Elle lit le jeu elle-même (les tuiles et les cartes, pour dessiner), mais l'état de la table ne vient
// que de la fenêtre du MJ : la vue des joueurs (table/etat.js › vue), où le caché n'est jamais. C'est le
// même rôle que tiendra l'écran de chaque ami dans le multijoueur. Un joueur peut y déplacer un héros
// (hors combat) et parler à un PNJ voisin : ce sont des demandes, que le MJ (l'hôte) vérifie.

const TableClient = (() => {
  function demarrer({ dossier, reseau = false }) {
    document.body.classList.add('ecran-joueurs', 'mode-table');
    document.title = 'Saga · écran des joueurs';
    $('#accueil').hidden = true;
    $('#titlebar').hidden = true;
    const scene = $('#scene');
    scene.hidden = false;
    $('#ecran').hidden = true;
    const canvas = el('canvas', { className: 'table-plateau' });
    const ordre = el('div', { className: 'joueurs-ordre', hidden: true });
    const boite = el('div', { className: 'joueurs-scene', hidden: true });
    const jets = el('div', { className: 'joueurs-jets' });
    const pauseEl = el('div', { className: 'joueurs-pause', hidden: true, textContent: 'Pause' });
    const attente = el('div', { className: 'joueurs-attente', textContent: 'En attente du MJ…' });
    // Saga 1.0 : la fiche du joueur (seul celui qui joue un héros la reçoit), avec ses jets.
    const fiche = el('aside', { className: 'joueurs-fiche', hidden: true });
    scene.append(canvas, ordre, boite, jets, pauseEl, attente, fiche);
    const plateau = Plateau.creer(canvas);
    // Saga 1.0 : un ami qui a rejoint par le réseau a aussi le panneau des joueurs et la discussion.
    const multi = reseau ? Multi.creer({ scene, moteur: null, message: (t) => notify?.(t, 'warning', 6000) }) : null;
    let jeu = null, vue = null, selection = null, survol = null;
    let dernierEffet = -1, dernierJet = -1;

    (async () => {
      try {
        jeu = await Jeu.charger(await window.saga.ouvrirJeu(dossier));
        document.title = `${jeu.titre} · écran des joueurs`;
      } catch (err) {
        attente.textContent = `Impossible d'ouvrir le jeu : ${err.message}`;
      }
    })();

    window.saga.onTableVue((json) => {
      let v;
      try { v = JSON.parse(json); } catch { return; }
      const carteAvant = vue?.carte;
      vue = v;
      if (carteAvant !== v.carte) plateau.oublier();
      montrer();
      montrerFiche();
    });

    // Ce qui n'est pas sur le canvas : l'ordre du tour, ce qui se dit, les jets montrés à tous, la pause.
    function montrer() {
      attente.hidden = Boolean(vue && jeu);
      pauseEl.hidden = !vue?.pause;
      ordre.hidden = !vue?.combat;
      if (vue?.combat) {
        ordre.innerHTML = '';
        ordre.append(el('span', { className: 'joueurs-tour', textContent: `Tour ${vue.combat.tour || 1}` }));
        for (const o of vue.combat.ordre) ordre.append(el('span', { className: `joueurs-ordre-nom${o.id === vue.combat.actif ? ' actif' : ''}`, textContent: o.nom }));
      }
      boite.hidden = !vue?.scene?.texte;
      if (vue?.scene?.texte) {
        boite.innerHTML = '';
        if (vue.scene.qui) boite.append(el('div', { className: 'joueurs-qui', textContent: vue.scene.qui }));
        boite.append(el('div', { className: 'joueurs-texte', textContent: vue.scene.texte }));
        if (vue.scene.choix) boite.append(el('div', { className: 'joueurs-choix' }, ...vue.scene.choix.map((c) => el('span', { textContent: c }))));
      }
      // Les nouveaux jets (ceux du MJ cachés n'arrivent jamais ici).
      const lignes = vue?.journal || [];
      if (dernierJet < 0) dernierJet = lignes.length ? lignes[lignes.length - 1].n : 0;
      for (const l of lignes.filter((x) => x.n > dernierJet)) {
        const r = l.resultat ? ` · ${JdrDes.RESULTATS[l.resultat] || l.resultat}` : '';
        const j = el('div', { className: `joueurs-jet ${l.resultat || ''}` },
          el('div', { className: 'joueurs-jet-tete' }, el('b', { textContent: l.qui }), el('span', { textContent: ` ${l.quoi}` }), el('span', { className: 'joueurs-jet-total', textContent: String(l.total) })),
          el('div', { className: 'joueurs-jet-detail', textContent: `${JdrDes.detail(l)}${r}` }));
        jets.prepend(j);
        setTimeout(() => j.classList.add('part'), 5200);
        setTimeout(() => j.remove(), 5800);
        dernierJet = l.n;
      }
      while (jets.children.length > 4) jets.lastChild.remove();
      // Les dégâts, les soins et les éclats des sorts, rejoués ici (pas ceux d'avant l'ouverture).
      if (dernierEffet < 0) dernierEffet = Math.max(0, ...(vue?.effets || []).map((x) => x.n));
      for (const e of (vue?.effets || []).filter((x) => x.n > dernierEffet)) {
        if (e.sorte === 'secousse') plateau.secouer(e.id);
        else if (e.sorte === 'eclat') plateau.eclat(e.id, e.couleur);
        else plateau.flotter(e.id, e.texte, e.sorte);
        dernierEffet = e.n;
      }
    }

    // --- La fiche du joueur : la lire, et lancer ses jets (c'est l'hôte qui lance les dés) ---
    let ongletFiche = 'caracs';
    let signature = '';
    function montrerFiche() {
      const f = vue?.fiche;
      fiche.hidden = !f;
      if (!f) return;
      // On ne redessine que si quelque chose a changé (sinon on gênerait les clics).
      const s = JSON.stringify([f.nom, f.pv, f.pvMax, f.ca, f.etats, ongletFiche]);
      if (s === signature) return;
      signature = s;
      fiche.innerHTML = '';
      fiche.append(el('div', { className: 'joueurs-fiche-tete' },
        el('b', { textContent: f.nom }),
        el('span', { className: 'joueurs-fiche-pv', textContent: `${f.pv} / ${f.pvMax} PV` }),
        el('span', { className: 'joueurs-fiche-ca', textContent: `CA ${f.ca}` })));
      if (f.etats?.length) fiche.append(el('div', { className: 'joueurs-fiche-etats', textContent: f.etats.join(', ') }));
      const onglets = el('div', { className: 'joueurs-onglets' });
      for (const [id, nom] of [['caracs', 'Caractéristiques'], ['competences', 'Compétences'], ['attaques', 'Attaques']]) {
        const b = el('button', { className: `joueurs-onglet${ongletFiche === id ? ' actif' : ''}`, type: 'button', textContent: nom });
        b.onclick = () => { ongletFiche = id; signature = ''; montrerFiche(); };
        onglets.append(b);
      }
      fiche.append(onglets);
      const corps = el('div', { className: 'joueurs-fiche-corps' });
      const signe = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
      const jet = (sorte, id, quoi) => window.saga.tableDemander({ type: 'jet', sorte, id, quoi });
      if (ongletFiche === 'caracs') {
        for (const c of f.caracs) {
          corps.append(el('div', { className: 'joueurs-fiche-ligne' },
            el('span', { className: 'joueurs-fiche-nom', textContent: `${c.nom} ${c.valeur}` }),
            bouton(`${signe(c.mod)}`, () => jet('test', c.id, c.nom), 'Lancer un test de cette caractéristique'),
            bouton(`Sauv. ${signe(c.sauvegarde)}`, () => jet('sauvegarde', c.id, ''), 'Lancer une sauvegarde')));
        }
      } else if (ongletFiche === 'competences') {
        for (const c of f.competences) {
          corps.append(el('div', { className: `joueurs-fiche-ligne${c.maitrise ? ' maitrise' : ''}` },
            el('span', { className: 'joueurs-fiche-nom', textContent: c.nom }),
            bouton(signe(c.bonus), () => jet('test', c.id, c.nom), 'Lancer ce test')));
        }
      } else {
        for (const a of f.attaques) {
          corps.append(el('div', { className: 'joueurs-fiche-ligne' },
            el('span', { className: 'joueurs-fiche-nom', textContent: a.nom }),
            el('small', { textContent: `${signe(a.bonus)} · ${a.des}${a.mod ? ` ${signe(a.mod)}` : ''}` })));
        }
        corps.append(el('p', { className: 'joueurs-fiche-note', textContent: 'En combat, c\'est le MJ qui mène les tours sur le plateau : dis-lui ce que tu fais (ou écris-le dans la discussion).' }));
      }
      fiche.append(corps);
    }
    function bouton(texte, faire, titre = '') {
      const b = el('button', { className: 'joueurs-jet-bouton', type: 'button', textContent: texte, title: titre });
      b.onclick = faire;
      return b;
    }

    // --- La souris : un héros, puis une case (ou un PNJ à côté) ---
    let glisse = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const { px, py } = pos(e); plateau.zoomer(e.deltaY < 0 ? 1 : -1, px, py); }, { passive: false });
    canvas.addEventListener('mousedown', (e) => {
      if (!jeu || !vue) return;
      const { px, py } = pos(e);
      if (e.button !== 0) { glisse = { x: e.clientX, y: e.clientY }; return; }
      const id = plateau.pionSous(px, py, jeu, vue);
      const c = plateau.caseSous(px, py, jeu);
      const p = id ? vue.pions.find((q) => q.id === id) : null;
      if (p?.sorte === 'heros') { selection = selection === id ? null : id; return; }
      if (!selection || vue.combat || vue.pause) return;
      if (id?.startsWith('ev:')) window.saga.tableDemander({ type: 'parler', pion: selection, id });
      else if (!id) window.saga.tableDemander({ type: 'deplacer', pion: selection, x: c.x, y: c.y });
    });
    window.addEventListener('mousemove', (e) => {
      if (!jeu) return;
      const { px, py } = pos(e);
      survol = plateau.caseSous(px, py, jeu);
      if (glisse) { plateau.glisser(e.clientX - glisse.x, e.clientY - glisse.y); glisse.x = e.clientX; glisse.y = e.clientY; }
    });
    window.addEventListener('mouseup', () => { glisse = null; });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') selection = null; });

    function tour(maintenant) {
      requestAnimationFrame(tour);
      if (!jeu || !vue) return;
      const carte = jeu.cartes.get(vue.carte);
      if (!carte) return;
      if (selection && !vue.pions.some((p) => p.id === selection)) selection = null;
      plateau.dessiner({ jeu, carte, vue, maintenant, mj: false, selection, survol });
    }
    requestAnimationFrame(tour);
    return { plateau, multi, get vue() { return vue; } };
  }
  return { demarrer };
})();
