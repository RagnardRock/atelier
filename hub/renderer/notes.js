// Widget « Notes » : une liste à gauche, la note choisie à droite.
// - La première ligne d'une note sert de titre dans la liste.
// - Tout s'enregistre tout seul, une demi-seconde après la dernière frappe, dans
//   %APPDATA%\atelier-hub\notes.json (sur ton PC, rien dans le cloud).
// - Une note épinglée reste en haut ; les autres sont triées de la plus récente à la plus ancienne.
// - Une note vide qu'on quitte est supprimée, pour ne pas laisser de « Sans titre » partout.

const Notes = (() => {
  const liste = $('#notes-liste');
  const texte = $('#note-texte');
  const recherche = $('#notes-recherche');
  const etat = $('#note-etat');
  let notes = [];
  let courante = null;
  let minuteur = null;

  const titre = (n) => n.texte.split('\n').find((l) => l.trim())?.trim().replace(/^#+\s*/, '') || 'Sans titre';
  const apercu = (n) => n.texte.split('\n').filter((l) => l.trim()).slice(1, 2).join(' ').trim();
  const triees = () => [...notes].sort((a, b) => (b.epinglee - a.epinglee) || (b.modifiee - a.modifiee));

  function renderListe() {
    const q = recherche.value.trim().toLowerCase();
    const visibles = triees().filter((n) => !q || n.texte.toLowerCase().includes(q));
    liste.replaceChildren(...visibles.map((n) => {
      const li = el('li', { className: n === courante ? 'active' : '' },
        el('div', { className: 'note-titre' }, n.epinglee ? el('i', { className: 'codicon codicon-pinned' }) : null, titre(n)),
        el('div', { className: 'note-apercu', textContent: apercu(n) || dateRelative(n.modifiee) }));
      li.onclick = () => ouvrir(n);
      return li;
    }));
    if (!visibles.length) liste.append(el('li', { className: 'vide', textContent: q ? 'Aucune note ne contient ce texte.' : 'Pas encore de note.' }));
  }

  function renderEditeur() {
    texte.disabled = !courante;
    texte.value = courante?.texte ?? '';
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

  texte.addEventListener('input', () => {
    if (!courante) return;
    courante.texte = texte.value;
    courante.modifiee = Date.now();
    $('#note-date').textContent = 'Modifiée à l\'instant';
    renderListe();
    enregistrerBientot();
  });

  // Tab insère une tabulation au lieu de quitter la zone de texte (pratique pour des listes).
  texte.addEventListener('keydown', (e) => {
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

  async function start() {
    ({ notes } = await window.atelier.lireNotes());
    if (!notes.length) {
      notes = [{ id: crypto.randomUUID(), epinglee: true, creee: Date.now(), modifiee: Date.now(), texte: 'Bienvenue dans Atelier\n\nCe widget garde tes notes sur ton PC. La première ligne devient le titre.\n\n• Ctrl+N : nouvelle note\n• Ctrl+F : chercher dans toutes les notes\n• L\'épingle garde une note en haut de la liste\n\nTu peux supprimer cette note quand tu veux.' }];
      await enregistrer();
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
