// Widget « Notes » : une liste à gauche, la note choisie à droite.
// - La première ligne d'une note sert de titre dans la liste.
// - Tout s'enregistre tout seul, une demi-seconde après la dernière frappe, dans
//   %APPDATA%\atelier-hub\notes.json (sur ton PC, rien dans le cloud).
// - Une note épinglée reste en haut ; les autres sont triées de la plus récente à la plus ancienne.
// - Une note vide qu'on quitte est supprimée, pour ne pas laisser de « Sans titre » partout.
// - Cases à cocher : une ligne qui commence par « - [ ] » est une tâche (« - [x] » = faite), en
//   Markdown standard, donc rien ne change dans notes.json et Loki les lit et les coche avec ses
//   actions habituelles. Clic sur la case = cocher, Entrée = tâche suivante, Ctrl+Shift+L = ligne ↔ tâche.

const Notes = (() => {
  const liste = $('#notes-liste');
  const texte = $('#note-texte');
  const recherche = $('#notes-recherche');
  const etat = $('#note-etat');
  let notes = [];
  let courante = null;
  let minuteur = null;
  const zone = texte.parentElement;
  const miroir = $('#note-miroir');

  // « - [ ] texte », « * [x] texte », avec ou sans retrait. groupes : retrait, puce, coche, texte.
  const TACHE = /^(\s*)([-*+]) \[( |x|X)\](?: |$)/;
  const compterTaches = (t) => {
    let total = 0, faites = 0;
    for (const l of t.split('\n')) { const m = TACHE.exec(l); if (m) { total++; if (m[3] !== ' ') faites++; } }
    return { total, faites };
  };

  const titre = (n) => n.texte.split('\n').find((l) => l.trim())?.trim().replace(/^#+\s*/, '') || 'Sans titre';
  const apercu = (n) => n.texte.split('\n').filter((l) => l.trim()).slice(1, 2).join(' ').trim()
    .replace(/^[-*+] \[( |x|X)\]\s*/, (_, c) => (c === ' ' ? '☐ ' : '☑ '));
  const triees = () => [...notes].sort((a, b) => (b.epinglee - a.epinglee) || (b.modifiee - a.modifiee));

  function badgeTaches(n) {
    const { total, faites } = compterTaches(n.texte);
    if (!total) return null;
    return el('span', { className: `note-taches${faites === total ? ' finies' : ''}`, textContent: `${faites}/${total}`, title: `${faites} tâche${faites > 1 ? 's' : ''} faite${faites > 1 ? 's' : ''} sur ${total}` });
  }

  function renderListe() {
    const q = recherche.value.trim().toLowerCase();
    const visibles = triees().filter((n) => !q || n.texte.toLowerCase().includes(q));
    liste.replaceChildren(...visibles.map((n) => {
      const li = el('li', { className: n === courante ? 'active' : '' },
        el('div', { className: 'note-titre' }, n.epinglee ? el('i', { className: 'codicon codicon-pinned' }) : null, el('span', { className: 'note-titre-texte', textContent: titre(n) }), badgeTaches(n)),
        el('div', { className: 'note-apercu', textContent: apercu(n) || dateRelative(n.modifiee) }));
      li.onclick = () => ouvrir(n);
      return li;
    }));
    if (!visibles.length) liste.append(el('li', { className: 'vide', textContent: q ? 'Aucune note ne contient ce texte.' : 'Pas encore de note.' }));
  }

  function renderEditeur() {
    texte.disabled = !courante;
    texte.value = courante?.texte ?? '';
    texte.scrollTop = 0;
    renderMiroir();
    $('#btn-tache').disabled = !courante;
    $('#note-date').textContent = courante ? `Modifiée ${dateRelative(courante.modifiee)}` : '';
    $('#btn-epingler').classList.toggle('actif', Boolean(courante?.epinglee));
    $('#btn-epingler').disabled = $('#btn-supprimer-note').disabled = !courante;
  }

  async function enregistrer() {
    clearTimeout(minuteur);
    minuteur = null;
    try {
      await window.atelier.ecrireNotes(notes);
      etat.textContent = 'Enregistré';
    } catch (err) {
      etat.textContent = '';
      notify(`Notes non enregistrées : ${cleanError(err)}`, 'error');
    }
  }
  function enregistrerBientot() {
    etat.textContent = '…';
    clearTimeout(minuteur);
    minuteur = setTimeout(enregistrer, 500);
  }

  // Quitter une note vide la supprime.
  function oublierSiVide() {
    if (courante && !courante.texte.trim()) {
      notes = notes.filter((n) => n !== courante);
      enregistrerBientot();
    }
  }

  function ouvrir(n) {
    if (n !== courante) oublierSiVide();
    courante = n;
    renderListe();
    renderEditeur();
    etat.textContent = '';
    texte.focus();
  }

  function nouvelle() {
    recherche.value = '';
    const n = { id: crypto.randomUUID(), texte: '', epinglee: false, creee: Date.now(), modifiee: Date.now() };
    notes.push(n);
    ouvrir(n);
  }

  // --- Cases à cocher ---
  // Le miroir redessine le texte ligne par ligne ; seules les lignes de tâche sont décorées.
  function renderMiroir() {
    const avec = texte.value.split('\n').some((l) => TACHE.test(l));
    zone.classList.toggle('avec-taches', avec);
    if (!avec) { miroir.replaceChildren(); return; }
    const lignes = texte.value.split('\n');
    miroir.replaceChildren(...lignes.map((l, i) => {
      const m = TACHE.exec(l);
      const fin = i < lignes.length - 1 ? '\n' : '\u200b';
      if (!m) return document.createTextNode(l + fin);
      const prefixe = m[0].length;
      const span = el('span', { className: `tache${m[3] !== ' ' ? ' tache-faite' : ''}` },
        m[1],
        el('span', { className: 'tache-case', textContent: l.slice(m[1].length, prefixe) }),
        el('span', { className: 'tache-texte', textContent: l.slice(prefixe) }),
        fin);
      span.dataset.ligne = i;
      return span;
    }));
    caler();
  }
  // Même largeur utile que la zone de saisie (sa barre de défilement mange de la place) et même défilement.
  function caler() {
    miroir.style.width = `${texte.clientWidth}px`;
    miroir.scrollTop = texte.scrollTop;
  }
  texte.addEventListener('scroll', () => { miroir.scrollTop = texte.scrollTop; });
  new ResizeObserver(() => { if (zone.classList.contains('avec-taches')) caler(); }).observe(texte);

  const debutLigne = (pos) => texte.value.lastIndexOf('\n', pos - 1) + 1;
  const finLigne = (pos) => { const i = texte.value.indexOf('\n', pos); return i < 0 ? texte.value.length : i; };
  // Remplace un morceau du texte comme si tu l'avais tapé : Ctrl+Z l'annule, et l'évènement « input »
  // enregistre la note.
  function remplacer(debut, fin, nouveau, curseur) {
    texte.focus();
    texte.setSelectionRange(debut, fin);
    if (!document.execCommand('insertText', false, nouveau)) {
      texte.setRangeText(nouveau, debut, fin, 'end');
      texte.dispatchEvent(new Event('input'));
    }
    if (curseur) texte.setSelectionRange(curseur[0], curseur[1]);
  }

  // Quelle case est sous la souris ? (on compare aux cases dessinées dans le miroir)
  function caseSous(x, y) {
    if (!zone.classList.contains('avec-taches')) return null;
    for (const c of miroir.querySelectorAll('.tache-case')) {
      const r = c.getBoundingClientRect();
      if (x >= r.left - 2 && x <= r.left + 18 && y >= r.top && y <= r.bottom) return Number(c.parentElement.dataset.ligne);
    }
    return null;
  }
  function cocher(ligne) {
    const lignes = texte.value.split('\n');
    const m = TACHE.exec(lignes[ligne] || '');
    if (!m) return;
    let pos = 0;
    for (let i = 0; i < ligne; i++) pos += lignes[i].length + 1;
    const coche = pos + m[1].length + 3;
    const { selectionStart: a, selectionEnd: b } = texte;
    remplacer(coche, coche + 1, m[3] === ' ' ? 'x' : ' ', [a, b]);
  }
  texte.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey || e.detail > 1) return;
    const ligne = caseSous(e.clientX, e.clientY);
    if (ligne === null) return;
    e.preventDefault();
    cocher(ligne);
  });
  texte.addEventListener('mousemove', (e) => { texte.style.cursor = caseSous(e.clientX, e.clientY) !== null ? 'pointer' : ''; });

  // Ligne(s) sélectionnée(s) ↔ tâches. Si toutes sont déjà des tâches, on enlève les cases ;
  // sinon les lignes non vides deviennent des tâches (une puce « - » ou « • » existante est réutilisée).
  function basculerTaches() {
    if (!courante) return;
    const debut = debutLigne(texte.selectionStart);
    const fin = finLigne(texte.selectionEnd > texte.selectionStart && texte.value[texte.selectionEnd - 1] === '\n' ? texte.selectionEnd - 1 : texte.selectionEnd);
    const lignes = texte.value.slice(debut, fin).split('\n');
    const toutes = lignes.filter((l) => l.trim()).every((l) => TACHE.test(l)) && lignes.some((l) => l.trim());
    const nouvelles = lignes.map((l) => {
      if (toutes) return l.replace(TACHE, (_, r) => r);
      if (TACHE.test(l) || (!l.trim() && lignes.length > 1)) return l;
      return l.replace(/^(\s*)(?:[-*+•]\s+)?/, (_, r) => `${r}- [ ] `);
    });
    const bloc = nouvelles.join('\n');
    remplacer(debut, fin, bloc, lignes.length === 1 ? [debut + bloc.length, debut + bloc.length] : [debut, debut + bloc.length]);
  }
  $('#btn-tache').onclick = basculerTaches;

  // Entrée sur une tâche : nouvelle tâche en dessous. Entrée sur une tâche vide : fin de la liste.
  function entree(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.isComposing) return false;
    const { selectionStart: a, selectionEnd: b } = texte;
    if (a !== b) return false;
    const debut = debutLigne(a);
    const ligne = texte.value.slice(debut, finLigne(a));
    const m = TACHE.exec(ligne);
    if (!m || a - debut < m[0].length) return false;
    e.preventDefault();
    if (!ligne.slice(m[0].length).trim()) remplacer(debut, debut + ligne.length, m[1]);
    else document.execCommand('insertText', false, `\n${m[1]}${m[2]} [ ] `);
    return true;
  }

  texte.addEventListener('input', () => {
    renderMiroir();
    if (!courante) return;
    courante.texte = texte.value;
    courante.modifiee = Date.now();
    $('#note-date').textContent = 'Modifiée à l\'instant';
    renderListe();
    enregistrerBientot();
  });

  // Tab insère une tabulation au lieu de quitter la zone de texte (pratique pour des listes).
  texte.addEventListener('keydown', (e) => {
    if (entree(e)) return;
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') { e.preventDefault(); basculerTaches(); return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      document.execCommand('insertText', false, '\t');
    }
  });

  recherche.addEventListener('input', renderListe);
  recherche.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { recherche.value = ''; renderListe(); texte.focus(); }
    if (e.key === 'Enter') { const premiere = liste.querySelector('li:not(.vide)'); if (premiere) premiere.click(); }
  });

  $('#btn-nouvelle-note').onclick = nouvelle;
  $('#btn-epingler').onclick = () => {
    if (!courante) return;
    courante.epinglee = !courante.epinglee;
    renderListe();
    renderEditeur();
    enregistrerBientot();
  };
  $('#btn-supprimer-note').onclick = async () => {
    if (!courante) return;
    if (courante.texte.trim()) {
      const ok = await Dialogs.ask('Supprimer la note', `Supprimer « ${titre(courante)} » ? Cette action ne peut pas être annulée.`, [
        { label: 'Annuler', value: false },
        { label: 'Supprimer', value: true, primary: true },
      ]);
      if (!ok) return;
    }
    notes = notes.filter((n) => n !== courante);
    courante = triees()[0] || null;
    renderListe();
    renderEditeur();
    await enregistrer();
  };

  // Raccourcis du widget : Ctrl+N nouvelle note, Ctrl+F rechercher.
  document.addEventListener('keydown', (e) => {
    if (Dialogs.isOpen() || !e.ctrlKey || e.altKey || e.shiftKey) return;
    if (e.key.toLowerCase() === 'n') { e.preventDefault(); nouvelle(); }
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); recherche.focus(); recherche.select(); }
  });

  // En fermant Atelier, on enregistre ce qui attendait encore.
  window.addEventListener('beforeunload', () => { if (minuteur) enregistrer(); });

  // Les dates « il y a 5 min » vieillissent : on les rafraîchit chaque minute.
  setInterval(() => { renderListe(); if (courante) $('#note-date').textContent = `Modifiée ${dateRelative(courante.modifiee)}`; }, 60_000);

  const BIENVENUE_AVANT = 'Bienvenue dans Atelier\n\nCe widget garde tes notes sur ton PC. La première ligne devient le titre.\n\n• Ctrl+N : nouvelle note\n• Ctrl+F : chercher dans toutes les notes\n• L\'épingle garde une note en haut de la liste\n\nTu peux supprimer cette note quand tu veux.';
  const BIENVENUE = 'Bienvenue dans Atelier\n\nCe widget garde tes notes sur ton PC. La première ligne devient le titre.\n\n• Ctrl+N : nouvelle note\n• Ctrl+F : chercher dans toutes les notes\n• L\'épingle garde une note en haut de la liste\n• Ctrl+Shift+L (ou le bouton liste) : transforme la ligne en case à cocher\n• Entrée sur une case : case suivante ; Entrée sur une case vide : fin de la liste\n\n- [x] Clique sur une case pour la cocher\n- [ ] Écris « - [ ] » au début d\'une ligne pour faire une case\n\nTu peux supprimer cette note quand tu veux.';

  // Deuxième note créée au premier lancement : le tour des outils. Pas de numéros de version (ils vieilliraient).
  // Si tu ajoutes un outil ou une grosse nouveauté, pense à la mettre ici aussi.
  const MES_OUTILS = [
    "Mes outils",
    "",
    "ᚨ Atelier : le hub",
    "• Installe, met à jour, lance et désinstalle tous les outils (dépôt GitHub RagnardRock/atelier)",
    "• Colonne Outils rangée par catégorie : Développement, Graphisme, Bureautique, Jeu",
    "• Filtre en haut : Tous / Favoris / Installés / Mises à jour",
    "• Étoile sur une carte = favori (passe en tête de sa catégorie)",
    "• Sur chaque carte : Installer / Mettre à jour / Lancer, bouton dossier (dossier d'installation), corbeille (désinstaller en gardant réglages et fichiers)",
    "• ↻ : relit les versions sur GitHub ; si une version est en préparation, Atelier propose de l'attendre et de l'installer dès sa publication",
    "• Se met lui-même à jour : bouton « Mise à jour » de la barre de titre (notification au démarrage)",
    "• Réglages (engrenage ou Ctrl+,) : prénom, couleur d'accent, verre dépoli, flou de Windows 11, mises à jour au démarrage, dossier des projets (D:\\Projets par défaut), orthographe, presse-papiers, Loki, IA locale, widgets affichés",
    "• Données dans %APPDATA%\\atelier-hub ; dossier partagé avec les outils : %APPDATA%\\atelier-commun (mémoire des projets, copie des notes, projet en cours)",
    "",
    "— Développement —",
    "",
    "ᚱ Rune : l'IDE",
    "• Code, terminal intégré, Git, serveurs et aperçu web",
    "• Emmet, Prettier, support Vue et TypeScript",
    "• Nouveaux projets : Node, Express, Vue, HTML…",
    "",
    "— Graphisme —",
    "",
    "ᛋ Skald : la retouche d'images et de logos",
    "• Ouvre PSD (avec calques), PNG, JPEG, WebP, SVG, ICO…",
    "• Outils façon Photoshop",
    "• Menu Logo : retirer un fond blanc, teinte unie, contour, ombre, pack d'icônes",
    "• Palette de couleurs partagée avec Atelier et Rune",
    "• Export PNG / WebP / JPEG / ICO",
    "",
    "ᛒ Brokk : l'export d'images aux tailles et formats du web",
    "• Une image (PSD, calque, SVG…) → toutes les versions utiles, directement dans le projet",
    "• Recettes : favicon et icônes (+ balises dans index.html), image nette @1x/@2x, image responsive, image Open Graph, tailles libres",
    "• Bouton Surveiller : ré-exporte tout seul quand l'image source est enregistrée",
    "• Depuis Atelier : clic droit sur un projet › Exporter les assets avec Brokk",
    "",
    "— Bureautique —",
    "",
    "ᛗ Mimir : lecteur de documents",
    "• PDF à annoter, signer et remplir, EPUB, BD (CBZ/CBR), Word en lecture",
    "",
    "ᚲ Kenning : liseuse d'eBooks avec bibliothèque",
    "• EPUB, MOBI, AZW3, FB2",
    "",
    "ᛞ Reikna : tableur",
    "• Compatible Excel et LibreOffice (xlsx, ods, csv), formules en français",
    "• Graphiques et mise en forme conditionnelle",
    "",
    "ᛖ Edda : traitement de texte",
    "• Compatible Word et LibreOffice, aussi Markdown et HTML",
    "• Images flottantes, sélection multiple avec Ctrl",
    "• Sommaire à côté de la page",
    "• Repères et blocs déroulants",
    "• Styles personnalisables, polices installées (Format › Styles…)",
    "",
    "— Jeu —",
    "",
    "ᛏ Tafl : éditeur de jeu 2D (tuiles, cartes, événements, règles)",
    "• Dessin de tuiles en pixel art (mosaïque, miroir, animations, palettes)",
    "• Cartes à calques, passage, zones, téléporteurs, carte monde, groupes de cartes",
    "• Événements et scripts (dialogues, choix, quêtes, combats, boutiques…), personnages et sprites",
    "• Données du jeu : types, attaques, créatures, objets, rencontres, boutiques",
    "• Import de planches (fond retiré, tampons), export Tiled",
    "• Génération de tuiles avec ComfyUI",
    "",
    "ᛃ Saga : le moteur des jeux faits avec Tafl",
    "• Lit le dossier de jeu (sans jamais le modifier) et le fait tourner, seul ou à plusieurs",
    "• Exporte les jeux (page web ou installeur .exe)",
    "• Déplacements, dialogues, événements, combats, capture, XP, évolutions",
    "• Un seul menu de jeu (Échap) : équipe, bestiaire, sac, quêtes, sauvegarde, options…",
    "• Carte du monde en jeu",
    "",
    "Loki (Claude ou IA locale)",
    "• Dans Atelier : connaît mes notes, mon calendrier et mes projets ; agit dans Atelier (notes, évènements, minuteurs, projets, outils, calculs) avec ma validation",
    "• Chaque outil a son propre Loki (sauf Saga) : il continue le projet ouvert depuis Atelier et agit dans l'outil, avec ma permission",
    "• Mémoire par projet partagée entre tous les Loki",
    "• « + » nouvelle conversation, horloge : conversations précédentes",
    "• Réglages : modèle, accès aux fichiers des projets, actions dans Atelier, actions autorisées sans demander",
    "• IA locale (Réglages › IA locale…) : Atelier installe Ollama et un modèle ; « Qui répond » = Auto, Claude ou IA locale",
    "  ◦ Vaut pour Atelier et pour tous les outils qui ont un Loki",
    "  ◦ Utile quand il n'y a plus de tokens Claude, ou simplement par choix",
    "",
    "Widgets d'Atelier (affichés ou cachés dans Réglages › Widgets affichés)",
    "• Notes : Markdown, 1re ligne = titre, Ctrl+N nouvelle note, Ctrl+F chercher, l'épingle garde une note en haut, orthographe au clic droit",
    "  ◦ Cases à cocher : « - [ ] tâche », clic = cocher (barrée), Ctrl+Maj+L ligne ↔ tâche, compteur « 2/5 » dans la liste",
    "• Projets récents : du plus récent au plus ancien, avec leur état Git ; clic = ouvrir avec son outil, clic droit = Rune, Skald, Tafl, Brokk… ou l'Explorateur ; signet = mémoire du projet",
    "• Presse-papiers et couleurs : historique des copies (texte), palette partagée avec Skald et Rune, pipette",
    "• Minuteurs : plusieurs en même temps, 5, 15, 25 min, Pomodoro ou durée au choix ; carillon + notification, gardés si Atelier se ferme",
    "• Calendrier : double-clic sur un jour pour ajouter un évènement (avec ou sans heure, avec une note), rappel 10 min avant",
    "• Calculatrice : calcul tapé ou cliqué, résultat pendant la frappe ; + − × ÷, ^, √, parenthèses, %, π, « Rés » ; historique des 30 derniers calculs",
    "• Loki : la conversation avec l'assistant",
  ].join('\n');

  async function start() {
    ({ notes } = await window.atelier.lireNotes());
    if (!notes.length) {
      // Bienvenue (épinglée, en haut), puis « Mes outils » juste en dessous.
      const t = Date.now();
      notes = [
        { id: crypto.randomUUID(), epinglee: true, creee: t, modifiee: t, texte: BIENVENUE },
        { id: crypto.randomUUID(), epinglee: false, creee: t - 1, modifiee: t - 1, texte: MES_OUTILS },
      ];
      await enregistrer();
    } else {
      // La note de bienvenue d'avant 0.20.1, jamais retouchée : on lui donne le nouveau mode d'emploi.
      const ancienne = notes.find((n) => n.texte === BIENVENUE_AVANT);
      if (ancienne) { ancienne.texte = BIENVENUE; await enregistrer(); }
    }
    courante = triees()[0] || null;
    renderListe();
    renderEditeur();
    etat.textContent = '';
  }

  // --- Pour les actions de Claude (widget Claude) ---
  const trouver = (id) => {
    const n = notes.find((x) => x.id === id);
    if (!n) throw new Error(`Aucune note n'a l'id ${id}`);
    return n;
  };
  // n : la note ajoutée ou modifiée (null après une suppression). L'éditeur n'est redessiné que si la
  // note ouverte est concernée, pour ne pas te déranger si tu es en train d'écrire dans une autre.
  function apresChangement(n) {
    if (n) n.modifiee = Date.now();
    const ouverteSupprimee = courante && !notes.includes(courante);
    if (ouverteSupprimee) courante = triees()[0] || null;
    renderListe();
    if (ouverteSupprimee || (n && n === courante)) renderEditeur();
    return enregistrer();
  }
  async function ajouter(texteNote, epinglee = false) {
    if (!String(texteNote || '').trim()) throw new Error('La note est vide');
    const n = { id: crypto.randomUUID(), texte: String(texteNote), epinglee: Boolean(epinglee), creee: Date.now(), modifiee: Date.now() };
    notes.push(n);
    await apresChangement(n);
    return `Note « ${titre(n)} » ajoutée (id : ${n.id}).`;
  }
  async function modifier(id, { texte: nouveau, epinglee } = {}) {
    const n = trouver(id);
    if (nouveau !== undefined) {
      if (!String(nouveau).trim()) throw new Error('Le nouveau texte est vide (pour supprimer la note, utilise supprimer_note)');
      n.texte = String(nouveau);
    }
    if (epinglee !== undefined) n.epinglee = Boolean(epinglee);
    await apresChangement(n);
    return `Note « ${titre(n)} » modifiée.`;
  }
  async function supprimer(id) {
    const n = trouver(id);
    notes = notes.filter((x) => x !== n);
    await apresChangement(null);
    return `Note « ${titre(n)} » supprimée.`;
  }
  const titreDe = (id) => { const n = notes.find((x) => x.id === id); return n ? titre(n) : null; };

  return { start, enregistrer, ajouter, modifier, supprimer, titreDe };
})();
