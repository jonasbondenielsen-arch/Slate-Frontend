-- Migration 003: Supabase Storage policies for opgave-billeder bucket
-- NOTE: You must first create the bucket manually in Supabase Dashboard:
--   Storage → New bucket → name: "opgave-billeder" → Public: ON
-- Then run this SQL:

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'opgave-billeder',
  'opgave-billeder',
  true,
  5242880,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp'];

-- Allow authenticated users to upload
DO $$ BEGIN
  CREATE POLICY "Authenticated users can upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'opgave-billeder' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow public read
DO $$ BEGIN
  CREATE POLICY "Public read access"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'opgave-billeder');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow owner to delete their own files
DO $$ BEGIN
  CREATE POLICY "Owner can delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'opgave-billeder' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
