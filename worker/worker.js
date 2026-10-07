// ChatsApp Família — Worker que envia push (FCM) quando chega mensagem nova.
// Roda no plano gratuito do Cloudflare. Não precisa de dependências.
//
// Fluxo: o app (logado) avisa este Worker -> ele confere o login Firebase do remetente ->
// busca os tokens dos aparelhos do destinatário no Realtime Database -> manda o push via FCM.
//
// Configuração (Cloudflare > Worker > Settings > Variables and secrets):
//   SERVICE_ACCOUNT_JSON  (Secret, obrigatório)  conteúdo inteiro do JSON da conta de serviço
//   ALLOWED_ORIGIN        (opcional)  padrão: https://martinswillians.github.io
//   PROJECT_ID            (opcional)  padrão: chatssappii
//   DATABASE_URL          (opcional)  padrão: https://chatssappii-default-rtdb.firebaseio.com

const DEFAULT_ORIGIN = 'https://martinswillians.github.io';
const DEFAULT_PROJECT = 'chatssappii';
const DEFAULT_DB = 'https://chatssappii-default-rtdb.firebaseio.com';
const MAX_TARGETS = 8;            // destinatários por pedido
const MAX_TOKENS_PER_USER = 4;    // aparelhos por pessoa (o plano grátis limita 50 chamadas por pedido)

const enc = new TextEncoder();
const dec = new TextDecoder();
let saCache = null;
let accessCache = { token: null, exp: 0 };
let jwkCache = { keys: null, exp: 0 };

// ---------- utilidades base64 / PEM ----------
function b64urlFromBytes(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromStr(str) { return b64urlFromBytes(enc.encode(str)); }
function bytesFromB64(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function pemToDer(pem) {
  return bytesFromB64(pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function getServiceAccount(env) {
  if (saCache) return saCache;
  if (!env.SERVICE_ACCOUNT_JSON) throw new Error('Secret SERVICE_ACCOUNT_JSON não configurado');
  const sa = JSON.parse(env.SERVICE_ACCOUNT_JSON);
  if (!sa.client_email || !sa.private_key) throw new Error('SERVICE_ACCOUNT_JSON inválido (faltam client_email/private_key)');
  saCache = sa;
  return sa;
}

// ---------- token OAuth da conta de serviço (usado no FCM e no Realtime Database) ----------
async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (accessCache.token && accessCache.exp - 60 > now) return accessCache.token;
  const sa = getServiceAccount(env);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = b64urlFromStr(JSON.stringify(header)) + '.' + b64urlFromStr(JSON.stringify(claim));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
          '&assertion=' + unsigned + '.' + b64urlFromBytes(sig),
  });
  if (!res.ok) throw new Error('OAuth falhou (' + res.status + '): ' + (await res.text()));
  const j = await res.json();
  accessCache = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}

// ---------- confere o login Firebase (ID token) de quem está pedindo o push ----------
async function getGoogleKeys() {
  if (jwkCache.keys && jwkCache.exp > Date.now()) return jwkCache.keys;
  const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!res.ok) throw new Error('Não consegui buscar as chaves públicas do Google');
  const j = await res.json();
  jwkCache = { keys: j.keys, exp: Date.now() + 3600 * 1000 };
  return j.keys;
}

async function verifyIdToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('token malformado');
  const header = JSON.parse(dec.decode(bytesFromB64(parts[0])));
  const payload = JSON.parse(dec.decode(bytesFromB64(parts[1])));
  if (header.alg !== 'RS256') throw new Error('algoritmo inválido');
  const jwk = (await getGoogleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('chave desconhecida');
  const key = await crypto.subtle.importKey('jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytesFromB64(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('assinatura inválida');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error('projeto errado');
  if (payload.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('emissor inválido');
  if (!payload.sub || payload.exp < now || payload.iat > now + 300) throw new Error('token expirado');
  return payload; // payload.sub = uid de quem enviou
}

// ---------- Realtime Database (REST, como administrador) ----------
async function dbGetShallow(env, path, at) {
  const url = (env.DATABASE_URL || DEFAULT_DB) + '/' + path + '.json?shallow=true';
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + at } });
  if (!res.ok) throw new Error('Realtime Database ' + res.status + ' em ' + path);
  return res.json();
}
async function dbDelete(env, path, at) {
  await fetch((env.DATABASE_URL || DEFAULT_DB) + '/' + path + '.json', {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + at },
  });
}

// ---------- envio FCM ----------
async function sendToToken(env, at, projectId, uid, token, data) {
  const res = await fetch('https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        data,
        webpush: { headers: { Urgency: 'high', TTL: '86400' } },
        android: { priority: 'high' },
      },
    }),
  });
  if (res.ok) return 'sent';
  const err = await res.json().catch(() => ({}));
  const status = err.error && err.error.status;
  const code = err.error && err.error.details && err.error.details.map((d) => d.errorCode).find(Boolean);
  if (status === 'NOT_FOUND' || code === 'UNREGISTERED') {
    await dbDelete(env, 'fcm_tokens/' + uid + '/' + encodeURIComponent(token), at); // aparelho não existe mais
    return 'removed';
  }
  console.error('FCM erro', res.status, JSON.stringify(err));
  return 'failed';
}

export default {
  async fetch(req, env) {
    const origin = env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
    const projectId = env.PROJECT_ID || DEFAULT_PROJECT;
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ ok: true, service: 'chatsapp-push' }, 200, cors);

    const reqOrigin = req.headers.get('Origin');
    if (reqOrigin && reqOrigin !== origin) return json({ ok: false, error: 'origem não permitida' }, 403, cors);

    try {
      // 1) quem está pedindo? (login Firebase)
      const auth = req.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'sem login' }, 401, cors);
      let caller;
      try { caller = await verifyIdToken(auth.slice(7), projectId); }
      catch (e) { return json({ ok: false, error: 'login inválido: ' + e.message }, 401, cors); }

      // 2) pedido válido?
      const body = await req.json().catch(() => null);
      if (!body) return json({ ok: false, error: 'corpo inválido' }, 400, cors);
      const key = String(body.key || '');
      const targets = [...new Set(Array.isArray(body.toUids) ? body.toUids.map(String) : [])]
        .filter((u) => u !== caller.sub);
      if (!/^(group_)?[\w-]{3,128}$/.test(key)) return json({ ok: false, error: 'key inválida' }, 400, cors);
      if (!targets.length || targets.length > MAX_TARGETS || !targets.every((u) => /^[\w-]{6,128}$/.test(u)))
        return json({ ok: false, error: 'destinatários inválidos' }, 400, cors);
      const data = {
        title: String(body.title || 'ChatsApp').slice(0, 80),
        body: String(body.body || 'Nova mensagem').slice(0, 140),
        key,
        tag: 'chat-' + key,
      };

      // 3) busca os aparelhos de cada destinatário e envia
      const at = await getAccessToken(env);
      const stats = { sent: 0, removed: 0, failed: 0 };
      await Promise.all(targets.map(async (uid) => {
        const map = await dbGetShallow(env, 'fcm_tokens/' + uid, at);
        const tokens = Object.keys(map || {}).slice(0, MAX_TOKENS_PER_USER);
        const results = await Promise.all(tokens.map((t) => sendToToken(env, at, projectId, uid, t, data)));
        results.forEach((r) => { stats[r === 'sent' ? 'sent' : r === 'removed' ? 'removed' : 'failed']++; });
      }));
      return json({ ok: true, ...stats }, 200, cors);
    } catch (e) {
      console.error('Erro no Worker:', e && e.message);
      return json({ ok: false, error: 'erro interno' }, 500, cors);
    }
  },
};
