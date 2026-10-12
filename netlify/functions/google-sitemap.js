// One-click "resubmit sitemap" to Google Search Console from the admin's
// Search Updates page. Google has no IndexNow, so this uses the Search Console
// API (sitemaps.submit) with a service account that has been added as an Owner
// of the property. Set GOOGLE_SERVICE_ACCOUNT_JSON in Netlify; optionally
// GSC_SITE_URL (e.g. sc-domain:pinglelaw.com or https://www.pinglelaw.com/).
// Gated behind Netlify Identity exactly like indexnow.js.
import { getStore } from '@netlify/blobs';
import { createSign } from 'node:crypto';

const SITEMAP = 'https://www.pinglelaw.com/sitemap.xml';
const COOLDOWN_MS = 30 * 60 * 1000;

async function verifyUser(req){
  const auth = req.headers.get('authorization');
  if(!auth) return false;
  try {
    const res = await fetch(new URL(req.url).origin + '/.netlify/identity/user', { headers: { authorization: auth } });
    return res.ok;
  } catch (e) { return false; }
}

const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

async function accessToken(sa){
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 });
  const sig = createSign('RSA-SHA256').update(head + '.' + body).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + body + '.' + sig })
  });
  const j = await res.json().catch(() => ({}));
  if(!res.ok || !j.access_token) throw new Error('Google sign-in failed: ' + (j.error_description || j.error || res.status));
  return j.access_token;
}

export default async (req) => {
  if(!(await verifyUser(req))) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const store = getStore('ai-bot-log');
  const last = (await store.get('gsc-sitemap-last', { type: 'json' }).catch(() => null)) || null;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const configured = !!raw;
  if(req.method !== 'POST') return Response.json({ last, configured }, { headers: { 'cache-control': 'no-store' } });

  if(!configured) return Response.json({ error: 'Not set up yet. Add GOOGLE_SERVICE_ACCOUNT_JSON in Netlify and make that service account an Owner in Search Console.', configured }, { status: 503 });
  if(last && last.ok && Date.now() - new Date(last.time).getTime() < COOLDOWN_MS){
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - new Date(last.time).getTime())) / 60000);
    return Response.json({ error: 'Sent recently. Try again in about ' + wait + ' minute' + (wait === 1 ? '' : 's') + '.', last, configured }, { status: 429 });
  }

  try {
    let sa; try { sa = JSON.parse(raw); } catch (e) { return Response.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.' }, { status: 500 }); }
    const token = await accessToken(sa);
    const sites = process.env.GSC_SITE_URL ? [process.env.GSC_SITE_URL] : ['sc-domain:pinglelaw.com', 'https://www.pinglelaw.com/', 'https://pinglelaw.com/'];
    let status = 0, detail = '';
    for(const site of sites){
      const url = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(site) + '/sitemaps/' + encodeURIComponent(SITEMAP);
      const r = await fetch(url, { method: 'PUT', headers: { authorization: 'Bearer ' + token, 'content-length': '0' } });
      status = r.status;
      if(r.ok) break;
      if(r.status !== 403 && r.status !== 404) { detail = (await r.text()).slice(0, 160); break; }
    }
    const ok = status >= 200 && status < 300;
    const message = ok ? 'Submitted. Google has been asked to re-read the sitemap.'
      : status === 403 || status === 404 ? 'Google refused: the service account is not an Owner of the pinglelaw.com property in Search Console.'
      : 'Google responded with status ' + status + (detail ? ': ' + detail : '') + '.';
    const record = { time: new Date().toISOString(), ok, status, message };
    if(ok) await store.setJSON('gsc-sitemap-last', record);
    return Response.json(ok ? { last: record, configured } : { error: message, configured }, { status: ok ? 200 : 502 });
  } catch (err) {
    return Response.json({ error: String((err && err.message) || err).slice(0, 200), configured }, { status: 502 });
  }
};
