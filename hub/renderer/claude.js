// Widget « Claude » : une conversation avec Claude Code, qui tourne dans main.js (voir ../claude.js).
// - Claude connaît tes notes, ton calendrier, tes projets récents (avec leurs derniers commits) et
//   Atelier lui-même (ses outils, leurs versions, ses widgets) : Atelier les lui prépare avant chacun
//   de tes messages.
// - Il ne modifie aucun fichier et ne lance aucune commande. Il peut agir dans Atelier (ajouter une
//   note, un évènement, lancer un minuteur, ouvrir un projet, installer un outil…) : une carte te demande
//   d'abord ton accord (réglage « Actions » de Claude). Calculer et chercher les mises à jour ne
//   changent rien : pas de carte. L'action est faite ici, par les widgets, qui se mettent à jour.
// - La réponse s'affiche au fil de l'eau, en Markdown. Chaque fichier qu'il lit apparaît sur une ligne.
// - Les conversations sont gardées dans %APPDATA%\atelier-hub\claude-conversations.json : la dernière
//   est toujours là au prochain démarrage d'Atelier, et Claude s'en souvient (--resume).
//   « + » en commence une nouvelle ; le bouton horloge ouvre la liste des conversations, pour en
//   rouvrir une (Claude la reprend là où elle en était), la renommer ou la supprimer.

const ClaudeWidget = (() => {
  const liste = $('#claude-messages');
  const saisie = $('#claude-saisie');
  const btnEnvoyer = $('#btn-claude-envoyer');
  const etat = $('#claude-etat');

  let occupe = false;
  let bulle = null;        // réponse en cours d'écriture
  let brut = '';           // son texte Markdown
  let rendreBientot = false;
  const outils = new Map(); // id d'outil -> { ligne, item }
  // Toutes les conversations, et celle qui est affichée. Une conversation neuve n'entre dans la liste
  // qu'à son premier message (pas de conversations vides).
  let conversations = [];
  const neuve = () => ({ id: crypto.randomUUID(), titre: '', sessionId: null, items: [], creee: Date.now(), modifiee: Date.now() });
  let conv = neuve();

  const SUGGESTIONS = [
    'Qu\'est-ce qui m\'attend cette semaine ?',
    'Quels projets ont avancé ces derniers jours ?',
    'Résume mes notes épinglées',
    'Qu\'est-ce que j\'ai laissé en cours (pas commité, pas poussé) ?',
    'Lance un Pomodoro',
  ];

  const enregistrer = () => {
    if (conv.items.length && !conv.supprimee && !conversations.includes(conv)) conversations.push(conv);
    return window.atelier.ecrireDonnees('claude-conversations', { courante: conv.id, conversations }).catch(() => {});
  };

  function setOccupe(valeur, texte = '') {
    occupe = valeur;
    btnEnvoyer.title = valeur ? 'Arrêter Loki (Échap)' : 'Envoyer (Entrée)';
    btnEnvoyer.firstChild.className = `codicon codicon-${valeur ? 'debug-stop' : 'send'}`;
    btnEnvoyer.classList.toggle('stop', valeur);
    etat.replaceChildren(...(valeur ? [el('i', { className: 'codicon codicon-loading codicon-modifier-spin' }), texte || 'Loki réfléchit…'] : []));
  }

  function enBas() {
    if (liste.scrollHeight - liste.scrollTop - liste.clientHeight < 120) liste.scrollTop = liste.scrollHeight;
  }

  function accueil() {
    const chips = SUGGESTIONS.map((s) => {
      const b = el('button', { className: 'claude-suggestion', textContent: s });
      b.onclick = () => envoyer(s);
      return b;
    });
    liste.replaceChildren(el('div', { className: 'claude-accueil' },
      el('i', { className: 'codicon rune-loki', textContent: 'ᛚ' }),
      el('p', { textContent: 'Demande-moi ce que tu veux sur tes notes, ton calendrier, tes projets ou les outils d\'Atelier.' }),
      el('p', { className: 'discret', textContent: 'Je peux aussi ajouter une note, un évènement, lancer un minuteur, ouvrir un projet, installer ou mettre à jour un outil : tu valides chaque action.' }),
      el('div', { className: 'claude-suggestions' }, ...chips)));
  }

  // --- Affichage ---

  function bulleUtilisateur(texte) {
    liste.querySelector('.claude-accueil')?.remove();
    liste.append(el('div', { className: 'claude-msg user' }, el('div', { className: 'bulle', textContent: texte })));
    liste.scrollTop = liste.scrollHeight;
  }

  function bulleClaude(texte) {
    const b = el('div', { className: 'claude-msg assistant' }, el('div', { className: 'markdown' }));
    b.firstChild.innerHTML = renderMarkdown(texte);
    liste.append(b);
    return b;
  }

  function avis(type, texte) {
    finTexte();
    liste.append(el('div', { className: `claude-avis ${type}` },
      el('i', { className: `codicon codicon-${type === 'erreur' ? 'error' : 'info'}` }), el('div', { textContent: texte })));
    enBas();
  }

  function ligneOutil(icone, libelle, etatOutil) {
    const icones = { encours: 'loading codicon-modifier-spin', fait: 'check', echec: 'close' };
    const ligne = el('div', { className: `claude-outil ${etatOutil}`, title: libelle },
      el('i', { className: `codicon codicon-${icone}` }),
      el('span', { className: 'libelle', textContent: libelle }),
      el('i', { className: `codicon etat codicon-${icones[etatOutil] || 'circle-slash'}` }));
    liste.append(ligne);
    return ligne;
  }

  function texte(morceau) {
    if (!bulle) {
      liste.querySelector('.claude-accueil')?.remove();
      bulle = bulleClaude('');
      brut = '';
    }
    brut += morceau;
    if (!rendreBientot) {
      rendreBientot = true;
      requestAnimationFrame(() => {
        rendreBientot = false;
        if (bulle) bulle.firstChild.innerHTML = renderMarkdown(brut);
        enBas();
      });
    }
  }

  function finTexte() {
    if (!bulle) return;
    bulle.firstChild.innerHTML = renderMarkdown(brut);
    conv.items.push({ t: 'assistant', text: brut });
    bulle = null;
  }

  // --- Actions dans Atelier ---
  // Les outils d'Atelier (Rune, Skald, Brokk… : la colonne Outils), et l'Explorateur.
  const nomOutil = (id) => (id === 'explorateur' ? 'l\'Explorateur' : Outils.liste.find((o) => o.id === id)?.nom || id);
  const debut = (t) => { const l = String(t || '').split('\n').find((x) => x.trim()) || ''; return l.length > 60 ? `${l.slice(0, 60)}…` : l; };
  // [icône, phrase, détail à montrer sur la carte]
  function decrireAction(action, a = {}) {
    switch (action) {
      case 'ajouter_note': return ['note', `Ajouter une note${a.epinglee ? ' épinglée' : ''} : « ${debut(a.texte)} »`, a.texte];
      case 'modifier_note': return ['edit', `Modifier la note « ${Notes.titreDe(a.id) || a.id} »${a.epinglee === true ? ' (l\'épingler)' : a.epinglee === false ? ' (la désépingler)' : ''}`, a.texte];
      case 'supprimer_note': return ['trash', `Supprimer la note « ${Notes.titreDe(a.id) || a.id} »`];
      case 'ajouter_evenement': return ['calendar', `Ajouter au calendrier : « ${a.titre} », ${a.date}${a.heure ? ` à ${a.heure}` : ''}`, a.note];
      case 'modifier_evenement': return ['edit', `Modifier l'évènement ${Calendrier.decrire(a.id) || a.id} : ${['titre', 'date', 'heure', 'note'].filter((k) => a[k] !== undefined).map((k) => `${k} → ${a[k] || '(vide)'}`).join(', ')}`];
      case 'supprimer_evenement': return ['trash', `Supprimer l'évènement ${Calendrier.decrire(a.id) || a.id}`];
      case 'lancer_minuteur': return ['watch', `Lancer un minuteur${a.nom ? ` « ${a.nom} »` : ''} de ${a.minutes} min`];
      case 'ouvrir_projet': return ['folder-opened', `Ouvrir le projet ${a.nom}${a.outil ? ` dans ${nomOutil(a.outil)}` : ''}`];
      case 'lancer_outil': return ['rocket', `Lancer ${nomOutil(a.outil)}`];
      case 'installer_outil': {
        const o = Outils.liste.find((x) => x.id === a.outil);
        const verbe = o?.installe ? 'Mettre à jour' : 'Installer';
        return ['desktop-download', a.attendre ? `${verbe} ${nomOutil(a.outil)} dès que sa nouvelle version est publiée` : `${verbe} ${nomOutil(a.outil)}${o?.derniere ? ` (version ${o.derniere})` : ''}`];
      }
      case 'desinstaller_outil': return ['trash', `Désinstaller ${nomOutil(a.outil)} (tes réglages et fichiers sont gardés)`];
      case 'verifier_mises_a_jour': return ['refresh', 'Cherche les nouvelles versions sur GitHub'];
      case 'calculer': return ['symbol-operator', `Calcule ${a.calcul}`];
      case 'retenir_projet': return ['bookmark', `Retenir sur ${a.projet} : « ${debut(a.texte)} »`, a.texte];
      case 'oublier_projet': return ['bookmark', `Oublier sur ${a.projet} : « ${debut(Projets.infoMemoire(a.projet, a.id)?.texte || a.id)} »`];
      default: return ['tools', action];
    }
  }

  // Les actions, exécutées par les widgets. Renvoie le texte que Claude recevra.
  const ACTIONS = {
    ajouter_note: (a) => Notes.ajouter(a.texte, a.epinglee),
    modifier_note: (a) => Notes.modifier(a.id, a),
    supprimer_note: (a) => Notes.supprimer(a.id),
    ajouter_evenement: (a) => Calendrier.ajouter(a),
    modifier_evenement: (a) => Calendrier.modifier(a.id, a),
    supprimer_evenement: (a) => Calendrier.supprimer(a.id),
    lancer_minuteur: (a) => Minuteurs.lancer(a.nom, a.minutes),
    async ouvrir_projet(a) {
      const { projets } = await window.atelier.projets();
      const p = projets.find((x) => x.nom.toLowerCase() === String(a.nom || '').toLowerCase());
      if (!p) throw new Error(`Aucun projet récent ne s'appelle ${a.nom}`);
      const outil = a.outil || p.outil;
      await window.atelier.ouvrirProjet(p.dossier, outil);
      return `${p.nom} s'ouvre dans ${nomOutil(outil)}.`;
    },
    async lancer_outil(a) {
      if (!Outils.liste.some((o) => o.id === a.outil)) throw new Error(`Outil inconnu : ${a.outil} (outils : ${Outils.liste.map((o) => o.id).join(', ')})`);
      await window.atelier.lancer(a.outil);
      return `${nomOutil(a.outil)} se lance.`;
    },
    installer_outil: (a) => Outils.pourLoki.installer(a.outil, a.attendre),
    desinstaller_outil: (a) => Outils.pourLoki.desinstaller(a.outil),
    async verifier_mises_a_jour() {
      const liste = await Outils.refresh({ refresh: true, silencieux: true });
      if (Outils.erreurGithub) throw new Error(`GitHub n'a pas répondu : ${Outils.erreurGithub}`);
      return liste.map((o) => `${o.nom} (${o.id}) : ${o.installe ? `installé${o.version ? ` ${o.version}` : ''}` : 'pas installé'}`
        + `${o.derniere ? `, dernière publiée ${o.derniere}` : ', aucune version publiée'}${o.miseAJour ? ' → mise à jour disponible' : ''}`
        + `${o.enPreparation ? `, ${o.enPreparation} en préparation` : ''}`).join('\n');
    },
    calculer(a) {
      const r = Calculatrice.evaluer(String(a.calcul || ''));
      if (r === null) throw new Error('Calcul vide');
      return `${a.calcul} = ${r}`;
    },
    retenir_projet: (a) => Projets.retenir(a.projet, a.texte),
    oublier_projet: (a) => Projets.oublier(a.projet, a.id),
  };
  window.atelier.onClaudeAction(async ({ id, outil, args }) => {
    let resultat;
    try {
      if (!ACTIONS[outil]) throw new Error(`Action inconnue : ${outil}`);
      resultat = { texte: await ACTIONS[outil](args) };
    } catch (err) {
      resultat = { erreur: cleanError(err) };
    }
    window.atelier.claudeActionFaite(id, resultat);
  });

  // La carte Autoriser / Refuser.
  function carteAction(e) {
    finTexte();
    const [icone, phrase, detail] = decrireAction(e.action, e.input);
    const refuser = el('button', { className: 'button small', textContent: 'Refuser' });
    const autoriser = el('button', { className: 'button small primary', textContent: 'Autoriser' });
    const LIBELLES = { notes: 'les notes', calendrier: 'le calendrier', minuteurs: 'les minuteurs', projets: 'les projets et outils', memoire: 'la mémoire des projets', installation: 'installer, mettre à jour ou désinstaller un outil' };
    const toujours = el('button', { className: 'claude-carte-toujours', textContent: `Toujours autoriser pour ${LIBELLES[e.famille] || 'ce type d\'action'}`, title: 'Loki ne te demandera plus pour ce type d\'action (modifiable dans les réglages d\'Atelier)' });
    const carte = el('div', { className: 'claude-carte' },
      el('div', { className: 'claude-carte-titre' }, el('i', { className: `codicon codicon-${icone}` }), el('span', { textContent: phrase })),
      detail ? el('pre', { className: 'claude-carte-detail', textContent: detail }) : null,
      el('div', { className: 'claude-carte-boutons' }, el('span', { className: 'spacer' }), refuser, autoriser),
      toujours);
    const repondre = (oui) => {
      window.atelier.claudePermission({ requestId: e.requestId, toolUseId: e.toolUseId, autoriser: oui, input: e.input });
      // La carte s'efface : la ligne de l'action, juste au-dessus, montre la suite (✓ fait, ✗ refusé).
      carte.remove();
      setOccupe(true);
    };
    refuser.onclick = () => repondre(false);
    toujours.onclick = async () => {
      try {
        await window.atelier.claudeToujours(e.famille);
        notify(`Loki ne te demandera plus pour ${LIBELLES[e.famille]}. Tu peux changer ça dans les réglages (Ctrl+,).`, 'success', 5000);
      } catch (err) {
        notify(cleanError(err), 'error');
      }
      repondre(true);
    };
    autoriser.onclick = () => repondre(true);
    liste.append(carte);
    setOccupe(true, 'Loki attend ton accord');
    liste.scrollTop = liste.scrollHeight;
    autoriser.focus();
  }

  // Ce que Claude lit ou fait, dit simplement.
  function decrireOutil(nom, inp = {}) {
    if (nom.startsWith('mcp__atelier__')) return decrireAction(nom.slice('mcp__atelier__'.length), inp).slice(0, 2);
    const fichier = String(inp.file_path || '').split(/[\\/]/).pop();
    const CONTEXTE = { 'atelier.md': 'Regarde les outils et widgets d\'Atelier', 'notes.md': 'Lit tes notes', 'calendrier.md': 'Lit ton calendrier', 'projets.md': 'Lit l\'état de tes projets', 'CLAUDE.md': 'Relit ses consignes' };
    switch (nom) {
      case 'Read': return ['eye', CONTEXTE[fichier] || `Lit ${inp.file_path || ''}`];
      case 'Grep': return ['search', `Cherche « ${inp.pattern || ''} »`];
      case 'Glob': return ['files', `Cherche les fichiers ${inp.pattern || ''}`];
      default: return ['tools', nom];
    }
  }

  function outil({ id, name, input }) {
    finTexte();
    const [icone, libelle] = decrireOutil(name, input);
    const item = { t: 'tool', icon: icone, label: libelle, state: 'encours' };
    conv.items.push(item);
    outils.set(id, { ligne: ligneOutil(icone, libelle, 'encours'), item });
    setOccupe(true, libelle.length > 50 ? `${libelle.slice(0, 50)}…` : libelle);
    enBas();
  }

  function outilFini({ id, isError }) {
    const o = outils.get(id);
    if (!o) return;
    o.item.state = isError ? 'echec' : 'fait';
    o.ligne.className = `claude-outil ${o.item.state}`;
    o.ligne.querySelector('.etat').className = `codicon etat codicon-${isError ? 'close' : 'check'}`;
    setOccupe(true);
  }

  // Les outils encore « en cours » à la fin d'une réponse (réponse arrêtée) : barrés.
  function arreterOutils() {
    for (const o of outils.values()) {
      if (o.item.state !== 'encours') continue;
      o.item.state = 'arrete';
      o.ligne.className = 'claude-outil arrete';
      o.ligne.querySelector('.etat').className = 'codicon etat codicon-circle-slash';
    }
    outils.clear();
  }

  // --- Évènements venant de Claude Code ---

  window.atelier.onClaude((e) => {
    switch (e.kind) {
      case 'init':
        conv.sessionId = e.sessionId;
        if (e.model) $('#claude-modele').textContent = e.model.replace(/^claude-/, '');
        break;
      case 'text': texte(e.text); break;
      case 'tool': outil(e); break;
      case 'tool-result': outilFini(e); break;
      case 'denied': avis('info', `Loki voulait utiliser ${e.toolName} : refusé (il ne peut pas modifier de fichier ni lancer de commande).`); break;
      case 'permission': carteAction(e); break;
      case 'notice': avis('info', e.message); break;
      case 'oubliee':
        avis('info', 'Claude Code ne retrouve plus cette conversation (il efface les plus anciennes) : Loki repart de ton message, sans se souvenir du début.');
        break;
      case 'result':
        finTexte();
        arreterOutils();
        if (e.sessionId) conv.sessionId = e.sessionId;
        if (e.isError && e.text) avis('erreur', e.text);
        setOccupe(false);
        enregistrer();
        break;
      case 'error':
      case 'exit':
        finTexte();
        arreterOutils();
        if (e.ollamaAbsent) {
          avis('erreur', 'L\'IA locale n\'est pas installée : Réglages d\'Atelier (Ctrl+,) › IA locale…, puis installe Ollama et un modèle.');
        } else if (e.notInstalled) {
          avis('erreur', 'Claude Code est introuvable sur ce PC. Installe-le (claude.com/claude-code), ou indique le chemin de la commande dans les réglages d\'Atelier (Ctrl+,).');
        } else if (e.kind === 'error' || (occupe && e.code)) {
          avis('erreur', `Loki s'est arrêté${e.code ? ` (code ${e.code})` : ''}. ${e.stderr || e.message || ''}`.trim());
        }
        setOccupe(false);
        enregistrer();
        break;
    }
  });

  // --- Envoyer, arrêter, recommencer ---

  async function envoyer(texteMessage = saisie.value) {
    const t = texteMessage.trim();
    if (!t || occupe) return;
    saisie.value = '';
    ajusterSaisie();
    bulleUtilisateur(t);
    conv.items.push({ t: 'user', text: t });
    conv.modifiee = Date.now();
    enregistrer();
    setOccupe(true, 'Atelier prépare tes notes, ton calendrier et tes projets…');
    try {
      await Notes.enregistrer(); // la note en cours de frappe doit être dans notes.md
      await window.atelier.claudeEnvoyer(t);
    } catch (err) {
      avis('erreur', cleanError(err));
      setOccupe(false);
    }
  }

  // Affiche une conversation (null = une nouvelle). Claude Code est arrêté : au prochain message, il
  // reprend la conversation choisie (--resume), ou en commence une nouvelle.
  async function ouvrirConv(c) {
    if (occupe) await window.atelier.claudeInterrompre();
    await window.atelier.claudeNouvelle();
    finTexte();
    arreterOutils();
    await enregistrer(); // ce qui venait d'arriver dans la conversation qu'on quitte
    conv = c || neuve();
    setOccupe(false);
    $('#claude-modele').textContent = '';
    afficherConv();
    if (conv.sessionId) await window.atelier.claudeReprendre(conv.sessionId);
    fermerListe();
    enregistrer();
    saisie.focus();
  }
  const nouvelle = () => ouvrirConv(null);

  function afficherConv() {
    if (!conv.items.length) return accueil();
    liste.replaceChildren();
    for (const item of conv.items) {
      if (item.t === 'user') bulleUtilisateur(item.text);
      else if (item.t === 'assistant') bulleClaude(item.text);
      else if (item.t === 'tool') ligneOutil(item.icon, item.label, item.state === 'encours' ? 'arrete' : item.state);
    }
    liste.scrollTop = liste.scrollHeight;
  }

  // --- Liste des conversations ---
  const panneau = $('#claude-conversations');
  const listeConv = $('#claude-conv-liste');
  const rechercheConv = $('#claude-conv-recherche');
  const btnListe = $('#btn-claude-conversations');

  // Titre : celui que tu as donné, sinon ton premier message.
  function titreConv(c) {
    if (c.titre) return c.titre;
    const premier = c.items.find((i) => i.t === 'user')?.text.replace(/\s+/g, ' ').trim() || 'Nouvelle conversation';
    return premier.length > 70 ? `${premier.slice(0, 70)}…` : premier;
  }

  function renderListe() {
    const q = rechercheConv.value.trim().toLowerCase();
    const contient = (c) => !q || titreConv(c).toLowerCase().includes(q)
      || c.items.some((i) => (i.t === 'user' || i.t === 'assistant') && i.text.toLowerCase().includes(q));
    const visibles = [...conversations].sort((a, b) => b.modifiee - a.modifiee).filter(contient);
    listeConv.replaceChildren(...visibles.map((c) => {
      const nb = c.items.filter((i) => i.t === 'user').length;
      const renommer = el('button', { className: 'icon-button', title: 'Renommer' }, el('i', { className: 'codicon codicon-edit' }));
      const supprimer = el('button', { className: 'icon-button', title: 'Supprimer cette conversation' }, el('i', { className: 'codicon codicon-trash' }));
      renommer.onclick = (e) => { e.stopPropagation(); renommerConv(c); };
      supprimer.onclick = (e) => { e.stopPropagation(); supprimerConv(c); };
      const li = el('li', { className: `claude-conv${c === conv ? ' active' : ''}`, title: titreConv(c) },
        el('div', { className: 'claude-conv-texte' },
          el('div', { className: 'claude-conv-titre', textContent: titreConv(c) }),
          el('div', { className: 'claude-conv-infos', textContent: `${dateRelative(c.modifiee)} · ${nb} message${nb > 1 ? 's' : ''}` })),
        el('div', { className: 'claude-conv-actions' }, renommer, supprimer));
      li.onclick = () => (c === conv ? fermerListe() : ouvrirConv(c));
      return li;
    }));
    if (!visibles.length) listeConv.append(el('li', { className: 'vide', textContent: q ? 'Aucune conversation ne contient ce texte.' : 'Pas encore de conversation. Écris à Loki pour en commencer une.' }));
  }

  function ouvrirListe() {
    panneau.hidden = false;
    liste.hidden = $('#claude-formulaire').hidden = true;
    btnListe.classList.add('actif');
    rechercheConv.value = '';
    renderListe();
    rechercheConv.focus();
  }
  function fermerListe() {
    if (panneau.hidden) return;
    panneau.hidden = true;
    liste.hidden = $('#claude-formulaire').hidden = false;
    btnListe.classList.remove('actif');
    saisie.focus();
  }

  async function renommerConv(c) {
    const v = await Dialogs.form({
      title: 'Renommer la conversation',
      okLabel: 'Renommer',
      fields: [
        { key: 'titre', label: 'Nom', type: 'text', value: titreConv(c) },
        { type: 'info', text: 'Laisse vide pour reprendre ton premier message comme nom.' },
      ],
    });
    if (!v) return;
    c.titre = v.titre.trim();
    await enregistrer();
    renderListe();
  }

  async function supprimerConv(c) {
    const ok = await Dialogs.ask('Supprimer la conversation', `Supprimer « ${titreConv(c)} » ? Elle disparaît de la liste et Loki ne pourra plus la reprendre.`, [
      { label: 'Annuler', value: false },
      { label: 'Supprimer', value: true, primary: true },
    ]);
    if (!ok) return;
    c.supprimee = true; // pour qu'elle ne revienne pas dans la liste en la quittant
    conversations = conversations.filter((x) => x !== c);
    if (c === conv) {
      await ouvrirConv(null);
      ouvrirListe(); // on reste dans la liste
    } else {
      await enregistrer();
      renderListe();
    }
  }

  btnListe.onclick = () => (panneau.hidden ? ouvrirListe() : fermerListe());
  rechercheConv.addEventListener('input', renderListe);
  rechercheConv.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); fermerListe(); }
    if (e.key === 'Enter') listeConv.querySelector('.claude-conv')?.click();
  });

  function ajusterSaisie() {
    saisie.style.height = 'auto';
    saisie.style.height = `${Math.min(saisie.scrollHeight, 160)}px`;
  }

  saisie.addEventListener('input', ajusterSaisie);
  saisie.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }
    if (e.key === 'Escape' && occupe) { e.preventDefault(); window.atelier.claudeInterrompre(); }
    if (e.key.toLowerCase() === 'h' && e.ctrlKey && !e.altKey && !e.shiftKey) { e.preventDefault(); ouvrirListe(); }
  });
  btnEnvoyer.onclick = () => (occupe ? window.atelier.claudeInterrompre() : envoyer());
  $('#btn-claude-nouvelle').onclick = nouvelle;
  $('#btn-claude-dossier').onclick = () => window.atelier.claudeOuvrirDossier().catch((err) => notify(cleanError(err), 'error'));

  // Au démarrage : on réaffiche la dernière conversation, et Claude la reprendra au prochain message.
  async function start() {
    let garde = await window.atelier.lireDonnees('claude-conversations', null);
    if (!garde) {
      // Avant la liste (Atelier 0.5 et plus ancien), une seule conversation dans claude.json : elle
      // devient la première de la liste.
      const ancienne = await window.atelier.lireDonnees('claude', null);
      garde = { conversations: [] };
      if (ancienne && Array.isArray(ancienne.items) && ancienne.items.length) {
        const c = { ...neuve(), sessionId: ancienne.sessionId || null, items: ancienne.items };
        garde = { courante: c.id, conversations: [c] };
      }
    }
    conversations = (Array.isArray(garde.conversations) ? garde.conversations : [])
      .filter((c) => c && typeof c.id === 'string' && Array.isArray(c.items));
    conv = conversations.find((c) => c.id === garde.courante) || neuve();
    afficherConv();
    if (conv.sessionId) await window.atelier.claudeReprendre(conv.sessionId);
    if (conversations.length) enregistrer(); // l'ancienne conversation est maintenant dans la liste
  }

  return { start };
})();

// --- Petit moteur Markdown (le même que dans le panneau Claude de Rune) ---
// Juste ce que Claude utilise : titres, gras, italique, code, listes, citations, liens.
// Tout le texte est échappé d'abord : aucun HTML venant de la réponse n'est interprété.

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    // Les liens ne sont pas cliquables : on montre l'adresse au survol.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<span class="link" title="$2">$1</span>');
}

function renderMarkdown(source) {
  const lines = source.split('\n');
  const out = [];
  let i = 0;
  let listType = null;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*```(\w*)/.exec(line);
    if (fence) {
      closeList();
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++; // fermeture ``` (absente si le texte arrive encore)
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)/.exec(line);
    if (heading) {
      closeList();
      out.push(`<h${heading[1].length + 2}>${renderInline(heading[2])}</h${heading[1].length + 2}>`);
    } else if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (listType !== type) { closeList(); out.push(`<${type}>`); listType = type; }
      out.push(`<li>${renderInline((bullet || numbered)[1])}</li>`);
    } else if (/^>\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ''))}</blockquote>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      // Lignes qui se suivent = un même paragraphe.
      const para = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*(```|#{1,4}\s|[-*]\s|\d+[.)]\s|>)/.test(lines[i + 1])) para.push(lines[++i]);
      out.push(`<p>${para.map(renderInline).join('<br>')}</p>`);
    }
    i++;
  }
  closeList();
  return out.join('');
}
