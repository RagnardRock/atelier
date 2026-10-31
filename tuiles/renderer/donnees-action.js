// Les données du pack « action » (Tafl 1.10, joué par Saga 1.12 en temps réel : moteur/renderer/moteur/action/).
//
// Une sorte : les ennemis (leur vie, leur force, leur vitesse, leur vue, leur comportement, ce qu'ils
// laissent) ; les réglages du héros (reglages.action : ses cœurs, son attaque, son recul…) ; les zones qui
// font apparaître les ennemis (rencontres [{ ennemi, nombre }]) ; et, sur la fiche d'un personnage, ses
// animations (repos, attaque, coup, mort) et ses boîtes (son corps, la portée de son coup). Le format est
// dans ../FORMAT.md › « Le pack action ».
//
// Comme donnees-gestion.js : ce fichier est lu avant donnees.js, qui prend ses sortes, ses normes et ses
// onglets. Les normes gardent les champs qu'elles ne connaissent pas.

const DonneesAction = (() => {
  const SORTES = ['ennemis'];
  const PACK = ['action'];

  const str = (v, d = '') => (v === undefined || v === null || typeof v === 'object' ? d : String(v));
  const num = (v, d = 0, min = -Infinity, max = Infinity) => { const n = Number(v); return v !== '' && v !== null && v !== undefined && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
  const int = (v, d = 0, min = -Infinity, max = Infinity) => Math.round(num(v, d, min, max));
  const arr = (v) => (Array.isArray(v) ? v : []);
  const propre = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? JSON.parse(JSON.stringify(o)) : {});
  const ident = (v, d) => (typeof Doc !== 'undefined' ? Doc.slug(v, d) : String(v || d));

  // Ce que fait un ennemi (Saga › action/comportements.js).
  const COMPORTEMENTS = [
    ['patrouiller', 'Patrouiller : il se promène près de sa place, et chasse le joueur qu\'il voit'],
    ['suivre', 'Suivre : il attend, puis suit le joueur longtemps une fois qu\'il l\'a vu'],
    ['garde', 'Garder : il chasse le joueur qui approche, puis revient à sa place'],
    ['fuir', 'Fuir : il s\'éloigne du joueur (et se défend s\'il est coincé)'],
    ['immobile', 'Immobile : il ne bouge pas (une plante, une tourelle)'],
    ['script', 'Script : un comportement écrit en JavaScript (comportement() dans un script du jeu)'],
  ];

  const NORMES = {
    ennemis: (e, i) => ({
      ...propre(e),
      id: ident(e?.id || e?.nom, `ennemi-${i + 1}`),
      nom: str(e?.nom || e?.id, `Ennemi ${i + 1}`).slice(0, 60),
      numero: int(e?.numero, i + 1, 0, 9999),
      description: str(e?.description).slice(0, 300),
      personnage: ident(e?.personnage, ''),
      couleur: /^#[0-9a-f]{6}$/i.test(e?.couleur || '') ? e.couleur.toLowerCase() : '#9b59d0',
      pv: int(e?.pv, 3, 1, 99999),
      attaque: num(e?.attaque, 1, 0, 9999),
      defense: num(e?.defense, 0, 0, 9999),
      vitesse: num(e?.vitesse, 2.5, 0, 20),
      vue: num(e?.vue, 5, 0, 40),
      comportement: COMPORTEMENTS.some(([k]) => k === e?.comportement) ? e.comportement : 'patrouiller',
      script: ident(e?.script, ''),
      portee: num(e?.portee, 0, 0, 6),
      recharge: num(e?.recharge, 1.2, 0.2, 10),
      contact: e?.contact !== false,
      poids: num(e?.poids, 1, 0.1, 10),
      xp: int(e?.xp, 3, 0, 999999),
      argent: int(e?.argent, 1, 0, 999999),
      coeur: int(e?.coeur, 20, 0, 100),
      butin: arr(e?.butin).filter((b) => b && b.objet).slice(0, 12).map((b) => ({ objet: ident(b.objet, ''), chance: int(b.chance, 10, 0, 100) })).filter((b) => b.objet),
      boss: Boolean(e?.boss),
    }),
  };

  // Les réglages du héros : reglages.action.
  const REGLES = { coeurs: 3, pv_coeur: 4, attaque: 2, defense: 0, vitesse: 5, invincibilite: 1, recul: 1.5, pv_niveau: 2, attaque_niveau: 1, xp_niveau: 20 };
  const normRegles = (a) => ({
    ...propre(a),
    coeurs: int(a?.coeurs, REGLES.coeurs, 1, 40),
    pv_coeur: int(a?.pv_coeur, REGLES.pv_coeur, 1, 100),
    attaque: num(a?.attaque, REGLES.attaque, 0, 999),
    defense: num(a?.defense, REGLES.defense, 0, 999),
    vitesse: num(a?.vitesse, REGLES.vitesse, 1, 20),
    invincibilite: num(a?.invincibilite, REGLES.invincibilite, 0, 5),
    recul: num(a?.recul, REGLES.recul, 0, 6),
    pv_niveau: num(a?.pv_niveau, REGLES.pv_niveau, 0, 100),
    attaque_niveau: num(a?.attaque_niveau, REGLES.attaque_niveau, 0, 100),
    xp_niveau: int(a?.xp_niveau, REGLES.xp_niveau, 1, 100000),
  });

  // Sur un personnage : ses animations, son corps et la portée de son coup (null = ce que Saga choisit).
  const ANIMATIONS = [['repos', 'Repos (il respire, sur place)'], ['attaque', 'Attaque (son coup)'], ['coup', 'Coup reçu (il recule)'], ['mort', 'Mort (vaincu)']];
  function normPersonnage(p, tileSize = 16) {
    const out = {};
    const anims = {};
    for (const [k] of ANIMATIONS) {
      const s = typeof Sprites !== 'undefined' ? Sprites.norm(p?.animations?.[k], tileSize) : null;
      if (s) anims[k] = { ...s, duree: int(p.animations[k].duree, 80, 16, 2000) };
    }
    if (Object.keys(anims).length) out.animations = anims;
    const h = p?.hitbox;
    if (h && Number(h.largeur) > 0 && Number(h.hauteur) > 0) out.hitbox = { x: int(h.x, 0, -256, 256), y: int(h.y, 0, -256, 256), largeur: int(h.largeur, tileSize, 1, 512), hauteur: int(h.hauteur, tileSize, 1, 512) };
    const f = p?.frappe;
    if (f && (Number(f.portee) > 0 || Number(f.largeur) > 0)) out.frappe = { portee: int(f.portee, Math.round(tileSize * 0.9), 1, 512), largeur: int(f.largeur, Math.round(tileSize * 1.1), 1, 512) };
    return out;
  }

  const U = () => Donnees.ui;
  function listes(data) {
    U().datalist('tafl-ennemis', arr(data.ennemis).map((e) => [e.id, e.nom]));
  }

  // --- La fiche d'un ennemi ---
  function formEnnemi(e, ctx) {
    const { champ, info, nombreIn, section, sel, refInfo, descNom, table } = U();
    const idl = ctx.idLigne(e);
    Donnees.listes(ctx.work);
    const persos = arr(ctx.work.personnages);
    const choixPerso = [['', 'Aucun : un petit bonhomme à sa couleur'], ...persos.filter((p) => !p.heros).map((p) => [p.id, `${p.nom}${p.sprite ? '' : ' (sans sprite)'}`])];
    const couleur = el('input', { type: 'color', value: e.couleur || '#9b59d0' });
    couleur.oninput = () => { e.couleur = couleur.value; ctx.renderListe?.(); };
    const script = el('div');
    const majScript = () => {
      script.replaceChildren(...(e.comportement === 'script' ? [
        champ('Nom du comportement', ctx.input(e, 'script', 'chauve_souris'), 'déclaré dans un script : comportement(\'chauve_souris\', (etat) => ({ … }))'),
        info('Le script reçoit l\'état de l\'ennemi (où il est, où est le joueur, sa vue, sa vie…) quelques fois par seconde et rend sa décision : un but { x, y } à rejoindre, fuir, ou frapper. Voir SCRIPTS.md › « Les ennemis du temps réel ».'),
      ] : []));
    };
    majScript();
    if (!Array.isArray(e.butin)) e.butin = [];
    ctx.form.append(
      champ('Nom', ctx.input(e, 'nom', 'Slime, Chauve-souris, Chevalier squelette…', idl.maj)), idl.el,
      el('label', { className: 'field field-textarea' }, [el('span', { className: 'field-label', textContent: 'Description' }), ctx.zone(e, 'description', 2, 'Ce que dit le bestiaire une fois qu\'on l\'a vaincu.')]),
      el('div', { className: 'field-grid' }, [
        champ('Numéro', nombreIn(e, 'numero', 0, 9999), 'son ordre dans le bestiaire'),
        champ('Boss', ctx.coche(e, 'boss'), 'vaincu une fois, il ne revient plus'),
      ]),
      section('Apparence'),
      champ('Personnage', sel(choixPerso, e.personnage || '', (v) => { e.personnage = v; ctx.renderListe?.(); }), 'son sprite, ses animations et ses boîtes (onglet Personnages)'),
      el('div', { className: 'field' }, [el('span', { className: 'field-label', textContent: 'Couleur' }), couleur, el('span', { className: 'unit', textContent: 'sans personnage : le petit bonhomme de Saga, à cette couleur' })]),
      section('Combat'),
      el('div', { className: 'field-grid' }, [
        champ('PV', nombreIn(e, 'pv', 1, 99999), 'le héros enlève son attaque − cette défense à chaque coup'),
        champ('Attaque', nombreIn(e, 'attaque', 0, 9999, 0.5), 'PV perdus par le héros (moins sa défense)'),
        champ('Défense', nombreIn(e, 'defense', 0, 9999, 0.5)),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Blesse au contact', ctx.coche(e, 'contact'), 'le toucher fait mal'),
        champ('Frappe de', nombreIn(e, 'portee', 0, 6, 0.1), 'cases (0 : il ne frappe pas, il blesse au contact)'),
        champ('Entre deux coups', nombreIn(e, 'recharge', 0.2, 10, 0.1), 'secondes'),
      ]),
      champ('Poids', nombreIn(e, 'poids', 0.1, 10, 0.1), '1 : normal ; plus lourd, il recule moins quand on le frappe'),
      section('Déplacement et comportement'),
      el('div', { className: 'field-grid' }, [
        champ('Vitesse', nombreIn(e, 'vitesse', 0, 20, 0.1), 'cases par seconde (le héros : 5 par défaut)'),
        champ('Vue', nombreIn(e, 'vue', 0, 40, 0.5), 'cases : à cette distance, il remarque le joueur'),
      ]),
      champ('Comportement', sel(COMPORTEMENTS, e.comportement, (v) => { e.comportement = v; majScript(); })),
      script,
      info('Il trouve son chemin sur la grille de passage de la carte (le plus court, en évitant murs, eau et rebords). La touche F3 de Saga montre son chemin et ce qu\'il pense.'),
      section('Ce qu\'il laisse'),
      el('div', { className: 'field-grid' }, [
        champ('Expérience', nombreIn(e, 'xp', 0, 999999)),
        champ(ctx.work.reglages?.monnaie || 'Argent', nombreIn(e, 'argent', 0, 999999)),
        champ('Cœur', nombreIn(e, 'coeur', 0, 100), '% de chance d\'en laisser un'),
      ]),
      el('div', { className: 'field field-block' }, [el('span', { className: 'field-label', textContent: 'Butin' }), table(e.butin, [
        ['Objet', (b) => refInfo(b, 'objet', 'tafl-donnees-objets', 'potion', descNom(arr(ctx.work.objets))), true],
        ['Chance %', (b) => nombreIn(b, 'chance', 0, 100)],
      ], () => ({ objet: '', chance: 10 }), { ajouter: '+ Objet', max: 12, vide: 'Rien (à part l\'argent et parfois un cœur).' })]),
      info('Pour qu\'il apparaisse : dessine une zone sur une carte (outil Zone), et ajoute-le dans ses ennemis, avec leur nombre. Ils reviennent quand on revient sur la carte (sauf un boss vaincu).'),
      section('Utilisation'), ctx.usages('ennemi', e.id),
    );
  }

  // --- Les réglages du héros (Réglages › Règles du jeu) ---
  function formRegles(r, ctx) {
    const { champ, info, nombreIn, section } = U();
    r.action = normRegles(r.action);
    const a = r.action;
    return [
      section('Le héros (temps réel)'),
      el('div', { className: 'field-grid' }, [
        champ('Cœurs au départ', nombreIn(a, 'coeurs', 1, 40)),
        champ('PV par cœur', nombreIn(a, 'pv_coeur', 1, 100), '4 : un coup d\'attaque 1 enlève un quart de cœur'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Attaque', nombreIn(a, 'attaque', 0, 999, 0.5), 'PV enlevés par un coup d\'épée (moins la défense de l\'ennemi)'),
        champ('Défense', nombreIn(a, 'defense', 0, 999, 0.5)),
        champ('Vitesse', nombreIn(a, 'vitesse', 1, 20, 0.1), 'cases par seconde'),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('Invincible après un coup', nombreIn(a, 'invincibilite', 0, 5, 0.1), 'secondes (il clignote)'),
        champ('Recul', nombreIn(a, 'recul', 0, 6, 0.1), 'cases, quand il est touché'),
      ]),
      section('Progression'),
      el('div', { className: 'field-grid' }, [
        champ('Expérience', nombreIn(a, 'xp_niveau', 1, 100000), 'pour le niveau 2 (puis 2×, 3×… de plus à chaque niveau)'),
        champ('Niveau maximum', nombreIn(r, 'niveau_max', 1, 999)),
      ]),
      el('div', { className: 'field-grid' }, [
        champ('PV gagnés par niveau', nombreIn(a, 'pv_niveau', 0, 100), `${a.pv_coeur} = un cœur entier`),
        champ('Attaque gagnée par niveau', nombreIn(a, 'attaque_niveau', 0, 100, 0.5)),
      ]),
      info('Dans Saga, le joueur bouge librement (en diagonale aussi) et frappe avec la touche Action ; devant quelqu\'un, Action parle comme d\'habitude. Les ennemis sont dans l\'onglet Ennemis ; les zones des cartes les font apparaître. Le héros est le personnage coché « héros » : ses animations et ses boîtes se règlent sur sa fiche.'),
    ];
  }

  // --- Les ennemis d'une zone (la fenêtre de la zone) ---
  function tableRencontres(doc, rencontres) {
    const { table, refInfo, nombreIn } = U();
    listes(doc.data);
    const box = table(rencontres, [
      ['Ennemi', (r) => refInfo(r, 'ennemi', 'tafl-ennemis', 'slime', (id) => { const e = arr(doc.data.ennemis).find((x) => x.id === id); return e ? el('span', { textContent: `${e.nom} · ${e.pv} PV${e.boss ? ' · boss' : ''}` }) : null; }), true],
      ['Nombre', (r) => nombreIn(r, 'nombre', 1, 30)],
    ], () => ({ ennemi: rencontres.at(-1)?.ennemi || '', nombre: 1 }), { ajouter: '+ Ennemi', max: 20 });
    return el('div', { className: 'field field-block' }, [
      el('span', { className: 'field-label', textContent: 'Ennemis (temps réel)' }), box,
      el('p', { className: 'modal-info', textContent: 'Ils apparaissent au hasard dans la zone quand le joueur arrive sur la carte, loin de lui. Le taux de rencontre ne sert pas ici.' }),
    ]);
  }

  // --- Sur la fiche d'un personnage : ses animations et ses boîtes ---
  function formPersonnage(p, work, render, doc) {
    const { champ, info, section, sel, nombreIn } = U();
    const t = doc.tileSize;
    if (!p.animations || typeof p.animations !== 'object') p.animations = {};
    let choix = ANIMATIONS[0][0];
    try { choix = localStorage.getItem('tafl.animationChoisie') || choix; } catch { /* sans stockage */ }
    if (!ANIMATIONS.some(([k]) => k === choix)) choix = ANIMATIONS[0][0];
    const boite = el('div');
    // L'éditeur de sprite de Tafl, sur une animation : il croit modifier p.sprite.
    function rendreAnimation() {
      const k = choix;
      const vue = {
        get id() { return `${p.id}-${k}`; },
        get nom() { return `${p.nom} (${ANIMATIONS.find(([x]) => x === k)[1].split(' (')[0].toLowerCase()})`; },
        get sprite() { return p.animations[k] || null; },
        set sprite(v) {
          if (v) p.animations[k] = { ...v, duree: p.animations[k]?.duree || 80 };
          else delete p.animations[k];
        },
      };
      const a = p.animations[k];
      const copier = el('button', { className: 'button small', type: 'button' }, [icon('copy'), el('span', { textContent: 'Partir du sprite de marche' })]);
      copier.disabled = !p.sprite;
      copier.onclick = (ev) => { ev.preventDefault(); if (!p.sprite) return; p.animations[k] = { ...p.sprite, duree: a?.duree || 80 }; rendreAnimation(); };
      boite.replaceChildren(
        champ('Animation', sel(ANIMATIONS, k, (v) => { choix = v; try { localStorage.setItem('tafl.animationChoisie', v); } catch { /* */ } rendreAnimation(); })),
        ...(a ? [champ('Durée d\'une image', nombreIn(a, 'duree', 16, 2000, 10), 'millisecondes')] : [el('div', { className: 'sprite-actions' }, [copier])]),
        Sprites.editeur(vue, { tileSize: t, palette: doc.palette, change: () => render?.(), tuile: () => null }),
      );
    }
    rendreAnimation();
    return [
      section('Temps réel : animations (pack action)'),
      info('Chaque animation est une planche comme le sprite : 4 rangées (face, gauche, droite, dos). Sans elle, Saga se débrouille : la marche au repos, une lame qui balaie pour l\'attaque, un clignotement pour un coup, un fondu pour la mort.'),
      boite,
      section('Temps réel : boîtes de coups'),
      editeurBoites(p, t),
    ];
  }

  // Le corps (ce qu'un coup touche, et les pieds qui se cognent aux murs) et la zone de son coup, sur l'image du personnage.
  function editeurBoites(p, t) {
    const { champ, info, nombreIn } = U();
    const Z = 8;
    const toile = el('canvas', { className: 'boites-apercu checker', width: t * 3 * Z, height: t * 2 * Z });
    toile.style.imageRendering = 'pixelated';
    toile.style.maxWidth = '100%';
    const defCorps = () => ({ x: Math.round(t * 0.18), y: Math.round(t * 0.3), largeur: Math.round(t * 0.64), hauteur: Math.round(t * 0.66) });
    const defFrappe = () => ({ portee: Math.round(t * 0.9), largeur: Math.round(t * 1.1) });
    const corps = p.hitbox ? { ...p.hitbox } : defCorps();
    const frappe = p.frappe ? { ...p.frappe } : defFrappe();
    const perso = el('label', { className: 'field checkbox-row' });
    const coche = el('input', { type: 'checkbox', checked: Boolean(p.hitbox || p.frappe) });
    const champs = el('div');
    function ecrire() {
      if (coche.checked) { p.hitbox = { ...corps }; p.frappe = { ...frappe }; } else { delete p.hitbox; delete p.frappe; }
      dessiner();
    }
    function dessiner() {
      const g = toile.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, toile.width, toile.height);
      // Le personnage sur la case du milieu (en bas), tourné vers la droite.
      const ox = t, oy = t;
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 1;
      for (let x = 0; x <= 3; x++) { g.beginPath(); g.moveTo(x * t * Z + 0.5, 0); g.lineTo(x * t * Z + 0.5, toile.height); g.stroke(); }
      for (let y = 0; y <= 2; y++) { g.beginPath(); g.moveTo(0, y * t * Z + 0.5); g.lineTo(toile.width, y * t * Z + 0.5); g.stroke(); }
      const s = p.sprite;
      if (s) {
        const img = Sprites.charger(s.planche);
        const poser = () => g.drawImage(img, 0, s.hauteur * 2, s.largeur, s.hauteur, (ox + Math.floor((t - s.largeur) / 2)) * Z, (oy + t - s.hauteur) * Z, s.largeur * Z, s.hauteur * Z);
        if (img.complete && img.naturalWidth) poser(); else img.onload = () => dessiner();
      } else {
        g.fillStyle = p.couleur || '#d94a4a';
        g.globalAlpha = 0.5;
        g.fillRect((ox + t * 0.25) * Z, (oy + t * 0.1) * Z, t * 0.5 * Z, t * 0.85 * Z);
        g.globalAlpha = 1;
      }
      const c = coche.checked ? corps : defCorps(), f = coche.checked ? frappe : defFrappe();
      const r = (x, y, l, h, couleur, fond) => { g.fillStyle = fond; g.fillRect(x * Z, y * Z, l * Z, h * Z); g.strokeStyle = couleur; g.lineWidth = 2; g.strokeRect(x * Z + 1, y * Z + 1, l * Z - 2, h * Z - 2); };
      r(ox + c.x, oy + c.y, c.largeur, c.hauteur, '#5aff78', 'rgba(90,255,120,0.18)');
      // Les pieds (le bas du corps), comme Saga les calcule.
      r(ox + c.x + c.largeur * 0.08, oy + c.y + c.hauteur * 0.55, c.largeur * 0.84, c.hauteur * 0.45, '#5aaaff', 'rgba(90,170,255,0.15)');
      // Le coup, vers la droite : depuis le milieu du corps.
      const cx = ox + c.x + c.largeur / 2, cy = oy + c.y + c.hauteur / 2;
      r(cx + (c.largeur / 2) * 0.4, cy - f.largeur / 2, f.portee, f.largeur, '#ff5050', 'rgba(255,80,80,0.15)');
    }
    function rendreChamps() {
      const maj = () => ecrire();
      champs.replaceChildren(...(coche.checked ? [
        el('div', { className: 'field-grid' }, [
          champ('Corps : x', nombreIn(corps, 'x', -256, 256, 1, maj)), champ('y', nombreIn(corps, 'y', -256, 256, 1, maj)),
          champ('largeur', nombreIn(corps, 'largeur', 1, 512, 1, maj)), champ('hauteur', nombreIn(corps, 'hauteur', 1, 512, 1, maj), 'px, depuis le coin haut gauche de sa case'),
        ]),
        el('div', { className: 'field-grid' }, [
          champ('Coup : portée', nombreIn(frappe, 'portee', 1, 512, 1, maj), 'px devant lui'), champ('largeur', nombreIn(frappe, 'largeur', 1, 512, 1, maj), 'px'),
        ]),
      ] : []));
    }
    coche.onchange = () => { rendreChamps(); ecrire(); };
    perso.append(el('span', { className: 'field-label', textContent: 'Ses propres boîtes (sinon celles de Saga, à la taille d\'une case)' }), coche);
    rendreChamps();
    dessiner();
    return el('div', { className: 'field field-block' }, [
      toile,
      el('p', { className: 'modal-info', textContent: 'Vert : son corps (ce que les coups touchent). Bleu : ses pieds (ce qui se cogne aux murs). Rouge : la zone que touche son coup, ici vers la droite. Une case = un carré de la grille.' }),
      perso, champs,
    ]);
  }

  function resumer(doc, sorte, o) {
    if (sorte !== 'ennemis') return null;
    return `${o.id} « ${o.nom} » N°${o.numero}${o.boss ? ' boss' : ''} PV ${o.pv} att ${o.attaque} déf ${o.defense} vitesse ${o.vitesse} vue ${o.vue} ${o.comportement}${o.script ? ` (${o.script})` : ''}${o.portee ? ` frappe à ${o.portee}` : ''}${o.contact ? ', blesse au contact' : ''}, xp ${o.xp}, argent ${o.argent}, cœur ${o.coeur} %${o.butin.length ? `, butin ${o.butin.map((b) => `${b.objet} ${b.chance} %`).join(', ')}` : ''}${o.personnage ? `, personnage ${o.personnage}` : ''}`;
  }
  // Où un ennemi est utilisé (Donnees.utilisations) : les zones des cartes.
  function utilisations(doc, sorte, id, out) {
    if (sorte !== 'ennemi') return;
    for (const m of doc.maps || []) for (const z of m.zones || []) if ((z.rencontres || []).some((r) => r.ennemi === id)) out.add(`${m.name} › zone ${z.name || z.id}`);
  }

  const ONGLETS = [
    {
      key: 'ennemis', packs: PACK, groupe: 'Combat', label: 'Ennemis', icon: 'bug', kind: 'ennemi', base: 'Nouvel ennemi',
      nouveau: (id, work) => NORMES.ennemis({ id, nom: 'Nouvel ennemi', numero: Math.max(0, ...arr(work.ennemis).map((e) => e.numero)) + 1 }, 0),
      meta: (e) => `${e.pv} PV · ${COMPORTEMENTS.find(([k]) => k === e.comportement)?.[1].split(' :')[0] || e.comportement}${e.boss ? ' · boss' : ''}`,
      lead: (e) => el('span', { className: 'row-dot', style: { background: e.couleur || '#9b59d0' } }),
      vide: 'Aucun ennemi. Chacun : sa vie, sa force, sa vitesse, sa vue, son comportement et son butin. Les zones des cartes les font apparaître.',
      form: formEnnemi,
    },
  ];

  return { SORTES, PACK, NORMES, ONGLETS, COMPORTEMENTS, ANIMATIONS, normRegles, normPersonnage, listes, formRegles, tableRencontres, formPersonnage, resumer, utilisations };
})();
