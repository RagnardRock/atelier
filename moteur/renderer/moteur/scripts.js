// Les scripts des événements (FORMAT.md › Commandes) : Saga joue les commandes d'une page, dans
// l'ordre. Pendant un script, le joueur ne bouge pas.
//
// Chaque commande attend d'être finie avant la suivante (une boîte de dialogue attend que le joueur
// appuie sur Action, un téléporteur attend la fin du fondu). Une commande inconnue (écrite par une
// version plus récente de Tafl) est sautée sans planter.
//
// Les combats se jouent depuis Saga 0.3 (combat.js), les boutiques et l'écran des EV depuis Saga 0.5
// (boutique.js, regles/pokemon/hors-combat.js), avec les menus de menus.js ; le PC depuis Saga 0.6
// (ecrans.js) ; le groupe de héros et les combats contre des groupes de monstres (pack JRPG) depuis Saga 0.8 ;
// la musique, les bruitages et l'heure depuis Saga 0.11 ; les variables et le bloc Script (une commande
// écrite en JavaScript par le jeu, jouée dans le bac à sable de scripts-js.js) depuis Saga 0.12 ; les
// commandes du pack de règles (Regles.commande : les tests, les repos… du pack JDR) depuis Saga 0.13.

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
    // Saga 0.13 : un nom à taper, des valeurs à répartir, une fiche, et le plateau de dés (pack JDR).
    const ui = {
      dire: async (texte) => { await narrer(texte); dialogue.fermer(); },
      liste: (o) => moteur.menus.liste(o),
      quantite: (o) => moteur.menus.quantite(o),
      ev: (o) => moteur.menus.ev(o),
      texte: (o) => moteur.menus.texte(o),
      repartir: (o) => moteur.menus.repartir(o),
      fiche: (o) => moteur.menus.fiche(o),
      des: (o) => moteur.des?.(o),
    };

    async function jouer(commandes, ev) {
      for (const c of Array.isArray(commandes) ? commandes : []) {
        if (!c || typeof c !== 'object') continue;
        await commande(c, ev);
      }
    }

    // Saga 0.12 : une variable du jeu (un nombre ou un texte court).
    const valeurVariable = (v) => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
      if (typeof v === 'boolean') return v ? 1 : 0;
      const t = String(v ?? '').slice(0, 200);
      return t.trim() !== '' && Number.isFinite(Number(t)) ? Number(t) : t;
    };

    // profondeur : combien de scripts JS sont déjà en train de se lancer les uns les autres.
    async function commande(c, ev, profondeur = 0) {
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
          return issue;
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
          return issue;
        }
        // Le groupe de héros (pack JRPG, Saga 0.8) : un personnage rejoint ou quitte le joueur.
        case 'groupe': {
          if (!Regles.capacites(jeu).groupe) { await narrer('(La commande « groupe » sert aux jeux du pack JRPG.)'); break; }
          const p = jeu.personnages.get(c.personnage);
          if (!p) { await narrer(`(Le personnage « ${c.personnage} » n'existe pas dans les données du jeu.)`); break; }
          const nom = p.heros ? partie.nom : p.nom;
          const place = Collection.toutes(partie).find((x) => x.c.heros && x.c.creature === c.personnage);
          if (c.action === 'quitter') {
            if (!place) break;
            if (place.ou === 'equipe' && partie.equipe.length <= 1) { await narrer(`(${nom} ne peut pas partir : le groupe serait vide.)`); break; }
            Collection.enlever(partie, place);
            partie.partis[c.personnage] = place.c;
            await narrer(`${nom} quitte le groupe.`);
            break;
          }
          if (place) break; // déjà là
          const membre = Regles.rejoindre(jeu, partie, c.personnage, Number(c.niveau) || 0);
          if (!membre) break;
          const ou = Collection.ranger(jeu, partie, membre);
          if (ou.ou === 'equipe') await narrer(`${nom} rejoint le groupe !`);
          else await narrer(`Le groupe est complet : ${nom} attend dans la ${ou.pc}.`);
          break;
        }
        case 'combat_groupe': {
          if (!trouver('groupes', c.groupe)) { await narrer(`(Le groupe de monstres « ${c.groupe} » n'existe pas dans les données du jeu.)`); break; }
          if (!partie.equipe.some((x) => x.pv > 0)) { await narrer('Personne dans le groupe n\'est en état de se battre !'); break; }
          const issue = await moteur.combattre({ groupe: c.groupe });
          if (issue === 'defaite') throw new Fin();
          return issue;
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
        // Saga 1.0 : le joueur compose son équipe lui-même (les jeux « arène », un tournoi…).
        case 'composer_equipe': {
          const nombre = Math.max(1, Math.min(6, Math.round(Number(c.nombre) || 6)));
          const niveau = Math.max(1, Math.min(100, Math.round(Number(c.niveau) || 50)));
          dialogue.fermer();
          const membres = await moteur.composerEquipe({ nombre, niveau, titre: c.titre || 'Compose ton équipe' });
          if (!membres?.length) break;
          // L'équipe d'avant est mise de côté (au PC) : on ne perd jamais ses créatures.
          if (c.garder !== false) for (const x of [...partie.equipe]) Collection.deposer(jeu, partie, x);
          partie.equipe = membres.map((m) => {
            const x = Regles.creer(jeu, m.id, niveau, { attaques: m.attaques });
            if (x && m.objet) x.objet = m.objet;
            return x;
          }).filter(Boolean);
          Collection.noterTout(partie);
          await narrer(`Ton équipe : ${partie.equipe.map((x) => Regles.resume(jeu, x).nom).join(', ')}.`);
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
        // Saga 0.11 : la musique, un bruitage, l'heure du jeu.
        case 'musique':
          // fichier : un morceau de sons/, 'aucune' pour le silence, '' pour revenir à celle de la carte.
          moteur.musique(Jeu.son(c.fichier, ['aucune']));
          break;
        case 'son':
          moteur.son(Jeu.son(c.fichier));
          break;
        case 'heure':
          moteur.heure({ action: c.action === 'avancer' ? 'avancer' : 'regler', heures: Number(c.heures) || 0 });
          break;
        // Saga 0.12 : les variables (régler, ajouter, retirer).
        case 'variable': {
          const id = String(c.id || '');
          if (!id) break;
          partie.variables = partie.variables || {};
          const avant = partie.variables[id] ?? 0;
          if (c.action === 'ajouter' || c.action === 'retirer') {
            const n = Number(c.valeur) || 0;
            partie.variables[id] = (Number(avant) || 0) + (c.action === 'retirer' ? -n : n);
          } else partie.variables[id] = valeurVariable(c.valeur);
          break;
        }
        // Saga 0.12 : une commande écrite en JavaScript par le jeu (scripts/*.js, commande()).
        case 'script': {
          const js = moteur.scriptsJs();
          try {
            const r = await js.commande(String(c.nom || ''), c.params, ev, profondeur);
            if (r.finScript) throw new Fin();
          } catch (err) {
            if (err instanceof Fin) throw err;
            if (js.dire) js.dire(err, `« ${c.nom} »`);
            else moteur.signaler?.(`Script « ${c.nom} » : ${err.message}`);
          }
          break;
        }
        default: {
          // Saga 0.13 : une commande du pack de règles du jeu (test, sauvegarde, repos… pour le pack JDR).
          // Elle rend un résultat simple, que reçoit un script JS (saga.test…).
          const f = Regles.commande(jeu, c.type);
          if (f) {
            dialogue.fermer();
            return await f({ jeu, partie, ui, c, jouer: (l) => jouer(l, ev), narrer, ranger: (m) => Collection.ranger(jeu, partie, m) });
          }
          // Saga 1.4 : une commande d'un module du jeu (modules/MODULES.md › commandes).
          const g = typeof Modules !== 'undefined' ? Modules.commande(jeu, c.type) : null;
          if (!g) break; // commande inconnue : on la saute
          dialogue.fermer();
          return await g(partie, moteur.hoteModules, { c, ev, ui, jouer: (l) => jouer(l, ev), narrer });
        }
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

    // Une seule commande, pour un script JS (saga.donner…, scripts-js.js). Rend l'issue d'un combat ;
    // lance BacASable.FIN si le script de l'événement doit s'arrêter là (combat perdu, « fin »).
    async function une(c, ev, profondeur = 1) {
      try {
        return await commande(c, ev, profondeur);
      } catch (err) {
        if (err instanceof Fin) throw BacASable.FIN;
        throw err;
      }
    }

    return { executer, une, ui };
  }

  return { creer };
})();
