// Tafl 1.22 (Saga 1.20) : l'effet au passage d'une tuile (FORMAT.md › tiles.json › effet). Ce qui arrive à
// celui qui marche dessus dans Saga : son corps se cache (les jambes dans les hautes herbes, le corps dans
// l'eau), la touffe frémit, des particules partent, des ondes s'élargissent, des traces de pas restent,
// un bruit de pas, une vitesse. Des briques générales, et des préréglages qui les remplissent.
//
//   Effets.norm(e)        un effet propre (ou null s'il ne fait rien)
//   Effets.prereglage(n)  l'effet d'un préréglage (hautes_herbes, eau_profonde…), ou null
//   Effets.resume(e)      une ligne lisible (« Hautes herbes : jambes cachées 35 %, feuilles »)

const Effets = (() => {
  const CORPS = [['aucun', 'Rien ne se cache'], ['herbes', 'Herbes : la tuile repasse devant le bas du corps'], ['eau', 'Eau : le bas du corps est sous la surface']];
  const PARTICULES = [['aucune', 'Aucune'], ['feuilles', 'Feuilles, brins d\'herbe'], ['gouttes', 'Gouttes, éclaboussures'], ['poussiere', 'Poussière, petit nuage'], ['flocons', 'Flocons'], ['bulles', 'Bulles']];
  // Les sons de pas intégrés à Saga (sinon un fichier du dossier sons/ du jeu).
  const SONS = [['', 'Aucun'], ['herbe', 'Froissement (intégré)'], ['eau', 'Clapotis (intégré)'], ['sable', 'Pas feutré (intégré)']];

  const VIDE = { masque: [], corps: 'aucun', cache: 0, remous: false, particules: 'aucune', couleur: '#ffffff', nombre: 4, ondes: false, couleur_ondes: '#ffffff', traces: 0, couleur_traces: '#3a2a1a', son: '', vitesse: 100, nage: false };

  const PREREGLAGES = {
    hautes_herbes: { nom: 'Hautes herbes', effet: { corps: 'herbes', cache: 35, remous: true, particules: 'feuilles', couleur: '#5fb34a', nombre: 4, son: 'herbe' } },
    eau_profonde: { nom: 'Eau profonde (on nage)', effet: { corps: 'eau', cache: 50, remous: true, particules: 'gouttes', couleur: '#d8f0ff', nombre: 3, ondes: true, couleur_ondes: '#ffffff', son: 'eau', vitesse: 80, nage: true } },
    eau_basse: { nom: 'Eau peu profonde (on patauge)', effet: { corps: 'eau', cache: 20, particules: 'gouttes', couleur: '#d8f0ff', nombre: 4, ondes: true, couleur_ondes: '#ffffff', son: 'eau', vitesse: 85 } },
    sable: { nom: 'Sable', effet: { particules: 'poussiere', couleur: '#e8d8a8', nombre: 2, traces: 6, couleur_traces: '#6a4a24', son: 'sable' } },
    neige: { nom: 'Neige', effet: { corps: 'herbes', cache: 15, particules: 'flocons', couleur: '#ffffff', nombre: 3, traces: 12, couleur_traces: '#6a7aa0', son: 'sable', vitesse: 85 } },
    boue: { nom: 'Boue', effet: { particules: 'gouttes', couleur: '#6b4a2b', nombre: 3, traces: 8, couleur_traces: '#2a1a0a', son: 'eau', vitesse: 70 } },
    feuilles_mortes: { nom: 'Feuilles mortes', effet: { particules: 'feuilles', couleur: '#c8782a', nombre: 3, son: 'herbe' } },
    poussiere: { nom: 'Chemin poussiéreux', effet: { particules: 'poussiere', couleur: '#d8c8a0', nombre: 2 } },
  };

  const nombre = (v, def, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
  const hex = (v, def) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : def);
  const son = (v) => { const s = String(v || '').replace(/\\/g, '/'); return SONS.some(([k]) => k === s) || (/^sons\/[^/]+$/.test(s) && !s.includes('..')) ? s : ''; };

  const couleurs = (l) => [...new Set((Array.isArray(l) ? l : []).map((c) => hex(c, '')).filter(Boolean))].slice(0, 64);
  // Les couleurs d'une tuile de Tafl (toutes ses images), pour un masque : '#rrggbb' des pixels visibles.
  function couleursTuile(tile) {
    const out = new Set();
    for (const f of tile?.frames || []) for (let i = 0; i < f.length; i += 4) if (f[i + 3] > 0) out.add(`#${[f[i], f[i + 1], f[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    return [...out];
  }

  function norm(e) {
    if (!e || typeof e !== 'object') return null;
    const corps = CORPS.some(([k]) => k === e.corps) ? e.corps : 'aucun';
    const out = {
      corps,
      cache: corps === 'aucun' ? 0 : Math.round(nombre(e.cache, corps === 'eau' ? 50 : 35, 0, 90)),
      remous: Boolean(e.remous),
      particules: PARTICULES.some(([k]) => k === e.particules) ? e.particules : 'aucune',
      couleur: hex(e.couleur, VIDE.couleur),
      nombre: Math.round(nombre(e.nombre, 4, 1, 12)),
      ondes: Boolean(e.ondes),
      couleur_ondes: hex(e.couleur_ondes, VIDE.couleur_ondes),
      traces: Math.round(nombre(e.traces, 0, 0, 30) * 10) / 10,
      couleur_traces: hex(e.couleur_traces, VIDE.couleur_traces),
      son: son(e.son),
      vitesse: Math.round(nombre(e.vitesse, 100, 25, 200)),
      nage: Boolean(e.nage),
      // Tafl 1.22.1 : herbes, ce qui passe devant le corps : seulement les pixels de ces couleurs (les
      // hautes herbes d'une tuile de bord, pas l'herbe rase) ; vide = toute la tuile.
      masque: corps === 'herbes' ? couleurs(e.masque) : [],
    };
    const rien = out.corps === 'aucun' && !out.remous && out.particules === 'aucune' && !out.ondes && !out.traces && !out.son && out.vitesse === 100 && !out.nage;
    return rien ? null : out;
  }

  const prereglage = (n) => (PREREGLAGES[n] ? norm(PREREGLAGES[n].effet) : null);

  function resume(e) {
    if (!e) return 'aucun';
    const bouts = [];
    if (e.corps === 'herbes') bouts.push(`bas du corps caché ${e.cache} %${e.masque?.length ? ` (${e.masque.length} couleurs)` : ''}`);
    if (e.corps === 'eau') bouts.push(`dans l'eau ${e.cache} %`);
    if (e.nage) bouts.push('nage');
    if (e.remous) bouts.push(e.corps === 'eau' ? 'il tangue' : 'frémit');
    if (e.particules !== 'aucune') bouts.push(PARTICULES.find(([k]) => k === e.particules)[1].split(',')[0].toLowerCase());
    if (e.ondes) bouts.push('ondes');
    if (e.traces) bouts.push(`traces ${e.traces} s`);
    if (e.son) bouts.push(`son ${e.son.replace(/^sons\//, '')}`);
    if (e.vitesse !== 100) bouts.push(`vitesse ${e.vitesse} %`);
    return bouts.join(', ');
  }

  return { CORPS, PARTICULES, SONS, VIDE, PREREGLAGES, norm, prereglage, resume, couleursTuile };
})();
