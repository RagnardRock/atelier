// Panneau Bifrost (icône « globe » de la barre de gauche).
// Bifrost est le CMS où tes clients modifient leur site. Ici, côté dev :
// - Flags : les zones data-bf de la page ouverte (type deviné, ligne) et les erreurs, soulignées
//   aussi dans l'éditeur. Clic droit sur une balise › « Bifrost : … » pour en ajouter.
// - Site : relier le dossier ouvert à un site Bifrost (fichier .bifrost.json), voir les
//   modifications du client pas encore publiées et l'historique des publications.
// - Rapatrier : copier dans tes fichiers les modifications du client (avant une refonte), après
//   comparaison fichier par fichier. Les fichiers remplacés sont sauvegardés.
// - Envoyer sur Bifrost : aperçu de ce qui changera en ligne, puis publication (avec historique,
//   on peut revenir en arrière depuis Bifrost). Remplace le réimport par ZIP.
// Le travail réseau est fait par main.js (voir ../bifrost.js).

const bifrostPanel = (() => {
  const view = $('#bifrost');
  const body = $('#bifrost-body');
  const api = (action, ...args) => window.atelier.bifrost(action, ...args);
  let etat = null;          // { connecte, serveur, email, lien }
  let fiche = null;         // fiche du site relié (modifs en attente, publications)
  let sites = null;         // sites du compte dev (pour relier le dossier)
  let rapatriement = null;  // { version, fichiers, coches:Set }
  let envoi = null;         // aperçu de l'envoi
  let options = { supprimer: false, ecraserBrouillon: false };
  let analyseSite = null;   // vérification de tout le site
  let occupe = false;
  let zonesOuvertes = null; // liste des zones dépliée à la main (sinon : dépliée si courte)
  let blocs = null;         // bibliothèque de sections de Bifrost (chargée à l'ouverture de la section)
  const ouverts = new Set(JSON.parse(localStorage.getItem('rune.bifrost.sections') || '["flags","envoi","client"]'));

  const esc = (s) => escapeHtml(String(s ?? ''));
  const date = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const rel = (p) => (state.root && p.startsWith(state.root) ? p.slice(state.root.length + 1).replace(/\\/g, '/') : p);

  // --- Flags de la page ouverte ---

  function fichierActif() {
    const tab = state.activeGroup?.active;
    if (!tab || tab.file.kind || tab.file.model.getLanguageId() !== 'html') return null;
    return tab.file;
  }

  // Soulignements dans l'éditeur (uniquement pour les pages qui ont des flags).
  function souligner(model) {
    if (!model || model.isDisposed() || model.getLanguageId() !== 'html') return;
    const texte = model.getValue();
    const marques = !texte.includes('data-bf') ? [] : BifrostFlags.analyser(texte).erreurs.map((e) => ({
      startLineNumber: e.ligne, startColumn: e.col, endLineNumber: e.ligne, endColumn: e.col + 4,
      message: `Bifrost : ${e.message}`, source: 'Bifrost',
      severity: e.gravite === 'erreur' ? monaco.MarkerSeverity.Error : e.gravite === 'attention' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
    }));
    monaco.editor.setModelMarkers(model, 'bifrost', marques);
  }

  const ICONE = { erreur: 'error', attention: 'warning', info: 'info' };
  const TYPE = { texte: 'symbol-text', riche: 'symbol-snippet', image: 'file-media', lien: 'link' };

  function sectionFlags() {
    const f = fichierActif();
    if (!f) return '<p class="hint">Ouvre une page HTML pour voir ses zones modifiables.</p>';
    const a = BifrostFlags.analyser(f.model.getValue());
    let h = '';
    if (a.erreurs.length) {
      h += a.erreurs.map((e) => `<div class="bf-ligne bf-${e.gravite}" data-ligne="${e.ligne}" data-col="${e.col}"><i class="codicon codicon-${ICONE[e.gravite]}"></i><span>${esc(e.message)}</span><small>${e.ligne}</small></div>`).join('');
    }
    if (!a.champs.length && !a.listes.length && !a.formulaires.length && !a.modele) {
      return `${h}<p class="hint">Aucune zone modifiable sur cette page. Clic droit sur une balise › « Bifrost : rendre modifiable ».</p>`;
    }
    if (a.modele) h += `<div class="bf-ligne"><i class="codicon codicon-file-code"></i><span>Page modèle de « ${esc(a.modele)} »</span></div>`;
    const horsListe = a.champs.filter((c) => !c.liste);
    if (horsListe.length) h += `<details class="bf-zones" ${(zonesOuvertes ?? horsListe.length <= 12) ? 'open' : ''}><summary class="bf-titre">Zones (${horsListe.length})</summary>`;
    h += horsListe.map((c) => `<div class="bf-ligne" data-ligne="${c.ligne}" data-col="${c.col}" title="&lt;${c.tag}&gt; : ${c.type}"><i class="codicon codicon-${TYPE[c.type]}"></i><span>${esc(c.cle || '(sans nom)')}</span><em>${c.type}</em><small>${c.ligne}</small></div>`).join('');
    if (horsListe.length) h += '</details>';
    for (const l of a.listes) {
      const dedans = a.champs.filter((c) => c.liste === l.nom);
      h += `<div class="bf-titre bf-liste" data-ligne="${l.ligne}" data-col="${l.col}"><i class="codicon codicon-list-unordered"></i>Liste « ${esc(l.nom)} » · ${pluriel(l.elements, 'élément')}${l.limite ? ` · ${l.limite} affichés` : ''}</div>`;
      const uniques = [...new Map(dedans.map((c) => [c.cle, c])).values()];
      h += uniques.map((c) => `<div class="bf-ligne bf-sous" data-ligne="${c.ligne}" data-col="${c.col}"><i class="codicon codicon-${TYPE[c.type]}"></i><span>${esc(c.cle || '(sans nom)')}</span><em>${c.type}</em><small>${c.ligne}</small></div>`).join('');
    }
    for (const fo of a.formulaires) {
      h += `<div class="bf-ligne" data-ligne="${fo.ligne}" data-col="${fo.col}"><i class="codicon codicon-mail"></i><span>Formulaire « ${esc(fo.nom || '?')} »</span><em>${pluriel(fo.champs, 'champ')}</em><small>${fo.ligne}</small></div>`;
    }
    return h;
  }

  async function verifierSite() {
    if (!state.root) return;
    const { files } = await window.atelier.listFiles();
    const pages = [];
    for (const f of files.filter((x) => /\.html?$/i.test(x.rel)).slice(0, 2000)) {
      const ouvert = state.files.get(f.path);
      const html = ouvert?.model ? ouvert.model.getValue() : await window.atelier.readFile(f.path).catch(() => '');
      if (html.includes('data-bf')) pages.push({ chemin: f.rel, html, path: f.path });
    }
    const r = BifrostFlags.analyserSite(pages);
    const erreurs = [...r.erreurs];
    const vus = new Set();
    for (const p of r.pages) for (const e of p.erreurs) {
      const cle = `${p.chemin}|${e.ligne}|${e.message}`;
      if (e.gravite !== 'info' && !vus.has(cle)) { vus.add(cle); erreurs.push({ ...e, chemin: p.chemin }); }
    }
    analyseSite = { pages: pages.length, erreurs, chemins: Object.fromEntries(pages.map((p) => [p.chemin, p.path])) };
    ouverts.add('site-flags');
    render();
  }

  function sectionVerification() {
    if (!analyseSite) return '';
    if (!analyseSite.erreurs.length) return `<p class="hint">${pluriel(analyseSite.pages, 'page')} avec des flags, aucune erreur.</p>`;
    return analyseSite.erreurs.map((e) => `<div class="bf-ligne bf-${e.gravite}" data-fichier="${esc(analyseSite.chemins[e.chemin] || '')}" data-ligne="${e.ligne}" data-col="${e.col}"><i class="codicon codicon-${ICONE[e.gravite]}"></i><span>${esc(e.message)}</span><small>${esc(e.chemin)}:${e.ligne}</small></div>`).join('');
  }

  // --- Compte et site relié ---

  function formulaireConnexion() {
    return `<form class="bf-form" id="bf-connexion">
      <p class="hint">Connecte-toi avec ton compte dev de Bifrost. Le mot de passe n'est pas gardé : Rune reçoit une clé, chiffrée sur ce PC.</p>
      <label>Adresse de Bifrost <input name="serveur" value="${esc(etat?.serveur)}" placeholder="https://bifrost.mon-domaine.fr" required></label>
      <label>E-mail <input name="email" type="email" value="${esc(etat?.email)}" required></label>
      <label>Mot de passe <input name="motDePasse" type="password" required></label>
      <p class="form-error" id="bf-erreur"></p>
      <button type="submit" class="primary-button git-wide"><i class="codicon codicon-plug"></i>Se connecter</button>
    </form>`;
  }

  function choixSite() {
    if (!sites) return '<p class="hint">Chargement des sites…</p>';
    if (!sites.length) return '<p class="hint">Aucun site dans Bifrost. Crée-le d\'abord dans l\'espace dev (« + Nouveau site »).</p>';
    return `<p class="hint">Quel site Bifrost correspond au dossier ouvert ?</p>${sites.map((s) => `<div class="bf-ligne bf-site"><i class="codicon codicon-globe"></i><span>${esc(s.nom)}</span><em>${s.enAttente ? `${s.enAttente} en attente` : ''}</em><button class="secondary-button" data-lier="${esc(s.id)}">Relier</button></div>`).join('')}`;
  }

  function sectionClient() {
    if (!fiche) return '<p class="hint">Chargement…</p>';
    let h = '';
    if (fiche.enAttente?.length) {
      h += `<div class="bf-titre">Pas encore publié par le client (${fiche.enAttente.length})</div>`;
      h += fiche.enAttente.map((c) => `<div class="bf-ligne bf-attention"><i class="codicon codicon-edit"></i><span>${esc(c.texte)}</span></div>`).join('');
    } else h += '<p class="hint">Aucune modification en attente chez le client.</p>';
    const pubs = fiche.publications || [];
    h += `<div class="bf-titre">Publications (${pubs.length})</div>`;
    if (!pubs.length) h += '<p class="hint">Aucune publication depuis l\'import.</p>';
    for (const p of pubs.slice(0, 30)) {
      const ch = Array.isArray(p.changements) ? p.changements : [];
      h += `<details class="bf-pub${p.annulee ? ' annulee' : ''}"><summary><i class="codicon codicon-history"></i><span>${date(p.createdAt)}</span><em>${esc(p.auteur || '')}</em>${p.annulee ? '<small>annulée</small>' : ''}</summary>
        ${ch.length ? ch.map((c) => `<div class="bf-sous-texte">${esc(c.texte)}</div>`).join('') : `<div class="bf-sous-texte">${pluriel((p.ajoutes?.length || 0) + (p.modifies?.length || 0) + (p.supprimes?.length || 0), 'fichier')}</div>`}
      </details>`;
    }
    return h;
  }

  function sectionRapatrier() {
    let h = `<p class="hint">Copie dans tes fichiers ce que le client a changé, avant de retoucher le site. Tes fichiers remplacés sont sauvegardés.</p>
      <div class="bf-choix">
        <label><input type="radio" name="bf-version" value="publie" ${rapatriement?.version !== 'brouillon' ? 'checked' : ''}> Version en ligne</label>
        <label title="Y compris ce que le client n'a pas encore publié"><input type="radio" name="bf-version" value="brouillon" ${rapatriement?.version === 'brouillon' ? 'checked' : ''}> Brouillon du client</label>
      </div>
      <button class="secondary-button git-wide" id="bf-comparer"><i class="codicon codicon-diff"></i>Comparer avec mes fichiers</button>`;
    if (!rapatriement) return h;
    const { fichiers, coches } = rapatriement;
    if (!fichiers.length) return `${h}<p class="hint">Tes fichiers sont identiques à cette version.</p>`;
    h += fichiers.map((f) => `<div class="bf-ligne bf-fichier" data-comparer="${esc(f.chemin)}" title="Clic : voir les différences">
      <input type="checkbox" data-coche="${esc(f.chemin)}" ${coches.has(f.chemin) ? 'checked' : ''}>
      <span>${esc(f.chemin)}</span><em class="bf-${f.etat}">${f.etat === 'nouveau' ? 'nouveau' : 'modifié'}</em></div>`).join('');
    h += `<button class="primary-button git-wide" id="bf-rapatrier" ${coches.size ? '' : 'disabled'}><i class="codicon codicon-cloud-download"></i>Rapatrier ${pluriel(coches.size, 'fichier')}</button>`;
    return h;
  }

  function sectionEnvoi() {
    let h = '<button class="primary-button git-wide" id="bf-apercu"><i class="codicon codicon-cloud-upload"></i>Envoyer sur Bifrost…</button>';
    if (!envoi) return h;
    const e = envoi;
    const total = e.ajoutes.length + e.modifies.length + e.supprimes.length;
    h = '';
    if (e.publicationsDepuis?.length) {
      h += `<div class="bf-alerte"><i class="codicon codicon-warning"></i><span>Le client a publié ${pluriel(e.publicationsDepuis.length, 'fois')} depuis ta dernière synchro : rapatrie d'abord, sinon ses changements seront remplacés par tes fichiers.</span></div>`;
    }
    if (e.clientEnAttente?.length) {
      h += `<div class="bf-alerte"><i class="codicon codicon-warning"></i><span>Le client a ${pluriel(e.clientEnAttente.length, 'modification')} pas encore publiée${e.clientEnAttente.length > 1 ? 's' : ''} : elles seront perdues.</span></div>
        <label class="bf-case"><input type="checkbox" id="bf-ecraser" ${options.ecraserBrouillon ? 'checked' : ''}> Je sais, remplacer son brouillon</label>`;
    }
    const liste = (titre, fichiers, classe) => (fichiers.length ? `<div class="bf-titre">${titre} (${fichiers.length})</div>${fichiers.slice(0, 200).map((f) => `<div class="bf-ligne bf-fichier ${classe}" ${classe !== 'bf-supprime' ? `data-comparer-envoi="${esc(f)}"` : ''}><span>${esc(f)}</span></div>`).join('')}` : '');
    h += liste('Nouveaux', e.ajoutes, 'bf-nouveau');
    h += liste('Modifiés', e.modifies, 'bf-modifie');
    h += liste('Supprimés en ligne', e.supprimes, 'bf-supprime');
    if (e.absents.length) {
      h += `<label class="bf-case" title="${esc(e.absents.slice(0, 30).join('\n'))}"><input type="checkbox" id="bf-supprimer" ${options.supprimer ? 'checked' : ''}> Supprimer aussi en ligne les ${pluriel(e.absents.length, 'fichier')} absent${e.absents.length > 1 ? 's' : ''} de ton dossier</label>`;
    }
    if (!total) h += '<p class="hint">Rien à envoyer : la version en ligne est identique à ton dossier.</p>';
    const bloque = e.clientEnAttente?.length && !options.ecraserBrouillon;
    h += `<div class="bf-boutons"><button class="secondary-button" id="bf-annuler-envoi">Annuler</button>
      <button class="primary-button" id="bf-envoyer" ${!total || bloque ? 'disabled' : ''}><i class="codicon codicon-cloud-upload"></i>Envoyer et publier</button></div>
      <p class="hint">La publication garde un historique : on peut revenir en arrière depuis Bifrost.</p>`;
    return h;
  }

  // --- Insérer un bloc : les sections toutes faites du mode dev de Bifrost ---

  function sectionBlocs() {
    if (!blocs) {
      api('blocs').then((b) => { blocs = b; render(); }).catch((err) => { blocs = []; notify.error(cleanError(err)); render(); });
      return '<p class="hint">Chargement…</p>';
    }
    if (!fichierActif()) return '<p class="hint">Ouvre une page HTML : le bloc s\'insère sous la ligne du curseur.</p>';
    const carte = (b) => `<button class="bf-bloc" data-bloc="${esc(b.id)}" title="${esc(b.description || b.nom)}"><span>${esc(b.icone)}</span><strong>${esc(b.nom)}</strong></button>`;
    const fournis = blocs.filter((b) => !b.perso);
    const perso = blocs.filter((b) => b.perso);
    return `<p class="hint">Le bloc s'insère sous la ligne du curseur, flags déjà posés (renommés s'ils existent déjà dans le site).</p>
      <div class="bf-blocs">${fournis.map(carte).join('')}</div>
      ${perso.length ? `<div class="bf-titre">Mes blocs</div><div class="bf-blocs">${perso.map(carte).join('')}</div>` : ''}`;
  }

  async function insererBloc(id) {
    const f = fichierActif();
    const ed = state.activeGroup?.editor;
    if (!f || !ed || ed.getModel() !== f.model) return notify.info('Ouvre une page HTML et place le curseur où ajouter le bloc.');
    const r = await agir(() => api('preparerBloc', id, f.path));
    if (!r) return;
    const m = f.model;
    const ligne = ed.getPosition()?.lineNumber || m.getLineCount();
    const indent = /^\s*/.exec(m.getLineContent(ligne))[0];
    const fin = m.getLineMaxColumn(ligne);
    const edits = [{ range: new monaco.Range(ligne, fin, ligne, fin), text: `\n${indent}${BifrostFlags.indenter(r.html.trim(), indent)}`, forceMoveMarkers: true }];
    if (r.feuille) {
      const p = BifrostFlags.placeFeuille(m.getValue(), r.feuille);
      if (p) {
        const pos = m.getPositionAt(p.offset);
        edits.push({ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: p.texte });
      }
    }
    ed.pushUndoStop();
    ed.executeEdits('bifrost', edits);
    ed.pushUndoStop();
    ed.revealLineInCenter(ligne + 1);
    ed.focus();
    flash(r.feuille ? 'Bloc inséré (feuille assets/bifrost-blocs.css ajoutée au site)' : 'Bloc inséré');
  }

  function sectionReglages() {
    const l = etat.lien;
    return `<label class="bf-champ">Dossier du site dans le projet <input id="bf-dossier" value="${esc(l?.dossier || '')}" placeholder="vide = tout le dossier ouvert (ou public, dist…)"></label>
      <p class="hint">Dernière synchro : ${l?.synchro ? date(l.synchro) : 'jamais'}</p>
      <div class="bf-boutons"><button class="secondary-button" id="bf-delier"><i class="codicon codicon-debug-disconnect"></i>Délier ce dossier</button></div>`;
  }

  function sectionCompte() {
    return `<p class="hint">${esc(etat.email)} sur ${esc(etat.serveur)}</p>
      <div id="bf-jetons"></div>
      <div class="bf-boutons"><button class="secondary-button" id="bf-appareils"><i class="codicon codicon-device-desktop"></i>Appareils connectés</button>
      <button class="secondary-button" id="bf-deconnexion"><i class="codicon codicon-sign-out"></i>Se déconnecter</button></div>`;
  }

  function section(id, titre, contenu, compte) {
    const ouvert = ouverts.has(id) || id === 'connexion' || id === 'relier'; // à faire d'abord : toujours ouverts
    return `<div class="bf-section${ouvert ? ' ouverte' : ''}" data-section="${id}">
      <button class="bf-entete"><i class="codicon codicon-chevron-${ouvert ? 'down' : 'right'}"></i>${titre}${compte ? `<span class="count">${compte}</span>` : ''}</button>
      ${ouvert ? `<div class="bf-contenu">${contenu()}</div>` : ''}</div>`;
  }

  function render() {
    if (view.hidden) return;
    const defilement = body.scrollTop;
    const f = fichierActif();
    const nbErreurs = f ? BifrostFlags.analyser(f.model.getValue()).erreurs.filter((e) => e.gravite === 'erreur').length : 0;
    const flags = section('flags', 'Flags de la page', sectionFlags, nbErreurs || '')
      + section('site-flags', 'Vérifier tout le site', () => `<button class="secondary-button git-wide" id="bf-verifier"><i class="codicon codicon-checklist"></i>Vérifier les flags de toutes les pages</button>${sectionVerification()}`, analyseSite?.erreurs.length || '');
    let h = '';
    if (!etat) h += `${flags}<p class="hint">Chargement…</p>`;
    else if (!etat.connecte) h += flags + section('connexion', 'Se connecter à Bifrost', formulaireConnexion);
    else if (!state.root) h += `${flags}<p class="hint">Ouvre le dossier d'un site pour le relier à Bifrost.</p>`;
    else if (!etat.lien?.site) h += flags + section('relier', 'Relier ce dossier à un site', choixSite);
    else {
      // Dossier relié : les actions sur le site d'abord, les flags ensuite.
      $('#bifrost-title').textContent = `Bifrost · ${etat.lien.site.nom}`;
      h += section('envoi', 'Envoyer sur Bifrost', sectionEnvoi);
      h += section('client', 'Côté client', sectionClient, fiche?.enAttente?.length || '');
      h += section('rapatrier', 'Rapatrier les modifications', sectionRapatrier, rapatriement?.fichiers.length || '');
      h += flags;
      h += section('reglages', 'Lien du dossier', sectionReglages);
    }
    if (etat?.connecte && state.root) h += section('blocs', 'Insérer un bloc', sectionBlocs, blocs?.length || '');
    if (etat?.connecte) h += section('compte', 'Compte Bifrost', sectionCompte);
    if (!etat?.lien?.site) $('#bifrost-title').textContent = 'Bifrost';
    body.innerHTML = h;
    body.scrollTop = defilement;
    $('#bifrost-open').hidden = !etat?.lien?.site;
  }

  // --- Actions ---

  async function agir(fn, message) {
    if (occupe) return;
    occupe = true;
    view.classList.add('busy');
    try {
      const r = await fn();
      if (message) flash(typeof message === 'function' ? message(r) : message);
      return r;
    } catch (err) {
      notify.error(cleanError(err));
    } finally {
      occupe = false;
      view.classList.remove('busy');
      render();
    }
  }

  async function charger() {
    try {
      etat = await api('etat');
      if (etat.connecte && state.root && !etat.lien?.site && !sites) sites = await api('sites');
      if (etat.connecte && etat.lien?.site) fiche = await api('fiche');
    } catch (err) {
      notify.error(cleanError(err));
    }
    render();
  }

  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button, [data-ligne], [data-comparer], [data-comparer-envoi], input');
    if (!t) return;
    const entete = t.closest('.bf-entete');
    if (entete) {
      const id = entete.parentElement.dataset.section;
      if (ouverts.has(id)) ouverts.delete(id); else ouverts.add(id);
      localStorage.setItem('rune.bifrost.sections', JSON.stringify([...ouverts]));
      return render();
    }
    if (t.dataset.coche !== undefined) {
      e.stopPropagation();
      const c = t.dataset.coche;
      if (t.checked) rapatriement.coches.add(c); else rapatriement.coches.delete(c);
      const b = $('#bf-rapatrier');
      b.disabled = !rapatriement.coches.size;
      b.innerHTML = `<i class="codicon codicon-cloud-download"></i>Rapatrier ${pluriel(rapatriement.coches.size, 'fichier')}`;
      return;
    }
    if (t.dataset.ligne) {
      const fichier = t.dataset.fichier || fichierActif()?.path;
      if (fichier) openAt(fichier, Number(t.dataset.ligne), Number(t.dataset.col) || 1);
      return;
    }
    if (t.dataset.bloc) return insererBloc(t.dataset.bloc);
    if (t.dataset.lier) {
      const site = sites.find((s) => s.id === t.dataset.lier);
      return agir(async () => { etat.lien = await api('lier', site); fiche = await api('fiche'); ouverts.add('client'); }, `Dossier relié à ${site.nom}`);
    }
    if (t.dataset.comparer) return comparer(t.dataset.comparer, rapatriement.version);
    if (t.dataset.comparerEnvoi) return comparer(t.dataset.comparerEnvoi, 'publie');
    switch (t.id) {
      case 'bf-verifier': return agir(verifierSite);
      case 'bf-comparer': {
        const version = body.querySelector('input[name="bf-version"]:checked')?.value || 'publie';
        return agir(async () => {
          const r = await api('rapatrierApercu', version);
          rapatriement = { ...r, coches: new Set(r.fichiers.map((f) => f.chemin)) };
        });
      }
      case 'bf-rapatrier': {
        const chemins = [...rapatriement.coches];
        return agir(async () => {
          const r = await api('rapatrier', rapatriement.version, chemins);
          rapatriement = null;
          etat = await api('etat');
          if (r.sauvegarde) notify.info(`Tes anciennes versions sont sauvegardées dans ${r.sauvegarde}`);
          return r;
        }, (r) => `${pluriel(r.ecrits, 'fichier')} rapatrié${r.ecrits > 1 ? 's' : ''}`);
      }
      case 'bf-apercu':
      case 'bf-supprimer':
        if (t.id === 'bf-supprimer') options.supprimer = t.checked;
        return agir(async () => { envoi = await api('envoiEssai', { supprimer: options.supprimer }); });
      case 'bf-ecraser': options.ecraserBrouillon = t.checked; return render();
      case 'bf-annuler-envoi': envoi = null; options = { supprimer: false, ecraserBrouillon: false }; return render();
      case 'bf-envoyer':
        return agir(async () => {
          const r = await api('envoyer', options);
          envoi = null;
          options = { supprimer: false, ecraserBrouillon: false };
          etat = await api('etat');
          fiche = await api('fiche');
          return r;
        }, (r) => (r?.publication ? 'Envoyé et publié sur Bifrost' : 'Rien n\'a changé en ligne'));
      case 'bf-delier':
        return agir(async () => { await api('delier'); etat = await api('etat'); fiche = null; sites = await api('sites'); }, 'Dossier délié de Bifrost');
      case 'bf-deconnexion':
        return agir(async () => { await api('deconnexion'); etat = await api('etat'); fiche = null; sites = null; }, 'Déconnecté de Bifrost');
      case 'bf-appareils': return appareils();
      default:
        if (t.dataset.retirer) return agir(async () => { await api('retirerJeton', t.dataset.retirer); await appareils(); });
    }
  });

  body.addEventListener('toggle', (e) => { if (e.target.classList?.contains('bf-zones')) zonesOuvertes = e.target.open; }, true);

  body.addEventListener('change', (e) => {
    if (e.target.id === 'bf-dossier') agir(async () => { etat.lien = await api('reglerDossier', e.target.value); rapatriement = null; envoi = null; }, 'Dossier du site enregistré');
  });

  body.addEventListener('submit', (e) => {
    if (e.target.id !== 'bf-connexion') return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const erreur = $('#bf-erreur');
    erreur.textContent = '';
    occupe = true;
    api('connexion', d).then(async (r) => {
      occupe = false;
      if (r?.codeRequis) {
        // Double authentification : un champ pour le code, puis on renvoie le formulaire.
        if (!e.target.querySelector('[name="code"]')) {
          erreur.insertAdjacentHTML('beforebegin', '<label>Code de vérification <input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456 ou code de secours" required></label>');
        }
        erreur.textContent = r.message || 'Ton compte a la double authentification : tape le code de ton application.';
        e.target.querySelector('[name="code"]').focus();
        return;
      }
      sites = null;
      flash('Connecté à Bifrost');
      await charger();
    }, (err) => {
      occupe = false;
      erreur.textContent = cleanError(err);
    });
  });

  async function appareils() {
    const jetons = await api('jetons').catch((err) => { notify.error(cleanError(err)); return []; });
    const el = $('#bf-jetons');
    if (!el) return;
    el.innerHTML = jetons.map((j) => `<div class="bf-ligne"><i class="codicon codicon-device-desktop"></i><span>${esc(j.appareil)}</span><em>${j.actuel ? 'ce PC' : date(j.dernierUsage || j.createdAt)}</em>${j.actuel ? '' : `<button class="icon-button" data-retirer="${esc(j.id)}" title="Retirer l'accès"><i class="codicon codicon-trash"></i></button>`}</div>`).join('');
  }

  // Différences entre la version Bifrost (à gauche) et ton fichier (à droite).
  async function comparer(chemin, version) {
    if (/\.(png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|otf|mp4|webm|zip)$/i.test(chemin)) return notify.info(`${chemin} n'est pas un fichier texte.`);
    try {
      const [texte, local] = await Promise.all([api('texteDistant', chemin, version), api('cheminLocal', chemin)]);
      await gitView.showDiff(local, baseName(local), { original: texte, legende: `à gauche : ${version === 'brouillon' ? 'brouillon du client' : 'en ligne'} · à droite : ton fichier` });
    } catch (err) {
      notify.error(cleanError(err));
    }
  }

  // --- Clic droit dans l'éditeur : poser des flags ---

  function balise(editor) {
    const model = editor.getModel();
    const offset = model.getOffsetAt(editor.getPosition());
    const b = BifrostFlags.baliseA(model.getValue(), offset);
    if (!b) notify.info('Place le curseur dans une balise HTML.');
    return b;
  }

  // Ajoute des attributs à une balise, et sélectionne le premier nom pour pouvoir le changer tout de suite.
  function poser(editor, b, attributs) {
    const model = editor.getModel();
    const texte = attributs.map((a) => ` ${a}`).join('');
    const offset = b.debut + 1 + b.tag.length;
    const pos = model.getPositionAt(offset);
    editor.executeEdits('bifrost', [{ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: texte, forceMoveMarkers: true }]);
    const guillemet = texte.indexOf('"');
    if (guillemet >= 0) {
      const debut = model.getPositionAt(offset + guillemet + 1);
      const fin = model.getPositionAt(offset + texte.indexOf('"', guillemet + 1));
      editor.setSelection(new monaco.Range(debut.lineNumber, debut.column, fin.lineNumber, fin.column));
    }
    editor.focus();
  }

  function texteDe(model, b) {
    const reste = model.getValue().slice(b.fin, b.fin + 200);
    return reste.replace(/<[^>]*>/g, ' ').split('<')[0].trim().slice(0, 40);
  }

  function nomsExistants(model) {
    return BifrostFlags.analyser(model.getValue()).champs.map((c) => c.cle);
  }

  const ACTIONS = [
    ['texte', 'Bifrost : rendre modifiable', (ed, b, m) => {
      if ('data-bf' in b.attrs) return notify.info(`Cette balise est déjà modifiable (« ${b.attrs['data-bf']} »).`);
      poser(ed, b, [`data-bf="${BifrostFlags.nomPropose(rel(m.uri.fsPath || m.uri.path), b.tag, texteDe(m, b), nomsExistants(m))}"`]);
    }],
    ['riche', 'Bifrost : texte mis en forme (gras, listes…)', (ed, b, m) => {
      if ('data-bf' in b.attrs) return notify.info('Cette balise a déjà un data-bf : ajoute data-bf-type="riche" à la main.');
      poser(ed, b, [`data-bf="${BifrostFlags.nomPropose(rel(m.uri.fsPath || m.uri.path), b.tag, texteDe(m, b), nomsExistants(m))}"`, 'data-bf-type="riche"']);
    }],
    ['liste', 'Bifrost : liste répétable (ses enfants deviennent des éléments)', (ed, b, m) => {
      if ('data-bf-liste' in b.attrs) return notify.info('Cette balise est déjà une liste.');
      // Les enfants directs deviennent des éléments (de la fin vers le début, pour garder les positions).
      const enfants = BifrostFlags.balises(m.getValue()).filter((x) => x.parents[x.parents.length - 1]?.debut === b.debut && !('data-bf-element' in x.attrs));
      ed.pushUndoStop();
      for (const x of [...enfants].reverse()) {
        const p = m.getPositionAt(x.debut + 1 + x.tag.length);
        ed.executeEdits('bifrost', [{ range: new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column), text: ' data-bf-element' }]);
      }
      poser(ed, b, ['data-bf-liste="liste"']);
      ed.pushUndoStop();
    }],
    ['element', 'Bifrost : élément de liste', (ed, b) => {
      if ('data-bf-element' in b.attrs) return notify.info('Cette balise est déjà un élément de liste.');
      poser(ed, b, ['data-bf-element']);
    }],
    ['bloc', 'Bifrost : insérer un bloc (section toute faite)…', () => ouvrirBlocs()],
    ['formulaire', 'Bifrost : recevoir les messages de ce formulaire', (ed, b) => {
      if (b.tag !== 'form') return notify.info('Place le curseur dans la balise <form>.');
      if ('data-bf-formulaire' in b.attrs) return notify.info('Ce formulaire est déjà branché sur Bifrost.');
      poser(ed, b, ['data-bf-formulaire="contact"']);
    }],
  ];

  // Ouvre le panneau Bifrost sur la section « Insérer un bloc ».
  function ouvrirBlocs() {
    ouverts.add('blocs');
    localStorage.setItem('rune.bifrost.sections', JSON.stringify([...ouverts]));
    if (view.hidden) document.querySelector('#activitybar [data-view="bifrost"]').click();
    else render();
    setTimeout(() => body.querySelector('[data-section="blocs"]')?.scrollIntoView({ block: 'start' }), 100);
  }

  const equipes = new WeakSet();
  function ajouterActions(editor) {
    if (!editor?.addAction || equipes.has(editor)) return;
    equipes.add(editor);
    ACTIONS.forEach(([id, label, fn], i) => {
      editor.addAction({
        id: `bifrost.${id}`, label, contextMenuGroupId: '9_bifrost', contextMenuOrder: i,
        precondition: 'editorLangId == html',
        run: (ed) => { if (id === 'bloc') return fn(); const b = balise(ed); if (b) fn(ed, b, ed.getModel()); },
      });
    });
  }

  // --- Quand rafraîchir ---

  let minuteur = null;
  function bientot() {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      const f = fichierActif();
      if (f) souligner(f.model);
      render();
    }, 300);
  }

  function demarrer() {
    monaco.editor.getEditors?.().forEach(ajouterActions);
    monaco.editor.onDidCreateEditor((ed) => setTimeout(() => ajouterActions(ed), 0));
    monaco.editor.onDidCreateModel((m) => { setTimeout(() => souligner(m), 0); m.onDidChangeContent(() => { clearTimeout(m.bfTimer); m.bfTimer = setTimeout(() => souligner(m), 400); }); });
    monaco.editor.getModels().forEach(souligner);
  }
  if (window.monaco?.editor) demarrer();
  else pageReady.then(() => { const attendre = () => (window.monaco?.editor ? demarrer() : setTimeout(attendre, 100)); attendre(); });

  document.querySelector('#activitybar [data-view="bifrost"]').addEventListener('click', () => setTimeout(charger, 0));
  document.addEventListener('tab-activated', bientot);
  document.addEventListener('file-edited', (e) => { if (e.detail === fichierActif()) bientot(); });
  $('#bifrost-refresh').onclick = () => { sites = null; analyseSite = null; charger(); };
  $('#bifrost-open').onclick = () => {
    if (etat?.serveur && etat.lien?.site) window.atelier.openLink(`${etat.serveur}/edition/${encodeURIComponent(etat.lien.site.slug || etat.lien.site.id)}`);
  };
  // Nouveau dossier ouvert : on oublie le site précédent.
  new MutationObserver(() => { fiche = null; sites = null; rapatriement = null; envoi = null; analyseSite = null; if (!view.hidden) charger(); else etat = null; })
    .observe($('#tree-title'), { childList: true, characterData: true, subtree: true });

  return { refresh: charger, verifierSite };
})();
