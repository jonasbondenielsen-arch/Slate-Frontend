export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
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
    const { mester_id, needs_efterkalk, id } = req.query;

    if (id) {
      const r = await sbUser(`sager?id=eq.${id}`);
      const data = await r.json();
      return res.json(data[0] || null);
    }

    if (mester_id) {
      let query = `sager?mester_id=eq.${mester_id}&order=updated_at.desc`;

      if (needs_efterkalk === 'true') {
        query = `sager?mester_id=eq.${mester_id}&status=in.(faerdig,igangsat)&order=updated_at.desc`;
      }

      const r = await sbUser(query);
      if (!r.ok) {
        const err = await r.json();
        return res.status(r.status).json({ error: err.message || 'Kunne ikke hente sager' });
      }
      const data = await r.json();
      return res.json({ sager: data });
    }

    return res.status(400).json({ error: 'Mangler mester_id eller id' });
  }

  if (req.method === 'POST') {
    const { mester_id, sagsnavn, kundnavn, opgavetype, adresse, postnummer, kvm, tilbudssum, status, lead_id, chat_historik } = req.body;
    if (!mester_id || !sagsnavn) {
      return res.status(400).json({ error: 'Mangler mester_id eller sagsnavn' });
    }

    const r = await sbUser('sager', {
      method: 'POST',
      body: JSON.stringify({
        mester_id,
        sagsnavn,
        kundnavn: kundnavn || null,
        opgavetype: opgavetype || null,
        adresse: adresse || null,
        postnummer: postnummer || null,
        kvm: kvm || null,
        tilbudssum: tilbudssum || null,
        status: status || 'kladde',
        lead_id: lead_id || null,
        chat_historik: chat_historik || []
      })
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.message || 'Kunne ikke oprette sag' });
    }

    const data = await r.json();
    return res.status(201).json(data[0] || data);
  }

  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Mangler id' });

    const r = await sbUser(`sager?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...req.body, updated_at: new Date().toISOString() })
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.message || 'Kunne ikke opdatere sag' });
    }

    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
