// Live counter behind the "X people requested a consultation" badge on
// schedule-consultation.html and case-review.html. Backed by Netlify Blobs
// (a small key-value store Netlify provisions automatically per site - no
// database to stand up). GET returns the current count; POST increments it
// by one and returns the new count. Both routes share one key, since a
// case-review "Request a Consultation" and a booking-page submission are
// the same real-world event (someone asked to be called).
import { getStore } from '@netlify/blobs';

// The counter starts at 0 the day this ships, which would show "0 people"
// on day one - not false since every submission still adds a real +1, but
// deliberately offset by this fixed constant so the badge starts at a
// realistic number instead of an obviously-fresh zero. Raise or remove
// this if the real count later grows past it.
const BASELINE = 380;

export default async (req) => {
  const store = getStore('consultation-stats');

  if (req.method === 'POST') {
    const current = (await store.get('count', { type: 'json' })) || 0;
    const next = current + 1;
    await store.setJSON('count', next);
    return Response.json({ count: next + BASELINE });
  }

  const current = (await store.get('count', { type: 'json' })) || 0;
  return Response.json({ count: current + BASELINE });
};

export const config = { path: '/.netlify/functions/consult-count' };
