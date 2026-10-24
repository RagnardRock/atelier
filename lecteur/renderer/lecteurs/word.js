// Lecteur des documents Word (.docx), en lecture seule : mammoth.js transforme le document en HTML
// (titres, paragraphes, listes, tableaux, images, liens). La mise en page exacte de Word (marges,
// polices, en-têtes) n'est pas reprise : pour modifier le document, le bouton « Ouvrir dans Word »
// l'ouvre dans le programme choisi par Windows pour les .docx.

class LecteurWord extends LecteurHtml {
  type = 'word';
  async contenu() {
    this.feuille.classList.add('word');
    const buffer = this.doc.bytes.buffer.slice(this.doc.bytes.byteOffset, this.doc.bytes.byteOffset + this.doc.bytes.byteLength);
    const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
      // Les styles de titre français de Word (« Titre 1 »…) deviennent de vrais titres.
      styleMap: ['p[style-name=\'Title\'] => h1.titre:fresh', 'p[style-name=\'Subtitle\'] => p.sous-titre:fresh', 'p[style-name=\'Titre\'] => h1.titre:fresh', 'p[style-name=\'Sous-titre\'] => p.sous-titre:fresh', 'p[style-name=\'Titre 1\'] => h1:fresh', 'p[style-name=\'Titre 2\'] => h2:fresh', 'p[style-name=\'Titre 3\'] => h3:fresh', 'p[style-name=\'Citation\'] => blockquote:fresh'],
    }).catch((err) => { throw new Error(`Ce document Word ne s'ouvre pas (${err.message}).`); });
    this.feuille.innerHTML = DOMPurify.sanitize(value || '<p><em>Document vide.</em></p>');
  }
  boutonsDroite() {
    return [
      Barre.groupe(bouton('link-external', 'Ouvrir dans Word (ou le programme choisi par Windows) pour le modifier', () => window.mimir.ouvrirAilleurs(this.doc.chemin).catch((e) => notify(cleanError(e), 'error')), { texte: 'Ouvrir dans Word', classe: 'button small' })),
      ...super.boutonsDroite(),
    ];
  }
}
Lecteurs.ajouter('word', LecteurWord);
