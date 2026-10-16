// Saves the NAP Checker's manual "listings" tracker (what each directory
// shows for the firm's name, address and phone) so it is the same on every
// device. Gated behind Netlify Identity exactly like indexnow.js.
import { getStore } from '@netlify/blobs';

async function verifyUser(req){
  const auth = req.headers.get('authorization');
  if(!auth) return false;
  try {
    const res = await fetch(new URL(req.url).origin + '/.netlify/identity/user', { headers: { authorization: auth } });
    return res.ok;
  } catch (e) { return false; }
}
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

export default async (req) => {
  if(!(await verifyUser(req))) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const store = getStore('nap');
  if(req.method !== 'POST'){
    const saved = await store.get('citations', { type: 'json' }).catch(() => null);
    return Response.json({ entries: (saved && saved.entries) || [], updated: (saved && saved.updated) || null }, { headers: { 'cache-control': 'no-store' } });
  }
  let body;
  try { body = await req.json(); } catch (e) { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if(!body || !Array.isArray(body.entries)) return Response.json({ error: 'Expected { entries: [...] }.' }, { status: 400 });
  const entries = body.entries.slice(0, 60).map(e => ({
    name: str(e.name, 80), url: str(e.url, 300),
    listedName: str(e.listedName, 160), listedAddress: str(e.listedAddress, 240), listedPhone: str(e.listedPhone, 40),
    checked: /^\d{4}-\d{2}-\d{2}$/.test(String(e.checked)) ? e.checked : ''
  })).filter(e => e.name);
  const doc = { entries, updated: new Date().toISOString() };
  await store.setJSON('citations', doc);
  return Response.json(doc);
};
