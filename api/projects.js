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
    const {firm_id, id} = req.query;
    if(id) {
      const r = await sb(`projects?id=eq.${id}`);
      const data = await r.json();
      return res.json(data[0]||null);
    }
    if(firm_id) {
      const r = await sb(`projects?firm_id=eq.${firm_id}&order=updated_at.desc`);
      return res.json({projects: await r.json()});
    }
    return res.status(400).json({error:'Mangler firm_id'});
  }

  if(req.method==='POST') {
    const r = await sb('projects', {method:'POST', body:JSON.stringify(req.body)});
    const data = await r.json();
    return res.status(201).json(data[0]||data);
  }

  if(req.method==='PATCH') {
    const {id} = req.query;
    if(!id) return res.status(400).json({error:'Mangler id'});
    const r = await sb(`projects?id=eq.${id}`, {method:'PATCH', body:JSON.stringify({...req.body, updated_at:'now()'})});
    return res.json({success:true});
  }

  return res.status(405).json({error:'Method not allowed'});
}
