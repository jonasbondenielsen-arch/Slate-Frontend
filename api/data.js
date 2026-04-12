// api/data.js — Consolidated CRUD proxy for all Supabase tables
// Replaces: leads.js, messages.js, sager.js, projects.js, firm.js, standards.js, rules.js
// Usage: /api/data?resource=<name>[&other query params]

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const token = req.headers.authorization?.replace('Bearer ', '') || SUPABASE_KEY;

  const sb = (path, opts = {}) => fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(opts.headers || {})
    },
    ...opts
  });

  const { resource, ...query } = req.query;
  if (!resource) return res.status(400).json({ error: 'Mangler resource' });

  // ── LEADS ──────────────────────────────────────────────────────
  if (resource === 'leads') {
    if (req.method === 'GET') {
      const { id, opgavestiller_id, status } = query;
      if (id) {
        const r = await sb(`leads?id=eq.${id}`);
        const data = await r.json();
        return res.json(data[0] || null);
      }
      if (opgavestiller_id) {
        const r = await sb(`leads?opgavestiller_id=eq.${opgavestiller_id}&order=updated_at.desc`);
        return res.json({ leads: await r.json() });
      }
      if (status) {
        const limitVal = Math.min(parseInt(query.limit) || 50, 100);
        const r = await sb(`leads?status=eq.${status}&order=created_at.desc&limit=${limitVal}`);
        const data = await r.json();
        // ?public=true — strip all contact data for public-facing feed
        if (query.public === 'true') {
          return res.json({ leads: data.map(l => ({
            id: l.id,
            opgavetype: l.opgavetype,
            postnummer: l.postnummer,
            kvm: l.kvm,
            tidsramme: l.tidsramme,
            billeder: Array.isArray(l.billeder) ? l.billeder : [],
            created_at: l.created_at
          })) });
        }
        return res.json({ leads: data });
      }
      return res.status(400).json({ error: 'Mangler id, opgavestiller_id eller status' });
    }
    if (req.method === 'POST') {
      const { opgavestiller_id, opgavetype, beskrivelse, kvm, tidsramme, postnummer, adresse, billeder, navn, telefon, email } = req.body;
      if (!opgavestiller_id || !opgavetype) return res.status(400).json({ error: 'Mangler opgavestiller_id eller opgavetype' });
      const r = await sb('leads', {
        method: 'POST',
        body: JSON.stringify({
          opgavestiller_id, opgavetype,
          beskrivelse: beskrivelse || null, kvm: kvm || null, tidsramme: tidsramme || null,
          postnummer: postnummer || null, adresse: adresse || null,
          billeder: billeder || [], navn: navn || null, telefon: telefon || null,
          email: email || null, status: 'ny'
        })
      });
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message || 'Fejl' }); }
      const data = await r.json();
      return res.status(201).json(data[0] || data);
    }
    if (req.method === 'PATCH') {
      const { id } = query;
      if (!id) return res.status(400).json({ error: 'Mangler id' });
      const r = await sb(`leads?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...req.body, updated_at: new Date().toISOString() })
      });
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message || 'Fejl' }); }
      return res.json({ success: true });
    }
  }

  // ── MESSAGES ───────────────────────────────────────────────────
  if (resource === 'messages') {
    if (req.method === 'GET') {
      const { lead_id, sender_type } = query;
      if (!lead_id) return res.status(400).json({ error: 'Mangler lead_id' });
      const r = await sb(`messages?lead_id=eq.${lead_id}&order=created_at.asc`);
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      const messages = await r.json();
      const unread = sender_type ? messages.filter(m => !m.laest && m.sender_type !== sender_type).length : 0;
      if (sender_type && messages.length > 0) {
        try {
          await sb(`messages?lead_id=eq.${lead_id}&sender_type=neq.${sender_type}&laest=eq.false`, {
            method: 'PATCH', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ laest: true })
          });
        } catch (e) {}
      }
      return res.json({ messages, unread });
    }
    if (req.method === 'POST') {
      const { lead_id, sender_id, sender_type, besked } = req.body;
      if (!lead_id || !sender_id || !sender_type || !besked) return res.status(400).json({ error: 'Mangler felter' });
      const r = await sb('messages', {
        method: 'POST',
        body: JSON.stringify({ lead_id, sender_id, sender_type, besked, laest: false })
      });
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      const data = await r.json();
      try {
        await sb(`leads?id=eq.${lead_id}`, {
          method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ updated_at: new Date().toISOString() })
        });
      } catch (e) {}
      return res.status(201).json(data[0] || data);
    }
  }

  // ── SAGER ──────────────────────────────────────────────────────
  if (resource === 'sager') {
    if (req.method === 'GET') {
      const { id, mester_id, needs_efterkalk } = query;
      if (id) {
        const r = await sb(`sager?id=eq.${id}`);
        const data = await r.json();
        return res.json(data[0] || null);
      }
      if (mester_id) {
        const q = needs_efterkalk === 'true'
          ? `sager?mester_id=eq.${mester_id}&status=in.(faerdig,igangsat)&order=updated_at.desc`
          : `sager?mester_id=eq.${mester_id}&order=updated_at.desc`;
        const r = await sb(q);
        if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
        return res.json({ sager: await r.json() });
      }
      return res.status(400).json({ error: 'Mangler mester_id eller id' });
    }
    if (req.method === 'POST') {
      const { mester_id, sagsnavn } = req.body;
      if (!mester_id || !sagsnavn) return res.status(400).json({ error: 'Mangler mester_id eller sagsnavn' });
      const r = await sb('sager', { method: 'POST', body: JSON.stringify(req.body) });
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      const data = await r.json();
      return res.status(201).json(data[0] || data);
    }
    if (req.method === 'PATCH') {
      const { id } = query;
      if (!id) return res.status(400).json({ error: 'Mangler id' });
      const r = await sb(`sager?id=eq.${id}`, {
        method: 'PATCH', body: JSON.stringify({ ...req.body, updated_at: new Date().toISOString() })
      });
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      return res.json({ success: true });
    }
  }

  // ── PROJECTS ───────────────────────────────────────────────────
  if (resource === 'projects') {
    if (req.method === 'GET') {
      const { id, firm_id } = query;
      if (id) {
        const r = await sb(`projects?id=eq.${id}`);
        const data = await r.json();
        return res.json(data[0] || null);
      }
      if (firm_id) {
        const r = await sb(`projects?firm_id=eq.${firm_id}&order=updated_at.desc`);
        return res.json({ projects: await r.json() });
      }
      return res.status(400).json({ error: 'Mangler firm_id eller id' });
    }
    if (req.method === 'POST') {
      const r = await sb('projects', { method: 'POST', body: JSON.stringify(req.body) });
      const data = await r.json();
      return res.status(201).json(data[0] || data);
    }
    if (req.method === 'PATCH') {
      const { id } = query;
      if (!id) return res.status(400).json({ error: 'Mangler id' });
      await sb(`projects?id=eq.${id}`, {
        method: 'PATCH', body: JSON.stringify({ ...req.body, updated_at: new Date().toISOString() })
      });
      return res.json({ success: true });
    }
  }

  // ── FIRM ───────────────────────────────────────────────────────
  if (resource === 'firm') {
    if (req.method === 'GET') {
      const { user_id, id } = query;
      const q = id ? `firms?id=eq.${id}` : `firms?user_id=eq.${user_id}`;
      const r = await sb(q);
      const data = await r.json();
      return res.json(data[0] || null);
    }
    if (req.method === 'POST') {
      const r = await sb('firms', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ ...req.body, updated_at: new Date().toISOString() })
      });
      const data = await r.json();
      return res.json(data[0] || data);
    }
  }

  // ── STANDARDS ──────────────────────────────────────────────────
  if (resource === 'standards') {
    if (req.method === 'GET') {
      const { firm_id } = query;
      if (!firm_id) return res.status(400).json({ error: 'Mangler firm_id' });
      const r = await sb(`standards?firm_id=eq.${firm_id}&order=type,label`);
      return res.json(await r.json());
    }
    if (req.method === 'POST') {
      const { firm_id, standards } = req.body;
      if (!firm_id || !standards) return res.status(400).json({ error: 'Mangler firm_id eller standards' });
      await sb(`standards?firm_id=eq.${firm_id}`, { method: 'DELETE' });
      const r = await sb('standards', {
        method: 'POST',
        body: JSON.stringify(standards.map(s => ({ ...s, firm_id })))
      });
      return res.json({ success: true, inserted: standards.length });
    }
  }

  // ── RULES ──────────────────────────────────────────────────────
  if (resource === 'rules') {
    if (req.method === 'GET') {
      const { firm_id } = query;
      if (!firm_id) return res.status(400).json({ error: 'Mangler firm_id' });
      const r = await sb(`slate_rules?firm_id=eq.${firm_id}&aktiv=eq.true&order=created_at.desc`);
      return res.json(await r.json());
    }
    if (req.method === 'POST') {
      const r = await sb('slate_rules', { method: 'POST', body: JSON.stringify(req.body) });
      return res.status(201).json(await r.json());
    }
    if (req.method === 'DELETE') {
      const { id } = query;
      if (!id) return res.status(400).json({ error: 'Mangler id' });
      await sb(`slate_rules?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ aktiv: false }) });
      return res.json({ success: true });
    }
  }

  return res.status(400).json({ error: `Ukendt resource: ${resource}` });
}
