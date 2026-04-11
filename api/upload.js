export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const userToken = req.headers.authorization?.replace('Bearer ', '') || SUPABASE_KEY;

  const { data, contentType, name, leadId } = req.body;

  if (!data || !contentType || !name) {
    return res.status(400).json({ error: 'Mangler data, contentType eller name' });
  }

  // Validate file type
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(contentType.toLowerCase())) {
    return res.status(400).json({ error: 'Kun JPG, PNG og WebP er tilladt' });
  }

  // Decode base64
  let buffer;
  try {
    buffer = Buffer.from(data, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'Ugyldig billeddata' });
  }

  // Validate size (max 5MB)
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Billedet er for stort (max 5MB)' });
  }

  // Build safe path
  const ext = contentType.split('/')[1].replace('jpeg', 'jpg');
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '') + '.' + ext;
  const folder = leadId ? String(leadId).replace(/[^a-zA-Z0-9-]/g, '') : 'misc';
  const path = `${folder}/${Date.now()}_${safeName}`;

  // Upload to Supabase Storage
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/opgave-billeder/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + userToken,
      'Content-Type': contentType,
      'x-upsert': 'false',
      'Cache-Control': '3600'
    },
    body: buffer
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error('Storage upload error:', errText);
    return res.status(uploadRes.status).json({ error: 'Upload til storage fejlede' });
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/opgave-billeder/${path}`;
  return res.status(201).json({ url: publicUrl, path });
}
