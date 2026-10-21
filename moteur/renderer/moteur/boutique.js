// Les boutiques (Saga 0.5, FORMAT.md › boutiques.json) : acheter des objets et des créatures,
// revendre ses objets à moitié prix, vendre ses créatures. Un article n'apparaît que quand sa
// condition est vraie (les succès du joueur : captures, dresseurs battus, badges, une quête…).
//
// Ce fichier ne connaît pas les règles : une créature achetée vient de Regles.creer, le prix d'une
// créature vendue de Regles.prixCreature. ui : dire, liste, quantite (voir menus.js).

const Boutique = (() => {
  async function ouvrir({ jeu, partie, ui, id, vraie }) {
    const liste = (sorte) => jeu.donnees[sorte]?.[sorte] || [];
    const trouver = (sorte, x) => liste(sorte).find((o) => o.id === x) || null;
    const b = trouver('boutiques', id);
    if (!b) { await ui.dire(`(La boutique « ${id} » n'existe pas dans les données du jeu.)`); return; }
    const reglages = jeu.donnees.reglages?.reglages || {};
    const monnaie = reglages.monnaie || '₽';
    const equipeMax = Number(reglages.equipe_max) || 6;
    const argent = () => `${partie.argent} ${monnaie}`;

    // Les articles visibles maintenant, avec leur prix (0 = le prix de l'objet).
    const articles = () => (b.articles || [])
      .filter((a) => !a.condition || vraie(a.condition))
      .map((a) => {
        const o = a.sorte === 'creature' ? trouver('creatures', a.id) : trouver('objets', a.id);
        const prix = Number(a.prix) || (a.sorte === 'creature' ? 0 : Number(o?.prix) || 0);
        return o && prix > 0 ? { a, o, prix } : null;
      })
      .filter(Boolean);

    async function acheter() {
      for (;;) {
        const l = articles();
        const i = await ui.liste({
          titre: 'Acheter', entete: argent(),
          items: l.map(({ a, o, prix }) => ({
            texte: a.sorte === 'creature' ? `${o.nom} (N.${Number(a.niveau) || 5})` : o.nom,
            image: a.sorte === 'creature' ? o.sprites?.face || '' : o.icone || '',
            detail: `${prix} ${monnaie}${a.sorte === 'creature' ? '' : partie.sac[a.id] ? ` · ×${partie.sac[a.id]}` : ''}`,
            desactive: prix > partie.argent,
          })),
          note: l.length ? '' : 'Rien à vendre pour l\'instant.',
        });
        if (i == null) return;
        const { a, o, prix } = l[i];
        if (a.sorte === 'creature') {
          const ok = await ui.liste({ titre: `${o.nom} pour ${prix} ${monnaie} ?`, items: [{ texte: 'Oui' }, { texte: 'Non' }] });
          if (ok !== 0) continue;
          partie.argent -= prix;
          const c = Regles.creer(jeu, a.id, Number(a.niveau) || 5);
          if (partie.equipe.length < equipeMax) { partie.equipe.push(c); await ui.dire(`${o.nom} rejoint ton équipe !`); }
          else { (partie.boite ||= []).push(c); await ui.dire(`Ton équipe est pleine : ${o.nom} part dans ta boîte.`); }
          continue;
        }
        const n = await ui.quantite({ titre: `${o.nom} : combien ?`, prix, max: Math.max(1, Math.min(99, Math.floor(partie.argent / prix))), monnaie });
        if (!n) continue;
        partie.argent -= n * prix;
        partie.sac[a.id] = (partie.sac[a.id] || 0) + n;
        await ui.dire(`Tu achètes ${o.nom} × ${n} pour ${n * prix} ${monnaie}. Merci !`);
      }
    }

    // Revendre : à moitié prix, sauf les objets clés et ceux qui ne valent rien.
    async function revendre() {
      for (;;) {
        const l = Object.entries(partie.sac).map(([x, n]) => ({ x, n, o: trouver('objets', x) }))
          .filter(({ n, o }) => n > 0 && o && o.categorie !== 'cle' && Number(o.prix) > 1)
          .map((v) => ({ ...v, prix: Math.floor(Number(v.o.prix) / 2) }));
        const i = await ui.liste({
          titre: 'Revendre', entete: argent(),
          items: l.map(({ o, n, prix }) => ({ texte: o.nom, image: o.icone || '', detail: `${prix} ${monnaie} · ×${n}` })),
          note: l.length ? '' : 'Tu n\'as rien à revendre ici.',
        });
        if (i == null) return;
        const { x, o, n: possede, prix } = l[i];
        const n = await ui.quantite({ titre: `${o.nom} : combien ?`, prix, max: possede, monnaie, verbe: 'Vendre' });
        if (!n) continue;
        partie.sac[x] -= n;
        if (partie.sac[x] <= 0) delete partie.sac[x];
        partie.argent += n * prix;
        await ui.dire(`Tu vends ${o.nom} × ${n} pour ${n * prix} ${monnaie}.`);
      }
    }

    // Vendre une créature : de la boîte, ou de l'équipe tant qu'il en reste une autre en état de se battre.
    async function vendreCreature() {
      for (;;) {
        const toutes = [...partie.equipe.map((c, i) => ({ c, ou: 'equipe', i })), ...(partie.boite || []).map((c, i) => ({ c, ou: 'boite', i }))];
        const r = (c) => Regles.resume(jeu, c);
        const garde = (x) => x.ou === 'equipe' && !partie.equipe.some((d, j) => j !== x.i && d.pv > 0);
        const i = await ui.liste({
          titre: 'Vendre une créature', entete: argent(),
          items: toutes.map((x) => ({
            texte: `${r(x.c).nom}${x.ou === 'boite' ? ' (boîte)' : ''}`, image: r(x.c).espece?.sprites?.face || '',
            detail: `N.${x.c.niveau} · ${Regles.prixCreature(jeu, x.c)} ${monnaie}`, desactive: garde(x),
          })),
          note: 'Une créature vendue ne revient pas.',
        });
        if (i == null) return;
        const x = toutes[i], nom = r(x.c).nom, prix = Regles.prixCreature(jeu, x.c);
        const ok = await ui.liste({ titre: `Vendre ${nom} pour ${prix} ${monnaie} ?`, items: [{ texte: 'Oui, la vendre' }, { texte: 'Non' }] });
        if (ok !== 0) continue;
        (x.ou === 'equipe' ? partie.equipe : partie.boite).splice(x.i, 1);
        partie.argent += prix;
        await ui.dire(`${nom} part avec son nouveau dresseur. Tu reçois ${prix} ${monnaie}.`);
      }
    }

    for (;;) {
      const choix = [['acheter', 'Acheter'], ...(b.rachete ? [['revendre', 'Revendre des objets']] : []), ...(b.achete_creatures ? [['creature', 'Vendre une créature']] : []), ['partir', 'Au revoir']];
      const i = await ui.liste({ titre: b.nom || 'Boutique', entete: argent(), note: b.description || '', items: choix.map(([, t]) => ({ texte: t })) });
      const c = i == null ? 'partir' : choix[i][0];
      if (c === 'acheter') await acheter();
      else if (c === 'revendre') await revendre();
      else if (c === 'creature') await vendreCreature();
      else return;
    }
  }

  return { ouvrir };
})();
