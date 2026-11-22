// Widget Terminal : des onglets, chacun avec un ou plusieurs volets (côte à côte ou l'un sous l'autre).
// Chaque volet est un vrai terminal : le processus tourne dans ../terminal.js (node-pty), l'affichage
// est fait ici par xterm.js.
//
// - « + » : nouvel onglet avec le shell par défaut ; la flèche à côté : choisir le shell (PowerShell,
//   PowerShell 7, invite de commandes, Git Bash, WSL…).
// - Ctrl+C copie s'il y a une sélection (sinon il interrompt la commande, comme d'habitude), Ctrl+V colle,
//   clic droit = menu. Ctrl+F cherche. Ctrl+clic sur une adresse l'ouvre dans le navigateur.
// - Commandes favorites (étoile) : un bouton par commande (ssh sur ton serveur, ses journaux, un
//   redémarrage…), qui la tape dans le terminal actif. Clic droit sur un bouton : modifier, supprimer.
// - Bouton Loki : envoie à Loki la sélection (ou les dernières lignes) pour qu'il explique l'erreur.
//   Loki peut aussi lire le terminal et y lancer une commande : une carte te demande ton accord à chaque fois.
// - Le widget peut être détaché dans sa propre fenêtre (disposition.js) : les terminaux continuent.
//
// Réglages et favoris : %APPDATA%\atelier-hub\terminal.json.

const Terminal_ = (() => {
  const widget = $('#widget-terminal');
  const ongletsEl = $('#term-onglets');
  const vuesEl = $('#term-vues');
  const favorisEl = $('#term-favoris');

  const REGLAGES = { shell: '', dossier: '', taille: 13, police: '"Cascadia Mono", "Cascadia Code", Consolas, "DejaVu Sans Mono", monospace', copierSelection: false, favorisVisibles: true, lignes: 5000 };
  let donnees = { reglages: { ...REGLAGES }, favoris: [] };
  let shells = [];
  let config = {};
  const onglets = [];      // { id, titre, perso, volets: [], direction, actif, onglet, vue }
  const volets = new Map(); // id du processus -> volet
  let ongletActif = null;
  let prochainOnglet = 1;

  const enregistrer = () => window.atelier.ecrireDonnees('terminal', donnees).catch((err) => notify(cleanError(err), 'error'));
  const r = () => donnees.reglages;
  const vueDe = () => widget.ownerDocument.defaultView;

  // --- Couleurs : celles d'Atelier, fond transparent (le verre de la plaque se voit derrière) ---
  function theme() {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5fd4a8';
    return {
      background: '#00000000',
      foreground: '#d4d4d8',
      cursor: accent,
      cursorAccent: '#101014',
      selectionBackground: `${accent}55`,
      black: '#1e1f27', red: '#f0717a', green: '#5fd4a8', yellow: '#e8c66a', blue: '#6cb6ff', magenta: '#c49cff', cyan: '#5ec8ff', white: '#d4d4d8',
      brightBlack: '#6b6f80', brightRed: '#ff8f97', brightGreen: '#7ee8c0', brightYellow: '#f5d98b', brightBlue: '#8fcaff', brightMagenta: '#d7b8ff', brightCyan: '#86d8ff', brightWhite: '#ffffff',
    };
  }

  // --- Onglets et volets ---
  const dossierParDefaut = () => r().dossier || config.dossierProjets || '';
  const nomDossier = (d) => String(d || '').split(/[\\/]/).filter(Boolean).pop() || d;

  async function nouvelOnglet(shellId = r().shell, dossier = dossierParDefaut()) {
    Disposition.montrer('terminal');
    const onglet = {
      id: prochainOnglet++, titre: '', perso: false, volets: [], direction: 'ligne', actif: null,
      onglet: el('div', { className: 'term-onglet', role: 'tab' }),
      vue: el('div', { className: 'term-onglet-vue' }),
    };
    onglet.onglet.append(el('i', { className: 'codicon codicon-terminal' }), el('span', { className: 'nom' }),
      el('button', { className: 'icon-button fermer', title: 'Fermer cet onglet (Ctrl+Maj+W)' }, el('i', { className: 'codicon codicon-close' })));
    onglet.onglet.onclick = () => activer(onglet);
    onglet.onglet.querySelector('.fermer').onclick = (e) => { e.stopPropagation(); fermerOnglet(onglet); };
    onglet.onglet.addEventListener('auxclick', (e) => { if (e.button === 1) fermerOnglet(onglet); });
    onglet.onglet.addEventListener('dblclick', () => renommer(onglet));
    onglet.onglet.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ouvrirMenu(e.clientX, e.clientY, [
        ['Renommer…', () => renommer(onglet)],
        ['Diviser à droite', () => diviser(onglet, 'ligne')],
        ['Diviser en bas', () => diviser(onglet, 'colonne')],
        null,
        ['Fermer l\'onglet', () => fermerOnglet(onglet)],
      ], e.target.ownerDocument);
    });
    ongletsEl.append(onglet.onglet);
    vuesEl.append(onglet.vue);
    onglets.push(onglet);
    activer(onglet);
    try {
      await nouveauVolet(onglet, shellId, dossier);
    } catch (err) {
      fermerOnglet(onglet);
      throw err;
    }
    majVide();
    return onglet;
  }

  async function nouveauVolet(onglet, shellId, dossier) {
    const term = new Terminal({
      fontFamily: r().police,
      fontSize: r().taille,
      theme: theme(),
      cursorBlink: true,
      allowTransparency: true,
      scrollback: r().lignes,
      allowProposedApi: true, // la recherche colore tous les résultats
    });
    const fit = new FitAddon.FitAddon();
    const recherche = new SearchAddon.SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(recherche);
    // Ctrl+clic sur une adresse : elle s'ouvre dans ton navigateur.
    term.loadAddon(new WebLinksAddon.WebLinksAddon((event, url) => {
      if (event.ctrlKey) window.atelier.ouvrirLien(url).catch((err) => notify(cleanError(err), 'error'));
      else notify('Ctrl+clic pour ouvrir ce lien dans ton navigateur.', 'info', 2500);
    }));

    const elem = el('div', { className: 'term-volet' });
    const zone = el('div', { className: 'term-zone' });
    elem.append(zone);
    if (onglet.volets.length) onglet.vue.append(separateur(onglet));
    onglet.vue.append(elem);
    term.open(zone);
    fit.fit();

    let res;
    try {
      res = await window.atelier.creerTerminal(shellId, term.cols, term.rows, dossier);
    } catch (err) {
      term.dispose();
      elem.previousElementSibling?.classList.contains('term-separateur') && elem.previousElementSibling.remove();
      elem.remove();
      throw new Error(cleanError(err));
    }
    const volet = { id: res.id, term, fit, recherche, elem, zone, shell: res.shell, dossier: res.dossier, fini: false, poids: 1, onglet, titreShell: '', derniereSortie: 0 };
    volets.set(res.id, volet);
    onglet.volets.push(volet);

    term.onData((data) => window.atelier.ecrireTerminal(volet.id, data));
    term.onResize(({ cols, rows }) => window.atelier.tailleTerminal(volet.id, cols, rows));
    term.onTitleChange((t) => { volet.titreShell = t; majTitre(onglet); });
    term.onSelectionChange(() => {
      if (r().copierSelection && term.hasSelection()) window.atelier.copier(term.getSelection()).catch(() => {});
    });
    term.attachCustomKeyEventHandler((e) => clavier(e, volet));
    elem.addEventListener('focusin', () => { onglet.actif = volet; majActif(onglet); });
    elem.addEventListener('mousedown', () => { onglet.actif = volet; majActif(onglet); });
    // Les raccourcis d'Atelier (Ctrl+N : nouvelle note…) ne doivent pas partir quand on tape ici,
    // sauf ceux de la disposition (Ctrl+Maj+D, Ctrl+Alt+1…) et des réglages (Ctrl+,).
    elem.addEventListener('keydown', (e) => {
      const global = (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') || (e.ctrlKey && e.altKey) || (e.ctrlKey && e.key === ',');
      if (!global) e.stopPropagation();
    });
    elem.addEventListener('contextmenu', (e) => { e.preventDefault(); menuVolet(e, volet); });

    onglet.actif = volet;
    majPoids(onglet);
    majTitre(onglet);
    majActif(onglet);
    requestAnimationFrame(() => { ajuster(); term.focus(); });
    return volet;
  }

  // La poignée entre deux volets : glisser pour partager la place.
  function separateur(onglet) {
    const s = el('div', { className: 'term-separateur' });
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const avant = onglet.volets.find((v) => v.elem === s.previousElementSibling);
      const apres = onglet.volets.find((v) => v.elem === s.nextElementSibling);
      if (!avant || !apres) return;
      const ligne = onglet.direction === 'ligne';
      const total = avant.poids + apres.poids;
      const ra = avant.elem.getBoundingClientRect();
      const rb = apres.elem.getBoundingClientRect();
      const debut = ligne ? ra.left : ra.top;
      const taille = ligne ? rb.right - ra.left : rb.bottom - ra.top;
      const vue = s.ownerDocument.defaultView;
      const bouger = (ev) => {
        const f = Math.min(Math.max(((ligne ? ev.clientX : ev.clientY) - debut) / taille, 0.1), 0.9);
        avant.poids = total * f;
        apres.poids = total * (1 - f);
        majPoids(onglet);
      };
      const lacher = () => { vue.removeEventListener('pointermove', bouger); vue.removeEventListener('pointerup', lacher); ajuster(); };
      vue.addEventListener('pointermove', bouger);
      vue.addEventListener('pointerup', lacher);
    });
    return s;
  }

  function majPoids(onglet) {
    onglet.vue.classList.toggle('colonne', onglet.direction === 'colonne');
    for (const v of onglet.volets) v.elem.style.flex = `${v.poids} 1 0`;
    ajuster();
  }

  async function diviser(onglet = ongletActif, direction = 'ligne') {
    if (!onglet) return nouvelOnglet();
    if (onglet.volets.length >= 4) { notify('Quatre volets au plus par onglet : ouvre un nouvel onglet.', 'info'); return; }
    if (onglet.volets.length === 1) onglet.direction = direction;
    const modele = onglet.actif || onglet.volets[0];
    await nouveauVolet(onglet, modele?.shell.id || r().shell, modele?.dossier || dossierParDefaut()).catch((err) => notify(err.message, 'error'));
  }

  function majTitre(onglet) {
    const v = onglet.volets[0];
    if (!onglet.perso) {
      onglet.titre = v ? `${v.shell.nom} · ${nomDossier(v.dossier)}` : 'Terminal';
      if (onglet.volets.length > 1) onglet.titre += ` (+${onglet.volets.length - 1})`;
    }
    onglet.onglet.querySelector('.nom').textContent = onglet.titre;
    onglet.onglet.title = onglet.volets.map((x) => `${x.shell.nom} : ${x.titreShell || x.dossier}`).join('\n');
    onglet.onglet.classList.toggle('fini', onglet.volets.length > 0 && onglet.volets.every((x) => x.fini));
  }

  function majActif(onglet) {
    for (const v of onglet.volets) v.elem.classList.toggle('actif', onglet.volets.length > 1 && v === onglet.actif);
  }

  function activer(onglet) {
    ongletActif = onglet;
    for (const o of onglets) {
      o.vue.hidden = o !== onglet;
      o.onglet.classList.toggle('actif', o === onglet);
    }
    ajuster();
    onglet.actif?.term.focus();
  }

  function fermerVolet(volet) {
    const onglet = volet.onglet;
    if (!volet.fini) window.atelier.fermerTerminal(volet.id);
    volets.delete(volet.id);
    const sep = volet.elem.previousElementSibling?.classList.contains('term-separateur') ? volet.elem.previousElementSibling : volet.elem.nextElementSibling;
    if (sep?.classList.contains('term-separateur')) sep.remove();
    volet.term.dispose();
    volet.elem.remove();
    onglet.volets = onglet.volets.filter((v) => v !== volet);
    if (!onglet.volets.length) return fermerOnglet(onglet);
    onglet.actif = onglet.volets[0];
    majPoids(onglet);
    majTitre(onglet);
    majActif(onglet);
    onglet.actif.term.focus();
  }

  function fermerOnglet(onglet) {
    for (const v of onglet.volets) {
      if (!v.fini) window.atelier.fermerTerminal(v.id);
      volets.delete(v.id);
      v.term.dispose();
    }
    const i = onglets.indexOf(onglet);
    if (i >= 0) onglets.splice(i, 1);
    onglet.onglet.remove();
    onglet.vue.remove();
    if (ongletActif === onglet) {
      const suivant = onglets[Math.min(i, onglets.length - 1)];
      ongletActif = null;
      if (suivant) activer(suivant);
    }
    majVide();
  }

  async function renommer(onglet) {
    const v = await Dialogs.form({ title: 'Renommer l\'onglet', okLabel: 'Renommer', width: 380, fields: [{ key: 'nom', label: 'Nom', type: 'text', value: onglet.titre, placeholder: 'Vide = nom automatique' }] });
    if (!v) return;
    onglet.perso = Boolean(v.nom.trim());
    onglet.titre = v.nom.trim();
    majTitre(onglet);
  }

  // Rien d'ouvert : un message et un bouton, plutôt qu'un grand vide.
  function majVide() {
    const vide = !onglets.length;
    widget.classList.toggle('vide', vide);
    vuesEl.querySelector('.term-accueil')?.remove();
    if (!vide) return;
    const b = el('button', { className: 'button primary', textContent: 'Ouvrir un terminal' });
    b.onclick = () => nouvelOnglet().catch((err) => notify(err.message, 'error'));
    vuesEl.append(el('div', { className: 'term-accueil' }, el('i', { className: 'codicon codicon-terminal' }), b,
      el('p', { className: 'discret', textContent: shells.length ? `Shells trouvés : ${shells.map((s) => s.nom).join(', ')}.` : '' })));
  }

  // Les volets suivent la taille du widget (fenêtre redimensionnée, disposition changée, détaché…).
  let ajustement = 0;
  function ajuster() {
    cancelAnimationFrame(ajustement);
    ajustement = requestAnimationFrame(() => {
      if (!ongletActif || widget.hidden) return;
      for (const v of ongletActif.volets) {
        if (!v.zone.clientWidth || !v.zone.clientHeight) continue;
        try { v.fit.fit(); } catch {}
      }
    });
  }
  // Un ResizeObserver de la fenêtre où se trouve le widget (il change quand on le détache).
  let observateur = null;
  function observer() {
    observateur?.disconnect();
    observateur = new (vueDe().ResizeObserver)(ajuster);
    observateur.observe(vuesEl);
  }

  // --- Clavier ---
  const volet = () => ongletActif?.actif;
  async function coller(v = volet()) {
    if (!v) return;
    const texte = await window.atelier.lirePressePapiers();
    if (texte) v.term.paste(texte);
    v.term.focus();
  }
  function copier(v = volet()) {
    if (!v?.term.hasSelection()) return false;
    window.atelier.copier(v.term.getSelection()).catch((err) => notify(cleanError(err), 'error'));
    v.term.clearSelection();
    return true;
  }

  function clavier(e, v) {
    if (e.type !== 'keydown') return true;
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    // Ctrl+C : copier s'il y a une sélection ; sinon le terminal reçoit Ctrl+C (interrompre).
    if (ctrl && !e.shiftKey && k === 'c' && v.term.hasSelection()) { e.preventDefault(); copier(v); return false; }
    if (ctrl && e.shiftKey && k === 'c') { e.preventDefault(); copier(v); return false; }
    if (ctrl && k === 'v') { e.preventDefault(); coller(v); return false; }
    if (e.shiftKey && !e.ctrlKey && e.key === 'Insert') { e.preventDefault(); coller(v); return false; }
    if (ctrl && !e.shiftKey && k === 'f') { e.preventDefault(); ouvrirRecherche(v); return false; }
    if (ctrl && e.shiftKey && k === 't') { e.preventDefault(); nouvelOnglet(v.shell.id).catch((err) => notify(err.message, 'error')); return false; }
    if (ctrl && e.shiftKey && k === 'w') { e.preventDefault(); fermerVolet(v); return false; }
    if (ctrl && e.key === 'Tab') { e.preventDefault(); changerOnglet(e.shiftKey ? -1 : 1); return false; }
    if (e.altKey && e.shiftKey && !e.ctrlKey && (e.key === '+' || e.key === '=' || e.code === 'Equal')) { e.preventDefault(); diviser(v.onglet, 'ligne'); return false; }
    if (e.altKey && e.shiftKey && !e.ctrlKey && (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'Digit6')) { e.preventDefault(); diviser(v.onglet, 'colonne'); return false; }
    return true;
  }

  function changerOnglet(sens) {
    if (onglets.length < 2) return;
    const ordre = [...ongletsEl.children].map((n) => onglets.find((o) => o.onglet === n)).filter(Boolean);
    const i = ordre.indexOf(ongletActif);
    activer(ordre[(i + sens + ordre.length) % ordre.length]);
  }

  function menuVolet(e, v) {
    const sel = v.term.hasSelection();
    ouvrirMenu(e.clientX, e.clientY, [
      ['Copier', sel ? () => copier(v) : null],
      ['Coller', () => coller(v)],
      ['Tout sélectionner', () => v.term.selectAll()],
      ['Chercher…', () => ouvrirRecherche(v)],
      ['Effacer l\'écran', () => v.term.clear()],
      null,
      [sel ? 'Demander à Loki (la sélection)' : 'Demander à Loki (les dernières lignes)', () => demanderALoki(v)],
      null,
      ['Diviser à droite', () => diviser(v.onglet, 'ligne')],
      ['Diviser en bas', () => diviser(v.onglet, 'colonne')],
      [v.onglet.volets.length > 1 ? 'Fermer ce volet' : 'Fermer l\'onglet', () => fermerVolet(v)],
    ], e.target.ownerDocument);
  }

  // --- Recherche (Ctrl+F) ---
  function ouvrirRecherche(v = volet()) {
    if (!v) return;
    let barre = v.elem.querySelector('.term-recherche');
    if (!barre) {
      const champ = el('input', { type: 'text', placeholder: 'Chercher', spellcheck: false });
      const compte = el('span', { className: 'discret compte' });
      const opt = (icone, titre) => el('button', { className: 'icon-button option', title: titre }, el('i', { className: `codicon codicon-${icone}` }));
      const casse = opt('case-sensitive', 'Respecter les majuscules');
      const regex = opt('regex', 'Expression régulière');
      const prec = opt('arrow-up', 'Précédent (Maj+Entrée)');
      const suiv = opt('arrow-down', 'Suivant (Entrée)');
      const fermer = opt('close', 'Fermer (Échap)');
      barre = el('div', { className: 'term-recherche' }, champ, compte, casse, regex, prec, suiv, fermer);
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5fd4a8';
      const options = () => ({
        caseSensitive: casse.classList.contains('actif'),
        regex: regex.classList.contains('actif'),
        decorations: { matchBackground: '#ffffff30', matchOverviewRuler: '#888888', activeMatchBackground: `${accent}aa`, activeMatchColorOverviewRuler: accent },
      });
      const chercher = (avant = false) => {
        if (!champ.value) { v.recherche.clearDecorations(); compte.textContent = ''; return; }
        try {
          if (avant) v.recherche.findPrevious(champ.value, options());
          else v.recherche.findNext(champ.value, { ...options(), incremental: true });
        } catch { compte.textContent = 'expression invalide'; }
      };
      v.recherche.onDidChangeResults(({ resultIndex, resultCount }) => {
        compte.textContent = !champ.value ? '' : resultCount ? `${resultIndex + 1}/${resultCount}` : 'aucun';
      });
      for (const b of [casse, regex]) b.onclick = () => { b.classList.toggle('actif'); chercher(); };
      champ.oninput = () => chercher();
      prec.onclick = () => chercher(true);
      suiv.onclick = () => v.recherche.findNext(champ.value, options());
      const fermerBarre = () => { v.recherche.clearDecorations(); barre.remove(); v.term.focus(); };
      fermer.onclick = fermerBarre;
      champ.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) chercher(true); else v.recherche.findNext(champ.value, options()); }
        if (e.key === 'Escape') { e.preventDefault(); fermerBarre(); }
      });
      v.elem.append(barre);
      if (v.term.hasSelection()) champ.value = v.term.getSelection().split('\n')[0];
    }
    const champ = barre.querySelector('input');
    champ.focus();
    champ.select();
  }

  // --- Lire ce qu'affiche un volet (pour Loki) ---
  function lignes(v, depuis = null, max = 60) {
    const buf = v.term.buffer.active;
    // Le bas de l'écran est souvent vide : on part de la dernière ligne écrite.
    let fin = buf.length;
    while (fin > 0 && !buf.getLine(fin - 1)?.translateToString(true).trim()) fin--;
    const debut = depuis ?? Math.max(0, fin - max * 3);
    const out = [];
    for (let i = debut; i < fin; i++) {
      const l = buf.getLine(i);
      if (!l) continue;
      // Une ligne trop longue pour la largeur continue sur la suivante (isWrapped) : on les recolle.
      if (l.isWrapped && out.length) out[out.length - 1] += l.translateToString(true);
      else out.push(l.translateToString(true));
    }
    const garde = out.slice(-max);
    while (garde.length && !garde[0].trim()) garde.shift();
    return garde.join('\n');
  }

  async function demanderALoki(v = volet()) {
    if (!v) { notify('Ouvre d\'abord un terminal.', 'info'); return; }
    const texte = v.term.hasSelection() ? v.term.getSelection() : lignes(v, null, 80);
    if (!texte.trim()) { notify('Le terminal est vide.', 'info'); return; }
    const message = `Voici ce qu'affiche mon terminal (${v.shell.nom}, dossier ${v.dossier}). Explique-moi ce qui se passe, surtout s'il y a une erreur, et dis-moi quoi faire :\n\n\`\`\`\n${texte.slice(-6000)}\n\`\`\``;
    Disposition.montrer('claude');
    await ClaudeWidget.envoyerDepuis(message);
  }

  // --- Commandes favorites ---
  function afficherFavoris() {
    favorisEl.hidden = !r().favorisVisibles;
    $('#btn-term-favoris').classList.toggle('actif', r().favorisVisibles);
    favorisEl.replaceChildren(...donnees.favoris.map((f) => {
      const b = el('button', { className: 'term-favori', title: `${f.commande}${f.entree === false ? '' : ' ⏎'}${f.nouvelOnglet ? '\n(dans un nouvel onglet)' : ''}\nClic droit : modifier` },
        el('i', { className: `codicon codicon-${f.nouvelOnglet ? 'add' : 'play'}` }), el('span', { textContent: f.nom || f.commande }));
      b.onclick = () => lancerFavori(f).catch((err) => notify(cleanError(err), 'error'));
      b.oncontextmenu = (e) => {
        e.preventDefault();
        const i = donnees.favoris.indexOf(f);
        const bouger = (d) => () => { donnees.favoris.splice(i, 1); donnees.favoris.splice(i + d, 0, f); enregistrer(); afficherFavoris(); };
        ouvrirMenu(e.clientX, e.clientY, [
          ['Lancer', () => lancerFavori(f)],
          ['Lancer dans un nouvel onglet', () => lancerFavori({ ...f, nouvelOnglet: true })],
          null,
          ['Modifier…', () => editerFavori(f)],
          ['Vers la gauche', i > 0 ? bouger(-1) : null],
          ['Vers la droite', i < donnees.favoris.length - 1 ? bouger(1) : null],
          ['Supprimer', () => { donnees.favoris.splice(i, 1); enregistrer(); afficherFavoris(); }],
        ], e.target.ownerDocument);
      };
      return b;
    }), (() => {
      const plus = el('button', { className: 'term-favori ajouter', title: 'Ajouter une commande favorite' }, el('i', { className: 'codicon codicon-add' }), el('span', { textContent: donnees.favoris.length ? '' : 'Commande favorite' }));
      plus.onclick = () => editerFavori(null);
      return plus;
    })());
  }

  async function lancerFavori(f) {
    let v = volet();
    if (f.nouvelOnglet || !v || v.fini) {
      const onglet = await nouvelOnglet(f.shell || r().shell, f.dossier || dossierParDefaut());
      v = onglet.actif;
    }
    window.atelier.ecrireTerminal(v.id, `${f.commande}${f.entree === false ? '' : '\r'}`);
    v.term.focus();
  }

  async function editerFavori(f) {
    const nouveau = !f;
    const v = await Dialogs.form({
      title: nouveau ? 'Nouvelle commande favorite' : 'Modifier la commande favorite',
      okLabel: nouveau ? 'Ajouter' : 'Enregistrer',
      width: 520,
      fields: [
        { key: 'nom', label: 'Nom du bouton', type: 'text', value: f?.nom || '', placeholder: 'Serveur, Journaux, Redémarrer…' },
        { key: 'commande', label: 'Commande', type: 'text', value: f?.commande || '', placeholder: 'ssh moi@mon-serveur   ·   journalctl -u monsite -f' },
        { key: 'entree', label: 'Appuyer sur Entrée tout de suite (sinon, la commande attend que tu la complètes)', type: 'checkbox', value: f?.entree !== false },
        { key: 'nouvelOnglet', label: 'Toujours dans un nouvel onglet', type: 'checkbox', value: Boolean(f?.nouvelOnglet) },
        { key: 'shell', label: 'Shell (nouvel onglet)', type: 'select', choices: [['', 'Celui par défaut'], ...shells.map((s) => [s.id, s.nom])], value: f?.shell || '' },
        { key: 'dossier', label: 'Dossier (nouvel onglet)', type: 'text', value: f?.dossier || '', placeholder: 'Vide = dossier de départ habituel' },
      ],
    });
    if (!v || !v.commande.trim()) return;
    const fav = { id: f?.id || crypto.randomUUID(), nom: v.nom.trim(), commande: v.commande.trim(), entree: v.entree, nouvelOnglet: v.nouvelOnglet, shell: v.shell, dossier: v.dossier.trim() };
    if (nouveau) donnees.favoris.push(fav);
    else donnees.favoris.splice(donnees.favoris.indexOf(f), 1, fav);
    donnees.reglages.favorisVisibles = true;
    enregistrer();
    afficherFavoris();
  }

  // --- Réglages du widget ---
  async function reglages() {
    const v = await Dialogs.form({
      title: 'Réglages du terminal',
      okLabel: 'Enregistrer',
      width: 500,
      fields: [
        { key: 'shell', label: 'Shell par défaut', type: 'select', choices: shells.map((s) => [s.id, s.nom]), value: r().shell || shells[0]?.id },
        { key: 'dossier', label: 'Dossier de départ', type: 'text', value: r().dossier, placeholder: config.dossierProjets ? `Vide = ${config.dossierProjets}` : 'Vide = ton dossier perso' },
        { key: 'taille', label: 'Taille du texte', type: 'range', min: 9, max: 24, step: 1, value: r().taille, unit: 'px' },
        { key: 'police', label: 'Police', type: 'text', value: r().police },
        { key: 'lignes', label: 'Lignes gardées', type: 'range', min: 1000, max: 50000, step: 1000, value: r().lignes },
        { key: 'copierSelection', label: 'Copier dès que je sélectionne du texte', type: 'checkbox', value: r().copierSelection },
        { key: 'favorisVisibles', label: 'Afficher la barre des commandes favorites', type: 'checkbox', value: r().favorisVisibles },
        { type: 'info', text: 'Raccourcis : Ctrl+C copie la sélection (sans sélection : interrompt), Ctrl+V colle, Ctrl+F cherche, Ctrl+Maj+T nouvel onglet, Ctrl+Maj+W ferme, Ctrl+Tab onglet suivant, Alt+Maj+= / Alt+Maj+- divise, Ctrl+clic ouvre un lien.' },
      ],
    });
    if (!v) return;
    donnees.reglages = { ...r(), ...v, taille: Number(v.taille) || REGLAGES.taille, lignes: Number(v.lignes) || REGLAGES.lignes, police: v.police.trim() || REGLAGES.police, dossier: v.dossier.trim() };
    enregistrer();
    appliquer();
  }

  function appliquer() {
    for (const v of volets.values()) {
      v.term.options.fontSize = r().taille;
      v.term.options.fontFamily = r().police;
      v.term.options.scrollback = r().lignes;
      v.term.options.theme = theme();
    }
    afficherFavoris();
    ajuster();
  }

  // Le choix du shell, sous la flèche à côté du « + ».
  function menuShells(x, y) {
    ouvrirMenu(x, y, [
      'Nouvel onglet',
      ...shells.map((s) => [s.nom, () => nouvelOnglet(s.id).catch((err) => notify(err.message, 'error')), s.id === (r().shell || shells[0]?.id)]),
      null,
      ['Réglages du terminal…', reglages],
    ], widget.ownerDocument);
  }

  // --- Sortie des processus ---
  window.atelier.onTerminalDonnees((id, data) => {
    const v = volets.get(id);
    if (!v) return;
    v.derniereSortie = Date.now();
    v.term.write(data);
  });
  window.atelier.onTerminalFin((id, code) => {
    const v = volets.get(id);
    if (!v) return;
    v.fini = true;
    v.elem.classList.add('fini');
    v.term.write(`\r\n\x1b[90m[Terminé (code ${code}). Ctrl+Maj+W ferme ce volet.]\x1b[0m\r\n`);
    majTitre(v.onglet);
  });

  // --- Pour Loki (actions terminal_lire et terminal_executer, voir claude.js) ---
  const pourLoki = {
    lire(a = {}) {
      const v = volet();
      if (!v) throw new Error('Aucun terminal n\'est ouvert dans le widget Terminal.');
      const n = Math.min(Math.max(Number(a.lignes) || 60, 1), 300);
      return `Shell : ${v.shell.nom}, dossier de départ : ${v.dossier}${v.titreShell ? `, titre : ${v.titreShell}` : ''}${v.fini ? ' (processus terminé)' : ''}\n\n${lignes(v, null, n) || '(vide)'}`;
    },
    async executer(a = {}) {
      const commande = String(a.commande || '').replace(/[\r\n]+$/, '');
      if (!commande.trim()) throw new Error('Commande vide');
      let v = volet();
      if (a.nouvel_onglet || !v || v.fini) v = (await nouvelOnglet(r().shell, a.dossier || dossierParDefaut())).actif;
      else Disposition.montrer('terminal');
      activer(v.onglet);
      const buf = v.term.buffer.active;
      const depart = buf.baseY + buf.cursorY;
      const debut = Date.now();
      v.derniereSortie = debut;
      window.atelier.ecrireTerminal(v.id, `${commande}\r`);
      // On attend que la sortie se calme (1,5 s sans rien de nouveau), ou la limite.
      const limite = Math.min(Math.max(Number(a.attendre) || 5, 1), 50) * 1000;
      await new Promise((resolve) => {
        const t = setInterval(() => {
          const calme = Date.now() - v.derniereSortie > 1500 && Date.now() - debut > 800;
          if (calme || Date.now() - debut > limite || v.fini) { clearInterval(t); resolve(); }
        }, 200);
      });
      const sortie = lignes(v, depart, 200);
      const encore = Date.now() - v.derniereSortie < 1500;
      return `Commande lancée dans ${v.shell.nom}.${encore ? ' Elle affiche encore des choses (elle tourne peut-être toujours).' : ''}\n\n${sortie.slice(-5000) || '(rien affiché)'}`;
    },
  };

  // --- Démarrage ---
  async function start(c) {
    config = c;
    const lu = await window.atelier.lireDonnees('terminal', null);
    if (lu) donnees = { favoris: [], ...lu, reglages: { ...REGLAGES, ...lu.reglages } };
    try { shells = await window.atelier.shellsTerminal(); } catch (err) { notify(cleanError(err), 'error'); }
    if (!shells.some((s) => s.id === r().shell)) r().shell = shells[0]?.id || '';
    $('#btn-term-nouveau').onclick = () => nouvelOnglet().catch((err) => notify(err.message, 'error'));
    $('#btn-term-shells').onclick = (e) => { const b = e.currentTarget.getBoundingClientRect(); menuShells(b.left, b.bottom + 4); };
    $('#btn-term-diviser').onclick = () => diviser(ongletActif, 'ligne');
    $('#btn-term-diviser-bas').onclick = () => diviser(ongletActif, 'colonne');
    $('#btn-term-chercher').onclick = () => ouvrirRecherche();
    $('#btn-term-loki').onclick = () => demanderALoki().catch((err) => notify(cleanError(err), 'error'));
    $('#btn-term-favoris').onclick = () => { r().favorisVisibles = !r().favorisVisibles; enregistrer(); afficherFavoris(); ajuster(); };
    $('#btn-term-reglages').onclick = reglages;
    afficherFavoris();
    majVide();
    observer();
    // Détaché ou ramené : xterm doit savoir dans quelle fenêtre il dessine maintenant.
    widget.addEventListener('bloc:deplace', () => {
      for (const v of volets.values()) v.term.open(v.zone);
      observer();
      ajuster();
    });
  }

  return {
    start,
    nouvelOnglet: (dossier) => nouvelOnglet(r().shell, dossier),
    pourLoki,
    reglagesAtelier(c) { config = c; },
    themeChange: appliquer,
  };
})();
