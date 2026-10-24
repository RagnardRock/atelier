// L'interface d'Edda : les documents ouverts (un onglet chacun), ouvrir et enregistrer, le ruban,
// les menus, le clic droit, la barre d'état, le zoom, les réglages et la mise en page.
//
// Un document : { id, nom, chemin (null tant qu'il n'est pas enregistré), format ('docx', 'odt'…),
//   dossierUrl (file:// de son dossier, pour les médias aux chemins relatifs), page (l'élément où l'on
//   écrit), miseEnPage, police, taille, encodage (d'un .txt), modifie, dateFichier }.
// Chaque document garde sa propre page dans la fenêtre (cachée quand on change d'onglet) : son
// historique d'annulation (Ctrl+Z) reste intact quand on passe d'un document à l'autre.

const App = (() => {
  let config = null;
  let configPath = '';
  const docs = [];
  let actif = null;
  let numeroNouveau = 0;
  let dossierProjet = null; // dossier passé par Atelier : l'accueil liste ses documents

  const pages = $('#pages');
  const zone = $('#zone');
  const defilement = $('#defilement');

  // ======================================================================
  // Thème, réglages
  // ======================================================================
  const ACCENTS = ['#7cc4ff', '#b18cff', '#ff7aa8', '#ff7a3d', '#e0a526', '#4ade80', '#f5f5f5'];
  const POLICES = ['Aptos', 'Arial', 'Book Antiqua', 'Calibri', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
    'Courier New', 'Franklin Gothic Medium', 'Garamond', 'Georgia', 'Lucida Sans', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];

  async function applyTheme(c) {
    document.documentElement.style.setProperty('--accent', c.accentColor);
    document.body.classList.toggle('glass', Boolean(c.glass));
    for (const d of docs) d.page.classList.toggle('sombre', c.page === 'sombre');
    appliquerZoom();
    const { blur, needsRestart } = await window.edda.setWindowTheme({ glass: c.glass, blur: c.windowBlur });
    document.body.classList.toggle('window-blur', blur);
    return needsRestart;
  }

  async function ouvrirReglages() {
    const blurOk = await window.edda.blurSupported();
    const version = await window.edda.version();
    const swatches = el('div', { className: 'accent-swatches' });
    // Ce que Claude fait sans demander, pour de bon (les familles d'actions, voir ../commun/claude.js).
    const familles = ((await window.claude.autorisations?.().catch(() => [])) || []).filter((f) => f.gardable);
    const v = await Dialogs.form({
      title: 'Réglages d\'Edda',
      okLabel: 'Enregistrer',
      width: 500,
      fields: [
        { key: 'accentColor', label: 'Couleur d\'accent', type: 'color', value: config.accentColor },
        { type: 'element', element: swatches },
        { key: 'glass', label: 'Verre dépoli (glassmorphism)', type: 'checkbox', value: config.glass },
        { key: 'windowBlur', label: blurOk ? 'Flou de Windows 11 derrière la fenêtre' : 'Flou de Windows 11 (non disponible ici)', type: 'checkbox', value: config.windowBlur },
        { key: 'page', label: 'Page', type: 'select', value: config.page, choices: [['claire', 'Blanche, comme sur papier'], ['sombre', 'Sombre (pour écrire le soir)']] },
        { key: 'police', label: 'Police des nouveaux documents', type: 'text', value: config.police, list: 'liste-polices' },
        { key: 'taille', label: 'Taille (points)', type: 'number', value: config.taille, min: 6, max: 72, step: 0.5 },
        { key: 'formatParDefaut', label: 'Enregistrer en', type: 'select', value: config.formatParDefaut, choices: Object.values(Formats.liste).map((f) => [f.id, `${f.nom} (.${f.extensions[0]})`]) },
        { key: 'orthographe', label: 'Souligner les fautes d\'orthographe', type: 'checkbox', value: config.orthographe !== false },
        { key: 'languesOrthographe', label: 'Langue', type: 'select', value: config.languesOrthographe || 'fr', choices: [['fr', 'Français'], ['fr+en', 'Français et anglais'], ['en', 'Anglais']] },
        { key: 'claudeModel', label: 'Modèle de Loki (propulsé par Claude)', type: 'select', value: config.claudeModel || '', choices: [['', 'Par défaut (celui de Claude Code)'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']] },
        { key: 'claudeCommand', label: 'Commande Claude Code', type: 'text', value: config.claudeCommand || 'claude' },
        { key: 'claudeCommandes', label: 'Loki peut lancer des commandes (PowerShell, Python…) : plus lent, rarement utile', type: 'checkbox', value: Boolean(config.claudeCommandes) },
        ...(familles.length ? [
          { type: 'info', text: 'Loki fait sans me demander la permission, pour de bon :' },
          ...familles.map((f) => ({ key: `sansDemander-${f.id}`, label: f.libelle, type: 'checkbox', value: f.toujours })),
          { type: 'info', text: 'Lire le document ne demande jamais. Ce qui est permis seulement pour la conversation en cours se voit et se retire avec le bouclier, en haut du panneau Loki.' },
        ] : []),
        { type: 'info', text: `La police et la taille servent aux nouveaux documents ; un document ouvert garde les siennes (Format › Mise en page).\n\nEdda ${version}. Réglages enregistrés dans ${configPath}.` },
      ],
      onInput(values, f) {
        if (!swatches.childElementCount) {
          for (const c of ACCENTS) swatches.append(el('button', { type: 'button', className: 'mini-swatch', style: `background:${c}`, onclick: () => f.setValue('accentColor', c) }));
        }
        // Aperçu immédiat de la couleur, du verre et de la page.
        document.documentElement.style.setProperty('--accent', values.accentColor);
        document.body.classList.toggle('glass', values.glass);
        for (const d of docs) d.page.classList.toggle('sombre', values.page === 'sombre');
      },
    });
    if (!v) return applyTheme(config);
    if (familles.length) {
      v.claudeSansDemander = {};
      for (const f of familles) { if (v[`sansDemander-${f.id}`]) v.claudeSansDemander[f.id] = true; delete v[`sansDemander-${f.id}`]; }
    }
    v.police = String(v.police || '').trim() || 'Calibri';
    v.taille = Math.min(72, Math.max(6, Number(v.taille) || 11));
    config = await window.edda.writeConfig(v);
    if (await applyTheme(config)) notify('Le flou de Windows 11 sera actif au prochain démarrage d\'Edda.', 'info', 6000);
  }

  // ======================================================================
  // Documents et onglets
  // ======================================================================
  const nouvelId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  function creerDocument({ nom, chemin = null, format = null, html = '', miseEnPage, police, taille, dossierUrl = null, encodage = null, dateFichier = null }) {
    const d = {
      id: nouvelId(), nom, chemin, format, dossierUrl, encodage, dateFichier, modifie: false,
      miseEnPage: miseEnPage ? structuredClone(miseEnPage) : structuredClone(Formats.MISE_EN_PAGE),
      police: police || config.police, taille: taille || config.taille,
    };
    const page = Editeur.creerPage(d);
    page.classList.toggle('sombre', config.page === 'sombre');
    page.innerHTML = html && html.trim() ? html : '<p><br></p>';
    page.hidden = true;
    pages.append(page);
    Editeur.verifierVide(page);
    docs.push(d);
    appliquerZoom();
    return d;
  }

  function nouveau() {
    numeroNouveau++;
    const d = creerDocument({ nom: `Document ${numeroNouveau}` });
    activer(d);
    setTimeout(() => d.page.focus(), 30);
    return d;
  }

  function activer(d) {
    if (actif === d) return;
    MediasPage.deselectionner();
    if (Recherche.estOuverte()) Recherche.fermer();
    for (const x of docs) x.page.hidden = x !== d;
    actif = d;
    Editeur.activer(d);
    afficher();
    rendreOnglets();
    majStatut();
    majTitre();
  }

  // Accueil (aucun document) ou zone de travail.
  function afficher() {
    const vide = !docs.length;
    $('#accueil').hidden = !vide;
    zone.hidden = vide;
    document.body.classList.toggle('sans-document', vide);
    if (vide) { actif = null; Editeur.activer(null); rendreAccueil(); majTitre(); majStatut(); }
  }

  function rendreOnglets() {
    const barre = $('#onglets');
    barre.innerHTML = '';
    for (const d of docs) {
      const o = el('div', { className: `onglet${d === actif ? ' actif' : ''}${d.modifie ? ' modifie' : ''}`, title: d.chemin || `${d.nom} (pas encore enregistré)` });
      o.append(el('i', { className: 'codicon codicon-file' }), el('span', { className: 'nom', textContent: d.nom }));
      if (d.format) o.append(el('span', { className: 'format', textContent: d.format }));
      const fermerBouton = el('span', { className: 'fermer', title: 'Fermer (Ctrl+W)' }, el('i', { className: 'codicon codicon-close' }));
      fermerBouton.onclick = (e) => { e.stopPropagation(); fermerDocument(d); };
      o.append(fermerBouton);
      o.onclick = () => activer(d);
      o.onauxclick = (e) => { if (e.button === 1) fermerDocument(d); };
      barre.append(o);
      if (d === actif) requestAnimationFrame(() => o.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }
  }

  function majTitre() {
    const t = $('#titre-document');
    if (!actif) { t.textContent = ''; window.edda.titre('Edda'); return; }
    t.innerHTML = '';
    t.append(el('b', { textContent: actif.nom }), actif.chemin ? ` — ${actif.chemin.replace(/[\\/][^\\/]*$/, '')}` : ' — pas encore enregistré');
    window.edda.titre(`${actif.nom}${actif.modifie ? ' •' : ''} — Edda`);
  }

  // Un document modifié : l'onglet a un point, et la fenêtre demandera avant de se fermer.
  let signalTimer = 0;
  Editeur.surChangement((d) => {
    if (!d.modifie) {
      d.modifie = true;
      rendreOnglets();
      majTitre();
    }
    clearTimeout(signalTimer);
    signalTimer = setTimeout(() => window.edda.signalerModifies(docs.filter((x) => x.modifie).length), 200);
    majStatutBientot();
  });
  const signaler = () => window.edda.signalerModifies(docs.filter((x) => x.modifie).length);

  // ======================================================================
  // Ouvrir
  // ======================================================================
  async function ouvrir() {
    const chemins = await window.edda.choisirDocuments();
    for (const c of chemins) await ouvrirChemin(c);
  }

  async function ouvrirChemin(chemin) {
    const deja = docs.find((d) => d.chemin && d.chemin.toLowerCase() === String(chemin).toLowerCase());
    if (deja) { activer(deja); return deja; }
    let info;
    try {
      info = await window.edda.lireDocument(chemin);
    } catch (err) {
      notify(cleanError(err), 'error');
      return null;
    }
    return ouvrirOctets(info, new Uint8Array(info.bytes));
  }

  async function ouvrirOctets(info, bytes) {
    const ext = extension(info.nom);
    const format = Formats.deExtension(ext);
    if (!format) { notify(`Edda ne sait pas ouvrir les fichiers .${ext}`, 'error'); return null; }
    let r;
    try {
      r = await format.lire(bytes, { racine: info.dossierUrl });
    } catch (err) {
      notify(`${info.nom} n'a pas pu être ouvert : ${cleanError(err)}`, 'error');
      return null;
    }
    const html = Nettoyage.html(r.html, { racine: info.dossierUrl });
    // Un document neuf et vide, pas touché (celui du démarrage) : on le remplace (comme Word).
    const vide = docs.length === 1 && !docs[0].chemin && !docs[0].modifie && !docs[0].page.textContent.trim() ? docs[0] : null;
    const d = creerDocument({
      nom: info.nom, chemin: info.chemin, format: format.id, html, dossierUrl: info.dossierUrl,
      miseEnPage: r.miseEnPage, police: r.police, taille: r.taille, encodage: r.encodage || null, dateFichier: info.modifie,
    });
    if (vide) retirer(vide);
    activer(d);
    defilement.scrollTop = 0;
    if (r.alertes?.length) {
      notify(`${info.nom} est ouvert, avec quelques simplifications :`, 'warning', 12000, [{ label: 'Voir le détail', run: () => montrerAlertes(info.nom, r.alertes, 'à l\'ouverture') }]);
    }
    return d;
  }

  function montrerAlertes(nom, alertes, quand) {
    const liste = el('ul', { className: 'alertes-liste' });
    for (const a of alertes) liste.append(el('li', { textContent: a }));
    Dialogs.form({ title: `${nom} ${quand}`, okLabel: 'Compris', cancelLabel: '', fields: [{ type: 'element', element: liste }], width: 520 });
  }

  // ======================================================================
  // Enregistrer
  // ======================================================================
  // Le contexte donné aux formats pour écrire (voir formats/commun.js).
  function contexteEcriture(d, chemin) {
    const base = nomFichier(chemin).replace(/\.[^.]+$/, '');
    return {
      page: d.page,
      miseEnPage: d.miseEnPage,
      police: d.police,
      taille: d.taille,
      titre: base,
      encodage: d.encodage,
      dossierMedias: `${base}-medias`,
      ranger: (src) => window.edda.rangerMedia(chemin, src),
    };
  }

  // vers : un chemin déjà choisi (Claude, enregistrer_sous) ; sinon la fenêtre « Enregistrer sous ».
  async function enregistrer(d = actif, { sous = false, vers = null } = {}) {
    if (!d) return false;
    let chemin = vers || d.chemin;
    // Un format qui n'est pas dans la liste (un .docm, .ott…) s'enregistre sous un autre nom.
    const formatActuel = d.chemin ? Formats.deExtension(extension(d.chemin)) : null;
    if (!vers && (!chemin || sous || !formatActuel || ['docm', 'dotx', 'ott'].includes(extension(d.chemin)))) {
      chemin = await window.edda.choisirDestination({ nom: d.nom, format: d.format && ['docm', 'dotx', 'ott'].indexOf(d.format) < 0 ? d.format : config.formatParDefaut, dossier: d.chemin ? d.chemin.replace(/[\\/][^\\/]*$/, '') : null });
      if (!chemin) return false;
    }
    const format = Formats.deExtension(extension(chemin));
    if (!format) { notify(`Edda ne sait pas écrire les fichiers .${extension(chemin)}`, 'error'); return false; }
    // Le fichier a-t-il été changé ailleurs depuis qu'on l'a ouvert ?
    if (chemin === d.chemin && d.dateFichier) {
      const date = await window.edda.dateModif(chemin);
      if (date && Math.abs(date - d.dateFichier) > 1000) {
        const choix = await Dialogs.ask('Fichier modifié ailleurs', `${d.nom} a été modifié par un autre logiciel depuis son ouverture dans Edda.\n\nL'écraser avec la version d'Edda ?`, [
          { label: 'Annuler', value: false },
          { label: 'Écraser', value: true, primary: true },
        ]);
        if (!choix) return false;
      }
    }
    MediasPage.deselectionner();
    $('#status-enregistre').textContent = 'Enregistrement…';
    let r;
    try {
      r = await format.ecrire(contexteEcriture(d, chemin));
      const info = await window.edda.ecrireDocument(chemin, r.bytes);
      Object.assign(d, { chemin: info.chemin, nom: info.nom, format: format.id, dossierUrl: info.dossierUrl, dateFichier: info.modifie, modifie: false });
    } catch (err) {
      $('#status-enregistre').textContent = '';
      notify(`L'enregistrement a échoué : ${cleanError(err)}`, 'error');
      return false;
    }
    signaler();
    rendreOnglets();
    majTitre();
    majStatut();
    $('#status-enregistre').textContent = `Enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    // Ce que le format ne garde pas : prévenu une fois par document et par format.
    d.alertesVues = d.alertesVues || new Set();
    const nouvelles = (r.alertes || []).filter((a) => !d.alertesVues.has(a));
    for (const a of nouvelles) d.alertesVues.add(a);
    if (nouvelles.length) notify(nouvelles.length === 1 ? nouvelles[0] : `${d.nom} est enregistré. À savoir :`, 'warning', 12000, nouvelles.length > 1 ? [{ label: 'Voir le détail', run: () => montrerAlertes(d.nom, nouvelles, 'enregistré') }] : []);
    else notify(`${d.nom} est enregistré.`, 'success', 2000);
    return true;
  }

  // ======================================================================
  // Fermer
  // ======================================================================
  function retirer(d) {
    const i = docs.indexOf(d);
    if (i < 0) return;
    docs.splice(i, 1);
    d.page.remove();
    if (actif === d) { actif = null; if (docs.length) activer(docs[Math.min(i, docs.length - 1)]); }
    signaler();
    rendreOnglets();
    afficher();
  }

  // Fermer un document : s'il n'est pas enregistré, on demande. Renvoie false si on a annulé.
  async function fermerDocument(d = actif) {
    if (!d) return true;
    if (d.modifie) {
      activer(d);
      const choix = await Dialogs.ask('Enregistrer ?', `${d.nom} a des modifications pas encore enregistrées.`, [
        { label: 'Ne pas enregistrer', value: 'non' },
        { label: 'Annuler', value: null },
        { label: 'Enregistrer', value: 'oui', primary: true },
      ]);
      if (!choix) return false;
      if (choix === 'oui' && !(await enregistrer(d))) return false;
    }
    retirer(d);
    return true;
  }

  // La fenêtre se ferme : on demande pour chaque document pas enregistré.
  window.edda.onFermerDemande(async () => {
    for (const d of [...docs]) {
      if (!d.modifie) continue;
      if (!(await fermerDocument(d))) return;
    }
    window.edda.fermer();
  });

  // ======================================================================
  // PDF et impression
  // ======================================================================
  // Le document tout seul, en HTML, avec ses médias à leur adresse complète.
  function htmlImpression(d) {
    const copie = d.page.cloneNode(true);
    for (const m of copie.querySelectorAll('[contenteditable]')) m.removeAttribute('contenteditable');
    for (const m of copie.querySelectorAll('.choisi')) m.classList.remove('choisi');
    // Une vidéo n'a pas d'image fixe à imprimer : on montre son nom.
    for (const v of copie.querySelectorAll('video, audio')) v.replaceWith(Object.assign(document.createElement('span'), { textContent: `[${v.tagName === 'VIDEO' ? 'Vidéo' : 'Son'} : ${Medias.nom(v)}]` }));
    return Formats.documentHtml({ titre: d.nom.replace(/\.[^.]+$/, ''), miseEnPage: d.miseEnPage, police: d.police, taille: d.taille }, copie.innerHTML, { ecran: false });
  }
  async function exporterPdf(d = actif) {
    if (!d) return;
    try {
      const chemin = await window.edda.exporterPdf({ html: htmlImpression(d), nom: d.nom, dossier: d.chemin ? d.chemin.replace(/[\\/][^\\/]*$/, '') : null, format: d.miseEnPage.format });
      if (chemin) notify(`PDF créé : ${nomFichier(chemin)}`, 'success', 8000, [{ label: 'Ouvrir', run: () => window.edda.ouvrirPdf(chemin) }]);
    } catch (err) {
      notify(`PDF impossible : ${cleanError(err)}`, 'error');
    }
  }
  async function imprimer(d = actif) {
    if (!d) return;
    try {
      await window.edda.imprimer({ html: htmlImpression(d) });
    } catch (err) {
      notify(cleanError(err), 'error');
    }
  }

  // ======================================================================
  // Mise en page
  // ======================================================================
  // Les marges correspondent-elles à un des choix tout faits ?
  function margesType(m) {
    const egal = (a, b) => Math.abs(a - b) < 0.02;
    if ([m.haut, m.bas, m.gauche, m.droite].every((x) => egal(x, 2.5))) return 'normales';
    if ([m.haut, m.bas, m.gauche, m.droite].every((x) => egal(x, 1.27))) return 'etroites';
    if (egal(m.haut, 2.54) && egal(m.bas, 2.54) && egal(m.gauche, 5.08) && egal(m.droite, 5.08)) return 'larges';
    return 'perso';
  }
  async function ouvrirMiseEnPage(d = actif) {
    if (!d) return;
    const mp = d.miseEnPage;
    const apercu = el('div', { className: 'mise-en-page-apercu' });
    const papier = el('div', { className: 'papier' });
    const texte = el('div', { className: 'texte' });
    papier.append(texte);
    apercu.append(papier);
    const dessiner = (v) => {
      const { largeur, hauteur } = Formats.dimensions({ format: v.format, orientation: v.orientation });
      const k = 150 / Math.max(largeur, hauteur);
      papier.style.width = `${largeur * k}px`;
      papier.style.height = `${hauteur * k}px`;
      Object.assign(texte.style, { left: `${v.gauche * k}px`, right: `${v.droite * k}px`, top: `${v.haut * k}px`, bottom: `${v.bas * k}px` });
    };
    let typeChoisi = margesType(mp.marges);
    let occupe = false;
    const v = await Dialogs.form({
      title: `Mise en page de ${d.nom}`,
      okLabel: 'Appliquer',
      width: 460,
      fields: [
        { type: 'element', element: apercu },
        { key: 'format', label: 'Papier', type: 'select', value: mp.format, choices: Object.entries(Formats.PAPIERS).map(([id, p]) => [id, `${p.nom} (${p.largeur} × ${p.hauteur} cm)`]) },
        { key: 'orientation', label: 'Orientation', type: 'select', value: mp.orientation, choices: [['portrait', 'Portrait (en hauteur)'], ['paysage', 'Paysage (en largeur)']] },
        { key: 'marges', label: 'Marges', type: 'select', value: margesType(mp.marges), choices: [['perso', 'Personnalisées (ci-dessous)'], ['normales', 'Normales (2,5 cm)'], ['etroites', 'Étroites (1,27 cm)'], ['larges', 'Larges (2,54 / 5,08 cm)']] },
        { key: 'haut', label: 'Marge du haut', type: 'number', value: mp.marges.haut, min: 0, max: 10, step: 0.1, unit: 'cm' },
        { key: 'bas', label: 'Marge du bas', type: 'number', value: mp.marges.bas, min: 0, max: 10, step: 0.1, unit: 'cm' },
        { key: 'gauche', label: 'Marge de gauche', type: 'number', value: mp.marges.gauche, min: 0, max: 10, step: 0.1, unit: 'cm' },
        { key: 'droite', label: 'Marge de droite', type: 'number', value: mp.marges.droite, min: 0, max: 10, step: 0.1, unit: 'cm' },
        { key: 'police', label: 'Police du document', type: 'text', value: d.police, list: 'liste-polices' },
        { key: 'taille', label: 'Taille du texte', type: 'number', value: d.taille, min: 6, max: 72, step: 0.5, unit: 'pt' },
        { key: 'parDefaut', label: 'Utiliser aussi pour les nouveaux documents', type: 'checkbox', value: false },
      ],
      onInput(values, f) {
        if (occupe) return; // setValue relance onInput : on l'ignore pendant qu'on remplit
        occupe = true;
        const presets = { normales: [2.5, 2.5, 2.5, 2.5], etroites: [1.27, 1.27, 1.27, 1.27], larges: [2.54, 2.54, 5.08, 5.08] };
        if (values.marges !== typeChoisi && presets[values.marges]) {
          // Un choix tout fait : il remplit les quatre marges.
          const [h, b, g, dr] = presets[values.marges];
          f.setValue('haut', h); f.setValue('bas', b); f.setValue('gauche', g); f.setValue('droite', dr);
        } else {
          // Une marge changée à la main : le choix suit (« Personnalisées » si rien ne correspond).
          f.setValue('marges', margesType({ haut: Number(values.haut), bas: Number(values.bas), gauche: Number(values.gauche), droite: Number(values.droite) }));
        }
        typeChoisi = f.values().marges;
        occupe = false;
        dessiner(f.values());
      },
    });
    if (!v) return;
    const cm = (x) => Math.min(10, Math.max(0, Number(x) || 0));
    d.miseEnPage = { format: v.format, orientation: v.orientation, marges: { haut: cm(v.haut), bas: cm(v.bas), gauche: cm(v.gauche), droite: cm(v.droite) } };
    d.police = String(v.police || '').trim() || d.police;
    d.taille = Math.min(72, Math.max(6, Number(v.taille) || d.taille));
    Editeur.appliquerMiseEnPage(d);
    if (v.parDefaut) config = await window.edda.writeConfig({ police: d.police, taille: d.taille });
    // La mise en page fait partie du document : il faudra l'enregistrer.
    if (!d.modifie) { d.modifie = true; signaler(); rendreOnglets(); majTitre(); }
    majStatut();
  }

  // ======================================================================
  // Barre d'état et zoom
  // ======================================================================
  let statutTimer = 0;
  const majStatutBientot = () => { clearTimeout(statutTimer); statutTimer = setTimeout(majStatut, 300); };
  function majStatut() {
    if (!actif) { $('#status-pages').textContent = ''; $('#status-mots').textContent = ''; $('#status-format').textContent = ''; return; }
    const texte = actif.page.innerText || '';
    const mots = (texte.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
    const caracteres = texte.replace(/\n/g, '').length;
    const z = config.zoom / 100;
    const hauteurPage = Unites.cmEnPx(Formats.dimensions(actif.miseEnPage).hauteur);
    const nPages = Math.max(1, Math.ceil((actif.page.getBoundingClientRect().height / z - 2) / hauteurPage) + actif.page.querySelectorAll('hr.saut-page').length);
    $('#status-pages').textContent = `${nPages} page${nPages > 1 ? 's' : ''} (environ)`;
    $('#status-mots').textContent = `${mots.toLocaleString('fr-FR')} mot${mots > 1 ? 's' : ''} · ${caracteres.toLocaleString('fr-FR')} caractères`;
    const f = actif.format ? Formats.liste[actif.format] : null;
    $('#status-format').textContent = f ? `${f.nom}${actif.encodage && actif.format === 'txt' ? ` · ${actif.encodage.replace('-bom', ' (BOM)').toUpperCase()}` : ''}` : 'Pas encore enregistré';
    const enr = $('#status-enregistre');
    enr.classList.toggle('pas-enregistre', actif.modifie);
    if (actif.modifie) enr.textContent = 'Modifications non enregistrées';
    else if (enr.textContent === 'Modifications non enregistrées') enr.textContent = '';
  }

  function appliquerZoom() {
    const z = (config?.zoom || 100) / 100;
    for (const d of docs) d.page.style.zoom = String(z);
    $('#zoom').value = config?.zoom || 100;
    $('#zoom-valeur').textContent = `${config?.zoom || 100} %`;
  }
  let zoomTimer = 0;
  function zoomer(valeur) {
    config.zoom = Math.max(50, Math.min(200, Math.round(valeur / 10) * 10));
    appliquerZoom();
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => window.edda.writeConfig({ zoom: config.zoom }), 500);
  }
  // Zoom pour que la page tienne en largeur.
  function zoomLargeur() {
    if (!actif) return;
    const largeur = Unites.cmEnPx(Formats.dimensions(actif.miseEnPage).largeur);
    zoomer(Math.floor(((defilement.clientWidth - 60) / largeur) * 10) * 10);
  }
  $('#zoom').oninput = (e) => zoomer(Number(e.target.value));
  $('#zoom-plus').onclick = () => zoomer(config.zoom + 10);
  $('#zoom-moins').onclick = () => zoomer(config.zoom - 10);
  defilement.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomer(config.zoom + (e.deltaY < 0 ? 10 : -10));
  }, { passive: false });

  // ======================================================================
  // Ruban
  // ======================================================================
  const choixStyle = $('#choix-style');
  const choixPolice = $('#choix-police');
  const choixTaille = $('#choix-taille');
  for (const p of POLICES) $('#liste-polices').append(el('option', { value: p }));
  for (const t of Editeur.TAILLES) $('#liste-tailles').append(el('option', { value: String(t).replace('.', ',') }));
  let couleurTexte = 'e03c3c';
  let couleurSurligner = 'ffff00';
  $('#trait-couleur').style.background = `#${couleurTexte}`;
  $('#trait-surligner').style.background = `#${couleurSurligner}`;

  const actionsRuban = {
    couleur: () => Editeur.commandes.couleur(couleurTexte),
    surligner: () => Editeur.commandes.surligner(couleurSurligner),
    lien: () => Editeur.lien(),
    image: () => MediasPage.choisirEtInserer('image'),
    video: () => MediasPage.choisirEtInserer('video'),
    son: () => MediasPage.choisirEtInserer('audio'),
    tableau: (bouton) => menuTableau(bouton),
    miseEnPage: () => ouvrirMiseEnPage(),
  };
  for (const b of $$('#ruban [data-cmd]')) {
    // mousedown + preventDefault : la sélection dans la page reste en place.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      const cmd = b.dataset.cmd;
      if (actionsRuban[cmd]) actionsRuban[cmd](b);
      else Editeur.commandes[cmd]?.();
    });
  }
  for (const b of $$('#ruban [data-menu-couleur]')) {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.onclick = () => {
      const quoi = b.dataset.menuCouleur;
      Menus.palette(b, quoi === 'couleur'
        ? { titre: 'Couleur du texte', aucune: 'Automatique', choisir: (c) => { if (c) { couleurTexte = c; $('#trait-couleur').style.background = `#${c}`; } Editeur.commandes.couleur(c); } }
        : { titre: 'Surligner', aucune: 'Aucun surlignage', choisir: (c) => { if (c) { couleurSurligner = c; $('#trait-surligner').style.background = `#${c}`; } Editeur.commandes.surligner(c); } });
    };
  }
  choixStyle.onchange = () => Editeur.commandes.style(choixStyle.value);
  const validerPolice = () => { if (choixPolice.value.trim()) Editeur.commandes.police(choixPolice.value.trim()); };
  choixPolice.addEventListener('change', validerPolice);
  choixPolice.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); validerPolice(); Editeur.restaurer(); } });
  const validerTaille = () => Editeur.commandes.taille(choixTaille.value);
  choixTaille.addEventListener('change', validerTaille);
  choixTaille.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); validerTaille(); Editeur.restaurer(); } });
  for (const c of [choixPolice, choixTaille, choixStyle]) c.addEventListener('focus', () => Editeur.memoriser());

  // Les boutons du ruban suivent le curseur : gras allumé dans du gras, etc.
  Editeur.surSelection((e) => {
    for (const b of $$('#ruban [data-etat]')) b.classList.toggle('actif', Boolean(e[b.dataset.etat]));
    if (document.activeElement !== choixStyle) choixStyle.value = e.style || 'p';
    if (document.activeElement !== choixPolice) choixPolice.value = e.police || actif?.police || '';
    if (document.activeElement !== choixTaille) choixTaille.value = String(e.taille || actif?.taille || '').replace('.', ',');
  });

  // Insérer un tableau : une grille à survoler (comme dans Word), ou une taille précise.
  function menuTableau(bouton) {
    const grille = el('div', { className: 'tableau-grille' });
    const taille = el('div', { className: 'tableau-taille', textContent: 'Tableau' });
    const cases = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 10; c++) {
        const s = el('span');
        s.onmouseenter = () => {
          for (const x of cases) x.s.classList.toggle('on', x.r <= r && x.c <= c);
          taille.textContent = `${c + 1} × ${r + 1}`;
        };
        s.onmousedown = (e) => e.preventDefault();
        s.onclick = () => { Menus.fermer(); Editeur.insererTableau(r + 1, c + 1); };
        cases.push({ s, r, c });
        grille.append(s);
      }
    }
    Menus.sous(bouton, [{ element: grille }, { element: taille }, null, { label: 'Autre taille…', icone: 'table', run: tableauSurMesure }]);
  }
  async function tableauSurMesure() {
    const v = await Dialogs.form({ title: 'Insérer un tableau', okLabel: 'Insérer', fields: [
      { key: 'colonnes', label: 'Colonnes', type: 'number', value: 3, min: 1, max: 30 },
      { key: 'lignes', label: 'Lignes', type: 'number', value: 3, min: 1, max: 200 },
    ] });
    if (v) Editeur.insererTableau(Math.min(200, Math.max(1, v.lignes)), Math.min(30, Math.max(1, v.colonnes)));
  }

  // ======================================================================
  // Menus de la barre de titre
  // ======================================================================
  const ctrl = 'Ctrl+';
  const menus = {
    fichier: async () => {
      const recents = (await window.edda.recents()).filter((c) => !docs.some((d) => d.chemin === c)).slice(0, 8);
      return [
        { label: 'Nouveau document', keys: `${ctrl}N`, icone: 'new-file', run: nouveau },
        { label: 'Ouvrir…', keys: `${ctrl}O`, icone: 'folder-opened', run: ouvrir },
        ...(recents.length ? [null, 'Récents', ...recents.map((c) => ({ label: nomFichier(c), icone: 'file', run: () => ouvrirChemin(c) }))] : []),
        null,
        { label: 'Enregistrer', keys: `${ctrl}S`, icone: 'save', run: () => enregistrer(), desactive: !actif },
        { label: 'Enregistrer sous…', keys: `${ctrl}Maj+S`, icone: 'save-as', run: () => enregistrer(actif, { sous: true }), desactive: !actif },
        { label: 'Exporter en PDF…', icone: 'file-pdf', run: () => exporterPdf(), desactive: !actif },
        { label: 'Imprimer…', keys: `${ctrl}P`, icone: 'preview', run: () => imprimer(), desactive: !actif },
        null,
        { label: 'Afficher dans l\'Explorateur', icone: 'go-to-file', run: () => window.edda.montrer(actif.chemin), desactive: !actif?.chemin },
        { label: 'Fermer le document', keys: `${ctrl}W`, icone: 'close', run: () => fermerDocument(), desactive: !actif },
        null,
        { label: 'Réglages', keys: `${ctrl},`, icone: 'gear', run: ouvrirReglages },
      ];
    },
    edition: () => [
      { label: 'Annuler', keys: `${ctrl}Z`, icone: 'discard', run: Editeur.commandes.undo },
      { label: 'Rétablir', keys: `${ctrl}Y`, icone: 'redo', run: Editeur.commandes.redo },
      null,
      { label: 'Couper', keys: `${ctrl}X`, run: () => editionNative('cut') },
      { label: 'Copier', keys: `${ctrl}C`, icone: 'copy', run: () => editionNative('copy') },
      { label: 'Coller', keys: `${ctrl}V`, icone: 'clippy', run: () => editionNative('paste') },
      { label: 'Coller sans mise en forme', keys: `${ctrl}Maj+V`, run: () => editionNative('pasteAndMatchStyle') },
      { label: 'Tout sélectionner', keys: `${ctrl}A`, run: () => editionNative('selectAll') },
      null,
      { label: 'Rechercher', keys: `${ctrl}F`, icone: 'search', run: () => Recherche.ouvrir(false) },
      { label: 'Remplacer', keys: `${ctrl}H`, icone: 'replace', run: () => Recherche.ouvrir(true) },
    ],
    insertion: () => [
      { label: 'Image…', icone: 'file-media', run: () => MediasPage.choisirEtInserer('image') },
      { label: 'Vidéo…', icone: 'device-camera-video', run: () => MediasPage.choisirEtInserer('video') },
      { label: 'Son…', icone: 'unmute', run: () => MediasPage.choisirEtInserer('audio') },
      null,
      { label: 'Tableau…', icone: 'table', run: tableauSurMesure },
      { label: 'Lien…', keys: `${ctrl}K`, icone: 'link', run: () => Editeur.lien() },
      { label: 'Trait horizontal', icone: 'horizontal-rule', run: Editeur.commandes.ligne },
      { label: 'Saut de page', keys: `${ctrl}Entrée`, icone: 'newline', run: Editeur.commandes.saut },
      { label: 'Date du jour', icone: 'calendar', run: () => Editeur.inserer(escapeHtml(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))) },
    ],
    format: () => {
      const e = Editeur.etat();
      return [
        { label: 'Gras', keys: `${ctrl}G`, icone: 'bold', coche: e.bold, run: Editeur.commandes.bold },
        { label: 'Italique', keys: `${ctrl}I`, icone: 'italic', coche: e.italic, run: Editeur.commandes.italic },
        { label: 'Souligné', keys: `${ctrl}U`, coche: e.underline, run: Editeur.commandes.underline },
        { label: 'Barré', icone: 'strikethrough', coche: e.strikeThrough, run: Editeur.commandes.strikeThrough },
        { label: 'Indice', keys: `${ctrl}=`, coche: e.subscript, run: Editeur.commandes.subscript },
        { label: 'Exposant', keys: `${ctrl}Maj++`, coche: e.superscript, run: Editeur.commandes.superscript },
        null,
        { label: 'Texte normal', keys: `${ctrl}Alt+0`, coche: e.style === 'p', run: () => Editeur.commandes.style('p') },
        { label: 'Titre 1', keys: `${ctrl}Alt+1`, coche: e.style === 'h1', run: () => Editeur.commandes.style('h1') },
        { label: 'Titre 2', keys: `${ctrl}Alt+2`, coche: e.style === 'h2', run: () => Editeur.commandes.style('h2') },
        { label: 'Titre 3', keys: `${ctrl}Alt+3`, coche: e.style === 'h3', run: () => Editeur.commandes.style('h3') },
        { label: 'Citation', coche: e.style === 'blockquote', run: () => Editeur.commandes.style('blockquote') },
        { label: 'Code', coche: e.style === 'pre', run: () => Editeur.commandes.style('pre') },
        null,
        { label: 'Effacer la mise en forme', keys: `${ctrl}Espace`, icone: 'clear-all', run: Editeur.commandes.removeFormat },
        null,
        { label: 'Mise en page…', icone: 'layout', run: () => ouvrirMiseEnPage() },
      ];
    },
    affichage: () => [
      { label: 'Zoom avant', keys: `${ctrl}+`, icone: 'zoom-in', run: () => zoomer(config.zoom + 10) },
      { label: 'Zoom arrière', keys: `${ctrl}-`, icone: 'zoom-out', run: () => zoomer(config.zoom - 10) },
      { label: 'Taille réelle (100 %)', keys: `${ctrl}0`, run: () => zoomer(100) },
      { label: 'Toute la largeur de la page', run: zoomLargeur },
      null,
      { label: 'Page blanche', coche: config.page !== 'sombre', run: () => changerPage('claire') },
      { label: 'Page sombre', coche: config.page === 'sombre', run: () => changerPage('sombre') },
      null,
      { label: 'Panneau Loki', keys: `${ctrl}Maj+K`, icone: 'sparkle', run: () => document.querySelector('.claude-bouton-titre')?.click() },
    ],
  };
  async function changerPage(p) {
    config = await window.edda.writeConfig({ page: p });
    applyTheme(config);
  }
  function editionNative(commande) {
    Editeur.restaurer();
    window.edda.commandeEdition(commande).catch(() => {});
  }
  for (const b of $$('#menus button')) {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.onclick = async () => Menus.sous(b, await menus[b.dataset.menu]());
    // Un menu ouvert : survoler le voisin l'ouvre (comme dans tous les logiciels).
    b.onmouseenter = async () => { if (Menus.estOuvert() && document.querySelector('#menus button.open') && !b.classList.contains('open')) Menus.sous(b, await menus[b.dataset.menu]()); };
  }

  // ======================================================================
  // Clic droit
  // ======================================================================
  window.edda.onMenuContexte((p) => {
    const dansPage = actif && document.elementFromPoint(p.x, p.y)?.closest('.feuille') === actif.page;
    if (!p.editable && !p.selection) return;
    const items = [];
    if (p.mot) {
      if (p.suggestions.length) for (const s of p.suggestions.slice(0, 6)) items.push({ label: s, icone: 'check', run: () => window.edda.commandeEdition('remplacer', s) });
      else items.push({ label: 'Aucune suggestion', desactive: true });
      items.push({ label: `Ajouter « ${p.mot} » au dictionnaire`, icone: 'book', run: () => window.edda.commandeEdition('dictionnaire', p.mot) }, null);
    }
    items.push(
      { label: 'Couper', keys: `${ctrl}X`, desactive: !p.peutCouper, run: () => window.edda.commandeEdition('cut') },
      { label: 'Copier', keys: `${ctrl}C`, icone: 'copy', desactive: !p.peutCopier, run: () => window.edda.commandeEdition('copy') },
      { label: 'Coller', keys: `${ctrl}V`, icone: 'clippy', desactive: !p.peutColler, run: () => window.edda.commandeEdition('paste') },
    );
    if (dansPage) {
      items.push({ label: 'Coller sans mise en forme', keys: `${ctrl}Maj+V`, desactive: !p.peutColler, run: () => window.edda.commandeEdition('pasteAndMatchStyle') });
      const e = Editeur.etat();
      if (e.lien) {
        const href = e.lien.getAttribute('href');
        items.push(null, { label: 'Modifier le lien…', icone: 'link', run: () => Editeur.lien() }, { label: 'Ouvrir le lien', icone: 'link-external', run: () => window.edda.ouvrirLien(href).catch((err) => notify(cleanError(err), 'error')) });
      } else items.push(null, { label: 'Lien…', keys: `${ctrl}K`, icone: 'link', run: () => Editeur.lien() });
      if (e.dansTableau) {
        items.push(null, 'Tableau',
          { label: 'Insérer une ligne au-dessus', run: () => Editeur.modifierTableau('ligneAvant') },
          { label: 'Insérer une ligne en dessous', run: () => Editeur.modifierTableau('ligneApres') },
          { label: 'Insérer une colonne à gauche', run: () => Editeur.modifierTableau('colonneAvant') },
          { label: 'Insérer une colonne à droite', run: () => Editeur.modifierTableau('colonneApres') },
          { label: 'Supprimer la ligne', run: () => Editeur.modifierTableau('supprimerLigne') },
          { label: 'Supprimer la colonne', run: () => Editeur.modifierTableau('supprimerColonne') },
          { label: 'Première ligne en en-tête', run: () => Editeur.modifierTableau('entete') },
          { label: 'Couleur de fond de la case…', icone: 'symbol-color', run: () => {
            const ancre = el('button', { style: `position:fixed;left:${p.x}px;top:${p.y}px;width:1px;height:1px;opacity:0` });
            document.body.append(ancre);
            Menus.palette(ancre, { titre: 'Fond de la case', aucune: 'Aucun fond', choisir: (c) => Editeur.fondCellule(c) });
            setTimeout(() => ancre.remove(), 0);
          } },
          { label: 'Supprimer le tableau', icone: 'trash', run: () => Editeur.modifierTableau('supprimerTableau') });
      }
      items.push(null, { label: 'Effacer la mise en forme', icone: 'clear-all', run: Editeur.commandes.removeFormat });
    }
    Menus.ouvrir(p.x, p.y, items);
  });

  // ======================================================================
  // Glisser-déposer : un document l'ouvre, un média se pose dans la page
  // ======================================================================
  const EXT_DOCS = Object.values(Formats.liste).flatMap((f) => f.extensions).concat(['doc']);
  let profondeur = 0;
  const avecFichiers = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (avecFichiers(e)) { profondeur++; zone.classList.add('drop-target'); } });
  window.addEventListener('dragleave', () => { profondeur = Math.max(0, profondeur - 1); if (!profondeur) zone.classList.remove('drop-target'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    profondeur = 0;
    zone.classList.remove('drop-target');
    if (!avecFichiers(e)) return;
    const chemins = [...e.dataTransfer.files].map((f) => window.edda.pathOfDropped(f)).filter(Boolean);
    const documents = chemins.filter((c) => EXT_DOCS.includes(extension(c)));
    const medias = chemins.filter((c) => !documents.includes(c));
    for (const c of documents) await ouvrirChemin(c);
    if (medias.length) {
      if (!actif) nouveau();
      // Le média se pose là où on l'a lâché.
      const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (r && actif.page.contains(r.startContainer)) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); Editeur.memoriser(); }
      await MediasPage.insererFichiers(medias);
    }
  });

  // ======================================================================
  // Raccourcis clavier
  // ======================================================================
  window.addEventListener('keydown', (e) => {
    if (Dialogs.isOpen()) { if (e.key === 'Escape') Dialogs.close(null); return; }
    if (e.key === 'Escape' && Recherche.estOuverte()) { Recherche.fermer(); return; }
    if (!(e.ctrlKey || e.metaKey)) { if (e.key === 'F12') return; return; }
    const k = e.key.toLowerCase();
    const dansSaisie = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.closest?.('.claude-panneau');
    const faire = (f) => { e.preventDefault(); f(); };
    // Fichiers et fenêtre : partout.
    if (k === 'n' && !e.shiftKey) return faire(nouveau);
    if (k === 'o' && !e.shiftKey) return faire(ouvrir);
    if (k === 's' && e.shiftKey) return faire(() => enregistrer(actif, { sous: true }));
    if (k === 's') return faire(() => enregistrer());
    if (k === 'w') return faire(() => fermerDocument());
    if (k === 'p' && !e.shiftKey) return faire(() => imprimer());
    if (e.key === ',') return faire(ouvrirReglages);
    if (k === 'tab' && docs.length > 1) return faire(() => activer(docs[(docs.indexOf(actif) + (e.shiftKey ? -1 : 1) + docs.length) % docs.length]));
    if (k === 'f' && !e.shiftKey) return faire(() => Recherche.ouvrir(false));
    if (k === 'h' && !e.shiftKey) return faire(() => Recherche.ouvrir(true));
    if ((e.key === '+' || e.key === '=') && !e.shiftKey && e.code !== 'Equal') return faire(() => zoomer(config.zoom + 10));
    if (e.key === '-' && !e.shiftKey && dansSaisie) return;
    if (e.key === '-') return faire(() => zoomer(config.zoom - 10));
    if (e.key === '0' && !e.altKey) return faire(() => zoomer(100));
    if (dansSaisie || !actif) return;
    // Mise en forme : seulement quand on écrit dans la page.
    const C = Editeur.commandes;
    if (e.altKey && /^[0-4]$/.test(e.key)) return faire(() => C.style(e.key === '0' ? 'p' : `h${e.key}`));
    if (e.altKey && (e.code === 'Digit0' || e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) return faire(() => C.style(e.code === 'Digit0' ? 'p' : `h${e.code.slice(-1)}`));
    if (e.altKey) return;
    if (k === 'g' || k === 'b') return faire(C.bold);
    if (k === 'i') return faire(C.italic);
    if (k === 'u') return faire(C.underline);
    if (k === 'e') return faire(C.justifyCenter);
    if (k === 'l' && e.shiftKey) return faire(C.insertUnorderedList);
    if (k === 'l') return faire(C.justifyLeft);
    if (k === 'r') return faire(C.justifyRight);
    if (k === 'j') return faire(C.justifyFull);
    if (k === 'k') return faire(() => Editeur.lien());
    if (k === 'y' || (k === 'z' && e.shiftKey)) return faire(C.redo);
    if (e.key === ' ') return faire(C.removeFormat);
    if (e.key === '>' || (e.shiftKey && e.code === 'Period')) return faire(C.plusGrand);
    if (e.key === '<' || (e.shiftKey && e.code === 'Comma')) return faire(C.plusPetit);
    if (e.code === 'Equal' && e.shiftKey) return faire(C.superscript);
    if (e.code === 'Equal' || e.key === '=') return faire(C.subscript);
  });

  // ======================================================================
  // Accueil
  // ======================================================================
  const depuis = (ms) => {
    const j = Math.floor((Date.now() - ms) / 86400000);
    if (j < 1) return 'aujourd\'hui';
    if (j < 2) return 'hier';
    if (j < 30) return `il y a ${j} jours`;
    return new Date(ms).toLocaleDateString('fr-FR');
  };
  const ligneDoc = (chemin, detail) => el('button', { className: 'doc-ligne', title: chemin, onclick: () => ouvrirChemin(chemin) },
    el('i', { className: 'codicon codicon-file' }), el('span', { className: 'doc-nom', textContent: nomFichier(chemin) }),
    el('span', { className: 'doc-chemin', textContent: `‎${chemin.replace(/[\\/][^\\/]*$/, '')}` }), detail ? el('span', { className: 'doc-quand', textContent: detail }) : null);
  async function rendreAccueil() {
    const recents = await window.edda.recents();
    $('#accueil-recents-bloc').hidden = !recents.length;
    $('#accueil-recents').replaceChildren(...recents.slice(0, 10).map((c) => ligneDoc(c)));
    if (dossierProjet) {
      const liste = await window.edda.documentsDuDossier(dossierProjet).catch(() => []);
      $('#accueil-dossier-bloc').hidden = false;
      $('#accueil-dossier-titre').textContent = `Documents de ${nomFichier(dossierProjet)}`;
      $('#accueil-dossier').replaceChildren(...(liste.length ? liste.map((x) => ligneDoc(x.chemin, depuis(x.modifie))) : [el('p', { className: 'welcome-hint', textContent: 'Aucun document dans ce dossier pour l\'instant.' })]));
    } else $('#accueil-dossier-bloc').hidden = true;
  }

  // Un fichier changé par un autre logiciel pendant qu'il est ouvert (et pas modifié ici) : on propose de le relire.
  window.addEventListener('focus', async () => {
    for (const d of docs) {
      if (!d.chemin || !d.dateFichier || d.relectureProposee) continue;
      const date = await window.edda.dateModif(d.chemin);
      if (date && Math.abs(date - d.dateFichier) > 1000) {
        d.relectureProposee = true;
        notify(`${d.nom} a été modifié par un autre logiciel.`, 'warning', 15000, [{ label: 'Recharger', run: () => recharger(d) }]);
      }
    }
  });
  async function recharger(d) {
    if (d.modifie) {
      const ok = await Dialogs.ask('Recharger ?', `Tes modifications de ${d.nom} dans Edda seront perdues.`, [{ label: 'Annuler', value: false }, { label: 'Recharger', value: true, primary: true }]);
      if (!ok) return;
    }
    const chemin = d.chemin;
    d.modifie = false;
    retirer(d);
    await ouvrirChemin(chemin);
  }

  // ======================================================================
  // Boutons et démarrage
  // ======================================================================
  $('#btn-reglages').onclick = ouvrirReglages;
  $('#onglet-nouveau').onclick = nouveau;
  $('#accueil-nouveau').onclick = nouveau;
  $('#accueil-ouvrir').onclick = ouvrir;
  window.addEventListener('resize', majStatutBientot);

  return {
    // Pour Claude (claude-actions.js) : les mêmes fonctions que les boutons.
    claude: {
      docs: () => docs,
      actif: () => actif,
      activer,
      nouveau: (nom) => { const d = nouveau(); if (nom) { d.nom = nom; rendreOnglets(); majTitre(); } return d; },
      ouvrirOctets,
      enregistrer,
      contexteEcriture,
      ouvrirMiseEnPage,
      appliquerMiseEnPage: (d, mp) => {
        d.miseEnPage = { ...d.miseEnPage, ...mp, marges: { ...d.miseEnPage.marges, ...(mp.marges || {}) } };
        Editeur.appliquerMiseEnPage(d);
        if (!d.modifie) { d.modifie = true; signaler(); rendreOnglets(); majTitre(); }
      },
      dossierProjet: () => dossierProjet,
    },
    async start() {
      const lu = await window.edda.readConfig();
      config = lu.config;
      configPath = lu.path;
      await applyTheme(config);
      window.edda.onDocumentsExternes(async (fichiers) => { for (const f of fichiers) await ouvrirChemin(f); });
      window.edda.onDossierExterne((dossier) => { dossierProjet = dossier; if (!docs.length) rendreAccueil(); else notify(`Projet : ${nomFichier(dossier)}. Ses documents sont listés sur l'accueil.`, 'info', 4000); });
      const { dossier, fichiers } = await window.edda.demarrage();
      dossierProjet = dossier;
      afficher();
      for (const f of fichiers) await ouvrirChemin(f);
    },
  };
})();

App.start();
