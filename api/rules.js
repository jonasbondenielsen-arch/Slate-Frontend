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
    const r = await sb(`slate_rules?firm_id=eq.${firm_id}&aktiv=eq.true&order=created_at.desc`);
    return res.json(await r.json());
  }

  if(req.method==='POST') {
    const r = await sb('slate_rules', {method:'POST', body:JSON.stringify(req.body)});
    return res.status(201).json(await r.json());
  }

  if(req.method==='DELETE') {
    const {id} = req.query;
    if(!id) return res.status(400).json({error:'Mangler id'});
    await sb(`slate_rules?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({aktiv:false})});
    return res.json({success:true});
  }

  return res.status(405).json({error:'Method not allowed'});
}
