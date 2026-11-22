// Les actions de Loki dans Rune (depuis Rune 1.6). Leur liste et leurs descriptions sont dans
// ../loki-rune.js ; ici, ce que chacune fait dans la fenêtre. main.js (claude.js) envoie la demande,
// on répond { texte } ou { erreur }. Les actions « lecture » ne demandent pas la permission ;
// rapatrier_client passe par la carte Autoriser / Refuser.

const lokiActions = (() => {
  const bifrost = (action, ...args) => window.atelier.bifrost(action, ...args);
  const rel = (p) => (state.root && p && p.startsWith(state.root) ? p.slice(state.root.length + 1).replace(/\\/g, '/') : p);
  const norme = (c) => String(c || '').trim().replace(/\\/g, '/').replace(/^\.?\/+/, '');
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

  // Un chemin relatif au dossier ouvert → le chemin complet d'un fichier qui existe dans le projet.
  async function trouver(chemin) {
    if (!state.root) throw new Error('Aucun dossier ouvert dans Rune');
    const voulu = norme(chemin);
    if (!voulu) throw new Error('Chemin vide');
    const { files } = await window.atelier.listFiles();
    const f = files.find((x) => x.rel === voulu) || files.find((x) => x.rel.toLowerCase() === voulu.toLowerCase());
    if (!f) throw new Error(`${voulu} n'existe pas dans le projet (chemin relatif au dossier ouvert)`);
    return f.path;
  }

  const ongletActif = () => state.activeGroup?.active || null;
  const pageActive = () => { const t = ongletActif(); return t && /\.html?$/i.test(t.file.path) ? t.file.path : null; };

  async function lienBifrost() {
    const etat = await bifrost('etat');
    if (!etat.connecte) throw new Error('Rune n\'est pas connecté à Bifrost : Ragna doit se connecter dans le panneau Bifrost (icône globe)');
    if (!etat.lien?.site) throw new Error('Ce dossier n\'est relié à aucun site Bifrost (panneau Bifrost › Relier)');
    return etat;
  }

  const ACTIONS = {
    async etat_rune() {
      if (!state.root) return 'Aucun dossier ouvert dans Rune.';
      const l = [`Dossier ouvert : ${state.root}`];
      const t = ongletActif();
      if (t) {
        const pos = t.file.kind ? null : state.activeGroup.editor.getPosition();
        l.push(`Fichier actif : ${rel(t.file.path)}${pos ? ` (curseur ligne ${pos.lineNumber}, colonne ${pos.column})` : ''}${isDirty(t.file) ? ', modifié pas enregistré' : ''}`);
      } else l.push('Aucun fichier actif.');
      const onglets = state.groups.flatMap((g) => g.tabs).map((x) => `${rel(x.file.path)}${isDirty(x.file) ? ' ●' : ''}`);
      if (onglets.length) l.push(`Onglets (${onglets.length}) : ${[...new Set(onglets)].slice(0, 20).join(', ')}`);
      const panneau = $('#preview-panel');
      if (previewPanel.ouvert) {
        const largeur = panneau.classList.contains('mobile') ? 'téléphone (390 px)' : panneau.classList.contains('tablette') ? 'tablette (820 px)' : 'toute la largeur';
        l.push(`Aperçu ouvert : ${$('#preview-address').value || '/'}, ${largeur}${previewPanel.visuel ? ', mode visuel allumé' : ''}`);
      } else l.push('Aperçu fermé.');
      const live = $('#status-live');
      l.push(live.classList.contains('running') ? `Serveur de l'aperçu / Go Live : ${live.title.match(/https?:\/\/[^/\s]+/)?.[0] || live.textContent.trim()}` : 'Go Live pas encore lancé.');
      const choisi = bifrostPanel.choisi;
      if (choisi) {
        const flags = Object.entries(choisi.attrs).filter(([n]) => n.startsWith('data-bf')).map(([n, v]) => `${n}="${v}"`);
        l.push(`Élément choisi dans l'aperçu : <${choisi.tag}> dans ${rel(choisi.fichier)}, ligne ${choisi.ligne}${flags.length ? ` (${flags.join(' ')})` : ', sans flag'}`);
      }
      try {
        const etat = await bifrost('etat');
        if (!etat.connecte) l.push('Bifrost : pas connecté.');
        else {
          l.push(`Bifrost : connecté à ${etat.serveur} (${etat.email}).`);
          const lien = etat.lien;
          if (!lien?.site) l.push('Dossier relié à aucun site Bifrost.');
          else {
            l.push(`Site relié : ${lien.site.nom}${lien.dossier ? `, dans le sous-dossier ${lien.dossier}` : ''}${lien.synchro ? `, dernière synchro ${new Date(lien.synchro).toLocaleString('fr-FR')}` : ''}.`);
            const fiche = await bifrost('fiche').catch(() => null);
            if (fiche) {
              const pub = (fiche.publications || [])[0];
              l.push(`Modifications du client pas encore publiées : ${fiche.enAttente?.length || 0}.${pub ? ` Dernière publication : ${new Date(pub.createdAt).toLocaleString('fr-FR')}${pub.auteur ? ` par ${pub.auteur}` : ''}.` : ''}`);
            }
          }
        }
      } catch (err) { l.push(`Bifrost : ${cleanError(err)}`); }
      return l.join('\n');
    },

    async verifier_flags({ page }) {
      if (page) {
        const p = await trouver(page);
        const ouvert = state.files.get(p);
        const html = ouvert?.model ? ouvert.model.getValue() : await window.atelier.readFile(p);
        const a = BifrostFlags.analyser(html);
        const l = [`# Flags de ${rel(p)}`];
        if (a.modele) l.push(`Page modèle de la liste « ${a.modele} »`);
        for (const c of a.champs) l.push(`- ${c.cle || '(sans nom)'} : ${c.type}, <${c.tag}> ligne ${c.ligne}${c.liste ? `, dans la liste ${c.liste}` : ''}`);
        for (const li of a.listes) l.push(`- liste ${li.nom} : ${pluriel(li.elements, 'élément')}${li.limite ? `, ${li.limite} affichés` : ''}, ligne ${li.ligne}`);
        for (const f of a.formulaires) l.push(`- formulaire ${f.nom || '?'} : ${pluriel(f.champs, 'champ')}, ligne ${f.ligne}`);
        if (!a.champs.length && !a.listes.length && !a.formulaires.length) l.push('Aucune zone modifiable.');
        l.push('', a.erreurs.length ? '## Erreurs' : 'Aucune erreur.');
        for (const e of a.erreurs) l.push(`- ${e.gravite}, ligne ${e.ligne} : ${e.message}`);
        return l.join('\n');
      }
      if (!state.root) throw new Error('Aucun dossier ouvert dans Rune');
      const r = await bifrostPanel.analyserSite();
      if (!r.pages) return 'Aucune page du site n\'a de flags data-bf.';
      if (!r.erreurs.length) return `${pluriel(r.pages, 'page')} avec des flags, aucune erreur.`;
      return [`${pluriel(r.pages, 'page')} avec des flags, ${pluriel(r.erreurs.length, 'problème')} :`, ...r.erreurs.map((e) => `- ${e.gravite}, ${e.chemin}:${e.ligne} : ${e.message}`)].join('\n');
    },

    async ouvrir_fichier({ chemin, ligne }) {
      const p = await trouver(chemin);
      const n = Number.isInteger(ligne) && ligne > 0 ? ligne : null;
      await openAt(p, n, 1, 0, { preview: false });
      return `${rel(p)} ouvert${n ? ` à la ligne ${n}` : ''}.`;
    },

    async montrer_page({ page, ou = 'apercu' }) {
      if (!state.root) throw new Error('Aucun dossier ouvert dans Rune');
      const p = page ? await trouver(page) : pageActive();
      if (ou === 'navigateur') {
        const url = await window.atelier.previewUrl(p, state.config.previewPort);
        await window.atelier.previewExternal(url);
        return `Page ouverte dans le navigateur (Go Live) : ${url}`;
      }
      if (!previewPanel.ouvert) await previewPanel.toggle(true);
      if (p) await previewPanel.show(p);
      return `Aperçu : ${p ? rel(p) : 'accueil du site'}.`;
    },

    async modifications_client({ version = 'publie' }) {
      const etat = await lienBifrost();
      const [fiche, diff] = await Promise.all([bifrost('fiche'), bifrost('rapatrierApercu', version)]);
      const l = [`# ${etat.lien.site.nom}`];
      const attente = fiche.enAttente || [];
      l.push(attente.length ? `Pas encore publié par le client (${attente.length}) :` : 'Aucune modification en attente chez le client.');
      for (const c of attente.slice(0, 50)) l.push(`- ${c.texte}`);
      l.push('', `Fichiers qui diffèrent entre ${version === 'brouillon' ? 'le brouillon du client' : 'la version en ligne'} et le dossier local :`);
      if (!diff.fichiers.length) l.push('(aucun : les fichiers locaux sont identiques)');
      for (const f of diff.fichiers.slice(0, 200)) l.push(`- ${f.chemin} : ${f.etat === 'nouveau' ? 'absent en local' : 'modifié'}`);
      if (diff.seulementLocaux.length) l.push('', `Seulement en local (${diff.seulementLocaux.length}) : ${diff.seulementLocaux.slice(0, 50).join(', ')}`);
      return l.join('\n');
    },

    async fichier_client({ chemin, version = 'publie' }) {
      await lienBifrost();
      const texte = await bifrost('texteDistant', norme(chemin), version);
      return texte.length > 60000 ? `${texte.slice(0, 60000)}\n… (coupé à 60 000 caractères)` : texte;
    },

    async rapatrier_client({ version = 'publie', chemins }) {
      await lienBifrost();
      let liste = Array.isArray(chemins) ? chemins.map(norme).filter(Boolean) : null;
      if (!liste) liste = (await bifrost('rapatrierApercu', version)).fichiers.map((f) => f.chemin);
      if (!liste.length) return 'Rien à rapatrier : les fichiers locaux sont identiques.';
      const r = await bifrost('rapatrier', version, liste);
      for (const c of liste) {
        const p = await bifrost('cheminLocal', c).catch(() => null);
        if (p && state.files.has(p)) await reloadFromDisk(p, { quiet: true });
      }
      bifrostPanel.oublierClient();
      if (state.root) refreshFolder(state.root);
      return `${pluriel(r.ecrits, 'fichier')} rapatrié${r.ecrits > 1 ? 's' : ''} (${liste.join(', ')}).${r.sauvegarde ? ` Anciennes versions sauvegardées dans ${r.sauvegarde}.` : ''}`;
    },
  };

  // Ce que le panneau Loki affiche pour chaque action : [icône, texte].
  function decrire(nom, inp = {}) {
    switch (nom) {
      case 'etat_rune': return ['info', 'Regarde ce qui est ouvert dans Rune'];
      case 'verifier_flags': return ['globe', inp.page ? `Vérifie les flags Bifrost de ${inp.page}` : 'Vérifie les flags Bifrost du site'];
      case 'ouvrir_fichier': return ['go-to-file', `Ouvre ${inp.chemin || ''}${inp.ligne ? `:${inp.ligne}` : ''}`];
      case 'montrer_page': return ['eye', inp.ou === 'navigateur' ? `Go Live : ${inp.page || 'page active'}` : `Montre ${inp.page || 'la page'} dans l'aperçu`];
      case 'modifications_client': return ['globe', 'Regarde les modifications du client (Bifrost)'];
      case 'fichier_client': return ['globe', `Lit ${inp.chemin || ''} sur Bifrost`];
      case 'rapatrier_client': return ['cloud-download', `Rapatrie ${Array.isArray(inp.chemins) ? pluriel(inp.chemins.length, 'fichier') : 'les fichiers modifiés'} depuis Bifrost (${inp.version === 'brouillon' ? 'brouillon du client' : 'version en ligne'})`];
      default: return null;
    }
  }

  window.atelier.onClaudeAction(async ({ id, nom, args }) => {
    let reponse;
    try {
      const faire = ACTIONS[nom];
      if (!faire) throw new Error(`Action inconnue : ${nom}`);
      reponse = { texte: String(await faire(args || {})) };
    } catch (err) {
      reponse = { erreur: cleanError(err) };
    }
    window.atelier.claudeActionReponse(id, reponse);
  });

  return { decrire, ACTIONS };
})();
