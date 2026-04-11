export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  const sb = (path, opts = {}) => fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...(opts.headers || {}) },
    ...opts
  });

  const authFetch = (path, opts = {}) => fetch(SUPABASE_URL + '/auth/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });

  const { action } = req.query;

  // POST ?action=signup
  if (req.method === 'POST' && action === 'signup') {
    const { email, password, navn, telefon, user_type } = req.body;
    if (!email || !password || !navn || !user_type) {
      return res.status(400).json({ error: 'Mangler påkrævede felter' });
    }

    const signupRes = await authFetch('signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, data: { navn, user_type } })
    });
    const signupData = await signupRes.json();

    if (!signupRes.ok || !signupData.user) {
      return res.status(signupRes.status).json({ error: signupData.msg || signupData.error_description || 'Signup fejlede' });
    }

    const user = signupData.user;

    // Insert into profiles
    try {
      await sb('profiles', {
        method: 'POST',
        body: JSON.stringify({ id: user.id, user_type, navn, telefon: telefon || null, email })
      });
    } catch (e) {}

    // If haandvaerker, also insert into firms
    if (user_type === 'haandvaerker') {
      try {
        await sb('firms', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify({ user_id: user.id, firmanavn: navn, created_at: new Date().toISOString() })
        });
      } catch (e) {}
    }

    return res.status(201).json({
      user_id: user.id,
      access_token: signupData.access_token,
      refresh_token: signupData.refresh_token,
      user_type,
      navn
    });
  }

  // POST ?action=login
  if (req.method === 'POST' && action === 'login') {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Mangler email eller password' });

    const loginRes = await authFetch('token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    const loginData = await loginRes.json();

    if (!loginRes.ok || !loginData.access_token) {
      return res.status(loginRes.status).json({ error: loginData.error_description || loginData.msg || 'Login fejlede' });
    }

    const user = loginData.user;

    // Fetch profile
    let profile = null;
    try {
      const profileRes = await sb(`profiles?id=eq.${user.id}`);
      const profiles = await profileRes.json();
      profile = profiles[0] || null;
    } catch (e) {}

    // Fetch firm_id if haandvaerker
    let firm_id = null;
    if (profile?.user_type === 'haandvaerker') {
      try {
        const firmRes = await sb(`firms?user_id=eq.${user.id}&select=id&limit=1`);
        const firms = await firmRes.json();
        firm_id = firms[0]?.id || null;
      } catch (e) {}
    }

    return res.json({
      user_id: user.id,
      access_token: loginData.access_token,
      refresh_token: loginData.refresh_token,
      user_type: profile?.user_type || null,
      navn: profile?.navn || null,
      ...(firm_id ? { firm_id } : {})
    });
  }

  // POST ?action=logout
  if (req.method === 'POST' && action === 'logout') {
    const token = req.headers.authorization?.replace('Bearer ', '') || SUPABASE_KEY;
    await authFetch('logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    return res.json({ success: true });
  }

  // POST ?action=refresh
  if (req.method === 'POST' && action === 'refresh') {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'Mangler refresh_token' });

    const refreshRes = await authFetch('token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token })
    });
    const refreshData = await refreshRes.json();

    if (!refreshRes.ok || !refreshData.access_token) {
      return res.status(refreshRes.status).json({ error: refreshData.error_description || 'Refresh fejlede' });
    }

    return res.json({
      access_token: refreshData.access_token,
      refresh_token: refreshData.refresh_token
    });
  }

  // POST ?action=forgot-password
  if (req.method === 'POST' && action === 'forgot-password') {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Mangler email' });

    await authFetch('recover', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    return res.json({ success: true });
  }

  // GET ?action=me
  if (req.method === 'GET' && action === 'me') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Ikke autoriseret' });

    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token }
    });
    const userData = await userRes.json();

    if (!userRes.ok || !userData.id) {
      return res.status(userRes.status).json({ error: 'Kunne ikke hente bruger' });
    }

    // Fetch profile
    let profile = null;
    try {
      const profileRes = await sb(`profiles?id=eq.${userData.id}`);
      const profiles = await profileRes.json();
      profile = profiles[0] || null;
    } catch (e) {}

    // Fetch firm_id if haandvaerker
    let firm_id = null;
    if (profile?.user_type === 'haandvaerker') {
      try {
        const firmRes = await sb(`firms?user_id=eq.${userData.id}&select=id&limit=1`);
        const firms = await firmRes.json();
        firm_id = firms[0]?.id || null;
      } catch (e) {}
    }

    return res.json({
      ...profile,
      user_id: userData.id,
      email: userData.email,
      ...(firm_id ? { firm_id } : {})
    });
  }

  return res.status(400).json({ error: 'Ukendt action' });
}
