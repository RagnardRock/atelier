// Les scripts des événements (FORMAT.md › Commandes) : Saga joue les commandes d'une page, dans
// l'ordre. Pendant un script, le joueur ne bouge pas.
//
// Chaque commande attend d'être finie avant la suivante (une boîte de dialogue attend que le joueur
// appuie sur Action, un téléporteur attend la fin du fondu). Une commande inconnue (écrite par une
// version plus récente de Tafl) est sautée sans planter.
//
// Les combats, les boutiques et l'écran des EV viendront dans les prochaines versions de Saga : pour
// l'instant, Saga le dit dans une boîte et le script continue (un combat compte comme gagné), pour que
// l'histoire reste jouable de bout en bout.

const Scripts = (() => {
  class Fin {} // la commande « fin » : on remonte tout le script d'un coup

  // moteur : ce que le moteur prête aux scripts (voir moteur.js › executer).
  function creer(moteur) {
    const { jeu, dialogue } = moteur;
    const liste = (sorte) => jeu.donnees[sorte]?.[sorte] || [];
    const trouver = (sorte, id) => liste(sorte).find((x) => x.id === id) || null;
    const nomDe = (sorte, id) => trouver(sorte, id)?.nom || id;

    // {joueur} → le nom du joueur.
    const remplir = (t) => String(t ?? '').replace(/\{joueur\}/g, moteur.partie().nom);

    // Qui parle : son nom, sa couleur, son portrait pour cette expression.
    function orateur(qui, expression, ev) {
      const id = qui === '@evenement' ? ev?.apparence?.personnage : qui;
      const p = id ? jeu.personnages.get(id) : null;
      if (!p) return {};
      const portraits = Array.isArray(p.portraits) ? p.portraits : [];
      const img = portraits.find((x) => x.expression === (expression || 'normal')) || portraits.find((x) => x.expression === 'normal') || portraits[0];
      const nom = p.heros ? moteur.partie().nom : p.nom;
      return { nom, couleur: p.couleur || '', portrait: img?.png || '' };
    }

    // Plusieurs boîtes : une ligne vide coupe le texte.
    async function dire(qui, texte) {
      for (const bloc of remplir(texte).split(/\n\s*\n/)) {
        if (bloc.trim()) await dialogue.dire(qui, bloc.trim());
      }
    }
    // Une phrase du jeu lui-même (« Tu reçois… »), sans nom.
    const narrer = (texte) => dire({}, texte);

    async function jouer(commandes, ev) {
      for (const c of Array.isArray(commandes) ? commandes : []) {
        if (!c || typeof c !== 'object') continue;
        await commande(c, ev);
      }
    }

    async function commande(c, ev) {
      const partie = moteur.partie();
      const carte = moteur.carte();
      switch (c.type) {
        case 'dire':
          await dire(orateur(c.qui, c.expression, ev), c.texte);
          break;
        case 'choix': {
          const options = (c.options || []).filter(Boolean);
          if (!options.length) break;
          const i = await dialogue.choisir(options.map((o) => remplir(o.texte)));
          await jouer(options[i].commandes, ev);
          break;
        }
        case 'si':
          await jouer(Monde.vraie(c.condition, partie, carte, ev) ? c.alors : c.sinon, ev);
          break;
        case 'commentaire':
          break;
        case 'fin':
          throw new Fin();
        case 'interrupteur':
          if (c.valeur) partie.interrupteurs[c.id] = true;
          else delete partie.interrupteurs[c.id];
          break;
        case 'local': {
          const cle = `${carte.id}/${ev?.id}`;
          if (c.valeur) partie.locaux[cle] = true;
          else delete partie.locaux[cle];
          break;
        }
        case 'attendre':
          await moteur.attendre(Math.max(0, Number(c.ms) || 0));
          break;
        case 'objet': {
          const n = Math.max(1, Number(c.nombre) || 1);
          const nom = nomDe('objets', c.objet);
          if (c.action === 'retirer') {
            partie.sac[c.objet] = Math.max(0, (partie.sac[c.objet] || 0) - n);
            if (!partie.sac[c.objet]) delete partie.sac[c.objet];
            await narrer(`Tu donnes ${nom}${n > 1 ? ` ×${n}` : ''}.`);
          } else {
            partie.sac[c.objet] = (partie.sac[c.objet] || 0) + n;
            await narrer(`Tu reçois ${nom}${n > 1 ? ` ×${n}` : ''} !`);
          }
          break;
        }
        case 'creature': {
          const niveau = Math.max(1, Number(c.niveau) || 5);
          const max = Number(jeu.donnees.reglages?.reglages?.equipe_max) || 6;
          const nom = nomDe('creatures', c.creature);
          if (partie.equipe.length < max) {
            partie.equipe.push({ creature: c.creature, niveau });
            await narrer(`${nom} (niveau ${niveau}) rejoint ton équipe !`);
          } else {
            (partie.boite ||= []).push({ creature: c.creature, niveau });
            await narrer(`Ton équipe est pleine : ${nom} part dans ta boîte.`);
          }
          break;
        }
        case 'combat_sauvage':
          await narrer(`Un ${nomDe('creatures', c.creature)} sauvage (niveau ${Number(c.niveau) || '?'}) apparaît !\n\n(Les combats arrivent dans une prochaine version de Saga.)`);
          break;
        case 'combat_dresseur': {
          const d = trouver('dresseurs', c.dresseur);
          const qui = d?.personnage ? orateur(d.personnage, 'normal') : { nom: d ? `${d.classe ? `${d.classe} ` : ''}${d.nom}` : c.dresseur };
          if (d?.dialogue_avant) await dire(qui, d.dialogue_avant);
          await narrer('(Les combats arrivent dans une prochaine version de Saga : on fait comme si tu avais gagné.)');
          if (d?.dialogue_defaite) await dire(qui, d.dialogue_defaite);
          partie.compteurs.dresseurs_battus++;
          if (d?.argent) {
            partie.argent += Number(d.argent) || 0;
            await narrer(`Tu gagnes ${d.argent} ${jeu.donnees.reglages?.reglages?.monnaie || '₽'}.`);
          }
          break;
        }
        case 'teleporter':
          dialogue.fermer();
          await moteur.teleporter(c.carte, c.x, c.y, c.direction);
          break;
        case 'quete': {
          const q = trouver('quetes', c.quete);
          const titre = q?.titre || c.quete;
          const etat = partie.quetes[c.quete];
          if (c.action === 'commencer') {
            partie.quetes[c.quete] = { etat: 'en_cours', etape: 1 };
            dialogue.annoncer(q?.secondaire ? 'Nouvelle quête secondaire' : 'Nouvelle quête', titre);
          } else if (c.action === 'etape') {
            const etape = Math.max(1, Number(c.etape) || 1);
            partie.quetes[c.quete] = { etat: 'en_cours', etape };
            const texte = q?.etapes?.[etape - 1]?.texte;
            dialogue.annoncer(titre, texte ? `Étape ${etape} : ${texte}` : `Étape ${etape}`);
          } else if (c.action === 'finir') {
            partie.quetes[c.quete] = { etat: 'finie', etape: etat?.etape || 0 };
            const suivante = q?.suivante ? trouver('quetes', q.suivante) : null;
            dialogue.annoncer('Quête terminée', suivante ? `${titre} · la suite : ${suivante.titre}` : titre);
          }
          break;
        }
        case 'soigner':
          await narrer(partie.equipe.length ? 'Ton équipe est en pleine forme !' : 'Tu te reposes un instant.');
          break;
        case 'boutique':
          await narrer(`(La boutique « ${nomDe('boutiques', c.boutique)} » ouvrira dans une prochaine version de Saga.)`);
          break;
        case 'ecran_ev':
          await narrer('(L\'écran des points d\'effort arrive dans une prochaine version de Saga.)');
          break;
        default:
          break; // commande inconnue : on la saute
      }
    }

    // Joue une page entière. La commande « fin » arrête tout le script, pas seulement le bloc en cours.
    async function executer(commandes, ev) {
      try {
        await jouer(commandes, ev);
      } catch (err) {
        if (!(err instanceof Fin)) throw err;
      } finally {
        dialogue.fermer();
      }
    }

    return { executer };
  }

  return { creer };
})();
