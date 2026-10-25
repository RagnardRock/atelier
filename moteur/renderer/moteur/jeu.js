// Chargement d'un jeu Tafl (voir tuiles/FORMAT.md) : les textes lus par main.js deviennent des objets
// prêts à jouer. Ce fichier ne touche ni au disque ni à la fenêtre : il reçoit des textes et rend un jeu.
//
// Ce qu'on prépare ici, une fois pour toutes :
// - les tuiles : toutes leurs images (et les images de chaque tuile animée) recollées dans UNE grande
//   planche (un canvas). Dessiner une carte, c'est alors copier des petits carrés de cette planche,
//   ce que le canvas fait très vite.
// - les cartes : leurs calques, leur grille de collisions (recalculée si elle manque), leurs zones,
//   téléporteurs, événements et ambiance, avec des valeurs par défaut pour tout champ absent.

const Jeu = (() => {
  const VERSION_CONNUE = 1;
  const PASSAGE = { auto: 0, libre: 1, bloque: 2, rebord_bas: 3, rebord_haut: 4, rebord_gauche: 5, rebord_droite: 6 };
  const DIRECTIONS = { bas: [0, 1], haut: [0, -1], gauche: [-1, 0], droite: [1, 0] };
  // Le rebord se saute dans SA direction : code 3 → vers le bas, etc.
  const REBORDS = { 3: 'bas', 4: 'haut', 5: 'gauche', 6: 'droite' };
  const FUSIONS = new Set(['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'lighter', 'darken', 'lighten', 'color', 'color-dodge', 'color-burn', 'hue', 'saturation', 'luminosity', 'difference', 'exclusion']);

  class ErreurJeu extends Error {}

  function lireJson(texte, quoi) {
    if (texte == null) throw new ErreurJeu(`${quoi} est introuvable.`);
    try {
      return JSON.parse(texte);
    } catch (err) {
      throw new ErreurJeu(`${quoi} est abîmé (ce n'est pas du JSON valide) : ${err.message}`);
    }
  }

  function verifierVersion(objet, quoi) {
    if (Number(objet.version) > VERSION_CONNUE) {
      throw new ErreurJeu(`${quoi} a été écrit par une version plus récente de Tafl (format ${objet.version}). Mets Saga à jour pour y jouer.`);
    }
  }

  function chargerImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image illisible'));
      img.src = src;
    });
  }

  // Les tuiles → une planche. tuiles[n] = { images: [{ sx, sy }], duree, passage }.
  async function chargerTuiles(data, taille) {
    const liste = Array.isArray(data.tiles) ? data.tiles : [];
    const sources = liste.map((t) => (Array.isArray(t.frames) && t.frames.length ? t.frames : [t.png]).filter(Boolean));
    const total = sources.reduce((n, s) => n + Math.max(1, s.length), 0);
    const parLigne = 32;
    const planche = document.createElement('canvas');
    planche.width = Math.max(1, Math.min(total, parLigne) * taille);
    planche.height = Math.max(1, Math.ceil(total / parLigne) * taille);
    const g = planche.getContext('2d');
    let n = 0;
    const tuiles = [];
    for (let i = 0; i < liste.length; i++) {
      const images = [];
      for (const src of sources[i].length ? sources[i] : [null]) {
        const sx = (n % parLigne) * taille, sy = Math.floor(n / parLigne) * taille;
        n++;
        if (src) {
          try {
            g.drawImage(await chargerImage(src), sx, sy, taille, taille);
          } catch { /* une tuile abîmée reste transparente */ }
        }
        images.push({ sx, sy });
      }
      tuiles.push({
        nom: liste[i].name || `tuile ${i}`,
        images,
        duree: Math.max(30, Number(liste[i].duration) || 200),
        passage: liste[i].passage === 'libre' ? PASSAGE.libre : liste[i].passage === 'bloque' ? PASSAGE.bloque : PASSAGE.auto,
        lumiere: lumiere(liste[i].lumiere), // Saga 0.11 : une tuile qui éclaire (lampadaire, fenêtre, feu)
      });
    }
    return { planche, tuiles };
  }

  const nombre = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def);
  const borne = (v, def, min, max) => Math.min(max, Math.max(min, nombre(v, def)));

  // Une source de lumière (Saga 0.11, FORMAT.md › Lumières) : sur une tuile ou un événement.
  // { couleur: '#rrggbb', rayon: en cases, intensite: 0 à 100, scintille } → null s'il n'y en a pas.
  function lumiere(l) {
    if (!l || typeof l !== 'object') return null;
    return {
      couleur: /^#[0-9a-f]{6}$/i.test(l.couleur || '') ? l.couleur : '#ffd890',
      rayon: borne(l.rayon, 3, 0.5, 16),
      intensite: borne(l.intensite, 80, 0, 100) / 100,
      scintille: Boolean(l.scintille),
    };
  }
  // Un son du jeu : un chemin sons/… (sans remonter ailleurs), ou un mot (aucune, aucun, pluie…).
  const son = (v, mots = []) => {
    const t = typeof v === 'string' ? v.replace(/\\/g, '/') : '';
    if (mots.includes(t)) return t;
    return /^sons\/[^/]+$/.test(t) && !t.includes('..') ? t : '';
  };
  const grille = (v, taille, def) => {
    const out = new Int32Array(taille).fill(def);
    if (Array.isArray(v)) for (let i = 0; i < Math.min(taille, v.length); i++) out[i] = nombre(v[i], def);
    return out;
  };

  // Les collisions comme Tafl les calcule (FORMAT.md › Passage et collisions), au cas où le fichier
  // n'en aurait pas : le passage peint d'abord, sinon la tuile la plus haute qui décide (sans les
  // calques « dessus »), sinon libre.
  function calculerCollisions(carte, tuiles) {
    const n = carte.largeur * carte.hauteur;
    const out = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      let code = carte.passage[i];
      if (!code) {
        for (let c = carte.calques.length - 1; c >= 0 && !code; c--) {
          const calque = carte.calques[c];
          if (calque.profondeur === 'dessus') continue;
          const t = calque.cases[i];
          if (t >= 0 && tuiles[t]?.passage) code = tuiles[t].passage;
        }
      }
      out[i] = code || PASSAGE.libre;
    }
    return out;
  }

  function preparerCarte(data, entree, taille, tuiles) {
    verifierVersion(data, `La carte ${entree.nom || entree.id}`);
    const largeur = Math.max(1, nombre(data.largeur, 1)), hauteur = Math.max(1, nombre(data.hauteur, 1));
    const n = largeur * hauteur;
    const calques = (Array.isArray(data.calques) ? data.calques : []).map((c, i) => ({
      nom: c.nom || `Calque ${i + 1}`,
      visible: c.visible !== false,
      profondeur: ['dessous', 'joueur', 'dessus'].includes(c.profondeur) ? c.profondeur : 'dessous',
      opacite: Math.min(1, Math.max(0, nombre(c.opacite, 1))),
      fusion: FUSIONS.has(c.fusion) ? (c.fusion === 'normal' ? 'source-over' : c.fusion) : 'source-over',
      parallaxe: { x: nombre(c.parallaxe?.x, 1), y: nombre(c.parallaxe?.y, 1) },
      cases: grille(c.cases, n, -1),
    }));
    const carte = {
      id: data.id || entree.id,
      nom: data.nom || entree.nom || entree.id,
      largeur, hauteur, taille,
      interieur: Boolean(data.interieur), // Tafl 0.11 : une maison, une grotte… (le décor des combats)
      calques,
      passage: grille(data.passage, n, 0),
      zones: (Array.isArray(data.zones) ? data.zones : []).map((z) => ({
        id: z.id, nom: z.nom || '', type: z.type || 'autre',
        x: nombre(z.x, 0), y: nombre(z.y, 0), largeur: nombre(z.largeur, 1), hauteur: nombre(z.hauteur, 1),
        objetRequis: z.objetRequis || null,
        taux: nombre(z.taux, 10),
        rencontres: Array.isArray(z.rencontres) ? z.rencontres : [],
      })),
      teleporteurs: (Array.isArray(data.teleporteurs) ? data.teleporteurs : []).filter((t) => t && t.vers),
      evenements: (Array.isArray(data.evenements) ? data.evenements : []).filter((e) => e && Array.isArray(e.pages)),
      ambiance: {
        meteo: data.ambiance?.meteo || 'aucune',
        intensite: Math.min(100, Math.max(0, nombre(data.ambiance?.intensite, 50))),
        teinte: /^#[0-9a-f]{6}$/i.test(data.ambiance?.teinte || '') ? data.ambiance.teinte : '',
        force: Math.min(100, Math.max(0, nombre(data.ambiance?.force, 0))),
        // Saga 0.11 : la musique ('' = celle d'avant continue, 'aucune' = silence), le fond sonore
        // ('' = selon la météo : la pluie intégrée), et le cycle jour/nuit (jamais dans un intérieur).
        musique: son(data.ambiance?.musique, ['aucune']),
        fond_sonore: son(data.ambiance?.fond_sonore, ['aucun']),
        volume_fond: borne(data.ambiance?.volume_fond, 70, 0, 100),
        jour_nuit: data.ambiance?.jour_nuit !== false && !data.interieur,
      },
    };
    const lue = Array.isArray(data.collisions) && data.collisions.length === n;
    carte.collisions = lue ? grille(data.collisions, n, PASSAGE.libre) : calculerCollisions(carte, tuiles);
    return carte;
  }

  // Le sprite d'un personnage (Tafl 0.12, FORMAT.md › personnages.json) : une planche de 4 rangées
  // (bas, gauche, droite, haut) de `images` images de largeur × hauteur. Renvoie le sprite avec son
  // image chargée (`img`), ou null s'il n'en a pas.
  async function chargerSprite(s) {
    if (!s || typeof s !== 'object' || !/^data:image\/png;base64,/.test(s.planche || '')) return null;
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('planche illisible'));
      i.src = s.planche;
    });
    const images = Math.max(1, Math.round(nombre(s.images, 1)));
    const largeur = Math.max(1, Math.round(nombre(s.largeur, img.naturalWidth / images)));
    const hauteur = Math.max(1, Math.round(nombre(s.hauteur, img.naturalHeight / 4)));
    if (largeur * images > img.naturalWidth || hauteur * 4 > img.naturalHeight) throw new Error(`la planche fait ${img.naturalWidth} × ${img.naturalHeight} px, trop petite pour ${images} image(s) de ${largeur} × ${hauteur} px sur 4 rangées`);
    return { largeur, hauteur, images, img };
  }

  // textes = ce que renvoie main.js : { dossier, jeu, tuiles, cartes: { chemin: texte }, donnees: { chemin: texte } }.
  async function charger(textes) {
    const jeu = lireJson(textes.jeu, 'jeu.json');
    if (jeu.format && jeu.format !== 'tafl-jeu') throw new ErreurJeu('Ce jeu.json n\'a pas été écrit par Tafl.');
    verifierVersion(jeu, 'Ce jeu');
    const tuilesData = lireJson(textes.tuiles, `Le fichier des tuiles (${jeu.tuiles || 'tuiles.tafl'})`);
    verifierVersion(tuilesData, 'Le fichier des tuiles');
    const taille = Math.max(1, nombre(jeu.tailleTuiles, nombre(tuilesData.tileSize, 16)));
    const { planche, tuiles } = await chargerTuiles(tuilesData, taille);

    const cartes = new Map();
    const problemes = [];
    for (const entree of Array.isArray(jeu.cartes) ? jeu.cartes : []) {
      const texte = textes.cartes[String(entree.fichier || '').replace(/\\/g, '/')];
      if (texte == null) { problemes.push(`la carte « ${entree.nom || entree.id} » est introuvable (${entree.fichier})`); continue; }
      try {
        cartes.set(entree.id, preparerCarte(lireJson(texte, `La carte ${entree.fichier}`), entree, taille, tuiles));
      } catch (err) {
        if (err instanceof ErreurJeu && /plus récente/.test(err.message)) throw err;
        problemes.push(err.message);
      }
    }
    if (!cartes.size) throw new ErreurJeu('Ce jeu n\'a encore aucune carte : dessines-en une dans Tafl, puis enregistre.');

    // Les données (personnages, objets…) : on les garde telles quelles, par sorte.
    const donnees = {};
    for (const [sorte, chemin] of Object.entries(jeu.donnees || {})) {
      const texte = textes.donnees[String(chemin).replace(/\\/g, '/')];
      if (texte == null) continue;
      try { donnees[sorte] = JSON.parse(texte); } catch { problemes.push(`${chemin} est abîmé`); }
    }
    const personnages = new Map((donnees.personnages?.personnages || []).map((p) => [p.id, p]));
    for (const p of personnages.values()) {
      try { p.sprite = await chargerSprite(p.sprite); } catch (err) { p.sprite = null; problemes.push(`le sprite de ${p.nom || p.id} : ${err.message}`); }
      // Les tenues du héros (Tafl 0.16) : chacune son sprite, au même format.
      p.tenues = Array.isArray(p.tenues) ? p.tenues.filter((t) => t && typeof t.id === 'string' && t.id) : [];
      for (const t of p.tenues) {
        try { t.sprite = await chargerSprite(t.sprite); } catch (err) { t.sprite = null; problemes.push(`le sprite de la tenue ${t.nom || t.id} : ${err.message}`); }
      }
    }

    // Le départ : celui de jeu.json, sinon la première case libre de la première carte.
    let depart = jeu.depart && cartes.has(jeu.depart.carte) ? { ...jeu.depart } : null;
    if (!depart) {
      const carte = cartes.values().next().value;
      const i = Math.max(0, carte.collisions.findIndex((c) => c !== PASSAGE.bloque));
      depart = { carte: carte.id, x: i % carte.largeur, y: Math.floor(i / carte.largeur), direction: 'bas' };
      problemes.push('le départ du joueur n\'est pas placé (outil Départ de Tafl, touche J) : il commence sur la première carte');
    }

    return {
      dossier: textes.dossier,
      titre: jeu.titre || 'Mon jeu',
      taille,
      planche, tuiles,
      cartes,
      donnees,
      personnages,
      heros: [...personnages.values()].find((p) => p.heros) || null,
      depart,
      problemes,
    };
  }

  return { charger, ErreurJeu, PASSAGE, DIRECTIONS, REBORDS, lumiere, son };
})();
