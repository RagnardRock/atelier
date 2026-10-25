// Composer son équipe librement (Saga 1.0, commande « composer son équipe » de Tafl 1.0).
//
// Un écran posé sur le jeu : toutes les créatures du jeu, une recherche, et jusqu'à N choix au niveau
// écrit par la carte. C'est fait pour les jeux « arène » (un duel entre deux joueurs qui prennent chacun
// leur équipe), mais un jeu peut s'en servir pour autre chose (un tournoi, un prêt de créatures…).
//
//   EquipeLibre.creer(conteneur) → { ouvrir({ nombre, niveau, titre }), fermer, get ouvert }
// ouvrir() rend la liste des ids choisis (ou null si le joueur ferme l'écran sans rien valider quand il
// en a le droit) ; le jeu, lui, remplace l'équipe (voir scripts.js).

const EquipeLibre = (() => {
  function creer(conteneur) {
    const racine = el('div', { className: 'libre-ecran', hidden: true });
    conteneur.append(racine);
    let ouvert = null;

    // Échap ferme l'écran (quand on a le droit), et les touches ne vont pas au jeu derrière.
    window.addEventListener('keydown', (e) => {
      if (!ouvert) return;
      if (e.key === 'Escape' && ouvert.annulable) { e.preventDefault(); e.stopImmediatePropagation(); ouvert.finir(null); return; }
      if (!e.target.closest?.('input')) e.stopImmediatePropagation();
    }, true);

    function ouvrir({ jeu, nombre = 6, niveau = 50, titre = 'Compose ton équipe', annulable = false } = {}) {
      const especes = (jeu.donnees.creatures?.creatures || []).filter((c) => c && c.id);
      return new Promise((resoudre) => {
        const choisies = [];
        const carte = el('div', { className: 'libre-carte' });
        const tete = el('div', { className: 'libre-tete' },
          el('h2', { textContent: titre }),
          el('span', { className: 'libre-compte' }));
        const recherche = el('input', { className: 'libre-recherche', type: 'search', placeholder: 'Chercher une créature…', spellcheck: false });
        const liste = el('div', { className: 'libre-liste' });
        const choix = el('div', { className: 'libre-choix' });
        const ok = el('button', { className: 'libre-ok', type: 'button', textContent: 'C\'est mon équipe !' });
        const aide = el('p', { className: 'libre-aide', textContent: especes.length ? `Clique jusqu'à ${nombre} créature${nombre > 1 ? 's' : ''} (niveau ${niveau}). Reclique une créature choisie pour l'enlever.` : 'Ce jeu n\'a encore aucune créature : importe les données officielles dans Tafl (Loki › « Importe les données officielles Pokémon »), puis reviens ici.' });
        carte.append(tete, recherche, liste, el('div', { className: 'libre-bas' }, choix, ok), aide);
        racine.append(carte);
        racine.hidden = false;

        const finir = (r) => {
          racine.hidden = true;
          racine.innerHTML = '';
          ouvert = null;
          resoudre(r);
        };
        ouvert = { finir, annulable };

        function dessiner() {
          const q = recherche.value.trim().toLowerCase();
          liste.innerHTML = '';
          for (const e of especes) {
            if (q && !`${e.nom || ''} ${e.id} ${e.officiel || ''}`.toLowerCase().includes(q)) continue;
            const prise = choisies.filter((x) => x === e.id).length;
            const b = el('button', { className: `libre-creature${prise ? ' prise' : ''}`, type: 'button', title: e.nom || e.id });
            const im = e.sprites?.face || e.image || '';
            b.append(im ? el('img', { src: im, alt: '' }) : el('span', { className: 'libre-vide', textContent: (e.nom || '?')[0] }),
              el('span', { className: 'libre-nom', textContent: e.nom || e.id }),
              prise ? el('b', { className: 'libre-prise', textContent: `×${prise}` }) : null);
            b.onclick = () => {
              const i = choisies.lastIndexOf(e.id);
              if (i >= 0 && choisies.length >= nombre) choisies.splice(i, 1);
              else if (choisies.length < nombre) choisies.push(e.id);
              else return;
              dessiner();
            };
            liste.append(b);
          }
          if (!liste.children.length) liste.append(el('p', { className: 'libre-aide', textContent: especes.length ? 'Aucune créature ne correspond.' : '' }));
          tete.querySelector('.libre-compte').textContent = `${choisies.length} / ${nombre}`;
          choix.innerHTML = '';
          for (const id of choisies) {
            const e = especes.find((x) => x.id === id);
            const im = e?.sprites?.face || e?.image || '';
            const b = el('button', { className: 'libre-petite', type: 'button', title: `Enlever ${e?.nom || id}` },
              im ? el('img', { src: im, alt: '' }) : el('span', { textContent: (e?.nom || '?')[0] }));
            b.onclick = () => { choisies.splice(choisies.indexOf(id), 1); dessiner(); };
            choix.append(b);
          }
          ok.disabled = !choisies.length;
        }
        recherche.oninput = dessiner;
        ok.onclick = () => { if (choisies.length) finir([...choisies]); };
        dessiner();
        recherche.focus();
      });
    }
    function fermer() { if (ouvert) ouvert.finir(null); }
    return { ouvrir, fermer, get ouvert() { return Boolean(ouvert); } };
  }
  return { creer };
})();
