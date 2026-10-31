// Import des données officielles Pokémon dans un jeu Tafl (Tafl 0.8).
//
// Les données viennent de PokeAPI (https://github.com/PokeAPI/pokeapi, licence BSD) : ses fichiers
// CSV, en français. Rien d'officiel n'est rangé dans Tafl lui-même : l'import se fait à la demande,
// depuis Internet, dans le jeu ouvert (Jeu › Données du jeu › Importer les données officielles).
// Les noms, les images et les créatures appartiennent à Nintendo, Game Freak et The Pokémon Company :
// c'est fait pour un jeu perso, pas pour un jeu qu'on partage ou qu'on vend.
//
// importer({ generations, sprites, icones }, progres, telecharger) rend
//   { types, talents, attaques, creatures, objets }
// avec les clés du format de Tafl (voir FORMAT.md, « Données du jeu »). Chaque élément officiel a un
// champ « officiel » (son nom anglais dans PokeAPI) : c'est lui qui retrouve l'élément quand on
// réimporte, même si on a changé son nom. Les éléments sans ce champ sont ceux qu'on a créés.

const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/';
const FR = '5';

// Un CSV → une liste d'objets (les champs entre guillemets peuvent contenir des virgules et des retours à la ligne).
function lireCSV(texte) {
  const lignes = [];
  let champ = '';
  let ligne = [];
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false;
      } else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ',') { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const tete = lignes.shift() || [];
  return lignes.filter((l) => l.length > 1).map((l) => Object.fromEntries(tete.map((k, i) => [k, l[i] ?? ''])));
}

const slug = (name, fallback = 'x') => String(name || '').replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').replace(/æ/g, 'ae').replace(/Æ/g, 'Ae').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
const nombre = (v, d = 0) => (v === '' || v === undefined ? d : Number(v));
// Les textes des jeux : sans les retours à la ligne ni les césures des petits écrans.
const propre = (t) => String(t || '').replace(/­[\n\f]?/g, '').replace(/-\n/g, '-').replace(/[\n\f\r]+/g, ' ').replace(/\s+/g, ' ').trim();

// Un identifiant unique par sorte de donnée (deux objets peuvent avoir le même nom français).
function identifiants() {
  const pris = new Set();
  return (nom) => {
    const base = slug(nom);
    let id = base;
    for (let n = 2; pris.has(id); n++) id = `${base}-${n}`;
    pris.add(id);
    return id;
  };
}
// Le texte le plus récent, par élément, dans une langue : { id → texte }.
function derniers(lignes, cle, version, champ) {
  const out = new Map();
  for (const l of lignes) {
    if (l.language_id !== FR) continue;
    const v = nombre(l[version]);
    const deja = out.get(l[cle]);
    if (!deja || v > deja.v) out.set(l[cle], { v, t: propre(l[champ]) });
  }
  return new Map([...out].map(([k, { t }]) => [k, t]));
}
const noms = (lignes, cle, champ = 'name') => new Map(lignes.filter((l) => l.local_language_id === FR).map((l) => [l[cle], l[champ]]));

const STATS = { 1: 'pv', 2: 'attaque', 3: 'defense', 4: 'att_spe', 5: 'def_spe', 6: 'vitesse', 7: 'precision', 8: 'esquive' };
const COULEURS = {
  normal: '#a8a77a', fighting: '#c22e28', flying: '#a98ff3', poison: '#a33ea1', ground: '#e2bf65', rock: '#b6a136',
  bug: '#a6b91a', ghost: '#735797', steel: '#b7b7ce', fire: '#ee8130', water: '#6390f0', grass: '#7ac74c',
  electric: '#f7d02c', psychic: '#f95587', ice: '#96d9d6', dragon: '#6f35fc', dark: '#705746', fairy: '#d685ad',
};
const CROISSANCE = { 1: 'lente', 2: 'moyenne', 3: 'rapide', 4: 'parabolique', 5: 'erratique', 6: 'fluctuante' };
const CATEGORIES_ATTAQUE = { 1: 'statut', 2: 'physique', 3: 'speciale' };
const ALTERATIONS = { 1: 'paralysie', 2: 'sommeil', 3: 'gel', 4: 'brulure', 5: 'poison', 6: 'confusion', 7: 'attraction', 8: 'piege', 14: 'baillement', 18: 'vampigraine' };
const CIBLES = { 3: 'allie', 4: 'equipe', 5: 'soi', 6: 'adversaires', 7: 'soi', 8: 'adversaire', 9: 'tous', 10: 'adversaire', 11: 'adversaires', 12: 'terrain', 13: 'equipe', 14: 'tous', 15: 'equipe', 1: 'adversaire', 2: 'adversaire', 16: 'soi' };
// Les catégories d'objets de PokeAPI → celles de Tafl (les autres ne sont pas importées : CT, courrier,
// méga-gemmes, cristaux Z, objets propres à une version…).
const CATEGORIES_OBJET = {
  27: 'soin', 29: 'soin', 30: 'soin', 28: 'soin', 26: 'vitamine', 2: 'baie', 3: 'baie', 4: 'baie', 5: 'baie', 6: 'baie', 7: 'baie',
  33: 'balle', 34: 'balle', 39: 'balle', 10: 'evolution', 12: 'tenu', 13: 'tenu', 14: 'tenu', 15: 'tenu', 17: 'tenu', 18: 'tenu', 19: 'tenu', 36: 'tenu', 42: 'tenu',
  1: 'combat', 38: 'combat', 50: 'menthe', 9: 'tresor', 24: 'tresor', 21: 'cle',
};
// Ce que font les objets courants, pour que le moteur puisse s'en servir (les autres gardent leur description).
const SOINS = { potion: 20, 'super-potion': 60, 'hyper-potion': 120, 'fresh-water': 30, 'soda-pop': 50, lemonade: 70, 'moomoo-milk': 100, 'energy-powder': 60, 'energy-root': 120, 'berry-juice': 20, 'sweet-heart': 20, 'oran-berry': 10, 'sitrus-berry': 30 };
const SOINS_STATUT = { antidote: 'poison', 'paralyze-heal': 'paralysie', 'burn-heal': 'brulure', 'ice-heal': 'gel', awakening: 'sommeil', 'full-heal': 'tous', 'heal-powder': 'tous', 'lava-cookie': 'tous', 'old-gateau': 'tous', 'casteliacone': 'tous', 'lumiose-galette': 'tous', 'shalour-sable': 'tous', 'big-malasada': 'tous', 'pewter-crunchies': 'tous', 'rage-candy-bar': 'tous', 'pecha-berry': 'poison', 'cheri-berry': 'paralysie', 'rawst-berry': 'brulure', 'aspear-berry': 'gel', 'chesto-berry': 'sommeil', 'lum-berry': 'tous', 'persim-berry': 'confusion' };
const VITAMINES = { 'hp-up': 'pv', protein: 'attaque', iron: 'defense', calcium: 'att_spe', zinc: 'def_spe', carbos: 'vitesse' };
const PLUMES = { 'health-feather': 'pv', 'muscle-feather': 'attaque', 'resist-feather': 'defense', 'genius-feather': 'att_spe', 'clever-feather': 'def_spe', 'swift-feather': 'vitesse' };
const BALLES = { 'poke-ball': 1, 'great-ball': 1.5, 'ultra-ball': 2, 'master-ball': 255, 'safari-ball': 1.5, 'premier-ball': 1, 'luxury-ball': 1, 'heal-ball': 1, 'friend-ball': 1 };

function effetObjet(id, categorie, natures) {
  if (SOINS[id]) return { type: 'soin', valeur: SOINS[id] };
  if (id === 'max-potion') return { type: 'soin', valeur: 9999 };
  if (id === 'full-restore') return { type: 'soin', valeur: 9999, statut: 'tous' };
  if (SOINS_STATUT[id]) return { type: 'soin_statut', statut: SOINS_STATUT[id] };
  if (id === 'revive' || id === 'revival-herb') return { type: 'rappel', valeur: id === 'revive' ? 50 : 100 };
  if (id === 'max-revive') return { type: 'rappel', valeur: 100 };
  if (id === 'ether' || id === 'leppa-berry') return { type: 'pp', valeur: 10 };
  if (id === 'max-ether') return { type: 'pp', valeur: 99 };
  if (id === 'elixir') return { type: 'pp_toutes', valeur: 10 };
  if (id === 'max-elixir') return { type: 'pp_toutes', valeur: 99 };
  if (id === 'pp-up' || id === 'pp-max') return { type: 'pp_max', valeur: id === 'pp-max' ? 3 : 1 };
  if (VITAMINES[id]) return { type: 'ev', stat: VITAMINES[id], valeur: 10 };
  if (PLUMES[id]) return { type: 'ev', stat: PLUMES[id], valeur: 1 };
  if (id === 'rare-candy') return { type: 'niveau', valeur: 1 };
  if (id === 'bottle-cap') return { type: 'ivs', stat: 'choix', valeur: 31 };
  if (id === 'gold-bottle-cap') return { type: 'ivs', stat: 'tous', valeur: 31 };
  if (categorie === 'menthe') {
    const n = natures.get(id.replace(/-mint$/, ''));
    return n ? { type: 'menthe', nature: n } : { type: 'aucun' };
  }
  if (categorie === 'balle') return { type: 'balle', valeur: BALLES[id] || 1 };
  if (categorie === 'evolution') return { type: 'evolution' };
  return { type: 'aucun' };
}

// Télécharge plusieurs fichiers en même temps (pas trop, pour rester poli avec GitHub).
async function enParallele(liste, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, liste.length) }, async () => {
    while (i < liste.length) { const k = i++; await fn(liste[k], k); }
  }));
}

async function importer(options, progres, telecharger) {
  const generations = new Set((options?.generations?.length ? options.generations : [1, 2, 3, 4, 5, 6, 7, 8, 9]).map(String));
  const fichiers = ['types', 'type_names', 'type_efficacy', 'abilities', 'ability_names', 'ability_flavor_text',
    'moves', 'move_names', 'move_meta', 'move_meta_stat_changes', 'move_effect_prose', 'move_flavor_text',
    'pokemon', 'pokemon_species', 'pokemon_species_names', 'pokemon_species_flavor_text', 'pokemon_stats', 'pokemon_types',
    'pokemon_abilities', 'pokemon_moves', 'pokemon_evolution', 'version_groups',
    'items', 'item_names', 'item_flavor_text', 'natures', 'nature_names'];
  const t = {};
  let faits = 0;
  await enParallele(fichiers, 6, async (f) => {
    const texte = (await telecharger(`${CSV}${f}.csv`, 'texte')).toString('utf8');
    t[f] = lireCSV(texte);
    progres?.({ etape: 'Téléchargement des données', fait: ++faits, total: fichiers.length });
  });
  progres?.({ etape: 'Conversion', fait: 0, total: 1 });

  // Natures : PokeAPI → identifiants français de Tafl (hardi, solo…).
  const nomsNatures = noms(t.nature_names, 'nature_id');
  const natures = new Map(t.natures.map((n) => [n.identifier, slug(nomsNatures.get(n.id) || n.identifier)]));

  // Types (les 18 du jeu, sans « ??? », « Obscur » ni « Stellaire »).
  const nomsTypes = noms(t.type_names, 'type_id');
  const typesSrc = t.types.filter((x) => nombre(x.id) <= 18);
  const typeId = new Map(typesSrc.map((x) => [x.id, slug(nomsTypes.get(x.id) || x.identifier)]));
  const types = typesSrc.map((x) => {
    const contre = (f) => t.type_efficacy.filter((e) => e.damage_type_id === x.id && e.damage_factor === f && typeId.has(e.target_type_id)).map((e) => typeId.get(e.target_type_id));
    return { id: typeId.get(x.id), nom: nomsTypes.get(x.id) || x.identifier, couleur: COULEURS[x.identifier] || '', efficace: contre('200'), peu_efficace: contre('50'), sans_effet: contre('0'), officiel: x.identifier };
  });

  // Les créatures retenues (forme normale, générations choisies), et ce qu'elles apprennent.
  const especes = t.pokemon_species.filter((s) => generations.has(s.generation_id));
  const garde = new Set(especes.map((s) => s.id));
  const formes = new Map(t.pokemon.filter((p) => p.is_default === '1' && garde.has(p.species_id)).map((p) => [p.species_id, p]));
  const ordreVersion = new Map(t.version_groups.map((v) => [v.id, nombre(v.order)]));
  const parPokemon = new Map();
  for (const m of t.pokemon_moves) {
    if (!['1', '2', '4'].includes(m.pokemon_move_method_id)) continue;
    let l = parPokemon.get(m.pokemon_id);
    if (!l) parPokemon.set(m.pokemon_id, l = []);
    l.push(m);
  }
  const apprises = new Set(['165']); // Lutte : l'attaque de secours quand il n'y a plus de PP
  for (const p of formes.values()) for (const m of parPokemon.get(p.id) || []) apprises.add(m.move_id);

  // Talents
  const nomsTalents = noms(t.ability_names, 'ability_id');
  const textesTalents = derniers(t.ability_flavor_text, 'ability_id', 'version_group_id', 'flavor_text');
  const idTalent = identifiants();
  const idsFormes = new Set([...formes.values()].map((p) => p.id));
  const talentsUtilises = new Set(t.pokemon_abilities.filter((a) => idsFormes.has(a.pokemon_id)).map((a) => a.ability_id));
  const talentId = new Map();
  const talents = t.abilities.filter((a) => a.is_main_series === '1' && talentsUtilises.has(a.id)).map((a) => {
    const id = idTalent(nomsTalents.get(a.id) || a.identifier);
    talentId.set(a.id, id);
    return { id, nom: nomsTalents.get(a.id) || a.identifier, description: textesTalents.get(a.id) || '', officiel: a.identifier };
  });

  // Attaques
  const nomsAttaques = noms(t.move_names, 'move_id');
  const textesAttaques = derniers(t.move_flavor_text, 'move_id', 'version_group_id', 'flavor_text');
  const effets = new Map(t.move_effect_prose.filter((e) => e.local_language_id === FR).map((e) => [e.move_effect_id, propre(e.short_effect)]));
  const metas = new Map(t.move_meta.map((m) => [m.move_id, m]));
  const changements = new Map();
  for (const c of t.move_meta_stat_changes) {
    if (!changements.has(c.move_id)) changements.set(c.move_id, []);
    if (STATS[c.stat_id]) changements.get(c.move_id).push({ stat: STATS[c.stat_id], etages: nombre(c.change) });
  }
  const idAttaque = identifiants();
  const attaqueId = new Map();
  const attaques = t.moves.filter((m) => apprises.has(m.id) && typeId.has(m.type_id)).map((m) => {
    const id = idAttaque(nomsAttaques.get(m.id) || m.identifier);
    attaqueId.set(m.id, id);
    const meta = metas.get(m.id) || {};
    const cat = nombre(meta.meta_category_id);
    const stats = changements.get(m.id) || [];
    // Qui voit ses stats changer : le lanceur (Danse-Lames, Close Combat) ou l'adversaire (Rugissement).
    const surSoi = cat === 7 || (cat === 2 && ['7', '4', '13', '15', '5'].includes(m.target_id)) || (cat === 13 && stats.every((s) => s.etages > 0));
    const chance = nombre(m.effect_chance);
    return {
      id,
      nom: nomsAttaques.get(m.id) || m.identifier,
      type: typeId.get(m.type_id),
      categorie: CATEGORIES_ATTAQUE[m.damage_class_id] || 'statut',
      puissance: nombre(m.power),
      precision: nombre(m.accuracy),
      pp: nombre(m.pp, 1),
      priorite: nombre(m.priority),
      cible: CIBLES[m.target_id] || 'adversaire',
      statut: ALTERATIONS[meta.meta_ailment_id] || '',
      chance_statut: nombre(meta.ailment_chance),
      peur: nombre(meta.flinch_chance),
      stats,
      stats_cible: stats.length ? (surSoi ? 'soi' : 'adversaire') : 'adversaire',
      chance_stats: nombre(meta.stat_chance),
      drain: nombre(meta.drain),
      soin: nombre(meta.healing),
      critique: nombre(meta.crit_rate),
      coups_min: nombre(meta.min_hits, 1) || 1,
      coups_max: nombre(meta.max_hits, 1) || 1,
      effet: (effets.get(m.effect_id) || '').replace(/\$effect_chance/g, chance || ''),
      description: textesAttaques.get(m.id) || '',
      officiel: m.identifier,
    };
  });

  // Objets
  const nomsObjets = noms(t.item_names, 'item_id');
  const textesObjets = derniers(t.item_flavor_text, 'item_id', 'version_group_id', 'flavor_text');
  const idObjet = identifiants();
  const objetId = new Map();
  const objets = [];
  for (const o of t.items) {
    let categorie = CATEGORIES_OBJET[o.category_id];
    if (!categorie || !nomsObjets.get(o.id)) continue;
    if (o.identifier === 'bottle-cap' || o.identifier === 'gold-bottle-cap') categorie = 'ivs';
    if (o.identifier === 'rare-candy') categorie = 'vitamine';
    const id = idObjet(nomsObjets.get(o.id));
    objetId.set(o.id, id);
    objets.push({ id, nom: nomsObjets.get(o.id), categorie, prix: nombre(o.cost), description: textesObjets.get(o.id) || '', effet: effetObjet(o.identifier, categorie, natures), icone: '', officiel: o.identifier });
  }

  // Créatures
  const nomsEspeces = new Map(t.pokemon_species_names.filter((l) => l.local_language_id === FR).map((l) => [l.pokemon_species_id, l]));
  const textesEspeces = derniers(t.pokemon_species_flavor_text, 'species_id', 'version_id', 'flavor_text');
  const statsDe = new Map();
  for (const s of t.pokemon_stats) { if (!statsDe.has(s.pokemon_id)) statsDe.set(s.pokemon_id, []); statsDe.get(s.pokemon_id).push(s); }
  const typesDe = new Map();
  for (const s of [...t.pokemon_types].sort((a, b) => a.slot - b.slot)) { if (!typesDe.has(s.pokemon_id)) typesDe.set(s.pokemon_id, []); typesDe.get(s.pokemon_id).push(typeId.get(s.type_id)); }
  const talentsDe = new Map();
  for (const a of t.pokemon_abilities) { if (!talentsDe.has(a.pokemon_id)) talentsDe.set(a.pokemon_id, []); talentsDe.get(a.pokemon_id).push(a); }
  const idCreature = identifiants();
  const creatureId = new Map(especes.map((s) => [s.id, idCreature(nomsEspeces.get(s.id)?.name || s.identifier)]));
  const evolutionsDe = new Map();
  const vues = new Set();
  for (const e of t.pokemon_evolution) {
    if (vues.has(e.evolved_species_id) || !creatureId.has(e.evolved_species_id)) continue;
    vues.add(e.evolved_species_id);
    const avant = t.pokemon_species.find((s) => s.id === e.evolved_species_id)?.evolves_from_species_id;
    if (!creatureId.has(avant)) continue;
    const evo = { vers: creatureId.get(e.evolved_species_id), mode: 'autre', niveau: nombre(e.minimum_level), objet: '', condition: '' };
    if (e.evolution_trigger_id === '1') evo.mode = e.minimum_happiness ? 'amitie' : e.minimum_level ? 'niveau' : 'autre';
    if (e.evolution_trigger_id === '2') evo.mode = 'echange';
    if (e.evolution_trigger_id === '3') evo.mode = 'objet';
    evo.objet = objetId.get(e.trigger_item_id) || objetId.get(e.held_item_id) || '';
    const plus = [];
    if (e.time_of_day) plus.push(e.time_of_day === 'night' ? 'la nuit' : e.time_of_day === 'day' ? 'le jour' : e.time_of_day);
    if (e.known_move_id && attaqueId.has(e.known_move_id)) plus.push(`en connaissant ${attaqueId.get(e.known_move_id)}`);
    if (e.held_item_id && e.evolution_trigger_id !== '3') plus.push('en tenant l\'objet');
    if (e.gender_id) plus.push(e.gender_id === '1' ? 'femelle' : 'mâle');
    if (evo.mode === 'autre' && !e.minimum_level) plus.push('condition spéciale (voir le Pokédex)');
    evo.condition = plus.join(', ');
    if (!evolutionsDe.has(avant)) evolutionsDe.set(avant, []);
    evolutionsDe.get(avant).push(evo);
  }
  const creatures = especes.map((s) => {
    const p = formes.get(s.id);
    const st = Object.fromEntries((statsDe.get(p?.id) || []).filter((x) => STATS[x.stat_id] && x.stat_id <= 6).map((x) => [STATS[x.stat_id], nombre(x.base_stat)]));
    const ev = Object.fromEntries((statsDe.get(p?.id) || []).filter((x) => nombre(x.effort) > 0).map((x) => [STATS[x.stat_id], nombre(x.effort)]));
    // Les attaques : celles de la version la plus récente où la créature apparaît.
    const ms = parPokemon.get(p?.id) || [];
    const recent = (methode) => {
      const l = ms.filter((m) => m.pokemon_move_method_id === methode);
      const v = Math.max(-1, ...l.map((m) => ordreVersion.get(m.version_group_id) ?? 0));
      return l.filter((m) => (ordreVersion.get(m.version_group_id) ?? 0) === v);
    };
    const niveau = recent('1').map((m) => ({ niveau: nombre(m.level), attaque: attaqueId.get(m.move_id) })).filter((m) => m.attaque).sort((a, b) => a.niveau - b.niveau);
    const ct = [...new Set(recent('4').map((m) => attaqueId.get(m.move_id)).filter(Boolean))];
    // Tafl 1.1 : les capacités œufs (méthode 2), qu'on ne peut avoir que par l'élevage.
    const oeufs = [...new Set(recent('2').map((m) => attaqueId.get(m.move_id)).filter(Boolean))].filter((x) => !ct.includes(x));
    const tal = (talentsDe.get(p?.id) || []).sort((a, b) => a.slot - b.slot);
    const n = nomsEspeces.get(s.id);
    const g = nombre(s.gender_rate);
    return {
      id: creatureId.get(s.id),
      nom: n?.name || s.identifier,
      numero: nombre(s.id),
      espece: n?.genus || '',
      types: typesDe.get(p?.id) || [],
      stats: st,
      ev_donnes: ev,
      talents: tal.filter((a) => a.is_hidden === '0').map((a) => talentId.get(a.ability_id)).filter(Boolean),
      talent_cache: talentId.get(tal.find((a) => a.is_hidden === '1')?.ability_id) || '',
      taux_capture: nombre(s.capture_rate),
      xp_base: nombre(p?.base_experience),
      croissance: CROISSANCE[s.growth_rate_id] || 'moyenne',
      bonheur: nombre(s.base_happiness),
      male: g < 0 ? -1 : Math.round(((8 - g) / 8) * 1000) / 10,
      legendaire: s.is_mythical === '1' ? 'fabuleux' : s.is_legendary === '1' ? 'legendaire' : '',
      taille: nombre(p?.height) / 10,
      poids: nombre(p?.weight) / 10,
      evolutions: evolutionsDe.get(s.id) || [],
      attaques: niveau,
      ct,
      oeufs,
      description: textesEspeces.get(s.id) || '',
      sprites: { face: '', dos: '' },
      generation: nombre(s.generation_id),
      officiel: s.identifier,
      pokemonId: p?.id,
    };
  }).sort((a, b) => a.numero - b.numero);

  // Les images (facultatives) : face et dos des créatures, icônes des objets.
  const images = [];
  if (options?.sprites) for (const c of creatures) { images.push([c.sprites, 'face', `${SPRITES}pokemon/${c.pokemonId}.png`]); images.push([c.sprites, 'dos', `${SPRITES}pokemon/back/${c.pokemonId}.png`]); }
  if (options?.icones) for (const o of objets) images.push([o, 'icone', `${SPRITES}items/${o.officiel}.png`]);
  let n = 0;
  await enParallele(images, 12, async ([cible, cle, url]) => {
    try {
      const b = await telecharger(url, 'image');
      if (b?.length) cible[cle] = `data:image/png;base64,${b.toString('base64')}`;
    } catch { /* pas d'image pour celle-là : tant pis */ }
    if (++n % 20 === 0 || n === images.length) progres?.({ etape: 'Téléchargement des images', fait: n, total: images.length });
  });
  for (const c of creatures) delete c.pokemonId;
  return { types, talents, attaques, creatures, objets };
}

module.exports = { importer, lireCSV };
