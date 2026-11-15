// Le petit survivor (Tafl 1.33, joué par Saga 1.30) : le jeu modèle du module survivor, avec le pack action.
//
// Un camp : le vieil Arne explique le principe, le portail emmène dans l'arène. L'arène est un grand champ
// (48 × 36) semé de rochers et d'arbres : il faut y tenir 5 minutes face à des slimes, des chauves-souris et
// des squelettes de plus en plus nombreux (deux champions à 2 et 4 minutes), puis vaincre le Gardien. Cinq
// armes (dague, hache tournoyante, aura d'ail, foudre, fouet) et huit passifs à prendre en montant de niveau.
//
// Les tuiles, les ennemis et le héros viennent du petit donjon (exemple-donjon.js) ; ce fichier remplace ses
// cartes et ajoute le module.

const ExempleSurvivor = (() => {
  const dire = (texte, qui = '') => ({ type: 'dire', qui, expression: 'normal', texte });
  const page = (commandes, conditions = []) => ({ conditions, cache: false, commandes });
  const ev = (id, nom, type, x, y, pages, autres = {}) => ({ id, nom, type, x, y, apparence: { personnage: '', tuile: -1 }, direction: 'bas', deplacement: 'fixe', traversable: false, declenchement: 'parler', pages, ...autres });
  const fait = { type: 'local', valeur: true };

  // Le portail (16 × 16, mis à l'échelle de la taille du jeu).
  const PORTAIL = (x, y) => {
    const d = (x - 7.5) ** 2 / 36 + (y - 8.5) ** 2 / 56;
    if (d > 1) return null;
    if (d > 0.72) return '#6e6a72';
    return d < 0.25 ? '#ffd0a0' : (x + y) % 3 === 0 ? '#e0603a' : '#902a20';
  };
  function tuile(f, taille) {
    const data = new Uint8ClampedArray(taille * taille * 4);
    for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) {
      const c = f(Math.floor((x * 16) / taille), Math.floor((y * 16) / taille));
      if (!c) continue;
      const [r, g, b] = hexToRgba(c);
      data.set([r, g, b, 255], (y * taille + x) * 4);
    }
    return data;
  }

  const ARMES = [
    { id: 'dague', nom: 'Dague', description: 'Lancée vers l\'ennemi le plus proche.', sorte: 'projectile', couleur: '#e8eef8', degats: 6, recharge: 1, nombre: 1, vitesse: 10, portee: 9, taille: 1, percee: 1,
      niveaux: [{ texte: 'Une dague de plus.', nombre: 1 }, { texte: 'Dégâts +3.', degats: 3 }, { texte: 'Une dague de plus.', nombre: 1 }, { texte: 'Traverse un ennemi de plus.', percee: 1 }, { texte: 'Recharge −20 %.', recharge: 20 }, { texte: 'Deux dagues de plus.', nombre: 2 }, { texte: 'Dégâts +5.', degats: 5 }] },
    { id: 'hache', nom: 'Hache tournoyante', description: 'Tourne autour de toi pendant quelques secondes.', sorte: 'orbite', couleur: '#d0a050', degats: 8, recharge: 3, nombre: 1, vitesse: 3, portee: 1.8, taille: 1, duree: 3,
      niveaux: [{ texte: 'Une hache de plus.', nombre: 1 }, { texte: 'Dure 1 s de plus.', duree: 1 }, { texte: 'Dégâts +4.', degats: 4 }, { texte: 'Une hache de plus.', nombre: 1 }, { texte: 'Plus grande (+25 %).', taille: 25 }, { texte: 'Tourne plus vite (+30 %).', vitesse: 30 }, { texte: 'Une hache de plus, dégâts +4.', nombre: 1, degats: 4 }] },
    { id: 'ail', nom: 'Aura d\'ail', description: 'Blesse les ennemis tout près de toi.', sorte: 'aura', couleur: '#b8f0a0', degats: 3, recharge: 0.8, portee: 1.6, taille: 1,
      niveaux: [{ texte: 'Plus large (+20 %).', taille: 20 }, { texte: 'Dégâts +2.', degats: 2 }, { texte: 'Frappe plus souvent (−15 %).', recharge: 15 }, { texte: 'Plus large (+20 %).', taille: 20 }, { texte: 'Dégâts +2.', degats: 2 }, { texte: 'Plus large (+20 %), dégâts +2.', taille: 20, degats: 2 }] },
    { id: 'foudre', nom: 'Foudre', description: 'Frappe des ennemis au hasard, à l\'écran.', sorte: 'eclair', couleur: '#9ad8ff', degats: 12, recharge: 3, nombre: 2, portee: 0.8, taille: 1,
      niveaux: [{ texte: 'Un éclair de plus.', nombre: 1 }, { texte: 'Dégâts +6.', degats: 6 }, { texte: 'Un éclair de plus.', nombre: 1 }, { texte: 'Plus large (+30 %).', taille: 30 }, { texte: 'Recharge −20 %.', recharge: 20 }, { texte: 'Deux éclairs de plus.', nombre: 2 }] },
    { id: 'fouet', nom: 'Fouet', description: 'Claque à gauche et à droite.', sorte: 'fouet', couleur: '#f0f0f0', degats: 10, recharge: 1.4, nombre: 1, portee: 2.6, taille: 1,
      niveaux: [{ texte: 'Claque des deux côtés.', nombre: 1 }, { texte: 'Dégâts +5.', degats: 5 }, { texte: 'Plus long (+20 %).', taille: 20 }, { texte: 'Recharge −15 %.', recharge: 15 }, { texte: 'Dégâts +5.', degats: 5 }, { texte: 'Plus long (+20 %), dégâts +5.', taille: 20, degats: 5 }] },
  ];
  const PASSIFS = [
    { id: 'epinard', nom: 'Épinard', description: 'Dégâts +10 % par niveau.', effet: 'puissance', valeur: 10, niveau_max: 5 },
    { id: 'grimoire', nom: 'Grimoire', description: 'Recharge −8 % par niveau.', effet: 'recharge', valeur: 8, niveau_max: 5 },
    { id: 'chandelle', nom: 'Chandelle', description: 'Zone +10 % par niveau.', effet: 'zone', valeur: 10, niveau_max: 5 },
    { id: 'aile', nom: 'Aile', description: 'Vitesse +10 % par niveau.', effet: 'vitesse', valeur: 10, niveau_max: 5 },
    { id: 'aimant', nom: 'Aimant', description: 'Ramasse de plus loin (+30 % par niveau).', effet: 'aimant', valeur: 30, niveau_max: 5 },
    { id: 'armure', nom: 'Armure', description: '1 dégât de moins par coup reçu, par niveau.', effet: 'armure', valeur: 1, niveau_max: 3 },
    { id: 'duplicateur', nom: 'Duplicateur', description: 'Un projectile de plus par arme, par niveau.', effet: 'nombre', valeur: 1, niveau_max: 2 },
    { id: 'couronne', nom: 'Couronne', description: 'Expérience +8 % par niveau.', effet: 'croissance', valeur: 8, niveau_max: 5 },
  ];

  function remplir(doc) {
    ExempleDonjon.remplir(doc);
    doc.tiles.push({ id: Doc.newId(), name: 'portail', frames: [tuile(PORTAIL, doc.tileSize)], duration: Doc.DEFAULT_DURATION, passage: 'bloque' });
    const T = Object.fromEntries(doc.tiles.map((t, i) => [t.name, i]));
    const poser = (m, x, y, t, calque = 0) => { if (x >= 0 && y >= 0 && x < m.width && y < m.height) m.layers[calque].cells[y * m.width + x] = t; };
    const rect = (m, x0, y0, w, h, t, calque = 0) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) poser(m, x, y, t, calque); };
    const arbre = (m, x, y) => { poser(m, x, y, T.arbre_haut, 2); poser(m, x, y + 1, T.arbre_bas, 1); };

    // --- Le camp (16 × 12) ---
    const camp = Doc.newMap({ id: 'camp', name: 'Le camp', width: 16, height: 12 });
    rect(camp, 0, 0, 16, 12, T.herbe);
    rect(camp, 7, 3, 2, 8, T.chemin); rect(camp, 3, 8, 10, 1, T.chemin);
    for (let x = 0; x < 16; x++) { arbre(camp, x, 0); arbre(camp, x, 10); }
    for (let y = 2; y < 10; y += 2) { arbre(camp, 0, y); arbre(camp, 15, y); }
    rect(camp, 6, 1, 4, 2, T.pierre, 1);
    poser(camp, 7, 2, T.portail, 1); poser(camp, 6, 3, T.torche, 1); poser(camp, 9, 3, T.torche, 1);
    rect(camp, 2, 6, 3, 1, T.toit, 1); rect(camp, 2, 7, 3, 1, T.mur, 1); poser(camp, 3, 7, T.fenetre, 1);
    camp.events = [
      ev('portail', 'Le portail', 'panneau', 7, 3, [page([
        dire('Le portail gronde. De l\'autre côté : le champ maudit, et ses hordes.'),
        { type: 'choix', options: [{ texte: 'Entrer dans l\'arène', commandes: [{ type: 'survivor_lancer', arene: 'champ' }] }, { texte: 'Pas encore', commandes: [] }] },
      ])], { declenchement: 'parler' }),
      ev('arne', 'Le vieil Arne', 'pnj', 5, 8, [
        page([
          dire('Le champ maudit, derrière le portail… Les bêtes y arrivent par centaines.', 'arne'),
          dire('Là-bas, tu n\'as qu\'à bouger : tes armes frappent toutes seules. Ramasse les gemmes qu\'ils laissent : à chaque niveau, tu choisis une nouvelle arme ou un renfort.', 'arne'),
          dire('Tiens cinq minutes, puis bats le Gardien. Échap pendant la partie : voir tes armes, ou abandonner.', 'arne'),
          { type: 'local', valeur: true },
          { type: 'soigner' },
        ]),
        page([dire('Alors, ce champ ? Reviens quand tu veux, je soigne.', 'arne'), { type: 'soigner' }], [fait]),
        page([dire('Tu as vaincu le champ maudit ! Personne n\'y était arrivé depuis des années.', 'arne'), { type: 'soigner' }], [fait, { type: 'survivor_victoires', arene: 'champ', min: 1 }]),
      ], { apparence: { personnage: 'arne', tuile: -1 }, direction: 'droite' }),
      ev('panneau', 'Panneau', 'panneau', 9, 8, [page([dire('Le champ maudit : 5 minutes, puis le Gardien. Ton record s\'affiche dans le menu du jeu (Échap), page Arènes.')])]),
    ];

    // --- L'arène (48 × 36) : un champ avec des bosquets et des rochers, un mur d'arbres tout autour ---
    const W = 48, H = 36;
    const champ = Doc.newMap({ id: 'champ', name: 'Le champ maudit', width: W, height: H });
    rect(champ, 0, 0, W, H, T.herbe);
    rect(champ, 2, H / 2, W - 4, 1, T.chemin); rect(champ, W / 2, 2, 1, H - 4, T.chemin);
    for (let x = 0; x < W; x++) { arbre(champ, x, 0); arbre(champ, x, H - 2); }
    for (let y = 2; y < H - 2; y += 2) { arbre(champ, 0, y); arbre(champ, W - 1, y); }
    // Des bosquets et des rochers (jamais sur la croix des chemins, ni au centre).
    const bruit = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) % 1000; };
    for (let y = 3; y < H - 4; y += 3) for (let x = 3; x < W - 3; x += 3) {
      const n = bruit(x, y);
      if (Math.abs(x - W / 2) < 4 && Math.abs(y - H / 2) < 4) continue;
      if (x === W / 2 || y === H / 2 || y + 1 === H / 2) continue;
      if (n < 120) arbre(champ, x + (n % 2), y);
      else if (n < 190) poser(champ, x + (n % 3) - 1, y + 1, T.pierre, 1);
    }
    rect(champ, 12, 8, 3, 2, T.eau, 1); rect(champ, 33, 25, 4, 2, T.eau, 1);
    for (const [x, y] of [[W / 2 - 1, H / 2 - 1], [W / 2 + 1, H / 2 + 1]]) poser(champ, x, y, T.torche, 1);
    champ.ambiance = { ...champ.ambiance, teinte: '#402040', force: 18, jour_nuit: false };
    champ.zones = []; champ.warps = []; champ.events = [];

    const cartes = [camp, champ];
    for (const c of cartes) c.events = Events.normEvents(c.events, c.width, c.height, doc.tiles.length);
    doc.maps = cartes;
    doc.mapIndex = 0;
    doc.map = camp;
    doc.depart = { carte: 'camp', x: 7, y: 6, direction: 'haut' };

    // --- Les données : le héros plus solide et sans recul, les ennemis du donjon, le module ---
    const data = doc.data;
    data.reglages.action = DonneesAction.normRegles({ ...data.reglages.action, coeurs: 5, pv_coeur: 4, defense: 0, vitesse: 4.6, invincibilite: 0.6, recul: 0 });
    // Des ennemis un peu plus lents que dans le donjon (ils sont cent fois plus nombreux).
    for (const e of data.ennemis) {
      if (e.id === 'slime') Object.assign(e, { vitesse: 1.4, xp: 1 });
      if (e.id === 'chauve-souris') Object.assign(e, { vitesse: 2.6, xp: 2 });
      if (e.id === 'squelette') Object.assign(e, { vitesse: 1.6, pv: 14, xp: 5 });
      if (e.id === 'gardien') Object.assign(e, { pv: 400, vitesse: 1.4, xp: 50 });
    }
    data.reglages.modules = ['survivor'];
    data.reglages.modules_reglages = { ...(data.reglages.modules_reglages || {}), survivor: DonneesSurvivor.normReglages({ arme_depart: 'dague', choix: 3, armes_max: 5, passifs_max: 5, xp_base: 5, xp_pas: 7, aimant: 1.6, ennemis_max: 300, soin_choix: 4, coeur_chance: 1.2 }) };
    const S = DonneesSurvivor.NORMES;
    data.armes = ARMES.map((a, i) => S.armes(a, i));
    data.passifs = PASSIFS.map((p, i) => S.passifs(p, i));
    data.arenes = [S.arenes({
      id: 'champ', nom: 'Le champ maudit', description: 'Cinq minutes de horde, puis le Gardien.',
      carte: 'champ', duree: 5, fin: 'boss', boss_final: 'gardien', renfort: 12,
      depart: { x: W / 2, y: H / 2 + 2 }, retour: { carte: 'camp', x: 7, y: 6, direction: 'bas' },
      vagues: [
        { ennemi: 'slime', de: 0, a: 1.5, par_minute: 60, groupe: 3 },
        { ennemi: 'slime', de: 1.5, a: 0, par_minute: 110, groupe: 5 },
        { ennemi: 'chauve-souris', de: 0.75, a: 0, par_minute: 45, groupe: 3 },
        { ennemi: 'squelette', de: 2.5, a: 0, par_minute: 30, groupe: 2, max: 40 },
        { ennemi: 'chauve-souris', de: 4, a: 0, par_minute: 120, groupe: 8 },
      ],
      boss: [{ ennemi: 'squelette', minute: 2, nombre: 1 }, { ennemi: 'squelette', minute: 4, nombre: 2 }],
    }, 0)];
  }

  return { remplir };
})();
