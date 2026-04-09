export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { session_id, bruger_besked, jonas_svar } = req.body;

  try {
    await fetch(process.env.SUPABASE_URL + '/rest/v1/support_knowledge', {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ spoergsmaal: bruger_besked, bedste_svar: jonas_svar, kategori: 'jonas_godkendt', gange_stillet: 1 })
    });

    if (session_id) {
      await fetch(process.env.SUPABASE_URL + `/rest/v1/support_conversations?session_id=eq.${session_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + process.env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ agent_svar: jonas_svar, eskaleret_til_jonas: true })
      });
    }

    return res.status(200).json({ success: true, message: 'Svar gemt som ny laering' });
  } catch(error) {
    return res.status(500).json({ error: error.message });
  }
}
