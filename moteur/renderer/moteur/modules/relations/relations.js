// Le module « relations » (Saga 1.15) : des liens avec les personnages du jeu. Une affinité qui monte quand
// le joueur leur parle (une fois par jour) ou leur offre un objet (selon leurs goûts), des niveaux nommés par
// le jeu, et des paroles qui se débloquent avec eux. Rien n'y est propre à un jeu : les personnes, leurs
// goûts, leurs paroles et les paliers viennent du dossier du jeu (Tafl : Données › Relations, et Réglages ›
// Règles du jeu › Modules › Relations).
//
// Les calculs sont dans calcul.js (RelationsCalcul), purs et testables sans écran. Ce fichier les branche au
// moteur par le contrat des modules (../MODULES.md) : les commandes et conditions des événements, l'écran
// des relations (carnet), son résumé dans le carnet, la nuit (l'oubli, coupé par défaut), saga.modules.relations.
//
// Un module ne suppose rien des autres : avec Gestion, les habitants nommés qui se promènent sont des
// figurants avec un personnage (f.qui), et le moteur demande aux modules quoi faire quand le joueur leur
// parle (parler) ; celui-ci répond pour tout personnage de ses données.

(() => {
  const C = RelationsCalcul;
  const cache = new WeakMap();
  const defs = (jeu) => { if (!cache.has(jeu)) cache.set(jeu, C.definitions(jeu.donnees)); return cache.get(jeu); };
  const poser = (o, neuf) => { for (const k of Object.keys(o.etat)) delete o.etat[k]; Object.assign(o.etat, neuf); };
  const etatDe = (o) => C.normaliser(defs(o.jeu), o.etat);
  const jourDe = (o) => Math.max(1, Math.round(Number(o.partie.jour) || 1));
  // Le personnage visé par une commande : un id, ou '@evenement' (celui de l'événement qui joue).
  const quiDe = (o) => { const q = String(o.c?.qui || '@evenement'); return q === '@evenement' ? String(o.ev?.apparence?.personnage || '') : q; };
  const nomDe = (o, d, id) => d.personnes.get(id)?.nom || o.jeu.personnages?.get?.(id)?.nom || id;

  // Les objets du sac qu'on peut offrir (pas les objets clés), avec leur nombre.
  function offrables(o) {
    const objets = new Map((o.jeu.donnees?.objets?.objets || []).map((x) => [x.id, x]));
    return Object.entries(o.partie.sac || {}).filter(([id, n]) => n > 0 && objets.get(id)?.categorie !== 'cle').map(([id, n]) => ({ id, n, def: objets.get(id) || null }));
  }
  const nomObjet = (o, id) => (o.jeu.donnees?.objets?.objets || []).find((x) => x.id === id)?.nom || id;

  // Dire quelque chose au nom d'un personnage (une boîte de dialogue avec son nom et son portrait).
  const direComme = (o, id, texte, expression = '') => o.jouer([{ type: 'dire', qui: id, expression, texte }]);

  // Un niveau vient de monter (ou de baisser) : les scripts l'apprennent, et le joueur le lit si le jeu
  // l'annonce.
  async function annoncer(o, d, id, r, dire = true) {
    if (r.apres === r.avant) return;
    o.hote?.reagir?.('relation_niveau', { personnage: id, niveau: r.apres, nom: C.nomNiveau(d, r.apres), avant: r.avant });
    if (r.apres > r.avant && dire && d.reglages.annoncer && o.narrer) {
      await o.narrer(`${C.remplir(d.reglages.textes.niveau_monte, { nom: nomDe(o, d, id), niveau: C.nomNiveau(d, r.apres) })}  ${C.coeurs(d, r.apres)}`);
    }
  }

  // Ce qu'on sait de ses goûts, en mots : « adore Miel · aime Fleurs des prés ».
  function goutsConnus(o, d, id, e) {
    const p = d.personnes.get(id);
    if (!p || d.reglages.gouts === 'caches') return '';
    const T = d.reglages.textes;
    const connus = d.reglages.gouts === 'tous' ? Object.fromEntries(p.gouts) : (e.liens[id]?.gouts || {});
    return ['adore', 'aime', 'deteste'].map((g) => {
      const l = Object.entries(connus).filter(([, x]) => x === g).map(([obj]) => nomObjet(o, obj));
      return l.length ? `${T[g]} ${l.join(', ')}` : '';
    }).filter(Boolean).join(' · ');
  }

  // L'écran des relations : une ligne par personne, son portrait, ses cœurs, où elle en est vers le niveau
  // suivant (une jauge), si on l'a vue aujourd'hui, et ce qu'on sait de ses goûts.
  async function ecran(o) {
    const ui = o.hote?.ui;
    if (!ui) return;
    const d = defs(o.jeu), e = etatDe(o), T = d.reglages.textes, jour = jourDe(o);
    const gens = C.visibles(d, e);
    const items = gens.map((p) => {
      const l = e.liens[p.id] || C.lienNeuf(p);
      const pr = C.progres(d, l.points);
      const bas = d.reglages.niveaux[pr.niveau].points;
      const vu = l.parle === jour || l.cadeau === jour;
      return {
        texte: p.nom, image: p.portrait, detail: C.coeurs(d, pr.niveau),
        pv: pr.vers === null ? 1 : (l.points - bas) / Math.max(1, pr.vers - bas),
        sous: [C.nomNiveau(d, pr.niveau), vu ? T.parle : T.pas_parle, goutsConnus(o, d, p.id, e)].filter(Boolean).join(' · '),
      };
    });
    if (!items.length) items.push({ texte: T.vide, ton: 'doux' });
    await ui.liste({ titre: d.reglages.nom, entete: `Jour ${jour}`, items, annulable: true, lecture: true });
  }

  // Choisir un objet du sac à offrir à id. → l'id de l'objet, ou null (annulé, ou rien à offrir).
  async function choisirCadeau(o, d, id) {
    const ui = o.hote?.ui || o.ui;
    const l = offrables(o);
    if (!l.length) { await o.narrer?.(d.reglages.textes.rien_a_offrir); return null; }
    if (!ui) return null;
    const e = etatDe(o);
    const connus = e.liens[id]?.gouts || {};
    const T = d.reglages.textes;
    const items = l.map(({ id: obj, n, def }) => ({ texte: def?.nom || obj, detail: `×${n}`, image: def?.icone || '',
      sous: connus[obj] && connus[obj] !== 'neutre' && d.reglages.gouts !== 'caches' ? `${nomDe(o, d, id)} ${T[connus[obj]]}` : '' }));
    const i = await ui.liste({ titre: `${T.offrir} · ${nomDe(o, d, id)}`, items, annulable: true });
    return i === null || i === undefined || i < 0 ? null : l[i].id;
  }

  // La réaction à un cadeau : le texte écrit pour ce personnage, sinon celui du jeu pour ce goût.
  const EXPRESSIONS = { adore: 'content', aime: 'content', neutre: '', deteste: 'gene' };

  Modules.enregistrer({
    id: 'relations',

    nouvellePartie(o) { poser(o, C.etatNeuf()); },
    preparer(o) { poser(o, etatDe(o)); },

    finDeJournee(o) {
      const d = defs(o.jeu);
      poser(o, C.finDeJournee(d, etatDe(o), o.jour).etat);
      return [];
    },

    // Saga 1.15 : le joueur parle à un figurant qui a un personnage (un habitant nommé du module Gestion).
    // Pour un personnage de ses données : la conversation du jour, puis (s'il y a de quoi) offrir un cadeau.
    parler(o) {
      const d = defs(o.jeu);
      const id = o.personnage;
      if (!d.personnes.has(id)) return null;
      const out = [{ type: 'relation_parler', qui: '@evenement' }];
      if (offrables(o).length && C.peutOffrir(d, etatDe(o), id, jourDe(o)).ok) {
        const T = d.reglages.textes;
        out.push({ type: 'choix', options: [{ texte: T.choix_offrir, commandes: [{ type: 'relation_offrir', qui: '@evenement', objet: '', reussi: [], rate: [] }] }, { texte: T.choix_rien, commandes: [] }] });
      }
      return out;
    },

    commandes: {
      // Parler : la première conversation du jour rapporte des points ; le personnage dit ses paroles du
      // jour (dire: false : seulement les points, l'événement écrit lui-même ce qu'il dit).
      async relation_parler(o) {
        const d = defs(o.jeu), id = quiDe(o), jour = jourDe(o);
        if (!id) return null;
        const r = C.parler(d, etatDe(o), id, jour);
        poser(o, r.etat);
        if (o.c.dire !== false) {
          const p = C.parole(d, etatDe(o), id, jour);
          poser(o, p.etat);
          await direComme(o, id, p.parole?.texte || d.reglages.textes.bonjour, p.parole?.expression || '');
        }
        await annoncer(o, d, id, r);
        o.hote?.rafraichir?.();
        const l = o.etat.liens[id];
        return { points: l.points, niveau: C.niveau(d, l.points), gagne: r.gagne, premiere: r.premiere };
      },
      // Offrir : un objet donné (objet) ou choisi dans le sac. Branches reussi / rate (annulé, rien à
      // offrir, déjà un cadeau aujourd'hui).
      async relation_offrir(o) {
        const d = defs(o.jeu), id = quiDe(o), jour = jourDe(o), T = d.reglages.textes;
        const rate = async (t) => { if (t) await o.narrer(t); await o.jouer(o.c.rate); return { ok: false }; };
        if (!id) return rate('');
        const p = C.peutOffrir(d, etatDe(o), id, jour);
        if (!p.ok) return rate(p.raison);
        let objet = String(o.c.objet || '');
        if (objet && !((o.partie.sac || {})[objet] > 0)) return rate(`Tu n'as pas ${nomObjet(o, objet)}.`);
        if (!objet) objet = await choisirCadeau(o, d, id);
        if (!objet) return rate('');
        await o.jouer([{ type: 'objet', action: 'retirer', objet, nombre: 1 }]);
        const r = C.offrir(d, etatDe(o), id, objet, jour);
        poser(o, r.etat);
        const def = d.personnes.get(id);
        await direComme(o, id, def?.merci[r.gout] || T[`merci_${r.gout}`], EXPRESSIONS[r.gout]);
        await annoncer(o, d, id, r);
        o.hote?.rafraichir?.();
        await o.jouer(o.c.reussi);
        const l = o.etat.liens[id];
        return { ok: true, gout: r.gout, points: l.points, niveau: C.niveau(d, l.points) };
      },
      // Changer l'affinité (une scène de l'histoire) : ajouter, retirer ou régler des points.
      async relation_points(o) {
        const d = defs(o.jeu), id = quiDe(o);
        if (!id) return null;
        const mode = ['retirer', 'regler'].includes(o.c.action) ? o.c.action : 'ajouter';
        const r = C.points(d, etatDe(o), id, Number(o.c.nombre) || 0, mode);
        poser(o, r.etat);
        await annoncer(o, d, id, r, o.c.annoncer !== false);
        o.hote?.rafraichir?.();
        const l = o.etat.liens[id];
        return { points: l.points, niveau: C.niveau(d, l.points), change: r.change };
      },
      async relation_ecran(o) { await ecran(o); return null; },
    },

    // relation_niveau : l'affinité avec `personnage` a atteint le niveau `min` (un numéro, 0 = le premier),
    // et (si max est donné) pas dépassé `max`. relation_parle : le joueur lui a parlé aujourd'hui.
    condition(o, cond) {
      if (cond.type !== 'relation_niveau' && cond.type !== 'relation_parle') return undefined;
      const d = defs(o.jeu), e = etatDe(o), id = String(cond.personnage || '');
      const l = e.liens[id] || C.lienNeuf(d.personnes.get(id));
      if (cond.type === 'relation_parle') return l.parle === jourDe(o);
      const n = C.niveau(d, l.points);
      const max = cond.max === undefined || cond.max === null || cond.max === '' ? Infinity : Number(cond.max);
      return n >= Math.max(0, Number(cond.min) || 0) && n <= max;
    },

    // Le résumé dans le carnet (touche Tab) : chaque personne rencontrée et ses cœurs.
    carnet(o) {
      const d = defs(o.jeu);
      if (!d.reglages.carnet) return [];
      const e = etatDe(o);
      const gens = C.visibles(d, e);
      if (!gens.length) return [];
      const lignes = gens.slice(0, 12).map((p) => ({ texte: p.nom, detail: C.coeurs(d, C.niveau(d, e.liens[p.id]?.points ?? p.depart)) }));
      return [{ titre: d.reglages.nom, detail: gens.length > 12 ? `${gens.length}` : '', lignes }];
    },

    actionsPause(o) {
      const d = defs(o.jeu);
      return d.reglages.menu && d.personnes.size ? [['relations', d.reglages.nom, 'heart']] : [];
    },
    async agirPause(o, choix) { if (choix === 'relations') await ecran(o); },

    // saga.modules.relations.brune → { points, niveau, nom_niveau, rencontre, parle_aujourdhui }
    pourScript(o) {
      const d = defs(o.jeu), e = etatDe(o), jour = jourDe(o), out = {};
      for (const p of d.personnes.values()) {
        const l = e.liens[p.id] || C.lienNeuf(p);
        const n = C.niveau(d, l.points);
        out[p.id] = { points: l.points, niveau: n, nom_niveau: C.nomNiveau(d, n), rencontre: l.rencontre, parle_aujourdhui: l.parle === jour };
      }
      return out;
    },
  });
})();
