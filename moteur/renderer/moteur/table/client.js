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
    // Saga 1.21 : en combat, mon tour (le menu du héros, puis la case ou la cible à cliquer).
    const questionEl = el('div', { className: 'joueurs-question', hidden: true });
    // Saga 1.21 : un ami sans héros sait pourquoi il ne peut que regarder.
    const roleEl = el('div', { className: 'joueurs-role', hidden: true });
    // Saga 1.21.4 : le journal (le récit et les jets), à ouvrir quand on veut relire.
    const journalBouton = el('button', { className: 'joueurs-journal-bouton', type: 'button', textContent: 'Journal', title: 'Relire ce qui s\'est dit et les jets' });
    const journalEl = el('aside', { className: 'joueurs-journal', hidden: true });
    // Saga 1.32 : la barre des macros de mon héros, et le petit menu de ses marques.
    const macrosEl = el('div', { className: 'joueurs-macros', hidden: true });
    const menuEl = el('div', { className: 'table-menu', hidden: true });
    scene.append(canvas, ordre, boite, jets, pauseEl, attente, fiche, questionEl, roleEl, journalEl, journalBouton, macrosEl, menuEl);
    const plateau = Plateau.creer(canvas);
    // Saga 1.32 : la règle, les gabarits, le ping.
    const outils = TableOutils.barre({
      conteneur: scene, caseM: () => vue?.caseM || 1.5, diagonales: () => vue?.diagonales || 'simple',
      placer: (g) => window.saga.tableDemander({ type: 'gabarit', ...g }),
      ping: (c) => window.saga.tableDemander({ type: 'ping', x: c.x, y: c.y }),
      effacer: () => window.saga.tableDemander({ type: 'gabarit_retirer' }),
      // Saga 1.43 : le feutre et les notes d'un joueur (vus de tous).
      dessiner: (d) => window.saga.tableDemander({ type: 'dessin', ...d }),
      noter: (n) => window.saga.tableDemander({ type: 'note', ...n }),
      effacerDessins: () => window.saga.tableDemander({ type: 'dessin_retirer' }),
      message: (t) => notify?.(t, 'warning', 4000),
      extras: reseau ? [{ icone: 'symbol-event', titre: 'Le tapis de dés (D) : composer un jet, lancer au bouton ou en glissant', touche: 'D', faire: () => ouvrirTapis(), actif: () => Boolean(ecranDes?.tapis.ouvert) }] : [],
    });
    // Saga 1.0 : un ami qui a rejoint par le réseau a aussi le panneau des joueurs et la discussion.
    const multi = reseau ? Multi.creer({ scene, moteur: null, message: (t) => notify?.(t, 'warning', 6000) }) : null;
    let jeu = null, vue = null, selection = null, survol = null, imageFiche = '', ficheLarge = false;
    let dernierEffet = -1, dernierJet = -1;
    // Saga 1.35 : l'ami qui joue depuis son navigateur a la même table en verre que le MJ (verre()).
    const ecranDes = typeof EcranDes !== 'undefined' ? EcranDes.creer(scene) : null;
    const tapisVoulu = () => { try { return localStorage.getItem('saga:des-tapis') !== '0'; } catch { return true; } };
    function ouvrirTapis() {
      ecranDes?.tapis.basculer({ lancer: (f, secret) => multi?.dire(f.startsWith('/') ? f : `${secret ? '/gr' : '/r'} ${f}`, 'tous'), secretTitre: 'Un jet que seuls toi et le MJ voyez' });
    }
    let habit = null;

    (async () => {
      try {
        const textes = await window.saga.ouvrirJeu(dossier);
        // Saga 1.21.3 : l'image de fond de la fiche du jeu (sur le réseau, le jeu public ne garde qu'elle des réglages).
        try { imageFiche = JSON.parse(textes.jeu)?.fiche_image || ''; } catch { imageFiche = ''; }
        jeu = await Jeu.charger(textes);
        if (!imageFiche) imageFiche = jeu.donnees.reglages?.reglages?.jdr?.fiche?.theme?.image || '';
        signature = '';
        montrerFiche();
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
      montrerQuestion();
      montrerJournal();
      montrerMacros();
      montrerDocuments();
      habit?.maj();
      if (v.avis && v.avis.n !== dernierAvis) { if (dernierAvis >= 0) notify?.(v.avis.texte, 'warning', 5000); dernierAvis = v.avis.n; }
      else if (!v.avis && dernierAvis < 0) dernierAvis = 0;
    });

    // --- Saga 1.32 : mes macros (un clic : le jet ; + : en garder une ; clic droit : l'oublier) ---
    let dernierAvis = -1, signatureM = '', ajoutMacro = false;
    function montrerMacros() {
      const l = vue?.macros;
      macrosEl.hidden = !Array.isArray(l);
      if (!Array.isArray(l)) return;
      const s = JSON.stringify([l, ajoutMacro]);
      if (s === signatureM) return;
      if (macrosEl.contains(document.activeElement) && document.activeElement.matches('input')) return;
      signatureM = s;
      macrosEl.innerHTML = '';
      l.forEach((m, k) => {
        const secret = /^\/gr\b/i.test(m.formule);
        const b = habit
          ? el('button', { className: `ti-macro${/d20/i.test(m.formule) ? '' : ' degats'}`, type: 'button', title: `${m.formule}${m.calcul ? ` = ${m.calcul}` : ''} · clic droit : oublier` },
            el('b', {}, m.nom, secret ? el('i', { className: 'codicon codicon-eye-closed' }) : null), el('code', { textContent: m.calcul || m.formule }), k < 9 ? el('kbd', { textContent: String(k + 1) }) : null)
          : el('button', { className: 'joueurs-macro', type: 'button', textContent: m.nom, title: `${m.formule} · clic droit : oublier` });
        b.onclick = () => window.saga.tableDemander({ type: 'macro', k });
        b.oncontextmenu = (e) => { e.preventDefault(); window.saga.tableDemander({ type: 'macro_retirer', k }); };
        macrosEl.append(b);
      });
      if (ajoutMacro) {
        const nom = el('input', { className: habit ? 'ti-champ' : 'multi-champ', type: 'text', maxLength: 30, placeholder: 'Nom (Épée)' });
        const formule = el('input', { className: habit ? 'ti-champ' : 'multi-champ', type: 'text', maxLength: 80, placeholder: '1d20+@for', title: '@for, @dex, @con, @int, @sag, @cha : tes modificateurs · @maitrise · @niveau · « /gr … » : un jet secret pour le MJ' });
        const cb = habit ? 'ti-bouton' : 'joueurs-macro';
        const f = el('form', { className: habit ? 'ti-macro-form' : 'joueurs-macro-form' }, nom, formule,
          el('button', { className: `${cb}${habit ? ' accent' : ''}`, type: 'submit', textContent: 'Garder' }));
        const non = el('button', { className: cb, type: 'button', textContent: '✕' });
        non.onclick = () => { ajoutMacro = false; signatureM = ''; montrerMacros(); };
        f.append(non);
        f.onsubmit = (e) => { e.preventDefault(); window.saga.tableDemander({ type: 'macro_ajouter', nom: nom.value, formule: formule.value }); ajoutMacro = false; signatureM = ''; montrerMacros(); };
        macrosEl.append(f);
        setTimeout(() => nom.focus(), 0);
      } else {
        const plus = el('button', { className: habit ? 'ti-bouton ti-macro-plus' : 'joueurs-macro plus', type: 'button', title: 'Garder un jet en macro (dans le chat : /m nom)' }, el('i', { className: 'codicon codicon-add' }), el('span', { textContent: l.length && !habit ? '' : 'Macro' }));
        plus.onclick = () => { ajoutMacro = true; signatureM = ''; montrerMacros(); };
        macrosEl.append(plus);
      }
    }
    // Le menu des marques de mon héros (clic droit dessus).
    function menuMarques(x, y, p) {
      menuEl.innerHTML = '';
      const a = new Set((p.marques || []).map((m) => m.id));
      menuEl.append(el('div', { className: 'table-menu-titre', textContent: p.nom }), el('div', { className: 'table-menu-note', textContent: 'Marques' }));
      menuEl.append(el('div', { className: 'table-menu-marques' }, ...(vue.marques || []).map((m, i) => {
        const b = el('button', { className: `table-marque${a.has(m.id) ? ' actif' : ''}`, type: 'button', title: m.nom, textContent: m.nom.replace(/^Marque /, '') });
        b.style.setProperty('--marque', TableOutils.couleurMarque(m, i));
        b.onclick = () => { window.saga.tableDemander({ type: 'marque', pion: p.id, id: m.id }); b.classList.toggle('actif'); };
        return b;
      })));
      menuEl.hidden = false;
      const r = scene.getBoundingClientRect();
      menuEl.style.left = `${Math.min(x - r.left, r.width - 260)}px`;
      menuEl.style.top = `${Math.min(y - r.top, r.height - menuEl.offsetHeight - 8)}px`;
    }

    // Ce qui n'est pas sur le canvas : l'ordre du tour, ce qui se dit, les jets montrés à tous, la pause.
    function montrer() {
      attente.hidden = Boolean(vue && jeu);
      montrerChoixPerso();
      pauseEl.hidden = !vue?.pause;
      // Saga 1.43 : l'initiative tenue à la main par le MJ se montre comme celle d'un combat.
      const oc = vue?.combat || vue?.initiative;
      ordre.hidden = !oc;
      if (oc) {
        ordre.innerHTML = '';
        ordre.append(el('span', { className: 'joueurs-tour', textContent: `Tour ${oc.tour || 1}${oc.libre ? ' · ordre libre' : ''}` }));
        for (const o of oc.ordre) {
          if (!habit) { ordre.append(el('span', { className: `joueurs-ordre-nom${o.id === oc.actif ? ' actif' : ''}`, textContent: o.nom })); continue; }
          const p = vue.pions.find((x) => x.id === o.id);
          ordre.append(el('span', { className: `ti-init ${p?.sorte === 'heros' ? 'heros' : p ? 'monstre' : 'libre'}${o.id === oc.actif ? ' actif' : ''}${o.ko ? ' ko' : ''}${o.fait ? ' fait' : ''}${o.attend ? ' attend' : ''}` },
            el('span', { className: 'ti-init-rond', textContent: (o.nom || '?').trim().charAt(0).toUpperCase() }), el('span', { textContent: o.nom })));
        }
      }
      boite.hidden = !vue?.scene?.texte;
      if (vue?.scene?.texte) {
        boite.innerHTML = '';
        if (vue.scene.qui) boite.append(el('div', { className: 'joueurs-qui', textContent: vue.scene.qui }));
        boite.append(el('div', { className: 'joueurs-texte', textContent: vue.scene.texte }));
        // Saga 1.21.2 : avec un héros, on vote ; sinon on voit seulement les choix.
        const v = vue.vote;
        if (vue.scene.choix) boite.append(el('div', { className: `joueurs-choix${v ? ' vote' : ''}` }, ...vue.scene.choix.map((c, k) => {
          if (!v) return el('span', { textContent: c });
          const b = el('button', { className: `joueurs-vote${v.moi === k ? ' moi' : ''}`, type: 'button' }, el('span', { textContent: c }), v.comptes[k] ? el('small', { textContent: `${v.comptes[k]} voix` }) : null);
          b.onclick = () => window.saga.tableDemander({ type: 'voter', n: v.n, k });
          return b;
        })));
        if (v) boite.append(el('div', { className: 'joueurs-fiche-note', textContent: v.moi >= 0 ? 'Ton vote est pris (tu peux changer). La majorité l\'emporte, le MJ tranche en cas d\'égalité.' : 'Vote pour la réponse du groupe.' }));
      }
      // Les nouveaux jets (ceux du MJ cachés n'arrivent jamais ici).
      const lignes = vue?.journal || [];
      if (dernierJet < 0) dernierJet = lignes.length ? lignes[lignes.length - 1].n : 0;
      const neufs = lignes.filter((x) => x.n > dernierJet);
      if (habit && neufs.length && (reseau || tapisVoulu())) {
        if (tapisVoulu() && neufs.some((l) => l.des?.length)) ecranDes.tapis.montrer({ lignes: neufs.filter((l) => l.des?.length).slice(-3) });
        dernierJet = neufs.at(-1).n;
      }
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

    // --- Saga 1.37 : les documents que le MJ m'a donnés (et celui qu'il montre maintenant) ---
    const images = new Map(); // id:empreinte → promesse d'URL
    const imageDe = (d) => {
      if (!d.image) return '';
      const k = `${d.id}:${d.image}`;
      if (!images.has(k)) images.set(k, Promise.resolve(window.saga.tableDocument?.(d.id, d.image) || '').catch(() => ''));
      return images.get(k);
    };
    let docsVus = null, dernierMontre = -1, nonLusD = 0;
    const nouveauxDocs = new Set();
    function ouvrirDocument(d, grand = false) {
      nouveauxDocs.delete(d.id);
      TableDocuments.ouvrir(d, { image: imageDe(d), grand, fermable: !grand });
      habit?.maj?.();
    }
    function montrerDocuments() {
      const l = vue?.documents || [];
      if (docsVus == null) { docsVus = new Set(l.map((d) => d.id)); if (reseau) dernierMontre = vue?.montre?.n ?? -1; }
      for (const d of l) {
        if (docsVus.has(d.id)) continue;
        docsVus.add(d.id);
        if (!reseau) continue;
        nouveauxDocs.add(d.id);
        if (habit?.onglet !== 'documents') nonLusD++;
        if (vue.montre?.id !== d.id) notify?.(`Le MJ t'a donné un document : ${d.titre}`, 'info', 5000);
      }
      const m = vue?.montre;
      // L'écran des joueurs (la télé) montre le document tant que le MJ le montre.
      if (!reseau) {
        const o = TableDocuments.ouverte;
        if (m && o?.id !== m.id) { const d = l.find((x) => x.id === m.id); if (d) ouvrirDocument(d, true); }
        else if (!m && o) TableDocuments.fermer();
        return;
      }
      if (m && m.n !== dernierMontre) {
        dernierMontre = m.n;
        const d = l.find((x) => x.id === m.id);
        if (d) ouvrirDocument(d);
      }
      // Un document repris par le MJ se referme.
      const o = TableDocuments.ouverte;
      if (o && !l.some((d) => d.id === o.id)) TableDocuments.fermer();
    }
    function listeDocuments() {
      const l = [...(vue?.documents || [])].sort((a, b) => b.t - a.t);
      if (!l.length) return [el('p', { className: 'table-note table-vide', textContent: 'Les documents que le MJ te donne (images, lettres, cartes, indices) arrivent ici. Tu les gardes et les rouvres quand tu veux.' })];
      return l.map((d) => TableDocuments.ligne(d, { image: imageDe(d), sous: TablePanneau.heure(d.t), nouveau: nouveauxDocs.has(d.id), ouvrir: () => ouvrirDocument(d) }));
    }

    // --- Saga 1.35.1 : l'écran des joueurs du MJ (la télé, un 2e écran) dans le même verre : la barre du haut
    // (la campagne, la carte, l'état du combat), l'initiative en pastilles, les jets sur le tapis. Pas de
    // panneau ni de barre du bas : c'est un écran qu'on regarde.
    function habillerEcran() {
      document.body.classList.add('table-verre', 'ecran-partage');
      document.body.style.setProperty('--table-panneau', '0px');
      const titre = el('b'), lieu = el('small'), etat = el('span', { className: 'ti-etat ti-etat-vide' });
      const haut = el('header', { className: 'ti-haut ti-verre' }, el('div', { className: 'ti-titre' }, el('span', { className: 'ti-rune', textContent: 'ᛃ' }), titre, lieu), etat, el('div', { className: 'ti-actions' }, el('span', { className: 'ti-qui', textContent: 'Écran des joueurs' })));
      scene.append(haut);
      ordre.className = 'ti-ordre ti-verre';
      journalBouton.hidden = true;
      plateau.marges = () => ({ g: 12, d: 12, h: vue?.combat || vue?.initiative ? 120 : 64, b: 12 });
      let sig = '', enCombat = false;
      function maj() {
        const s = JSON.stringify([vue?.campagne?.nom, jeu?.titre, vue?.nom, vue?.combat?.tour, vue?.combat?.actif, vue?.initiative?.tour, vue?.initiative?.actif, vue?.pause]);
        if (s !== sig) {
          sig = s;
          titre.textContent = vue?.campagne?.nom || jeu?.titre || 'Saga';
          lieu.textContent = vue?.nom || '';
          const oc = vue?.combat || vue?.initiative;
          const actif = oc?.ordre.find((o) => o.id === oc.actif);
          etat.className = `ti-etat ${vue?.pause ? 'ti-etat-pause' : oc ? 'ti-etat-combat' : 'ti-etat-vide'}`;
          etat.replaceChildren(...(vue?.pause ? [el('i', { className: 'codicon codicon-debug-pause' }), 'Pause'] : oc ? [el('i', { className: 'codicon codicon-flame' }), `${vue.combat ? 'Combat' : 'Initiative'} · tour ${oc.tour || 1}${actif ? ` · ${actif.nom}` : ''}`] : []));
        }
        if (Boolean(vue?.combat) !== enCombat) { enCombat = Boolean(vue?.combat); plateau.oublier(); }
      }
      window.addEventListener('resize', () => plateau.oublier());
      return { maj, onglet: '' };
    }

    // --- Saga 1.35 : l'habillage en verre de l'ami (la barre du haut, le panneau à onglets, mon héros en bas) ---
    function habiller() {
      document.body.classList.add('table-verre', 'joueur-reseau');
      const lire = (k, d) => { try { const v = localStorage.getItem(`saga:table:${k}`); return v == null ? d : v; } catch { return d; } };
      const ecrire = (k, v) => { try { localStorage.setItem(`saga:table:${k}`, String(v)); } catch { /* stockage refusé */ } };
      // La barre du haut.
      const titre = el('b'), lieu = el('small'), etat = el('span', { className: 'ti-etat ti-etat-vide' }), qui = el('span', { className: 'ti-qui' });
      const tel = el('button', { className: 'ti-bouton', type: 'button', title: 'Un QR code à scanner : ton téléphone lance tes dés, tes macros et montre ta fiche' }, el('i', { className: 'codicon codicon-device-mobile' }), el('span', { textContent: 'Compagnon' }));
      tel.onclick = () => multi?.compagnon();
      const haut = el('header', { className: 'ti-haut ti-verre' }, el('div', { className: 'ti-titre' }, el('span', { className: 'ti-rune', textContent: 'ᛃ' }), titre, lieu), etat, el('div', { className: 'ti-actions' }, qui, tel));
      // Le panneau : la discussion et les jets, le journal, ma fiche, les joueurs.
      const ONGLETS = [['chat', 'Chat', 'comment-discussion'], ['journal', 'Journal', 'book'], ['fiche', 'Fiche', 'person'], ['documents', 'Docs', 'files'], ['joueurs', 'Joueurs', 'organization']];
      const colonne = el('aside', { className: 'table-colonne' });
      const racine = el('div', { className: 'table-panneau' });
      const nav = el('nav', { className: 'table-onglets' });
      const volets = {};
      for (const [id] of ONGLETS) volets[id] = el('div', { className: `table-volet volet-${id}`, hidden: true });
      const poignee = el('div', { className: 'table-poignee', title: 'Glisser : élargir ou réduire le panneau' });
      racine.append(nav, ...Object.values(volets));
      colonne.append(poignee, racine);
      let onglet = lire('onglet-ami', 'chat');
      if (!volets[onglet]) onglet = 'chat';
      let largeur = Math.max(280, Math.min(560, Number(lire('largeur', 340)) || 340));
      const appliquer = () => document.body.style.setProperty('--table-panneau', `${largeur}px`);
      appliquer();
      poignee.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const x0 = e.clientX, l0 = largeur;
        const bouger = (m) => { largeur = Math.max(280, Math.min(560, l0 + (x0 - m.clientX))); appliquer(); };
        const finir = () => { window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', finir); ecrire('largeur', largeur); plateau.oublier(); };
        window.addEventListener('pointermove', bouger);
        window.addEventListener('pointerup', finir);
      });
      // Le chat : les jets (en cartes) et la discussion, mêlés.
      const fil = el('div', { className: 'table-fil' });
      const champ = el('input', { className: 'table-ecrire-champ', type: 'text', maxLength: 300, placeholder: 'Écrire… /r 1d20+@dex · /gr secret · /m macro', spellcheck: false });
      const pourQui = el('select', { className: 'table-select table-pour', title: 'À qui' });
      const desB = el('button', { className: 'table-bouton', type: 'button', title: 'Le tapis de dés (D)' }, el('i', { className: 'codicon codicon-symbol-event' }));
      desB.onclick = ouvrirTapis;
      const form = el('form', { className: 'table-ecrire' }, desB, champ, el('button', { className: 'table-envoyer', type: 'submit', title: 'Envoyer (Entrée)' }, el('i', { className: 'codicon codicon-send' })));
      form.onsubmit = (e) => { e.preventDefault(); const t = champ.value.trim(); if (t) multi.dire(t, t.startsWith('/') ? 'tous' : pourQui.value || 'tous'); champ.value = ''; };
      volets.chat.append(fil, el('div', { className: 'table-ecrire-zone' }, pourQui, form));
      volets.journal.append(journalEl);
      volets.fiche.append(fiche);
      const sansFiche = el('p', { className: 'table-note table-vide', textContent: 'Pas encore de héros : prends-en un libre ou crée le tien (au milieu de l\'écran).' });
      volets.fiche.append(sansFiche);
      volets.joueurs.append(multi.element);
      multi.ouvrirPanneau();
      journalEl.hidden = false;
      journalBouton.hidden = true;
      // Mon héros, en bas, à côté de mes macros.
      const carte = el('div', { className: 'ti-pion ti-verre heros', hidden: true });
      macrosEl.className = 'ti-macros ti-verre';
      const bas = el('div', { className: 'ti-bas' }, carte, macrosEl);
      scene.append(haut, colonne, bas);
      ordre.className = 'ti-ordre ti-verre';
      plateau.marges = () => ({ g: 72, d: largeur + 24, h: 64, b: 98 });

      let nonLusC = 0, sigFil = '', derJ = 0, derC = 0, sigHaut = '', sigCarte = '', sigDocs = '';
      function choisir(id) {
        onglet = id;
        ecrire('onglet-ami', id);
        if (id === 'chat') nonLusC = 0;
        if (id === 'journal') signatureJ = '';
        if (id === 'documents') nonLusD = 0;
        sigDocs = '';
        maj();
        if (id === 'chat') setTimeout(() => { fil.scrollTop = fil.scrollHeight; }, 0);
      }
      function dessinerOnglets() {
        nav.replaceChildren(...ONGLETS.map(([id, nom, ic]) => {
          const b = el('button', { type: 'button', className: `table-onglet${onglet === id ? ' on' : ''}`, title: nom },
            el('i', { className: `codicon codicon-${ic}` }), el('span', { textContent: nom }), id === 'chat' && nonLusC ? el('b', { className: 'table-pastille', textContent: String(nonLusC) }) : null,
            id === 'documents' && nonLusD ? el('b', { className: 'table-pastille', textContent: String(nonLusD) }) : null);
          b.onclick = () => choisir(id);
          return b;
        }));
        for (const [id, v] of Object.entries(volets)) v.hidden = id !== onglet;
      }
      function dessinerFil() {
        const jetsV = (vue?.journal || []).slice(-40);
        const chat = (multi.lignes || []).filter((x) => !x.jet).slice(-60);
        const dits = (vue?.recit || []).filter((e) => e.combat).slice(-40);
        const sig = JSON.stringify([jetsV.map((l) => l.n), chat.map((x) => x.n), dits.at(-1)?.n || 0, Math.floor(Date.now() / 30000)]);
        if (sig === sigFil) return;
        const neufs = sigFil ? jetsV.filter((l) => l.n > derJ).length + chat.filter((x) => x.n > derC && x.de !== multi.moi?.id).length : 0;
        derJ = jetsV.at(-1)?.n || 0; derC = chat.at(-1)?.n || 0;
        sigFil = sig;
        if (onglet !== 'chat' && neufs) nonLusC += neufs;
        const auBas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 40;
        const items = [...jetsV.map((l) => ({ t: l.heure || 0, el: () => TablePanneau.carteJet(l) })),
          ...chat.map((x) => ({ t: x.t || 0, el: () => el('div', { className: `table-dit${x.pour !== 'tous' ? ' prive' : ''}` }, el('b', { textContent: x.nom }), el('span', { textContent: ` ${x.texte}` }), x.pour !== 'tous' ? el('small', { textContent: ' (privé)' }) : null) }))]
          .concat(dits.map((e) => ({ t: e.heure || 0, el: () => TablePanneau.ligneRecit(e) })))
          .sort((a, b) => a.t - b.t);
        fil.replaceChildren(...(items.length ? items.map((x) => x.el()) : [el('p', { className: 'table-note table-vide', textContent: 'Les jets de dés et la discussion s\'affichent ici. Écris /r 1d20+@dex pour lancer, /gr pour un jet que seuls toi et le MJ voyez, ou ouvre le tapis de dés (D).' })]));
        if (auBas) fil.scrollTop = fil.scrollHeight;
        const options = [['tous', 'À tous'], ...multi.joueurs.filter((j) => j.id !== multi.moi?.id).map((j) => [j.id, `→ ${j.nom}`])];
        if (!pourQui.matches(':focus')) {
          const avant = pourQui.value || 'tous';
          pourQui.replaceChildren(...options.map(([v, t]) => el('option', { value: v, textContent: t })));
          pourQui.value = options.some(([v]) => v === avant) ? avant : 'tous';
        }
        pourQui.hidden = options.length < 2;
      }
      function dessinerCarte() {
        const p = monHeros(), f = vue?.fiche;
        carte.hidden = !p;
        bas.hidden = !p && !Array.isArray(vue?.macros);
        if (!p) return;
        const pv = f?.pv ?? p.pv, max = f?.pvMax ?? p.pvMax;
        const s = JSON.stringify([p.nom, pv, max, f?.ca, f?.classe, f?.niveau, f?.etats, p.etats]);
        if (s === sigCarte) return;
        sigCarte = s;
        const etats = f?.etats || p.etats || [];
        carte.replaceChildren(
          el('span', { className: 'ti-pion-rond', textContent: (p.nom || '?').trim().charAt(0).toUpperCase() }),
          el('div', { className: 'ti-pion-corps' },
            el('div', { className: 'ti-pion-nom' }, el('b', { textContent: p.nom }), el('small', { textContent: [f?.classe, f?.niveau ? `niv. ${f.niveau}` : ''].filter(Boolean).join(' ') })),
            Number.isFinite(max) && max > 0 ? el('div', { className: `ti-jauge${pv / max < 0.34 ? ' basse' : ''}` }, Object.assign(el('i'), { style: `width:${Math.max(0, Math.min(100, (pv / max) * 100))}%` })) : el('span'),
            el('div', { className: 'ti-pion-bas' }, Number.isFinite(max) ? el('span', { textContent: `${pv} / ${max} PV` }) : el('span'), f?.ca != null ? el('span', { textContent: `CA ${f.ca}` }) : el('span'),
              ...etats.slice(0, 3).map((e) => el('span', { className: 'ti-etat-pion', textContent: typeof e === 'string' ? e : e.nom || '' })))),
          Object.assign(el('button', { className: 'ti-bouton ti-fiche', type: 'button', title: 'Ma fiche' }, el('i', { className: 'codicon codicon-person' })), { onclick: () => choisir('fiche') }));
      }
      function maj() {
        const moi = multi.moi, n = multi.joueurs.filter((j) => j.connecte).length;
        const s = JSON.stringify([vue?.campagne?.nom, jeu?.titre, vue?.nom, vue?.combat?.tour, vue?.combat?.actif, vue?.initiative?.tour, vue?.initiative?.actif, vue?.pause, moi?.nom, n]);
        if (s !== sigHaut) {
          sigHaut = s;
          titre.textContent = vue?.campagne?.nom || jeu?.titre || 'Saga';
          lieu.textContent = vue?.nom || '';
          const oc = vue?.combat || vue?.initiative;
          const actif = oc?.ordre.find((o) => o.id === oc.actif);
          etat.className = `ti-etat ${vue?.pause ? 'ti-etat-pause' : oc ? 'ti-etat-combat' : 'ti-etat-vide'}`;
          etat.replaceChildren(...(vue?.pause ? [el('i', { className: 'codicon codicon-debug-pause' }), 'Pause'] : oc ? [el('i', { className: 'codicon codicon-flame' }), `${vue.combat ? 'Combat' : 'Initiative'} · tour ${oc.tour || 1}${actif ? ` · ${actif.nom}` : ''}`] : []));
          qui.textContent = [moi?.nom, n ? `${n} joueur${n > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
        }
        sansFiche.hidden = Boolean(vue?.fiche);
        dessinerFil();
        dessinerOnglets();
        dessinerCarte();
        if (onglet === 'journal') montrerJournal();
        // Saga 1.37 : mes documents.
        const sd = JSON.stringify([(vue?.documents || []).map((d) => [d.id, d.titre, d.image, d.t]), [...nouveauxDocs]]);
        if (onglet === 'documents' && sd !== sigDocs) { sigDocs = sd; volets.documents.replaceChildren(...listeDocuments()); }
      }
      multi.sur?.((sorte) => { if (sorte === 'chat' || sorte === 'joueurs') maj(); });
      setInterval(dessinerFil, 1000);
      window.addEventListener('resize', () => plateau.oublier());
      return { maj, get onglet() { return onglet; } };
    }

    // --- Saga 1.21.4 : le journal des joueurs (le récit, les jets visibles de tous) ---
    let ongletJournal = 'recit', signatureJ = '', nonLus = 0, vusJ = '';
    journalBouton.onclick = () => { journalEl.hidden = !journalEl.hidden; nonLus = 0; signatureJ = ''; montrerJournal(); };
    function montrerJournal() {
      const recitV = vue?.recit || [], jetsV = vue?.journal || [];
      const fin = `${recitV.at(-1)?.n || 0}:${jetsV.at(-1)?.n || 0}`;
      if (vusJ && fin !== vusJ && journalEl.hidden && !habit) nonLus++;
      vusJ = fin;
      journalBouton.textContent = nonLus && journalEl.hidden ? `Journal · ${nonLus}` : 'Journal';
      journalBouton.classList.toggle('nouveau', Boolean(nonLus && journalEl.hidden));
      if (habit ? habit.onglet !== 'journal' : journalEl.hidden) return;
      if (!reseau) return;
      if (habit) ongletJournal = 'recit';
      const s = `${fin}|${ongletJournal}`;
      if (s === signatureJ) return;
      signatureJ = s;
      const onglets = el('div', { className: 'joueurs-onglets' }, ...[['recit', 'Récit'], ['jets', 'Jets de dés']].map(([id, nom]) => {
        const b = el('button', { className: `joueurs-onglet${ongletJournal === id ? ' actif' : ''}`, type: 'button', textContent: nom });
        b.onclick = () => { ongletJournal = id; signatureJ = ''; montrerJournal(); };
        return b;
      }));
      const liste = el('div', { className: 'joueurs-journal-liste' });
      if (ongletJournal === 'recit') {
        for (const l of recitV) liste.append(el('div', { className: `joueurs-journal-ligne${l.combat ? ' jl-combat' : ''}` }, l.qui ? el('b', { textContent: `${l.qui} : ` }) : null, el('span', { textContent: l.texte })));
        if (!recitV.length) liste.append(el('p', { className: 'joueurs-fiche-note', textContent: 'Rien encore : les dialogues et les combats s\'écrivent ici.' }));
      } else {
        for (const l of jetsV) {
          liste.append(el('div', { className: `joueurs-journal-ligne jet ${l.resultat || ''}` },
            el('div', { className: 'joueurs-jet-tete' }, el('b', { textContent: l.qui }), el('span', { textContent: ` ${l.quoi}` }), el('span', { className: 'joueurs-jet-total', textContent: String(l.total) })),
            el('div', { className: 'joueurs-jet-detail', textContent: `${JdrDes.detail(l)}${l.resultat ? ` · ${JdrDes.RESULTATS[l.resultat] || l.resultat}` : ''}` })));
        }
        if (!jetsV.length) liste.append(el('p', { className: 'joueurs-fiche-note', textContent: 'Aucun jet pour l\'instant.' }));
      }
      journalEl.replaceChildren(...(habit ? [liste] : [onglets, liste]));
      liste.scrollTop = liste.scrollHeight;
    }

    // Saga 1.42 : l'image d'un jeton, demandée une fois à l'hôte (une adresse chez un ami, une data: URL à l'écran des joueurs).
    const jetons = new Map();
    function srcJeton(id) {
      if (jetons.has(id)) return jetons.get(id);
      jetons.set(id, '');
      Promise.resolve(window.saga.tableDocument?.(id, id)).then((src) => { if (src) jetons.set(id, src); else setTimeout(() => jetons.delete(id), 3000); }).catch(() => setTimeout(() => jetons.delete(id), 3000));
      return '';
    }
    // --- La fiche du joueur : la lire, et lancer ses jets (c'est l'hôte qui lance les dés) ---
    let ongletFiche = 'caracs';
    let signature = '';
    function montrerFiche() {
      const f = vue?.fiche;
      fiche.hidden = !f;
      if (!f) return;
      // On ne redessine que si quelque chose a changé (sinon on gênerait les clics).
      const s = JSON.stringify([f, ongletFiche, Boolean(vue.creation), Boolean(vue.combat), ficheLarge, Boolean(imageFiche)]);
      if (s === signature) return;
      // On n'efface pas un champ en train d'être écrit : on redessinera à la prochaine vue.
      const ecrit = document.activeElement;
      if (ecrit && fiche.contains(ecrit) && ecrit.matches('input[type="text"], select')) return;
      signature = s;
      fiche.innerHTML = '';
      // Saga 1.21.3 : la fiche du jeu (Tafl › Réglages › Fiche des personnages), dessinée par commun/fiche-perso.js.
      if (f.modele && typeof FichePerso !== 'undefined') {
        const occupe = Boolean(vue.creation || vue.combat);
        fiche.classList.toggle('large', ficheLarge || f.modele.colonnes > 1);
        const taille = el('button', { className: 'joueurs-fiche-taille', type: 'button', textContent: ficheLarge ? 'Réduire' : 'Agrandir', title: 'La taille de la fiche' });
        taille.onclick = () => { ficheLarge = !ficheLarge; signature = ''; montrerFiche(); };
        const corpsF = el('div', { className: 'joueurs-fiche-corps' }, FichePerso.rendre(f.modele, f, {
          jet: (sorte, id, quoi) => window.saga.tableDemander({ type: 'jet', sorte, id, quoi }),
          utiliser: (objet) => { if (!occupe) window.saga.tableDemander({ type: 'agir_fiche', id: 'objet', objet }); },
          agir: (id) => { if (!occupe) window.saga.tableDemander({ type: 'agir_fiche', id }); },
          changer: (id, valeur) => window.saga.tableDemander({ type: 'champ', id, valeur }),
          cocher: (id, coche) => window.saga.tableDemander({ type: 'bonus', id, coche }),
          occupe, combat: Boolean(vue.combat), image: imageFiche,
        }));
        fiche.classList.toggle('xl', ficheLarge && f.modele.colonnes > 1);
        fiche.append(taille, corpsF);
        return;
      }
      fiche.classList.remove('large', 'xl');
      fiche.append(el('div', { className: 'joueurs-fiche-tete' },
        el('b', { textContent: f.nom }),
        el('span', { className: 'joueurs-fiche-pv', textContent: `${f.pv} / ${f.pvMax} PV` }),
        el('span', { className: 'joueurs-fiche-ca', textContent: `CA ${f.ca}` })));
      if (f.etats?.length) fiche.append(el('div', { className: 'joueurs-fiche-etats', textContent: f.etats.join(', ') }));
      // Saga 1.41 : les bonus du MJ, à cocher avant de lancer.
      if (f.bonusChoix?.length) {
        fiche.append(el('div', { className: 'joueurs-fiche-bonus' }, ...f.bonusChoix.map((b) => {
          const c = el('input', { type: 'checkbox', checked: Boolean(b.coche) });
          c.onchange = () => window.saga.tableDemander({ type: 'bonus', id: b.id, coche: c.checked });
          return el('label', { title: `Sur ${b.sur}. Coché, il s'ajoute à ton prochain jet qu'il concerne.` }, c, ` ${b.nom} ${b.valeur >= 0 ? '+' : '−'}${Math.abs(b.valeur)}`);
        })));
      }
      const onglets = el('div', { className: 'joueurs-onglets' });
      for (const [id, nom] of [['caracs', 'Caracs'], ['competences', 'Compétences'], ['attaques', 'Attaques'], ['sac', 'Sac'], ['actions', `Actions${f.actions?.some((x) => x.id === 'niveau') ? ' ★' : ''}`]]) {
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
      } else if (ongletFiche === 'sac') {
        // Saga 1.21.2 : le sac du groupe, et utiliser un objet (une potion…) hors combat.
        const agir = (o) => window.saga.tableDemander({ type: 'agir_fiche', ...o });
        const occupe = Boolean(vue.creation || vue.combat);
        corps.append(el('div', { className: 'joueurs-fiche-note', textContent: `Sac du groupe · ${f.argent} pièce${f.argent > 1 ? 's' : ''}` }));
        if (!f.sac?.length) corps.append(el('p', { className: 'joueurs-fiche-note', textContent: 'Le sac est vide.' }));
        for (const o of f.sac || []) {
          corps.append(el('div', { className: 'joueurs-fiche-ligne' },
            el('span', { className: 'joueurs-fiche-nom', textContent: `${o.nom} ×${o.n}`, title: o.detail || '' }),
            o.utilisable ? bouton('Utiliser', () => { if (!occupe) agir({ id: 'objet', objet: o.id }); }, 'Utiliser cet objet') : null));
        }
      } else if (ongletFiche === 'actions') {
        const occupe = Boolean(vue.creation || vue.combat);
        for (const a of f.actions || []) {
          const b = el('button', { className: `table-combat-option${a.id === 'niveau' ? ' actif' : ''}`, type: 'button', disabled: occupe }, el('span', { textContent: a.texte }));
          b.onclick = () => window.saga.tableDemander({ type: 'agir_fiche', id: a.id });
          corps.append(b);
        }
        if (vue.combat) corps.append(el('p', { className: 'joueurs-fiche-note', textContent: 'En combat, tout se fait à ton tour.' }));
        if (f.notes) corps.append(el('p', { className: 'joueurs-fiche-note', textContent: `Notes : ${f.notes}` }));
      } else {
        for (const a of f.attaques) {
          corps.append(el('div', { className: 'joueurs-fiche-ligne' },
            el('span', { className: 'joueurs-fiche-nom', textContent: a.nom }),
            el('small', { textContent: `${signe(a.bonus)} · ${a.des}${a.mod ? ` ${signe(a.mod)}` : ''}` })));
        }
        corps.append(el('p', { className: 'joueurs-fiche-note', textContent: 'En combat, à ton tour, tes actions s\'affichent ici : choisis, puis clique la case ou la cible sur le plateau.' }));
      }
      fiche.append(corps);
    }
    // --- Saga 1.21.2 : sans héros, en prendre un libre ou créer le sien (la création tourne chez l'hôte) ---
    let signatureP = '';
    const repondreCreation = (o) => window.saga.tableDemander({ type: 'creation', ...o });
    function montrerChoixPerso() {
      const cr = vue?.creation || null;
      const sans = reseau && vue && vue.role === 'joueurs';
      roleEl.hidden = !(sans || cr);
      roleEl.classList.toggle('creation', Boolean(cr));
      const s = JSON.stringify([sans, cr, vue?.libres, vue?.groupePlein]);
      if (s === signatureP) return;
      signatureP = s;
      roleEl.innerHTML = '';
      if (cr) { montrerCreation(cr); return; }
      if (!sans) return;
      roleEl.append(el('div', { className: 'joueurs-question-tete', textContent: 'Ton personnage' }));
      const creer = el('button', { className: 'table-combat-option', type: 'button', disabled: Boolean(vue.groupePlein) },
        el('i', { className: 'codicon codicon-add' }), el('span', { textContent: 'Créer mon personnage' }), vue.groupePlein ? el('small', { textContent: 'groupe complet' }) : null);
      creer.onclick = () => window.saga.tableDemander({ type: 'creer' });
      roleEl.append(creer);
      for (const l of vue.libres || []) {
        const b = el('button', { className: 'table-combat-option', type: 'button' }, el('i', { className: 'codicon codicon-person' }), el('span', { textContent: `Jouer ${l.nom}` }), l.detail ? el('small', { textContent: l.detail }) : null);
        b.onclick = () => window.saga.tableDemander({ type: 'prendre', heros: l.id });
        roleEl.append(b);
      }
      roleEl.append(el('p', { className: 'joueurs-fiche-note', textContent: 'Ton héros reste dans la partie du MJ : en revenant sous le même nom, tu le retrouves.' }));
    }
    function montrerCreation(q) {
      if (q.sorte === 'attente') { roleEl.append(el('div', { className: 'joueurs-question-aide', textContent: 'Un instant…' })); return; }
      if (q.titre) roleEl.append(el('div', { className: 'joueurs-question-tete', textContent: q.titre }));
      if (q.entete) roleEl.append(el('div', { className: 'joueurs-question-titre', textContent: q.entete }));
      if (q.sorte === 'dire') {
        roleEl.append(el('p', { className: 'joueurs-creation-texte', textContent: q.texte }));
        const b = el('button', { className: 'table-combat-option', type: 'button' }, el('i', { className: 'codicon codicon-check' }), el('span', { textContent: 'Continuer' }));
        b.onclick = () => repondreCreation({ n: q.n });
        roleEl.append(b);
        return;
      }
      if (q.sorte === 'texte') {
        const champ = el('input', { className: 'multi-champ joueurs-creation-champ', type: 'text', maxLength: q.max || 24, value: q.valeur || '' });
        const ok = el('button', { className: 'table-combat-option', type: 'submit' }, el('i', { className: 'codicon codicon-check' }), el('span', { textContent: 'Valider' }));
        const non = el('button', { className: 'table-combat-option retour', type: 'button' }, el('i', { className: 'codicon codicon-arrow-left' }), el('span', { textContent: 'Annuler' }));
        non.onclick = () => repondreCreation({ n: q.n, annuler: true });
        const f = el('form', { className: 'joueurs-creation-form' }, champ, ok, non);
        f.onsubmit = (e) => { e.preventDefault(); repondreCreation({ n: q.n, texte: champ.value }); };
        roleEl.append(f);
        setTimeout(() => champ.focus(), 0);
        return;
      }
      const liste = el('div', { className: 'joueurs-creation-liste' });
      q.items.forEach((it, k) => {
        const b = el('button', { className: 'table-combat-option', type: 'button', disabled: it.desactive }, el('span', { textContent: it.texte }), it.detail ? el('small', { textContent: it.detail }) : null);
        b.onclick = () => repondreCreation({ n: q.n, k });
        liste.append(b);
      });
      roleEl.append(liste);
      if (q.note) roleEl.append(el('p', { className: 'joueurs-fiche-note', textContent: q.note }));
      if (q.annulable) {
        const b = el('button', { className: 'table-combat-option retour', type: 'button' }, el('i', { className: 'codicon codicon-arrow-left' }), el('span', { textContent: 'Retour' }));
        b.onclick = () => repondreCreation({ n: q.n, k: -1 });
        roleEl.append(b);
      }
    }

    // --- Mon tour en combat : la question de l'hôte (son menu, ou un choix sur le plateau) ---
    let signatureQ = '';
    const q = () => vue?.question || null;
    const repondre = (o) => window.saga.tableDemander({ type: 'repondre', ...o });
    function montrerQuestion() {
      const x = q();
      questionEl.hidden = !x;
      document.body.classList.toggle('mon-tour', Boolean(x));
      const s = JSON.stringify(x);
      if (s === signatureQ) return;
      signatureQ = s;
      questionEl.innerHTML = '';
      if (!x) return;
      questionEl.append(el('div', { className: 'joueurs-question-tete', textContent: x.tete || 'À toi' }));
      if (x.menu?.titre) questionEl.append(el('div', { className: 'joueurs-question-titre', textContent: x.menu.titre }));
      if (x.aide) questionEl.append(el('div', { className: 'joueurs-question-aide', textContent: x.aide }));
      if (x.menu) {
        x.menu.items.forEach((it, k) => {
          const b = el('button', { className: 'table-combat-option', type: 'button', disabled: it.desactive },
            it.icone ? el('i', { className: `codicon codicon-${it.icone}` }) : null, el('span', { textContent: it.texte }), it.detail ? el('small', { textContent: it.detail }) : null);
          b.onclick = () => repondre({ menu: x.menu.n, k });
          questionEl.append(b);
        });
        if (x.menu.annulable) {
          const b = el('button', { className: 'table-combat-option retour', type: 'button' }, el('i', { className: 'codicon codicon-arrow-left' }), el('span', { textContent: 'Retour' }));
          b.onclick = () => repondre({ menu: x.menu.n, k: -1 });
          questionEl.append(b);
        }
      } else if (x.choix) {
        const b = el('button', { className: 'table-combat-option retour', type: 'button' }, el('i', { className: 'codicon codicon-arrow-left' }), el('span', { textContent: 'Retour' }));
        b.onclick = () => repondre({ choix: x.choix.n, annuler: true });
        questionEl.append(b);
      }
    }
    // Mon héros (celui que le MJ m'a donné), pour le déplacer sans avoir à le choisir d'abord.
    const monHeros = () => (vue?.moi ? vue.pions.find((p) => p.id === vue.moi) : vue?.role?.startsWith('perso:') ? vue.pions.find((p) => p.sorte === 'heros' && `perso:${p.personnage}` === vue.role) : null);

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
      menuEl.hidden = true;
      if (e.button !== 0) { glisse = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, droit: e.button === 2, px, py }; return; }
      const id = plateau.pionSous(px, py, jeu, vue);
      const c = plateau.caseSous(px, py, jeu);
      if (!q()?.choix && outils.appuyer(c, e)) return;
      // Mon tour en combat : la case où aller, ou la cible.
      const ch = q()?.choix;
      if (ch) {
        if (ch.sorte === 'case') {
          if (!ch.cases || ch.cases.includes(c.y * jeu.cartes.get(vue.carte).largeur + c.x)) repondre({ choix: ch.n, x: c.x, y: c.y });
        } else if (id && ch.cibles?.includes(id)) repondre({ choix: ch.n, id });
        return;
      }
      const p = id ? vue.pions.find((x) => x.id === id) : null;
      const mien = monHeros();
      // Un joueur ne choisit que son héros ; l'écran partagé (sans rôle) peut choisir n'importe lequel.
      if (p?.sorte === 'heros' && (!mien || p.id === mien.id)) { selection = selection === id ? null : id; return; }
      const qui = selection || mien?.id;
      if (!qui || vue.combat || vue.pause) return;
      if (id?.startsWith('ev:')) window.saga.tableDemander({ type: 'parler', pion: qui, id });
      else if (!id) window.saga.tableDemander({ type: 'deplacer', pion: qui, x: c.x, y: c.y });
    });
    window.addEventListener('mousemove', (e) => {
      if (!jeu) return;
      const { px, py } = pos(e);
      survol = plateau.caseSous(px, py, jeu);
      outils.bouger(survol);
      if (glisse) { plateau.glisser(e.clientX - glisse.x, e.clientY - glisse.y); glisse.x = e.clientX; glisse.y = e.clientY; }
    });
    window.addEventListener('mouseup', (e) => {
      const g = glisse;
      glisse = null;
      if (outils.occupe) { outils.lacher(); return; }
      // Un clic droit sans glisser sur mon héros : ses marques.
      if (g?.droit && Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) < 4 && jeu && vue) {
        const id = plateau.pionSous(g.px, g.py, jeu, vue);
        const p = id && vue.pions.find((x) => x.id === id);
        const mien = monHeros();
        if (p && mien && p.id === mien.id) menuMarques(e.clientX, e.clientY, p);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (habit && !e.ctrlKey && !e.metaKey && !e.altKey && /^[1-9]$/.test(e.key) && vue?.macros?.[Number(e.key) - 1]) { window.saga.tableDemander({ type: 'macro', k: Number(e.key) - 1 }); return; }
      if (!e.ctrlKey && !e.metaKey && outils.touche(e)) return;
      if (e.key !== 'Escape') return;
      menuEl.hidden = true;
      const x = q();
      if (x?.choix) repondre({ choix: x.choix.n, annuler: true });
      else if (x?.menu?.annulable) repondre({ menu: x.menu.n, k: -1 });
      else selection = null;
    });

    function tour(maintenant) {
      requestAnimationFrame(tour);
      if (!jeu || !vue) return;
      const carte = jeu.cartes.get(vue.carte);
      if (!carte) return;
      if (selection && !vue.pions.some((p) => p.id === selection)) selection = null;
      const ch = vue.question?.choix;
      const cases = ch?.cases ? new Map(ch.cases.map((i) => [i, 'aller'])) : null;
      const cibles = ch?.cibles ? new Set(ch.cibles) : null;
      plateau.dessiner({ jeu, carte, vue, maintenant, mj: false, jeton: srcJeton, selection: selection || (vue.question ? vue.combat?.actif : null), survol, cases, cibles, outil: outils.dessin(survol) });
    }
    habit = reseau ? habiller() : habillerEcran();
    habit.maj();
    requestAnimationFrame(tour);
    return { plateau, multi, get vue() { return vue; }, get jeu() { return jeu; } };
  }
  return { demarrer };
})();
