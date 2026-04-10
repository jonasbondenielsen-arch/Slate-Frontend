export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const sb = (path, opts={}) => fetch(SUPABASE_URL+'/rest/v1/'+path, {
    headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation',...(opts.headers||{})},
    ...opts
  });

  if(req.method==='GET') {
    const {user_id, id} = req.query;
    const query = id ? `firms?id=eq.${id}` : `firms?user_id=eq.${user_id}`;
    const r = await sb(query);
    const data = await r.json();
    return res.json(data[0]||null);
  }

  if(req.method==='POST') {
    // Upsert baseret på user_id
    const r = await sb('firms', {
      method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify({...req.body, updated_at:new Date().toISOString()})
    });
    const data = await r.json();
    return res.json(data[0]||data);
  }

  return res.status(405).json({error:'Method not allowed'});
}
