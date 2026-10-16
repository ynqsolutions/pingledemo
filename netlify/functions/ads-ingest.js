// Receives Google Ads performance from a small Google Ads Script that runs
// inside the Ads account on a schedule (see the Google Ads page in /admin for
// the script and setup steps). Only requests carrying the shared secret
// (ADS_INGEST_SECRET, set in Netlify) are accepted. The latest snapshot is
// stored in Netlify Blobs and read back by ads-stats.js for the admin page.
import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_ROWS = 20000;

function sameSecret(a, b){
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v, max) => String(v == null ? '' : v).slice(0, max);

export default async (req) => {
  if(req.method !== 'POST') return Response.json({ error: 'POST only.' }, { status: 405 });
  const secret = process.env.ADS_INGEST_SECRET;
  if(!secret) return Response.json({ error: 'Not set up: add ADS_INGEST_SECRET in Netlify.' }, { status: 503 });
  if(!sameSecret(req.headers.get('x-ads-secret') || '', secret)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  const raw = await req.text();
  if(raw.length > MAX_BYTES) return Response.json({ error: 'Payload too large.' }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch (e) { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if(!body || !Array.isArray(body.rows)) return Response.json({ error: 'Expected { rows: [...] }.' }, { status: 400 });

  const rows = [];
  for(const r of body.rows.slice(0, MAX_ROWS)){
    if(!r || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) continue;
    rows.push({
      date: String(r.date),
      campaign: str(r.campaign, 120),
      status: str(r.status, 24),
      impressions: Math.round(num(r.impressions)),
      clicks: Math.round(num(r.clicks)),
      cost: Math.round(num(r.cost) * 100) / 100,
      conversions: Math.round(num(r.conversions) * 100) / 100,
      value: Math.round(num(r.value) * 100) / 100
    });
  }
  const account = {
    name: str(body.account && body.account.name, 120),
    currency: /^[A-Z]{3}$/.test(String(body.account && body.account.currency)) ? body.account.currency : 'USD',
    timezone: str(body.account && body.account.timezone, 60)
  };
  // Optional keyword data (from the newer script): every keyword in the
  // account, keyword performance per window (7 / 30 / 90 days) and the search
  // terms that triggered ads.
  const kwList = (Array.isArray(body.keywordList) ? body.keywordList : []).slice(0, 3000).map(k => ({
    k: str(k.k, 120), m: str(k.m, 12), c: str(k.c, 120), a: str(k.a, 120), s: str(k.s, 12), n: k.n ? 1 : 0
  })).filter(k => k.k);
  const windows = ['7', '30', '90'];
  const kw = {}, terms = {};
  for(const w of windows){
    kw[w] = ((body.keywords && body.keywords[w]) || []).slice(0, 600).map(k => ({
      k: str(k.k, 120), m: str(k.m, 12), c: str(k.c, 120), a: str(k.a, 120),
      i: Math.round(num(k.i)), cl: Math.round(num(k.cl)), co: Math.round(num(k.co) * 100) / 100, cv: Math.round(num(k.cv) * 100) / 100
    })).filter(k => k.k);
    terms[w] = ((body.searchTerms && body.searchTerms[w]) || []).slice(0, 400).map(t => ({
      t: str(t.t, 160), st: str(t.st, 12), c: str(t.c, 120),
      i: Math.round(num(t.i)), cl: Math.round(num(t.cl)), co: Math.round(num(t.co) * 100) / 100, cv: Math.round(num(t.cv) * 100) / 100
    })).filter(t => t.t);
  }
  const scriptErrors = (Array.isArray(body.errors) ? body.errors : []).slice(0, 8).map(e => str(e, 300));
  // The newer script always sends these fields, even when Google returns none (for example
  // Performance Max or Smart campaigns have no keywords), so remember that it ran.
  const hasKeywords = body.keywords != null || body.keywordList != null || body.searchTerms != null;
  const store = getStore('google-ads');
  const snapshot = { updated: new Date().toISOString(), account, rows };
  if(hasKeywords) Object.assign(snapshot, { keywordsSent: true, keywordList: kwList, keywords: kw, searchTerms: terms });
  if(scriptErrors.length) snapshot.scriptErrors = scriptErrors;
  await store.setJSON('snapshot', snapshot);
  return Response.json({ ok: true, rows: rows.length, keywords: kwList.length });
};
