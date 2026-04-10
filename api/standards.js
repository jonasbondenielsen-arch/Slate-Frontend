export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const sb = (path, opts={}) => fetch(SUPABASE_URL+'/rest/v1/'+path, {
    headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=representation',...(opts.headers||{})},
    ...opts
  });

  if(req.method==='GET') {
    const {firm_id} = req.query;
    if(!firm_id) return res.status(400).json({error:'Mangler firm_id'});
    const r = await sb(`standards?firm_id=eq.${firm_id}&order=type,label`);
    return res.json(await r.json());
  }

  if(req.method==='POST') {
    // Bulk upsert — slet gamle og indsæt nye
    const {firm_id, standards} = req.body;
    if(!firm_id||!standards) return res.status(400).json({error:'Mangler firm_id eller standards'});
    await sb(`standards?firm_id=eq.${firm_id}`, {method:'DELETE'});
    const inserts = standards.map(s => ({...s, firm_id}));
    const r = await sb('standards', {method:'POST', body:JSON.stringify(inserts)});
    return res.json({success:true, inserted:inserts.length});
  }

  return res.status(405).json({error:'Method not allowed'});
}
