-- Store profile images outside Auth user_metadata. Auth metadata is embedded
-- in the JWT and therefore sent in the request cookie on every request.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS profile_avatars_insert ON storage.objects;
CREATE POLICY profile_avatars_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
  );

DROP POLICY IF EXISTS profile_avatars_select ON storage.objects;
CREATE POLICY profile_avatars_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
  );

DROP POLICY IF EXISTS profile_avatars_update ON storage.objects;
CREATE POLICY profile_avatars_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
  );

DROP POLICY IF EXISTS profile_avatars_delete ON storage.objects;
CREATE POLICY profile_avatars_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
  );
