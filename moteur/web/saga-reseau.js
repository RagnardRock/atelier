// Le pont de Saga dans le navigateur d'un ami (le multijoueur, Saga 1.0) : il remplace preload.js.
//
// L'ami ouvre l'adresse de l'hôte (http://192.168.x.x:7777) : le serveur (moteur/reseau.js) lui sert
// l'interface de Saga avec ce fichier. Ici, on :
//   - demande le code de la partie et son prénom, puis on garde le jeton (localStorage : recharger la
//     page ne refait pas tout) ;
//   - lit le jeu depuis l'hôte (GET /jeu) ;
//   - écoute le flux de l'hôte (GET /flux) : sa vue de la table, le chat, qui est là, les positions des
//     autres joueurs, les messages d'un autre joueur (échanges, duels) ;
//   - renvoie ses demandes (POST /action).
// Les réglages et la sauvegarde restent dans SON navigateur (localStorage). Rien n'est écrit chez l'hôte.

(() => {
  const R = window.SAGA_RESEAU || { mode: 'monde', titre: 'Saga', version: '', config: {} };
  const cle = `saga-reseau:${location.host}`;
  const lire = (k) => { try { return JSON.parse(localStorage.getItem(`${cle}:${k}`)); } catch { return null; } };
  const ecrire = (k, v) => { try { localStorage.setItem(`${cle}:${k}`, JSON.stringify(v)); } catch { /* navigation privée */ } };
  const rien = () => {};
  let jeton = lire('jeton') || '';
  let moi = lire('moi') || null;
  const ecoutes = { vue: [], chat: [], joueurs: [], monde: [], pair: [], fin: [], jeu: [] };
  const sur = (sorte, f) => ecoutes[sorte].push(f);
  const dire = (sorte, x) => { for (const f of ecoutes[sorte] || []) f(x); };

  async function envoyer(chemin, corps) {
    const r = await fetch(chemin, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(jeton ? { 'X-Jeton': jeton } : {}) },
      body: JSON.stringify(corps || {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.erreur || `erreur ${r.status}`), { statut: r.status });
    return d;
  }
  async function demander(chemin) {
    const r = await fetch(chemin, { headers: jeton ? { 'X-Jeton': jeton } : {} });
    if (!r.ok) throw new Error(`erreur ${r.status}`);
    return r;
  }

  // Sur Internet (Saga 1.1), l'hôte accepte chaque nouveau joueur : on redemande jusqu'à sa réponse.
  async function attendreAccord(jetonAttente) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const d = await envoyer('/rejoindre', { jeton: jetonAttente });
        if (!d.attente) return d;
      } catch (e) {
        // Le réseau qui hoquette ou trop de demandes à la fois : on patiente. Un refus : on arrête.
        if (e.statut && e.statut !== 429) throw e;
      }
    }
  }

  // --- L'écran d'entrée : le code et le prénom ---
  function entrer() {
    return new Promise((resoudre) => {
      const boite = document.createElement('div');
      boite.className = 'reseau-entree';
      boite.innerHTML = `
        <form class="reseau-carte" autocomplete="off">
          <div class="reseau-rune">ᛃ</div>
          <h1></h1>
          <p class="reseau-note">Entre le code que l'hôte t'a donné.</p>
          <label>Code de la partie<input name="code" maxlength="12" required spellcheck="false" style="text-transform:uppercase"></label>
          <label>Ton prénom<input name="nom" maxlength="24" required></label>
          <p class="reseau-erreur" hidden></p>
          <button type="submit">Rejoindre</button>
        </form>`;
      boite.querySelector('h1').textContent = R.titre || 'Partie en réseau';
      const form = boite.querySelector('form');
      const err = boite.querySelector('.reseau-erreur');
      const bouton = boite.querySelector('button');
      const nomAvant = lire('nom');
      if (nomAvant) form.nom.value = nomAvant;
      document.body.append(boite);
      form.code.focus();
      form.onsubmit = async (e) => {
        e.preventDefault();
        bouton.disabled = true;
        err.hidden = true;
        try {
          let d = await envoyer('/rejoindre', { code: form.code.value.trim().toUpperCase(), nom: form.nom.value.trim() });
          if (d.attente) {
            for (const i of form.querySelectorAll('input')) i.disabled = true;
            bouton.textContent = 'L\'hôte doit t\'accepter…';
            try { d = await attendreAccord(d.jeton); } finally {
              for (const i of form.querySelectorAll('input')) i.disabled = false;
              bouton.textContent = 'Rejoindre';
            }
          }
          jeton = d.jeton;
          moi = { id: d.id, nom: d.nom };
          ecrire('jeton', jeton);
          ecrire('moi', moi);
          ecrire('nom', d.nom);
          boite.remove();
          resoudre();
        } catch (e2) {
          err.textContent = e2.message;
          err.hidden = false;
          bouton.disabled = false;
        }
      };
    });
  }

  // Revenir avec le jeton gardé (la page rechargée) : si l'hôte ne le connaît plus, on redemande le code.
  async function prete() {
    if (jeton) {
      try {
        const d = await envoyer('/rejoindre', { jeton });
        moi = { id: d.id, nom: d.nom };
        ecrire('moi', moi);
        return;
      } catch { jeton = ''; ecrire('jeton', ''); }
    }
    await entrer();
  }

  // --- Le flux de l'hôte ---
  let flux = null;
  function ecouter() {
    flux?.close();
    flux = new EventSource(`/flux?jeton=${encodeURIComponent(jeton)}`);
    for (const sorte of ['vue', 'chat', 'joueurs', 'monde', 'pair', 'jeu']) {
      flux.addEventListener(sorte, (e) => { try { dire(sorte, JSON.parse(e.data)); } catch { /* message abîmé */ } });
    }
    flux.addEventListener('bienvenue', (e) => { try { dire('joueurs', JSON.parse(e.data).joueurs || []); } catch { /* rien */ } });
    flux.addEventListener('fin', (e) => {
      let d = {};
      try { d = JSON.parse(e.data); } catch { /* rien */ }
      flux.close();
      if (d.raison === 'expulse') { jeton = ''; ecrire('jeton', ''); }
      dire('fin', d);
    });
  }

  // --- window.saga, comme dans Saga ---
  window.saga = {
    platform: 'web',
    // Un ami est toujours en « mode joueur » : pas d'ouvrir-un-autre-jeu, pas de mise à jour.
    joueur: { titre: R.titre || 'Partie en réseau', web: true, reseau: true },
    // Le multijoueur, côté ami.
    reseau: {
      mode: R.mode,
      get moi() { return moi; },
      sur,
      prete,
      ecouter,
      dire: (texte, pour = 'tous') => envoyer('/action', { type: 'chat', texte, pour }).catch(rien),
      position: (p) => envoyer('/action', { type: 'position', ...p }).catch(rien),
      pair: (vers, donnees) => envoyer('/action', { type: 'pair', vers, donnees }).catch(rien),
      // Une demande à l'hôte (le mode table : déplacer son pion, parler, lancer un jet…).
      demander: (a) => envoyer('/action', a).catch(rien),
    },
    choisirJeu: async () => null,
    ouvrirJeu: async () => (await demander('/jeu')).json(),
    jeuxRecents: async () => [],
    montrerJeu: async () => {},
    // La sauvegarde de l'ami, dans son navigateur (l'hôte ne garde rien de lui).
    lireSauvegarde: async (_dossier, place = '') => lire(place === 'auto' ? 'sauvegarde-auto' : 'sauvegarde'),
    ecrireSauvegarde: async (_dossier, donnees, place = '') => {
      try { ecrire(place === 'auto' ? 'sauvegarde-auto' : 'sauvegarde', donnees); } catch { throw new Error('le navigateur refuse de garder la sauvegarde'); }
    },
    lireSon: async (chemin) => {
      const r = await demander(`/son?chemin=${encodeURIComponent(chemin)}`);
      return new Uint8Array(await r.arrayBuffer());
    },
    onJeuExterne: rien,
    demarrage: async () => ({ dossier: 'reseau', depart: null }),
    pleinEcran: async (oui) => {
      const veut = oui === undefined ? !document.fullscreenElement : Boolean(oui);
      if (veut && !document.fullscreenElement) await document.documentElement.requestFullscreen?.().catch(rien);
      else if (!veut && document.fullscreenElement) await document.exitFullscreen().catch(rien);
      return Boolean(document.fullscreenElement);
    },
    onPleinEcran: (callback) => document.addEventListener('fullscreenchange', () => callback(Boolean(document.fullscreenElement))),
    onError: rien,
    readConfig: async () => ({ config: { ...R.config, ...(lire('reglages') || {}) }, path: '' }),
    writeConfig: async (changes) => {
      const config = { ...R.config, ...(lire('reglages') || {}), ...changes };
      ecrire('reglages', config);
      return config;
    },
    version: async () => R.version,
    checkUpdate: async () => ({ mode: 'web', changes: [] }),
    installUpdate: async () => {},
    onUpdateProgress: rien,
    // Le mode table : chez un ami, l'hôte n'est pas une autre fenêtre mais le réseau.
    tableOuvrir: async () => false,
    tableFermer: async () => false,
    tableEnvoyer: rien,
    onTableVue: (callback) => sur('vue', (v) => callback(JSON.stringify(v))),
    tableDemander: (a) => envoyer('/action', a).catch(rien),
    onTableAction: rien,
    listeSons: async () => [],
  };
})();
