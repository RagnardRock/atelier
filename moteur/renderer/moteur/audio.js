// Le son du jeu (Saga 0.11, FORMAT.md › Musique et sons) : la musique de chaque carte (en fondu enchaîné
// d'une carte à l'autre), son fond sonore en boucle (vent, ruisseau…), la musique des combats, et les
// bruitages (curseur, validation, porte, texte qui s'écrit…).
//
// Les fichiers viennent du dossier sons/ du jeu (MP3, OGG, WAV…). Le moteur ne lit pas le disque : il
// demande les octets à `charger(chemin)`, que app.js branche sur main.js. Tout passe par la Web Audio API.
//
// Sans fichier, Saga a ses propres sons, fabriqués à la volée (aucun fichier à fournir) : des « bips »
// rétro pour les menus et les dialogues, la pluie et le tonnerre pour la météo. Un son réglé à « aucun »
// se tait.

const Son = (() => {
  // Les sons intégrés. Chacun : une petite fonction qui joue des notes sur la sortie des bruitages.
  const INTEGRES = ['curseur', 'valider', 'retour', 'texte', 'porte', 'sauvegarde', 'choc'];

  function creer({ charger = async () => { throw new Error('pas de fichiers'); } } = {}) {
    let ctx = null, maitre = null, busMusique = null, busSons = null, busFond = null;
    let volumes = { musique: 0.7, sons: 0.8 };
    let attenue = 1; // la musique baisse un peu pendant la pause
    const tampons = new Map(); // chemin → Promise<AudioBuffer>
    let musique = null; // { chemin, source, gain }
    let fond = null;    // { cle, source, gain, filtre }
    let bruit = null;   // un tampon de bruit blanc (la pluie, la porte, le tonnerre)
    let dernierTexte = 0;
    let erreurs = new Set(); // les fichiers déjà signalés illisibles (une fois chacun)
    let signaler = () => {};

    // La sortie : créée au premier son (Chromium veut un contexte créé dans la page déjà ouverte).
    function sortie() {
      if (ctx) return ctx;
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      maitre = ctx.createGain();
      maitre.connect(ctx.destination);
      busMusique = ctx.createGain();
      busSons = ctx.createGain();
      busFond = ctx.createGain();
      busMusique.connect(maitre);
      busSons.connect(maitre);
      busFond.connect(maitre);
      appliquerVolumes();
      return ctx;
    }
    function appliquerVolumes() {
      if (!ctx) return;
      const t = ctx.currentTime;
      busMusique.gain.setTargetAtTime(volumes.musique * attenue, t, 0.08);
      // Le fond sonore suit le volume des sons (c'est un bruitage en boucle).
      busFond.gain.setTargetAtTime(volumes.sons * (0.4 + 0.6 * attenue), t, 0.08);
      busSons.gain.setTargetAtTime(volumes.sons, t, 0.02);
    }

    // Un fichier du jeu → un AudioBuffer (gardé : une musique n'est décodée qu'une fois).
    function tampon(chemin) {
      if (!tampons.has(chemin)) {
        const p = (async () => {
          const octets = await charger(chemin);
          const copie = octets instanceof ArrayBuffer ? octets.slice(0) : new Uint8Array(octets).slice().buffer;
          return sortie().decodeAudioData(copie);
        })();
        p.catch((err) => {
          tampons.delete(chemin);
          if (!erreurs.has(chemin)) { erreurs.add(chemin); signaler(`Son illisible : ${chemin} (${err?.message || err})`); }
        });
        tampons.set(chemin, p);
      }
      return tampons.get(chemin);
    }
    const estFichier = (v) => typeof v === 'string' && /^sons\//.test(v);

    function bruitBlanc() {
      if (bruit) return bruit;
      const n = ctx.sampleRate * 2;
      bruit = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = bruit.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return bruit;
    }

    // --- Musique ---
    // chemin : un fichier sons/…, ou null / 'aucune' pour le silence. Le même morceau ne recommence pas.
    // fois : true pour un morceau joué une seule fois (la fanfare de victoire), qui rend une promesse
    // tenue à sa fin.
    async function jouerMusique(chemin, { fondu = 1.2, boucle = true } = {}) {
      if (!sortie()) return;
      const cible = estFichier(chemin) ? chemin : null;
      if (musique?.chemin === cible && boucle && musique.boucle) return;
      const ancienne = musique;
      musique = cible ? { chemin: cible, boucle } : null;
      if (ancienne?.source) {
        const t = ctx.currentTime;
        ancienne.gain.gain.cancelScheduledValues(t);
        ancienne.gain.gain.setValueAtTime(ancienne.gain.gain.value, t);
        ancienne.gain.gain.linearRampToValueAtTime(0, t + fondu);
        try { ancienne.source.stop(t + fondu + 0.05); } catch { /* déjà arrêtée */ }
      }
      if (!cible) return;
      const moi = musique;
      let buf;
      try { buf = await tampon(cible); } catch { return; }
      if (musique !== moi) return; // une autre musique a été demandée pendant le chargement
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.loop = boucle;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + (ancienne ? fondu : 0.4));
      source.connect(gain).connect(busMusique);
      source.start();
      moi.source = source;
      moi.gain = gain;
      if (!boucle) await new Promise((resoudre) => { source.onended = resoudre; });
    }

    // --- Fond sonore (une boucle sous la musique) ---
    // cle : un fichier sons/…, 'pluie' ou 'orage' (la pluie intégrée), ou null. force : 0 à 1.
    async function jouerFond(cle, force = 1) {
      if (!sortie()) return;
      const cible = estFichier(cle) || cle === 'pluie' || cle === 'orage' ? cle : null;
      if (fond?.cle === cible) { if (fond.gain) fond.gain.gain.setTargetAtTime(fond.niveau * force, ctx.currentTime, 0.4); return; }
      const ancien = fond;
      fond = cible ? { cle: cible } : null;
      if (ancien?.source) {
        const t = ctx.currentTime;
        ancien.gain.gain.setTargetAtTime(0, t, 0.35);
        try { ancien.source.stop(t + 1.6); } catch { /* déjà arrêté */ }
      }
      if (!cible) return;
      const moi = fond;
      const source = ctx.createBufferSource();
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      if (estFichier(cible)) {
        try { source.buffer = await tampon(cible); } catch { return; }
        if (fond !== moi) return;
        moi.niveau = 1;
        source.connect(gain).connect(busFond);
      } else {
        // La pluie : un bruit blanc filtré, plus grave et plus fort pour l'orage.
        source.buffer = bruitBlanc();
        const filtre = ctx.createBiquadFilter();
        filtre.type = 'lowpass';
        filtre.frequency.value = cible === 'orage' ? 900 : 1500;
        const aigus = ctx.createBiquadFilter();
        aigus.type = 'highpass';
        aigus.frequency.value = 280;
        moi.niveau = cible === 'orage' ? 0.32 : 0.22;
        source.connect(aigus).connect(filtre).connect(gain).connect(busFond);
      }
      source.start();
      gain.gain.setTargetAtTime(moi.niveau * force, ctx.currentTime, 0.6);
      moi.source = source;
      moi.gain = gain;
    }

    // Le tonnerre, un peu après l'éclair : un grondement grave qui roule.
    function tonnerre(force = 1) {
      if (!sortie()) return;
      const retard = 0.25 + Math.random() * 1.1;
      const t = ctx.currentTime + retard;
      const source = ctx.createBufferSource();
      source.buffer = bruitBlanc();
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'lowpass';
      filtre.frequency.setValueAtTime(420, t);
      filtre.frequency.exponentialRampToValueAtTime(90, t + 2.6);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.9 * force, t + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 3);
      source.connect(filtre).connect(gain).connect(busFond);
      source.start(t, Math.random());
      source.stop(t + 3.1);
    }

    // --- Bruitages ---
    // Une note : forme, fréquence (ou [de, vers]), début, durée, volume.
    function note(forme, freq, debut, duree, vol) {
      const t = ctx.currentTime + debut;
      const o = ctx.createOscillator();
      o.type = forme;
      const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + duree);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0008, t + duree);
      o.connect(g).connect(busSons);
      o.start(t);
      o.stop(t + duree + 0.02);
    }
    function souffle(debut, duree, vol, [f0, f1]) {
      const t = ctx.currentTime + debut;
      const s = ctx.createBufferSource();
      s.buffer = bruitBlanc();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(f1, t + duree);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + duree * 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, t + duree);
      s.connect(f).connect(g).connect(busSons);
      s.start(t, Math.random());
      s.stop(t + duree + 0.02);
    }
    const SYNTHES = {
      curseur: () => note('square', 1046, 0, 0.04, 0.07),
      valider: () => { note('square', 784, 0, 0.05, 0.07); note('square', 1175, 0.05, 0.07, 0.07); },
      retour: () => { note('square', 587, 0, 0.05, 0.06); note('square', 392, 0.05, 0.07, 0.06); },
      texte: () => note('square', 1400 + Math.random() * 160, 0, 0.022, 0.025),
      porte: () => { souffle(0, 0.28, 0.35, [1800, 300]); note('triangle', [180, 90], 0.02, 0.14, 0.12); },
      sauvegarde: () => [523, 659, 784, 1046].forEach((f, i) => note('triangle', f, i * 0.07, 0.16, 0.12)),
      choc: () => note('square', [130, 70], 0, 0.07, 0.09),
    };

    // nom : un son intégré (curseur, valider…). reglage : ce que le jeu a choisi pour lui dans Tafl
    // ('' = le son intégré, 'aucun' = rien, sons/… = ce fichier).
    async function jouerSon(nom, reglage = '') {
      if (!sortie() || reglage === 'aucun' || volumes.sons <= 0) return;
      if (nom === 'texte') {
        // Le texte qui s'écrit : un bip toutes les 45 ms au plus, pas un par lettre.
        const t = performance.now();
        if (t - dernierTexte < 45) return;
        dernierTexte = t;
      }
      if (estFichier(reglage)) return jouerFichier(reglage);
      SYNTHES[nom]?.();
    }
    async function jouerFichier(chemin) {
      if (!sortie() || !estFichier(chemin)) return;
      let buf;
      try { buf = await tampon(chemin); } catch { return; }
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(busSons);
      s.start();
    }

    return {
      INTEGRES,
      // Les volumes du joueur (réglages de Saga), de 0 à 100.
      volumes(v) {
        const k = (x, def) => Math.max(0, Math.min(1, (Number.isFinite(Number(x)) ? Number(x) : def) / 100));
        volumes = { musique: k(v.musique, 70), sons: k(v.sons, 80) };
        appliquerVolumes();
      },
      // La pause : la musique baisse de moitié, le fond sonore aussi.
      attenuer(oui) { attenue = oui ? 0.45 : 1; appliquerVolumes(); },
      musique: jouerMusique,
      get morceau() { return musique?.chemin || null; },
      fond: jouerFond,
      tonnerre,
      son: jouerSon,
      fichier: jouerFichier,
      // Charger d'avance (la musique d'une carte, celle des combats) pour qu'elle parte sans attendre.
      precharger(chemin) { if (sortie() && estFichier(chemin)) tampon(chemin).catch(() => {}); },
      onErreur(f) { signaler = f; },
      // Un autre jeu : on oublie ses sons.
      vider() {
        jouerMusique(null, { fondu: 0.3 });
        jouerFond(null);
        tampons.clear();
        erreurs = new Set();
      },
      reprendre() { if (ctx?.state === 'suspended') ctx.resume().catch(() => {}); },
    };
  }

  return { creer };
})();
