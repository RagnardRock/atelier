// Ce que Claude peut faire dans Brokk (panneau Claude, ../commun/claude-panneau.js).
//
// Chaque action est décrite pour Claude (description, paramètres) et faite ici, dans la fenêtre,
// avec les mêmes fonctions que les boutons de Brokk (App.claude, dans app.js), mais sans leurs
// fenêtres de dialogue. Les actions « lecture » (infos, voir_asset) ne demandent pas la permission ;
// les autres affichent la carte Autoriser / Refuser du panneau.
//
// Un asset se désigne par son numéro dans la liste (0 = le premier), par son nom, ou pas du tout
// (= l'asset choisi dans la colonne de gauche).

(() => {
  const C = App.claude;
  const nombre = { type: 'number' };
  const refAsset = { type: ['number', 'string'], description: 'Numéro de l\'asset (0 = le premier) ou son nom. Sans : l\'asset choisi.' };

  const besoinProjet = () => {
    const p = C.projet();
    if (!p) throw new Error('Aucun projet ouvert dans Brokk. Ouvre-en un avec ouvrir_projet.');
    return p;
  };
  const assetDe = (ref) => {
    besoinProjet();
    const liste = C.assets();
    let a;
    if (ref === undefined || ref === null || ref === '') a = C.courant();
    else if (typeof ref === 'number' || /^\d+$/.test(ref)) a = liste[Number(ref)];
    else a = liste.find((x) => x.nom === ref || x.id === ref) || liste.find((x) => x.nom.toLowerCase() === String(ref).toLowerCase());
    if (!a) throw new Error(liste.length ? `Pas d'asset « ${ref ?? ''} ». Les assets : ${liste.map((x, i) => `${i} = ${x.nom}`).join(', ')}.` : 'Le projet n\'a encore aucun asset (ajouter_asset).');
    return a;
  };
  // Chemin d'une image : absolu, ou relatif au dossier du projet ouvert dans Brokk.
  const cheminDe = (chemin) => {
    const c = String(chemin || '').trim();
    if (!c) throw new Error('Il faut le chemin de l\'image.');
    return /^([a-zA-Z]:)?[\\/]/.test(c) ? c : `${besoinProjet().dossier}/${c}`;
  };
  const relatif = (p, chemin) => {
    const d = p.dossier.replace(/\\/g, '/'), c = chemin.replace(/\\/g, '/');
    return c.toLowerCase().startsWith(`${d.toLowerCase()}/`) ? c.slice(d.length + 1) : chemin;
  };
  // Les réglages d'une recette, lisibles par Claude (clé, type, choix possibles, bornes).
  const decrireChamps = (champs) => champs.filter((f) => f.key && !f.hidden).map((f) => {
    let t = `${f.key} (${f.type}`;
    if (f.choices) t += ` : ${f.choices.map(([v]) => v).join(' | ')}`;
    if (f.min !== undefined) t += `, ${f.min} à ${f.max}${f.unit ? ` ${f.unit}` : ''}`;
    return `${t}) = ${f.label}`;
  });
  const decrireAsset = (p, a, i) => ({
    numero: i, nom: a.nom, recette: a.recette, source: relatif(p, a.source), calque: a.calque || undefined,
    dossier: a.dossier || '(racine du projet)', options: a.options, dernier_export: a.etat || 'pas encore',
  });

  ClaudePanneau.actions({
    infos: {
      lecture: true,
      icone: 'info',
      libelle: () => 'Regarde le projet et ses assets',
      description: 'Le projet ouvert dans Brokk (dossier, type, dossier public, index.html), ses assets avec leurs réglages, et les recettes possibles avec la liste de leurs options.',
      faire: () => {
        const p = C.projet();
        const recettes = Recettes.liste.map((id) => {
          const r = Recettes.get(id);
          const ctx = { projet: p || {}, source: { type: 'image' }, config: {} };
          return `- ${id} (${r.nom}) : ${r.description}\n  options : ${decrireChamps(r.champs(ctx)).join(' ; ')}`;
        }).join('\n');
        if (!p) return `Aucun projet ouvert dans Brokk.\n\nRecettes :\n${recettes}`;
        const choisi = C.courant();
        return [
          `Projet : ${p.nom} (${p.type}), dossier ${p.dossier}`,
          p.publicDir ? `Dossier public : ${p.publicDir}/` : 'Pas de dossier public.',
          p.indexHtml ? `Page : ${p.indexHtml}` : 'Pas d\'index.html trouvé.',
          `Asset choisi : ${choisi ? choisi.nom : 'aucun'}`,
          `Assets : ${JSON.stringify(C.assets().map((a, i) => decrireAsset(p, a, i)), null, 1)}`,
          `Recettes :\n${recettes}`,
        ].join('\n');
      },
    },
    voir_asset: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Regarde l'asset ${a.asset ?? 'choisi'}`,
      description: 'Les fichiers que l\'asset va produire (chemin, format, taille, poids réel), le code à coller dans la page, et une image : l\'image source (après calque et rognage), ou la sortie n° sortie si tu le donnes.',
      schema: { type: 'object', properties: { asset: refAsset, sortie: { ...nombre, description: 'Numéro du fichier produit à voir (0 = le premier).' } } },
      faire: async (a) => {
        const p = besoinProjet();
        const asset = assetDe(a.asset);
        const { sorties, ctx, code } = await C.calculer(asset);
        const lignes = [];
        for (const [i, s] of sorties.entries()) {
          const poids = formatSize((await C.octets(s)).length);
          lignes.push(`${i}. ${s.rel} · ${s.format}${s.largeur ? ` · ${s.largeur} × ${s.hauteur} px` : ''} · ${poids}${s.note ? ` · ${s.note}` : ''}`);
        }
        let image = ctx.image;
        if (a.sortie !== undefined) {
          const s = sorties[Number(a.sortie)];
          if (!s) throw new Error(`Pas de sortie n° ${a.sortie} (il y en a ${sorties.length}).`);
          if (!s.canvas) throw new Error(`${s.rel} n'est pas une image.`);
          image = s.canvas;
        }
        const texte = [
          `Asset ${asset.nom} (${asset.recette}), source ${relatif(p, asset.source)} : ${ctx.image.width} × ${ctx.image.height} px${asset.calque ? `, calque ${asset.calque}` : ''}.`,
          `Fichiers produits :\n${lignes.join('\n')}`,
          code ? `Code pour la page :\n${code}` : '',
        ].filter(Boolean).join('\n\n');
        return { texte, image };
      },
    },
    ouvrir_projet: {
      icone: 'folder-opened',
      libelle: (a) => `Ouvre le projet ${a.dossier}`,
      description: 'Ouvre un dossier de projet dans Brokk (chemin absolu).',
      schema: { type: 'object', properties: { dossier: { type: 'string' } }, required: ['dossier'] },
      faire: async (a) => {
        await C.ouvrirProjet(String(a.dossier));
        const p = C.projet();
        return `Projet ouvert : ${p.nom} (${p.type}), ${C.assets().length} asset(s).`;
      },
    },
    ajouter_asset: {
      icone: 'add',
      libelle: (a) => `Ajoute ${a.source}${a.recette ? ` (${a.recette})` : ''}`,
      description: 'Ajoute une image (PSD, SVG, PNG, JPEG, WebP…) à exporter. source : chemin relatif au projet ou absolu. recette : favicon, image, responsive, og ou libre (sans : Brokk devine). nom : nom des fichiers. calque : pour un PSD, le chemin du calque ou du groupe (« Groupe / Calque »), sinon l\'image entière. Rien n\'est écrit avant exporter.',
      schema: { type: 'object', properties: { source: { type: 'string' }, recette: { type: 'string', enum: Recettes.liste }, nom: { type: 'string' }, calque: { type: 'string' } }, required: ['source'] },
      faire: async (a) => {
        const p = besoinProjet();
        const asset = await C.ajouter(cheminDe(a.source), a);
        return `Asset ajouté : ${JSON.stringify(decrireAsset(p, asset, C.assets().indexOf(asset)))}`;
      },
    },
    regler_asset: {
      icone: 'settings',
      libelle: (a) => `Règle l'asset ${a.asset ?? 'choisi'}`,
      description: 'Change un asset : recette, options (seulement les clés à changer, voir infos pour la liste), nom des fichiers, dossier (relatif au projet, "" = la racine).',
      schema: { type: 'object', properties: { asset: refAsset, recette: { type: 'string', enum: Recettes.liste }, options: { type: 'object' }, nom: { type: 'string' }, dossier: { type: 'string' } } },
      faire: async (a) => {
        const p = besoinProjet();
        const asset = assetDe(a.asset);
        if (a.options) {
          const recette = Recettes.get(a.recette || asset.recette);
          const cles = new Set(recette.champs({ projet: p, source: { type: 'svg' }, config: {} }).map((f) => f.key).filter(Boolean));
          const inconnues = Object.keys(a.options).filter((k) => !cles.has(k));
          if (inconnues.length) throw new Error(`Options inconnues pour ${recette.nom} : ${inconnues.join(', ')}. Possibles : ${[...cles].join(', ')}.`);
        }
        await C.regler(asset, a);
        return `Asset réglé : ${JSON.stringify(decrireAsset(p, asset, C.assets().indexOf(asset)))}`;
      },
    },
    choisir_asset: {
      lecture: true,
      icone: 'eye',
      libelle: (a) => `Affiche l'asset ${a.asset}`,
      description: 'Affiche un asset dans la fenêtre de Brokk (le choisit dans la colonne de gauche).',
      schema: { type: 'object', properties: { asset: refAsset }, required: ['asset'] },
      faire: (a) => { C.choisir(assetDe(a.asset)); return 'Fait.'; },
    },
    retirer_asset: {
      icone: 'trash',
      libelle: (a) => `Retire l'asset ${a.asset ?? 'choisi'} de la liste`,
      description: 'Retire un asset de la liste de Brokk. Les fichiers déjà exportés et l\'image source ne sont pas supprimés.',
      schema: { type: 'object', properties: { asset: refAsset } },
      faire: (a) => {
        const asset = assetDe(a.asset);
        C.retirer(asset);
        return `Retiré : ${asset.nom}.`;
      },
    },
    exporter: {
      icone: 'export',
      libelle: (a) => (a.assets?.length ? `Exporte ${a.assets.join(', ')}` : 'Exporte tous les assets'),
      description: 'Écrit les fichiers des assets dans le projet (remplace ceux qui existent déjà). Pour un favicon, pose aussi les balises dans index.html si l\'option est cochée. assets : numéros ou noms ; sans, tous.',
      schema: { type: 'object', properties: { assets: { type: 'array', items: refAsset } } },
      faire: async (a) => {
        besoinProjet();
        const liste = a.assets?.length ? a.assets.map(assetDe) : C.assets();
        if (!liste.length) throw new Error('Aucun asset à exporter.');
        const { ecrits } = (await C.exporter(liste)) || { ecrits: 0 };
        const erreurs = liste.filter((x) => x.etat === 'erreur').map((x) => x.nom);
        return `${ecrits} fichier(s) écrit(s).${erreurs.length ? ` En erreur : ${erreurs.join(', ')} (le message est affiché dans Brokk).` : ''}`;
      },
    },
  });
})();
