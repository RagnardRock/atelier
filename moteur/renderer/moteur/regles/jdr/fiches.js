// Le pack JDR (Saga 0.13) : la fiche de personnage (menu Groupe › Résumé), le Bestiaire (les blocs de
// stats des monstres) et le résumé d'une fiche pour les scripts JS (saga.fiche). Même forme que
// pokemon/fiches.js ; menus.js › fiche les dessine, en pages (gauche/droite) et d'un personnage à
// l'autre (haut/bas).

const JdrFiches = (() => {
  const B = JdrBase, P = JdrPerso;
  const couleurPv = (k) => (k > 0.5 ? '#4cd964' : k > 0.2 ? '#f2c230' : '#f0503c');
  const numero = (m) => `N° ${String(Number(m?.numero) || 0).padStart(3, '0')}`;

  function fiche(jeu, c) {
    const k = P.classe(jeu, c), o = P.origine(jeu, c);
    const max = P.pvMax(jeu, c), auMax = c.niveau >= P.niveauMax(jeu);
    const xpAvant = P.xpPour(c.niveau), xpApres = P.xpPour(c.niveau + 1);
    const etat = c.mort_definitive ? 'Mort' : c.pv <= 0 ? (c.stable ? 'Stable, inconscient' : 'Mourant') : (c.etats || []).map((e) => B.nomEtat(jeu, e)).join(', ') || 'En forme';
    const infos = [
      { nom: 'Origine', valeur: o?.nom || '—', detail: o ? `${B.distance(jeu, P.vitesse(jeu, c))} · ${o.langues || ''}`.replace(/ · $/, '') : '' },
      { nom: 'Classe', valeur: `${k?.nom || c.classe || '—'} ${c.niveau}`, detail: k ? `dé de vie d${P.deVie(jeu, c)}` : '' },
      { nom: 'PV', valeur: `${Math.max(0, c.pv)} / ${max}${c.pv_temp ? ` (+${c.pv_temp} temp.)` : ''}`, barre: c.pv / Math.max(1, max), couleur: couleurPv(c.pv / Math.max(1, max)), detail: `dés de vie : ${c.des_vie} / ${c.niveau}` },
      { nom: 'Classe d\'armure', valeur: String(P.ca(jeu, c)) },
      { nom: 'Initiative', valeur: B.signe(P.initiative(jeu, c)) },
      { nom: 'Vitesse', valeur: B.distance(jeu, P.vitesse(jeu, c)) },
      { nom: 'Bonus de maîtrise', valeur: B.signe(P.pb(c)) },
      { nom: 'Perception passive', valeur: String(P.perceptionPassive(jeu, c)) },
      { nom: 'État', valeur: etat },
      B.regles(jeu).progression === 'jalons'
        ? { nom: 'Progression', valeur: 'par jalons', detail: 'le niveau monte avec l\'histoire' }
        : { nom: 'Expérience', valeur: `${c.xp}`, detail: auMax ? 'niveau maximum' : P.peutMonter(jeu, c) ? `peut passer au niveau ${c.niveau + 1} !` : `encore ${Math.max(0, xpApres - c.xp)} pour le niveau ${c.niveau + 1}`, barre: auMax ? 1 : (c.xp - xpAvant) / Math.max(1, xpApres - xpAvant), couleur: '#4aa8ff' },
    ];
    const caracs = B.caracteristiques(jeu).map((x) => {
      const v = P.carac(jeu, c, x.id), b = Number(o?.bonus?.[x.id]) || 0;
      return { nom: x.nom, valeur: `${v}  (${B.signe(B.mod(v))})`, detail: `sauvegarde ${B.signe(P.bonusSauvegarde(jeu, c, x.id))}${P.maitriseSauvegarde(jeu, c, x.id) ? ' ●' : ''}${b ? ` · origine ${B.signe(b)}` : ''}`, barre: v / 20 };
    });
    const maitrisees = P.competencesMaitrisees(jeu, c);
    const comps = B.competences(jeu).map((x) => ({
      nom: `${maitrisees.includes(x.id) ? '● ' : '○ '}${x.nom}`, valeur: B.signe(P.bonusCompetence(jeu, c, x.id)),
      detail: `${B.courtCarac(jeu, x.carac)}${(c.expertises || []).includes(x.id) && maitrisees.includes(x.id) ? ' · expertise' : ''}`,
    }));
    const combat = P.attaques(jeu, c).map((a) => ({ nom: a.nom, valeur: `${B.signe(a.bonus)} pour toucher`, detail: `${a.des}${a.mod ? ` ${B.signe(a.mod)}` : ''} ${B.nomDegats(a.type).toLowerCase()}${a.seconde ? ' · main gauche (action bonus)' : ''}${a.distance ? ' · à distance' : ''}` }));
    for (const id of P.ressources(jeu, c)) combat.push({ nom: P.RESSOURCES[id].nom, valeur: `${P.resteRessource(jeu, c, id)} / ${P.RESSOURCES[id].max(jeu, c)}`, detail: `revient avec un repos ${P.RESSOURCES[id].repos}` });
    if (c.pv <= 0 && !c.mort_definitive) combat.push({ nom: 'Jets contre la mort', valeur: `${c.mort.succes} ✓ · ${c.mort.echecs} ✗` });
    const m = P.maitrises(jeu, c);
    combat.push({ nom: 'Maîtrises', valeur: '', detail: [...m.armures.map((x) => ({ legere: 'armures légères', intermediaire: 'intermédiaires', lourde: 'lourdes', bouclier: 'boucliers' }[x] || x)), ...m.armes.map((x) => ({ courante: 'armes courantes', guerre: 'armes de guerre' }[x] || P.objet(jeu, x)?.nom || x))].join(', ') || 'aucune' });
    const pages = [
      { id: 'infos', nom: 'Infos', lignes: infos, texte: c.joueur ? `Joué par ${c.joueur}.` : '' },
      { id: 'caracteristiques', nom: 'Caractéristiques', lignes: caracs, texte: '● : sauvegarde maîtrisée.' },
      { id: 'competences', nom: 'Compétences', lignes: comps, texte: '● : maîtrisée. Pour lancer un test : menu Groupe › ce personnage › Faire un test.' },
      { id: 'combat', nom: 'Combat', lignes: combat },
    ];
    if (P.lanceur(jeu, c)) {
      const empl = P.emplacements(jeu, c);
      const lignes = [
        { nom: 'DD des sorts', valeur: String(P.ddSorts(jeu, c)), detail: `${B.nomCarac(jeu, P.caracMagie(jeu, c))} · attaque de sort ${B.signe(P.attaqueSorts(jeu, c))}` },
        ...empl.map((n, i) => (n ? { nom: `Emplacements niv. ${i + 1}`, valeur: `${'◆'.repeat(P.restants(jeu, c, i + 1))}${'◇'.repeat(Math.max(0, n - P.restants(jeu, c, i + 1)))}`, detail: `${P.restants(jeu, c, i + 1)} / ${n}` } : null)).filter(Boolean),
        ...P.sortsConnus(jeu, c).sort((a, b) => a.niveau - b.niveau).map((s) => ({ nom: s.nom, valeur: Number(s.niveau) ? `niv. ${s.niveau}` : 'tour', detail: [s.concentration ? 'concentration' : '', s.temps, s.portee].filter(Boolean).join(' · ') })),
      ];
      pages.push({ id: 'sorts', nom: 'Sorts', lignes, texte: P.sortsConnus(jeu, c).length ? '' : 'Aucun sort : menu Groupe › ce personnage › Sorts.' });
    }
    pages.push({
      id: 'inventaire', nom: 'Équipement',
      lignes: P.PLACES.map(([place, nom]) => { const ob = P.objet(jeu, c.equipement?.[place]); return { nom, valeur: ob?.nom || '—', detail: ob ? JdrHorsCombat.texteObjet(ob) : '' }; }),
      texte: 'Le sac et l\'argent sont communs au groupe (carnet, Tab).',
    });
    pages.push({
      id: 'traits', nom: 'Traits',
      lignes: P.aptitudes(jeu, c).map((x) => ({ nom: x.nom, valeur: x.niveau ? `niv. ${x.niveau}` : x.source || '', detail: x.description || '' })),
      texte: [o?.langues ? `Langues : ${o.langues}.` : '', c.notes ? `Notes : ${c.notes}` : ''].filter(Boolean).join('\n') || (P.aptitudes(jeu, c).length ? '' : 'Pas encore d\'aptitude.'),
    });
    return {
      titre: P.nom(jeu, c),
      sousTitre: `${o?.nom ? `${o.nom} · ` : ''}${k?.nom || ''} niv. ${c.niveau}`,
      image: P.portrait(jeu, c) || Sprites.vignette(jeu, P.apparence(jeu, c)),
      etiquettes: [...(k ? [{ texte: k.nom, couleur: k.couleur || '' }] : []), ...(c.etats || []).map((e) => ({ texte: B.nomEtat(jeu, e), couleur: '#9b6bff' }))],
      pages,
    };
  }

  // --- Le Bestiaire : les monstres du jeu, par numéro ---
  function especes(jeu) {
    return [...B.liste(jeu, 'monstres_jdr')]
      .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0) || String(a.nom).localeCompare(String(b.nom)))
      .map((m) => ({ id: m.id, numero: numero(m), nom: m.nom || m.id, image: m.image || '' }));
  }
  // Vu seulement : son nom, son image, sa description. Vaincu : tout son bloc de stats.
  function ficheEspece(jeu, id, { pris = false } = {}) {
    const m = B.trouver(jeu, 'monstres_jdr', id);
    if (!m) return null;
    const pages = [];
    if (pris) {
      pages.push({ nom: 'Bloc de stats', texte: m.description || '', lignes: [
        { nom: 'Classe d\'armure', valeur: String(m.ca || 10), detail: m.ca_texte || '' },
        { nom: 'Points de vie', valeur: String(m.pv || B.moyenne(m.pv_des)), detail: m.pv_des || '' },
        { nom: 'Vitesse', valeur: B.distance(jeu, m.vitesse || 9) },
        { nom: 'Facteur de puissance', valeur: String(m.fp ?? '0'), detail: `${Number(m.xp) || B.xpFp(m.fp)} XP` },
        { nom: 'Sens', valeur: '', detail: m.sens || '' },
        { nom: 'Langues', valeur: '', detail: m.langues || '—' },
      ] });
      pages.push({ nom: 'Caractéristiques', lignes: B.caracteristiques(jeu).map((k) => ({ nom: k.nom, valeur: `${Number(m.carac?.[k.id]) || 10} (${B.signe(B.mod(Number(m.carac?.[k.id]) || 10))})`, detail: m.sauvegardes?.[k.id] !== undefined ? `sauvegarde ${B.signe(Number(m.sauvegardes[k.id]))}` : '' })) });
      const res = [
        ...(m.resistances_degats || []).map((t) => ({ nom: B.nomDegats(t), valeur: 'Résistance (×½)' })),
        ...(m.immunites_degats || []).map((t) => ({ nom: B.nomDegats(t), valeur: 'Immunité' })),
        ...(m.vulnerabilites_degats || []).map((t) => ({ nom: B.nomDegats(t), valeur: 'Vulnérabilité (×2)' })),
        ...(m.immunites_etats || []).map((t) => ({ nom: B.nomEtat(jeu, t), valeur: 'Immunisé' })),
      ];
      pages.push({ nom: 'Actions', lignes: [
        ...(Number(m.multiattaque) > 1 ? [{ nom: 'Attaques multiples', valeur: `${m.multiattaque} attaques` }] : []),
        ...(m.actions || []).map((a) => ({ nom: a.nom, valeur: Number.isFinite(Number(a.attaque)) && a.attaque !== '' && a.attaque !== null ? `${B.signe(Number(a.attaque))} pour toucher` : a.sauvegarde?.carac ? `sauvegarde ${B.courtCarac(jeu, a.sauvegarde.carac)} DD ${a.sauvegarde.dd}` : '', detail: [a.degats ? `${a.degats} ${B.nomDegats(a.type_degats).toLowerCase()}` : '', a.recharge ? `recharge ${a.recharge}` : '', a.description || ''].filter(Boolean).join(' · ') })),
        ...(m.traits || []).map((t) => ({ nom: t.nom, valeur: '', detail: t.description || '' })),
      ] });
      pages.push({ nom: 'Défenses', lignes: res, texte: res.length ? '' : 'Ni résistance ni immunité.' });
      const butin = (m.butin || []).map((b) => ({ nom: P.objet(jeu, b.objet)?.nom || b.objet, valeur: `${Number(b.chance) || 0} %` }));
      if (butin.length || m.or) pages.push({ nom: 'Butin', lignes: [...(m.or ? [{ nom: 'Or', valeur: String(m.or) }] : []), ...butin] });
    } else {
      pages.push({ nom: 'Description', texte: 'Tu l\'as croisé, mais pas encore vaincu. Bats-le pour connaître son bloc de stats.', lignes: [] });
    }
    return { titre: m.nom || m.id, sousTitre: `${numero(m)}${m.type ? ` · ${m.type}` : ''}${m.boss ? ' · Boss' : ''}`, image: m.image || '', etiquettes: [], pages };
  }

  // Ce qu'un script JS lit d'un personnage (saga.fiche(i)) : les nombres déjà calculés.
  function pourScript(jeu, c) {
    return {
      nom: P.nom(jeu, c), personnage: c.creature, joueur: c.joueur || '', origine: c.origine, classe: c.classe, niveau: c.niveau, xp: c.xp,
      pv: c.pv, pvMax: P.pvMax(jeu, c), pv_temp: c.pv_temp || 0, ca: P.ca(jeu, c), maitrise: P.pb(c), vitesse: P.vitesse(jeu, c),
      caracteristiques: Object.fromEntries(B.caracteristiques(jeu).map((k) => [k.id, P.carac(jeu, c, k.id)])),
      modificateurs: Object.fromEntries(B.caracteristiques(jeu).map((k) => [k.id, P.modCarac(jeu, c, k.id)])),
      sauvegardes: Object.fromEntries(B.caracteristiques(jeu).map((k) => [k.id, P.bonusSauvegarde(jeu, c, k.id)])),
      competences: Object.fromEntries(B.competences(jeu).map((k) => [k.id, P.bonusCompetence(jeu, c, k.id)])),
      maitrises: P.competencesMaitrisees(jeu, c), perception_passive: P.perceptionPassive(jeu, c),
      etats: [...(c.etats || [])], sorts: [...(c.sorts || [])], dd_sorts: P.lanceur(jeu, c) ? P.ddSorts(jeu, c) : 0,
      mort: Boolean(c.mort_definitive),
    };
  }

  return { fiche, especes, ficheEspece, pourScript };
})();
