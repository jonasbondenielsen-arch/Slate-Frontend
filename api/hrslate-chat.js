export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const {messages, session_id, firm_id, project_id, mode} = req.body;
  if(!messages||!session_id) return res.status(400).json({error:'Mangler messages eller session_id'});

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const sb = (path, opts={}) => fetch(SUPABASE_URL+'/rest/v1/'+path, {
    headers: {'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json',...(opts.headers||{})},
    ...opts
  });

  const userMsg = messages[messages.length-1].content.toLowerCase();

  // === NIVEAU 1: SIMPLE KOMMANDOER (ingen AI) ===
  const simpleCommands = [
    {match: /vis (alle )?sager|mine sager/i, action: 'list_projects'},
    {match: /gem som kladde/i, action: 'save_draft'},
    {match: /vis (mine )?regler/i, action: 'list_rules'},
    {match: /vis (mine )?takster|mine priser/i, action: 'list_standards'},
  ];

  for(const cmd of simpleCommands) {
    if(cmd.match.test(userMsg)) {
      if(cmd.action === 'list_projects' && firm_id) {
        const r = await sb(`projects?firm_id=eq.${firm_id}&order=created_at.desc&limit=10`);
        const projects = await r.json();
        if(projects.length === 0) return res.json({response:'Du har ingen sager endnu, mester. Skriv hvad du skal tilbyde — så opretter jeg den første sag.', type:'text'});
        const liste = projects.map(p=>`• ${p.sagsnavn} — ${p.tilbud_total ? Math.round(p.tilbud_total).toLocaleString('da-DK')+' kr' : 'ingen pris'} (${p.status})`).join('\n');
        return res.json({response:`Her er dine ${projects.length} seneste sager:\n\n${liste}`, type:'text'});
      }
      if(cmd.action === 'list_rules' && firm_id) {
        const r = await sb(`slate_rules?firm_id=eq.${firm_id}&aktiv=eq.true`);
        const rules = await r.json();
        if(rules.length === 0) return res.json({response:'Du har ingen aktive regler endnu. Jeg opretter regler automatisk når vi finder mønstre i dine sager.', type:'text'});
        const liste = rules.map(r=>`• ${r.titel}: ${r.vaerdi} (gælder: ${(r.gaelder_for||['alle']).join(', ')})`).join('\n');
        return res.json({response:`Dine aktive regler:\n\n${liste}`, type:'text'});
      }
      if(cmd.action === 'list_standards' && firm_id) {
        const r = await sb(`standards?firm_id=eq.${firm_id}&order=type`);
        const standards = await r.json();
        if(standards.length === 0) return res.json({response:'Du har ikke sat takster op endnu. Gå til Indstillinger → Standardpriser.', type:'text'});
        const liste = standards.map(s=>`• ${s.label}: ${s.vaerdi} ${s.enhed||''}`).join('\n');
        return res.json({response:`Dine takster:\n\n${liste}`, type:'text'});
      }
    }
  }

  // === HENT KONTEKST TIL CLAUDE ===
  let firmaKontekst = '';
  let sagsKontekst = '';
  let reglerKontekst = '';
  let historikKontekst = '';

  if(firm_id) {
    // Firma info
    try {
      const r = await sb(`firms?id=eq.${firm_id}`);
      const firms = await r.json();
      if(firms[0]) {
        const f = firms[0];
        firmaKontekst = `Firma: ${f.firmanavn||'Ukendt'}, Fag: ${(f.fag||[]).join(', ')||'Ukendt'}, Ansatte: ${f.antal_ansatte||'Ukendt'}`;
      }
    } catch(e) {}

    // Aktive regler
    try {
      const r = await sb(`slate_rules?firm_id=eq.${firm_id}&aktiv=eq.true`);
      const rules = await r.json();
      if(rules.length) reglerKontekst = 'Aktive regler:\n'+rules.map(r=>`- ${r.titel}: ${r.vaerdi}`).join('\n');
    } catch(e) {}

    // Takster
    try {
      const r = await sb(`standards?firm_id=eq.${firm_id}`);
      const stds = await r.json();
      if(stds.length) reglerKontekst += '\n\nTakster:\n'+stds.map(s=>`- ${s.label}: ${s.vaerdi} ${s.enhed||''}`).join('\n');
    } catch(e) {}

    // Historik (mønster-cache)
    try {
      const r = await sb(`pattern_cache?firm_id=eq.${firm_id}&order=updated_at.desc&limit=10`);
      const patterns = await r.json();
      if(patterns.length) historikKontekst = 'Historiske mønstre:\n'+patterns.map(p=>`- ${p.sags_type}: ${p.type} = ${p.vaerdi} (baseret på ${p.baseret_paa_sager} sager)`).join('\n');
    } catch(e) {}
  }

  // Aktuel sag
  if(project_id) {
    try {
      const r = await sb(`projects?id=eq.${project_id}`);
      const projects = await r.json();
      if(projects[0]) {
        const p = projects[0];
        sagsKontekst = `Aktuel sag: ${p.sagsnavn}, Kunde: ${p.kunde_navn||'Ukendt'}, Type: ${p.type||'Ukendt'}, Kvm: ${p.kvm||'Ukendt'}, Status: ${p.status}, Tilbud: ${p.tilbud_total ? Math.round(p.tilbud_total).toLocaleString('da-DK')+' kr' : 'ikke sat'}`;
      }
      // Tilbudsposter
      const r2 = await sb(`quote_items?project_id=eq.${project_id}`);
      const items = await r2.json();
      if(items.length) sagsKontekst += '\n\nTilbudsposter:\n'+items.map(i=>`- ${i.kategori}: ${i.beskrivelse||''} — ${Math.round(i.total).toLocaleString('da-DK')} kr`).join('\n');
    } catch(e) {}
  }

  // === NIVEAU 3: CLAUDE SONNET ===
  const systemPrompt = `Du er Hr. Slate — en AI-assistent til danske håndværksmestre.

DIN PERSONLIGHED:
- Kalder altid brugeren "mester"
- Jordnær, direkte, ingen buzzwords
- Humoristisk når passende (aldrig under alvorlige tal)
- Loyal — altid på mesterens side
- Analytisk — underbygger forslag med konkrete tal
- Sproget er dansk og muntert — som en skarp kollega

HVAD DU KAN:
- Oprette og beregne tilbud baseret på mesterens beskrivelse
- Køre efterkalkulationer og sammenligne med tilbud
- Finde mønstre på tværs af sager og foreslå regler
- Advare hvis DG falder under mål (standard 35%)
- Registrere kvitteringer og materialer på sager
- Huske mesterens regler og anvende dem proaktivt

${firmaKontekst ? 'FIRMA:\n'+firmaKontekst+'\n' : ''}
${sagsKontekst ? '\nAKTUEL SAG:\n'+sagsKontekst+'\n' : ''}
${reglerKontekst ? '\n'+reglerKontekst+'\n' : ''}
${historikKontekst ? '\n'+historikKontekst+'\n' : ''}

VIGTIGE REGLER:
- Svar ALTID på dansk
- Vær kortfattet — max 4-5 sætninger medmindre du viser en oversigt
- Brug konkrete tal og kroner — aldrig vage beskrivelser
- Hvis du mangler info — stil ét klart spørgsmål, ikke fem
- DG-beregning: (pris - materialer - løn) / pris × 100
- Standard DG-mål: 35% — advar hvis under
- Når tilbud er klar — spørg: "Gem som kladde eller send til kunden?"
- Godkendte regler starter med: "Forstået — jeg gemmer det som en regel"`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({
        model:'claude-sonnet-4-5',
        max_tokens:800,
        system: systemPrompt,
        messages: messages.slice(-12)
      })
    });

    const aiData = await aiRes.json();
    if(!aiData.content?.[0]) return res.status(500).json({error:'AI fejl', details: aiData});
    const svar = aiData.content[0].text;

    // Gem besked i chat_messages hvis project_id
    if(project_id && firm_id) {
      try {
        await sb('chat_messages', {
          method:'POST',
          body: JSON.stringify({
            project_id, firm_id, session_id,
            role:'user', content: messages[messages.length-1].content
          })
        });
        await sb('chat_messages', {
          method:'POST',
          body: JSON.stringify({project_id, firm_id, session_id, role:'assistant', content:svar})
        });
      } catch(e) {}
    }

    return res.status(200).json({response: svar, type:'text'});
  } catch(err) {
    return res.status(500).json({error:'Intern fejl: '+err.message});
  }
}
