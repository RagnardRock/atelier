// La disposition d'Atelier : où se trouve chaque bloc (la colonne Outils et chaque widget), sa taille,
// s'il est caché ou détaché dans sa propre fenêtre.
//
// - La fenêtre est une grille de 24 colonnes. La hauteur d'une rangée est calculée pour que 12 rangées
//   remplissent la fenêtre ; on peut en mettre plus, la page défile alors.
// - Bouton « Disposition » de la barre de titre (ou Ctrl+Maj+D) : mode édition. On déplace un bloc en
//   le glissant, on change sa taille avec ses bords et ses coins, on le cache (œil) ou on le détache.
//   Les blocs poussés vers le bas laissent la place ; « Tasser vers le haut » remonte tout dans les trous.
// - Plusieurs dispositions enregistrées (par exemple « Écran large » et « Portable ») : on passe de
//   l'une à l'autre par le menu du bouton (clic droit) ou Ctrl+Alt+1…9.
// - Détacher : le bloc part dans sa propre fenêtre Windows, qu'on peut mettre sur un autre écran ou
//   garder au-dessus des autres fenêtres. C'est le même bloc, déplacé (pas une copie) : son code tourne
//   toujours ici, il ne perd rien. Fermer sa fenêtre le ramène dans Atelier. Il se rouvre détaché au
//   prochain démarrage.
// - Fenêtre étroite (moins de 900 px de large) : les blocs passent les uns sous les autres, dans l'ordre.
//
// Enregistré dans %APPDATA%\atelier-hub\disposition.json. config.widgets (lu par Loki) est tenu à jour.

const Disposition = (() => {
  const COLS = 24;
  const RANGEES = 12;   // rangées qui remplissent la hauteur de la fenêtre
  const ETROIT = 900;   // en dessous (px), les blocs s'empilent
  const grille = $('#layout');

  // Les blocs : clé, nom, élément, icône, taille minimale (colonnes × rangées), place par défaut.
  // Un nouveau widget s'ajoute ici (et dans index.html, et dans WIDGETS de ../claude.js pour Loki).
  const BLOCS = [
    { cle: 'outils', nom: 'Outils', sel: '#outils', icone: 'tools', min: [4, 4], defaut: { x: 0, y: 0, w: 5, h: 12 } },
    { cle: 'notes', nom: 'Notes', sel: '#widget-notes', icone: 'note', min: [6, 3], defaut: { x: 5, y: 0, w: 10, h: 6 } },
    { cle: 'projets', nom: 'Projets récents', sel: '#widget-projets', icone: 'repo', min: [4, 3], defaut: { x: 15, y: 0, w: 9, h: 6 } },
    { cle: 'terminal', nom: 'Terminal', sel: '#widget-terminal', icone: 'terminal', min: [5, 3], defaut: { x: 5, y: 6, w: 10, h: 6 } },
    { cle: 'claude', nom: 'Loki', sel: '#widget-claude', icone: 'sparkle', min: [4, 4], defaut: { x: 15, y: 6, w: 9, h: 6 } },
    { cle: 'calendrier', nom: 'Calendrier', sel: '#widget-calendrier', icone: 'calendar', min: [5, 4], defaut: { x: 5, y: 12, w: 7, h: 6 } },
    { cle: 'calculatrice', nom: 'Calculatrice', sel: '#widget-calculatrice', icone: 'symbol-operator', min: [4, 4], defaut: { x: 12, y: 12, w: 6, h: 6 } },
    { cle: 'pressePapiers', nom: 'Presse-papiers et couleurs', sel: '#widget-presse-papiers', icone: 'clippy', min: [4, 2], defaut: { x: 18, y: 12, w: 6, h: 3 } },
    { cle: 'minuteurs', nom: 'Minuteurs', sel: '#widget-minuteurs', icone: 'watch', min: [4, 2], defaut: { x: 18, y: 15, w: 6, h: 3 } },
  ];
  const BLOC = Object.fromEntries(BLOCS.map((b) => [b.cle, b]));
  const elements = Object.fromEntries(BLOCS.map((b) => [b.cle, $(b.sel)]));

  // { active, dispositions: [{ id, nom, tasser, blocs: { cle: { x, y, w, h, cache } } }], detaches: { cle: true }, bornes: { cle: { x, y, width, height, devant } } }
  let donnees = null;
  let edition = false;
  let etroit = false;
  let fermetureAtelier = false; // Atelier se ferme ou se recharge : les fenêtres détachées le restent
  const fenetres = new Map();   // cle -> window de la fenêtre détachée

  const active = () => donnees.dispositions.find((d) => d.id === donnees.active) || donnees.dispositions[0];
  const blocsDe = (d = active()) => d.blocs;
  const visible = (cle) => !blocsDe()[cle]?.cache && !donnees.detaches[cle];

  function dispositionParDefaut(nom = 'Par défaut', widgetsCaches = {}) {
    const blocs = {};
    for (const b of BLOCS) blocs[b.cle] = { ...b.defaut, ...(widgetsCaches[b.cle] === false ? { cache: true } : {}) };
    return { id: crypto.randomUUID(), nom, tasser: false, blocs };
  }

  // Un bloc ajouté dans une version plus récente d'Atelier : il prend la première place libre.
  function completer(d) {
    for (const b of BLOCS) {
      if (d.blocs[b.cle]) continue;
      d.blocs[b.cle] = { ...placeLibre(d, b.defaut.w, b.defaut.h) };
    }
  }

  // --- Calcul des places ---
  const chevauche = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  // Les blocs qui occupent la grille (ni cachés ni détachés), comme liste { cle, x, y, w, h }.
  function occupants(blocs, sauf) {
    return BLOCS.filter((b) => b.cle !== sauf && blocs[b.cle] && !blocs[b.cle].cache && !donnees.detaches[b.cle])
      .map((b) => ({ cle: b.cle, ...pick(blocs[b.cle]) }));
  }
  const pick = ({ x, y, w, h }) => ({ x, y, w, h });

  function placeLibre(d, w, h) {
    const autres = occupants(d.blocs);
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x + w <= COLS; x++) {
        const essai = { x, y, w, h };
        if (!autres.some((a) => chevauche(a, essai))) return essai;
      }
    }
    return { x: 0, y: 0, w, h };
  }

  // Le bloc « prioritaire » garde sa place ; les autres qui le gênent descendent (en cascade).
  // Avec « tasser », tout remonte ensuite dans les trous.
  function resoudre(liste, prioritaire, tasser) {
    const places = prioritaire ? [prioritaire] : [];
    const autres = liste.filter((i) => i !== prioritaire).sort((a, b) => a.y - b.y || a.x - b.x);
    for (const it of autres) {
      let bouge = true;
      while (bouge) {
        bouge = false;
        for (const p of places) if (chevauche(it, p)) { it.y = p.y + p.h; bouge = true; }
      }
      places.push(it);
    }
    if (tasser) {
      const faits = [];
      for (const it of [...liste].sort((a, b) => a.y - b.y || a.x - b.x)) {
        while (it.y > 0 && !faits.some((f) => chevauche(f, { ...it, y: it.y - 1 }))) it.y--;
        faits.push(it);
      }
    }
    return liste;
  }

  // --- Affichage ---
  function rangee() {
    const cs = getComputedStyle(grille);
    const gap = parseFloat(cs.rowGap) || 12;
    const hauteur = grille.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return Math.max(24, (hauteur - gap * (RANGEES - 1)) / RANGEES);
  }

  // Taille d'une case (avec l'espace entre deux cases), en pixels.
  function pas() {
    const cs = getComputedStyle(grille);
    const gap = parseFloat(cs.columnGap) || 12;
    const largeur = grille.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return { px: (largeur - gap * (COLS - 1)) / COLS + gap, py: rangee() + gap };
  }

  function placer(cle, p) {
    const e = elements[cle];
    e.style.gridColumn = `${p.x + 1} / span ${p.w}`;
    e.style.gridRow = `${p.y + 1} / span ${p.h}`;
  }

  function afficher() {
    if (!donnees) return;
    etroit = grille.clientWidth > 0 && grille.clientWidth < ETROIT;
    grille.classList.toggle('etroit', etroit);
    grille.style.setProperty('--rang', `${rangee()}px`);
    const blocs = blocsDe();
    // En étroit : les uns sous les autres, dans l'ordre de lecture (haut → bas, gauche → droite).
    const ordre = occupants(blocs).sort((a, b) => a.y - b.y || a.x - b.x).map((o) => o.cle);
    for (const b of BLOCS) {
      const e = elements[b.cle];
      if (!e) continue;
      if (fenetres.has(b.cle)) continue; // dans sa fenêtre
      e.hidden = !visible(b.cle);
      const p = blocs[b.cle];
      if (etroit) {
        e.style.gridColumn = '1 / -1';
        e.style.gridRow = `auto / span ${Math.min(Math.max(p.h, 5), 9)}`;
        e.style.order = String(ordre.indexOf(b.cle));
      } else {
        e.style.order = '';
        placer(b.cle, p);
      }
      e.querySelector(':scope > .bloc-edition .bloc-taille')?.replaceChildren(`${p.w} × ${p.h}`);
    }
    $('#btn-disposition').title = `Disposition : ${active().nom} (Ctrl+Maj+D pour la modifier, clic droit pour en changer)`;
    synchroniserWidgets();
  }

  // config.widgets (Loki dit quels widgets sont cachés) suit la disposition affichée.
  let dernierWidgets = '';
  function synchroniserWidgets() {
    const widgets = Object.fromEntries(BLOCS.filter((b) => b.cle !== 'outils').map((b) => [b.cle, !blocsDe()[b.cle]?.cache]));
    const json = JSON.stringify(widgets);
    if (json === dernierWidgets) return;
    dernierWidgets = json;
    window.atelier.writeConfig({ widgets }).catch(() => {});
  }

  let minuteurEcrire = null;
  function enregistrer() {
    clearTimeout(minuteurEcrire);
    minuteurEcrire = setTimeout(() => window.atelier.ecrireDonnees('disposition', donnees).catch((err) => notify(cleanError(err), 'error')), 300);
  }

  // --- Mode édition ---
  const barre = $('#disposition-barre');
  const choix = $('#disposition-choix');

  function remplirChoix() {
    choix.replaceChildren(...donnees.dispositions.map((d) => el('option', { value: d.id, textContent: d.nom, selected: d.id === donnees.active })));
    $('#disposition-tasser').checked = Boolean(active().tasser);
    $('#btn-disposition-supprimer').disabled = donnees.dispositions.length < 2;
  }

  function basculerEdition(oui = !edition) {
    if (oui && etroit) {
      notify('La fenêtre est trop étroite pour modifier la disposition : agrandis-la un peu.', 'info', 5000);
      return;
    }
    edition = oui;
    document.body.classList.toggle('edition-disposition', oui);
    $('#btn-disposition').classList.toggle('actif', oui);
    barre.hidden = !oui;
    for (const b of BLOCS) {
      const e = elements[b.cle];
      e.querySelector(':scope > .bloc-edition')?.remove();
      if (oui) e.append(calqueEdition(b));
    }
    if (oui) remplirChoix();
    afficher();
  }

  // Le calque posé sur un bloc en mode édition : on le glisse, on tire ses bords.
  function calqueEdition(b) {
    const calque = el('div', { className: 'bloc-edition' },
      el('div', { className: 'bloc-nom' }, el('i', { className: `codicon codicon-${b.icone}` }), el('span', { textContent: b.nom })),
      el('div', { className: 'bloc-taille discret' }));
    const boutons = el('div', { className: 'bloc-boutons' });
    const bouton = (icone, titre, run) => {
      const x = el('button', { className: 'icon-button', title: titre }, el('i', { className: `codicon codicon-${icone}` }));
      x.addEventListener('pointerdown', (e) => e.stopPropagation());
      x.onclick = run;
      boutons.append(x);
    };
    bouton('link-external', 'Détacher dans sa propre fenêtre', () => detacher(b.cle).catch((err) => notify(cleanError(err), 'error')));
    bouton('eye-closed', 'Cacher (le remettre avec « Ajouter un bloc »)', () => cacher(b.cle, true));
    calque.append(boutons);
    for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const poignee = el('div', { className: `poignee poignee-${dir}` });
      poignee.addEventListener('pointerdown', (e) => glisser(e, b.cle, dir));
      calque.append(poignee);
    }
    calque.addEventListener('pointerdown', (e) => glisser(e, b.cle, null));
    return calque;
  }

  // Glisser un bloc (dir = null) ou un de ses bords (dir = 'n', 'se'…).
  function glisser(e, cle, dir) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const elem = elements[cle];
    const b = BLOC[cle];
    const d = active();
    const depart = { ...d.blocs[cle] };
    const { px, py } = pas();
    const sx = e.clientX;
    const sy = e.clientY;
    const scroll0 = grille.scrollTop;
    const fantome = el('div', { className: 'bloc-fantome' });
    grille.append(fantome);
    elem.classList.add(dir ? 'redimensionne' : 'glisse');
    let resultat = null;

    const bouger = (ev) => {
      // Près du bas ou du haut de la grille : elle défile, pour aller plus loin.
      const r = grille.getBoundingClientRect();
      if (ev.clientY > r.bottom - 30) grille.scrollTop += 12;
      else if (ev.clientY < r.top + 20) grille.scrollTop -= 12;
      const dxp = ev.clientX - sx;
      const dyp = ev.clientY - sy + (grille.scrollTop - scroll0);
      const dx = Math.round(dxp / px);
      const dy = Math.round(dyp / py);
      const p = { ...depart };
      if (!dir) {
        p.x = Math.min(Math.max(depart.x + dx, 0), COLS - depart.w);
        p.y = Math.max(depart.y + dy, 0);
        elem.style.transform = `translate(${dxp}px, ${dyp}px)`;
      } else {
        if (dir.includes('e')) p.w = Math.min(Math.max(depart.w + dx, b.min[0]), COLS - depart.x);
        if (dir.includes('s')) p.h = Math.max(depart.h + dy, b.min[1]);
        if (dir.includes('w')) {
          p.x = Math.min(Math.max(depart.x + dx, 0), depart.x + depart.w - b.min[0]);
          p.w = depart.w + depart.x - p.x;
        }
        if (dir.includes('n')) {
          p.y = Math.min(Math.max(depart.y + dy, 0), depart.y + depart.h - b.min[1]);
          p.h = depart.h + depart.y - p.y;
        }
      }
      const moi = { cle, ...p };
      const liste = [moi, ...occupants(d.blocs, cle)];
      resoudre(liste, moi, d.tasser);
      resultat = liste;
      for (const it of liste) if (it.cle !== cle || dir) placer(it.cle, it);
      fantome.style.gridColumn = `${moi.x + 1} / span ${moi.w}`;
      fantome.style.gridRow = `${moi.y + 1} / span ${moi.h}`;
      elem.querySelector(':scope > .bloc-edition .bloc-taille')?.replaceChildren(`${moi.w} × ${moi.h}`);
    };
    const lacher = () => {
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', lacher);
      fantome.remove();
      elem.style.transform = '';
      elem.classList.remove('glisse', 'redimensionne');
      if (resultat) {
        for (const it of resultat) Object.assign(d.blocs[it.cle], pick(it));
        enregistrer();
      }
      afficher();
    };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher);
    bouger(e);
  }

  function cacher(cle, oui) {
    const d = active();
    const p = d.blocs[cle];
    if (!oui && p.cache) {
      // Il revient à sa place si elle est libre, sinon à la première place libre.
      delete p.cache;
      if (occupants(d.blocs, cle).some((a) => chevauche(a, p))) Object.assign(p, placeLibre(d, p.w, p.h));
    } else if (oui) {
      p.cache = true;
      if (d.tasser) resoudre(occupants(d.blocs), null, true).forEach((it) => Object.assign(d.blocs[it.cle], pick(it)));
    }
    if (edition) basculerEdition(true);
    enregistrer();
    afficher();
  }

  // Menu « Ajouter un bloc » : les blocs cachés, et ceux détachés (pour les ramener).
  function menuAjouter(x, y) {
    const items = [];
    for (const b of BLOCS) {
      if (donnees.detaches[b.cle]) items.push([`${b.nom} (détaché) : le ramener`, () => ramener(b.cle)]);
      else if (blocsDe()[b.cle]?.cache) items.push([b.nom, () => cacher(b.cle, false)]);
    }
    if (!items.length) items.push(['Tous les blocs sont déjà affichés', null]);
    ouvrirMenu(x, y, ['Afficher', ...items]);
  }

  function changer(id) {
    if (!donnees.dispositions.some((d) => d.id === id)) return;
    donnees.active = id;
    completer(active());
    enregistrer();
    if (edition) basculerEdition(true);
    afficher();
  }

  async function nouvelle() {
    const v = await Dialogs.form({
      title: 'Nouvelle disposition',
      okLabel: 'Créer',
      width: 400,
      fields: [
        { type: 'info', text: 'Elle part de la disposition actuelle. Tu passes de l\'une à l\'autre avec le menu du bouton Disposition (clic droit) ou Ctrl+Alt+1, 2, 3…' },
        { key: 'nom', label: 'Nom', type: 'text', value: `Disposition ${donnees.dispositions.length + 1}`, placeholder: 'Écran large, Portable, Jeu…' },
      ],
    });
    if (!v?.nom.trim()) return;
    const copie = structuredClone(active());
    copie.id = crypto.randomUUID();
    copie.nom = v.nom.trim();
    donnees.dispositions.push(copie);
    changer(copie.id);
  }

  async function renommer() {
    const d = active();
    const v = await Dialogs.form({ title: 'Renommer la disposition', okLabel: 'Renommer', width: 380, fields: [{ key: 'nom', label: 'Nom', type: 'text', value: d.nom }] });
    if (!v?.nom.trim()) return;
    d.nom = v.nom.trim();
    enregistrer();
    remplirChoix();
    afficher();
  }

  async function supprimer() {
    if (donnees.dispositions.length < 2) return;
    const d = active();
    const ok = await Dialogs.ask('Supprimer la disposition', `Supprimer la disposition « ${d.nom} » ? Les autres sont gardées.`, [{ label: 'Annuler', value: false }, { label: 'Supprimer', value: true, primary: true, danger: true }]);
    if (!ok) return;
    donnees.dispositions = donnees.dispositions.filter((x) => x !== d);
    changer(donnees.dispositions[0].id);
  }

  function reinitialiser() {
    const d = active();
    d.blocs = dispositionParDefaut().blocs;
    enregistrer();
    basculerEdition(true);
  }

  // Menu du bouton Disposition (clic droit) : changer de disposition.
  function menuDispositions(x, y) {
    ouvrirMenu(x, y, [
      'Dispositions',
      ...donnees.dispositions.map((d, i) => [`${d.nom}${i < 9 ? `   Ctrl+Alt+${i + 1}` : ''}`, () => changer(d.id), d.id === donnees.active]),
      null,
      [edition ? 'Terminer la modification' : 'Modifier la disposition…', () => basculerEdition()],
    ]);
  }

  // --- Fenêtres détachées ---
  // Le bloc est DÉPLACÉ dans une fenêtre ouverte par cette page (window.open) : son code reste ici,
  // les autres widgets et Loki lui parlent comme avant. Les styles d'Atelier y sont recopiés.
  const docsDetaches = () => [...fenetres.values()].map((w) => w.document);
  let docActif = document;
  const documentActif = () => (docActif.defaultView && !docActif.defaultView.closed ? docActif : document);

  // Les fenêtres de dialogue et les notifications s'affichent dans la fenêtre où tu es.
  function suivreFocus(doc) {
    docActif = doc;
    if (Dialogs.isOpen()) return;
    const cible = documentActif();
    for (const id of ['modal-root', 'notifications']) {
      const n = document.getElementById(id) || docsDetaches().map((x) => x.getElementById(id)).find(Boolean);
      if (n && n.ownerDocument !== cible) cible.body.append(n);
    }
  }
  window.addEventListener('focus', () => suivreFocus(document));

  async function detacher(cle, ouverture = false) {
    if (fenetres.has(cle)) { fenetres.get(cle).focus(); return; }
    const b = BLOC[cle];
    const elem = elements[cle];
    const r = elem.getBoundingClientRect();
    const bornes = donnees.bornes[cle] || {
      width: Math.round(Math.max(r.width, 360)),
      height: Math.round(Math.max(r.height, 260) + 34),
      x: Math.round(window.screenX + r.left + 30),
      y: Math.round(window.screenY + r.top + 30),
    };
    await window.atelier.preparerFenetreWidget(`widget-${cle}`, { ...bornes, titre: `${b.nom} · Atelier` });
    const win = window.open('', `widget-${cle}`);
    if (!win) throw new Error('La fenêtre n\'a pas pu s\'ouvrir.');
    const doc = win.document;
    doc.title = `${b.nom} · Atelier`;
    doc.documentElement.lang = 'fr';
    for (const lien of document.querySelectorAll('link[rel=stylesheet]')) doc.head.append(el('link', { rel: 'stylesheet', href: lien.href }));
    copierTheme(doc);
    const devant = el('button', { className: 'icon-button', title: 'Garder cette fenêtre au-dessus des autres' }, el('i', { className: 'codicon codicon-pin' }));
    const retour = el('button', { className: 'icon-button', title: 'Ramener dans Atelier' }, el('i', { className: 'codicon codicon-screen-normal' }));
    // La barre de titre : le logo d'Atelier (le nom du widget est déjà sur sa plaque).
    const titre = el('header', { id: 'titlebar' },
      el('span', { id: 'brand' }, el('img', { className: 'logo', src: new URL('atelier.svg', location.href).href, alt: '' }), el('span', { className: 'discret', textContent: 'Atelier' })),
      el('div', { className: 'title-actions' }, devant, retour));
    const corps = el('main', { className: 'fenetre-widget-corps' });
    doc.body.className = `${document.body.className} fenetre-widget`.replace('edition-disposition', '');
    doc.body.replaceChildren(titre, corps);
    elem.querySelector(':scope > .bloc-edition')?.remove();
    corps.append(elem);
    elem.hidden = false;
    elem.style.gridColumn = elem.style.gridRow = elem.style.order = '';
    fenetres.set(cle, win);
    docsEnPlus.add(doc);
    donnees.detaches[cle] = true;

    const majDevant = (oui) => {
      donnees.bornes[cle] = { ...(donnees.bornes[cle] || bornes), devant: oui };
      devant.classList.toggle('actif', oui);
      devant.firstChild.className = `codicon codicon-${oui ? 'pinned' : 'pin'}`;
      window.atelier.fenetreWidgetDevant(`widget-${cle}`, oui);
    };
    devant.onclick = () => { majDevant(!devant.classList.contains('actif')); enregistrer(); };
    if (bornes.devant) majDevant(true);
    retour.onclick = () => ramener(cle);

    brancherDocument(doc);
    win.addEventListener('focus', () => suivreFocus(doc));
    // Les raccourcis (Ctrl+N, Ctrl+F…) sont écoutés sur la page d'Atelier : on les lui transmet.
    doc.addEventListener('keydown', (e) => {
      const copie = new KeyboardEvent('keydown', { key: e.key, code: e.code, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, repeat: e.repeat, bubbles: true, cancelable: true });
      if (!document.dispatchEvent(copie)) e.preventDefault();
    });
    // Sa place et sa taille, retenues pour la prochaine fois (Windows ne prévient pas d'un déplacement).
    // Fermée sans prévenir (Windows n'envoie pas toujours « beforeunload ») : on la voit ici.
    const surveiller = setInterval(() => {
      if (win.closed) { clearInterval(surveiller); if (!fermetureAtelier) ramener(cle, true); return; }
      const n = { x: win.screenX, y: win.screenY, width: win.outerWidth, height: win.outerHeight, devant: Boolean(donnees.bornes[cle]?.devant) };
      const a = donnees.bornes[cle];
      if (!a || a.x !== n.x || a.y !== n.y || a.width !== n.width || a.height !== n.height) { donnees.bornes[cle] = n; enregistrer(); }
    }, 1000);
    win.addEventListener('beforeunload', () => { clearInterval(surveiller); if (!fermetureAtelier) ramener(cle, true); });

    elem.dispatchEvent(new CustomEvent('bloc:deplace', { detail: { doc } }));
    afficher();
    if (!ouverture) enregistrer();
    suivreFocus(doc);
  }

  // Le bloc revient dans la grille d'Atelier, à sa place dans la disposition (ou la première libre).
  function ramener(cle, fermeeParWindows = false) {
    const win = fenetres.get(cle);
    if (!win) return;
    fenetres.delete(cle);
    docsEnPlus.delete(win.document);
    delete donnees.detaches[cle];
    const elem = elements[cle];
    grille.append(elem);
    const d = active();
    const p = d.blocs[cle];
    delete p.cache;
    if (occupants(d.blocs, cle).some((a) => chevauche(a, p))) Object.assign(p, placeLibre(d, p.w, p.h));
    if (edition) elem.append(calqueEdition(BLOC[cle]));
    if (!fermeeParWindows) win.close();
    elem.dispatchEvent(new CustomEvent('bloc:deplace', { detail: { doc: document } }));
    suivreFocus(document);
    enregistrer();
    afficher();
  }

  function copierTheme(doc) {
    doc.documentElement.style.cssText = document.documentElement.style.cssText;
    const garder = doc.body.classList.contains('fenetre-widget');
    doc.body.className = document.body.className.replace('edition-disposition', '').trim();
    if (garder) doc.body.classList.add('fenetre-widget');
  }

  // Couleur d'accent, verre : app.js prévient ici, les fenêtres détachées suivent.
  function themeChange() {
    for (const w of fenetres.values()) if (!w.closed) copierTheme(w.document);
  }

  // Bouton « détacher » au survol de chaque titre de widget, et clic droit sur un titre.
  function boutonsTitres() {
    for (const b of BLOCS) {
      const titre = elements[b.cle]?.querySelector(':scope > .plaque-titre');
      if (!titre) continue;
      const bouton = el('button', { className: 'icon-button btn-detacher', title: 'Détacher dans sa propre fenêtre' }, el('i', { className: 'codicon codicon-link-external' }));
      bouton.onclick = () => (fenetres.has(b.cle) ? ramener(b.cle) : detacher(b.cle).catch((err) => notify(cleanError(err), 'error')));
      titre.append(bouton);
      titre.addEventListener('contextmenu', (e) => {
        if (e.target.closest('input, textarea, select')) return;
        e.preventDefault();
        const detache = fenetres.has(b.cle);
        ouvrirMenu(e.clientX, e.clientY, [
          b.nom,
          detache ? ['Ramener dans Atelier', () => ramener(b.cle)] : ['Détacher dans sa propre fenêtre', () => detacher(b.cle).catch((err) => notify(cleanError(err), 'error'))],
          ...(detache ? [] : [['Cacher', () => cacher(b.cle, true)]]),
          null,
          ['Modifier la disposition…', () => { if (detache) window.focus(); basculerEdition(true); }],
        ], e.target.ownerDocument);
      });
    }
  }

  async function start(config) {
    const lu = await window.atelier.lireDonnees('disposition', null);
    if (lu?.dispositions?.length) {
      donnees = { detaches: {}, bornes: {}, ...lu };
      for (const d of donnees.dispositions) completer(d);
    } else {
      // Premier démarrage avec la disposition libre : les widgets cachés dans les réglages le restent.
      const d = dispositionParDefaut('Par défaut', config.widgets || {});
      donnees = { active: d.id, dispositions: [d], detaches: {}, bornes: {} };
      enregistrer();
    }
    if (!donnees.dispositions.some((d) => d.id === donnees.active)) donnees.active = donnees.dispositions[0].id;
    boutonsTitres();
    afficher();
    new ResizeObserver(() => afficher()).observe(grille);

    $('#btn-disposition').onclick = () => basculerEdition();
    $('#btn-disposition').oncontextmenu = (e) => { e.preventDefault(); menuDispositions(e.clientX, e.clientY + 8); };
    $('#btn-disposition-fini').onclick = () => basculerEdition(false);
    $('#btn-disposition-ajouter').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); menuAjouter(r.left, r.bottom + 4); };
    $('#btn-disposition-nouvelle').onclick = nouvelle;
    $('#btn-disposition-renommer').onclick = renommer;
    $('#btn-disposition-supprimer').onclick = supprimer;
    $('#btn-disposition-reinit').onclick = reinitialiser;
    choix.onchange = () => changer(choix.value);
    $('#disposition-tasser').onchange = (e) => {
      const d = active();
      d.tasser = e.target.checked;
      if (d.tasser) resoudre(occupants(d.blocs), null, true).forEach((it) => Object.assign(d.blocs[it.cle], pick(it)));
      enregistrer();
      afficher();
    };
    document.addEventListener('keydown', (e) => {
      if (Dialogs.isOpen()) return;
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') { e.preventDefault(); basculerEdition(); }
      else if (edition && e.key === 'Escape') { e.preventDefault(); basculerEdition(false); }
      else if (e.ctrlKey && e.altKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        const d = donnees.dispositions[Number(e.code.slice(5)) - 1];
        if (d) { e.preventDefault(); changer(d.id); notify(`Disposition : ${d.nom}`, 'info', 1800); }
      }
    });
    window.addEventListener('beforeunload', () => {
      fermetureAtelier = true;
      clearTimeout(minuteurEcrire);
      window.atelier.ecrireDonnees('disposition', donnees).catch(() => {});
    });
    suivreFocus(document);
  }

  // Les blocs qui étaient détachés à la fermeture se rouvrent dans leur fenêtre (une fois les widgets prêts).
  async function rouvrir() {
    for (const cle of Object.keys(donnees.detaches)) {
      if (!BLOC[cle] || !elements[cle]) { delete donnees.detaches[cle]; continue; }
      await detacher(cle, true).catch((err) => { delete donnees.detaches[cle]; notify(cleanError(err), 'error'); });
    }
    suivreFocus(document);
  }

  return {
    start,
    rouvrir,
    themeChange,
    detacher: (cle) => detacher(cle),
    ramener,
    documentActif,
    estDetache: (cle) => fenetres.has(cle),
    // Montre un widget (Loki, le terminal…) : le décache, ou met sa fenêtre au premier plan.
    montrer(cle) {
      if (fenetres.has(cle)) { fenetres.get(cle).focus(); return; }
      if (blocsDe()[cle]?.cache) cacher(cle, false);
    },
    get blocs() { return BLOCS; },
  };
})();
