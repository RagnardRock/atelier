// Composer son équipe librement (Saga 1.0, commande « composer son équipe » de Tafl 1.0).
//
// Un écran posé sur le jeu : toutes les créatures du jeu, une recherche, et jusqu'à N choix au niveau
// écrit par la carte. C'est fait pour les jeux « arène » (un duel entre deux joueurs qui prennent chacun
// leur équipe), mais un jeu peut s'en servir pour autre chose (un tournoi, un prêt de créatures…).
//
// Chaque créature choisie se règle ensuite : ses quatre attaques (parmi tout ce qu'elle sait à ce
// niveau, apprentissage et CT) et l'objet qu'elle tient. Sans rien toucher, elle a les attaques
// qu'elle connaîtrait à ce niveau et aucun objet.
//
//   EquipeLibre.creer(conteneur) → { ouvrir({ jeu, nombre, niveau, titre, bouton }), fermer, get ouvert }
// ouvrir() rend la liste des membres choisis — [{ id, attaques: [id], objet }] — ou null si le joueur
// ferme l'écran sans rien valider quand il en a le droit ; le jeu, lui, remplace l'équipe (scripts.js).

const EquipeLibre = (() => {
  function creer(conteneur) {
    const racine = el('div', { className: 'libre-ecran', hidden: true });
    conteneur.append(racine);
    let ouvert = null;

    // Échap ferme l'écran (quand on a le droit), et les touches ne vont pas au jeu derrière.
    window.addEventListener('keydown', (e) => {
      if (!ouvert) return;
      if (e.key === 'Escape') {
        if (ouvert.reglage) { e.preventDefault(); e.stopImmediatePropagation(); ouvert.reglage(); return; }
        if (ouvert.annulable) { e.preventDefault(); e.stopImmediatePropagation(); ouvert.finir(null); return; }
      }
      if (!e.target.closest?.('input')) e.stopImmediatePropagation();
    }, true);

    function ouvrir({ jeu, nombre = 6, niveau = 50, titre = 'Compose ton équipe', bouton = '', annulable = false } = {}) {
      const especes = (jeu.donnees.creatures?.creatures || []).filter((c) => c && c.id);
      const objets = Regles.objetsTenables(jeu);
      return new Promise((resoudre) => {
        const choisies = []; // [{ id, attaques: [id], objet }]
        const carte = el('div', { className: 'libre-carte' });
        const tete = el('div', { className: 'libre-tete' },
          el('h2', { textContent: titre }),
          el('span', { className: 'libre-compte' }));
        const recherche = el('input', { className: 'libre-recherche', type: 'search', placeholder: 'Chercher une créature…', spellcheck: false });
        const liste = el('div', { className: 'libre-liste' });
        const choix = el('div', { className: 'libre-choix' });
        const ok = el('button', { className: 'libre-ok', type: 'button', textContent: bouton || 'C\'est mon équipe !' });
        const aide = el('p', { className: 'libre-aide', textContent: especes.length ? `Clique jusqu'à ${nombre} créature${nombre > 1 ? 's' : ''} (niveau ${niveau}), deux fois la même si tu veux. En bas, clique une vignette pour choisir ses attaques et son objet, ou sa croix pour l'enlever.` : 'Ce jeu n\'a encore aucune créature : importe les données officielles dans Tafl (Loki › « Importe les données officielles Pokémon »), puis reviens ici.' });
        const reglage = el('div', { className: 'libre-reglage', hidden: true });
        carte.append(tete, recherche, liste, el('div', { className: 'libre-bas' }, choix, ok), aide, reglage);
        racine.append(carte);
        racine.hidden = false;

        const finir = (r) => {
          racine.hidden = true;
          racine.innerHTML = '';
          ouvert = null;
          resoudre(r);
        };
        ouvert = { finir, annulable, reglage: null };

        function dessiner() {
          const q = recherche.value.trim().toLowerCase();
          liste.innerHTML = '';
          for (const e of especes) {
            if (q && !`${e.nom || ''} ${e.id} ${e.officiel || ''}`.toLowerCase().includes(q)) continue;
            const prise = choisies.filter((x) => x.id === e.id).length;
            const b = el('button', { className: `libre-creature${prise ? ' prise' : ''}`, type: 'button', title: e.nom || e.id });
            const im = e.sprites?.face || e.image || '';
            b.append(...[
              im ? el('img', { src: im, alt: '' }) : el('span', { className: 'libre-vide', textContent: (e.nom || '?')[0] }),
              el('span', { className: 'libre-nom', textContent: e.nom || e.id }),
              prise ? el('b', { className: 'libre-prise', textContent: `×${prise}` }) : null,
            ].filter(Boolean));
            // Chaque clic en prend une de plus (deux fois la même espèce, c'est permis) ; la croix sur
            // sa vignette, en bas, la repose.
            b.onclick = () => {
              if (choisies.length >= nombre) return;
              choisies.push({ id: e.id, attaques: Regles.attaquesDefaut(jeu, e.id, niveau).slice(0, 4), objet: '' });
              dessiner();
            };
            liste.append(b);
          }
          if (!liste.children.length) liste.append(el('p', { className: 'libre-aide', textContent: especes.length ? 'Aucune créature ne correspond.' : '' }));
          tete.querySelector('.libre-compte').textContent = `${choisies.length} / ${nombre}`;
          choix.innerHTML = '';
          choisies.forEach((m, k) => {
            const e = especes.find((x) => x.id === m.id);
            const im = e?.sprites?.face || e?.image || '';
            const b = el('button', { className: 'libre-petite', type: 'button', title: `${e?.nom || m.id} : régler ses attaques et son objet` },
              im ? el('img', { src: im, alt: '' }) : el('span', { textContent: (e?.nom || '?')[0] }),
              m.objet ? el('i', { className: 'codicon codicon-circle-filled libre-tenu', title: 'Elle tient un objet' }) : null);
            b.onclick = () => regler(k);
            const moins = el('button', { className: 'libre-enlever', type: 'button', title: `Enlever ${e?.nom || m.id}` }, el('i', { className: 'codicon codicon-close' }));
            moins.onclick = () => { choisies.splice(k, 1); dessiner(); };
            choix.append(el('span', { className: 'libre-membre' }, b, moins));
          });
          ok.disabled = !choisies.length;
        }

        // --- Le réglage d'une créature choisie : ses attaques et son objet ---
        function regler(k) {
          const m = choisies[k];
          const e = especes.find((x) => x.id === m.id);
          const possibles = Regles.attaquesPossibles(jeu, m.id, niveau);
          reglage.innerHTML = '';
          const fermer = () => { reglage.hidden = true; reglage.innerHTML = ''; ouvert.reglage = null; dessiner(); };
          ouvert.reglage = fermer;

          const attaques = el('div', { className: 'libre-attaques' });
          const compte = el('span', { className: 'libre-compte' });
          const rechercheA = el('input', { className: 'libre-recherche', type: 'search', placeholder: 'Chercher une attaque…', spellcheck: false });
          const dessinerAttaques = () => {
            const q = rechercheA.value.trim().toLowerCase();
            attaques.innerHTML = '';
            // Les attaques choisies restent visibles, même quand la recherche ne les montre pas.
            const montrees = possibles.filter((a) => m.attaques.includes(a.id) || !q || `${a.nom} ${a.type} ${a.id}`.toLowerCase().includes(q));
            for (const a of montrees) {
              const prise = m.attaques.includes(a.id);
              const b = el('button', { className: `libre-attaque${prise ? ' prise' : ''}`, type: 'button', style: `--type: ${a.couleur}` },
                el('span', { className: 'libre-attaque-nom' },
                  el('i', { className: `codicon codicon-${prise ? 'check' : 'add'}` }),
                  el('span', { textContent: a.nom })),
                el('span', { className: 'libre-attaque-info' },
                  el('span', { className: 'libre-type', textContent: a.type || '—', style: `background: ${a.couleur}` }),
                  el('span', { textContent: a.puissance ? `${a.puissance}` : 'statut' })));
              b.onclick = () => {
                if (prise) m.attaques = m.attaques.filter((x) => x !== a.id);
                else if (m.attaques.length < 4) m.attaques.push(a.id);
                else return;
                dessinerAttaques();
              };
              attaques.append(b);
            }
            if (!montrees.length) attaques.append(el('p', { className: 'libre-aide', textContent: possibles.length ? 'Aucune attaque ne correspond.' : 'Cette créature n\'a aucune attaque dans les données du jeu.' }));
            compte.textContent = `${m.attaques.length} / 4 attaques`;
          };
          rechercheA.oninput = dessinerAttaques;
          dessinerAttaques();

          const aideAttaques = el('p', { className: 'libre-aide', textContent: 'Quatre attaques au plus, parmi tout ce qu\'elle sait à ce niveau (apprentissage, CT et capacités œufs). Sans choix, elle garde celles de son niveau.' });
          const bloc = el('div', { className: 'libre-reglage-carte' },
            el('div', { className: 'libre-tete' }, el('h2', { textContent: `${e?.nom || m.id}  N.${niveau}` }), compte),
            aideAttaques, rechercheA, attaques);

          // --- L'objet tenu : une recherche, pas une liste déroulante de 800 objets (Saga 1.7) ---
          const objetsBloc = el('div', { className: 'libre-objets', hidden: true });
          const rechercheO = el('input', { className: 'libre-recherche', type: 'search', placeholder: 'Chercher un objet…', spellcheck: false, hidden: true });
          const dessinerObjets = () => {
            const q = rechercheO.value.trim().toLowerCase();
            objetsBloc.innerHTML = '';
            const montres = objets.filter((o) => o.id === m.objet || !q || `${o.nom} ${o.id}`.toLowerCase().includes(q)).slice(0, 200);
            const ligne = (id, nom, description) => {
              const pris = m.objet === id;
              const b = el('button', { className: `libre-objet-choix${pris ? ' prise' : ''}`, type: 'button' },
                el('span', { className: 'libre-attaque-nom' }, el('i', { className: `codicon codicon-${pris ? 'check' : 'circle-large-outline'}` }), el('span', { textContent: nom })),
                description ? el('span', { className: 'libre-attaque-info', textContent: description }) : null);
              b.onclick = () => { m.objet = pris ? '' : id; dessinerObjets(); };
              return b;
            };
            objetsBloc.append(ligne('', 'Aucun objet', 'Elle ne tient rien.'));
            for (const o of montres) objetsBloc.append(ligne(o.id, o.nom, (o.description || '').slice(0, 90)));
            if (!montres.length) objetsBloc.append(el('p', { className: 'libre-aide', textContent: 'Aucun objet ne correspond.' }));
          };

          rechercheO.oninput = dessinerObjets;

          // --- Les détails : nature, talent, IV et EV (Saga 1.7) ---
          const details = Regles.detailsPossibles(jeu, m.id);
          const detailsBloc = el('div', { className: 'libre-details', hidden: true });
          if (details) {
            if (!m.ivs) m.ivs = Object.fromEntries(details.stats.map(([x]) => [x, details.ivMax]));
            if (!m.evs) m.evs = Object.fromEntries(details.stats.map(([x]) => [x, 0]));
            const evCompte = el('span', { className: 'libre-compte' });
            const majEv = () => {
              const total = details.stats.reduce((t, [x]) => t + (Number(m.evs[x]) || 0), 0);
              evCompte.textContent = `${total} / ${details.evTotal} EV`;
              evCompte.classList.toggle('trop', total > details.evTotal);
            };
            const nature = el('select', { className: 'libre-objet' }, ...details.natures.map(([id, nom]) => el('option', { value: id, textContent: nom, selected: id === m.nature })));
            if (!m.nature) m.nature = nature.value;
            nature.onchange = () => { m.nature = nature.value; };
            detailsBloc.append(el('label', { className: 'libre-ligne' }, el('span', { textContent: 'Nature' }), nature));
            if (details.talents.length) {
              const talent = el('select', { className: 'libre-objet' }, ...details.talents.map(([id, nom]) => el('option', { value: id, textContent: nom, selected: id === m.talent })));
              if (!m.talent) m.talent = talent.value;
              talent.onchange = () => { m.talent = talent.value; };
              detailsBloc.append(el('label', { className: 'libre-ligne' }, el('span', { textContent: 'Talent' }), talent));
            }
            const curseurs = (cle, max, titre, extra) => {
              const tete = el('div', { className: 'libre-tete' }, el('b', { textContent: titre }), extra);
              const grille = el('div', { className: 'libre-stats' });
              for (const [x, nom] of details.stats) {
                const valeur = el('b', { className: 'libre-valeur', textContent: String(m[cle][x] ?? 0) });
                const barre = el('input', { className: 'libre-curseur', type: 'range', min: '0', max: String(max), step: '1', value: String(m[cle][x] ?? 0) });
                barre.oninput = () => { m[cle][x] = Number(barre.value); valeur.textContent = barre.value; if (cle === 'evs') majEv(); };
                grille.append(el('label', { className: 'libre-stat' }, el('span', { textContent: nom }), barre, valeur));
              }
              detailsBloc.append(tete, grille);
              return grille;
            };
            const toutIv = el('button', { className: 'libre-petit-bouton', type: 'button', textContent: 'Tout au max' });
            const grilleIv = curseurs('ivs', details.ivMax, 'IV (le potentiel, 0 à 31)', toutIv);
            toutIv.onclick = () => {
              for (const [x] of details.stats) m.ivs[x] = details.ivMax;
              grilleIv.querySelectorAll('.libre-stat').forEach((l) => { l.querySelector('input').value = String(details.ivMax); l.querySelector('.libre-valeur').textContent = String(details.ivMax); });
            };
            const videEv = el('button', { className: 'libre-petit-bouton', type: 'button', textContent: 'Tout à zéro' });
            const grilleEv = curseurs('evs', details.evMax, 'EV (l\'entraînement)', el('span', { className: 'libre-tete-fin' }, evCompte, videEv));
            videEv.onclick = () => {
              for (const [x] of details.stats) m.evs[x] = 0;
              grilleEv.querySelectorAll('.libre-stat').forEach((l) => { l.querySelector('input').value = '0'; l.querySelector('.libre-valeur').textContent = '0'; });
              majEv();
            };
            majEv();
            detailsBloc.append(el('p', { className: 'libre-aide', textContent: `252 EV au plus par statistique, ${details.evTotal} en tout, comme dans les jeux officiels.` }));
          }

          // Les trois onglets de la fiche.
          const onglets = el('div', { className: 'libre-onglets' });
          const pages = [['attaques', 'Attaques', [aideAttaques, rechercheA, attaques]], ['objet', 'Objet tenu', [rechercheO, objetsBloc]]];
          if (details) pages.push(['details', 'Détails', [detailsBloc]]);
          const montrer = (id) => {
            for (const [pid, , els] of pages) for (const x of els) x.hidden = pid !== id;
            onglets.querySelectorAll('button').forEach((b) => b.classList.toggle('actif', b.dataset.page === id));
            if (id === 'objet') { dessinerObjets(); rechercheO.focus(); }
          };
          for (const [id, nom] of pages) {
            if (id === 'objet' && !objets.length) continue;
            const b = el('button', { className: 'libre-onglet', type: 'button', textContent: nom });
            b.dataset.page = id;
            b.onclick = () => montrer(id);
            onglets.append(b);
          }
          bloc.append(objetsBloc, detailsBloc);
          bloc.insertBefore(onglets, aideAttaques);
          bloc.insertBefore(rechercheO, objetsBloc);
          montrer('attaques');

          const fini = el('button', { className: 'libre-ok', type: 'button', textContent: 'C\'est bon' });
          fini.onclick = fermer;
          bloc.append(el('div', { className: 'libre-bas' }, el('span', { className: 'libre-espace' }), fini));
          reglage.append(bloc);
          reglage.hidden = false;
        }

        recherche.oninput = dessiner;
        ok.onclick = () => { if (choisies.length) finir(choisies.map((m) => ({ ...m, attaques: [...m.attaques] }))); };
        dessiner();
        recherche.focus();
      });
    }
    function fermer() { if (ouvert) ouvert.finir(null); }
    return { ouvrir, fermer, get ouvert() { return Boolean(ouvert); } };
  }
  return { creer };
})();
