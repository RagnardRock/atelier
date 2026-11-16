// Le mode table (Saga 0.14) : le panneau du MJ, à droite du plateau. Rien ici n'est montré aux joueurs.
//
// Saga 1.35 : un panneau en verre à onglets, par-dessus le plateau (qui prend tout l'écran), et
// l'habillage autour (table/interface.js : la barre du haut, l'initiative, le pion choisi, les macros).
//
//   Chat      les jets de dés, la discussion avec les amis et les phrases du combat, mêlés ; une ligne pour
//             écrire (/r, /gr, /m). Le menu du tour d'un combat est un encart à côté du plateau (table.js).
//   Pions     les héros et les monstres de la carte : leurs PV, qui les voit, la fiche d'un héros
//   Scène     la campagne (son nom, le fond des téléphones), le brouillard, les rencontres (lancer un combat),
//             la musique, les dés
//   Docs      Saga 1.37 : les documents du MJ (images, lettres, cartes, indices), à donner à un joueur, à
//             plusieurs ou à tous, et à montrer sur leurs écrans
//   Joueurs   le multijoueur : ouvrir la partie, qui est là, quel héros chacun joue, les téléphones

const TablePanneau = (() => {
  const ONGLETS = [['chat', 'Chat', 'comment-discussion'], ['pions', 'Pions', 'person'], ['scene', 'Scène', 'map'], ['docs', 'Docs', 'files'], ['joueurs', 'Joueurs', 'organization']];
  const lire = (k, d) => { try { const v = localStorage.getItem(`saga:table:${k}`); return v == null ? d : v; } catch { return d; } };
  const ecrire = (k, v) => { try { localStorage.setItem(`saga:table:${k}`, String(v)); } catch { /* stockage refusé */ } };

  // La carte d'un jet dans le fil (le MJ et l'écran d'un ami la dessinent pareil).
  const heureDe = (t) => {
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    return s < 45 ? 'maintenant' : s < 3600 ? `il y a ${Math.round(s / 60)} min` : new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };
  function carteJetCommune(l, action = null) {
    const res = l.resultat ? el('span', { className: `table-jet-res ${l.resultat}`, textContent: JdrDes.RESULTATS[l.resultat] || l.resultat }) : null;
    const b = el('div', { className: `table-jet${l.cache ? ' cache' : ''}` },
      el('div', { className: 'table-jet-tete' },
        l.cache ? el('i', { className: 'codicon codicon-eye-closed' }) : null,
        el('span', { textContent: [l.qui, l.quoi && l.quoi !== 'Jet' ? l.quoi : ''].filter(Boolean).join(' · ') + (l.cache ? ' (secret)' : '') }),
        el('small', { textContent: l.cache ? (l.voit ? 'le MJ et son auteur' : 'MJ seulement') : heureDe(l.heure) })),
      el('div', { className: 'table-jet-corps' },
        el('span', { className: 'table-jet-des' },
          ...l.des.map((d) => el('span', { className: `table-de d${d.faces}${d.garde ? '' : ' ecarte'}${d.garde && d.valeur === d.faces ? ' max' : ''}${d.garde && d.valeur === 1 && d.faces === 20 ? ' min' : ''}`, title: `d${d.faces}`, textContent: String(d.valeur) })),
          l.bonus ? el('span', { className: 'table-jet-bonus', textContent: `${l.bonus > 0 ? '+' : '−'}${Math.abs(l.bonus)}` }) : null),
        el('span', { className: 'table-jet-fin' }, el('b', { className: 'table-jet-total', textContent: String(l.total) }), res, action)));
    return b;
  }

  // Une phrase du combat (« Thorgrim touche le gobelin ») dans le fil.
  const ligneRecit = (e) => el('div', { className: 'table-dit recit' }, e.qui ? el('b', { textContent: `${e.qui} : ` }) : null, el('span', { textContent: e.texte }));

  function creer({ conteneur, scene, table: T }) {
    // Le panneau : ses onglets, un volet par onglet.
    const racine = el('div', { className: 'table-panneau' });
    const onglets = el('nav', { className: 'table-onglets' });
    const volets = {};
    for (const [id] of ONGLETS) volets[id] = el('div', { className: `table-volet volet-${id}`, hidden: true });
    const poignee = el('div', { className: 'table-poignee', title: 'Glisser : élargir ou réduire le panneau' });
    racine.append(onglets, ...Object.values(volets));
    conteneur.append(poignee, racine);
    let onglet = lire('onglet', 'chat');
    if (!volets[onglet]) onglet = 'chat';
    const interfaceMj = scene ? TableInterface.creer({ scene, table: T }) : null;
    T.marges = () => interfaceMj?.marges() || {};

    // La largeur du panneau, réglable et retenue.
    let largeur = Math.max(280, Math.min(560, Number(lire('largeur', 340)) || 340));
    const appliquerLargeur = () => document.body.style.setProperty('--table-panneau', `${largeur}px`);
    appliquerLargeur();
    poignee.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const x0 = e.clientX, l0 = largeur;
      const bouger = (m) => { largeur = Math.max(280, Math.min(560, l0 + (x0 - m.clientX))); appliquerLargeur(); };
      const finir = () => { window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', finir); ecrire('largeur', largeur); T.cadrer(); };
      window.addEventListener('pointermove', bouger);
      window.addEventListener('pointerup', finir);
    });

    let sons = [];
    window.saga.listeSons?.().then((l) => { sons = Array.isArray(l) ? l : []; dessiner(); }).catch(() => {});
    const ouverts = new Set(['campagne', 'pieces', 'rencontres']);
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

    // --- Les onglets (avec ce qui attend : des messages non lus) ---
    let nonLus = 0;
    function choisir(id) {
      onglet = id;
      ecrire('onglet', id);
      if (id === 'chat') nonLus = 0;
      dessiner();
      if (id === 'chat') setTimeout(() => { fil.scrollTop = fil.scrollHeight; }, 0);
    }
    document.addEventListener('saga:table-onglet', (e) => { if (volets[e.detail]) choisir(e.detail); });
    function dessinerOnglets() {
      onglets.replaceChildren(...ONGLETS.map(([id, nom, ic]) => {
        const pastille = id === 'chat' && nonLus ? String(nonLus) : '';
        const b = el('button', { type: 'button', className: `table-onglet${onglet === id ? ' on' : ''}`, title: nom },
          el('i', { className: `codicon codicon-${ic}` }), el('span', { textContent: nom }), pastille ? el('b', { className: 'table-pastille', textContent: pastille }) : null);
        b.onclick = () => choisir(id);
        return b;
      }));
      for (const [id, v] of Object.entries(volets)) v.hidden = id !== onglet;
    }

    // --- Chat : les jets et la discussion, mêlés dans l'ordre où ils arrivent ---
    const fil = el('div', { className: 'table-fil' });
    const champ = el('input', { className: 'table-ecrire-champ', type: 'text', maxLength: 300, placeholder: 'Écrire… /r 1d20+3 · /gr secret · /m macro', spellcheck: false });
    const pourQui = el('select', { className: 'table-select table-pour', title: 'À qui (la discussion)' });
    const envoyer = el('button', { className: 'table-envoyer', type: 'submit', title: 'Envoyer (Entrée)' }, el('i', { className: 'codicon codicon-send' }));
    const desB = el('button', { className: 'table-bouton', type: 'button', title: 'Le tapis de dés (D)' }, el('i', { className: 'codicon codicon-symbol-event' }));
    desB.onclick = () => T.ouvrirTapis();
    const formulaire = el('form', { className: 'table-ecrire' }, desB, champ, envoyer);
    formulaire.onsubmit = (e) => {
      e.preventDefault();
      const t = champ.value.trim();
      if (!t) return;
      const multi = T.multi?.();
      if (t.startsWith('/')) T.commande(t);
      else if (multi?.actif) multi.dire(t, pourQui.value || 'tous');
      else T.message('Personne à qui parler : ouvre la partie aux amis (onglet Joueurs). Pour un jet : /r 1d20+3');
      champ.value = '';
    };
    champ.onkeydown = (e) => e.stopPropagation();
    volets.chat.append(fil, el('div', { className: 'table-ecrire-zone' }, pourQui, formulaire));
    let signatureFil = '';
    const carteJet = (l) => carteJetCommune(l, l.cache ? btn('eye', 'Révéler', () => { l.cache = false; dessinerFil(true); }, { classe: 'petit', titre: 'Montrer ce jet aux joueurs' }) : null);
    function dessinerFil(force = false) {
      const partie = T.partie();
      const multi = T.multi?.();
      const jets = (partie?.jdr?.journal || []).slice(-40);
      const chat = multi?.actif ? (multi.lignes || []).filter((x) => !x.jet).slice(-60) : [];
      const dits = (T.recit || []).filter((e) => e.combat).slice(-40);
      const sig = JSON.stringify([jets.map((l) => [l.n, l.cache]), chat.map((x) => x.n), dits.at(-1)?.n || 0, Math.floor(Date.now() / 30000)]);
      if (!force && sig === signatureFil) return;
      // Les nouveautés depuis la dernière fois (pour la pastille de l'onglet).
      const derJ = jets.at(-1)?.n || 0, derC = chat.at(-1)?.n || 0;
      const nouveaux = signatureFil ? jets.filter((l) => l.n > (dessinerFil.j || 0)).length + chat.filter((x) => x.n > (dessinerFil.c || 0)).length : 0;
      dessinerFil.j = derJ; dessinerFil.c = derC;
      signatureFil = sig;
      if (onglet !== 'chat' && nouveaux) nonLus += nouveaux;
      const bas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 40;
      const items = [...jets.map((l) => ({ t: l.heure || 0, n: l.n, el: () => carteJet(l) })),
        ...chat.map((x) => ({ t: x.t || 0, n: x.n, el: () => el('div', { className: `table-dit${x.pour !== 'tous' ? ' prive' : ''}` }, el('b', { textContent: x.nom }), el('span', { textContent: ` ${x.texte}` }), x.pour !== 'tous' ? el('small', { textContent: ' (privé)' }) : null) }))]
        .concat(dits.map((e) => ({ t: e.heure || 0, el: () => ligneRecit(e) })))
        .sort((a, b) => a.t - b.t);
      fil.replaceChildren(...(items.length ? items.map((x) => x.el()) : [el('p', { className: 'table-note table-vide', textContent: 'Les jets de dés et la discussion s\'affichent ici. Écris /r 1d20+3 pour lancer, /gr pour un jet que toi seul vois, ou ouvre le tapis de dés (D).' })]));
      if (bas || force) fil.scrollTop = fil.scrollHeight;
      // À qui parler : tous, ou un ami.
      const options = [['tous', 'À tous'], ...(multi?.actif ? multi.joueurs.filter((j) => !j.hote).map((j) => [j.id, `→ ${j.nom}`]) : [])];
      const avant = pourQui.value || 'tous';
      pourQui.replaceChildren(...options.map(([v, t]) => el('option', { value: v, textContent: t })));
      pourQui.value = options.some(([v]) => v === avant) ? avant : 'tous';
      pourQui.hidden = options.length < 2;
    }

    // Saga 1.34 : le nom de la campagne et le fond des compagnons (gardés dans la sauvegarde).
    function campagne(partie) {
      const t = partie.table;
      const nom = el('input', { className: 'table-champ', type: 'text', maxLength: 60, value: t.campagne?.nom || '', placeholder: T.jeu()?.titre || 'Nom de la campagne' });
      nom.onchange = () => { t.campagne = { ...(t.campagne || {}), nom: nom.value.trim().slice(0, 60) }; };
      const choisir = () => {
        const f = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
        f.onchange = () => { if (f.files[0]) reduireImage(f.files[0]).then((url) => { t.campagne = { ...(t.campagne || {}), fond: url }; dessiner(); }).catch(() => {}); };
        f.click();
      };
      return [
        el('label', { className: 'table-ligne' }, el('span', { textContent: 'Campagne' }), nom),
        el('div', { className: 'table-ligne' }, el('span', { textContent: 'Fond des téléphones' }),
          el('div', { className: 'table-boutons' },
            btn('file-media', t.campagne?.fond ? 'Changer' : 'Choisir…', choisir, { titre: 'L\'image derrière le compagnon (le téléphone des joueurs). Sinon, celle du jeu (Tafl).' }),
            t.campagne?.fond ? btn('trash', '', () => { t.campagne = { ...t.campagne, fond: '' }; dessiner(); }, { titre: 'Revenir au fond du jeu' }) : null)),
      ];
    }
    // Une image choisie, réduite (1600 px au plus) et en JPEG : légère dans la sauvegarde et sur le réseau.
    function reduireImage(fichier) {
      return new Promise((resoudre, rejeter) => {
        const url = URL.createObjectURL(fichier);
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 1600 / Math.max(img.width, img.height));
          const c = el('canvas', { width: Math.round(img.width * k), height: Math.round(img.height * k) });
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          resoudre(c.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); rejeter(new Error('image illisible')); };
        img.src = url;
      });
    }

    function dessiner() {
      const jeu = T.jeu(), partie = T.partie(), carte = T.carte();
      if (!jeu || !partie?.table || !carte) return;
      dessinerOnglets();
      dessinerFil();
      interfaceMj?.maj();
      const v = volets[onglet];
      const haut = v.scrollTop;
      if (onglet === 'pions') v.replaceChildren(...voletPions(jeu, partie, carte));
      else if (onglet === 'scene') v.replaceChildren(...voletScene(jeu, partie, carte));
      else if (onglet === 'docs') v.replaceChildren(...voletDocuments());
      else if (onglet === 'joueurs') dessinerJoueurs(jeu, partie);
      v.scrollTop = haut;
    }

    // --- Combat : la boîte (table.js), l'ordre d'initiative, lancer une rencontre ---
    // --- Pions ---
    // Le jeton d'un pion : un menu (par défaut, une image…, les personnages du jeu).
    function choixJeton(jeu, p) {
      const persos = [...(jeu.personnages?.values?.() || [])];
      const valeur = p.jeton?.personnage ? `perso:${p.jeton.personnage}` : p.jeton?.image ? 'image' : '';
      const s = select(valeur, [['', 'Jeton : par défaut'], ['image', p.jeton?.image ? 'Jeton : image (en changer…)' : 'Jeton : une image…'], ...persos.map((x) => [`perso:${x.id}`, `Jeton : ${x.nom || x.id}`])], async (v) => {
        if (v === 'image') {
          const src = await choisirImageJeton();
          if (src) T.agir({ type: 'jeton', pion: p.id, image: src }); else dessiner();
        } else if (v.startsWith('perso:')) T.agir({ type: 'jeton', pion: p.id, personnage: v.slice(6) });
        else T.agir({ type: 'jeton', pion: p.id });
        dessiner();
      });
      s.title = 'Son apparence sur le plateau : une image (un portrait, une vue de dessus) ou un personnage du jeu (son sprite de Tafl)';
      s.classList.add('table-jeton');
      return s;
    }
    // Une image du disque, recadrée au carré (le centre) et réduite à 256 px, en PNG ou JPEG.
    function choisirImageJeton() {
      return new Promise((ok) => {
        const i = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
        i.onchange = () => {
          const f = i.files?.[0];
          if (!f) { ok(''); return; }
          const r = new FileReader();
          r.onload = () => {
            const im = new Image();
            im.onload = () => {
              const cote = Math.min(im.naturalWidth, im.naturalHeight), n = Math.min(256, cote);
              const c = el('canvas', { width: n, height: n });
              const g = c.getContext('2d');
              g.imageSmoothingEnabled = cote > 128;
              g.drawImage(im, (im.naturalWidth - cote) / 2, (im.naturalHeight - cote) / 2, cote, cote, 0, 0, n, n);
              const png = c.toDataURL('image/png');
              ok(png.length < 500000 ? png : c.toDataURL('image/jpeg', 0.85));
            };
            im.onerror = () => { T.message('Cette image ne se lit pas.'); ok(''); };
            im.src = r.result;
          };
          r.readAsDataURL(f);
        };
        i.click();
      });
    }
    function voletPions(jeu, partie, carte) {
      const vis = T.VISIBILITES();
      const out = [];
      const pions = TableEtat.pionsSur(partie.table, carte.id).filter((p) => !p.vaincu);
      for (const p of pions) {
        const c = p.sorte === 'heros' ? TableEtat.membreDe(partie, p) : null;
        const nom = c ? JdrPerso.nom(jeu, c) : p.nom;
        const pv = c ? Math.max(0, c.pv) : p.pv, max = c ? JdrPerso.pvMax(jeu, c) : p.pvMax;
        const pc = max ? Math.max(0, Math.min(100, (pv / max) * 100)) : 0;
        const ligne = el('div', { className: `table-carte-pion ${p.sorte}${T.selection === p.id ? ' choisi' : ''}${T.combat?.actif === p.id ? ' actif' : ''}` },
          el('span', { className: 'table-rond', textContent: (nom || '?').charAt(0).toUpperCase() }),
          el('div', { className: 'table-carte-corps' },
            el('div', { className: 'table-ligne' }, el('span', { className: 'table-nom', textContent: nom }), el('small', { className: 'table-pv', textContent: `${pv}/${max} PV` })),
            el('div', { className: `table-jauge${pc < 40 ? ' basse' : ''}` }, el('i', { style: `width:${pc}%` }))));
        ligne.onclick = (e) => { if (e.target.closest('select, button')) return; T.selection = T.selection === p.id ? null : p.id; dessiner(); };
        if (p.sorte !== 'heros') ligne.append(select(TableEtat.normVisible(p.visible), vis, (v) => T.agir({ type: 'visibilite', pion: p.id, visible: v })));
        // Saga 1.42 : son jeton : par défaut, une image importée, ou un personnage du jeu (son sprite).
        ligne.append(choixJeton(jeu, p));
        // Saga 1.21.3 : la fiche du héros (et les champs du jeu, que le MJ peut tous changer).
        if (c) ligne.append(btn('account', '', () => T.ouvrirFiche(c), { titre: `La fiche de ${nom}` }));
        out.push(ligne);
      }
      if (!pions.length) out.push(el('p', { className: 'table-note', textContent: 'Aucun pion sur cette carte.' }));
      // Saga 1.38 : les joueurs créent leur héros depuis leur écran ; le MJ peut aussi en préparer un.
      out.push(btn('person-add', 'Préparer un héros', () => T.preparerHeros?.(), { titre: 'Un pré-tiré ou un nouveau personnage, que tu donneras ensuite à un joueur (onglet Joueurs)' }));
      out.push(el('p', { className: 'table-note', textContent: 'Clique un pion puis une case pour le déplacer. Clic droit : qui le voit, ses marques. En bas à gauche : ses PV (+ et −).' }));
      return out;
    }

    // --- Scène ---
    // Les rencontres : celles qui sont posées sur la carte (on coche celles qui combattent ensemble), et la
    // liste du jeu pour en poser une autre.
    const coches = new Set();
    let rencontreChoisie = '';
    function rencontres(jeu) {
      const groupes = jeu.donnees.groupes?.groupes || [];
      if (!groupes.length) return [el('p', { className: 'table-note', textContent: 'Aucune rencontre dans ce jeu (Tafl › Données › Rencontres).' })];
      if (!groupes.some((g) => g.id === rencontreChoisie)) rencontreChoisie = groupes[0].id;
      let choisi = rencontreChoisie;
      const s = select(choisi, groupes.map((g) => [g.id, g.nom || g.id]), (v) => { choisi = rencontreChoisie = v; });
      const posees = T.rencontresPosees();
      for (const id of [...coches]) if (!posees.some((r) => r.id === id)) coches.delete(id);
      const voulues = () => (posees.length === 1 ? [posees[0].id] : [...coches]);
      const haut = [];
      if (posees.length) {
        haut.push(el('div', { className: 'table-sous-titre', textContent: 'Sur cette carte' }));
        for (const r of posees) {
          const c = el('input', { type: 'checkbox', checked: posees.length === 1 || coches.has(r.id), disabled: posees.length === 1 });
          c.onchange = () => { if (c.checked) coches.add(r.id); else coches.delete(r.id); dessiner(); };
          haut.push(el('label', { className: 'table-ligne table-rencontre' }, c, el('span', { className: 'table-nom', textContent: r.nom }), el('small', { textContent: `${r.n} monstre${r.n > 1 ? 's' : ''}` })));
        }
        const n = voulues().length;
        const lancer = btn('flame', n > 1 ? `Lancer le combat (${n} rencontres)` : 'Lancer le combat', () => { if (T.combat || T.occupe() || !voulues().length) return; T.lancerRencontres(voulues()); }, { classe: 'accent', titre: 'Les monstres des rencontres cochées combattent ensemble.' });
        lancer.disabled = !n || Boolean(T.combat);
        haut.push(el('div', { className: 'table-boutons' }, lancer));
        if (posees.length > 1 && !n) haut.push(el('p', { className: 'table-note', textContent: 'Coche la ou les rencontres qui commencent.' }));
        haut.push(el('div', { className: 'table-sous-titre', textContent: 'Poser une autre rencontre' }));
      }
      return [
        ...haut,
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
          btn('flame', 'Lancer sans poser', () => { if (T.combat || T.occupe()) return; T.lancerCombat(choisi); }, { titre: 'Le combat commence tout de suite : les pions de cette rencontre déjà posés combattent, ceux qui manquent arrivent près du groupe.' })),
      ];
    }
    // Saga 1.43 : l'initiative tenue à la main, pour un combat mené sans le moteur (ou une scène tendue) :
    // jeter pour tous, ajouter un pion ou une ligne libre, régler le chiffre, monter, descendre, passer le tour.
    function initiativeManuelle(jeu, partie, carte) {
      if (T.combat) return [el('p', { className: 'table-note', textContent: 'Pendant un combat de Saga, l\'ordre est celui du combat (en haut du plateau).' })];
      const ini = partie.table.initiative || { liste: [], actif: '', tour: 1 };
      const o = [];
      o.push(el('div', { className: 'table-boutons' },
        btn('debug-step-back', '', () => T.passerInitiative(-1), { titre: 'Revenir au précédent' }),
        btn('debug-continue', `Suivant · tour ${ini.tour}`, () => T.passerInitiative(1), { classe: 'accent', titre: 'Passer au suivant (après le dernier : un nouveau tour)' }),
        btn('symbol-event', 'Jeter pour tous', () => { if (!T.jeterInitiative()) T.message('Aucun pion sur cette carte.'); }, { titre: 'Chaque pion de la carte lance son initiative (les héros en public, les monstres en secret) ; ceux déjà là relancent.' }),
        btn('list-ordered', 'Trier', () => T.agir({ type: 'init_trier' }), { titre: 'Du plus haut au plus bas' }),
        btn('clear-all', 'Vider', () => T.agir({ type: 'init_vider' }), { titre: 'Effacer toute la liste' })));
      ini.liste.forEach((x) => {
        const chiffre = el('input', { className: 'table-init-chiffre', type: 'number', value: String(x.init), title: 'Son initiative (Entrée : la liste se retrie)' });
        chiffre.onchange = () => T.agir({ type: 'init_valeur', id: x.id, init: Number(chiffre.value) || 0 });
        const nom = el('span', { className: 'table-nom', textContent: x.nom, title: x.pion ? 'Un pion de la table (clic : le choisir)' : 'Une ligne libre' });
        if (x.pion) nom.onclick = () => { T.selection = x.pion; dessiner(); };
        o.push(el('div', { className: `table-ligne table-init${x.id === ini.actif ? ' actif' : ''}` },
          el('i', { className: `codicon codicon-${x.id === ini.actif ? 'play' : x.pion ? 'person' : 'tag'}` }), nom, chiffre,
          btn('arrow-up', '', () => T.agir({ type: 'init_monter', id: x.id, sens: -1 }), { titre: 'Monter' }),
          btn('arrow-down', '', () => T.agir({ type: 'init_monter', id: x.id, sens: 1 }), { titre: 'Descendre' }),
          btn('close', '', () => T.agir({ type: 'init_retirer', id: x.id }), { titre: 'Retirer de la liste' })));
      });
      if (!ini.liste.length) o.push(el('p', { className: 'table-note', textContent: 'Liste vide : « Jeter pour tous », ou ajoute un pion ou une ligne libre (un piège, un renfort, l\'action du repaire).' }));
      // Ajouter : un pion de la carte qui n'y est pas, ou une ligne libre.
      const dans = new Set(ini.liste.map((x) => x.pion).filter(Boolean));
      const libres = TableEtat.pionsSur(partie.table, carte.id).filter((p) => !p.vaincu && !dans.has(p.id));
      const nomL = el('input', { className: 'table-init-texte', type: 'text', maxLength: 40, placeholder: 'Pion ou ligne libre' });
      let choixP = libres[0]?.id || '';
      const sp = libres.length ? select(choixP, [...libres.map((p) => [p.id, T.nomPion(p)]), ['', 'Une ligne libre…']], (v) => { choixP = v; nomL.hidden = Boolean(v); }) : null;
      nomL.hidden = Boolean(choixP);
      const val = el('input', { className: 'table-init-chiffre', type: 'number', value: '10', title: 'Son initiative' });
      o.push(el('div', { className: 'table-ligne table-init-ajout' }, ...(sp ? [sp] : []), nomL, val,
        btn('add', 'Ajouter', () => {
          const p = choixP ? libres.find((q) => q.id === choixP) : null;
          const r = T.agir({ type: 'init_ajouter', ...(p ? { pion: p.id, nom: T.nomPion(p) } : { nom: nomL.value }), init: Number(val.value) || 0 });
          if (r.ok) nomL.value = '';
        }, { titre: 'Ajouter à sa place dans l\'ordre' })));
      o.push(el('p', { className: 'table-note', textContent: 'Les joueurs voient cet ordre en haut de leur écran, sans les chiffres. Un pion caché n\'y paraît pas chez eux.' }));
      return o;
    }
    function voletScene(jeu, partie, carte) {
      const vis = T.VISIBILITES();
      const out = [];
      out.push(section('campagne', 'Campagne', () => [...campagne(partie),
        el('div', { className: 'table-boutons' }, btn('screen-normal', 'Recadrer la carte', () => T.cadrer(), { titre: 'Remontrer toute la carte (molette : zoom, clic droit glissé : se déplacer)' }))]));
      const ps = TableEtat.pieces(carte);
      out.push(section('pieces', `Pièces et brouillard${ps.length ? ` (${ps.length})` : ''}`, () => {
        const o = [];
        const b = TableEtat.brouillard(partie.table, carte);
        o.push(el('label', { className: 'table-ligne' }, el('span', { textContent: 'Brouillard' }), select(b ? 'oui' : 'non', [['oui', 'Oui, sur cette carte'], ['non', 'Non, tout se voit']], (v) => T.agir({ type: 'brouillard', valeur: v === 'oui' }))));
        if (!ps.length) o.push(el('p', { className: 'table-note', textContent: 'Pas de pièce sur cette carte : dans Tafl, une zone cochée « pièce » se révèle d\'un clic ici.' }));
        for (const z of ps) {
          const v = TableEtat.visibilitePiece(partie.table, carte, z);
          o.push(el('div', { className: 'table-ligne piece' },
            btn(v === 'tous' ? 'eye' : 'eye-closed', '', () => T.agir({ type: 'piece', piece: z.id, visible: v === 'tous' ? 'mj' : 'tous' }), { titre: v === 'tous' ? 'Cacher cette pièce aux joueurs' : 'Révéler cette pièce aux joueurs', classe: v === 'tous' ? 'actif' : '' }),
            el('span', { className: 'table-nom', textContent: z.nom || z.id }),
            select(v, vis, (nv) => T.agir({ type: 'piece', piece: z.id, visible: nv }))));
        }
        o.push(el('div', { className: 'table-boutons' },
          btn('lightbulb', 'Révéler au pinceau', () => { T.pinceau = T.pinceau === 'reveler' ? null : 'reveler'; T.redessinerOutils?.(); dessiner(); }, { classe: T.pinceau === 'reveler' ? 'actif' : '', titre: 'Clique ou glisse sur le plateau pour montrer des cases aux joueurs (B)' }),
          btn('circle-slash', 'Cacher au pinceau', () => { T.pinceau = T.pinceau === 'cacher' ? null : 'cacher'; T.redessinerOutils?.(); dessiner(); }, { classe: T.pinceau === 'cacher' ? 'actif' : '', titre: 'N' }),
          btn('discard', 'Tout recacher', () => T.agir({ type: 'tout_cacher' }), { titre: 'Remettre le brouillard partout sur cette carte (les pièces reprennent leur réglage de Tafl)' })));
        return o;
      }));
      // Saga 1.42 : aller sur une autre carte, ou sur une scène image (Tafl › Carte › Nouvelle scène).
      out.push(section('cartes', 'Cartes et scènes', () => {
        const l = [...jeu.cartes.values()];
        const scenes = l.filter((c) => c.fond), autres = l.filter((c) => !c.fond);
        const ligne = (c) => el('div', { className: `table-ligne${c.id === carte.id ? ' actif' : ''}` },
          el('span', { className: 'table-nom', textContent: c.nom || c.id }),
          c.id === carte.id ? el('small', { textContent: 'ici' }) : btn('arrow-right', 'Y aller', () => { if (!T.allerCarte(c.id)) T.message('Pas pendant un combat ou une scène.'); }, { titre: 'Le groupe et ses pions arrivent sur cette carte (au départ s\'il y est, sinon au milieu).' }));
        return [
          ...(scenes.length ? [el('div', { className: 'table-sous-titre', textContent: 'Scènes (une image)' }), ...scenes.map(ligne)] : [el('p', { className: 'table-note', textContent: 'Une scène, c\'est une image (une battlemap, un lieu) avec une grille dessus : Tafl › Carte › Nouvelle scène.' })]),
          el('div', { className: 'table-sous-titre', textContent: 'Cartes' }), ...autres.map(ligne),
        ];
      }));
      out.push(section('rencontres', 'Rencontres', () => rencontres(jeu)));
      out.push(section('initiative', `Initiative à la main${partie.table.initiative?.liste?.length ? ` (${partie.table.initiative.liste.length})` : ''}`, () => initiativeManuelle(jeu, partie, carte)));
      out.push(section('musique', 'Musique et sons', () => {
        const o = [el('div', { className: 'table-boutons' }, btn('mute', 'Silence', () => T.musique('aucune')), btn('home', 'Celle de la carte', () => T.musique('')))];
        if (!sons.length) o.push(el('p', { className: 'table-note', textContent: 'Pas de son dans le dossier sons/ du jeu.' }));
        for (const x of sons) {
          o.push(el('div', { className: 'table-ligne son' },
            el('span', { className: 'table-nom', textContent: x.replace(/^sons\//, '') }),
            btn('play', '', () => T.musique(x), { titre: 'Jouer en musique (en boucle)' }),
            btn('megaphone', '', () => T.son(x), { titre: 'Jouer une fois (un bruitage)' })));
        }
        return o;
      }));
      out.push(section('des', 'Dés', () => {
        const tapis = (() => { try { return localStorage.getItem('saga:des-tapis') !== '0'; } catch { return true; } })();
        const anime = (() => { try { return localStorage.getItem('saga:des-animes') !== '0'; } catch { return true; } })();
        const coche = (val, texte, change) => {
          const c = el('input', { type: 'checkbox', checked: val });
          c.onchange = () => { change(c.checked); dessiner(); };
          return el('label', { className: 'table-ligne coche' }, c, el('span', { textContent: texte }));
        };
        return [
          coche(tapis, 'Les jets roulent au milieu du plateau', (v) => { try { localStorage.setItem('saga:des-tapis', v ? '1' : '0'); } catch { /* */ } }),
          coche(anime, 'Animer les dés (sinon : posés tout de suite)', (v) => { try { localStorage.setItem('saga:des-animes', v ? '1' : '0'); } catch { /* */ } }),
          el('p', { className: 'table-note', textContent: 'Au-delà de 10 dés, le résultat s\'affiche directement. Le tapis s\'ouvre aussi à la main (D) pour composer un jet.' }),
        ];
      }));
      return out;
    }

    // --- Saga 1.37 : Docs. Les documents du MJ : en créer (une image, un texte), les donner, les montrer ---
    let edition = null;   // { id (null : nouveau), titre, texte, image }
    let donnerA = null;   // { id, pour: Set de prénoms | 'tous', montrer }
    function fichierImage(faire) {
      const f = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
      f.onchange = () => { if (f.files[0]) TableDocuments.reduire(f.files[0]).then(faire).catch(() => T.message('Cette image est illisible.')); };
      f.click();
    }
    function formDocument() {
      const e = edition;
      const titre = el('input', { className: 'table-champ', type: 'text', maxLength: 80, value: e.titre || '', placeholder: 'Titre (Lettre du baron, Carte de la crypte…)' });
      const texte = el('textarea', { className: 'table-champ doc-zone', maxLength: TableDocuments.MAX_TEXTE, rows: 6, placeholder: 'Le texte (une lettre, un indice, une légende). Facultatif avec une image.' });
      texte.value = e.texte || '';
      titre.oninput = () => { e.titre = titre.value; };
      texte.oninput = () => { e.texte = texte.value; };
      for (const c of [titre, texte]) c.onkeydown = (ev) => ev.stopPropagation();
      const apercu = e.image ? el('div', { className: 'doc-apercu' }, el('img', { src: e.image, alt: '' })) : null;
      const garder = btn('check', e.id ? 'Garder' : 'Créer', () => {
        const res = T.docAgir({ type: e.id ? 'doc_modifier' : 'doc_nouveau', id: e.id, titre: titre.value, texte: texte.value, image: e.image || '' });
        if (res.ok) { edition = null; if (!e.id) donnerA = { id: res.doc.id, pour: new Set(), montrer: true }; dessiner(); }
      }, { classe: 'accent' });
      return [el('div', { className: 'table-sous-titre', textContent: e.id ? 'Modifier le document' : 'Nouveau document' }), titre, apercu,
        el('div', { className: 'table-boutons' },
          btn('file-media', e.image ? 'Changer l\'image' : 'Ajouter une image', () => fichierImage((url) => { e.image = url; dessiner(); })),
          e.image ? btn('trash', '', () => { e.image = ''; dessiner(); }, { titre: 'Retirer l\'image' }) : null),
        texte,
        el('div', { className: 'table-boutons' }, garder, btn('close', 'Annuler', () => { edition = null; dessiner(); }))];
    }
    function formDonner(d) {
      const noms = T.destinataires();
      const tous = donnerA.pour === 'tous';
      const coche = (val, texte, change, titre = '') => {
        const c = el('input', { type: 'checkbox', checked: val });
        c.onchange = () => { change(c.checked); dessiner(); };
        return el('label', { className: 'table-ligne coche', title: titre }, c, el('span', { textContent: texte }));
      };
      const o = [coche(tous, 'Tous les joueurs (et l\'écran des joueurs)', (v) => { donnerA.pour = v ? 'tous' : new Set(); })];
      if (!tous) for (const n of noms) o.push(coche(donnerA.pour.has(n), n, (v) => { if (v) donnerA.pour.add(n); else donnerA.pour.delete(n); }));
      if (!tous && !noms.length) o.push(el('p', { className: 'table-note', textContent: 'Personne encore : les amis apparaissent ici quand ils rejoignent (onglet Joueurs). Tu peux le donner à tous.' }));
      o.push(coche(donnerA.montrer, 'L\'ouvrir tout de suite sur leur écran', (v) => { donnerA.montrer = v; }));
      const pour = tous ? 'tous' : [...donnerA.pour];
      const ok = btn('send', 'Donner', () => { T.docAgir({ type: 'doc_donner', id: d.id, pour, montrer: donnerA.montrer }); donnerA = null; dessiner(); }, { classe: 'accent' });
      ok.disabled = pour !== 'tous' && !pour.length;
      return el('div', { className: 'doc-donner' }, el('div', { className: 'table-sous-titre', textContent: `Donner « ${d.titre} » à…` }), ...o,
        el('div', { className: 'table-boutons' }, ok, btn('close', 'Annuler', () => { donnerA = null; dessiner(); })));
    }
    function voletDocuments() {
      const out = [];
      if (edition) return formDocument();
      const docs = T.documents();
      const montre = T.montre;
      out.push(el('div', { className: 'table-boutons' },
        btn('file-media', 'Image…', () => fichierImage((url) => { edition = { id: null, titre: '', texte: '', image: url }; dessiner(); }), { classe: 'accent', titre: 'Une image (une carte, un portrait, une lettre scannée) : PNG, JPEG ou WebP' }),
        btn('note', 'Texte', () => { edition = { id: null, titre: '', texte: '', image: '' }; dessiner(); }, { titre: 'Une lettre, un indice, une légende' })));
      if (!docs.length) out.push(el('p', { className: 'table-note table-vide', textContent: 'Prépare ici les documents de la séance : ils restent des brouillons tant que tu ne les donnes pas. Un joueur garde ce que tu lui donnes et le rouvre quand il veut (sur son écran ou son téléphone).' }));
      for (const d of [...docs].reverse()) {
        const montreIci = montre?.id === d.id;
        out.push(TableDocuments.ligne(d, {
          image: d.image,
          sous: `${TableDocuments.pourTexte(d)}${d.donne ? ` · ${heureDe(d.donne)}` : ''}${montreIci ? ' · montré' : ''}`,
          ouvrir: () => TableDocuments.ouvrir(d, { image: d.image }),
          boutons: [
            btn(montreIci ? 'eye-closed' : 'eye', '', () => (montreIci ? T.cacherDocument() : T.docAgir({ type: 'doc_montrer', id: d.id })), { classe: montreIci ? 'actif' : '', titre: montreIci ? 'Ne plus le montrer (il reste à ceux qui l\'ont)' : 'Le montrer maintenant sur l\'écran de ceux qui l\'ont (un brouillon : à tous, télé comprise)' }),
            btn('person-add', '', () => { donnerA = donnerA?.id === d.id ? null : { id: d.id, pour: d.pour === 'tous' ? 'tous' : new Set(d.pour), montrer: false }; dessiner(); }, { titre: 'À qui le donner' }),
            btn('edit', '', () => { edition = { id: d.id, titre: d.titre, texte: d.texte, image: d.image }; donnerA = null; dessiner(); }, { titre: 'Modifier' }),
            btn('trash', '', () => { if (donnerA?.id === d.id) donnerA = null; T.docAgir({ type: 'doc_retirer', id: d.id }); }, { titre: 'Supprimer (les joueurs ne l\'ont plus)' }),
          ],
        }));
        if (donnerA?.id === d.id) out.push(formDonner(d));
      }
      if (docs.length) out.push(el('p', { className: 'table-note', textContent: 'Les documents sont gardés avec la partie. Depuis ton téléphone (le compagnon), tu peux aussi prendre une photo et la donner.' }));
      return out;
    }

    // --- Joueurs : le multijoueur (le panneau de multi.js vient ici, sans sa discussion, qui est dans Chat) ---
    // Saga 1.38 : la campagne (ses téléphones, les copies hors séance, les changements proposés).
    const blocCampagne = () => T.campagne?.()?.bloc({ libelleChamp: T.libelleChamp }) || null;
    function dessinerJoueurs(jeu, partie) {
      const v = volets.joueurs;
      const multi = T.multi?.();
      const amis = el('div', { className: 'table-amis' });
      if (multi?.actif) {
        const heros = partie.equipe.filter((c) => c?.jdr).map((c) => [T.cleDe(c), JdrPerso.nom(jeu, c)]);
        const autres = multi.joueurs.filter((j) => !j.hote);
        if (autres.length) amis.append(el('div', { className: 'table-sous-titre', textContent: 'Qui joue quel héros' }));
        for (const j of autres) {
          amis.append(el('div', { className: `table-ligne ami${j.connecte ? '' : ' absent'}` },
            el('i', { className: `codicon codicon-${j.connecte ? 'person' : 'debug-disconnect'}` }),
            el('span', { className: 'table-nom', textContent: j.nom }),
            select(T.cleRole(j.nom), [['', 'Sans héros'], ...heros.map(([id, nom]) => [id, nom])], (val) => T.donnerRole(j.nom, val))));
        }
        amis.append(el('p', { className: 'table-note', textContent: 'Un ami sans héros en prend un libre ou crée le sien depuis son écran. Un joueur voit ce que son héros a le droit de voir, le déplace hors combat, lance les jets de sa fiche et joue son tour en combat.' }));
        if (multi.element && multi.element.parentElement !== v) { multi.ouvrirPanneau?.(); v.append(multi.element); }
        v.replaceChildren(...[multi.element, amis, blocCampagne()].filter(Boolean));
        multi.element.hidden = false;
      } else {
        v.replaceChildren(el('div', { className: 'table-vide-joueurs' },
          el('i', { className: 'codicon codicon-organization' }),
          el('p', { textContent: 'Tes amis rejoignent depuis leur navigateur (PC, tablette, téléphone), sans rien installer. Chacun reçoit seulement ce que son héros a le droit de voir.' }),
          btn('broadcast', 'Ouvrir la partie aux joueurs', () => document.dispatchEvent(new CustomEvent('saga:multijoueur')), { classe: 'accent' })), ...[blocCampagne()].filter(Boolean));
      }
    }

    // Le panneau se redessine quand la table change, pas à chaque image (au plus 5 fois par seconde).
    let prevu = 0;
    function rafraichir() {
      if (prevu) return;
      // Saga 1.37.1 : seul un champ en train d'être écrit retarde le dessin (un bouton cliqué gardait le focus,
      // et le panneau ne se redessinait plus : un document supprimé restait affiché).
      prevu = setTimeout(() => { prevu = 0; const f = document.activeElement; if (!(racine.contains(f) && f.matches('input[type=text], input:not([type]), textarea, select'))) dessiner(); else setTimeout(rafraichir, 400); }, 200);
    }
    // Le chat arrive aussi sans que la table change.
    T.multi?.()?.sur?.((sorte) => { if (sorte === 'chat' || sorte === 'joueurs') rafraichir(); });
    const minuterie = setInterval(() => dessinerFil(), 1000);
    dessiner();
    return {
      rafraichir, dessiner,
      macro: (i) => interfaceMj?.macro(i) || false,
      fermer() {
        clearTimeout(prevu); clearInterval(minuterie);
        // Le panneau du multijoueur retourne sur la scène.
        const m = T.multi?.();
        if (m?.element && racine.contains(m.element)) scene?.append(m.element);
        interfaceMj?.fermer();
        poignee.remove(); racine.remove();
      },
    };
  }
  return { creer, carteJet: carteJetCommune, ligneRecit, heure: heureDe };
})();
