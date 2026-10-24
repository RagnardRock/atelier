// Les écrans du joueur (Saga 0.6) : le menu Équipe (résumé, changer l'ordre, surnom), le Pokédex et
// le PC avec ses boîtes. Ils sont faits avec les menus de menus.js, donc ils suivent le thème du jeu
// (verre ou pixel), au clavier, à la manette et à la souris.
//
// Ce fichier ne connaît pas les règles : ce qu'une fiche montre vient de Regles.fiche et
// Regles.ficheEspece, le nom du Pokédex de Regles.dex ; les places viennent de collection.js.

const Ecrans = (() => {
  function creer({ jeu, partie, menus }) {
    const r = (c) => Regles.resume(jeu, c);
    const ligne = (c, detail = null) => {
      const x = r(c);
      return {
        texte: `${x.nom}${x.statut ? `  ${x.statut}` : ''}`, image: x.espece?.sprites?.face || '', pv: x.pv / Math.max(1, x.pvMax),
        detail: detail ?? `N.${x.niveau} · ${x.pv > 0 ? `${x.pv}/${x.pvMax}` : 'K.O.'}`,
      };
    };
    const lignesEquipe = () => partie().equipe.map((c) => ligne(c));
    // La forme des menus (Regles.menus) : noms, Pokédex montré ou non, boîtes, pages du résumé.
    const forme = () => Regles.menus(jeu);

    // --- Le menu Équipe ---
    async function equipe(depart = 0) {
      let i = depart;
      for (;;) {
        const p = partie();
        if (!p.equipe.length) { await menus.liste({ titre: forme().equipe, items: [], note: 'Pas encore de compagnon.' }); return; }
        i = await menus.liste({ titre: forme().equipe, entete: `${p.equipe.length} / ${Collection.equipeMax(jeu)}`, items: lignesEquipe(), depart: Math.min(i, p.equipe.length - 1) });
        if (i == null) return;
        const c = p.equipe[i], nom = r(c).nom;
        const actions = [['resume', 'Résumé'], ...(p.equipe.length > 1 ? [['place', 'Changer de place']] : []), ['surnom', 'Surnom'], ['retour', 'Retour']];
        const a = await menus.liste({ titre: nom, items: actions.map(([, t]) => ({ texte: t })) });
        const choix = a == null ? 'retour' : actions[a][0];
        if (choix === 'resume') i = await resume(p.equipe, i);
        else if (choix === 'place') {
          const j = await menus.liste({ titre: `Échanger ${nom} avec…`, items: lignesEquipe(), depart: i });
          if (j != null && j !== i) { [p.equipe[i], p.equipe[j]] = [p.equipe[j], p.equipe[i]]; i = j; }
        } else if (choix === 'surnom') await surnom(c);
      }
    }

    // Le résumé : haut/bas passe aux autres créatures de la liste. Rend l'index de la dernière vue.
    async function resume(liste, i) {
      const j = await menus.fiche({ fiches: liste.map((c) => Regles.fiche(jeu, c)), i });
      return j ?? i;
    }

    async function surnom(c) {
      const espece = r({ ...c, surnom: '' }).nom;
      const t = await menus.texte({ titre: `Surnom de ${espece}`, valeur: c.surnom || '', max: 12, vide: `il s'appellera ${espece}` });
      if (t != null) c.surnom = t;
    }

    // --- Le Pokédex ---
    async function dex() {
      if (!forme().dex_visible) return;
      const { nom, especes } = Regles.dex(jeu);
      let i = -1;
      for (;;) {
        const { vus, pris } = partie().dex;
        const connues = especes.filter((e) => vus[e.id]);
        i = await menus.liste({
          titre: nom, large: true, saut: 10, depart: i,
          entete: `Vus ${connues.length} · Attrapés ${especes.filter((e) => pris[e.id]).length} · ${especes.length} en tout`,
          note: connues.length ? '' : 'Tu n\'as encore vu aucune créature. Celles que tu croises en combat s\'inscrivent ici.',
          items: especes.map((e) => ({
            texte: `${e.numero}   ${vus[e.id] ? e.nom : '???'}`, image: vus[e.id] ? e.image : '',
            detail: pris[e.id] ? 'attrapé' : vus[e.id] ? 'vu' : '', desactive: !vus[e.id],
          })),
        });
        if (i == null) return;
        // Sa fiche ; haut/bas passe aux autres espèces vues.
        const k = connues.findIndex((e) => e.id === especes[i].id);
        const j = await menus.fiche({ fiches: connues.map((e) => Regles.ficheEspece(jeu, e.id, { pris: Boolean(pris[e.id]), vus })), i: Math.max(0, k) });
        if (j != null) i = especes.indexOf(connues[j]);
      }
    }

    // --- Le PC : les boîtes à gauche, l'équipe à droite ---
    // Au clavier : les flèches bougent le curseur (tout en haut : le nom de la boîte, où gauche/droite
    // change de boîte), Action prend une créature puis la pose (sur une autre : elles s'échangent).
    async function boites() {
      const C = Collection, F = forme();
      const N = F.places, L = F.forme_boites === 'liste' ? 1 : Math.min(F.colonnes, N), lignes = Math.ceil(N / L);
      const p = partie();
      let b = 0;
      let curseur = { zone: 'boite', i: 0 };   // zone : 'tete', 'boite' ou 'equipe'
      let main = null;                         // la créature tenue : { c, de: { ou, b, i } }
      let note = '';

      const equipeVivante = () => p.equipe.some((c) => c.pv > 0);
      // Poser la créature tenue à une place ; celle qui y était passe dans la main.
      function poser(zone, i) {
        const avant = equipeVivante() || (main.de.ou === 'equipe' && main.c.pv > 0);
        let prise = null;
        if (zone === 'equipe') {
          if (i < p.equipe.length) { prise = p.equipe[i]; p.equipe[i] = main.c; }
          else p.equipe.push(main.c);
        } else {
          prise = p.boites[b].creatures[i];
          p.boites[b].creatures[i] = main.c;
        }
        // L'équipe doit garder une créature en état de se battre : sinon on annule.
        if (avant && !equipeVivante()) {
          if (zone === 'equipe') { if (prise) p.equipe[i] = prise; else p.equipe.pop(); } else p.boites[b].creatures[i] = prise;
          note = 'Garde au moins une créature en état de se battre dans ton équipe !';
          return;
        }
        const de = { ou: zone === 'equipe' ? 'equipe' : 'boite', b, i };
        main = prise ? { c: prise, de } : null;
        note = '';
      }
      function prendre(zone, i) {
        if (zone === 'equipe') { main = { c: p.equipe[i], de: { ou: 'equipe', i } }; p.equipe.splice(i, 1); }
        else { main = { c: p.boites[b].creatures[i], de: { ou: 'boite', b, i } }; p.boites[b].creatures[i] = null; }
        note = 'Action : la poser ici · sur une autre, elles s\'échangent';
      }
      // En quittant avec une créature en main : elle retourne d'où elle vient (ou dans une place libre).
      function reposer() {
        if (!main) return;
        const { c, de } = main;
        if (de.ou === 'equipe' && p.equipe.length < C.equipeMax(jeu)) p.equipe.splice(Math.min(de.i, p.equipe.length), 0, c);
        else if (de.ou === 'boite' && !p.boites[de.b].creatures[de.i]) p.boites[de.b].creatures[de.i] = c;
        else C.deposer(jeu, p, c, de.b || 0);
        main = null;
      }
      const creatureEn = (zone, i) => (zone === 'equipe' ? p.equipe[i] : zone === 'boite' ? p.boites[b].creatures[i] : null);

      for (;;) {
        // L'écran lui-même : il se ferme sur un choix (une créature à qui proposer des actions,
        // le nom de la boîte), ou null pour quitter.
        const choix = await menus.ecran((boite, fermer, aide) => {
          const grille = el('div', { className: `pc-grille${L === 1 ? ' pc-liste' : ''}`, style: `grid-template-columns: repeat(${L}, minmax(0, 1fr))` });
          const colonne = el('div', { className: 'pc-equipe' });
          const nomBoite = el('span', { className: 'pc-nom' });
          const fleche = (d, txt) => el('button', { className: 'perso-fleche', type: 'button', textContent: txt, onclick: () => { changerBoite(d); maj(); } });
          const tete = el('div', { className: 'pc-tete' }, fleche(-1, '◀'), nomBoite, fleche(1, '▶'));
          const info = el('div', { className: 'pc-info' });
          const msg = el('div', { className: 'pc-note' });
          const enMain = el('div', { className: 'pc-main' });
          const compte = el('span', { className: 'menu-entete' });
          boite.append(
            el('div', { className: 'combat-liste-titre menu-tete' }, el('span', { textContent: F.pc }), compte),
            el('div', { className: 'pc-corps' }, el('div', { className: 'pc-gauche' }, tete, grille), el('div', { className: 'pc-droite' }, el('div', { className: 'pc-equipe-titre', textContent: F.equipe }), colonne)),
            enMain, info, msg,
            aide('Flèches : bouger · Action : prendre / poser / actions · En haut : changer de boîte · Échap : quitter'));
          // Après la dernière boîte : une nouvelle, si la dernière n'est pas déjà vide.
          const changerBoite = (d) => {
            if (d > 0 && b === p.boites.length - 1 && p.boites[b].creatures.some(Boolean)) p.boites.push(C.boiteVide(jeu, p.boites.length + 1));
            b = (b + d + p.boites.length) % p.boites.length;
          };
          // Une place : l'image seule dans une grille ; en liste, l'image, le nom et le niveau.
          const caseDe = (c, actif, enListe = false) => {
            const x = c ? r(c) : null;
            return el('div', { className: `pc-case${actif ? ' actif' : ''}${c && c.pv <= 0 ? ' ko' : ''}`, title: x ? `${x.nom} N.${x.niveau}` : '' },
              x?.espece?.sprites?.face ? el('img', { src: x.espece.sprites.face, alt: '' }) : c ? el('span', { className: 'pc-sans-image', textContent: x.nom.slice(0, 2) }) : null,
              enListe ? el('span', { className: 'pc-case-nom', textContent: x ? x.nom : '—' }) : null,
              enListe && x ? el('span', { className: 'pc-case-niveau', textContent: `N.${x.niveau}` }) : null);
          };
          function maj() {
            const bo = p.boites[b];
            nomBoite.textContent = `${bo.nom}  ·  ${bo.creatures.filter(Boolean).length}/${N}`;
            const n = C.toutes(p).length + (main ? 1 : 0);
            compte.textContent = `${n} créature${n > 1 ? 's' : ''}`;
            tete.classList.toggle('actif', curseur.zone === 'tete');
            grille.replaceChildren(...bo.creatures.map((c, i) => {
              const d = caseDe(c, curseur.zone === 'boite' && curseur.i === i, L === 1);
              d.onclick = () => { curseur = { zone: 'boite', i }; agir(); };
              return d;
            }));
            if (curseur.zone === 'boite') grille.children[curseur.i]?.scrollIntoView({ block: 'nearest' });
            const max = C.equipeMax(jeu);
            colonne.replaceChildren(...Array.from({ length: max }, (_, i) => {
              const d = caseDe(p.equipe[i], curseur.zone === 'equipe' && curseur.i === i);
              d.onclick = () => { curseur = { zone: 'equipe', i }; agir(); };
              return d;
            }));
            const sous = main ? main.c : creatureEn(curseur.zone, curseur.i);
            const x = sous ? r(sous) : null;
            enMain.replaceChildren(...(main ? [el('span', { textContent: 'En main : ' }), caseDe(main.c, false)] : []));
            info.textContent = x ? `${x.nom} · N.${x.niveau} · ${x.pv > 0 ? `${x.pv}/${x.pvMax} PV` : 'K.O.'}${x.statut ? ` · ${x.statut}` : ''}` : curseur.zone === 'tete' ? 'Gauche/droite : changer de boîte · Action : la renommer' : '';
            msg.textContent = note;
          }
          function agir() {
            if (curseur.zone === 'tete') return fermer({ type: 'boite' });
            const c = creatureEn(curseur.zone, curseur.i);
            if (main) poser(curseur.zone, curseur.zone === 'equipe' ? Math.min(curseur.i, p.equipe.length) : curseur.i);
            else if (c) return fermer({ type: 'creature', zone: curseur.zone, i: curseur.i });
            maj();
          }
          function bouger(t) {
            const k = curseur;
            if (k.zone === 'tete') {
              if (t === 'gauche' || t === 'droite') changerBoite(t === 'droite' ? 1 : -1);
              else if (t === 'bas') curseur = { zone: 'boite', i: 0 };
            } else if (k.zone === 'boite') {
              const x = k.i % L, y = Math.floor(k.i / L);
              if (t === 'haut') curseur = y === 0 ? { zone: 'tete', i: 0 } : { zone: 'boite', i: k.i - L };
              else if (t === 'bas' && k.i + L < N) curseur = { zone: 'boite', i: k.i + L };
              else if (t === 'gauche' && x > 0) curseur = { zone: 'boite', i: k.i - 1 };
              else if (t === 'droite') curseur = x < L - 1 ? { zone: 'boite', i: k.i + 1 } : { zone: 'equipe', i: Math.min(y, C.equipeMax(jeu) - 1) };
            } else {
              const max = C.equipeMax(jeu);
              if (t === 'haut') curseur = { zone: 'equipe', i: (k.i - 1 + max) % max };
              else if (t === 'bas') curseur = { zone: 'equipe', i: (k.i + 1) % max };
              else if (t === 'gauche') curseur = { zone: 'boite', i: Math.min(N - 1, Math.min(lignes - 1, k.i) * L + L - 1) };
            }
          }
          maj();
          return {
            touche(t) {
              if (t === 'action') return agir();
              if (t === 'retour') {
                if (main) { reposer(); note = ''; maj(); return; } // Échap avec une créature en main : on la repose
                return fermer(null);
              }
              bouger(t);
              maj();
            },
          };
        });
        if (!choix) { reposer(); return; }

        if (choix.type === 'boite') {
          const t = await menus.texte({ titre: 'Nom de la boîte', valeur: p.boites[b].nom, max: C.NOM_MAX, vide: C.nomBoite(jeu, b + 1) });
          if (t != null) p.boites[b].nom = t || C.nomBoite(jeu, b + 1);
          continue;
        }
        // Les actions sur une créature.
        const { zone, i } = choix;
        const c = creatureEn(zone, i), nom = r(c).nom;
        const max = C.equipeMax(jeu);
        const actions = [
          ['deplacer', 'Déplacer'],
          zone === 'equipe' ? ['deposer', `Déposer dans ${p.boites[b].nom}`] : ['retirer', 'Prendre dans l\'équipe'],
          ['resume', 'Résumé'], ['surnom', 'Surnom'], ['relacher', 'Relâcher'], ['retour', 'Retour'],
        ];
        const bloque = (id) => (id === 'deposer' || id === 'relacher') && zone === 'equipe' && !Collection.peutQuitterEquipe(p, i)
          || id === 'retirer' && p.equipe.length >= max;
        const a = await menus.liste({
          titre: nom, items: actions.map(([id, t]) => ({ texte: t, desactive: bloque(id), detail: bloque(id) ? (id === 'retirer' ? 'équipe pleine' : 'la dernière en forme') : '' })),
        });
        const quoi = a == null ? 'retour' : actions[a][0];
        if (quoi === 'deplacer') prendre(zone, i);
        else if (quoi === 'deposer') {
          p.equipe.splice(i, 1);
          const dans = C.deposer(jeu, p, c, b);
          b = p.boites.indexOf(dans);
          note = `${nom} va dans ${dans.nom}.`;
          curseur = { zone: 'equipe', i: Math.min(i, Math.max(0, p.equipe.length - 1)) };
        } else if (quoi === 'retirer') {
          p.boites[b].creatures[i] = null;
          p.equipe.push(c);
          note = `${nom} rejoint ton équipe.`;
        } else if (quoi === 'resume') {
          const liste = zone === 'equipe' ? p.equipe : p.boites[b].creatures.filter(Boolean);
          await resume(liste, liste.indexOf(c));
        } else if (quoi === 'surnom') await surnom(c);
        else if (quoi === 'relacher') {
          const ok = await menus.liste({ titre: `Relâcher ${nom} ?`, note: 'Une créature relâchée ne revient pas.', items: [{ texte: 'Oui, la relâcher' }, { texte: 'Non' }], depart: 1 });
          if (ok === 0) {
            Collection.enlever(p, { ou: zone, b, i });
            note = `${nom} retourne à la nature. Au revoir, ${nom} !`;
          }
        }
      }
    }

    return { equipe, dex, boites };
  }

  return { creer };
})();
