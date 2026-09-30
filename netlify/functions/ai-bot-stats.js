// Human-readable report of what netlify/edge-functions/ai-bot-logger.js
// has recorded: total hits per known AI crawler, when each was last
// seen, and a feed of the most recent individual hits. Gated behind
// Netlify Identity - only reachable while signed into /admin, same as
// the rest of the dashboard - not something anyone can load by just
// knowing the URL. admin/index.html sends the signed-in user's JWT as
// an Authorization header; this verifies that token against the site's
// own Identity endpoint (GoTrue's /user) before returning anything.
import { getStore } from '@netlify/blobs';

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function gateHtml(message){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>Sign in required — Pingle Law</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F5F6F8;color:#111827;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;}
a{color:#1F7A5C;font-weight:600;}</style></head>
<body><div><p>${escapeHtml(message)}</p><p><a href="/admin/">Sign in at /admin</a></p></div></body></html>`;
}
// Returns { ok: true } or { ok: false, reason } - the reason is shown in the
// admin so a rejected session can be diagnosed instead of guessed at.
async function verifyUser(req){
  const auth = req.headers.get('authorization');
  if(!auth) return { ok: false, reason: 'the request arrived without a login token' };
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(origin + '/.netlify/identity/user', { headers: { authorization: auth } });
    if(res.ok) return { ok: true };
    return { ok: false, reason: 'Netlify Identity rejected the token (status ' + res.status + ')' };
  } catch (err) {
    return { ok: false, reason: 'could not reach Netlify Identity: ' + String(err && err.message || err).slice(0, 100) };
  }
}

// ---- Reading the log --------------------------------------------------
// The edge function writes ONE record per hit under
//   h/<UTC date>/<UTC hour>/<bot>/<url-encoded page>/<ms>-<random>
// so nothing is ever read-modified-written (simultaneous crawler visits used
// to overwrite each other's counts). Everything is counted from the keys.
// Days older than yesterday are folded into one small "rollup/<date>" doc and
// their raw records deleted, which keeps listing fast. Counts kept by the
// previous scheme (totals, pages, recent, daily/<date>, hours/<date>) are a
// frozen baseline that is added in.
const LEGACY_LAST_DAY = '2026-10-02'; // no pre-change daily/hours docs exist after this date
const LABELS = {
  'GPTBot': 'OpenAI (GPTBot - training crawl)', 'ChatGPT-User': 'OpenAI (ChatGPT - live browsing)', 'OAI-SearchBot': 'OpenAI (search)',
  'ClaudeBot': 'Anthropic (ClaudeBot - training crawl)', 'Claude-Web': 'Anthropic (Claude - live browsing)', 'Claude-User': 'Anthropic (Claude - live browsing)',
  'anthropic-ai': 'Anthropic (API-triggered fetch)', 'PerplexityBot': 'Perplexity (search crawl)', 'Perplexity-User': 'Perplexity (live browsing)',
  'CCBot': 'Common Crawl (feeds many LLM training sets)', 'Google-Extended': 'Google (AI training signal)', 'GoogleOther': 'Google (other/experimental crawl)',
  'Applebot-Extended': 'Apple (AI training signal)', 'Bytespider': 'ByteDance/TikTok (feeds Doubao etc.)', 'Amazonbot': 'Amazon (feeds Alexa/Rufus)',
  'meta-externalagent': 'Meta (AI training crawl)', 'Diffbot': 'Diffbot (data extraction, feeds various LLMs)', 'YouBot': 'You.com', 'Timpibot': 'Timpi',
  'cohere-ai': 'Cohere', 'DuckAssistBot': 'DuckDuckGo (AI Assist)', 'Bingbot': 'Microsoft Bing (feeds Copilot)'
};

// Individual visits are kept (compactly, inside each day's rollup) for this many
// days, capped per day. Only bots whose referer means something have it stored.
const KEEP_ITEM_DAYS = 90, MAX_ITEMS_PER_DAY = 3000, MAX_FEED = 600;
const REFERER_BOTS = new Set(['ChatGPT-User', 'Claude-Web', 'Claude-User', 'Perplexity-User', 'OAI-SearchBot', 'anthropic-ai']);

function addDaysIso(iso, n){ const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function parseKey(key){
  // Parsed from both ends: the store may hand back the page part with its
  // "%2F" escapes already turned into real slashes, which adds extra
  // segments in the middle - so the fixed fields are taken from the ends and
  // whatever is between them is the page.
  const p = key.split('/');
  if(p.length < 6 || p[0] !== 'h') return null;
  const uniq = p[p.length - 1];
  const raw = p.slice(4, -1).join('/');
  let path; try { path = decodeURIComponent(raw); } catch (e) { path = raw; }
  return { key, date: p[1], hour: p[2], bot: p[3], path: path || '/', ms: Number(uniq.split('-')[0]) || 0 };
}
async function listKeys(store, prefix){
  const out = [];
  for await (const page of store.list({ prefix, paginate: true })) for(const b of page.blobs) out.push(b.key);
  return out;
}
async function listDirs(store, prefix){
  const out = [];
  for await (const page of store.list({ prefix, directories: true, paginate: true })) for(const d of (page.directories || [])) out.push(d);
  return out;
}
// { hours: {HH: {bot: n}}, pages: {path: n}, last: {bot: ms} } for one day's records.
function aggregate(parsed){
  const agg = { hours: {}, pages: {}, last: {} };
  parsed.forEach(h => {
    const hr = agg.hours[h.hour] || (agg.hours[h.hour] = {});
    hr[h.bot] = (hr[h.bot] || 0) + 1;
    agg.pages[h.path] = (agg.pages[h.path] || 0) + 1;
    if(h.ms > (agg.last[h.bot] || 0)) agg.last[h.bot] = h.ms;
  });
  return agg;
}
function dayCounts(agg){
  const c = {};
  Object.values(agg.hours || {}).forEach(hr => Object.keys(hr).forEach(b => { c[b] = (c[b] || 0) + hr[b]; }));
  return c;
}
async function inChunks(items, size, fn){
  for(let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

// Reads everything the admin's AI Visibility page needs. Kept separate so
// the (unauthenticated, counts-only) health check below runs the exact same
// code path as the real, gated request.
async function gatherData(store, url){
  const today = new Date().toISOString().slice(0, 10);
  const liveFrom = addDaysIso(today, -1); // yesterday and today stay as raw records

  // ---- new-format days: rollups + raw records ----
  const newDays = new Map();       // date -> aggregate
  const liveHits = [];             // parsed records of the still-raw days (for the feed)
  const rollupDates = (await listKeys(store, 'rollup/')).map(k => k.slice(7));
  await Promise.all(rollupDates.map(async d => {
    const doc = await store.get('rollup/' + d, { type: 'json' });
    if(doc) newDays.set(d, doc);
  }));
  const rawDates = (await listDirs(store, 'h/')).map(d => d.split('/')[1]).filter(Boolean);
  await Promise.all(rawDates.filter(d => !newDays.has(d)).map(async d => {
    const keys = await listKeys(store, 'h/' + d + '/');
    const parsed = keys.map(parseKey).filter(Boolean);
    const agg = aggregate(parsed);
    newDays.set(d, agg);
    if(d >= liveFrom){ parsed.forEach(h => liveHits.push(h)); return; }
    try {
      // Keep the day's individual visits, newest first, in a compact form:
      // [ms, bot, page, referer]. ~60-100 bytes each.
      const sorted = parsed.slice().sort((x, y) => y.ms - x.ms).slice(0, MAX_ITEMS_PER_DAY);
      const refs = {};
      await inChunks(sorted.filter(h => REFERER_BOTS.has(h.bot)), 25, async h => {
        const v = await Promise.resolve().then(() => store.get(h.key, { type: 'json' })).catch(() => null);
        if(v && v.referer) refs[h.key] = v.referer;
      });
      agg.items = sorted.map(h => [h.ms, h.bot, h.path, refs[h.key] || '']);
      await store.setJSON('rollup/' + d, agg);
      await inChunks(keys, 25, k => store.delete(k));
    } catch (e) { /* stays raw; counted again next time, never lost */ }
  }));
  // Keep storage bounded: drop itemized visits older than KEEP_ITEM_DAYS (the
  // counts in the same rollup stay forever).
  const pruneBefore = addDaysIso(today, -KEEP_ITEM_DAYS);
  const stale = [...newDays.keys()].filter(d => d < pruneBefore && newDays.get(d).items).slice(0, 10);
  await Promise.all(stale.map(async d => {
    const doc = newDays.get(d); delete doc.items;
    try { await store.setJSON('rollup/' + d, doc); } catch (e) {}
  }));

  // ---- all-time totals + pages: frozen baseline + new-format days ----
  const legacyTotals = (await store.get('totals', { type: 'json' })) || {};
  const totals = {};
  Object.keys(legacyTotals).forEach(k => { totals[k] = Object.assign({}, legacyTotals[k]); });
  const pages = Object.assign({}, (await store.get('pages', { type: 'json' })) || {});
  newDays.forEach(agg => {
    const c = dayCounts(agg);
    Object.keys(c).forEach(b => {
      const t = totals[b] || (totals[b] = { label: LABELS[b] || b, count: 0, lastSeen: null });
      t.count += c[b];
    });
    Object.keys(agg.last || {}).forEach(b => {
      const iso = new Date(agg.last[b]).toISOString();
      if(totals[b] && (!totals[b].lastSeen || iso > totals[b].lastSeen)) totals[b].lastSeen = iso;
    });
    Object.keys(agg.pages || {}).forEach(p => { pages[p] = (pages[p] || 0) + agg.pages[p]; });
  });

  // ---- per-day + per-hour counts for the requested window ----
  // Last 30 days by default, or ?from=YYYY-MM-DD&to=YYYY-MM-DD (the admin's
  // export uses this; capped at 370 days). Days with no hits come back as {}
  // so the chart keeps an evenly spaced axis.
  const days = [];
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const fromQ = url.searchParams.get('from'), toQ = url.searchParams.get('to');
  if(isDate(fromQ) && isDate(toQ)){
    let a = new Date(fromQ + 'T00:00:00Z'), b = new Date(toQ + 'T00:00:00Z');
    if(a > b){ const t = a; a = b; b = t; }
    const span = Math.min(370, Math.round((b - a) / 86400000) + 1);
    for(let i = span - 1; i >= 0; i--) days.push(new Date(b.getTime() - i * 86400000).toISOString().slice(0, 10));
  } else {
    for(let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  const legacyDays = days.filter(d => d <= LEGACY_LAST_DAY);
  const legacyDaily = {}, legacyHours = {};
  await inChunks(legacyDays, 20, async d => {
    const [dd, hh] = await Promise.all([
      Promise.resolve().then(() => store.get('daily/' + d, { type: 'json' })).catch(() => null),
      Promise.resolve().then(() => store.get('hours/' + d, { type: 'json' })).catch(() => null)
    ]);
    if(dd) legacyDaily[d] = dd;
    if(hh) legacyHours[d] = hh;
  });
  const daily = [], hours = {};
  days.forEach(d => {
    const counts = Object.assign({}, legacyDaily[d] || {});
    const nd = newDays.get(d);
    if(nd){ const c = dayCounts(nd); Object.keys(c).forEach(b => { counts[b] = (counts[b] || 0) + c[b]; }); }
    daily.push({ date: d, counts });
    const hr = {};
    Object.keys(legacyHours[d] || {}).forEach(h => { hr[h] = Object.assign({}, legacyHours[d][h]); });
    if(nd) Object.keys(nd.hours || {}).forEach(h => {
      hr[h] = hr[h] || {};
      Object.keys(nd.hours[h]).forEach(b => { hr[h][b] = (hr[h][b] || 0) + nd.hours[h][b]; });
    });
    if(Object.keys(hr).length) hours[d] = hr;
  });

  // ---- activity feed: every itemized visit in the requested window,
  // newest first (raw records from the last two days + the itemized visits
  // kept in older rollups), then the pre-change capped feed. ----
  const inWindow = new Set(days);
  const cand = [];
  liveHits.forEach(h => { if(inWindow.has(h.date)) cand.push({ ms: h.ms, bot: h.bot, path: h.path, key: h.key }); });
  newDays.forEach((agg, d) => {
    if(!inWindow.has(d) || !agg.items) return;
    agg.items.forEach(it => cand.push({ ms: it[0], bot: it[1], path: it[2], referer: it[3] || null }));
  });
  cand.sort((a, b) => b.ms - a.ms);
  const top = cand.slice(0, MAX_FEED);
  await inChunks(top.filter(c => c.key && REFERER_BOTS.has(c.bot)).slice(0, 100), 25, async c => {
    const v = await Promise.resolve().then(() => store.get(c.key, { type: 'json' })).catch(() => null);
    if(v && v.referer) c.referer = v.referer;
  });
  const fresh = top.map(c => ({ bot: c.bot, label: LABELS[c.bot] || c.bot, path: c.path, referer: c.referer || null, time: new Date(c.ms).toISOString() }));
  const legacyRecent = ((await store.get('recent', { type: 'json' })) || []).filter(r => inWindow.has(String(r.time || '').slice(0, 10)));
  const recent = fresh.concat(legacyRecent).slice(0, MAX_FEED);

  // Per-day page tallies for the window (top pages only, to keep the payload
  // small on long ranges) - lets the report show "most-read pages" for the
  // chosen dates. Pages are counted by UTC day. Visits from before the
  // one-record-per-hit change were only ever tallied all-time, so
  // `pagesSince` says where per-day page data starts.
  const perDayLimit = days.length > 92 ? 30 : 200;
  const pagesDaily = {};
  days.forEach(d => {
    const nd = newDays.get(d);
    if(!nd || !nd.pages) return;
    const top = Object.entries(nd.pages).sort((a, b) => b[1] - a[1]).slice(0, perDayLimit);
    if(top.length) pagesDaily[d] = Object.fromEntries(top);
  });
  const pagesSince = [...newDays.keys()].sort()[0] || null;

  return { totals, recent, daily, pages, hours, pagesDaily, pagesSince };
}

export default async (req) => {
  const url = new URL(req.url);

  // Health check - no login, but returns only counts (never the data
  // itself): runs the same reads as the real request and reports whether
  // they work and how much is stored.
  if(url.searchParams.has('__check')){
    try {
      const d = await gatherData(getStore('ai-bot-log'), url);
      return Response.json({
        ok: true,
        bots: Object.keys(d.totals).length,
        totalHits: Object.values(d.totals).reduce((s, v) => s + (v && v.count || 0), 0),
        recentEntries: d.recent.length,
        newestRecent: d.recent[0] ? d.recent[0].time : null,
        daysWithData: d.daily.filter(x => Object.keys(x.counts).length).length,
        pages: Object.keys(d.pages).length
      }, { headers: { 'cache-control': 'no-store' } });
    } catch (err) {
      return Response.json({ ok: false, error: String(err && err.message || err).slice(0, 200) }, { status: 500 });
    }
  }

  const auth = await verifyUser(req);
  if(!auth.ok){
    if(url.searchParams.get('format') === 'json'){
      return Response.json({ error: 'Sign in required.', reason: auth.reason }, { status: 401 });
    }
    return new Response(gateHtml('Sign in to view AI crawler activity.'), {
      status: 401,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  let data;
  try {
    data = await gatherData(getStore('ai-bot-log'), url);
  } catch (err) {
    return Response.json({ error: 'Could not read crawler data: ' + String(err && err.message || err).slice(0, 160) }, { status: 500 });
  }
  const { totals, recent } = data;

  if(url.searchParams.get('format') === 'json'){
    return Response.json(data, { headers: { 'cache-control': 'no-store' } });
  }

  const rows = Object.entries(totals).sort((a, b) => b[1].count - a[1].count);
  const totalHits = rows.reduce((sum, [, v]) => sum + v.count, 0);

  const rowsHtml = rows.length
    ? rows.map(([needle, v]) => `
        <tr>
          <td>${escapeHtml(v.label)}</td>
          <td class="mono">${escapeHtml(needle)}</td>
          <td class="num">${v.count.toLocaleString()}</td>
          <td>${escapeHtml(timeAgo(v.lastSeen))}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="empty">No AI crawler visits recorded yet.</td></tr>`;

  const recentHtml = recent.length
    ? recent.slice(0, 50).map(r => `
        <tr>
          <td>${escapeHtml(r.label)}</td>
          <td class="mono">${escapeHtml(r.path)}</td>
          <td class="mono">${r.referer ? escapeHtml(r.referer) : '—'}</td>
          <td>${escapeHtml(timeAgo(r.time))}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="empty">Nothing yet.</td></tr>`;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>AI Crawler Activity — Pingle Law</title>
<style>
  :root{ color-scheme: light; }
  body{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#F5F6F8; color:#111827; margin:0; padding:32px 20px 64px; }
  .wrap{ max-width:900px; margin:0 auto; }
  h1{ font-size:24px; margin:0 0 4px; }
  .sub{ color:#6B7280; margin:0 0 28px; font-size:14px; }
  .stat{ display:inline-block; background:#fff; border-radius:14px; padding:16px 22px; box-shadow:0 1px 2px rgba(17,24,39,0.04), 0 10px 30px -22px rgba(17,24,39,0.25); margin:0 12px 24px 0; }
  .stat b{ display:block; font-size:26px; }
  .stat span{ color:#6B7280; font-size:12.5px; text-transform:uppercase; letter-spacing:0.04em; }
  table{ width:100%; border-collapse:collapse; background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 1px 2px rgba(17,24,39,0.04), 0 10px 30px -22px rgba(17,24,39,0.25); }
  th, td{ text-align:left; padding:10px 14px; font-size:13.5px; border-top:1px solid #E5E7EB; }
  th{ background:#F9FAFB; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#6B7280; border-top:none; }
  tr:first-child td{ border-top:none; }
  .num{ text-align:right; font-weight:600; }
  .mono{ font-family:ui-monospace, SFMono-Regular, Menlo, monospace; color:#6B7280; font-size:12.5px; }
  .empty{ color:#9CA3AF; text-align:center; padding:24px; }
  h2{ font-size:16px; margin:36px 0 12px; }
  p.hint{ color:#9CA3AF; font-size:12.5px; margin-top:24px; }
  p.hint a{ color:#1F7A5C; }
</style>
</head><body>
<div class="wrap">
  <h1>AI Crawler Activity</h1>
  <p class="sub">Visits from known AI crawlers and agents (GPTBot, ClaudeBot, PerplexityBot, and others) since this started logging.</p>
  <div>
    <div class="stat"><b>${totalHits.toLocaleString()}</b><span>Total AI Hits</span></div>
    <div class="stat"><b>${rows.length}</b><span>Distinct Bots Seen</span></div>
  </div>
  <h2>By Crawler</h2>
  <table>
    <tr><th>Platform</th><th>Signature</th><th>Total Hits</th><th>Last Seen</th></tr>
    ${rowsHtml}
  </table>
  <h2>Recent Hits</h2>
  <table>
    <tr><th>Platform</th><th>Page</th><th>Referer</th><th>When</th></tr>
    ${recentHtml}
  </table>
  <p class="hint">Referer is only ever populated for "live lookup" agents (ChatGPT-User, Perplexity-User, Claude-Web/User, OAI-SearchBot) - those are triggered by an actual person's question right now, and some platforms pass the search page (sometimes the query itself) through this header. Training crawlers (GPTBot, ClaudeBot, CCBot, etc.) have no query behind them, so it's always blank there - expected, not missing data. No platform is guaranteed to send anything useful here.</p>
  <p class="hint">Raw data: <a href="/.netlify/functions/ai-bot-stats?format=json">?format=json</a></p>
</div>
</body></html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
};

export const config = { path: '/.netlify/functions/ai-bot-stats' };
