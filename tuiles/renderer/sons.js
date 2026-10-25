// Les sons du jeu dans Tafl (Tafl 0.29, joués par Saga 0.11) : une liste pour choisir un son du dossier
// sons/ du jeu, avec « Ajouter un son… » (le fichier est copié dans sons/) et ▶ pour l'écouter.
//
// Sons.choix(doc, valeur, { mots, change }) rend { element, get valeur() }. mots : les choix qui ne sont
// pas des fichiers, en tête de liste ([['', 'Aucune'], ['aucune', 'Silence']]…).

const Sons = (() => {
  let liste = null, dossierListe = null; // les fichiers de sons/, gardés pour toutes les listes ouvertes
  async function fichiers(doc, recharger = false) {
    const folder = doc?.game?.folder;
    if (!folder) return [];
    if (recharger || !liste || dossierListe !== folder) {
      dossierListe = folder;
      liste = await window.tafl.listeSons(folder).catch(() => []);
    }
    return liste;
  }

  // L'écoute : un seul son à la fois ; ▶ sur le son qui joue l'arrête.
  let ctx = null, lecture = null;
  async function ecouter(doc, chemin, bouton) {
    if (lecture) { const fini = lecture.chemin === chemin; lecture.stop(); if (fini) return; }
    if (!/^sons\//.test(chemin || '')) return;
    try {
      ctx ??= new AudioContext();
      const octets = await window.tafl.lireSon(doc.game.folder, chemin);
      const buf = await ctx.decodeAudioData(new Uint8Array(octets).slice().buffer);
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(ctx.destination);
      s.start();
      const fin = () => { if (lecture?.source === s) lecture = null; bouton?.classList.remove('active'); };
      lecture = { chemin, source: s, stop: () => { try { s.stop(); } catch { /* fini */ } fin(); } };
      s.onended = fin;
      bouton?.classList.add('active');
      // Une musique s'écoute 20 secondes au plus : c'est un aperçu.
      setTimeout(() => { if (lecture?.source === s) lecture.stop(); }, 20000);
    } catch (err) {
      notify(`Impossible d'écouter ${chemin} : ${cleanError(err)}`, 'error');
    }
  }

  function choix(doc, valeur, { mots = [['', 'Aucun']], change = () => {} } = {}) {
    let v = valeur || '';
    const select = el('select', { className: 'son-choix' });
    const remplir = (fs) => {
      select.replaceChildren();
      for (const [k, l] of mots) select.add(new Option(l, k));
      for (const f of fs) select.add(new Option(f.slice('sons/'.length), f));
      // Un son qui n'est plus dans le dossier : gardé, marqué.
      if (v && !mots.some(([k]) => k === v) && !fs.includes(v)) select.add(new Option(`${v.slice('sons/'.length)} (introuvable)`, v));
      select.value = v;
    };
    remplir([]);
    fichiers(doc).then(remplir);
    select.onchange = () => { v = select.value; change(v); };
    const jouer = el('button', { type: 'button', className: 'icon-button', title: 'Écouter (encore une fois pour arrêter)' }, [el('i', { className: 'codicon codicon-play' })]);
    jouer.onclick = (e) => { e.preventDefault(); ecouter(doc, v, jouer); };
    const ajouter = el('button', { type: 'button', className: 'icon-button', title: 'Ajouter un son au jeu (copié dans son dossier sons/)' }, [el('i', { className: 'codicon codicon-add' })]);
    ajouter.onclick = async (e) => {
      e.preventDefault();
      if (!doc.game?.folder) return notify('Enregistre d\'abord le jeu dans un dossier (Fichier › Enregistrer le jeu) : ses sons vont dans son dossier sons/.', 'info', 6000);
      try {
        const ajoutes = await window.tafl.importerSons(doc.game.folder);
        if (!ajoutes.length) return;
        remplir(await fichiers(doc, true));
        v = ajoutes[0];
        select.value = v;
        change(v);
        notify(ajoutes.length > 1 ? `${ajoutes.length} sons ajoutés au dossier sons/.` : `${ajoutes[0]} ajouté.`, 'success', 2500);
      } catch (err) {
        notify(cleanError(err), 'error');
      }
    };
    const element = el('span', { className: 'son-champ' }, [select, jouer, ajouter]);
    return { element, get valeur() { return v; } };
  }

  // Une ligne de fenêtre (Dialogs.form) : « Libellé [liste ▶ +] ».
  function ligne(label, c) {
    return el('label', { className: 'field' }, [el('span', { className: 'field-label', textContent: label }), c.element]);
  }

  return { choix, ligne, fichiers, ecouter };
})();
