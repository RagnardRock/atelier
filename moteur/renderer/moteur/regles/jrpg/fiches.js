// Le pack JRPG classique (Saga 0.8) : les fiches des héros (menu Groupe, Réserve) et le Bestiaire.
// Même forme que pokemon/fiches.js ; menus.js › fiche les dessine.

const JrpgFiches = (() => {
  const H = JrpgHeros;
  const couleurPv = (k) => (k > 0.5 ? '#4cd964' : k > 0.2 ? '#f2c230' : '#f0503c');
  const numero = (m) => `N° ${String(Number(m?.numero) || 0).padStart(3, '0')}`;
  const nomType = (jeu, id) => H.trouver(jeu, 'types', id)?.nom || id;
  const etiquette = (jeu, id) => ({ texte: nomType(jeu, id), couleur: H.trouver(jeu, 'types', id)?.couleur || '' });

  function fiche(jeu, c) {
    const s = H.stats(jeu, c), base = H.statsBase(jeu, c), k = H.classe(jeu, c);
    const xpAvant = H.xpPour(jeu, c.niveau), xpApres = H.xpPour(jeu, c.niveau + 1);
    const auMax = c.niveau >= H.niveauMax(jeu);
    const infos = [
      { nom: 'Classe', valeur: k?.nom || c.classe || '—', detail: k?.description || '' },
      { nom: 'PV', valeur: c.pv > 0 ? `${c.pv} / ${s.pv}` : `K.O. (0 / ${s.pv})`, barre: c.pv / Math.max(1, s.pv), couleur: couleurPv(c.pv / Math.max(1, s.pv)) },
      { nom: 'PM', valeur: `${c.pm} / ${s.pm}`, barre: c.pm / Math.max(1, s.pm), couleur: '#5ea8ff' },
      { nom: 'Statut', valeur: H.STATUTS[c.statut] || 'En forme' },
      { nom: 'Expérience', valeur: `${c.xp}`, detail: auMax ? 'niveau maximum' : `encore ${Math.max(0, xpApres - c.xp)} pour le niveau ${c.niveau + 1}`, barre: auMax ? 1 : (c.xp - xpAvant) / Math.max(1, xpApres - xpAvant), couleur: '#4aa8ff' },
    ];
    const stats = H.STATS.map((st) => ({
      nom: H.NOMS_STATS[st], valeur: String(s[st]),
      detail: s[st] !== base[st] ? `${base[st]} ${s[st] > base[st] ? '+' : '−'} ${Math.abs(s[st] - base[st])} d'équipement` : '',
      barre: Math.min(1, s[st] / (st === 'pv' ? 999 : st === 'pm' ? 300 : 120)),
    }));
    const equipement = H.PLACES.map(([place, nom]) => {
      const o = H.trouver(jeu, 'objets', c.equipement[place]);
      const b = Object.entries(o?.equipement?.bonus || {}).filter(([, v]) => v).map(([st, v]) => `${H.NOMS_STATS[st]} ${v > 0 ? '+' : ''}${v}`);
      return { nom, valeur: o?.nom || '—', detail: [...b, o?.equipement?.element ? nomType(jeu, o.equipement.element) : ''].filter(Boolean).join(' · ') };
    });
    const competences = H.competences(jeu, c).map((id) => {
      const a = H.trouver(jeu, 'attaques', id), t = H.trouver(jeu, 'types', a?.type);
      return { nom: a?.nom || id, valeur: `${Number(a?.cout_pm) || 0} PM`, couleur: t?.couleur || '', detail: [t?.nom, a?.description].filter(Boolean).join(' · ') };
    });
    return {
      titre: H.nom(jeu, c),
      sousTitre: `N.${c.niveau}${k ? ` · ${k.nom}` : ''}`,
      image: H.portrait(jeu, c) || Sprites.vignette(jeu, H.apparence(jeu, c)),
      etiquettes: k ? [{ texte: k.nom, couleur: k.couleur || '' }] : [],
      pages: [
        { id: 'infos', nom: 'Infos', lignes: infos },
        { id: 'stats', nom: 'Statistiques', lignes: stats, texte: 'Avec l\'équipement (le détail montre ce qu\'il ajoute).' },
        { id: 'equipement', nom: 'Équipement', lignes: equipement, texte: 'Pour le changer : menu Groupe › ce héros › Équipement.' },
        { id: 'competences', nom: 'Compétences', lignes: competences, texte: competences.length ? '' : 'Pas encore de compétence.' },
      ],
    };
  }

  // --- Le Bestiaire : tous les monstres du jeu, dans l'ordre de leur numéro ---
  function especes(jeu) {
    return [...H.liste(jeu, 'monstres')]
      .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0) || String(a.nom).localeCompare(String(b.nom)))
      .map((m) => ({ id: m.id, numero: numero(m), nom: m.nom || m.id, image: m.image || '' }));
  }
  // Vu seulement : son nom et son image. Vaincu : tout (stats, faiblesses, butin).
  function ficheEspece(jeu, id, { pris = false } = {}) {
    const m = H.trouver(jeu, 'monstres', id);
    if (!m) return null;
    const pages = [];
    if (pris) {
      const lignes = [{ nom: 'Niveau', valeur: String(Number(m.niveau) || 1) }];
      for (const st of H.STATS) if (Number(m.stats?.[st])) lignes.push({ nom: H.NOMS_STATS[st], valeur: String(m.stats[st]) });
      pages.push({ nom: 'Description', texte: m.description || '', lignes: [{ nom: 'Expérience', valeur: String(Number(m.xp) || 0) }, { nom: 'Or', valeur: String(Number(m.or) || 0) }] });
      pages.push({ nom: 'Statistiques', lignes });
      const el = [
        ...(m.faiblesses || []).map((t) => ({ nom: nomType(jeu, t), valeur: 'Faiblesse (×2)', couleur: H.trouver(jeu, 'types', t)?.couleur || '' })),
        ...(m.resistances || []).map((t) => ({ nom: nomType(jeu, t), valeur: 'Résiste (×½)', couleur: H.trouver(jeu, 'types', t)?.couleur || '' })),
        ...(m.immunites || []).map((t) => ({ nom: nomType(jeu, t), valeur: 'Immunisé', couleur: H.trouver(jeu, 'types', t)?.couleur || '' })),
      ];
      pages.push({ nom: 'Éléments', lignes: el, texte: el.length ? '' : 'Ni faiblesse ni résistance.' });
      const butin = (m.butin || []).map((b) => ({ nom: H.trouver(jeu, 'objets', b.objet)?.nom || b.objet, valeur: `${Number(b.chance) || 0} %` }));
      pages.push({ nom: 'Butin', lignes: butin, texte: butin.length ? '' : 'Il ne laisse rien.' });
    } else {
      pages.push({ nom: 'Description', texte: 'Tu l\'as croisé, mais pas encore vaincu. Bats-le pour en savoir plus.', lignes: [] });
    }
    return {
      titre: m.nom || m.id,
      sousTitre: `${numero(m)}${m.boss ? ' · Boss' : ''}`,
      image: m.image || '',
      etiquettes: pris ? (m.faiblesses || []).map((t) => etiquette(jeu, t)) : [],
      pages,
    };
  }

  return { fiche, especes, ficheEspece };
})();
