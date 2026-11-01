// Le petit roguelite (Tafl 1.12, joué par Saga 1.14) : le jeu modèle du module roguelite, avec le pack action.
//
// Un camp : le portail lance une partie, le vieil Arne vend les améliorations (avec les Éclats gardés d'une
// partie à l'autre) et soigne. Dix salles de donjon modèles, toutes à quatre portes (elles vont partout) :
// le départ, quatre salles de combat, un trésor, une boutique, une salle de repos et la salle du Gardien, avec
// son escalier et son coffre (un perk parmi trois) qui n'apparaissent qu'une fois la salle vidée. Saga en tire
// trois étages, de plus en plus grands et peuplés.
//
// Les tuiles, les ennemis (slimes, chauves-souris au comportement en JS, squelettes, le Gardien) et les objets
// viennent du petit donjon (exemple-donjon.js) ; ce fichier remplace ses cartes et ajoute le module.

const ExempleRoguelite = (() => {
  const W = 15, H = 11; // une salle : 15 × 11 cases, les portes au milieu de chaque bord

  // Deux tuiles en plus : l'escalier et la fontaine (16 × 16, mises à l'échelle de la taille du jeu).
  const DESSINS = {
    escalier: (x, y) => (y < 2 || y > 13 || x < 2 || x > 13 ? null : y % 3 === 1 ? '#1b1a20' : y % 3 === 2 ? '#57535c' : '#8a8690'),
    fontaine: (x, y) => {
      const d = (x - 7.5) ** 2 + (y - 8) ** 2;
      if (d > 49) return null;
      if (d > 30) return '#8a8690';
      if (y < 6 && Math.abs(x - 7.5) < 1.5) return '#e8f6ff';
      return (x + y) % 5 === 0 ? '#a8d8f0' : '#3d8ad0';
    },
    portail: (x, y) => {
      const d = (x - 7.5) ** 2 / 36 + (y - 8.5) ** 2 / 56;
      if (d > 1) return null;
      if (d > 0.72) return '#6e6a72';
      return d < 0.25 ? '#e0c0ff' : (x + y) % 3 === 0 ? '#9a5ad8' : '#5a2a90';
    },
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

  const dire = (texte, qui = '') => ({ type: 'dire', qui, expression: 'normal', texte });
  const page = (commandes, conditions = []) => ({ conditions, cache: false, commandes });
  const ev = (id, nom, type, x, y, pages, autres = {}) => ({ id, nom, type, x, y, apparence: { personnage: '', tuile: -1 }, direction: 'bas', deplacement: 'fixe', traversable: false, declenchement: 'parler', pages, ...autres });
  const fait = { type: 'local', valeur: true };
  const vide = { type: 'roguelite_salle_vide', valeur: true };

  function remplir(doc) {
    // Les tuiles, les ennemis, le héros, les objets et le script des chauves-souris du petit donjon.
    ExempleDonjon.remplir(doc);
    for (const [nom, f] of Object.entries(DESSINS)) doc.tiles.push({ id: Doc.newId(), name: nom, frames: [tuile(f, doc.tileSize)], duration: Doc.DEFAULT_DURATION, passage: nom === 'escalier' ? 'libre' : 'bloque' });
    const T = Object.fromEntries(doc.tiles.map((t, i) => [t.name, i]));
    const poser = (m, x, y, t, calque = 0) => { if (x >= 0 && y >= 0 && x < m.width && y < m.height) m.layers[calque].cells[y * m.width + x] = t; };
    const rect = (m, x0, y0, w, h, t, calque = 0) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) poser(m, x, y, t, calque); };

    // --- Le camp (16 × 12) ---
    const camp = Doc.newMap({ id: 'camp', name: 'Le camp', width: 16, height: 12 });
    rect(camp, 0, 0, 16, 12, T.herbe);
    rect(camp, 7, 3, 2, 8, T.chemin); rect(camp, 3, 8, 10, 1, T.chemin);
    const arbre = (x, y) => { poser(camp, x, y, T.arbre_haut, 2); poser(camp, x, y + 1, T.arbre_bas, 1); };
    for (let x = 0; x < 16; x++) { arbre(x, 0); arbre(x, 10); }
    for (let y = 2; y < 10; y += 2) { arbre(0, y); arbre(15, y); }
    rect(camp, 6, 1, 4, 2, T.pierre, 1);
    poser(camp, 7, 2, T.portail, 1); poser(camp, 6, 3, T.torche, 1); poser(camp, 9, 3, T.torche, 1);
    rect(camp, 2, 6, 3, 1, T.toit, 1); rect(camp, 2, 7, 3, 1, T.mur, 1); poser(camp, 3, 7, T.fenetre, 1);
    camp.events = [
      ev('portail', 'Le portail', 'panneau', 7, 3, [page([
        dire('Le portail bourdonne. Derrière : un donjon qui change à chaque fois.'),
        { type: 'choix', options: [{ texte: 'Entrer', commandes: [{ type: 'roguelite_partir', graine: 0 }] }, { texte: 'Pas encore', commandes: [] }] },
      ])], { declenchement: 'parler' }),
      ev('arne', 'Le vieil Arne', 'pnj', 5, 8, [
        page([
          dire('Ah, tu reviens du portail ! Chaque partie est différente : les salles sont tirées au hasard.', 'arne'),
          dire('Tes perks disparaissent à la fin, mais les Éclats restent. Rapporte-m\'en : je t\'apprendrai des choses qui servent à chaque partie.', 'arne'),
          { type: 'local', valeur: true },
          { type: 'roguelite_ameliorations' },
          { type: 'soigner' },
        ]),
        page([dire('Alors, on s\'améliore ?', 'arne'), { type: 'roguelite_ameliorations' }, { type: 'soigner' }], [fait]),
      ], { apparence: { personnage: 'arne', tuile: -1 }, direction: 'droite' }),
      ev('panneau', 'Panneau', 'panneau', 9, 8, [page([dire('Le portail : trois étages, et le Gardien au bout de chacun. Tab pendant une partie : tes perks, ou abandonner.')])]),
    ];

    // --- Les salles (15 × 11), toutes à quatre portes ---
    const salle = (id, nom, type, autres = {}) => {
      const m = Doc.newMap({ id, name: nom, width: W, height: H, groupe: 'Salles du donjon', interieur: true });
      rect(m, 0, 0, W, H, T.dalle);
      rect(m, 0, 0, W, 1, T.pierre, 1); rect(m, 0, H - 1, W, 1, T.pierre, 1); rect(m, 0, 0, 1, H, T.pierre, 1); rect(m, W - 1, 0, 1, H, T.pierre, 1);
      for (const [x, y] of [[7, 0], [7, H - 1], [0, 5], [W - 1, 5]]) poser(m, x, y, -1, 1); // les portes
      for (const [x, y] of [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]]) poser(m, x, y, T.torche, 1);
      m.ambiance = { ...m.ambiance, teinte: '#1c2440', force: 35, jour_nuit: false };
      m.salle = { type, poids: 10, etage_min: 1, etage_max: 0, ...autres };
      m.zones = []; m.events = []; m.warps = [];
      return m;
    };
    const zone = (m, id, x, y, w, h, rencontres) => m.zones.push({ id, name: id, type: 'grotte', x, y, w, h, objet: '', taux: 0, rencontres });
    const pierres = (m, l) => { for (const [x, y] of l) poser(m, x, y, T.pierre, 1); };

    const depart = salle('salle-depart', 'Le départ', 'depart');
    depart.events = [ev('stele', 'Stèle', 'panneau', 7, 3, [page([dire('« Les portes s\'ouvrent quand la salle est vide. Le Gardien attend au bout de l\'étage. »')])], { apparence: { personnage: '', tuile: T.pierre } })];

    const slimes = salle('salle-slimes', 'La mare aux slimes', 'combat');
    rect(slimes, 5, 4, 5, 3, T.eau, 1);
    zone(slimes, 'gelee', 2, 2, 11, 7, [{ ennemi: 'slime', nombre: 3 }, { ennemi: 'chauve-souris', nombre: 1, etage_min: 2 }]);

    const piliers = salle('salle-piliers', 'Les piliers', 'combat');
    pierres(piliers, [[4, 3], [10, 3], [4, 7], [10, 7]]);
    zone(piliers, 'garde', 2, 2, 11, 7, [{ ennemi: 'squelette', nombre: 1 }, { ennemi: 'slime', nombre: 2 }, { ennemi: 'squelette', nombre: 1, etage_min: 3 }]);

    const nid = salle('salle-nid', 'Le nid', 'combat', { poids: 8 });
    pierres(nid, [[3, 5], [11, 5], [7, 3], [7, 7]]);
    zone(nid, 'nid', 2, 2, 11, 7, [{ ennemi: 'chauve-souris', nombre: 3 }, { ennemi: 'slime', nombre: 1, etage_min: 2 }]);

    const croix = salle('salle-croix', 'La croix', 'combat', { etage_min: 2 });
    rect(croix, 3, 5, 3, 1, T.pierre, 1); rect(croix, 9, 5, 3, 1, T.pierre, 1); rect(croix, 7, 2, 1, 2, T.pierre, 1); rect(croix, 7, 7, 1, 2, T.pierre, 1);
    zone(croix, 'croix', 2, 2, 11, 7, [{ ennemi: 'squelette', nombre: 2 }, { ennemi: 'chauve-souris', nombre: 2 }]);

    const tresor = salle('salle-tresor', 'Le trésor', 'tresor');
    tresor.events = [ev('coffre', 'Coffre', 'coffre', 7, 4, [
      page([dire('Un coffre ancien…'), { type: 'roguelite_perk', mode: 'hasard', annoncer: true }, { type: 'local', valeur: true }]),
      page([dire('Le coffre est vide.')], [fait]),
    ], { apparence: { personnage: '', tuile: T.coffre } })];

    const boutique = salle('salle-boutique', 'Le marchand', 'boutique');
    boutique.events = [ev('marchand', 'Le marchand', 'pnj', 7, 4, [page([dire('Des pouvoirs à vendre, pour tes pièces ! Ils ne durent qu\'une partie, hein.', 'arne'), { type: 'roguelite_boutique' }])], { apparence: { personnage: 'arne', tuile: -1 } })];

    const repos = salle('salle-repos', 'La fontaine', 'repos');
    repos.events = [ev('fontaine', 'Fontaine', 'panneau', 7, 4, [
      page([dire('L\'eau de la fontaine est fraîche.'), { type: 'roguelite_repos', annoncer: true }, { type: 'local', valeur: true }]),
      page([dire('La fontaine est tarie.')], [fait]),
    ], { apparence: { personnage: '', tuile: T.fontaine } })];

    const boss = salle('salle-gardien', 'La salle du Gardien', 'boss');
    pierres(boss, [[3, 3], [11, 3], [3, 7], [11, 7]]);
    zone(boss, 'gardien', 6, 3, 3, 2, [{ ennemi: 'gardien', nombre: 1 }]);
    // L'escalier et le coffre du Gardien : absents (page 1 « cachée ») tant qu'il reste des ennemis ; la
    // dernière page dont les conditions sont vraies est jouée (la salle vidée, puis le coffre déjà ouvert).
    const absente = { conditions: [], cache: true, commandes: [] };
    boss.events = [
      ev('escalier', 'Escalier', 'declencheur', 7, 5, [absente, page([dire('Un escalier descend dans le noir…'), { type: 'roguelite_suivant' }], [vide])], { apparence: { personnage: '', tuile: T.escalier }, traversable: true, declenchement: 'toucher' }),
      ev('coffre-gardien', 'Coffre du Gardien', 'coffre', 7, 2, [
        absente,
        page([dire('Le coffre du Gardien s\'ouvre.'), { type: 'roguelite_perk', mode: 'choix', annoncer: true }, { type: 'local', valeur: true }], [vide]),
        page([dire('Le coffre est vide.')], [vide, fait]),
      ], { apparence: { personnage: '', tuile: T.coffre } }),
    ];

    const cartes = [camp, depart, slimes, piliers, nid, croix, tresor, boutique, repos, boss];
    for (const c of cartes) c.events = Events.normEvents(c.events, c.width, c.height, doc.tiles.length);
    doc.maps = cartes;
    doc.mapIndex = 0;
    doc.map = camp;
    doc.depart = { carte: 'camp', x: 7, y: 6, direction: 'haut' };

    // --- Les données : le module roguelite, ses perks et ses améliorations ---
    const data = doc.data;
    data.reglages.action = DonneesAction.normRegles({ ...data.reglages.action, defense: 1 });
    data.reglages.modules = ['roguelite'];
    data.reglages.modules_reglages = { ...(data.reglages.modules_reglages || {}), roguelite: DonneesRoguelite.normReglages({ etages: 3, salles: 3, salles_par_etage: 1, tresors: 1, boutiques: 1, repos: 1, monnaie: 'Éclats', monnaie_ennemi: 1, monnaie_etage: 5, monnaie_victoire: 25, renfort: 30, prix_perk: 12 }) };
    const P = DonneesRoguelite.NORMES.perks, A = DonneesRoguelite.NORMES.ameliorations;
    data.perks = [
      { id: 'lame', nom: 'Lame affûtée', description: 'Attaque +15 %.', rarete: 'commun', max: 3, effets: [{ type: 'stat', stat: 'attaque', valeur: 15 }] },
      { id: 'bottes', nom: 'Bottes de vent', description: 'Vitesse +10 %.', rarete: 'commun', max: 2, effets: [{ type: 'stat', stat: 'vitesse', valeur: 10 }] },
      { id: 'fiole', nom: 'Fiole de vie', description: 'Rend tous tes cœurs, tout de suite.', rarete: 'commun', max: 9, effets: [{ type: 'soin' }] },
      { id: 'cotte', nom: 'Cotte de mailles', description: 'Défense +50 %.', rarete: 'rare', max: 2, effets: [{ type: 'stat', stat: 'defense', valeur: 50 }] },
      { id: 'croc', nom: 'Croc du vampire', description: 'Chaque ennemi vaincu te rend 1 PV.', rarete: 'rare', max: 2, effets: [{ type: 'vol_de_vie', valeur: 1 }] },
      { id: 'bourse', nom: 'Bourse d\'éclats', description: 'Éclats +50 %.', rarete: 'rare', max: 2, effets: [{ type: 'monnaie', valeur: 50 }] },
      { id: 'eclair', nom: 'Éclair', description: 'Attaque et vitesse +30 %.', rarete: 'legendaire', max: 1, effets: [{ type: 'stat', stat: 'attaque', valeur: 30 }, { type: 'stat', stat: 'vitesse', valeur: 30 }] },
      { id: 'colere', nom: 'Colère du Gardien', description: 'Attaque +40 %. (Débloqué par le Pacte du Gardien.)', rarete: 'epique', max: 1, verrouille: true, effets: [{ type: 'stat', stat: 'attaque', valeur: 40 }] },
    ].map((p, i) => P(p, i));
    data.ameliorations = [
      { id: 'entrainement', nom: 'Entraînement', description: 'Attaque +5 % par niveau, à chaque partie.', cout: 10, cout_niveau: 10, niveau_max: 5, effets: [{ type: 'stat', stat: 'attaque', valeur: 5 }] },
      { id: 'pas-legers', nom: 'Pas légers', description: 'Vitesse +5 % par niveau.', cout: 15, cout_niveau: 10, niveau_max: 3, effets: [{ type: 'stat', stat: 'vitesse', valeur: 5 }] },
      { id: 'sacoche', nom: 'Sacoche de potions', description: 'Une potion de plus au départ, par niveau.', cout: 20, cout_niveau: 20, niveau_max: 3, effets: [{ type: 'objet', objet: 'potion', nombre: 1 }] },
      { id: 'bourse-depart', nom: 'Bourse de départ', description: '15 pièces de plus au départ, par niveau (pour le marchand).', cout: 10, cout_niveau: 10, niveau_max: 3, effets: [{ type: 'argent', valeur: 15 }] },
      { id: 'pacte', nom: 'Pacte du Gardien', description: 'Le perk « Colère du Gardien » peut sortir.', cout: 60, cout_niveau: 0, niveau_max: 1, effets: [{ type: 'perk', perk: 'colere' }] },
    ].map((a, i) => A(a, i));
  }

  return { remplir };
})();
