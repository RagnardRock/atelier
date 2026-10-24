// Ce que les lecteurs ont en commun : la liste des lecteurs, une base dont chacun hérite, la barre
// d'outils et la recherche dans un texte affiché en HTML (Word, Markdown, texte).
//
// Un lecteur reçoit le document lu par main.js ({ chemin, nom, taille, bytes }) et un contexte :
//   ctx.config        les réglages de Mímir
//   ctx.position      où tu en étais la dernière fois (page, zoom… ou {})
//   ctx.changement()  à appeler quand la page, le zoom ou « modifié » changent (barre d'état, reprise)
// Il fabrique trois éléments : racine (le document, dans #vues), barre (sa barre d'outils, dans #barre)
// et cote (sa colonne de gauche, dans #cote, ou null).

const Lecteurs = (() => {
  const fabriques = {};
  return {
    ajouter(type, fabrique) { fabriques[type] = fabrique; },
    async creer(type, doc, ctx) {
      // Le lecteur PDF est un module (pdf.js en est un) : on le charge la première fois qu'on en a besoin.
      if (type === 'pdf' && !fabriques.pdf) await import('./pdf.mjs');
      const fabrique = fabriques[type];
      if (!fabrique) throw new Error(`Mímir ne sait pas lire ce type de document (${doc.nom}).`);
      const lecteur = new fabrique(doc, ctx);
      await lecteur.ouvrir();
      return lecteur;
    },
  };
})();

class LecteurBase {
  constructor(doc, ctx) {
    this.doc = doc;
    this.ctx = ctx;
    this.config = ctx.config;
    this.racine = el('div', { className: 'vue' });
    this.barre = el('div', { className: 'barre-outils' });
    this.cote = null;
    this.modifie = false;
  }
  async ouvrir() {}
  // Pour la barre d'état : { page, pages, zoom, info }
  etat() { return {}; }
  // Ce qu'on garde pour rouvrir le document au même endroit.
  position() { return {}; }
  allerPage() {}
  zoomer() {}
  chercher() {}
  imprimer() { window.print(); }
  async enregistrer() { notify('Ce document se lit seulement : il n\'y a rien à enregistrer.', 'info'); return false; }
  // Raccourcis propres au lecteur (flèches, Page suivante…) : renvoie true si la touche est prise.
  clavier() { return false; }
  montrer() {}
  cacher() {}
  detruire() { this.racine.remove(); }

  // --- Pour Claude (claude-actions.js) ---
  infos() { return { type: this.type, nom: this.doc.nom, chemin: this.doc.chemin, ...this.etat() }; }
  async texte() { return ''; }
  async image() { return null; }
  async chercherTexte() { return []; }
  sommaire() { return []; }
}

// Petits morceaux de barre d'outils.
const Barre = {
  groupe: (...enfants) => el('div', { className: 'groupe' }, ...enfants),
  sep: () => el('span', { className: 'sep' }),
  espace: () => el('span', { className: 'spacer' }),
  // Champ de recherche avec ses flèches et le nombre de résultats. onChercher(texte, { precedent, nouveau })
  recherche(onChercher, placeholder = 'Chercher (Ctrl+F)') {
    const input = el('input', { type: 'search', className: 'recherche', placeholder, spellcheck: false });
    const compte = el('span', { className: 'recherche-compte' });
    let dernier = '';
    const lancer = (precedent) => {
      const t = input.value;
      onChercher(t, { precedent, nouveau: t !== dernier });
      dernier = t;
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); lancer(e.shiftKey); }
      if (e.key === 'Escape') { input.value = ''; lancer(false); input.blur(); }
    });
    input.addEventListener('input', () => { clearTimeout(input.delai); input.delai = setTimeout(() => lancer(false), 250); });
    const g = el('div', { className: 'groupe groupe-recherche' },
      el('i', { className: 'codicon codicon-search' }), input, compte,
      bouton('arrow-up', 'Résultat précédent (Maj+Entrée)', () => lancer(true)),
      bouton('arrow-down', 'Résultat suivant (Entrée)', () => lancer(false)));
    return { element: g, input, compte, focus() { input.focus(); input.select(); } };
  },
  // Numéro de page modifiable : « 12 / 340 »
  page(onPage) {
    const input = el('input', { type: 'text', className: 'page-num', value: '1', title: 'Aller à la page (Ctrl+G)' });
    const total = el('span', { className: 'page-total' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onPage(input.value); input.blur(); } });
    input.addEventListener('focus', () => input.select());
    return { element: el('div', { className: 'groupe groupe-page' }, input, total), input, total };
  },
};

// Recherche dans un texte affiché en HTML (Word, Markdown, texte) : les résultats sont surlignés avec
// l'API « CSS Custom Highlight » de Chromium, sans toucher au document lui-même.
class RechercheDom {
  constructor(zone, defilement) {
    this.zone = zone;
    this.defilement = defilement || zone;
    this.resultats = [];
    this.i = -1;
  }
  chercher(texte, { precedent = false, nouveau = true } = {}) {
    if (nouveau) {
      this.resultats = [];
      this.i = -1;
      const q = texte.trim().toLocaleLowerCase('fr');
      if (q) {
        const walker = document.createTreeWalker(this.zone, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = n.nodeValue.toLocaleLowerCase('fr');
          for (let k = t.indexOf(q); k >= 0; k = t.indexOf(q, k + q.length)) {
            const r = new Range();
            r.setStart(n, k);
            r.setEnd(n, k + q.length);
            this.resultats.push(r);
          }
        }
      }
      CSS.highlights.set('mimir-resultats', new Highlight(...this.resultats));
    }
    if (!this.resultats.length) { CSS.highlights.delete('mimir-actuel'); return { actuel: 0, total: 0 }; }
    this.i = (this.i + (precedent ? -1 : 1) + this.resultats.length) % this.resultats.length;
    const r = this.resultats[this.i];
    CSS.highlights.set('mimir-actuel', new Highlight(r));
    const box = r.getBoundingClientRect(), zone = this.defilement.getBoundingClientRect();
    this.defilement.scrollTop += box.top - zone.top - zone.height / 3;
    return { actuel: this.i + 1, total: this.resultats.length };
  }
  effacer() {
    CSS.highlights.delete('mimir-resultats');
    CSS.highlights.delete('mimir-actuel');
  }
}

// Extraits autour de chaque occurrence d'un mot dans un texte (pour Claude).
function extraits(texte, q, max = 30) {
  const out = [];
  const bas = texte.toLocaleLowerCase('fr'), cle = q.toLocaleLowerCase('fr');
  for (let k = bas.indexOf(cle); k >= 0 && out.length < max; k = bas.indexOf(cle, k + cle.length)) {
    out.push(`…${texte.slice(Math.max(0, k - 70), k + cle.length + 70).replace(/\s+/g, ' ')}…`);
  }
  return out;
}
