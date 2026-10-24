// Les scripts des événements (FORMAT.md › Commandes) : Saga joue les commandes d'une page, dans
// l'ordre. Pendant un script, le joueur ne bouge pas.
//
// Chaque commande attend d'être finie avant la suivante (une boîte de dialogue attend que le joueur
// appuie sur Action, un téléporteur attend la fin du fondu). Une commande inconnue (écrite par une
// version plus récente de Tafl) est sautée sans planter.
//
// Les combats se jouent depuis Saga 0.3 (combat.js), les boutiques et l'écran des EV depuis Saga 0.5
// (boutique.js, regles/pokemon/hors-combat.js), avec les menus de menus.js ; le PC depuis Saga 0.6
// (ecrans.js).

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
    // Ce que les menus hors combat (boutique, sac, EV) reçoivent pour parler et demander.
    const ui = {
      dire: async (texte) => { await narrer(texte); dialogue.fermer(); },
      liste: (o) => moteur.menus.liste(o),
      quantite: (o) => moteur.menus.quantite(o),
      ev: (o) => moteur.menus.ev(o),
    };

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
          const nom = nomDe('creatures', c.creature);
          if (!trouver('creatures', c.creature)) { await narrer(`(La créature « ${c.creature} » n'existe pas dans les données du jeu.)`); break; }
          const place = Collection.ranger(jeu, partie, Regles.creer(jeu, c.creature, niveau));
          if (place.ou === 'equipe') await narrer(`${nom} (niveau ${niveau}) rejoint ton équipe !`);
          else await narrer(`Ton équipe est pleine : ${nom} part dans ${place.nom} (${place.pc}).`);
          break;
        }
        // Les combats (Saga 0.3). Perdu : le script s'arrête là (le joueur se réveille au dernier soin).
        case 'combat_sauvage': {
          if (!trouver('creatures', c.creature)) { await narrer(`(La créature « ${c.creature} » n'existe pas dans les données du jeu.)`); break; }
          if (!partie.equipe.some((x) => x.pv > 0)) { await narrer('Tu n\'as aucune créature en état de se battre !'); break; }
          const issue = await moteur.combattre({ sauvage: Regles.creer(jeu, c.creature, Number(c.niveau) || 5) });
          if (issue === 'defaite') throw new Fin();
          break;
        }
        case 'combat_dresseur': {
          const d = trouver('dresseurs', c.dresseur);
          if (!d) { await narrer(`(Le dresseur « ${c.dresseur} » n'existe pas dans les données du jeu.)`); break; }
          const qui = d.personnage ? orateur(d.personnage, 'normal') : { nom: `${d.classe ? `${d.classe} ` : ''}${d.nom}` };
          if (d.dialogue_avant) await dire(qui, d.dialogue_avant);
          if (!partie.equipe.some((x) => x.pv > 0)) { await narrer('Tu n\'as aucune créature en état de se battre !'); break; }
          const issue = await moteur.combattre({ dresseur: d });
          if (issue === 'defaite') throw new Fin();
          if (issue === 'victoire') partie.compteurs.dresseurs_battus = (partie.compteurs.dresseurs_battus || 0) + 1;
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
            // Saga 0.7 : une créature qui évolue « quand cette quête est finie ».
            await Regles.evolutionsEnAttente({ jeu, partie, ui });
          }
          break;
        }
        case 'soigner':
          for (const x of partie.equipe) Regles.soigner(jeu, x);
          // C'est ici que le joueur se réveillera s'il perd un combat.
          partie.dernierSoin = moteur.position();
          await narrer(partie.equipe.length ? 'Ton équipe est en pleine forme !' : 'Tu te reposes un instant.');
          break;
        // Tafl 0.16 : l'argent, les badges, le nom et la tenue du héros.
        case 'argent': {
          const montant = Math.max(0, Math.round(Number(c.montant) || 0));
          const monnaie = jeu.donnees.reglages?.reglages?.monnaie || '₽';
          if (!montant) break;
          if (c.action === 'retirer') {
            // Jamais sous 0 : s'il n'a pas assez, le joueur tombe à 0 et le script continue (FORMAT.md).
            const retire = Math.min(montant, partie.argent);
            partie.argent -= retire;
            await narrer(`Tu donnes ${retire} ${monnaie}.`);
          } else {
            partie.argent += montant;
            await narrer(`Tu reçois ${montant} ${monnaie} !`);
          }
          break;
        }
        case 'badge': {
          if (!c.badge) break;
          const def = (jeu.donnees.reglages?.reglages?.badges || []).find((b) => b.id === c.badge);
          if (!partie.badges.includes(c.badge)) {
            partie.badges.push(c.badge);
            partie.compteurs.badges = partie.badges.length;
            dialogue.annoncer('Nouveau badge', def?.nom || c.badge);
            await narrer(`Tu reçois le ${def?.nom || c.badge} !`);
          }
          break;
        }
        case 'personnaliser': {
          const heros = jeu.heros;
          const tenues = [{ id: '', nom: 'Tenue de base', sprite: heros?.sprite || null }, ...(heros?.tenues || [])];
          if (!c.nom && !c.tenue) break;
          dialogue.fermer();
          const r = await moteur.personnaliser({ nom: partie.nom, tenues, tenue: partie.tenue || '', demanderNom: Boolean(c.nom), demanderTenue: Boolean(c.tenue) });
          if (c.nom && r.nom) partie.nom = r.nom;
          if (c.tenue) partie.tenue = r.tenue || '';
          break;
        }
        case 'tenue': {
          const id = String(c.tenue || '');
          // Une tenue inconnue (supprimée dans Tafl) : on garde la tenue de base.
          partie.tenue = id && (jeu.heros?.tenues || []).some((t) => t.id === id) ? id : '';
          break;
        }
        // Saga 0.5 : les boutiques et l'écran des EV.
        case 'boutique':
          dialogue.fermer();
          await Boutique.ouvrir({ jeu, partie, ui, id: c.boutique, vraie: (cond) => Monde.vraie(cond, partie, carte, ev) });
          break;
        case 'ecran_ev':
          dialogue.fermer();
          await Regles.ecranEv({ jeu, partie, ui });
          break;
        // Saga 0.6 : le PC et ses boîtes (Tafl 0.21).
        case 'ecran_boites':
          dialogue.fermer();
          await moteur.ecrans.boites();
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

    return { executer, ui };
  }

  return { creer };
})();
