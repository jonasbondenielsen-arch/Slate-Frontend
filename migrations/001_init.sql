-- Run this in Supabase SQL Editor

-- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users(id) PRIMARY KEY,
  user_type text NOT NULL,
  navn text,
  firma text,
  telefon text,
  email text,
  postnummer text,
  adresse text,
  fag text[],
  cvr text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "profiles_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY IF NOT EXISTS "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY IF NOT EXISTS "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- LEADS
CREATE TABLE IF NOT EXISTS leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  opgavestiller_id uuid REFERENCES profiles(id),
  opgavetype text NOT NULL,
  beskrivelse text,
  kvm numeric,
  tidsramme text,
  postnummer text,
  adresse text,
  billeder jsonb DEFAULT '[]',
  status text DEFAULT 'ny',
  matchet_mester_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "leads_opgavestiller" ON leads FOR SELECT USING (auth.uid() = opgavestiller_id);
CREATE POLICY IF NOT EXISTS "leads_haandvaerker" ON leads FOR SELECT USING (status = 'ny' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'haandvaerker'));
CREATE POLICY IF NOT EXISTS "leads_insert" ON leads FOR INSERT WITH CHECK (auth.uid() = opgavestiller_id);
CREATE POLICY IF NOT EXISTS "leads_update" ON leads FOR UPDATE USING (auth.uid() = opgavestiller_id OR auth.uid() = matchet_mester_id);

-- SAGER
CREATE TABLE IF NOT EXISTS sager (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mester_id uuid REFERENCES profiles(id) NOT NULL,
  lead_id uuid REFERENCES leads(id),
  sagsnavn text NOT NULL,
  kundnavn text,
  opgavetype text,
  adresse text,
  postnummer text,
  kvm numeric,
  tilbudssum numeric,
  status text DEFAULT 'kladde',
  chat_historik jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sager ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "sager_mester" ON sager FOR ALL USING (auth.uid() = mester_id);

-- MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid REFERENCES leads(id) NOT NULL,
  sender_id uuid REFERENCES profiles(id) NOT NULL,
  sender_type text NOT NULL,
  besked text NOT NULL,
  laest boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "messages_parter" ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM leads WHERE leads.id = messages.lead_id AND (leads.opgavestiller_id = auth.uid() OR leads.matchet_mester_id = auth.uid()))
);
CREATE POLICY IF NOT EXISTS "messages_insert" ON messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY IF NOT EXISTS "messages_update" ON messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM leads WHERE leads.id = messages.lead_id AND (leads.opgavestiller_id = auth.uid() OR leads.matchet_mester_id = auth.uid()))
);
