// Les personnages sur la carte.
// Un personnage qui a un sprite dessiné dans Tafl (Tafl 0.12, FORMAT.md › personnages.json) est
// dessiné avec : voir dessinerSprite, plus bas. Sinon, Saga dessine le personnage de base
// (../commun/perso-base.js, Saga 1.31) : 16 × 24 px dans le style des tuiles « val », à la couleur du
// personnage (sa `couleur` dans personnages.json), 4 directions, 3 images de marche, et en temps réel
// ses animations (repos, coup d'épée, coup reçu, chute). Il est agrandi pour les tuiles de 32 ou 48 px.

const Sprites = (() => {
  const ORDRE = ['bas', 'gauche', 'droite', 'haut'];

  // Les planches du personnage de base, par couleur et par agrandissement (1 pour des tuiles de 16 px).
  const cache = new Map();
  const echelleDe = (taille) => Math.max(1, Math.round((taille || 16) / 16));
  function base(couleur, taille = 16) {
    const c = /^#[0-9a-f]{6}$/i.test(couleur || '') ? couleur.toLowerCase() : '#d94a4a';
    const e = echelleDe(taille), cle = `${c}/${e}`;
    if (!cache.has(cle)) {
      const p = PersoBase.planches(c, {}, e);
      const anims = {};
      for (const [nom, a] of Object.entries(p.animations)) anims[nom] = { img: a.toile, largeur: a.largeur, hauteur: a.hauteur, images: a.images, duree: a.duree, base: true };
      cache.set(cle, { sprite: { img: p.marche.toile, largeur: p.marche.largeur, hauteur: p.marche.hauteur, images: 3, base: true }, animations: anims, echelle: e });
      if (cache.size > 96) cache.delete(cache.keys().next().value);
    }
    return cache.get(cle);
  }
  // Une animation du personnage de base (repos, attaque, coup, mort), pour le temps réel.
  const animationBase = (couleur, nom, taille) => base(couleur, taille).animations[nom] || null;

  // L'ombre douce au sol, sous chaque personnage : c'est elle qui le « pose » sur la carte.
  function ombre(ctx, x, y, taille, echelle = 1) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x + taille / 2, y + taille * 0.9, taille * 0.32 * echelle, taille * 0.12 * echelle, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Dessine le personnage de base en (x, y) (coin haut gauche de sa case, en pixels de jeu) : les pieds en
  // bas de la case, la tête dépasse sur la case du dessus. pas : 0 debout, 1 et 2 les deux pieds.
  function dessiner(ctx, couleur, direction, pas, x, y, taille) {
    const b = base(couleur, taille), s = b.sprite, k = taille / (16 * b.echelle);
    const r = Math.max(0, ORDRE.indexOf(direction));
    const w = s.largeur * k, h = s.hauteur * k;
    ctx.drawImage(s.img, Math.min(2, Math.max(0, pas)) * s.largeur, r * s.hauteur, s.largeur, s.hauteur,
      Math.round(x + (taille - w) / 2), Math.round(y + taille - h), Math.round(w), Math.round(h));
  }

  // L'image d'un pas (FORMAT.md) : pendant le pas n° `pas` (1, 2, 3…), l'image de marche suivante
  // (1, 2, …, images - 1, puis on recommence) ; debout, l'image 0.
  const imageDeMarche = (images, pas) => (pas > 0 && images > 1 ? 1 + ((pas - 1) % (images - 1)) : 0);

  // Un sprite de Tafl : l'image de la direction, les pieds en bas de la case, centré. Un sprite plus
  // haut qu'une case (16 × 32) dépasse sur la case du dessus. pas : 0 debout, sinon le n° du pas.
  function dessinerSprite(ctx, sprite, direction, pas, x, y, taille) {
    const r = Math.max(0, ORDRE.indexOf(direction));
    const k = imageDeMarche(sprite.images, pas);
    ctx.drawImage(sprite.img, k * sprite.largeur, r * sprite.hauteur, sprite.largeur, sprite.hauteur,
      x + Math.floor((taille - sprite.largeur) / 2), y + taille - sprite.hauteur, sprite.largeur, sprite.hauteur);
  }

  // Saga 1.12 (temps réel) : une animation d'un personnage (attaque, coup, mort, repos), une planche comme
  // le sprite (4 rangées, une par direction) avec `duree` millisecondes par image. temps : depuis son début
  // (secondes) ; boucle : recommencer à la fin (repos), sinon rester sur la dernière image.
  function dessinerAnimation(ctx, anim, direction, temps, x, y, taille, boucle = true) {
    const r = Math.max(0, ORDRE.indexOf(direction));
    const n = Math.floor((temps * 1000) / Math.max(16, anim.duree || 80));
    const k = boucle ? n % anim.images : Math.min(anim.images - 1, n);
    ctx.drawImage(anim.img, k * anim.largeur, r * anim.hauteur, anim.largeur, anim.hauteur,
      x + Math.floor((taille - anim.largeur) / 2), y + taille - anim.hauteur, anim.largeur, anim.hauteur);
  }

  // Saga 0.8 : une image d'un personnage, en data: URL, pour les menus et l'écran de combat en groupe
  // (le héros de côté, debout ou en marche). perso : { sprite, tuile, couleur } (un personnage de
  // personnages.json, ou une tenue) ; jeu : pour sa tuile. Rend '' si rien ne se dessine.
  const vignettes = new WeakMap();
  function vignette(jeu, perso, direction = 'bas', image = 0) {
    if (!perso) return '';
    let parPerso = vignettes.get(perso);
    if (!parPerso) { parPerso = new Map(); vignettes.set(perso, parPerso); }
    const cle = `${direction}/${image}`;
    if (parPerso.has(cle)) return parPerso.get(cle);
    const r = Math.max(0, ORDRE.indexOf(direction));
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d');
    if (perso.sprite?.img) {
      const s = perso.sprite, k = Math.min(Math.max(0, image), s.images - 1);
      cv.width = s.largeur;
      cv.height = s.hauteur;
      g.drawImage(s.img, k * s.largeur, r * s.hauteur, s.largeur, s.hauteur, 0, 0, s.largeur, s.hauteur);
    } else if (perso.tuile >= 0 && jeu?.tuiles?.[perso.tuile]) {
      const t = jeu.taille, im = jeu.tuiles[perso.tuile].images[0];
      cv.width = t;
      cv.height = t;
      g.drawImage(jeu.planche, im.sx, im.sy, t, t, 0, 0, t, t);
    } else {
      const s = base(perso.couleur, 16).sprite;
      cv.width = s.largeur;
      cv.height = s.hauteur;
      g.drawImage(s.img, Math.min(2, Math.max(0, image)) * s.largeur, r * s.hauteur, s.largeur, s.hauteur, 0, 0, s.largeur, s.hauteur);
    }
    const url = cv.toDataURL('image/png');
    parPerso.set(cle, url);
    return url;
  }

  return { dessiner, dessinerSprite, dessinerAnimation, imageDeMarche, ombre, vignette, base, animationBase };
})();
