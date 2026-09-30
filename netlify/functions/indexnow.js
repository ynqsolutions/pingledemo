// One-click IndexNow submission from the admin's AI Visibility page.
// IndexNow (indexnow.org) tells Bing and other participating search engines
// that pages were added or changed so they re-crawl promptly instead of
// waiting for their next scheduled visit. Bing's index also feeds ChatGPT
// search and Copilot. Google does not participate.
//
// The key below is public by design: the same value is served at
// /208b14e897239cad329157064d621867.txt so search engines can verify the requests come from this site.
// Gated behind Netlify Identity exactly like ai-bot-stats.js.
import { getStore } from '@netlify/blobs';

const KEY = '208b14e897239cad329157064d621867';
const HOST = 'www.pinglelaw.com';
const COOLDOWN_MS = 30 * 60 * 1000;  // whole-site submission: at most one per 30 minutes
const TARGETED_COOLDOWN_MS = 5 * 60 * 1000; // a specific list of pages: at most one per 5 minutes

async function verifyUser(req){
  const auth = req.headers.get('authorization');
  if(!auth) return false;
  try {
    const res = await fetch(new URL(req.url).origin + '/.netlify/identity/user', { headers: { authorization: auth } });
    return res.ok;
  } catch (e) { return false; }
}

const RESULT_TEXT = {
  200: 'Submitted. Bing and other IndexNow search engines have been notified.',
  202: 'Accepted. The search engines will verify the key file and then process the pages.',
  400: 'The request was rejected as malformed.',
  403: 'The search engine could not verify the key file.',
  422: 'The submitted URLs did not match the site host.',
  429: 'Too many submissions - the search engine asked us to slow down. Try again later.'
};

export default async (req) => {
  if(!(await verifyUser(req))) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const store = getStore('ai-bot-log');
  const last = (await store.get('indexnow-last', { type: 'json' }).catch(() => null)) || null;

  if(req.method !== 'POST') return Response.json({ last, cooldownMinutes: COOLDOWN_MS / 60000 }, { headers: { 'cache-control': 'no-store' } });

  // Optional body { urls: [...] } sends just those pages (used by the admin's
  // "Mark updated & notify" button); no body sends the whole sitemap.
  let only = null;
  try { const b = await req.json(); if(b && Array.isArray(b.urls)) only = b.urls.map(String); } catch (e) { /* no body */ }
  const cooldown = only ? TARGETED_COOLDOWN_MS : COOLDOWN_MS;

  if(last && last.ok && last.time && Date.now() - new Date(last.time).getTime() < cooldown){
    const wait = Math.ceil((cooldown - (Date.now() - new Date(last.time).getTime())) / 60000);
    return Response.json({ error: 'A submission was sent recently. Try again in about ' + wait + ' minute' + (wait === 1 ? '' : 's') + '.', last }, { status: 429 });
  }

  try {
    // The key file must be live, or every search engine will reject the request.
    const keyLocation = 'https://' + HOST + '/' + KEY + '.txt';
    const keyCheck = await fetch(keyLocation, { cache: 'no-store' });
    if(!keyCheck.ok || (await keyCheck.text()).trim() !== KEY) return Response.json({ error: 'The IndexNow key file is not live yet (' + keyLocation + '). Wait for the latest deploy to finish and try again.' }, { status: 503 });

    let urls;
    if(only){
      urls = only.filter(u => { try { return new URL(u).hostname === HOST; } catch (e) { return false; } }).slice(0, 10000);
      if(!urls.length) return Response.json({ error: 'None of the pages given belong to ' + HOST + '.' }, { status: 400 });
    } else {
      const sm = await fetch('https://' + HOST + '/sitemap.xml', { cache: 'no-store' });
      if(!sm.ok) return Response.json({ error: 'Could not read sitemap.xml (' + sm.status + ').' }, { status: 502 });
      urls = [...(await sm.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]).filter(u => new URL(u).hostname === HOST).slice(0, 10000);
      if(!urls.length) return Response.json({ error: 'The sitemap listed no URLs.' }, { status: 502 });
    }

    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation, urlList: urls })
    });
    const record = { time: new Date().toISOString(), count: urls.length, status: res.status, ok: res.status === 200 || res.status === 202, message: RESULT_TEXT[res.status] || ('IndexNow responded with status ' + res.status + '.') };
    await store.setJSON('indexnow-last', record);
    return Response.json({ last: record }, { status: record.ok ? 200 : 502 });
  } catch (err) {
    return Response.json({ error: 'Could not reach IndexNow: ' + String((err && err.message) || err).slice(0, 160) }, { status: 502 });
  }
};

export const config = { path: '/.netlify/functions/indexnow' };
