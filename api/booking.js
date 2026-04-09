export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const {navn,telefon,virksomhed,tidspunkt}=req.body;
  if(!navn||!telefon||!virksomhed)return res.status(400).json({error:'Mangler felter'});

  const SUPABASE_URL=process.env.SUPABASE_URL;
  const SUPABASE_KEY=process.env.SUPABASE_ANON_KEY;
  const TELEGRAM_TOKEN=process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT=process.env.TELEGRAM_CHAT_ID;

  // Gem i Supabase slate_leads
  try{
    await fetch(SUPABASE_URL+'/rest/v1/slate_leads',{
      method:'POST',
      headers:{
        'apikey':SUPABASE_KEY,
        'Authorization':'Bearer '+SUPABASE_KEY,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({navn,virksomhed,kontakt:telefon,status:'varm',noter:'Tidspunkt: '+tidspunkt+'. Kom fra: Booking knap paa forsiden'})
    });
  }catch(e){}

  // Send Telegram notifikation
  try{
    await fetch('https://api.telegram.org/bot'+TELEGRAM_TOKEN+'/sendMessage',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        chat_id:TELEGRAM_CHAT,
        text:'Ny lead - Ring op nu!\n\nNavn: '+navn+'\nTelefon: '+telefon+'\nVirksomhed: '+virksomhed+'\nBedste tidspunkt: '+tidspunkt+'\nKom fra: Booking knap paa forsiden'
      })
    });
  }catch(e){}

  return res.status(200).json({success:true});
}
