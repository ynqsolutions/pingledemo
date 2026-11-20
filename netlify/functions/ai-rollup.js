// Hourly housekeeping for the AI crawler log (runs on Netlify's schedule, not
// when someone opens the admin). The edge logger writes one small record per
// visit; here every day older than yesterday is bundled into one summary
// ("rollup/<date>") and its individual records are deleted. Before this ran
// on a schedule the admin page did the work itself, which made the first
// open of the day slow. ai-bot-stats.js only reads.
import { getStore } from '@netlify/blobs';

const KEEP_ITEM_DAYS = 90, MAX_ITEMS_PER_DAY = 3000;
const BUDGET_MS = 20000;        // stop starting new days after this
const MAX_DAYS_PER_RUN = 4;
const REFERER_BOTS = new Set(['ChatGPT-User', 'Claude-Web', 'Claude-User', 'Perplexity-User', 'meta-externalfetcher', 'OAI-SearchBot', 'anthropic-ai']);

function addDaysIso(iso, n){ const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function parseKey(key){
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
async function inChunks(items, size, fn){
  for(let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

export default async () => {
  const started = Date.now();
  const store = getStore('ai-bot-log');
  const today = new Date().toISOString().slice(0, 10);
  const liveFrom = addDaysIso(today, -1); // yesterday and today stay as raw records
  const done = { rolled: 0, cleaned: 0, pruned: 0, cachesDeleted: 0 };

  const rollups = new Set((await listKeys(store, 'rollup/')).map(k => k.slice(7)));
  const rawDates = (await listDirs(store, 'h/')).map(d => d.split('/')[1]).filter(d => d && d < liveFrom).sort();
  for(const d of rawDates.slice(0, MAX_DAYS_PER_RUN)){
    if(Date.now() - started > BUDGET_MS) break;
    const keys = await listKeys(store, 'h/' + d + '/');
    if(rollups.has(d)){
      // A summary already exists and counts these records; they are only leftovers.
      await inChunks(keys, 50, k => store.delete(k));
      done.cleaned++;
      continue;
    }
    const parsed = keys.map(parseKey).filter(Boolean);
    const agg = aggregate(parsed);
    // Keep the day's individual visits, newest first, as [ms, bot, page, referer].
    const sorted = parsed.slice().sort((x, y) => y.ms - x.ms).slice(0, MAX_ITEMS_PER_DAY);
    const refs = {};
    await inChunks(sorted.filter(h => REFERER_BOTS.has(h.bot)), 25, async h => {
      const v = await Promise.resolve().then(() => store.get(h.key, { type: 'json' })).catch(() => null);
      if(v && v.referer) refs[h.key] = v.referer;
    });
    agg.items = sorted.map(h => [h.ms, h.bot, h.path, refs[h.key] || '']);
    await store.setJSON('rollup/' + d, agg);       // summary first,
    await inChunks(keys, 50, k => store.delete(k)); // then delete: nothing is ever lost
    done.rolled++;
  }

  // Drop individual visits older than KEEP_ITEM_DAYS (the day's counts stay forever).
  const pruneBefore = addDaysIso(today, -KEEP_ITEM_DAYS);
  for(const d of [...rollups].filter(x => x < pruneBefore).slice(0, 5)){
    if(Date.now() - started > BUDGET_MS) break;
    const doc = await store.get('rollup/' + d, { type: 'json' }).catch(() => null);
    if(doc && doc.items){ delete doc.items; await store.setJSON('rollup/' + d, doc); done.pruned++; }
  }

  // Cached admin responses from earlier days are no longer useful.
  const caches = await listKeys(store, 'cache/').catch(() => []);
  const old = caches.filter(k => (k.split('/')[1] || '') < today);
  await inChunks(old, 50, k => store.delete(k));
  done.cachesDeleted = old.length;

  console.log('ai-rollup', JSON.stringify(done), (Date.now() - started) + 'ms');
  return new Response(JSON.stringify(done), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '@hourly' };
