// L'heure du jeu et le cycle jour/nuit (Saga 0.11, FORMAT.md › Réglages › temps).
//
// Trois horloges, au choix du jeu (Tafl, Réglages du jeu) :
// - « aucune » : pas de cycle, il fait toujours jour (comme avant Saga 0.11) ;
// - « jeu » : une horloge à part, gardée dans la partie : une journée entière dure `duree_jour` minutes
//   réelles (24 par défaut : une heure du jeu par minute). Elle s'arrête quand le jeu est en pause ;
// - « reelle » : l'heure du PC, comme Pokémon Or et Argent.
//
// La lumière du jour est une couleur posée en « produit » sur la carte (comme la teinte des cartes) :
// blanche le jour (rien ne change), orangée à l'aube et au couchant, bleu nuit la nuit. Les intérieurs
// n'y sont pas soumis, ni les cartes où Tafl a décoché « Suit le jour et la nuit ».

const Temps = (() => {
  // L'heure → la couleur du ciel et sa force (0 à 1). Entre deux repères, on mélange.
  const REPERES = [
    [0, [18, 26, 68], 0.74],
    [4.5, [18, 26, 68], 0.74],
    [6, [217, 130, 106], 0.4],
    [7.5, [255, 255, 255], 0],
    [17, [255, 255, 255], 0],
    [18.8, [240, 140, 70], 0.36],
    [20.5, [34, 44, 100], 0.64],
    [24, [18, 26, 68], 0.74],
  ];
  // Les moments de la journée (la condition « moment » des pages et des « si »).
  const MOMENTS = { matin: [6, 10], jour: [6, 20], soir: [17, 20], nuit: [20, 6] };

  // Le jeu en cours (moteur.js › demarrer) : les conditions des pages lisent son horloge sans le recevoir.
  let courant = null;
  const utiliser = (jeu) => { courant = jeu; };

  const reglages = (jeu) => {
    const t = (jeu || courant)?.donnees?.reglages?.reglages?.temps || {};
    const n = (v, def, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : def);
    return {
      horloge: ['jeu', 'reelle'].includes(t.horloge) ? t.horloge : 'aucune',
      duree_jour: n(t.duree_jour, 24, 1, 1440),
      heure_depart: n(t.heure_depart, 8, 0, 23),
      // Saga 1.13 : l'écran du réveil (commande dormir) : son titre ({jour} : le numéro du jour), son en-tête
      // et sa note ; et le jour dans le carnet : 'auto' (si le jeu a un module), 'oui' ou 'non'.
      matin_titre: typeof t.matin_titre === 'string' && t.matin_titre.trim() ? t.matin_titre.slice(0, 60) : 'Jour {jour}',
      matin_entete: typeof t.matin_entete === 'string' ? t.matin_entete.slice(0, 40) : 'Bonjour !',
      matin_note: typeof t.matin_note === 'string' ? t.matin_note.slice(0, 120) : 'Pendant la nuit…',
      carnet_jour: ['oui', 'non'].includes(t.carnet_jour) ? t.carnet_jour : 'auto',
    };
  };

  // L'heure, de 0 à 24 (avec les minutes), ou null si le jeu n'a pas d'horloge.
  function heure(jeu, partie) {
    const r = reglages(jeu);
    if (r.horloge === 'reelle') { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
    if (r.horloge === 'jeu') return (((Number(partie?.temps) || 0) % 1440) + 1440) % 1440 / 60;
    return null;
  }
  // Une partie neuve (ou d'avant Saga 0.11) : l'horloge du jeu part de l'heure de départ.
  function preparer(jeu, partie) {
    if (!Number.isFinite(Number(partie.temps))) partie.temps = reglages(jeu).heure_depart * 60;
  }
  // dt secondes réelles passent (seulement quand le joueur joue).
  function avancer(jeu, partie, dt) {
    const r = reglages(jeu);
    if (r.horloge !== 'jeu' || !partie) return;
    partie.temps = ((Number(partie.temps) || 0) + dt * (1440 / (r.duree_jour * 60))) % 1440;
  }
  // La commande « heure » : régler l'heure, ou la faire avancer (dormir à l'auberge).
  function regler(jeu, partie, { action = 'regler', heures = 8 } = {}) {
    if (reglages(jeu).horloge !== 'jeu') return false;
    const h = Number(heures) || 0;
    partie.temps = action === 'avancer'
      ? (((Number(partie.temps) || 0) + h * 60) % 1440 + 1440) % 1440
      : ((Math.round(h) % 24) + 24) % 24 * 60;
    return true;
  }

  // La couleur de la lumière à cette heure, déjà mélangée au blanc : [r, g, b] de 0 à 255.
  function lumiere(h) {
    if (h === null) return [255, 255, 255];
    let i = 0;
    while (i < REPERES.length - 2 && h >= REPERES[i + 1][0]) i++;
    const [h0, c0, f0] = REPERES[i], [h1, c1, f1] = REPERES[i + 1];
    const k = h1 > h0 ? Math.min(1, Math.max(0, (h - h0) / (h1 - h0))) : 0;
    const f = f0 + (f1 - f0) * k;
    return [0, 1, 2].map((j) => {
      const c = c0[j] + (c1[j] - c0[j]) * k;
      return Math.round(255 + (c - 255) * f);
    });
  }

  function moment(jeu, partie, nom) {
    const h = heure(jeu, partie) ?? 12; // sans horloge : il fait toujours jour, à midi
    const p = MOMENTS[nom];
    if (!p) return true;
    return p[0] < p[1] ? h >= p[0] && h < p[1] : h >= p[0] || h < p[1];
  }

  // Saga 1.16 : l'heure est-elle dans la plage [de, a[ ? Elle peut passer minuit (22 → 6) ; de = a : toute la journée.
  function entre(jeu, partie, de, a) {
    const h = heure(jeu, partie) ?? 12;
    const d = ((Math.round(Number(de)) || 0) % 24 + 24) % 24, f = ((Math.round(Number(a)) || 0) % 24 + 24) % 24;
    if (d === f) return true;
    return d < f ? h >= d && h < f : h >= d || h < f;
  }

  const texte = (h) => (h === null ? '' : `${Math.floor(h)} h ${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`);

  return { utiliser, reglages, heure, preparer, avancer, regler, lumiere, moment, entre, texte, MOMENTS };
})();
