export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, session_id } = req.body;
  if (!messages || !session_id) return res.status(400).json({ error: 'Mangler messages eller session_id' });

  // Hent knowledge base
  let knowledgeText = '';
  try {
    const kbRes = await fetch(
      process.env.SUPABASE_URL + '/rest/v1/support_knowledge?select=spoergsmaal,bedste_svar&order=gange_stillet.desc&limit=20',
      { headers: { 'apikey': process.env.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + process.env.SUPABASE_ANON_KEY } }
    );
    const kb = await kbRes.json();
    if (Array.isArray(kb) && kb.length > 0) {
      knowledgeText = kb.map(k => `Spoergsmaal: ${k.spoergsmaal}\nSvar: ${k.bedste_svar}`).join('\n\n');
    }
  } catch(e) {}

  const systemPrompt = `Du er Slate Support — en hjaelpsom AI-assistent paa slate.nu.
Du hjaelper potentielle kunder med at forstaa Slate og booke en demo.

HVAD DU VED OM SLATE:
Slate er et AI-drevet kalkulationsvaerktoj til danske haandvaerkere med 2-15 ansatte.
Mesteren skriver til en chat paa sin telefon paa sit eget sprog.
Systemet returnerer et praecist tilbudsestimat baseret paa hans egne historiske sager.
Under 2 minutter. Ingen kursus. Ingen computer. Ingen opla:ring.

PRISER:
Opsaetning: 4.995 kr. ex. moms — engangsbetaling
Maanedligt: 1.495 kr. ex. moms — ingen binding
Aarlig: 17.940 kr. — opsaetning gratis
Garanti: sparer ikke tid paa foerste tilbud = betaler ikke en krone

ONBOARDING:
Vi saetter alt op paa 45 minutter. Du goer ingenting paa forhaand.
Foerste tilbud kan laves samme dag.

VIRKER FOR: VVS, el, toemrer, maler, murer, tagdaekning og alle andre fag.

${knowledgeText ? 'KNOWLEDGE BASE:\n' + knowledgeText : ''}

REGLER:
- Svar ALTID paa dansk
- Max 3 saetninger per svar — vaer kortfattet
- Vaer direkte og konkret som en kollega
- Naevn altid garantien naar der spoerges om pris
- Hvis kunden vil booke: send dem til booking-knappen paa siden
- Hvis du ikke kan svare: bed om navn og telefonnummer saa vi kan ringe op`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        system: systemPrompt,
        messages: messages.slice(-10)
      })
    });

    const aiData = await aiRes.json();
    if (!aiData.content || !aiData.content[0]) {
      return res.status(500).json({ error: 'AI fejl', details: aiData });
    }
    const agentSvar = aiData.content[0].text;

    // Gem samtale i Supabase
    try {
      await fetch(process.env.SUPABASE_URL + '/rest/v1/support_conversations', {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + process.env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id,
          bruger_besked: messages[messages.length - 1].content,
          agent_svar: agentSvar,
          eskaleret_til_jonas: false
        })
      });
    } catch(e) {}

    // Eskaler til Jonas via Telegram hvis agenten ikke kan svare
    const kanIkkeBesvare = agentSvar.toLowerCase().includes('telefonnummer') ||
                           agentSvar.toLowerCase().includes('ringer dig op') ||
                           agentSvar.toLowerCase().includes('kontakt os');
    if (kanIkkeBesvare && process.env.TELEGRAM_BOT_TOKEN) {
      try {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: `⚠️ CHAT — Kræver dit svar\n\nKunde spurgte: "${messages[messages.length - 1].content}"\n\nAgent svar: "${agentSvar}"\n\nSession: ${session_id}`
          })
        });
      } catch(e) {}
    }

    return res.status(200).json({ response: agentSvar });
  } catch (error) {
    return res.status(500).json({ error: 'Intern fejl: ' + error.message });
  }
}
