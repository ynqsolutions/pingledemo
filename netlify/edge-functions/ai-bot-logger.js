// Logs every visit from a known AI crawler/agent (GPTBot, ClaudeBot,
// PerplexityBot, etc.) so it's possible to actually check whether AI
// platforms are finding and reading the site, instead of guessing.
//
// Runs as a Netlify Edge Function in front of every page request (see
// [[edge_functions]] in netlify.toml). Two record-keeping paths:
//   1. console.log on every match - shows up immediately in the Edge
//      Functions log tab in the Netlify dashboard, free, no setup.
//   2. A running tally + a capped recent-hits feed in Netlify Blobs, read
//      by netlify/functions/ai-bot-stats.js so the numbers survive past
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

  if(match){
    const url = new URL(req.url);
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

    // Fire-and-forget: never await this on the request path, so a Blobs
    // hiccup can never slow down or break the page for the crawler (or
    // for anyone) - context.waitUntil lets it finish after the response
    // has already gone out.
    context.waitUntil(recordHit(match, url.pathname, userAgent, referer));
  }

  return context.next();
};

async function recordHit(match, pathname, userAgent, referer){
  try {
    const store = getStore('ai-bot-log');
    const today = new Date().toISOString().slice(0, 10);

    const totalsKey = 'totals';
    const totals = (await store.get(totalsKey, { type: 'json' })) || {};
    totals[match.needle] = totals[match.needle] || { label: match.label, count: 0, lastSeen: null };
    totals[match.needle].count += 1;
    totals[match.needle].lastSeen = new Date().toISOString();
    await store.setJSON(totalsKey, totals);

    // A capped feed of the most recent hits across all bots, newest
    // first - enough for a human to sanity-check what's actually being
    // crawled without needing to page through raw logs.
    const recentKey = 'recent';
    const recent = (await store.get(recentKey, { type: 'json' })) || [];
    recent.unshift({ bot: match.needle, label: match.label, path: pathname, referer: referer || null, time: new Date().toISOString() });
    await store.setJSON(recentKey, recent.slice(0, 200));

    // One counter per bot per day, so trends over time are visible
    // without keeping every single hit forever.
    const dailyKey = `daily/${today}`;
    const daily = (await store.get(dailyKey, { type: 'json' })) || {};
    daily[match.needle] = (daily[match.needle] || 0) + 1;
    await store.setJSON(dailyKey, daily);
  } catch (err) {
    // Never let a logging failure surface anywhere visitor- or
    // crawler-facing - just note it for whoever next checks the logs.
    console.log('[ai-bot] logging error: ' + (err && err.message));
  }
}

export const config = { path: '/*', excludedPath: ['/.netlify/*', '/assets/*', '/css/*', '/js/*'] };
