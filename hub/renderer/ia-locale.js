// Réglages › IA locale : installer Ollama et les modèles qui font tourner Loki sur la carte
// graphique, quand Claude n'est pas là (voir commun/ollama.js et commun/loki-local.js).
//
// Tout se fait ici, sans terminal : installer Ollama, télécharger ou supprimer un modèle, choisir
// celui de Loki (le même pour tous les outils), et libérer la carte graphique pour ComfyUI.

const IaLocale = (() => {
  const go = (n) => `${(n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
  const CONTEXTES = [[8192, '8 000 jetons (moins de mémoire vidéo)'], [12288, '12 000 jetons (conseillé)'], [16384, '16 000 jetons'], [32768, '32 000 jetons (beaucoup de mémoire vidéo)']];
  // Ce que dit Ollama pendant un téléchargement, en français.
  const STATUTS = [[/^pulling manifest/, 'préparation'], [/^pulling/, 'téléchargement'], [/^verifying/, 'vérification'], [/^writing/, 'écriture'], [/^success/, 'terminé']];
  const statut = (t) => STATUTS.find(([re]) => re.test(t || ''))?.[1] || t || '…';
  const progres = {}; // nom du modèle (ou « ollama ») -> { statut, recu, total }
  let rafraichir = null;
  window.atelier.onIaProgres((p) => { progres[p.quoi] = p; rafraichir?.(); });

  async function ouvrir() {
    const boite = el('div', { className: 'ia-locale' });
    let etat = await window.atelier.iaEtat();
    let minuterie = null;

    const barre = (p) => {
      const pct = p?.total ? Math.round((100 * p.recu) / p.total) : 0;
      const b = el('div', { className: 'ia-barre' }, el('span'));
      b.firstChild.style.width = `${pct}%`;
      return el('div', { className: 'ia-progres' }, b, el('small', { textContent: `${statut(p?.statut)}${p?.total ? ` · ${pct} % de ${go(p.total)}` : ''}` }));
    };
    const bouton = (texte, run, primaire = false) => {
      const b = el('button', { type: 'button', className: `button small${primaire ? ' primary' : ''}`, textContent: texte });
      b.onclick = async () => {
        b.disabled = true;
        try { await run(); } catch (err) { notify(err.message, 'error', 8000); }
        etat = await window.atelier.iaEtat();
        dessiner();
      };
      return b;
    };

    function dessiner() {
      boite.replaceChildren();
      boite.append(el('p', { className: 'modal-info', textContent: 'Quand Claude n\'est pas là (pas d\'abonnement, limite atteinte, hors ligne), Loki peut répondre avec un modèle qui tourne sur ta carte graphique, grâce à Ollama. C\'est gratuit et privé, mais plus lent, et moins fiable que Claude sur les longues tâches en plusieurs étapes.' }));

      // 1. Ollama
      const ligne = el('div', { className: 'ia-ligne' });
      if (etat.actif) ligne.append(el('span', { className: 'ia-ok', textContent: `✓ Ollama ${etat.version} est prêt` }));
      else if (etat.installe) ligne.append(el('span', { textContent: 'Ollama est installé, mais arrêté.' }), bouton('Démarrer', () => window.atelier.iaDemarrer(), true));
      else if (progres.ollama && !progres.ollama.fini) ligne.append(barre(progres.ollama));
      else if (etat.windows) {
        ligne.append(el('span', { textContent: 'Ollama n\'est pas installé.' }), bouton('Installer Ollama', async () => {
          progres.ollama = { statut: 'téléchargement' };
          try { await window.atelier.iaInstaller(); } finally { progres.ollama.fini = true; }
        }, true));
      } else ligne.append(el('span', { textContent: 'Ollama n\'est pas installé.' }), bouton('Site d\'Ollama', () => window.atelier.iaSiteOllama()));
      boite.append(ligne);
      if (!etat.actif) return;

      // 2. Les modèles
      boite.append(el('h4', { className: 'ia-titre', textContent: 'Modèles' }));
      const installes = new Map(etat.modeles.map((m) => [m.nom, m]));
      const enMemoire = new Set(etat.enMemoire.map((m) => m.nom));
      const autres = etat.modeles.filter((m) => !etat.catalogue.some((c) => c.nom === m.nom)).map((m) => ({ nom: m.nom, libelle: m.nom, pourquoi: m.parametres ? `${m.parametres} paramètres` : '', taille: go(m.taille) }));
      for (const c of [...etat.catalogue, ...autres]) {
        const installe = installes.get(c.nom) || installes.get(`${c.nom}:latest`);
        const choisi = etat.reglages.modele === c.nom;
        const row = el('div', { className: `ia-modele${choisi ? ' choisi' : ''}` });
        const infos = el('div', { className: 'ia-infos' },
          el('strong', { textContent: c.libelle }),
          el('small', { textContent: [c.pourquoi, c.taille && `${c.taille}${c.memoire ? `, carte de ${c.memoire}` : ''}`, enMemoire.has(c.nom) && 'chargé en mémoire vidéo'].filter(Boolean).join(' · ') }));
        row.append(infos);
        const actions = el('div', { className: 'ia-actions' });
        if (etat.enCours.includes(c.nom)) {
          infos.append(barre(progres[c.nom]));
          actions.append(bouton('Annuler', () => window.atelier.iaAnnuler(c.nom)));
        } else if (installe) {
          if (choisi) actions.append(el('span', { className: 'ia-ok', textContent: 'Loki l\'utilise' }));
          else actions.append(bouton('Utiliser', () => window.atelier.iaReglages({ modele: c.nom })));
          actions.append(bouton('Supprimer', async () => {
            const ok = await Dialogs.ask('Supprimer le modèle', `Supprimer ${c.libelle} (${c.taille || ''}) de ce PC ? Tu pourras le retélécharger.`, [{ label: 'Annuler', value: false }, { label: 'Supprimer', value: true, primary: true }]);
            if (ok) await window.atelier.iaSupprimer(installe.nom);
            ouvrir(); // la fenêtre de confirmation a remplacé celle-ci
          }));
        } else {
          actions.append(bouton('Télécharger', async () => {
            const tache = window.atelier.iaTelecharger(c.nom);
            setTimeout(async () => { etat = await window.atelier.iaEtat(); dessiner(); }, 300);
            await tache;
            if (!installes.size) await window.atelier.iaReglages({ modele: c.nom }); // le premier devient celui de Loki
            notify(`${c.libelle} est téléchargé.`, 'info', 5000);
          }, c.nom === etat.catalogue[0].nom));
        }
        row.append(actions);
        boite.append(row);
      }
      if (!installes.size) boite.append(el('p', { className: 'modal-info', textContent: 'Conseil : Qwen3 14B pour une carte de 12 Go (RTX 4070). Si tu le trouves décevant, essaie Mistral Nemo 12B : chaque modèle a son caractère.' }));

      // 3. Réglages fins
      const contexte = el('select');
      for (const [v, l] of CONTEXTES) contexte.add(new Option(l, v));
      contexte.value = String(etat.reglages.contexte);
      contexte.onchange = () => window.atelier.iaReglages({ contexte: Number(contexte.value) });
      const reflexion = el('input', { type: 'checkbox', checked: etat.reglages.reflexion !== false });
      reflexion.onchange = () => window.atelier.iaReglages({ reflexion: reflexion.checked });
      boite.append(
        el('label', { className: 'field field-select' }, el('span', { className: 'field-label', textContent: 'Mémoire de la conversation' }), contexte),
        el('label', { className: 'field field-checkbox' }, el('span', { className: 'field-label', textContent: 'Réfléchir avant de répondre (plus juste, plus lent)' }), reflexion),
        el('div', { className: 'ia-ligne' }, bouton('Libérer la carte graphique', async () => {
          const n = await window.atelier.iaLiberer();
          notify(n ? 'Les modèles de Loki ont quitté la mémoire vidéo.' : 'Aucun modèle n\'était chargé.', 'info', 4000);
        })),
      );
    }

    dessiner();
    rafraichir = () => { if (!minuterie) minuterie = setTimeout(async () => { minuterie = null; etat = await window.atelier.iaEtat(); dessiner(); }, 400); };
    await Dialogs.form({ title: 'IA locale de Loki', okLabel: 'Fermer', cancelLabel: '', width: 560, fields: [{ type: 'element', element: boite }] });
    rafraichir = null;
  }

  return { ouvrir };
})();
