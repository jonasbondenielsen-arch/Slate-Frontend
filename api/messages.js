export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const token = req.headers.authorization?.replace('Bearer ', '') || SUPABASE_KEY;

  const sbUser = (path, opts = {}) => fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...(opts.headers || {}) },
    ...opts
  });

  if (req.method === 'GET') {
    const { lead_id, sender_type } = req.query;
    if (!lead_id) return res.status(400).json({ error: 'Mangler lead_id' });

    // Fetch all messages for this lead ordered by created_at ASC
    const r = await sbUser(`messages?lead_id=eq.${lead_id}&order=created_at.asc`);
    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.message || 'Kunne ikke hente beskeder' });
    }
    const messages = await r.json();

    // Count unread messages where sender_type differs from the requester
    const unread = sender_type
      ? messages.filter(m => !m.laest && m.sender_type !== sender_type).length
      : 0;

    // Mark messages as read where sender_type != current user's type
    if (sender_type && messages.length > 0) {
      try {
        await sbUser(`messages?lead_id=eq.${lead_id}&sender_type=neq.${sender_type}&laest=eq.false`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ laest: true })
        });
      } catch (e) {}
    }

    return res.json({ messages, unread });
  }

  if (req.method === 'POST') {
    const { lead_id, sender_id, sender_type, besked } = req.body;
    if (!lead_id || !sender_id || !sender_type || !besked) {
      return res.status(400).json({ error: 'Mangler lead_id, sender_id, sender_type eller besked' });
    }

    const r = await sbUser('messages', {
      method: 'POST',
      body: JSON.stringify({ lead_id, sender_id, sender_type, besked, laest: false })
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.message || 'Kunne ikke sende besked' });
    }

    const data = await r.json();

    // Update leads.updated_at
    try {
      await sbUser(`leads?id=eq.${lead_id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ updated_at: new Date().toISOString() })
      });
    } catch (e) {}

    return res.status(201).json(data[0] || data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
