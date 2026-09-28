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
async function verifyUser(req){
  const auth = req.headers.get('authorization');
  if(!auth) return false;
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(origin + '/.netlify/identity/user', { headers: { authorization: auth } });
    return res.ok;
  } catch (err) {
    return false;
  }
}
function timeAgo(iso){
  if(!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if(s < 60) return 'just now';
  if(s < 3600) return Math.floor(s / 60) + 'm ago';
  if(s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export default async (req) => {
  const url = new URL(req.url);
  const authed = await verifyUser(req);
  if(!authed){
    if(url.searchParams.get('format') === 'json'){
      return Response.json({ error: 'Sign in required.' }, { status: 401 });
    }
    return new Response(gateHtml('Sign in to view AI crawler activity.'), {
      status: 401,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  const store = getStore('ai-bot-log');
  const totals = (await store.get('totals', { type: 'json' })) || {};
  const recent = (await store.get('recent', { type: 'json' })) || [];

  if(url.searchParams.get('format') === 'json'){
    return Response.json({ totals, recent });
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
