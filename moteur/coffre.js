// Saga 1.38 : le coffre d'une campagne, sur le relais (relais/relais.js).
//
// À la fin d'une séance (et à la demande), Saga dépose pour chaque joueur une copie de ce qu'il a le droit de
// voir (sa fiche, ses documents, le journal), chiffrée avec SA clé (AES-256-GCM) : le relais garde des octets
// qu'il ne sait pas lire. Le téléphone du joueur a reçu la clé et l'adresse de la boîte en séance ; il relit la
// copie hors séance, et y laisse ses changements de fiche (chiffrés de même), que Saga relève à la séance suivante.
//
// Le format chiffré est celui de WebCrypto (le téléphone) : iv (12 octets) · texte chiffré · étiquette (16 octets).
//
//   chiffrer(cle, texte) → Buffer · dechiffrer(cle, octets) → texte
//   creer({ log }) → { deposer, relever, retirer, oublier }

const crypto = require('node:crypto');

const cleDe = (cle) => {
  const k = Buffer.from(String(cle || ''), 'base64url');
  if (k.length !== 32) throw new Error('clé de coffre invalide');
  return k;
};
function chiffrer(cle, texte) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cleDe(cle), iv);
  const corps = Buffer.concat([c.update(String(texte), 'utf8'), c.final()]);
  return Buffer.concat([iv, corps, c.getAuthTag()]);
}
function dechiffrer(cle, octets) {
  const b = Buffer.from(octets);
  if (b.length < 29) throw new Error('trop court');
  const d = crypto.createDecipheriv('aes-256-gcm', cleDe(cle), b.subarray(0, 12));
  d.setAuthTag(b.subarray(b.length - 16));
  return Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString('utf8');
}

function creer({ log = () => {} } = {}) {
  const adresse = (base, campagne, suite, extra = '') => `${base}/campagne/${encodeURIComponent(campagne.id)}${suite}?cs=${encodeURIComponent(campagne.secret)}${extra}`;
  const raison = async (r) => (await r.text().catch(() => '')).slice(0, 200) || `le relais répond ${r.status}`;

  // copies : [{ nom, boite, cle, json }] → { deposes: [noms], erreurs: [{ nom, erreur }], octets }
  async function deposer({ base, campagne, copies }) {
    const deposes = [], erreurs = [];
    let octets = 0;
    for (const x of copies || []) {
      try {
        const corps = chiffrer(x.cle, x.json);
        const r = await fetch(adresse(base, campagne, `/coffre/${encodeURIComponent(x.boite)}`), { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: corps });
        if (!r.ok) throw new Error(r.status === 404 ? 'le relais ne connaît pas cette campagne (mets-le à jour, puis rouvre la partie par le relais)' : await raison(r));
        deposes.push(x.nom);
        octets += corps.length;
      } catch (err) { erreurs.push({ nom: x.nom, erreur: err.message }); }
    }
    if (deposes.length) log('INFO', `Campagne : copies déposées pour ${deposes.join(', ')} (${Math.round(octets / 1024)} Ko)`);
    for (const e of erreurs) log('AVERTISSEMENT', `Campagne : copie de ${e.nom} non déposée (${e.erreur})`);
    return { deposes, erreurs, octets };
  }

  // Les changements proposés hors séance. boites : { boite: { nom, cle } } → [{ nom, changements: [{ id, valeur, t }] }]
  async function relever({ base, campagne, boites }) {
    const r = await fetch(adresse(base, campagne, '/propositions'));
    if (!r.ok) throw new Error(await raison(r));
    const parBoite = await r.json();
    const out = [], lues = [];
    for (const [boite, liste] of Object.entries(parBoite || {})) {
      const b = boites[boite];
      lues.push(boite);
      if (!b || !Array.isArray(liste)) continue;
      for (const texte of liste) {
        try {
          const p = JSON.parse(dechiffrer(b.cle, Buffer.from(String(texte), 'base64url')));
          const changements = (Array.isArray(p?.changements) ? p.changements : []).slice(0, 40)
            .map((c) => ({ id: String(c?.id || '').slice(0, 60), valeur: typeof c?.valeur === 'number' || typeof c?.valeur === 'boolean' ? c.valeur : String(c?.valeur ?? '').slice(0, 2000), t: Number(c?.t) || 0 }))
            .filter((c) => c.id);
          if (changements.length) out.push({ nom: b.nom, changements });
        } catch { log('AVERTISSEMENT', `Campagne : une proposition illisible pour ${b.nom} (ignorée)`); }
      }
    }
    if (lues.length) await fetch(adresse(base, campagne, '/propositions', `&boites=${lues.map(encodeURIComponent).join(',')}`), { method: 'DELETE' }).catch(() => {});
    return out;
  }

  const retirer = ({ base, campagne, boite }) => fetch(adresse(base, campagne, `/coffre/${encodeURIComponent(boite)}`), { method: 'DELETE' }).then((r) => r.ok).catch(() => false);
  const oublier = ({ base, campagne }) => fetch(adresse(base, campagne, ''), { method: 'DELETE' }).then((r) => r.ok).catch(() => false);
  return { deposer, relever, retirer, oublier };
}

module.exports = { creer, chiffrer, dechiffrer };
