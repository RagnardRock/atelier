// Le mode table (Saga 0.14) : le panneau du MJ, à droite du plateau. Rien ici n'est montré aux joueurs.
//
//   Table      voir comme (MJ, les joueurs, un joueur), ouvrir l'écran des joueurs, pause
//   Pièces     qui voit chaque pièce, le brouillard, le pinceau (révéler ou cacher des cases à la main)
//   Pions      les héros et les monstres de la carte : leurs PV, qui les voit
//   Rencontres poser une rencontre sur la table, lancer le combat
//   Jets       un jet de dés, caché ou non ; le journal, avec « Révéler » sur les jets cachés
//   Musique    les musiques et les sons du dossier sons/ du jeu

const TablePanneau = (() => {
  function creer({ conteneur, table: T }) {
    const racine = el('div', { className: 'table-panneau' });
    conteneur.append(racine);
    let sons = [];
    window.saga.listeSons?.().then((l) => { sons = Array.isArray(l) ? l : []; dessiner(); }).catch(() => {});
    const ouverts = new Set(['table', 'pieces', 'pions', 'jets']);
    let jet = { formule: '1d20', quoi: '', cache: true };
    let enAttente = false;

    const select = (valeur, options, change) => {
      const s = el('select', { className: 'table-select' });
      for (const [v, l] of options) s.append(el('option', { value: v, textContent: l, selected: v === valeur }));
      s.value = valeur;
      s.onchange = () => { s.blur(); change(s.value); };
      return s;
    };
    const btn = (icone, texte, faire, { titre = '', classe = '' } = {}) => {
      const b = el('button', { className: `table-bouton ${classe}`, type: 'button', title: titre || texte }, el('i', { className: `codicon codicon-${icone}` }), texte ? el('span', { textContent: texte }) : null);
      b.onclick = faire;
      return b;
    };
    function section(id, titre, contenu) {
      const s = el('section', { className: `table-section${ouverts.has(id) ? ' ouverte' : ''}` });
      const t = el('button', { className: 'table-section-titre', type: 'button' }, el('i', { className: `codicon codicon-chevron-${ouverts.has(id) ? 'down' : 'right'}` }), el('span', { textContent: titre }));
      t.onclick = () => { if (ouverts.has(id)) ouverts.delete(id); else ouverts.add(id); dessiner(); };
      s.append(t);
      if (ouverts.has(id)) s.append(el('div', { className: 'table-section-corps' }, ...contenu()));
      return s;
    }

    function dessiner() {
      const jeu = T.jeu(), partie = T.partie(), carte = T.carte();
      if (!jeu || !partie?.table || !carte) return;
      const haut = racine.scrollTop;
      racine.innerHTML = '';
      const vis = T.VISIBILITES();
      racine.append(el('div', { className: 'table-panneau-tete' }, el('span', { className: 'table-panneau-rune', textContent: 'ᛃ' }), el('span', { textContent: 'Mode table · MJ' }), el('small', { textContent: carte.nom })));

      racine.append(section('table', 'Table', () => {
        const roles = [['mj', 'Moi, le MJ (tout)'], ['joueurs', 'Les joueurs (écran partagé)'], ...partie.equipe.filter((c) => c.jdr).map((c) => [`perso:${c.creature}`, `Le joueur de ${JdrPerso.nom(jeu, c)}`])];
        const actuel = !T.apercu ? 'mj' : T.apercu.perso ? `perso:${T.apercu.perso}` : 'joueurs';
        return [
          el('label', { className: 'table-ligne' }, el('span', { textContent: 'Voir comme' }), select(actuel, roles, (v) => { T.apercu = v === 'mj' ? null : { mj: false, perso: v.startsWith('perso:') ? v.slice(6) : null }; dessiner(); })),
          el('div', { className: 'table-boutons' },
            btn('screen-full', 'Écran des joueurs', () => window.saga.tableOuvrir?.(), { titre: 'Ouvrir la fenêtre des joueurs (à mettre sur la télé ou un 2e écran). Elle ne reçoit que ce que les joueurs ont le droit de voir.' }),
            btn(partie.table.pause ? 'debug-continue' : 'debug-pause', partie.table.pause ? 'Reprendre' : 'Pause', () => { T.agir({ type: 'pause', valeur: !partie.table.pause }); dessiner(); }, { classe: partie.table.pause ? 'actif' : '' }),
            btn('screen-normal', 'Recadrer', () => T.cadrer(), { titre: 'Remontrer toute la carte (molette : zoom, clic droit glissé : se déplacer)' })),
        ];
      }));

      const ps = TableEtat.pieces(carte);
      racine.append(section('pieces', `Pièces et brouillard${ps.length ? ` (${ps.length})` : ''}`, () => {
        const out = [];
        const b = TableEtat.brouillard(partie.table, carte);
        out.push(el('label', { className: 'table-ligne' }, el('span', { textContent: 'Brouillard' }), select(b ? 'oui' : 'non', [['oui', 'Oui, sur cette carte'], ['non', 'Non, tout se voit']], (v) => T.agir({ type: 'brouillard', valeur: v === 'oui' }))));
        if (!ps.length) out.push(el('p', { className: 'table-note', textContent: 'Pas de pièce sur cette carte : dans Tafl, une zone cochée « pièce » se révèle d\'un clic ici.' }));
        for (const z of ps) {
          const v = TableEtat.visibilitePiece(partie.table, carte, z);
          out.push(el('div', { className: 'table-ligne piece' },
            btn(v === 'tous' ? 'eye' : 'eye-closed', '', () => T.agir({ type: 'piece', piece: z.id, visible: v === 'tous' ? 'mj' : 'tous' }), { titre: v === 'tous' ? 'Cacher cette pièce aux joueurs' : 'Révéler cette pièce aux joueurs', classe: v === 'tous' ? 'actif' : '' }),
            el('span', { className: 'table-nom', textContent: z.nom || z.id }),
            select(v, vis, (nv) => T.agir({ type: 'piece', piece: z.id, visible: nv }))));
        }
        out.push(el('div', { className: 'table-boutons' },
          btn('lightbulb', 'Révéler au pinceau', () => { T.pinceau = T.pinceau === 'reveler' ? null : 'reveler'; dessiner(); }, { classe: T.pinceau === 'reveler' ? 'actif' : '', titre: 'Clique ou glisse sur le plateau pour montrer des cases aux joueurs' }),
          btn('circle-slash', 'Cacher au pinceau', () => { T.pinceau = T.pinceau === 'cacher' ? null : 'cacher'; dessiner(); }, { classe: T.pinceau === 'cacher' ? 'actif' : '' }),
          btn('discard', 'Tout recacher', () => T.agir({ type: 'tout_cacher' }), { titre: 'Remettre le brouillard partout sur cette carte (les pièces reprennent leur réglage de Tafl)' })));
        return out;
      }));

      const pions = TableEtat.pionsSur(partie.table, carte.id).filter((p) => !p.vaincu);
      racine.append(section('pions', `Pions (${pions.length})`, () => {
        const out = [];
        for (const p of pions) {
          const c = p.sorte === 'heros' ? TableEtat.membreDe(partie, p) : null;
          const nom = c ? JdrPerso.nom(jeu, c) : p.nom;
          const pv = c ? `${Math.max(0, c.pv)}/${JdrPerso.pvMax(jeu, c)}` : `${p.pv}/${p.pvMax}`;
          const ligne = el('div', { className: `table-ligne pion${T.selection === p.id ? ' choisi' : ''}${T.combat?.actif === p.id ? ' actif' : ''}` },
            el('i', { className: `codicon codicon-${p.sorte === 'heros' ? 'person' : 'flame'}` }),
            el('span', { className: 'table-nom', textContent: nom }),
            el('small', { className: 'table-pv', textContent: `${pv} PV` }));
          ligne.onclick = (e) => { if (e.target.closest('select, button')) return; T.selection = T.selection === p.id ? null : p.id; dessiner(); };
          if (p.sorte !== 'heros') ligne.append(select(TableEtat.normVisible(p.visible), vis, (v) => T.agir({ type: 'visibilite', pion: p.id, visible: v })));
          out.push(ligne);
        }
        if (T.combat?.ordre?.length) {
          out.push(el('div', { className: 'table-sous-titre', textContent: `Initiative · tour ${T.combat.tour || 1}` }));
          for (const o of T.combat.ordre) out.push(el('div', { className: `table-ligne ordre${T.combat.actif === o.id ? ' actif' : ''}` }, el('span', { className: 'table-init', textContent: String(o.init ?? '') }), el('span', { className: 'table-nom', textContent: o.nom })));
        } else out.push(el('p', { className: 'table-note', textContent: 'Clique un pion puis une case pour le déplacer. Clic droit : qui le voit.' }));
        return out;
      }));

      const groupes = jeu.donnees.groupes?.groupes || [];
      racine.append(section('rencontres', 'Rencontres', () => {
        if (!groupes.length) return [el('p', { className: 'table-note', textContent: 'Aucune rencontre dans ce jeu (Tafl › Données › Rencontres).' })];
        let choisi = groupes[0].id;
        const s = select(choisi, groupes.map((g) => [g.id, g.nom || g.id]), (v) => { choisi = v; });
        return [
          el('label', { className: 'table-ligne' }, s),
          el('div', { className: 'table-boutons' },
            btn('add', 'Poser sur la table', async () => {
              if (enAttente) return;
              enAttente = true;
              T.afficherAide?.('');
              T.message('Clique la case où poser la rencontre.');
              const c = await T.choisirCase(null);
              enAttente = false;
              if (c) T.agir({ type: 'groupe', groupe: choisi, x: c.x, y: c.y });
            }, { titre: 'Les monstres arrivent cachés ou non selon la rencontre (Visible par, dans Tafl). Clic droit sur un pion pour changer.' }),
            btn('flame', 'Lancer le combat', () => { if (T.combat || T.occupe()) return; T.lancerCombat(choisi); }, { titre: 'Les pions de cette rencontre déjà posés combattent ; ceux qui manquent arrivent près du groupe.' })),
        ];
      }));

      racine.append(section('jets', 'Jets de dés', () => {
        const formule = el('input', { className: 'table-champ', value: jet.formule, placeholder: '1d20+3', spellcheck: false });
        const quoi = el('input', { className: 'table-champ', value: jet.quoi, placeholder: 'Pour quoi ? (Perception…)' });
        const cache = el('input', { type: 'checkbox', checked: jet.cache });
        formule.oninput = () => { jet.formule = formule.value; };
        quoi.oninput = () => { jet.quoi = quoi.value; };
        cache.onchange = () => { jet.cache = cache.checked; };
        const lancer = () => {
          const r = JdrDes.lancer(partie, jet.formule || '1d20');
          if (!r.des.length && !r.bonus) { T.message(`Formule de dés incomprise : « ${jet.formule} »`); return; }
          const l = JdrDes.noter(partie, { qui: 'MJ', quoi: jet.quoi || 'Jet', formule: r.formule, des: r.des, bonus: r.bonus, total: r.total, cache: jet.cache });
          T.des({ titre: `${jet.quoi || 'Jet'}${jet.cache ? ' (caché)' : ''}`, lignes: [l] });
          dessiner();
        };
        formule.onkeydown = (e) => { if (e.key === 'Enter') lancer(); };
        const lignes = (partie.jdr?.journal || []).slice(-14).reverse();
        return [
          el('div', { className: 'table-ligne' }, formule, btn('debug-start', 'Lancer', lancer)),
          el('div', { className: 'table-ligne' }, quoi),
          el('label', { className: 'table-ligne coche' }, cache, el('span', { textContent: 'Caché aux joueurs' })),
          el('div', { className: 'table-journal' }, ...lignes.map((l) => el('div', { className: `table-jet${l.cache ? ' cache' : ''}` },
            el('div', { className: 'table-jet-tete' }, el('b', { textContent: l.qui }), el('span', { textContent: ` ${l.quoi}` }), el('span', { className: 'table-jet-total', textContent: String(l.total) })),
            el('div', { className: 'table-jet-detail', textContent: `${JdrDes.detail(l)}${l.resultat ? ` · ${JdrDes.RESULTATS[l.resultat] || l.resultat}` : ''}` }),
            l.cache ? btn('eye', 'Révéler', () => { l.cache = false; dessiner(); }, { classe: 'petit', titre: 'Montrer ce jet aux joueurs' }) : null))),
        ];
      }));

      racine.append(section('musique', 'Musique et sons', () => {
        const out = [el('div', { className: 'table-boutons' }, btn('mute', 'Silence', () => T.musique('aucune')), btn('home', 'Celle de la carte', () => T.musique('')))];
        if (!sons.length) out.push(el('p', { className: 'table-note', textContent: 'Pas de son dans le dossier sons/ du jeu.' }));
        for (const s of sons) {
          out.push(el('div', { className: 'table-ligne son' },
            el('span', { className: 'table-nom', textContent: s.replace(/^sons\//, '') }),
            btn('play', '', () => T.musique(s), { titre: 'Jouer en musique (en boucle)' }),
            btn('megaphone', '', () => T.son(s), { titre: 'Jouer une fois (un bruitage)' })));
        }
        return out;
      }));
      racine.scrollTop = haut;
    }

    // Le panneau se redessine quand la table change, pas à chaque image (au plus 5 fois par seconde).
    let prevu = 0;
    function rafraichir() {
      if (prevu) return;
      prevu = setTimeout(() => { prevu = 0; if (!racine.matches(':focus-within')) dessiner(); else setTimeout(rafraichir, 400); }, 200);
    }
    dessiner();
    return { rafraichir, dessiner, fermer() { clearTimeout(prevu); racine.remove(); } };
  }
  return { creer };
})();
