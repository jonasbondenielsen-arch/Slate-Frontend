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
    const { opgavestiller_id, status, id } = req.query;

    if (id) {
      const r = await sbUser(`leads?id=eq.${id}`);
      const data = await r.json();
      return res.json(data[0] || null);
    }

    if (opgavestiller_id) {
      const r = await sbUser(`leads?opgavestiller_id=eq.${opgavestiller_id}&order=updated_at.desc`);
      const data = await r.json();
      return res.json({ leads: data });
    }

    if (status) {
      const r = await sbUser(`leads?status=eq.${status}&order=created_at.desc`);
      const data = await r.json();
      return res.json({ leads: data });
    }

    return res.status(400).json({ error: 'Mangler opgavestiller_id, status eller id' });
  }

  if (req.method === 'POST') {
    const { opgavestiller_id, opgavetype, beskrivelse, kvm, tidsramme, postnummer, adresse, billeder, navn, telefon, email } = req.body;
    if (!opgavestiller_id || !opgavetype) {
      return res.status(400).json({ error: 'Mangler opgavestiller_id eller opgavetype' });
    }

    const r = await sbUser('leads', {
      method: 'POST',
      body: JSON.stringify({
        opgavestiller_id,
        opgavetype,
        beskrivelse: beskrivelse || null,
        kvm: kvm || null,
        tidsramme: tidsramme || null,
        postnummer: postnummer || null,
        adresse: adresse || null,
        billeder: billeder || [],
        navn: navn || null,
        telefon: telefon || null,
        email: email || null,
        status: 'ny'
      })
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.message || 'Kunne ikke oprette lead' });
    }

    const data = await r.json();
    return res.status(201).json(data[0] || data);
  }

  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Mangler id' });

    const r = await sbUser(`leads?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...req.body, updated_at: new Date().toISOString() })
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.message || 'Kunne ikke opdatere lead' });
    }

    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
