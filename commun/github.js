// Les Releases de l'Atelier sur GitHub, sans se faire bloquer.
//
// Le problème : sans compte connecté, l'« API » de GitHub (api.github.com) n'accepte que 60 demandes
// par heure et par PC, pour tous les outils réunis. Au-delà, elle répond « 403 » jusqu'à l'heure
// suivante. Atelier qui relit GitHub toutes les 30 secondes pendant une fabrication, plus Skald,
// Tafl et Brokk qui vérifient leurs mises à jour au démarrage, suffisaient à épuiser ces 60.
//
// La solution, en trois parties :
// 1. Le « flux » des Releases (github.com/<dépôt>/releases.atom), la page que lisent les lecteurs de
//    flux RSS. Il n'est PAS compté dans les 60 et donne les 10 dernières Releases : on le lit en premier.
// 2. L'API ne sert plus qu'à compléter (les Releases plus anciennes que les 10 du flux) : au plus une
//    fois par demi-heure, et sa réponse est gardée sur le disque (elle survit à la fermeture de l'outil).
// 3. Si GitHub répond quand même « limite atteinte », on note l'heure où elle se lève et on ne
//    redemande plus rien à l'API avant ; le message d'erreur dit à quelle heure réessayer.
//
// Fichier partagé : la seule vraie version est commun/github.js, recopiée dans chaque outil par copier.js.

const fs = require('node:fs/promises');
const path = require('node:path');

const DEPOT = 'RagnardRock/atelier';
const API_MAX_AGE = 30 * 60_000; // on relit la liste complète (API) au plus une fois par demi-heure

class LimiteGithub extends Error {}

// [0, 16, 0] plus récente que [0, 15, 2] ?
function plusRecente(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// « 00:42 » : l'heure (locale) où GitHub acceptera de nouveau des demandes.
const heure = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const messageLimite = (jusqua) => `GitHub limite les vérifications à 60 par heure pour ce PC, et elles sont épuisées. Réessaie après ${heure(jusqua)}`;

// Les entités XML/HTML les plus courantes (&amp; &lt; &#39;…).
function decoder(texte) {
  return texte
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Le texte d'une Release dans le flux est du HTML (<ul><li>…</li></ul>) : on en refait des lignes
// « - … », comme le texte que donne l'API, pour que le reste du code n'y voie aucune différence.
function htmlEnTexte(html) {
  const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  const lignes = items.length ? items.map((i) => `- ${i}`) : html.split(/<br\s*\/?>|<\/p>|\n/);
  return lignes.map((l) => decoder(l.replace(/<[^>]+>/g, '')).trim()).filter(Boolean).join('\n');
}

// Lit le flux Atom : une entrée par Release, de la plus récente à la plus ancienne.
function lireFlux(xml) {
  const releases = [];
  for (const [, entree] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const lien = entree.match(/<link[^>]*href="([^"]+)"/)?.[1] || '';
    // L'étiquette est au bout du lien (…/releases/tag/tafl-v0.8.0), et aussi au bout de l'<id>.
    const id = entree.match(/<id>([^<]+)<\/id>/)?.[1] || '';
    const tag = decodeURIComponent(lien.split('/releases/tag/')[1] || id.split('/').pop() || '');
    if (!tag) continue;
    const contenu = entree.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || '';
    // Le HTML de la Release est lui-même échappé dans le XML : on décode une fois pour retrouver le HTML.
    releases.push({ tag_name: tag, body: htmlEnTexte(decoder(contenu)), draft: false, prerelease: false, assets: null });
  }
  return releases;
}

// net : le module net d'Electron. dossier : où garder la liste sur le disque (app.getPath('userData')).
// agent : le nom de l'outil, envoyé à GitHub (il exige un « User-Agent »).
// api / site : seulement pour les tests (un faux GitHub sur le PC).
function creerGithub({ net, dossier, agent, api = `https://api.github.com/repos/${DEPOT}`, site = `https://github.com/${DEPOT}` }) {
  const fichier = path.join(dossier, 'github-releases.json');
  let memoire = null; // { at, list, limiteJusqua }

  async function etat() {
    if (!memoire) {
      try { memoire = JSON.parse(await fs.readFile(fichier, 'utf8')); } catch { memoire = {}; }
    }
    return memoire;
  }
  async function enregistrer() {
    await fs.mkdir(dossier, { recursive: true }).catch(() => {});
    await fs.writeFile(fichier, JSON.stringify(memoire)).catch(() => {});
  }

  // Une demande à l'API, en respectant la limite. Lève LimiteGithub tant qu'elle n'est pas levée.
  async function demanderApi(url, accept = 'application/vnd.github+json') {
    const e = await etat();
    if (e.limiteJusqua && Date.now() < e.limiteJusqua) throw new LimiteGithub(messageLimite(e.limiteJusqua));
    // cache: 'no-store' : sans ça, Electron peut resservir une réponse d'il y a une minute.
    const res = await net.fetch(url.startsWith('http') ? url : `${api}${url}`, { cache: 'no-store', headers: { Accept: accept, 'User-Agent': agent } });
    // 403 avec « il te reste 0 demande », ou 429 (trop de demandes) : la limite est atteinte.
    if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const attente = Number(res.headers.get('retry-after')) * 1000;
      e.limiteJusqua = reset > Date.now() ? reset : Date.now() + (attente || 60 * 60_000);
      await enregistrer();
      throw new LimiteGithub(messageLimite(e.limiteJusqua));
    }
    if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
    return res;
  }

  async function flux() {
    const res = await net.fetch(`${site}/releases.atom`, { cache: 'no-store', headers: { Accept: 'application/atom+xml', 'User-Agent': agent } });
    if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
    return lireFlux(await res.text());
  }

  // Toutes les Releases publiées (ni brouillons ni préversions), les plus récentes en tête.
  // Celles qui viennent du flux ont assets: null : utiliser urlFichier() pour leurs fichiers.
  async function releases() {
    const e = await etat();
    const [depuisFlux, depuisApi] = await Promise.allSettled([
      flux(),
      !e.list || Date.now() - (e.at || 0) > API_MAX_AGE
        ? demanderApi('/releases?per_page=100').then((r) => r.json()).then(async (list) => {
          e.list = list.filter((r) => !r.draft && !r.prerelease);
          e.at = Date.now();
          await enregistrer();
        })
        : null,
    ]);
    if (depuisFlux.status === 'rejected' && !e.list) {
      // Rien du tout : ni flux, ni liste gardée. On explique la vraie raison (limite ou réseau).
      throw depuisApi.status === 'rejected' ? depuisApi.reason : depuisFlux.reason;
    }
    // On réunit les deux : le flux pour les toutes dernières, la liste gardée pour les plus anciennes.
    const parTag = new Map();
    for (const r of depuisFlux.value || []) parTag.set(r.tag_name, r);
    for (const r of e.list || []) parTag.set(r.tag_name, r); // l'API a plus de détails (fichiers) : elle gagne
    // La liste gardée peut dater d'une demi-heure, et le flux ne montre pas forcément les toutes
    // dernières Releases de chaque outil (voir suivantes()) : on va voir si la suivante existe.
    for (const r of await suivantes([...parTag.keys()])) if (!parTag.has(r.tag_name)) parTag.set(r.tag_name, r);
    return [...parTag.values()];
  }

  // Le flux ne donne que 10 Releases, et GitHub les trie par jour puis par nom d'étiquette, à
  // l'envers (tafl, skald, saga, rune… avant atelier, brokk). Un jour où plusieurs outils sortent
  // une version, celles d'Atelier, Brokk, Edda ou Mímir n'y figurent donc pas : elles n'arrivaient
  // qu'avec la liste de l'API, jusqu'à une demi-heure plus tard (bien plus si la limite est atteinte).
  // Pour chaque outil, on demande donc à github.com (pas à l'API : pas compté dans la limite) si la
  // page de la version suivante existe (0.15.0 → 0.15.1, 0.16.0 ou 1.0.0), et on recommence depuis
  // celle qu'on trouve (0.15 → 0.16 → 0.17). Ces Releases-là ont des notes vides et assets: null.
  async function existe(tag) {
    const res = await net.fetch(`${site}/releases/tag/${encodeURIComponent(tag)}`, { method: 'HEAD', cache: 'no-store', headers: { 'User-Agent': agent } }).catch(() => null);
    return Boolean(res?.ok);
  }
  async function suivantes(tags) {
    const dernieres = new Map(); // préfixe (« atelier-v ») → [majeur, mineur, correctif]
    for (const tag of tags) {
      const m = tag.match(/^(.+-v)(\d+)\.(\d+)\.(\d+)$/);
      if (!m) continue;
      const v = m.slice(2).map(Number);
      const avant = dernieres.get(m[1]);
      if (!avant || plusRecente(v, avant)) dernieres.set(m[1], v);
    }
    const trouvees = [];
    await Promise.all([...dernieres].map(async ([prefixe, v]) => {
      for (let essais = 0; essais < 10; essais++) { // 10 : garde-fou, jamais atteint en pratique
        const [a, b, c] = v;
        const candidates = [[a, b, c + 1], [a, b + 1, 0], [a + 1, 0, 0]];
        const ok = await Promise.all(candidates.map((x) => existe(`${prefixe}${x.join('.')}`)));
        // La plus haute qui existe (0.16.0 plutôt que 0.15.1 si les deux sont sorties).
        const i = ok.lastIndexOf(true);
        if (i < 0) return;
        v = candidates[i];
        trouvees.push({ tag_name: `${prefixe}${v.join('.')}`, body: '', draft: false, prerelease: false, assets: null });
      }
    }));
    return trouvees;
  }

  // L'adresse de téléchargement d'un fichier d'une Release (pas comptée dans la limite de l'API).
  const urlFichier = (tag, nom) => `${site}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(nom)}`;

  // Encore bloqué par la limite ? (null sinon) : pour ne pas tenter une demande vouée à l'échec.
  const limiteJusqua = async () => {
    const e = await etat();
    return e.limiteJusqua && Date.now() < e.limiteJusqua ? e.limiteJusqua : null;
  };

  return { releases, demanderApi, urlFichier, limiteJusqua };
}

module.exports = { creerGithub, LimiteGithub, lireFlux };
