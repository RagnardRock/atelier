// Saga 1.33 : passer par un relais (relais/relais.js, posé sur un serveur) au lieu d'ouvrir un port de la box.
//
// Saga ouvre une salle sur le relais et reçoit, par un flux, les requêtes de ses amis. Chacune est
// rejouée ici sur le petit serveur de la partie (reseau.js, sur 127.0.0.1), et sa réponse repart au
// relais par morceaux. Le serveur de la partie ne change pas : il sait seulement, par un en-tête secret,
// qu'une requête vient du relais (l'adresse de l'ami, et le préfixe /p/<salle> des liens).
//
//   creer({ log }) → { ouvrir({ adresse, cle, port, secretLocal }) → Promise<{ lien }>, fermer(), ouverte }
// Aucune adresse de relais n'est écrite ici : elle vient des réglages de Saga.

const http = require('node:http');

function creer({ log = () => {}, perdu = () => {}, lienChange = () => {} } = {}) {
  let session = null; // { base, cle, port, secretLocal, salle, secret, controle, envois, minuterie, actives, arret }

  const nettoyer = (a) => String(a || '').trim().replace(/\/+$/, '');
  function normaliser(adresse) {
    let a = nettoyer(adresse);
    if (!a) throw new Error('Donne l\'adresse du relais (Réglages du multijoueur).');
    if (!/^https?:\/\//i.test(a)) a = `https://${a}`;
    const u = new URL(a);
    if (u.protocol !== 'https:' && !/^(localhost|127\.|\[::1\])/.test(u.hostname)) throw new Error('Le relais doit être en https:// (sauf en local).');
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  }

  // Les réponses partent groupées (au plus toutes les 40 ms) : moins de requêtes vers le relais.
  function pousser(m) {
    const s = session;
    if (!s) return;
    s.envois.push(m);
    if (!s.minuterie) s.minuterie = setTimeout(vider, 40);
  }
  async function vider() {
    const s = session;
    if (!s) return;
    s.minuterie = null;
    const lot = s.envois.splice(0);
    if (!lot.length || !s.salle) return;
    try {
      const r = await fetch(`${s.base}/hote/reponse?salle=${encodeURIComponent(s.salle)}&secret=${encodeURIComponent(s.secret)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lot),
      });
      if (!r.ok) log('AVERTISSEMENT', `Relais : réponse refusée (${r.status})`);
    } catch (err) { log('AVERTISSEMENT', `Relais : ${err.message}`); }
  }

  // Une requête d'un ami : rejouée sur le serveur de la partie.
  function rejouer(q) {
    const s = session;
    if (!s || typeof q?.rid !== 'string' || !/^\/[^\s]*$/.test(String(q.chemin || ''))) return;
    const corps = q.corps ? Buffer.from(q.corps, 'base64') : null;
    const entetes = { ...(q.entetes || {}), 'x-relais': s.secretLocal, 'x-relais-ip': String(q.ip || '').slice(0, 64), 'x-relais-racine': `/p/${s.salle}` };
    if (corps) entetes['content-length'] = String(corps.length);
    const req = http.request({ host: '127.0.0.1', port: s.port, method: q.methode === 'POST' ? 'POST' : 'GET', path: q.chemin, headers: entetes }, (res) => {
      const entetes = {};
      for (const k of ['content-type', 'cache-control', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'x-accel-buffering']) if (res.headers[k]) entetes[k] = res.headers[k];
      pousser({ rid: q.rid, statut: res.statusCode, entetes });
      res.on('data', (b) => pousser({ rid: q.rid, morceau: b.toString('base64') }));
      res.on('end', () => { s.actives.delete(q.rid); pousser({ rid: q.rid, fin: true }); });
      res.on('error', () => { s.actives.delete(q.rid); pousser({ rid: q.rid, fin: true }); });
    });
    req.on('error', () => { s.actives.delete(q.rid); pousser({ rid: q.rid, statut: 502, fin: true }); });
    s.actives.set(q.rid, req);
    req.end(corps || undefined);
  }

  // Le flux du relais (server-sent events), lu à la main.
  async function ecouter(s, premier) {
    // Saga 1.38 : une campagne revient toujours dans SA salle (le même lien à chaque séance).
    const camp = s.campagne ? `&campagne=${encodeURIComponent(s.campagne.id)}&cs=${encodeURIComponent(s.campagne.secret)}` : '';
    const url = `${s.base}/hote/ouvrir?cle=${encodeURIComponent(s.cle)}${camp}${s.salle ? `&salle=${encodeURIComponent(s.salle)}&secret=${encodeURIComponent(s.secret)}` : ''}`;
    s.controle = new AbortController();
    const r = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: s.controle.signal });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (s.campagne && /campagne/i.test(t)) throw new Error(t);
      throw new Error(r.status === 403 ? 'Le relais refuse la clé (Réglages du multijoueur).' : r.status === 503 ? 'Le relais est plein.' : `Le relais répond ${r.status}.`);
    }
    const lecteur = r.body.getReader();
    const dec = new TextDecoder();
    let tampon = '';
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      tampon += dec.decode(value, { stream: true });
      let i;
      while ((i = tampon.indexOf('\n\n')) >= 0) {
        const bloc = tampon.slice(0, i);
        tampon = tampon.slice(i + 2);
        let sorte = 'message', data = '';
        for (const l of bloc.split('\n')) {
          if (l.startsWith('event: ')) sorte = l.slice(7);
          else if (l.startsWith('data: ')) data += l.slice(6);
        }
        if (!data) continue;
        let d;
        try { d = JSON.parse(data); } catch { continue; }
        if (sorte === 'salle') {
          // Revenu trop tard : le relais a donné une nouvelle salle, donc un nouveau lien.
          const change = s.salle && s.salle !== d.salle;
          s.salle = d.salle; s.secret = d.secret;
          if (change) lienChange(`${s.base}/p/${s.salle}/`);
          premier?.(); premier = null;
        }
        else if (sorte === 'requete') rejouer(d);
        else if (sorte === 'annuler') { s.actives.get(d.rid)?.destroy(); s.actives.delete(d.rid); }
      }
    }
  }
  // Tenir le fil : après une coupure, on revient dans la même salle (le relais la garde 90 s).
  async function tenir(s, premier, echec) {
    let attente = 1000;
    while (session === s && !s.arret) {
      try {
        await ecouter(s, premier);
        attente = 1000;
      } catch (err) {
        if (s.arret) return;
        if (!s.salle) { echec(err); return; }
        log('AVERTISSEMENT', `Relais : fil perdu (${err.message}), on revient…`);
      }
      premier = null;
      if (session !== s || s.arret) return;
      await new Promise((r) => setTimeout(r, attente));
      attente = Math.min(15000, attente * 2);
      if (attente >= 15000 && !s.prevenu) { s.prevenu = true; perdu(); }
    }
  }

  function ouvrir({ adresse, cle = '', port, secretLocal, campagne = null }) {
    fermer();
    const base = normaliser(adresse);
    const camp = campagne && /^[A-Za-z0-9_-]{16,32}$/.test(String(campagne.id || '')) && String(campagne.secret || '').length >= 20 ? { id: campagne.id, secret: campagne.secret } : null;
    const s = { base, cle: String(cle || ''), port, secretLocal, campagne: camp, salle: '', secret: '', controle: null, envois: [], minuterie: null, actives: new Map(), arret: false };
    session = s;
    return new Promise((resoudre, rejeter) => {
      const delai = setTimeout(() => { if (!s.salle) { fermer(); rejeter(new Error('Le relais ne répond pas.')); } }, 12000);
      tenir(s, () => { clearTimeout(delai); log('INFO', `Relais : salle ${s.salle} ouverte sur ${base}`); resoudre({ lien: `${base}/p/${s.salle}/`, fixe: Boolean(s.campagne) && s.salle === s.campagne.id }); },
        (err) => { clearTimeout(delai); if (session === s) session = null; rejeter(err); });
    });
  }
  function fermer() {
    const s = session;
    if (!s) return;
    s.arret = true;
    session = null;
    clearTimeout(s.minuterie);
    s.controle?.abort();
    for (const r of s.actives.values()) r.destroy();
  }
  return { ouvrir, fermer, normaliser, get ouverte() { return Boolean(session?.salle); }, get base() { return session?.base || ''; } };
}

module.exports = { creer };
