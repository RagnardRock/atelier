// Ouvrir la partie sur Internet (Saga 1.1) : demander à la box d'envoyer un port vers ce PC.
//
// La box (le routeur de la maison) bloque ce qui vient d'Internet. Pour que des amis éloignés
// rejoignent la partie, on lui demande par UPnP (le protocole « IGD » que presque toutes les box
// comprennent, s'il est activé) de faire suivre UN port TCP vers le serveur de reseau.js :
//   1. on cherche la box sur le réseau (SSDP : un message en multidiffusion, la box répond) ;
//   2. on lit sa description (XML) pour trouver le service « WANIPConnection » ou « WANPPPConnection » ;
//   3. on lui demande son adresse publique, puis la redirection (AddPortMapping), pour une heure,
//      renouvelée tant que la partie est ouverte : si Saga plante, la box l'oublie toute seule ;
//   4. à la fermeture de la partie ou de Saga, on la retire (DeletePortMapping).
// Si la box refuse (UPnP éteint) ou si elle est elle-même derrière l'opérateur (CGNAT), on le dit et
// Saga explique comment faire à la main. Ce fichier ne sait rien du jeu : il ne fait qu'ouvrir et fermer.

const dgram = require('node:dgram');
const http = require('node:http');

const SSDP = { adresse: '239.255.255.250', port: 1900 };
const RECHERCHES = [
  'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
  'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
  'urn:schemas-upnp-org:service:WANIPConnection:1',
  'urn:schemas-upnp-org:service:WANPPPConnection:1',
];
const BAIL = 3600;              // la box oublie la redirection après une heure…
const RENOUVELER = 25 * 60e3;   // …on la renouvelle bien avant
const DESCRIPTION = 'Saga (partie en ligne)';

// Les adresses qui ne sont pas sur Internet : la maison, et l'espace partagé des opérateurs (CGNAT).
function adressePrivee(ip) {
  const p = String(ip || '').split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}

// 1. Trouver la box : on demande, on écoute les réponses quelques secondes.
function chercherBoxes(delai = 2500) {
  return new Promise((resoudre) => {
    const lieux = new Set();
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const finir = () => { try { s.close(); } catch { /* déjà fermé */ } resoudre([...lieux]); };
    s.on('error', finir);
    s.on('message', (m) => {
      const l = /^location:\s*(\S+)/im.exec(m.toString('utf8'));
      if (l && /^http:\/\//i.test(l[1])) lieux.add(l[1]);
    });
    s.bind(0, () => {
      for (const st of RECHERCHES) {
        const msg = Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP.adresse}:${SSDP.port}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`);
        s.send(msg, SSDP.port, SSDP.adresse, () => {});
      }
    });
    setTimeout(finir, delai);
  });
}

// Une requête HTTP vers la box (seulement le réseau local, réponses courtes).
function requete(url, { methode = 'GET', entetes = {}, corps = null, delai = 5000 } = {}) {
  return new Promise((resoudre, rejeter) => {
    const req = http.request(url, { method: methode, headers: entetes, timeout: delai }, (res) => {
      const morceaux = [];
      let n = 0;
      res.on('data', (b) => { n += b.length; if (n > 512 * 1024) req.destroy(new Error('réponse trop longue')); else morceaux.push(b); });
      res.on('end', () => resoudre({ statut: res.statusCode, texte: Buffer.concat(morceaux).toString('utf8'), ipLocale: req.socket?.localAddress || '' }));
    });
    req.on('timeout', () => req.destroy(new Error('la box ne répond pas')));
    req.on('error', rejeter);
    if (corps) req.write(corps);
    req.end();
  });
}

const balise = (xml, nom) => {
  const m = new RegExp(`<(?:[\\w-]+:)?${nom}>([\\s\\S]*?)</(?:[\\w-]+:)?${nom}>`, 'i').exec(xml);
  return m ? m[1].trim() : '';
};

// 2. La description de la box : où envoyer les ordres.
async function lireBox(lieu) {
  const r = await requete(lieu);
  if (r.statut !== 200) throw new Error(`description illisible (${r.statut})`);
  const base = balise(r.texte, 'URLBase') || lieu;
  const services = r.texte.match(/<(?:[\w-]+:)?service>[\s\S]*?<\/(?:[\w-]+:)?service>/gi) || [];
  for (const s of services) {
    const type = balise(s, 'serviceType');
    if (!/:(WANIPConnection|WANPPPConnection):\d/.test(type)) continue;
    const controle = balise(s, 'controlURL');
    if (!controle) continue;
    return { type, controle: new URL(controle, base).href, ipLocale: r.ipLocale, routeur: new URL(lieu).hostname };
  }
  throw new Error('pas de service de redirection dans cette box');
}

// Un ordre SOAP à la box. Une erreur UPnP garde son numéro (718 : port déjà pris, 725 : bail refusé).
async function ordre(box, action, args = {}) {
  const xmlArgs = Object.entries(args).map(([k, v]) => `<${k}>${String(v).replace(/[<>&]/g, '')}</${k}>`).join('');
  const corps = `<?xml version="1.0"?>\r\n<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${box.type}">${xmlArgs}</u:${action}></s:Body></s:Envelope>`;
  const r = await requete(box.controle, {
    methode: 'POST',
    corps,
    entetes: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${box.type}#${action}"`, 'Content-Length': Buffer.byteLength(corps) },
  });
  if (r.statut === 200) return r.texte;
  const err = new Error(balise(r.texte, 'errorDescription') || `la box refuse (${r.statut})`);
  err.upnp = Number(balise(r.texte, 'errorCode')) || 0;
  throw err;
}

// L'adresse publique vue d'Internet (pour vérifier la box, et pour la redirection faite à la main).
async function adresseVueDehors() {
  for (const url of ['https://api.ipify.org', 'https://ipv4.icanhazip.com']) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const ip = (await r.text()).trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
    } catch { /* on essaie le suivant */ }
  }
  return '';
}

function creer({ log = () => {}, chercher = chercherBoxes, dehors = adresseVueDehors } = {}) {
  let ouverte = null;   // { box, portExterne, portInterne, ipLocale, bail }
  let minuteur = null;

  async function rediriger(box, portExterne, portInterne, ipLocale, bail) {
    await ordre(box, 'AddPortMapping', {
      NewRemoteHost: '', NewExternalPort: portExterne, NewProtocol: 'TCP', NewInternalPort: portInterne,
      NewInternalClient: ipLocale, NewEnabled: 1, NewPortMappingDescription: DESCRIPTION, NewLeaseDuration: bail,
    });
  }

  // Ouvrir : → { ok: true, adresse, port, routeur } ou { ok: false, raison, cgnat, adresse, port, ipLocale, routeur }.
  async function ouvrir(portInterne, { lieux = null } = {}) {
    await fermer();
    const echec = async (raison, plus = {}) => ({ ok: false, raison, port: portInterne, adresse: await dehors().catch(() => ''), ...plus });
    const trouves = lieux || await chercher();
    if (!trouves.length) return echec('La box n\'a pas répondu : UPnP est sans doute désactivé dans ses réglages.');
    let box = null, derniere = '';
    for (const l of trouves) {
      try { box = await lireBox(l); break; } catch (err) { derniere = err.message; }
    }
    if (!box) return echec(`Box trouvée, mais illisible (${derniere}).`);
    const infos = { routeur: box.routeur, ipLocale: box.ipLocale };

    let ipBox = '';
    try { ipBox = balise(await ordre(box, 'GetExternalIPAddress'), 'NewExternalIPAddress'); } catch { /* certaines box ne le disent pas */ }
    if (ipBox && adressePrivee(ipBox)) {
      return echec(`Ta box n'a pas d'adresse publique à elle (${ipBox}) : elle est derrière ton opérateur (CGNAT) ou derrière une autre box.`, { cgnat: true, ...infos });
    }

    // Le port peut déjà servir à un autre appareil de la maison : on essaie les suivants.
    let bail = BAIL;
    for (let portExterne = portInterne; portExterne < portInterne + 10; portExterne++) {
      try {
        try { await rediriger(box, portExterne, portInterne, box.ipLocale, bail); } catch (err) {
          if (err.upnp !== 725) throw err;
          bail = 0; // la box n'accepte que des redirections sans fin : on la retirera nous-mêmes
          await rediriger(box, portExterne, portInterne, box.ipLocale, bail);
        }
        ouverte = { box, portExterne, portInterne, ipLocale: box.ipLocale, bail };
        if (bail) minuteur = setInterval(() => rediriger(box, portExterne, portInterne, box.ipLocale, bail).catch((e) => log('ATTENTION', `Internet : renouvellement refusé (${e.message})`)), RENOUVELER);
        const adresse = ipBox || await dehors().catch(() => '');
        log('INFO', `Internet : port ${portExterne} ouvert sur la box vers ${box.ipLocale}:${portInterne}`);
        return { ok: true, adresse, port: portExterne, ...infos };
      } catch (err) {
        if (err.upnp === 718) continue;
        return echec(`La box a refusé d'ouvrir le port (${err.message}).`, infos);
      }
    }
    return echec('Les ports sont déjà pris sur la box par un autre appareil.', infos);
  }

  // Fermer : la box oublie la redirection. Jamais d'erreur (on ferme aussi en quittant Saga).
  async function fermer() {
    clearInterval(minuteur);
    minuteur = null;
    if (!ouverte) return;
    const o = ouverte;
    ouverte = null;
    try {
      await ordre(o.box, 'DeletePortMapping', { NewRemoteHost: '', NewExternalPort: o.portExterne, NewProtocol: 'TCP' });
      log('INFO', `Internet : port ${o.portExterne} refermé sur la box`);
    } catch (err) { log('ATTENTION', `Internet : la box n'a pas refermé le port (${err.message})`); }
  }

  return { ouvrir, fermer, get ouverte() { return Boolean(ouverte); }, adresseVueDehors: dehors };
}

module.exports = { creer, adressePrivee, chercherBoxes };
