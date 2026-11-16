// Saga 1.34 : le compagnon, sur le téléphone d'un joueur (ou du MJ).
//
// Le téléphone est relié à SON joueur par un QR code (Saga › Multijoueur › Relier mon téléphone) : il
// reçoit la même vue que lui (calculée chez le MJ) et demande les mêmes choses. Il ne connaît aucune règle :
// les dés, les macros et la fiche viennent du jeu, le résultat des dés vient de l'hôte.
//
//   GET  <racine>/compagnon/              cette page
//   POST <racine>/compagnon/relier        { code } → { jeton, nom, mj, titre }
//   GET  <racine>/compagnon/flux?jeton=   bienvenue, vue, chat, fin
//   POST <racine>/compagnon/action        { type: 'chat' | 'macro' | 'jet' | 'champ' | 'agir_fiche' | 'pv' | … }
//   GET  <racine>/compagnon/fond?jeton=   l'image de fond choisie par le MJ
//   GET  <racine>/compagnon/document?id=&jeton=   l'image d'un document que le MJ m'a donné (Saga 1.37)

(() => {
  const C = (() => { try { return JSON.parse(document.querySelector('meta[name="compagnon"]').content || '{}'); } catch { return {}; } })();
  const racine = C.racine || '';
  const ici = `${location.origin}${racine}`;
  const app = document.getElementById('app');
  const fondEl = document.getElementById('fond');

  // --- Ce que le téléphone garde (le jeton de chaque partie reliée, les réglages) ---
  const lire = (k, d) => { try { const v = JSON.parse(localStorage.getItem(`saga-compagnon:${k}`)); return v ?? d; } catch { return d; } };
  const ecrire = (k, v) => { try { localStorage.setItem(`saga-compagnon:${k}`, JSON.stringify(v)); } catch { /* navigation privée */ } };
  let liaisons = lire('liaisons', []); // [{ cle (adresse de la partie), jeton, nom, mj, titre, campagne, vu }]
  const liaison = () => liaisons.find((l) => l.cle === ici) || null;
  const garderLiaison = (l) => { liaisons = [l, ...liaisons.filter((x) => x.cle !== l.cle)].slice(0, 12); ecrire('liaisons', liaisons); };
  const oublierLiaison = () => { liaisons = liaisons.filter((x) => x.cle !== ici); ecrire('liaisons', liaisons); };
  const reglages = { anime: lire('anime', true), secret: false };

  // --- Petits outils ---
  function el(tag, props = {}, ...enfants) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'className') e.className = v;
      else if (k === 'textContent') e.textContent = v;
      else if (k.startsWith('on')) e[k] = v;
      else if (k in e && k !== 'list') e[k] = v;
      else e.setAttribute(k, v);
    }
    for (const x of enfants.flat()) if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x)));
    return e;
  }
  const icone = (n) => el('i', { className: `codicon codicon-${n}` });
  let toastEl = null;
  function toast(t) {
    toastEl?.remove();
    toastEl = el('div', { className: 'toast', textContent: t });
    document.body.append(toastEl);
    const x = toastEl;
    setTimeout(() => x.classList.add('part'), 2600);
    setTimeout(() => x.remove(), 3000);
  }
  const vibrer = (ms = 20) => { try { navigator.vibrate?.(ms); } catch { /* rien */ } };

  // --- Le réseau ---
  let jeton = '', moi = null, vue = null, flux = null, connecte = false;
  async function envoyer(chemin, corps) {
    // Le jeton va aussi dans l'adresse : un relais d'avant Saga 1.35.1 ne transmet pas l'en-tête X-Compagnon
    // (le téléphone se croyait alors délié au premier lancer).
    const adresse = jeton ? `${racine}${chemin}?jeton=${encodeURIComponent(jeton)}` : `${racine}${chemin}`;
    const r = await fetch(adresse, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(jeton ? { 'X-Compagnon': jeton } : {}) }, body: JSON.stringify(corps || {}) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.erreur || `erreur ${r.status}`), { statut: r.status, delie: d.delie });
    return d;
  }
  const demander = (a) => envoyer('/compagnon/action', a).catch((e) => { if (e.delie) delie(); else toast(e.message); });

  async function relier(code) {
    try {
      const d = await envoyer('/compagnon/relier', { code, appareil: navigator.userAgent.match(/\(([^;)]+)/)?.[1] || '' });
      jeton = d.jeton;
      garderLiaison({ cle: ici, jeton: d.jeton, nom: d.nom, mj: d.mj, titre: d.titre, campagne: '', vu: Date.now() });
      return true;
    } catch (e) { toast(e.message); return false; }
  }
  function ecouter() {
    flux?.close();
    flux = new EventSource(`${racine}/compagnon/flux?jeton=${encodeURIComponent(jeton)}`);
    flux.onopen = () => { connecte = true; dessinerTete(); };
    flux.onerror = () => {
      connecte = false; dessinerTete();
      // Le serveur ne connaît plus ce jeton (la partie a été refermée) : on le saura en redemandant.
      fetch(`${racine}/compagnon/flux?jeton=${encodeURIComponent(jeton)}`, { method: 'GET' }).then((r) => { if (r.status === 401) delie(); else r.body?.cancel?.(); }).catch(() => {});
    };
    flux.addEventListener('bienvenue', (e) => { try { moi = JSON.parse(e.data); } catch { return; } dessiner(); });
    flux.addEventListener('vue', (e) => { try { recevoirVue(JSON.parse(e.data)); } catch { /* abîmé */ } });
    flux.addEventListener('fin', (e) => {
      let d = {};
      try { d = JSON.parse(e.data); } catch { /* rien */ }
      flux.close();
      connecte = false;
      if (d.raison === 'delie' || d.raison === 'expulse') { delie(d.raison === 'expulse' ? 'Le MJ t\'a retiré de la partie.' : 'Ce téléphone a été délié.'); return; }
      toast('Le MJ a fermé la partie.');
      dessinerTete();
    });
  }
  function delie(t = 'Ce téléphone n\'est plus relié à la partie.') {
    flux?.close();
    oublierLiaison();
    jeton = ''; moi = null; vue = null;
    accueil(t);
  }

  // --- La vue (celle du joueur, ou du MJ) ---
  let dernierJournal = -1, fondVu = '';
  function recevoirVue(v) {
    const avant = vue;
    vue = v;
    // Le nom de la campagne, pour la liste des parties reliées.
    const l = liaison();
    if (l && v.campagne?.nom && l.campagne !== v.campagne.nom) { l.campagne = v.campagne.nom; l.vu = Date.now(); ecrire('liaisons', liaisons); }
    if ((v.campagne?.fond || '') !== fondVu) {
      fondVu = v.campagne?.fond || '';
      fondEl.classList.toggle('image', Boolean(fondVu));
      fondEl.style.backgroundImage = fondVu ? `url("${racine}/compagnon/fond?jeton=${encodeURIComponent(jeton)}&v=${encodeURIComponent(fondVu)}")` : '';
    }
    // Les jets qui arrivent (le journal de la partie) : le mien fait s'arrêter les dés.
    const journal = v.journal || [];
    if (dernierJournal < 0) dernierJournal = journal.reduce((m, x) => Math.max(m, x.n || 0), 0);
    else for (const x of journal) if ((x.n || 0) > dernierJournal) { dernierJournal = x.n; nouveauJet(x); }
    if (Array.isArray(v.avis) && v.avis.length && JSON.stringify(v.avis) !== JSON.stringify(avant?.avis)) toast(String(v.avis[v.avis.length - 1]?.texte || v.avis[v.avis.length - 1] || ''));
    recevoirDocuments(v);
    dessinerTete();
    if (onglet !== 'des') dessinerPage(); else majHisto();
  }
  const monNom = () => (moi?.mj ? 'MJ' : vue?.pions?.find((p) => p.id === vue.moi)?.nom || moi?.nom || '');

  // --- L'écran ---
  let onglet = 'des', pageEl = null, teteEl = null;
  const ONGLETS = () => (moi?.mj
    ? [['des', 'Dés', 'circuit-board'], ['macros', 'Macros', 'zap'], ['pions', 'Pions', 'organization'], ['documents', 'Documents', 'files']]
    : [['des', 'Dés', 'circuit-board'], ['macros', 'Macros', 'zap'], ['fiche', 'Fiche', 'person'], ['documents', 'Documents', 'files']]);

  function dessiner() {
    app.innerHTML = '';
    teteEl = el('header', { className: 'tete verre' });
    pageEl = el('section', { className: 'page' });
    const nav = el('nav', { className: 'nav verre' });
    for (const [id, nom, ic] of ONGLETS()) {
      const b = el('button', { className: onglet === id ? 'on' : '', type: 'button' }, icone(ic), el('span', { textContent: nom }), id === 'documents' && docsNeufs.size ? el('b', { className: 'pastille', textContent: String(docsNeufs.size) }) : null);
      b.onclick = () => { onglet = id; vibrer(8); dessiner(); };
      nav.append(b);
    }
    app.append(teteEl, pageEl, nav);
    dessinerTete();
    dessinerPage();
  }
  function dessinerTete() {
    if (!teteEl) return;
    const titre = vue?.campagne?.nom || moi?.titre || C.titre || 'Partie';
    const qui = moi?.mj ? 'MJ' : vue?.pions?.find((p) => p.id === vue.moi)?.nom || moi?.nom || '';
    const menu = el('button', { className: 'icone-bouton', type: 'button', title: 'Parties reliées' }, icone('menu'));
    menu.onclick = () => accueil('', true);
    teteEl.replaceChildren(el('img', { src: 'icone.svg', alt: '' }),
      el('div', { className: 'qui' }, el('b', { textContent: titre }), el('small', { textContent: [qui, vue?.nom].filter(Boolean).join(' · ') })),
      el('span', { className: `etat-co ${connecte ? 'oui' : 'non'}`, textContent: connecte ? '● en direct' : '○ hors ligne' }), menu);
  }
  function dessinerPage() {
    if (!pageEl) return;
    // Ne pas effacer un champ en train d'être écrit.
    const actif = document.activeElement;
    if (actif && pageEl.contains(actif) && actif.matches('input, textarea, select')) return;
    if (onglet === 'des') pageDes();
    else if (onglet === 'macros') pageMacros();
    else if (onglet === 'fiche') pageFiche();
    else if (onglet === 'pions') pagePions();
    else pageDocuments();
  }

  // ===================== Les dés =====================
  const TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
  let choix = {}, plateau = null, resEl = null, aideEl = null, histoEl = null, attenteJet = null, formuleEl = null;
  const formuleChoisie = () => TYPES.filter((t) => choix[t]).sort((a, b) => FACES(b) - FACES(a)).map((t) => `${choix[t]}${t === 'd100' ? 'd100' : t}`).join('+');
  const FACES = (t) => PlateauDes.FACES[t] || 6;
  function pageDes() {
    pageEl.innerHTML = '';
    const tapis = el('div', { className: 'tapis verre' });
    const canvas = el('canvas');
    resEl = el('div', { className: 'res' });
    aideEl = el('div', { className: 'aide', textContent: mouvementPossible() ? 'Secoue le téléphone ou glisse pour lancer' : 'Glisse sur le tapis pour lancer' });
    tapis.append(canvas, resEl, aideEl);
    const des = el('div', { className: 'choix-des verre' });
    for (const t of TYPES) {
      const b = el('button', { className: `dch${choix[t] ? ' on' : ''}`, type: 'button', title: 'Toucher : un dé de plus · appui long : un de moins' }, t === 'd100' ? 'd%' : t, choix[t] ? el('i', { textContent: String(choix[t]) }) : null);
      appuiLong(b, () => { choix[t] = Math.max(0, (choix[t] || 0) - 1); majChoix(); }, () => { choix[t] = Math.min(20, (choix[t] || 0) + 1); majChoix(); });
      des.append(b);
    }
    formuleEl = el('input', { className: 'champ', type: 'text', value: lire('formule', '1d20'), placeholder: '1d20+@for', autocapitalize: 'off', autocomplete: 'off', spellcheck: false });
    formuleEl.oninput = () => ecrire('formule', formuleEl.value);
    const lancerB = el('button', { className: 'btn', type: 'button' }, icone('debug-start'), 'Lancer');
    lancerB.onclick = () => lancer();
    formuleEl.onkeydown = (e) => { if (e.key === 'Enter') { formuleEl.blur(); lancer(); } };
    const secret = el('button', { className: `btn2${reglages.secret ? ' actif' : ''}`, type: 'button' }, icone('eye-closed'), 'Secret');
    secret.onclick = () => { reglages.secret = !reglages.secret; secret.classList.toggle('actif', reglages.secret); };
    const anime = el('button', { className: 'btn2', type: 'button' }, icone(reglages.anime ? 'play-circle' : 'circle-slash'), `Animation : ${reglages.anime ? 'oui' : 'non'}`);
    anime.onclick = () => { reglages.anime = !reglages.anime; ecrire('anime', reglages.anime); if (plateau) plateau.anime = reglages.anime; pageDes(); };
    const vider = el('button', { className: 'btn2', type: 'button' }, icone('clear-all'), 'Vider');
    vider.onclick = () => { choix = {}; plateau?.vider(); resEl.innerHTML = ''; aideEl.hidden = false; majChoix(); };
    const options = el('div', { className: 'options' }, secret, anime, vider);
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function' && !mouvement.permis) {
      const perm = el('button', { className: 'btn2', type: 'button' }, icone('device-mobile'), 'Activer la secousse');
      // Saga 1.37 : on dit ce qui se passe (un refus d'avant reste en mémoire dans Safari).
      perm.onclick = () => DeviceMotionEvent.requestPermission().then((r) => {
        mouvement.permis = r === 'granted';
        if (mouvement.permis) { brancherMouvement(); perm.remove(); toast('Secousse activée : secoue le téléphone.'); }
        else toast('Refusé par le téléphone. Réglages › Safari › Avancé › Données des sites : efface ce site, puis réessaie.');
      }).catch((e) => toast(`Le téléphone ne permet pas la secousse ici (${e?.message || 'refus'}). Glisse sur le tapis.`));
      options.append(perm);
    }
    // Le téléphone ne donne aucun mouvement (capteurs bloqués par le navigateur) : on le dit, plutôt que rien.
    const sansSecousse = el('p', { className: 'note-secousse', hidden: true, textContent: mouvementPossible() ? 'Secouer ne marche pas ici : le navigateur bloque les capteurs de mouvement. Brave : cadenas de l\'adresse › Paramètres du site › Capteurs de mouvement › Autoriser ; si ça ne suffit pas, touche le lion et baisse les boucliers pour ce site. Puis recharge la page. Sinon, glisse sur le tapis.' : 'Secouer demande une adresse en https (une partie par le relais). Glisse sur le tapis pour lancer.' });
    setTimeout(() => {
      if (onglet !== 'des' || mouvement.recu || (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function')) return;
      capteurAndroid();
      setTimeout(() => {
        if (mouvement.recu || onglet !== 'des') return;
        sansSecousse.hidden = false;
        if (window.isSecureContext && !sansSecousse.querySelector('button')) {
          const b = el('button', { className: 'btn2', type: 'button' }, icone('device-mobile'), 'Réessayer la secousse');
          b.onclick = () => { mouvement.capteur?.stop?.(); mouvement.capteur = null; capteurAndroid(true); };
          sansSecousse.append(el('br'), b);
        }
      }, 1500);
    }, 2500);
    histoEl = el('div', { className: 'histo verre' });
    pageEl.append(tapis, des, el('div', { className: 'formule verre ligne' }, formuleEl, lancerB), options, sansSecousse, histoEl);
    plateau = PlateauDes.creer(canvas, { accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ffb347', anime: reglages.anime });
    // Glisser sur le tapis : on jette les dés dans ce sens.
    let trace = [];
    tapis.onpointerdown = (e) => { trace = [{ x: e.offsetX, y: e.offsetY, t: performance.now() }]; tapis.setPointerCapture(e.pointerId); };
    tapis.onpointermove = (e) => { if (trace.length) { trace.push({ x: e.offsetX, y: e.offsetY, t: performance.now() }); if (trace.length > 8) trace.shift(); } };
    tapis.onpointerup = (e) => {
      if (trace.length < 2) { trace = []; return; }
      const a = trace[0], b = { x: e.offsetX, y: e.offsetY, t: performance.now() };
      const dt = Math.max(16, b.t - a.t) / 1000, vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
      trace = [];
      if (Math.hypot(vx, vy) > 250) lancer({ x: b.x, y: b.y, vx, vy });
    };
    majHisto();
  }
  function majChoix() {
    const f = formuleChoisie();
    if (formuleEl && f) { formuleEl.value = f; ecrire('formule', f); }
    vibrer(6);
    const garde = formuleEl?.value;
    pageDes();
    if (formuleEl && garde) formuleEl.value = garde;
  }
  function lancer(main) {
    const formule = String(formuleEl?.value || '').trim();
    if (!formule) { toast('Choisis des dés ou écris une formule.'); return; }
    if (vue?.pause && !moi?.mj) { toast('La partie est en pause.'); return; }
    const types = PlateauDes.types(formule);
    if (!types.length) { toast('Pas de dé dans cette formule.'); return; }
    vibrer(25);
    aideEl.hidden = true;
    resEl.innerHTML = '';
    plateau.lancer(types, main || {});
    attenteJet = { types, depuis: Date.now() };
    clearTimeout(lancer.minuterie);
    lancer.minuterie = setTimeout(() => { if (attenteJet) { attenteJet = null; plateau.vider(); aideEl.hidden = false; toast('Pas de réponse de la partie.'); } }, 6000);
    const ligne = formule.startsWith('/') ? formule : `${reglages.secret ? '/gr' : '/r'} ${formule}`;
    demander({ type: 'chat', texte: ligne });
  }
  // Un jet est arrivé dans le journal : si on l'attendait, les dés s'arrêtent sur ses valeurs.
  function nouveauJet(x) {
    vibrer(15);
    if (attenteJet && onglet === 'des' && plateau && (x.qui === monNom() || moi?.mj || Date.now() - attenteJet.depuis < 2500)) {
      attenteJet = null;
      clearTimeout(lancer.minuterie);
      const valeurs = (x.des || []).map((d) => d.valeur);
      // Le plateau montre les dés du jet tel que l'hôte l'a lancé (un d100, un 3d6…).
      const types = (x.des || []).map((d) => (PlateauDes.FACES[`d${d.faces}`] ? `d${d.faces}` : 'd6'));
      if (types.join() !== plateau.des.map((d) => d.sorte).join()) plateau.lancer(types, {});
      plateau.poser(valeurs);
      resEl.className = `res${x.cache ? ' secret' : ''}`;
      resEl.replaceChildren(el('span', { textContent: `${x.quoi && x.quoi !== 'Jet' ? `${x.quoi} · ` : ''}${x.formule} = ${(x.des || []).map((d) => d.valeur).join(' + ')}${x.bonus ? ` ${x.bonus > 0 ? '+' : '−'} ${Math.abs(x.bonus)}` : ''}` }), el('b', { textContent: String(x.total) }));
    } else if (onglet !== 'des' && x.qui === monNom()) toast(`🎲 ${x.quoi || 'Jet'} : ${x.total}`);
  }
  function majHisto() {
    if (!histoEl) return;
    const nom = monNom();
    const l = (vue?.journal || []).filter((x) => moi?.mj || x.qui === nom).slice(-4).reverse();
    histoEl.hidden = !l.length;
    histoEl.replaceChildren(...l.map((x) => el('div', { className: x.cache ? 'cache' : '' },
      el('span', { textContent: `${moi?.mj && x.qui !== 'MJ' ? `${x.qui} · ` : ''}${x.quoi || x.formule}${x.cache ? ' (secret)' : ''}` }), el('b', { textContent: String(x.total) }))));
  }

  // La secousse : deux à-coups forts rapprochés lancent les dés.
  const mouvement = { permis: false, branche: false, coups: [] };
  const mouvementPossible = () => window.isSecureContext && typeof DeviceMotionEvent !== 'undefined';
  function brancherMouvement() {
    if (mouvement.branche || !mouvementPossible()) return;
    mouvement.branche = true;
    window.addEventListener('devicemotion', (e) => {
      // Certains téléphones donnent une accélération vide (x nul) : on prend alors celle avec la gravité.
      const pure = e.acceleration && e.acceleration.x != null;
      const a = pure ? e.acceleration : e.accelerationIncludingGravity;
      if (!a || a.x == null) return;
      secousse(a, pure);
    });
  }
  // Saga 1.37 : un à-coup, d'où qu'il vienne (devicemotion, ou le capteur d'accélération d'Android).
  function secousse(a, pure) {
    mouvement.recu = true;
    if (onglet !== 'des' || attenteJet) return;
    const f = Math.abs(Math.hypot(a.x || 0, a.y || 0, a.z || 0) - (pure ? 0 : 9.8));
    const t = performance.now();
    if (f < 8) return;
    mouvement.coups = mouvement.coups.filter((x) => t - x < 900);
    // Deux à-coups (séparés d'au moins 80 ms), ou un seul très fort.
    if (!mouvement.coups.length || t - mouvement.coups.at(-1) > 80) mouvement.coups.push(t);
    if (mouvement.coups.length >= 2 || f > 20) {
      mouvement.coups = [];
      const r = pageEl.querySelector('.tapis')?.getBoundingClientRect();
      lancer({ x: (r?.width || 300) / 2, y: (r?.height || 300) / 2, vx: -(a.x || 0) * 160, vy: (a.y || 0) * 160 });
    }
  }
  // Saga 1.37 : Android (Brave, Chrome) peut bloquer devicemotion mais laisser le capteur d'accélération
  // (Generic Sensor API), qui demande la permission lui-même. On l'essaie quand devicemotion ne donne rien.
  function capteurAndroid(dire = false) {
    const C = window.LinearAccelerationSensor || window.Accelerometer;
    if (!C || !window.isSecureContext) { if (dire) toast('Ce navigateur ne donne pas accès aux capteurs de mouvement.'); return false; }
    if (mouvement.capteur) return true;
    try {
      const c = new C({ frequency: 60 });
      const pure = C === window.LinearAccelerationSensor;
      c.addEventListener('reading', () => secousse({ x: c.x, y: c.y, z: c.z }, pure));
      c.addEventListener('error', (e) => {
        mouvement.capteur = null;
        if (dire) toast(e.error?.name === 'NotAllowedError' ? 'Capteurs refusés : cadenas de l\'adresse › Paramètres du site › Capteurs de mouvement › Autoriser, puis recharge la page.' : `Capteur indisponible (${e.error?.name || 'erreur'}).`);
      });
      c.start();
      mouvement.capteur = c;
      setTimeout(() => { if (dire && mouvement.recu) toast('Secousse activée : secoue le téléphone.'); }, 1200);
      return true;
    } catch (e) { if (dire) toast(`Capteur indisponible (${e.name || e.message}).`); return false; }
  }
  if (mouvementPossible() && typeof DeviceMotionEvent.requestPermission !== 'function') brancherMouvement();

  // Un toucher, ou un appui long (une demi-seconde).
  function appuiLong(b, long, court) {
    let m = null, fait = false;
    b.onpointerdown = () => { fait = false; m = setTimeout(() => { fait = true; vibrer(30); long(); }, 480); };
    b.onpointerup = () => { clearTimeout(m); if (!fait) court(); };
    b.onpointerleave = () => clearTimeout(m);
    b.oncontextmenu = (e) => e.preventDefault();
  }

  // ===================== Les macros =====================
  let edition = null; // { k (null : nouvelle), nom, formule }
  function pageMacros() {
    pageEl.innerHTML = '';
    const macros = vue?.macros || [];
    if (!moi?.mj && !vue?.moi) { pageEl.append(el('div', { className: 'vide verre', textContent: 'Il te faut un héros (sur l\'écran du PC) pour avoir des macros.' })); return; }
    if (edition) { pageEl.append(formMacro()); return; }
    // Deux familles, comme sur la fiche : les jets (un d20) et les dégâts ou soins (le reste).
    const jets = [], degats = [];
    macros.forEach((m, k) => (/d20/i.test(m.formule) ? jets : degats).push([m, k]));
    const deux = jets.length && degats.length;
    const g = el('div', { className: 'grille' });
    const tuile = ([m, k]) => {
      const secret = /^\/(gr|mj)\b/i.test(m.formule);
      // La valeur calculée (les @ de la fiche) : « +5 » pour un d20, sinon la formule (« 1d8+4 »).
      let calc = String(m.calcul || (/@/.test(m.formule) ? '' : m.formule)).replace(/^\/\w+\s+/, '').split(/\s/)[0];
      // Les nombres s'additionnent (« 1d20+2+2 » → « 1d20+4 »).
      const m2 = /^(\d*d\d+)((?:[+-]\d+)+)$/i.exec(calc);
      if (m2) { const n = m2[2].match(/[+-]\d+/g).reduce((a, x) => a + Number(x), 0); calc = n ? `${m2[1]}${n > 0 ? '+' : ''}${n}` : m2[1]; }
      const d20 = /^1?d20([+-]\d+)?$/i.exec(calc);
      const valeur = d20 ? (d20[1] || '+0') : calc;
      const b = el('button', { className: `mac verre${/d20/i.test(m.formule) ? '' : ' degats'}`, type: 'button' },
        el('b', {}, m.nom, secret ? icone('eye-closed') : null),
        el('div', { className: 'mac-bas' }, el('code', { textContent: m.formule }), valeur && valeur !== m.formule.replace(/^\/\w+\s+/, '') ? el('span', { className: 'val', textContent: valeur }) : null));
      appuiLong(b, () => { edition = { k, nom: m.nom, formule: m.formule }; pageMacros(); }, () => {
        vibrer(20);
        demander({ type: 'macro', k });
        toast(`${m.nom}…`);
      });
      return b;
    };
    if (deux) {
      pageEl.append(el('h3', { textContent: 'Jets' }), el('div', { className: 'grille' }, ...jets.map(tuile)), el('h3', { textContent: 'Dégâts et soins' }));
      degats.forEach((x) => g.append(tuile(x)));
    } else [...jets, ...degats].sort((a, b) => a[1] - b[1]).forEach((x) => g.append(tuile(x)));
    if (macros.length < 20) {
      const plus = el('button', { className: 'ajout', type: 'button' }, icone('add'), ' Nouvelle macro');
      plus.onclick = () => { edition = { k: null, nom: '', formule: '1d20+' }; pageMacros(); };
      g.append(plus);
    }
    pageEl.append(g, el('p', { className: 'note', textContent: 'Toucher : lancer · appui long : modifier. Les @ lisent ta fiche (@for, @pb, @niveau…). /gr au début : un jet secret pour le MJ.' }));
  }
  function formMacro() {
    const nom = el('input', { className: 'champ', type: 'text', maxLength: 30, value: edition.nom, placeholder: 'Nom (Hache d\'armes)' });
    const formule = el('input', { className: 'champ', type: 'text', maxLength: 80, value: edition.formule, placeholder: '1d20+@for+@pb', autocapitalize: 'off', spellcheck: false });
    const ok = el('button', { className: 'btn', type: 'button' }, icone('check'), 'Garder');
    ok.onclick = () => {
      const n = nom.value.trim(), f = formule.value.trim();
      if (!n || !f) { toast('Un nom et une formule.'); return; }
      // Renommer : on retire l'ancienne puis on garde la nouvelle.
      if (edition.k != null && (vue?.macros?.[edition.k]?.nom || '').toLowerCase() !== n.toLowerCase()) demander({ type: 'macro_retirer', k: edition.k });
      demander({ type: 'macro_ajouter', nom: n, formule: f });
      edition = null;
      pageMacros();
    };
    const annuler = el('button', { className: 'btn2', type: 'button' }, 'Annuler');
    annuler.onclick = () => { edition = null; pageMacros(); };
    const suppr = edition.k != null ? el('button', { className: 'btn2', type: 'button' }, icone('trash'), 'Supprimer') : null;
    if (suppr) suppr.onclick = () => { demander({ type: 'macro_retirer', k: edition.k }); edition = null; pageMacros(); };
    setTimeout(() => (edition?.k == null ? nom : formule).focus(), 50);
    return el('div', { className: 'edition verre' }, el('b', { textContent: edition.k == null ? 'Nouvelle macro' : 'Modifier la macro' }), nom, formule, el('div', { className: 'ligne' }, ok, annuler, suppr));
  }

  // ===================== La fiche =====================
  let ficheSignature = '';
  function pageFiche() {
    const f = vue?.fiche;
    const s = JSON.stringify([f, vue?.combat ? 1 : 0, vue?.creation ? 1 : 0]);
    if (s === ficheSignature && pageEl.firstChild) return;
    ficheSignature = s;
    pageEl.innerHTML = '';
    if (!f) { pageEl.append(el('div', { className: 'vide verre', textContent: 'Pas encore de héros : choisis-en un (ou crée le tien) sur l\'écran du PC.' })); return; }
    const jet = (sorte, id, quoi) => { vibrer(15); demander({ type: 'jet', sorte, id, quoi }); toast(`${quoi || 'Jet'}…`); };
    // La fiche du jeu (Tafl › Réglages › Fiche des personnages) : la même que sur le PC.
    if (f.modele && typeof FichePerso !== 'undefined') {
      const occupe = Boolean(vue.creation || vue.combat);
      pageEl.append(el('div', { className: 'fiche verre' }, FichePerso.rendre(f.modele, f, {
        jet, occupe, combat: Boolean(vue.combat),
        utiliser: (objet) => { if (!occupe) demander({ type: 'agir_fiche', id: 'objet', objet }); },
        agir: (id) => { if (!occupe) demander({ type: 'agir_fiche', id }); },
        changer: (id, valeur) => demander({ type: 'champ', id, valeur }),
      })));
      return;
    }
    const signe = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
    const pct = Math.max(0, Math.min(100, (f.pv / Math.max(1, f.pvMax)) * 100));
    pageEl.append(el('div', { className: 'fiche verre' },
      el('div', { className: 'fiche-tete' }, el('b', { textContent: f.nom }), el('small', { textContent: `niv. ${f.niveau || 1} · CA ${f.ca}` })),
      el('div', { className: `jauge${pct < 40 ? ' basse' : ''}` }, el('i', { style: `width:${pct}%` })),
      el('small', { textContent: `${f.pv} / ${f.pvMax} PV` }),
      f.etats?.length ? el('div', { className: 'etiquettes' }, ...f.etats.map((e) => el('span', { className: 'etiquette', textContent: e }))) : null));
    pageEl.append(el('h3', { textContent: 'Caractéristiques' }));
    const g = el('div', { className: 'caracs' });
    for (const c of f.caracs || []) {
      const b = el('button', { className: 'carac verre', type: 'button' }, el('small', { textContent: c.court || c.nom.slice(0, 3) }), el('b', { textContent: signe(c.mod) }), el('span', { className: 'sauv', textContent: `${c.valeur} · sauv. ${signe(c.sauvegarde)}` }));
      appuiLong(b, () => jet('sauvegarde', c.id, ''), () => jet('test', c.id, c.nom));
      g.append(b);
    }
    pageEl.append(g, el('p', { className: 'note', textContent: 'Toucher : un test · appui long : une sauvegarde.' }));
    if (f.competences?.length) {
      pageEl.append(el('h3', { textContent: 'Compétences' }));
      const l = el('div', { className: 'liste-jets verre' });
      for (const c of f.competences) {
        const b = el('button', { className: c.maitrise ? 'maitrise' : '', type: 'button' }, el('span', { textContent: c.nom }), el('b', { textContent: signe(c.bonus) }));
        b.onclick = () => jet('test', c.id, c.nom);
        l.append(b);
      }
      pageEl.append(l);
    }
    if (f.attaques?.length) {
      pageEl.append(el('h3', { textContent: 'Attaques' }));
      const l = el('div', { className: 'liste-jets verre' });
      for (const a of f.attaques) l.append(el('button', { type: 'button', disabled: true }, el('span', { textContent: a.nom }), el('b', { textContent: `${signe(a.bonus)} · ${a.des}${a.mod ? ` ${signe(a.mod)}` : ''}` })));
      pageEl.append(l, el('p', { className: 'note', textContent: 'En combat, les attaques se jouent à ton tour, sur le PC (ou en macro).' }));
    }
  }

  // ===================== Les pions (MJ) =====================
  function pagePions() {
    pageEl.innerHTML = '';
    const pions = (vue?.pions || []).filter((p) => p.pv != null);
    if (!pions.length) { pageEl.append(el('div', { className: 'vide verre', textContent: 'Aucun pion sur cette carte.' })); return; }
    const actif = vue?.combat?.actif;
    const ordre = vue?.combat?.ordre?.map((o) => o.id) || [];
    pions.sort((a, b) => (ordre.indexOf(a.id) + 1 || 99) - (ordre.indexOf(b.id) + 1 || 99) || (a.sorte === 'heros' ? -1 : 1));
    if (vue.combat) pageEl.append(el('h3', { textContent: `Combat · tour ${vue.combat.tour || 1}` }));
    for (const p of pions) {
      const pct = Math.max(0, Math.min(100, (p.pv / Math.max(1, p.pvMax)) * 100));
      const pvs = el('div', { className: 'pvs' });
      for (const d of [-5, -1, 1, 5]) {
        const b = el('button', { type: 'button', textContent: d > 0 ? `+${d}` : `−${-d}` });
        b.onclick = () => { vibrer(10); demander({ type: 'pv', pion: p.id, delta: d }); };
        pvs.append(b);
      }
      const ligne = el('div', { className: `pion verre${p.ko ? ' ko' : ''}${p.id === actif ? ' actif' : ''}` },
        el('div', { className: 'nom' }, p.nom || p.monstre || p.id, el('small', { textContent: ` · ${p.pv} / ${p.pvMax} PV${p.cache ? ' · caché' : ''}` })), pvs,
        el('div', { className: `jauge${pct < 40 ? ' basse' : ''}` }, el('i', { style: `width:${pct}%` })));
      ligne.dataset.id = p.id;
      pageEl.append(ligne);
    }
  }

  // ===================== Les documents (Saga 1.37) =====================
  // Le joueur : ce que le MJ lui a donné (il les garde et les rouvre). Le MJ : tous, à qui il les a donnés, les
  // montrer, et prendre une photo qui devient un document.
  let docsVus = null, dernierMontre = -1, docSig = '', envoiPhoto = null;
  const docsNeufs = new Set();
  const urlDoc = (d) => (d.image ? `${racine}/compagnon/document?id=${encodeURIComponent(d.id)}&v=${encodeURIComponent(d.image)}&jeton=${encodeURIComponent(jeton)}` : '');
  function recevoirDocuments(v) {
    const l = v.documents || [];
    if (docsVus == null) { docsVus = new Set(l.map((d) => d.id)); dernierMontre = v.montre?.n ?? -1; }
    let neuf = null;
    for (const d of l) if (!docsVus.has(d.id)) { docsVus.add(d.id); if (!moi?.mj) { docsNeufs.add(d.id); neuf = d; } }
    if (neuf) { vibrer([30, 60, 30]); if (v.montre?.id !== neuf.id) toast(`Nouveau document : ${neuf.titre}`); if (onglet !== 'documents') dessiner(); }
    if (v.montre && v.montre.n !== dernierMontre) {
      dernierMontre = v.montre.n;
      const d = l.find((x) => x.id === v.montre.id);
      if (d && !moi?.mj) ouvrirDoc(d);
    }
    const o = document.querySelector('.visionneuse');
    if (o && !l.some((d) => d.id === o.dataset.id)) o.remove();
  }
  function ouvrirDoc(d) {
    document.querySelector('.visionneuse')?.remove();
    docsNeufs.delete(d.id);
    const fermer = el('button', { className: 'icone-bouton', type: 'button', title: 'Fermer' }, icone('close'));
    const v = el('div', { className: 'visionneuse' },
      el('div', { className: 'vis-tete verre' }, icone(d.image ? 'file-media' : 'note'), el('b', { textContent: d.titre || 'Document' }), fermer),
      el('div', { className: 'vis-corps' },
        d.image ? el('img', { src: urlDoc(d), alt: d.titre || '' }) : null,
        d.texte ? el('div', { className: `vis-texte verre${d.image ? '' : ' lettre'}`, textContent: d.texte }) : null));
    v.dataset.id = d.id;
    fermer.onclick = () => { v.remove(); if (onglet === 'documents') { docSig = ''; pageDocuments(); } };
    document.body.append(v);
    if (onglet === 'documents') { docSig = ''; pageDocuments(); }
    dessinerNavPastille();
  }
  function dessinerNavPastille() {
    const b = app.querySelector('.nav button:last-child');
    if (!b || moi?.mj) return;
    b.querySelector('.pastille')?.remove();
    if (docsNeufs.size) b.append(el('b', { className: 'pastille', textContent: String(docsNeufs.size) }));
  }
  const quand = (t) => {
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    return s < 60 ? 'à l\'instant' : s < 3600 ? `il y a ${Math.round(s / 60)} min` : new Date(t).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  };
  function pageDocuments() {
    const l = [...(vue?.documents || [])].sort((a, b) => b.t - a.t);
    const sig = JSON.stringify([l, [...docsNeufs], vue?.montre?.id, envoiPhoto ? envoiPhoto.etat : 0, vue?.destinataires]);
    if (sig === docSig && pageEl.firstChild) return;
    docSig = sig;
    pageEl.innerHTML = '';
    if (moi?.mj) {
      if (envoiPhoto) { pageEl.append(formPhoto()); return; }
      const prendre = el('label', { className: 'btn photo' }, icone('device-camera'), 'Prendre une photo',
        el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (f) preparerPhoto(f); } }));
      const choisir = el('label', { className: 'btn2' }, icone('file-media'), 'Une image du téléphone',
        el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (f) preparerPhoto(f); } }));
      pageEl.append(el('div', { className: 'ligne' }, prendre, choisir));
    }
    if (!l.length) {
      pageEl.append(el('div', { className: 'vide verre' }, icone('files'), el('p', { textContent: moi?.mj ? 'Aucun document : prépare-les dans Saga (onglet Docs), ou prends une photo.' : 'Les documents que le MJ te donnera (images, lettres, cartes, indices) arriveront ici.' })));
      return;
    }
    const g = el('div', { className: 'docs' });
    for (const d of l) {
      const b = el('button', { className: `doc verre${docsNeufs.has(d.id) ? ' neuf' : ''}`, type: 'button' },
        d.image ? el('img', { src: urlDoc(d), alt: '', loading: 'lazy' }) : el('span', { className: 'doc-txt', textContent: (d.texte || '').slice(0, 140) }),
        el('div', { className: 'doc-bas' }, el('b', { textContent: d.titre || 'Document' }),
          el('small', { textContent: moi?.mj ? (d.pour === 'tous' ? 'Tous' : Array.isArray(d.pour) && d.pour.length ? d.pour.join(', ') : 'Brouillon') : quand(d.t) })));
      b.onclick = () => ouvrirDoc(d);
      if (moi?.mj) {
        const montre = vue?.montre?.id === d.id;
        const m = el('button', { className: `mini${montre ? ' actif' : ''}`, type: 'button', title: montre ? 'Ne plus montrer' : 'Montrer sur leurs écrans' }, icone(montre ? 'eye-closed' : 'eye'));
        m.onclick = (e) => { e.stopPropagation(); vibrer(12); demander(montre ? { type: 'doc_cacher' } : { type: 'doc_montrer', id: d.id }); };
        b.append(m);
      }
      g.append(b);
    }
    pageEl.append(g, el('p', { className: 'note', textContent: moi?.mj ? 'Toucher : voir · l\'œil : le montrer maintenant sur les écrans de ceux qui l\'ont (un brouillon : à tous).' : 'Toucher : ouvrir. Tu gardes ces documents pendant toute la séance.' }));
  }
  // --- MJ : une photo → un document (réduite ici, puis envoyée en petits morceaux : le relais limite la taille) ---
  function preparerPhoto(fichier) {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      envoiPhoto = { image: c.toDataURL('image/jpeg', 0.8), titre: '', pour: 'tous', montrer: true, etat: 1 };
      docSig = '';
      pageDocuments();
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Cette image est illisible.'); };
    img.src = url;
  }
  function formPhoto() {
    const e = envoiPhoto;
    const titre = el('input', { className: 'champ', type: 'text', maxLength: 80, value: e.titre, placeholder: 'Titre (Le plan griffonné…)' });
    titre.oninput = () => { e.titre = titre.value; };
    const noms = vue?.destinataires || [];
    const puce = (val, texte, faire) => { const b = el('button', { className: `puce${val ? ' on' : ''}`, type: 'button', textContent: texte }); b.onclick = () => { faire(); vibrer(6); docSig = ''; pageDocuments(); }; return b; };
    const puces = el('div', { className: 'puces' }, puce(e.pour === 'tous', 'Tous', () => { e.pour = e.pour === 'tous' ? [] : 'tous'; }),
      ...noms.map((n) => puce(Array.isArray(e.pour) && e.pour.includes(n), n, () => { const l = Array.isArray(e.pour) ? e.pour : []; e.pour = l.includes(n) ? l.filter((x) => x !== n) : [...l, n]; })));
    const montrer = puce(e.montrer, 'L\'ouvrir chez eux', () => { e.montrer = !e.montrer; });
    const envoyerB = el('button', { className: 'btn', type: 'button', disabled: e.etat === 2 }, icone('send'), e.etat === 2 ? `Envoi… ${e.pct || 0} %` : (e.pour === 'tous' || e.pour.length ? 'Donner' : 'Garder en brouillon'));
    envoyerB.onclick = () => envoyerPhoto();
    const annuler = el('button', { className: 'btn2', type: 'button', disabled: e.etat === 2 }, 'Annuler');
    annuler.onclick = () => { envoiPhoto = null; docSig = ''; pageDocuments(); };
    setTimeout(() => { if (e.etat === 1 && !e.titre) titre.focus(); }, 50);
    return el('div', { className: 'edition verre' }, el('b', { textContent: 'Nouveau document' }), el('img', { className: 'apercu', src: e.image, alt: '' }), titre,
      el('small', { textContent: 'À qui :' }), puces, el('div', { className: 'puces' }, montrer), el('div', { className: 'ligne' }, envoyerB, annuler));
  }
  async function envoyerPhoto() {
    const e = envoiPhoto;
    if (!e || e.etat === 2) return;
    e.etat = 2; e.pct = 0; docSig = ''; pageDocuments();
    const data = e.image.slice(e.image.indexOf(',') + 1);
    const TAILLE = 12000, n = Math.ceil(data.length / TAILLE), envoi = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    try {
      for (let i = 0; i < n; i++) {
        await envoyer('/compagnon/action', { type: 'doc_morceau', envoi, i, n, data: data.slice(i * TAILLE, (i + 1) * TAILLE), titre: e.titre || 'Photo', pour: e.pour, montrer: e.montrer });
        e.pct = Math.round(((i + 1) / n) * 100);
        const b = pageEl.querySelector('.edition .btn');
        if (b) b.lastChild.textContent = `Envoi… ${e.pct} %`;
      }
      vibrer(30);
      toast('Document envoyé.');
      envoiPhoto = null;
    } catch (err) {
      if (err.delie) { delie(); return; }
      toast(`L'envoi a échoué : ${err.message}`);
      e.etat = 1;
    }
    docSig = '';
    pageDocuments();
  }

  // ===================== Relier, accueil =====================
  function accueil(message = '', depuisMenu = false) {
    app.innerHTML = '';
    const autres = liaisons.filter((l) => l.cle !== ici || depuisMenu);
    const boite = el('div', { className: 'accueil verre' },
      el('img', { src: 'icone.svg', alt: '' }),
      el('h1', { textContent: 'Compagnon de Saga' }),
      message ? el('p', { textContent: message }) : null,
      el('p', { textContent: depuisMenu ? 'Tes parties reliées :' : 'Sur l\'écran de la partie (Saga, ou la page de jeu de ton navigateur) : Multijoueur › « Relier mon téléphone », puis scanne le QR code avec l\'appareil photo.' }));
    if (autres.length) {
      const l = el('div', { className: 'campagnes' });
      for (const x of autres) l.append(el('a', { href: `${x.cle}/compagnon/` }, el('span', { textContent: x.campagne || x.titre || 'Partie' }), el('small', { textContent: x.mj ? 'MJ' : x.nom })));
      boite.append(l);
    }
    if (depuisMenu && liaison()) {
      const retour = el('button', { className: 'btn', type: 'button' }, 'Revenir à la partie');
      retour.onclick = () => dessiner();
      const quitter = el('button', { className: 'btn2', type: 'button' }, icone('debug-disconnect'), 'Délier ce téléphone');
      quitter.onclick = () => { envoyer('/compagnon/quitter', {}).catch(() => {}); delie('Ce téléphone est délié.'); };
      boite.append(retour, quitter);
    }
    app.append(boite);
  }

  // --- Le départ ---
  async function demarrer() {
    if (window.isSecureContext && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    const code = new URLSearchParams(location.hash.slice(1)).get('lien');
    if (code) {
      history.replaceState(null, '', location.pathname);
      if (!(await relier(code))) { accueil('Ce QR code a déjà servi ou a expiré : demandes-en un nouveau.'); return; }
    } else {
      jeton = liaison()?.jeton || '';
      if (!jeton) { accueil(); return; }
    }
    dessiner();
    ecouter();
  }
  demarrer();
  window.Compagnon = { get vue() { return vue; }, get moi() { return moi; }, get onglet() { return onglet; }, aller: (o) => { onglet = o; dessiner(); }, lancer: (f) => { onglet = 'des'; dessiner(); formuleEl.value = f; lancer(); }, get plateau() { return plateau; } };
})();
