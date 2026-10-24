// Les créatures du joueur (Saga 0.6) : l'équipe, les boîtes du PC et le Pokédex (ce qu'il a vu et
// attrapé). Ce fichier ne connaît pas les règles : il range des créatures, quelles qu'elles soient.
//
// Dans la partie :
//   equipe : [créature]                         6 au plus (Tafl › Réglages › equipe_max)
//   boites : [{ nom, creatures: [30 places] }]   une place vide vaut null ; une boîte de plus se crée
//                                                quand toutes sont pleines
//   dex    : { vus: { id: true }, pris: { id: true } }
// Une sauvegarde de Saga 0.5 (partie.boite, une simple liste) est rangée dans les boîtes au chargement.

const Collection = (() => {
  const PLACES = 30;   // par boîte
  const COLONNES = 6;  // 6 × 5
  const NOM_MAX = 16;

  const equipeMax = (jeu) => Number(jeu.donnees.reglages?.reglages?.equipe_max) || 6;
  const boiteVide = (n) => ({ nom: `Boîte ${n}`, creatures: Array(PLACES).fill(null) });

  // Au démarrage d'une partie (nouvelle ou chargée) : tout est complété et rangé.
  function preparer(jeu, partie) {
    partie.equipe = (partie.equipe || []).map((c) => Regles.completer(jeu, c)).filter(Boolean);
    partie.boites = (Array.isArray(partie.boites) ? partie.boites : []).filter((b) => b && typeof b === 'object').map((b, i) => ({
      nom: String(b.nom || `Boîte ${i + 1}`).slice(0, NOM_MAX),
      creatures: Array.from({ length: PLACES }, (_, k) => (b.creatures?.[k] ? Regles.completer(jeu, b.creatures[k]) : null)),
    }));
    if (!partie.boites.length) partie.boites.push(boiteVide(1));
    for (const c of (Array.isArray(partie.boite) ? partie.boite : []).map((x) => Regles.completer(jeu, x)).filter(Boolean)) deposer(partie, c);
    delete partie.boite;
    const d = partie.dex && typeof partie.dex === 'object' ? partie.dex : {};
    partie.dex = { vus: { ...d.vus }, pris: { ...d.pris } };
    noterTout(partie);
  }

  // --- Le Pokédex ---
  function voir(partie, id) { if (id && partie.dex) partie.dex.vus[id] = true; }
  function prendre(partie, id) { if (id && partie.dex) { partie.dex.vus[id] = true; partie.dex.pris[id] = true; } }
  // Tout ce que le joueur a (une évolution donne une nouvelle espèce attrapée).
  function noterTout(partie) { for (const { c } of toutes(partie)) prendre(partie, c.creature); }

  // --- Ranger ---
  // Dans la première place libre des boîtes (une nouvelle boîte si tout est plein). Rend la boîte.
  function deposer(partie, c, depuis = 0) {
    const n = partie.boites.length;
    for (let k = 0; k < n; k++) {
      const b = partie.boites[(depuis + k) % n];
      const i = b.creatures.indexOf(null);
      if (i >= 0) { b.creatures[i] = c; return b; }
    }
    const b = boiteVide(n + 1);
    b.creatures[0] = c;
    partie.boites.push(b);
    return b;
  }
  // Une créature reçue (capture, cadeau, achat) : dans l'équipe s'il y a de la place, sinon au PC.
  // Rend { ou: 'equipe' } ou { ou: 'boite', nom } (le nom de la boîte, pour le dire au joueur).
  function ranger(jeu, partie, c) {
    prendre(partie, c.creature);
    if (partie.equipe.length < equipeMax(jeu)) { partie.equipe.push(c); return { ou: 'equipe' }; }
    return { ou: 'boite', nom: deposer(partie, c).nom };
  }

  // Toutes les créatures du joueur avec leur place : { c, ou: 'equipe', i } ou { c, ou: 'boite', b, i }.
  function toutes(partie) {
    const l = (partie.equipe || []).map((c, i) => ({ c, ou: 'equipe', i }));
    (partie.boites || []).forEach((b, bi) => b.creatures.forEach((c, i) => { if (c) l.push({ c, ou: 'boite', b: bi, i }); }));
    return l;
  }
  function enlever(partie, place) {
    if (place.ou === 'equipe') partie.equipe.splice(place.i, 1);
    else partie.boites[place.b].creatures[place.i] = null;
  }
  // L'équipe doit garder au moins une créature en état de se battre.
  const peutQuitterEquipe = (partie, i) => partie.equipe.some((c, j) => j !== i && c.pv > 0);

  return { PLACES, COLONNES, NOM_MAX, equipeMax, preparer, voir, prendre, noterTout, deposer, ranger, toutes, enlever, peutQuitterEquipe };
})();
