// Serves the latest Google Ads snapshot (stored by ads-ingest.js) to the
// admin page. Gated behind Netlify Identity exactly like indexnow.js.
import { getStore } from '@netlify/blobs';

async function verifyUser(req){
  const auth = req.headers.get('authorization');
  if(!auth) return false;
  try {
    const res = await fetch(new URL(req.url).origin + '/.netlify/identity/user', { headers: { authorization: auth } });
    return res.ok;
  } catch (e) { return false; }
}

export default async (req) => {
  if(!(await verifyUser(req))) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const configured = !!process.env.ADS_INGEST_SECRET;
  const store = getStore('google-ads');
  const snap = await store.get('snapshot', { type: 'json' }).catch(() => null);
  return Response.json({ configured, snapshot: snap || null }, { headers: { 'cache-control': 'no-store' } });
};
