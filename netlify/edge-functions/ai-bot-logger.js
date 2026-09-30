// Logs every visit from a known AI crawler/agent (GPTBot, ClaudeBot,
// PerplexityBot, etc.) so it's possible to actually check whether AI
// platforms are finding and reading the site, instead of guessing.
//
// Runs as a Netlify Edge Function in front of every page request (see
// [[edge_functions]] in netlify.toml). Two record-keeping paths:
//   1. console.log on every match - shows up immediately in the Edge
//      Functions log tab in the Netlify dashboard, free, no setup.
//   2. One small record per hit in Netlify Blobs, added up by
//      netlify/functions/ai-bot-stats.js so the numbers survive past
//      whatever log retention Netlify applies and can be viewed as a
//      simple report instead of scrolling raw logs.
//
// Ordinary visitor traffic is completely unaffected: this only does any
// work (and only then, without ever blocking the response) when the
// User-Agent matches a known bot signature.
import { getStore } from '@netlify/blobs';

// Substring match against the User-Agent header, case-insensitive.
// Sources: each platform's own published crawler documentation. New
// crawlers show up occasionally - add them here as they do.
const KNOWN_AI_BOTS = [
  ['GPTBot', 'OpenAI (GPTBot - training crawl)'],
  ['ChatGPT-User', 'OpenAI (ChatGPT - live browsing)'],
  ['OAI-SearchBot', 'OpenAI (search)'],
  ['ClaudeBot', 'Anthropic (ClaudeBot - training crawl)'],
  ['Claude-Web', 'Anthropic (Claude - live browsing)'],
  ['Claude-User', 'Anthropic (Claude - live browsing)'],
  ['anthropic-ai', 'Anthropic (API-triggered fetch)'],
  ['PerplexityBot', 'Perplexity (search crawl)'],
  ['Perplexity-User', 'Perplexity (live browsing)'],
  ['CCBot', 'Common Crawl (feeds many LLM training sets)'],
  ['Google-Extended', 'Google (AI training signal)'],
  ['GoogleOther', 'Google (other/experimental crawl)'],
  ['Applebot-Extended', 'Apple (AI training signal)'],
  ['Bytespider', 'ByteDance/TikTok (feeds Doubao etc.)'],
  ['Amazonbot', 'Amazon (feeds Alexa/Rufus)'],
  ['meta-externalagent', 'Meta (AI training crawl)'],
  ['Diffbot', 'Diffbot (data extraction, feeds various LLMs)'],
  ['YouBot', 'You.com'],
  ['Timpibot', 'Timpi'],
  ['cohere-ai', 'Cohere'],
  ['DuckAssistBot', 'DuckDuckGo (AI Assist)'],
  ['Bingbot', 'Microsoft Bing (feeds Copilot)'],
];

function matchBot(userAgent){
  if(!userAgent) return null;
  const ua = userAgent.toLowerCase();
  for(const [needle, label] of KNOWN_AI_BOTS){
    if(ua.includes(needle.toLowerCase())) return { needle, label };
  }
  return null;
}

export default async (req, context) => {
  const userAgent = req.headers.get('user-agent') || '';
  const match = matchBot(userAgent);
  const url = new URL(req.url);

  // Self-check: any page + ?__aibot_check=1 reports (in a response header)
  // whether this function ran, whether the User-Agent matched, whether
  // context.waitUntil exists, and whether Netlify Blobs is reachable -
  // WITHOUT recording a hit, so it never pollutes the real data.
  if(url.searchParams.has('__aibot_check')){
    let blobs = 'ok';
    try {
      const store = getStore('ai-bot-log');
      const totals = await store.get('totals', { type: 'json' });
      blobs = 'read-ok(bots=' + (totals ? Object.keys(totals).length : 0) + ')';
      // Write test goes to a separate key - never the real tallies.
      const stamp = String(Date.now());
      await store.setJSON('selftest', { stamp: stamp });
      const back = await store.get('selftest', { type: 'json' });
      blobs += back && back.stamp === stamp ? ' write-ok' : ' write-unconfirmed';
    }
    catch (err) { blobs = 'error: ' + String(err && err.message || err).slice(0, 120); }
    const res = await context.next();
    const out = new Response(res.body, res);
    out.headers.set('x-ai-bot-check', 'match=' + (match ? match.needle : 'none') + '; waitUntil=' + (typeof context.waitUntil === 'function' ? 'yes' : 'no') + '; blobs=' + blobs);
    out.headers.set('cache-control', 'no-store');
    return out;
  }

  if(!match) return context.next();

  // Fetch the page first so junk addresses (spam links that resolve to the
  // site's 404 page) can be skipped instead of cluttering the log.
  const response = await context.next();
  if(response.status === 404) return response;

  {
    // The Referer header only ever matters for the "live lookup" agents
    // (ChatGPT-User, Perplexity-User, Claude-Web/User, OAI-SearchBot) -
    // those are triggered by an actual person's question right now, and
    // some platforms have been known to pass the search/query page (and
    // sometimes the query text itself) through this header. Training
    // crawlers (GPTBot, ClaudeBot, CCBot, etc.) are systematic content
    // crawls with no query behind them, so this will just be empty for
    // those - expected, not a bug. No guarantee any platform sends
    // anything useful here at all; this only records whatever shows up.
    const referer = req.headers.get('referer') || '';
    console.log(`[ai-bot] ${match.label} -> ${url.pathname}${referer ? ' (referer: ' + referer + ')' : ''}`);

    // Prefer context.waitUntil (finishes after the response goes out). If
    // the runtime doesn't provide it, calling it would throw and the hit
    // would silently never be saved - so fall back to awaiting the write.
    // Either way this only ever runs for matched bot requests; normal
    // visitors never reach this line. recordHit never throws.
    const pending = recordHit(match, url.pathname, userAgent, referer);
    if(context && typeof context.waitUntil === 'function') context.waitUntil(pending);
    else await pending;
  }

  return response;
};

// One tiny record per hit, under a key that already carries everything the
// stats page counts (day, hour, bot, page). Nothing is read first and no
// shared counter is updated, so simultaneous visits - crawlers like Meta's
// fire many at once - can never overwrite each other's counts (the old
// read-add-write counters could and did lose hits). The stats function
// adds the keys up (and rolls old days into a compact summary).
async function recordHit(match, pathname, userAgent, referer){
  try {
    const store = getStore('ai-bot-log');
    const now = new Date();
    const iso = now.toISOString();
    const pathKey = encodeURIComponent(pathname).slice(0, 240);
    const key = `h/${iso.slice(0, 10)}/${iso.slice(11, 13)}/${match.needle}/${pathKey}/${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    await store.setJSON(key, { label: match.label, path: pathname, referer: referer || null });
  } catch (err) {
    // Never let a logging failure surface anywhere visitor- or
    // crawler-facing - just note it for whoever next checks the logs.
    console.log('[ai-bot] logging error: ' + (err && err.message));
  }
}

export const config = { path: '/*', excludedPath: ['/.netlify/*', '/assets/*', '/css/*', '/js/*'] };
