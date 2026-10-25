// Deux outils pour essayer son jeu (Tafl 0.27), dans le menu Jeu :
// - Vérifier le jeu (Ctrl+Maj+V) : la liste de ce que trouve verificateur.js (téléporteurs cassés,
//   personnages inaccessibles, quêtes impossibles, ids inconnus). Un clic sur une ligne montre la case.
// - Test rapide (Ctrl+F5) : lancer Saga avec un état de départ choisi (case de départ, équipe et niveau,
//   objets, argent, badges, interrupteurs, quêtes). Les états se gardent avec un nom dans jeu.json
//   (doc.tests) ; Saga les reçoit par --test (voir main.js, jeu:jouer) et sauvegarde ces parties à part.
const OutilsJeu = (() => {
  // Le jeu au format des fichiers (celui que lit Saga), sans rien écrire sur le disque.
  // Tafl 0.31 : avec ce que déclarent les scripts JS (ScriptsTafl.etat), pour le vérificateur.
  const jeuDe = (doc) => ({ cartes: doc.maps.map((m) => IO.mapToJSON(doc, m)), depart: doc.depart, donnees: doc.data, scripts: ScriptsTafl.etat(doc) });

  // --- Vérifier le jeu ---
  // Montrer un problème : sa carte (espace Cartes) et sa case. Tafl 0.30 : « Revoir la liste » ouvre
  // l'espace Jeu, où la liste reste affichée.
  function allerA(p) {
    const doc = App.doc;
    if (p.script) { Espaces.aller('evenements', { script: p.script, ligne: p.ligne }); return; }
    const i = doc.maps.findIndex((m) => m.id === p.carte);
    if (i < 0) return;
    App.setMode('map');
    App.selectMap(i);
    if (Number.isInteger(p.x) && Number.isInteger(p.y)) requestAnimationFrame(() => Stage.montrer(p.x, p.y));
    const actions = [{ label: 'Revoir la liste', run: () => Espaces.aller('jeu') }];
    if (p.evenement) actions.unshift({ label: 'Ouvrir l\'événement', run: () => Espaces.aller('evenements', { carte: p.carte, evenement: p.evenement }) });
    notify(p.message, p.gravite === 'erreur' ? 'error' : 'warning', 8000, actions);
  }
  async function verifier() {
    const doc = App.doc;
    if (!doc || Events.isOpen()) return;
    await ScriptsTafl.rafraichir(doc); // l'inventaire des scripts à jour
    let r = Verificateur.verifier(jeuDe(doc));
    let filtre = 'tout';
    const w = Events.fenetre({ titre: 'Vérifier le jeu', icone: 'checklist', largeur: 980 });
    const main = el('div', { className: 'editor-main verif' });
    w.body.append(main);
    const onglets = [['tout', 'Tout'], ['erreur', 'Erreurs'], ['attention', 'À vérifier']].map(([id, nom]) => {
      const b = el('button', { textContent: nom });
      b.onclick = () => { filtre = id; render(); };
      w.tabs.append(b);
      return [id, b, nom];
    });
    const fermer = () => { w.root.remove(); Events.occuper(null); };
    const aller = (p) => { fermer(); allerA(p); };
    function render() {
      for (const [id, b, nom] of onglets) {
        b.classList.toggle('active', id === filtre);
        const n = id === 'tout' ? r.problemes.length : id === 'erreur' ? r.erreurs : r.attentions;
        b.replaceChildren(nom, el('span', { className: 'panel-count', textContent: String(n) }));
      }
      main.replaceChildren();
      const liste = r.problemes.filter((p) => filtre === 'tout' || p.gravite === filtre);
      if (!liste.length) {
        main.append(el('div', { className: 'verif-vide' }, [
          icon('pass-filled'),
          el('strong', { textContent: r.problemes.length ? 'Rien dans cette liste.' : 'Aucun problème trouvé.' }),
          el('span', { textContent: 'Le vérificateur lit tout le jeu, cartes et scripts, en supposant que le joueur obtient tout ce que le jeu donne ou vend. Il ne remplace pas une vraie partie : essaie aussi le test rapide (Ctrl+F5).' }),
        ]));
      }
      for (const [cat, nom] of Object.entries(Verificateur.CATEGORIES)) {
        const items = liste.filter((p) => p.categorie === cat);
        if (!items.length) continue;
        main.append(el('div', { className: 'editor-section' }, [el('span', { textContent: `${nom} (${items.length})` })]));
        for (const p of items) {
          const carte = p.carte && doc.maps.find((m) => m.id === p.carte);
          const lieu = carte ? `${carte.name}${Number.isInteger(p.x) ? ` (${p.x}, ${p.y})` : ''}` : '';
          const ligne = el('button', { className: `verif-ligne ${p.gravite}`, title: carte ? 'Voir sur la carte' : '' }, [
            icon(p.gravite === 'erreur' ? 'error' : 'warning'),
            el('span', { className: 'verif-message', textContent: p.message }),
            lieu ? el('span', { className: 'verif-lieu' }, [icon('location'), lieu]) : null,
          ]);
          ligne.disabled = !carte && !p.script;
          ligne.onclick = () => aller(p);
          main.append(ligne);
        }
      }
      w.hint.textContent = r.problemes.length
        ? `${r.erreurs} erreur(s) : ce qui empêche de jouer ou de finir le jeu ; ${r.attentions} à vérifier : peut-être voulu. Clique une ligne pour voir la case.`
        : 'Tout est en ordre.';
    }
    w.close.onclick = fermer;
    w.bouton('Vérifier à nouveau', async () => { await ScriptsTafl.rafraichir(doc); r = Verificateur.verifier(jeuDe(doc)); render(); });
    w.bouton('Fermer', fermer, true);
    Events.occuper({ fermer, valider: fermer });
    render();
  }

  // --- Test rapide ---
  // Un état de départ (FORMAT.md › Test rapide) :
  //   { nom, depart: { carte, x, y, direction } | null, equipe: [{ id, niveau }], objets: { id: nombre },
  //     argent: nombre | null, badges: [id], interrupteurs: [id], quetes: { id: { etat, etape } } }
  const DERNIER = 'tafl.testRapide.dernier';
  const vide = (doc) => {
    const jrpg = doc.data.reglages?.regles === 'jrpg';
    // Le héros du groupe JRPG est là dès le début : on le met d'office.
    const heros = jrpg ? doc.data.personnages.find((p) => p.heros && p.classe) : null;
    return { nom: '', depart: null, equipe: heros ? [{ id: heros.id, niveau: heros.niveau || 1 }] : [], objets: {}, argent: null, heure: null, badges: [], interrupteurs: [], quetes: {} };
  };
  const copie = (o) => JSON.parse(JSON.stringify(o));
  function normTest(t, doc) {
    const v = vide(doc);
    const o = t && typeof t === 'object' ? t : {};
    return {
      nom: String(o.nom || ''),
      depart: o.depart && typeof o.depart === 'object' && o.depart.carte ? { carte: String(o.depart.carte), x: Math.round(Number(o.depart.x) || 0), y: Math.round(Number(o.depart.y) || 0), direction: o.depart.direction || 'bas' } : null,
      equipe: Array.isArray(o.equipe) ? o.equipe.filter((m) => m?.id).map((m) => ({ id: String(m.id), niveau: clamp(Math.round(Number(m.niveau) || 5), 1, 100) })) : v.equipe,
      objets: o.objets && typeof o.objets === 'object' ? Object.fromEntries(Object.entries(o.objets).filter(([, n]) => Number(n) > 0).map(([k, n]) => [k, Math.round(Number(n))])) : {},
      argent: o.argent === null || o.argent === undefined || o.argent === '' ? null : Math.max(0, Math.round(Number(o.argent) || 0)),
      // Tafl 0.29 : l'heure de l'horloge du jeu au départ du test (null : l'heure de départ du jeu).
      heure: o.heure === null || o.heure === undefined || o.heure === '' ? null : clamp(Math.round(Number(o.heure) || 0), 0, 23),
      badges: Array.isArray(o.badges) ? o.badges.map(String) : [],
      interrupteurs: Array.isArray(o.interrupteurs) ? o.interrupteurs.map(String) : [],
      quetes: o.quetes && typeof o.quetes === 'object' ? o.quetes : {},
    };
  }

  function testRapide({ ici = null } = {}) {
    const doc = App.doc;
    if (!doc || Events.isOpen()) return;
    if (!doc.game) return notify('Le test rapide lance le jeu dans Saga : il faut un dossier de jeu (Fichier › Enregistrer comme dossier de jeu).', 'info', 5000);
    doc.tests = Array.isArray(doc.tests) ? doc.tests : [];
    const d = doc.data;
    const jrpg = d.reglages?.regles === 'jrpg';
    const jdr = d.reglages?.regles === 'jdr';
    const enGroupe = jrpg || jdr;
    const nivMax = jdr ? 20 : 100;
    const nom = (liste, id) => liste.find((x) => x.id === id)?.nom || liste.find((x) => x.id === id)?.titre || id;
    // Les membres possibles : les créatures (Pokémon), les personnages qui ont une classe (JRPG), ou les
    // pré-tirés (JDR : un personnage avec une fiche de classe).
    const membres = jdr ? d.personnages.filter((p) => p.jdr?.classe).map((p) => [p.id, `${p.nom || p.id}${p.heros ? ' (héros)' : ''}`])
      : jrpg ? d.personnages.filter((p) => p.classe).map((p) => [p.id, `${p.nom || p.id}${p.heros ? ' (héros)' : ''}`]) : d.creatures.map((c) => [c.id, `${c.numero ? `#${c.numero} ` : ''}${c.nom || c.id}`]);
    const objets = d.objets.map((o) => [o.id, o.nom || o.id]);
    const badges = d.reglages?.badges || [];

    let choisi = -1;
    try { choisi = doc.tests.findIndex((t) => t.nom === localStorage.getItem(DERNIER)); } catch { /* rien */ }
    let etat = choisi >= 0 ? normTest(doc.tests[choisi], doc) : vide(doc);
    // Ouvert depuis la case sous la souris : on part de là.
    if (ici && choisi < 0) etat.depart = ici;
    let avant = JSON.stringify(etat);

    const w = Events.fenetre({ titre: 'Test rapide', icone: 'beaker', largeur: 1080 });
    const side = el('div', { className: 'editor-side test-side' });
    const main = el('div', { className: 'editor-main test-main' });
    w.body.append(side, main);

    const fermer = async () => {
      if (JSON.stringify(etat) !== avant && etat.nom && !(await Dialogs.ask('Test rapide', 'Fermer sans enregistrer ce que tu as changé dans cet état ?', [
        { label: 'Continuer', value: false },
        { label: 'Fermer', value: true, primary: true },
      ]))) return;
      w.root.remove();
      Events.occuper(null);
    };
    const choisir = async (i) => {
      if (JSON.stringify(etat) !== avant && etat.nom && !(await Dialogs.ask('Test rapide', 'Changer d\'état sans enregistrer celui-ci ?', [
        { label: 'Continuer', value: false },
        { label: 'Changer', value: true, primary: true },
      ]))) return;
      choisi = i;
      etat = i >= 0 ? normTest(doc.tests[i], doc) : vide(doc);
      avant = JSON.stringify(etat);
      renderTout();
    };

    function renderSide() {
      side.replaceChildren(el('div', { className: 'editor-section' }, [el('span', { textContent: 'États enregistrés' })]));
      const rows = el('div', { className: 'rows' });
      if (!doc.tests.length) rows.append(el('div', { className: 'rows-empty', textContent: 'Aucun pour l\'instant. Choisis un état à droite, donne-lui un nom (« Avant l\'arène 2 ») et enregistre-le pour le relancer d\'un clic.' }));
      doc.tests.forEach((t, i) => {
        const r = el('div', { className: `row${i === choisi ? ' active' : ''}` }, [icon('beaker'), el('span', { className: 'row-name', textContent: t.nom || `État ${i + 1}` })]);
        r.firstChild.classList.add('lead');
        r.onclick = () => choisir(i);
        r.ondblclick = () => { choisir(i).then(lancer); };
        rows.append(r);
      });
      const nouveau = el('button', { className: 'button small' }, [icon('add'), ' Nouvel état']);
      nouveau.onclick = () => choisir(-1);
      side.append(rows, nouveau);
    }

    // Petits champs
    const nombre = (valeur, min, max, onchange, placeholder = '') => {
      const i = el('input', { type: 'number', min, max, value: valeur ?? '', placeholder });
      i.oninput = () => onchange(i.value === '' ? null : clamp(Math.round(Number(i.value) || 0), min, max));
      return i;
    };
    const liste = (choix, valeur, onchange) => {
      const s = el('select');
      for (const [k, l] of choix) s.add(new Option(l, k));
      s.value = String(valeur);
      s.onchange = () => onchange(s.value);
      return s;
    };
    const champ = (label, ...inputs) => el('label', { className: 'field' }, [el('span', { className: 'field-label', textContent: label }), ...inputs]);
    const supprimer = (run) => {
      const b = el('button', { className: 'icon-button', title: 'Retirer' }, [icon('trash')]);
      b.onclick = run;
      return b;
    };
    const section = (texte) => el('div', { className: 'editor-section' }, [el('span', { textContent: texte })]);

    function renderMain() {
      main.replaceChildren();
      const titre = el('input', { type: 'text', value: etat.nom, placeholder: 'Avant l\'arène 2, Fin du jeu…' });
      titre.oninput = () => { etat.nom = titre.value.trim(); majPied(); };
      main.append(champ('Nom de l\'état', titre));

      // Départ
      main.append(section('Départ'));
      const ou = liste([['jeu', 'Le départ du jeu'], ['case', 'Une case choisie']], etat.depart ? 'case' : 'jeu', (v) => {
        etat.depart = v === 'case' ? (doc.depart ? { ...doc.depart } : { carte: doc.map.id, x: Math.floor(doc.map.width / 2), y: Math.floor(doc.map.height / 2), direction: 'bas' }) : null;
        renderMain();
      });
      main.append(champ('Commencer sur', ou));
      if (etat.depart) {
        const dep = etat.depart;
        const carte = liste(doc.maps.map((m) => [m.id, m.name]), dep.carte, (v) => { dep.carte = v; });
        const x = nombre(dep.x, 0, 255, (v) => { dep.x = v ?? 0; });
        const y = nombre(dep.y, 0, 255, (v) => { dep.y = v ?? 0; });
        const dir = liste([['bas', 'Vers le bas'], ['haut', 'Vers le haut'], ['gauche', 'Vers la gauche'], ['droite', 'Vers la droite']], dep.direction || 'bas', (v) => { dep.direction = v; });
        main.append(champ('Carte', carte), champ('Case', el('span', { className: 'field-unit', textContent: 'x' }), x, el('span', { className: 'field-unit', textContent: 'y' }), y, dir));
      }

      // Équipe (ou groupe)
      main.append(section(enGroupe ? 'Groupe de héros' : 'Équipe'));
      if (!membres.length) main.append(el('div', { className: 'rows-empty', textContent: jdr ? 'Aucun pré-tiré : donne une fiche de JDR à un personnage dans Données du jeu › Personnages (sinon, la création de personnage se fait au début du test).' : jrpg ? 'Aucun personnage n\'a de classe : donne-leur une classe dans Données du jeu › Personnages.' : 'Pas encore de créatures : importe-les ou crée-les dans Données du jeu › Créatures.' }));
      else {
        etat.equipe.forEach((m, i) => {
          main.append(el('div', { className: 'field test-ligne' }, [
            liste(membres.some(([id]) => id === m.id) ? membres : [[m.id, `${m.id} (introuvable)`], ...membres], m.id, (v) => { m.id = v; }),
            el('span', { className: 'field-unit', textContent: 'Niv.' }),
            nombre(m.niveau, 1, nivMax, (v) => { m.niveau = v ?? 1; }),
            supprimer(() => { etat.equipe.splice(i, 1); renderMain(); }),
          ]));
        });
        const max = jrpg ? 8 : 6; // JDR : 6 personnages au plus, comme la création
        const actions = el('div', { className: 'test-actions' });
        if (etat.equipe.length < max) {
          const ajouter = el('button', { className: 'button small' }, [icon('add'), enGroupe ? ' Ajouter un héros' : ' Ajouter une créature']);
          ajouter.onclick = () => {
            const pris = new Set(etat.equipe.map((m) => m.id));
            etat.equipe.push({ id: (membres.find(([id]) => !pris.has(id)) || membres[0])[0], niveau: etat.equipe.at(-1)?.niveau || (jdr ? 1 : 5) });
            renderMain();
          };
          actions.append(ajouter);
        }
        if (etat.equipe.length) {
          const niv = el('input', { type: 'number', min: 1, max: nivMax, placeholder: 'Niv.' });
          const tous = el('button', { className: 'button small', textContent: 'Mettre tout le monde à ce niveau' });
          tous.onclick = () => { const n = clamp(Math.round(Number(niv.value) || 0), 1, nivMax); if (niv.value) { for (const m of etat.equipe) m.niveau = n; renderMain(); } };
          actions.append(niv, tous);
        }
        main.append(actions);
        main.append(el('div', { className: 'editor-hint', textContent: etat.equipe.length ? 'Ces membres remplacent l\'équipe de départ.' : jdr ? 'Vide : la création de personnage au début, comme une vraie partie.' : (jrpg ? 'Vide : le groupe de départ du jeu.' : 'Vide : une équipe vide, comme au début du jeu.') }));
      }

      // Objets
      main.append(section('Objets du sac'));
      if (!objets.length) main.append(el('div', { className: 'rows-empty', textContent: 'Pas encore d\'objets : crée-les dans Données du jeu › Objets.' }));
      else {
        for (const [id, n] of Object.entries(etat.objets)) {
          main.append(el('div', { className: 'field test-ligne' }, [
            liste(objets.some(([o]) => o === id) ? objets : [[id, `${id} (introuvable)`], ...objets], id, (v) => { const k = etat.objets[id]; delete etat.objets[id]; etat.objets[v] = (etat.objets[v] || 0) + k; renderMain(); }),
            el('span', { className: 'field-unit', textContent: '×' }),
            nombre(n, 1, 999, (v) => { etat.objets[id] = v ?? 1; }),
            supprimer(() => { delete etat.objets[id]; renderMain(); }),
          ]));
        }
        const libre = objets.find(([id]) => !(id in etat.objets));
        if (libre) {
          const ajouter = el('button', { className: 'button small' }, [icon('add'), ' Ajouter un objet']);
          ajouter.onclick = () => { etat.objets[libre[0]] = 1; renderMain(); };
          main.append(el('div', { className: 'test-actions' }, [ajouter]));
        }
      }
      const argent = nombre(etat.argent, 0, 9999999, (v) => { etat.argent = v; }, String(d.reglages?.argent_depart ?? 0));
      argent.classList.add('test-argent');
      main.append(champ('Argent', argent, el('span', { className: 'field-unit', textContent: `${d.reglages?.monnaie || ''} · vide : l'argent de départ du jeu` })));
      // L'heure (Tafl 0.29) : pour essayer une scène de nuit sans attendre.
      if (d.reglages?.temps?.horloge === 'jeu') {
        const heure = nombre(etat.heure, 0, 23, (v) => { etat.heure = v; }, String(d.reglages.temps.heure_depart ?? 8));
        heure.classList.add('test-argent');
        main.append(champ('Heure', heure, el('span', { className: 'field-unit', textContent: 'h · vide : l\'heure de départ du jeu' })));
      }

      // Badges
      if (badges.length) {
        main.append(section('Badges'));
        const grille = el('div', { className: 'test-coches' });
        for (const b of badges) {
          const c = el('input', { type: 'checkbox', checked: etat.badges.includes(b.id) });
          c.onchange = () => { etat.badges = c.checked ? [...new Set([...etat.badges, b.id])] : etat.badges.filter((x) => x !== b.id); };
          grille.append(el('label', { className: 'test-coche' }, [c, b.nom || b.id]));
        }
        main.append(grille);
      }

      // Interrupteurs
      if (d.interrupteurs.length) {
        main.append(section('Interrupteurs allumés'));
        const grille = el('div', { className: 'test-coches' });
        for (const s of d.interrupteurs) {
          const c = el('input', { type: 'checkbox', checked: etat.interrupteurs.includes(s.id) });
          c.onchange = () => { etat.interrupteurs = c.checked ? [...new Set([...etat.interrupteurs, s.id])] : etat.interrupteurs.filter((x) => x !== s.id); };
          grille.append(el('label', { className: 'test-coche', title: s.description || s.id }, [c, s.nom || s.id]));
        }
        main.append(grille);
      }

      // Quêtes
      if (d.quetes.length) {
        main.append(section('Quêtes'));
        for (const q of d.quetes) {
          const n = Math.max(1, q.etapes?.length || 0);
          const choix = [['', 'Pas commencée'], ...Array.from({ length: n }, (_, i) => [`en_cours:${i + 1}`, `En cours, étape ${i + 1}${q.etapes?.[i]?.texte ? ` : ${q.etapes[i].texte}` : ''}`]), ['finie', 'Finie']];
          const e = etat.quetes[q.id];
          const val = e?.etat === 'finie' ? 'finie' : e?.etat === 'en_cours' ? `en_cours:${e.etape || 1}` : '';
          main.append(champ(q.titre || q.id, liste(choix, val, (v) => {
            if (!v) delete etat.quetes[q.id];
            else if (v === 'finie') etat.quetes[q.id] = { etat: 'finie', etape: n };
            else etat.quetes[q.id] = { etat: 'en_cours', etape: Number(v.split(':')[1]) };
          })));
        }
      }
    }

    let boutonSupprimer = null;
    function majPied() {
      w.hint.textContent = 'Saga démarre une partie neuve avec cet état. Ses sauvegardes vont à part : ta vraie partie n\'est pas touchée. Double-clic sur un état enregistré : le lancer.';
      if (boutonSupprimer) boutonSupprimer.hidden = choisi < 0;
    }
    function renderTout() { renderSide(); renderMain(); majPied(); }

    async function enregistrer() {
      if (!etat.nom) {
        const v = await Dialogs.form({ title: 'Nom de l\'état', okLabel: 'Enregistrer', fields: [{ key: 'nom', label: 'Nom', type: 'text', value: '' }] });
        if (!v?.nom?.trim()) return false;
        etat.nom = v.nom.trim();
      }
      // Un autre état du même nom est remplacé.
      const meme = doc.tests.findIndex((t, i) => i !== choisi && t.nom === etat.nom);
      if (meme >= 0) {
        doc.tests.splice(meme, 1);
        if (meme < choisi) choisi--;
      }
      if (choisi >= 0) doc.tests[choisi] = copie(etat);
      else { doc.tests.push(copie(etat)); choisi = doc.tests.length - 1; }
      avant = JSON.stringify(etat);
      doc.dirty = true;
      App.refresh();
      renderTout();
      return true;
    }
    async function lancer() {
      if (choisi >= 0 && JSON.stringify(etat) !== avant) await enregistrer();
      try { if (etat.nom) localStorage.setItem(DERNIER, etat.nom); } catch { /* rien */ }
      const test = copie(etat);
      w.root.remove();
      Events.occuper(null);
      await App.run(() => App.jouer(false, test));
    }

    w.close.onclick = fermer;
    boutonSupprimer = w.bouton('Supprimer l\'état', async () => {
      if (choisi < 0) return;
      if (!(await Dialogs.ask('Supprimer l\'état', `Supprimer « ${doc.tests[choisi].nom} » ?`, [{ label: 'Annuler', value: false }, { label: 'Supprimer', value: true, primary: true }]))) return;
      doc.tests.splice(choisi, 1);
      doc.dirty = true;
      App.refresh();
      choisi = -1;
      etat = vide(doc);
      avant = JSON.stringify(etat);
      renderTout();
    });
    w.bouton('Enregistrer l\'état', () => enregistrer());
    w.bouton('Annuler', fermer);
    w.bouton('Lancer dans Saga', lancer, true);
    Events.occuper({ fermer, valider: lancer });
    renderTout();
  }

  return { verifier, testRapide, jeuDe, allerA };
})();
