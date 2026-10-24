// Colonne « Outils » : une carte par outil (Rune, Skald…), avec sa version installée,
// la dernière publiée sur GitHub, et un bouton qui change selon le cas :
// Installer (pas encore sur ce PC), Mettre à jour (une version plus récente existe), Lancer.
// Les outils sont rangés par catégorie (Développement, Graphisme…), chaque catégorie se replie d'un clic,
// et un filtre façon Steam (Tous / Installés / Mises à jour) en haut de la colonne. Le filtre et les
// catégories repliées sont gardés dans config.json (filtreOutils, categoriesRepliees).
// La liste des outils et des catégories est dans hub/outils.js ; tout le travail (registre, GitHub,
// installeur) se fait dans main.js.

const Outils = (() => {
  const liste = $('#liste-outils');
  const info = $('#outils-info');
  let outils = [];
  let categories = [];
  let filtre = 'tous';
  let repliees = new Set();
  const enCours = new Map(); // id → { step, percent } pendant un téléchargement / une installation
  // Outils que tu as choisi d'installer dès que leur nouvelle version, en cours de fabrication
  // sur GitHub, sera publiée : id → version attendue.
  const attente = new Map();
  let suivi = null; // minuteur qui relit GitHub tant qu'une version est en fabrication

  function ligneVersion(o) {
    if (enCours.has(o.id)) {
      const { step, percent } = enCours.get(o.id);
      return step === 'telechargement' ? `Téléchargement de ${o.nom} ${o.derniere}… ${percent ?? 0} %` : 'Installation en cours…';
    }
    if (attente.has(o.id)) return `En attente de ${o.nom} ${attente.get(o.id)} : installation dès sa publication…`;
    if (o.enPreparation) return `${ligneVersionPubliee(o)} · ${o.enPreparation} en préparation sur GitHub…`;
    return ligneVersionPubliee(o);
  }

  function ligneVersionPubliee(o) {
    if (o.installe && o.miseAJour) return `Installé : ${o.version} · Nouvelle version : ${o.derniere}`;
    if (o.installe) return o.version ? `Version ${o.version}${o.derniere && o.derniere === o.version ? ' · à jour' : ''}` : 'Installé';
    return o.derniere ? `Pas installé · Dernière version : ${o.derniere}` : 'Pas installé · Aucune version publiée';
  }

  function carte(o) {
    const busy = enCours.has(o.id);
    const actions = el('div', { className: 'outil-actions' });
    const bouton = (label, icon, run, primary = false) => {
      const b = el('button', { className: `button small${primary ? ' primary' : ''}`, disabled: busy }, el('i', { className: `codicon codicon-${icon}` }), label);
      b.onclick = run;
      return b;
    };
    if (attente.has(o.id)) {
      if (o.installe) actions.append(bouton('Lancer', 'play', () => lancer(o)));
      actions.append(bouton('Ne plus attendre', 'close', () => { attente.delete(o.id); render(); }));
    } else if (o.installe) {
      actions.append(bouton('Lancer', 'play', () => lancer(o), !o.miseAJour));
      if (o.miseAJour) actions.append(bouton('Mettre à jour', 'cloud-download', () => installer(o), true));
      const dossier = el('button', { className: 'icon-button', title: `Ouvrir le dossier d'installation de ${o.nom}` }, el('i', { className: 'codicon codicon-folder-opened' }));
      dossier.onclick = () => window.atelier.ouvrirDossier(o.id);
      actions.append(el('span', { className: 'spacer' }), dossier);
    } else {
      const b = bouton('Installer', 'desktop-download', () => installer(o), true);
      if (!o.derniere && !o.enPreparation) b.disabled = true;
      actions.append(b);
    }

    const icone = el('img', { className: 'outil-icone', src: `outils/${o.icone}`, alt: '' });
    // Double-clic sur l'icône : lance l'outil, comme sur le bureau.
    if (o.installe) icone.ondblclick = () => lancer(o);
    const card = el('div', { className: `outil${o.miseAJour ? ' a-jour-dispo' : ''}${o.installe ? '' : ' absent'}` },
      icone,
      el('div', { className: 'outil-infos' },
        el('div', { className: 'outil-nom' }, o.nom, el('span', { className: 'glyphe', textContent: o.glyphe })),
        el('div', { className: 'outil-desc', textContent: o.description }),
        el('div', { className: 'outil-version', textContent: ligneVersion(o) })),
      actions);
    if (busy) {
      const { step, percent } = enCours.get(o.id);
      const barre = el('div', { className: `progression${step === 'installation' ? ' indeterminee' : ''}` }, el('div'));
      barre.firstChild.style.width = `${step === 'telechargement' ? percent ?? 0 : 100}%`;
      card.append(barre);
    }
    return card;
  }

  const FILTRES = {
    tous: () => true,
    installes: (o) => o.installe,
    majs: (o) => o.miseAJour,
  };
  const VIDE = {
    installes: 'Aucun outil installé pour l\'instant. Le filtre « Tous » montre ceux que tu peux installer.',
    majs: 'Aucune mise à jour à faire : tout est à jour.',
  };

  function render() {
    for (const b of document.querySelectorAll('#outils-filtres .filtre')) {
      b.classList.toggle('actif', b.dataset.filtre === filtre);
      b.setAttribute('aria-selected', String(b.dataset.filtre === filtre));
      const n = outils.filter(FILTRES[b.dataset.filtre]).length;
      b.querySelector('.compte').textContent = n;
      // « Mises à jour » ne se montre que s'il y en a (ou si c'est le filtre choisi).
      if (b.dataset.filtre === 'majs') b.hidden = !n && filtre !== 'majs';
    }
    const visibles = outils.filter(FILTRES[filtre] || FILTRES.tous);
    const groupes = [];
    for (const c of categories) {
      const dedans = visibles.filter((o) => o.categorie === c.id);
      if (!dedans.length) continue;
      const replie = repliees.has(c.id);
      const titre = el('button', { className: 'categorie-titre', title: replie ? 'Déplier' : 'Replier' },
        el('i', { className: `codicon codicon-chevron-${replie ? 'right' : 'down'}` }),
        el('i', { className: `codicon codicon-${c.icone}` }),
        el('span', { textContent: c.nom }),
        el('span', { className: 'compte', textContent: dedans.length }));
      titre.setAttribute('aria-expanded', String(!replie));
      titre.onclick = () => basculer(c.id);
      const groupe = el('div', { className: `categorie${replie ? ' repliee' : ''}` }, titre);
      if (!replie) groupe.append(el('div', { className: 'categorie-outils' }, ...dedans.map(carte)));
      groupes.push(groupe);
    }
    if (!groupes.length && outils.length) groupes.push(el('p', { className: 'discret outils-vide', textContent: VIDE[filtre] || 'Aucun outil.' }));
    liste.replaceChildren(...groupes);
  }

  function basculer(id) {
    if (repliees.has(id)) repliees.delete(id); else repliees.add(id);
    window.atelier.writeConfig({ categoriesRepliees: [...repliees] });
    render();
  }

  function choisirFiltre(f) {
    filtre = FILTRES[f] ? f : 'tous';
    window.atelier.writeConfig({ filtreOutils: filtre });
    render();
  }
  for (const b of document.querySelectorAll('#outils-filtres .filtre')) b.onclick = () => choisirFiltre(b.dataset.filtre);

  // Appelé au démarrage par app.js avec config.json.
  function reglages(c) {
    filtre = FILTRES[c.filtreOutils] ? c.filtreOutils : 'tous';
    repliees = new Set(c.categoriesRepliees || []);
  }

  async function refresh({ refresh = false, github = true, silencieux = false, auto = false } = {}) {
    const btn = $('#btn-actualiser .codicon');
    btn.classList.add('codicon-modifier-spin');
    try {
      const etat = await window.atelier.etatOutils({ refresh, github, suivi: auto });
      outils = etat.outils;
      categories = etat.categories || [];
      // Plus de mise à jour à faire : le filtre « Mises à jour » vide revient sur « Tous ».
      if (filtre === 'majs' && !outils.some((o) => o.miseAJour)) filtre = 'tous';
      render();
      const dispo = outils.filter((o) => o.miseAJour);
      info.textContent = etat.erreurGithub ? `${etat.erreurGithub}. Les versions installées restent lançables.`
        : !outils.some((o) => o.derniere) ? 'Clique ↻ pour chercher les nouvelles versions sur GitHub.'
          : outils.some((o) => o.enPreparation) ? `En préparation sur GitHub : ${outils.filter((o) => o.enPreparation).map((o) => `${o.nom} ${o.enPreparation}`).join(', ')}.`
            : dispo.length ? `${dispo.length} mise(s) à jour disponible(s).` : 'Tout est à jour.';
      info.classList.toggle('erreur', Boolean(etat.erreurGithub));
      suivre();
      if (!silencieux && refresh && !etat.erreurGithub) notify(dispo.length ? `Mise(s) à jour disponible(s) : ${dispo.map((o) => `${o.nom} ${o.derniere}`).join(', ')}` : 'Tous tes outils sont à jour.', dispo.length ? 'info' : 'success');
      return outils;
    } finally {
      btn.classList.remove('codicon-modifier-spin');
    }
  }

  // Tant qu'une version est en fabrication sur GitHub, on relit toutes les 30 secondes : la carte se
  // met à jour toute seule quand elle est publiée, et celles que tu attends s'installent.
  // « auto » : ces relectures lisent surtout le flux des Releases (gratuit) ; les fabrications en
  // cours (comptées dans la limite de GitHub) ne sont relues que toutes les 2 minutes.
  function suivre() {
    clearTimeout(suivi);
    for (const [id, version] of attente) {
      const o = outils.find((x) => x.id === id);
      if (o?.derniere === version) {
        attente.delete(id);
        installer(o, { confirme: true });
      } else if (o && !o.enPreparation) {
        attente.delete(id);
        notify(`La fabrication de ${o.nom} ${version} sur GitHub s'est arrêtée sans publier la version. Regarde l'onglet « Actions » du dépôt.`, 'error');
      }
    }
    if (outils.some((o) => o.enPreparation)) {
      suivi = setTimeout(() => refresh({ refresh: true, silencieux: true, auto: true }).catch(() => suivre()), 30_000);
    }
    render();
  }

  async function lancer(o) {
    try {
      await window.atelier.lancer(o.id);
      notify(`${o.nom} se lance…`, 'success', 2500);
    } catch (err) {
      notify(`Impossible de lancer ${o.nom} : ${cleanError(err)}`, 'error');
    }
  }

  async function installer(o, { confirme = false } = {}) {
    if (!confirme) {
      // On relit GitHub d'abord : la carte peut dater de plusieurs minutes.
      await refresh({ refresh: true, silencieux: true }).catch(() => {});
      o = outils.find((x) => x.id === o.id) || o;
    }
    if (!confirme && o.enPreparation) {
      // Une version plus récente est en train d'être fabriquée : l'installer maintenant donnerait l'ancienne.
      const choix = await Dialogs.ask(`${o.nom} ${o.enPreparation} arrive`, `GitHub est en train de fabriquer ${o.nom} ${o.enPreparation} (en général 2 à 5 minutes après la fusion).${o.derniere ? ` La dernière version publiée pour l'instant est la ${o.derniere}.` : ''}\n\nAtelier peut attendre et l'installer dès qu'elle est publiée.${o.installe ? '' : '\n\nSi Windows affiche « Windows a protégé votre ordinateur », clique Informations complémentaires puis Exécuter quand même.'}`, [
        { label: 'Annuler', value: null },
        ...(o.derniere && (!o.installe || o.miseAJour) ? [{ label: `Installer la ${o.derniere}`, value: 'maintenant' }] : []),
        { label: `Attendre la ${o.enPreparation}`, value: 'attendre', primary: true },
      ]);
      if (!choix) return;
      if (choix === 'attendre') {
        if (o.installe && await window.atelier.estOuvert(o.id)) notify(`Pense à fermer ${o.nom} avant que la ${o.enPreparation} arrive.`, 'info', 8000);
        attente.set(o.id, o.enPreparation);
        suivre();
        return;
      }
      confirme = true; // « Installer la <ancienne> » : déjà confirmé, pas de deuxième question
    }
    if (o.installe && !confirme) {
      // Mise à jour : on montre ce qui change, et on vérifie que l'outil est fermé
      // (Windows ne laisse pas remplacer un programme ouvert).
      const nouveautes = o.nouveautes.slice(0, 12).map((c) => `• ${c}`).join('\n');
      const ok = await Dialogs.ask(`Mettre à jour ${o.nom}`, `${o.nom} ${o.derniere} est disponible (tu as la ${o.version}).${nouveautes ? `\n\n${nouveautes}` : ''}\n\nAtelier va télécharger l'installeur et l'installer en silence, à la place de l'ancienne version. Tes réglages sont gardés.`, [
        { label: 'Plus tard', value: false },
        { label: 'Mettre à jour', value: true, primary: true },
      ]);
      if (!ok) return;
      while (await window.atelier.estOuvert(o.id)) {
        const encore = await Dialogs.ask(`${o.nom} est ouvert`, `Ferme ${o.nom} (en enregistrant ton travail), puis clique Réessayer.`, [
          { label: 'Annuler', value: false },
          { label: 'Réessayer', value: true, primary: true },
        ]);
        if (!encore) return;
      }
    } else if (o.installe) {
      // Mise à jour que tu as demandée en attendant la nouvelle version : l'outil doit être fermé.
      while (await window.atelier.estOuvert(o.id)) {
        const encore = await Dialogs.ask(`${o.nom} ${o.derniere} est prête`, `Ferme ${o.nom} (en enregistrant ton travail), puis clique Réessayer.`, [
          { label: 'Annuler', value: false },
          { label: 'Réessayer', value: true, primary: true },
        ]);
        if (!encore) return;
      }
    } else if (!confirme) {
      const ok = await Dialogs.ask(`Installer ${o.nom}`, `Atelier va télécharger ${o.nom}-Setup-${o.derniere}.exe depuis GitHub et l'ouvrir. Tu choisiras le dossier d'installation dans l'installeur, comme d'habitude.\n\nSi Windows affiche « Windows a protégé votre ordinateur », clique Informations complémentaires puis Exécuter quand même : l'installeur n'est simplement pas signé par un certificat payant.`, [
        { label: 'Annuler', value: false },
        { label: 'Installer', value: true, primary: true },
      ]);
      if (!ok) return;
    }
    enCours.set(o.id, { step: 'telechargement', percent: 0 });
    render();
    try {
      const { version } = await window.atelier.installer(o.id);
      notify(`${o.nom} ${version} est installé.`, 'success', 6000, [{ label: `Lancer ${o.nom}`, run: () => lancer(o) }]);
    } catch (err) {
      notify(cleanError(err), 'error');
    } finally {
      enCours.delete(o.id);
      await refresh().catch(() => render());
    }
  }

  window.atelier.onProgression(({ id, step, percent }) => {
    if (step === 'fin') return; // la fin est gérée par installer()
    enCours.set(id, { step, percent });
    render();
  });

  $('#btn-actualiser').onclick = () => refresh({ refresh: true }).catch((err) => notify(cleanError(err), 'error'));

  return { refresh, reglages, get liste() { return outils; } };
})();
