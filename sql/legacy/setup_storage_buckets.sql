-- 历史相册存储桶与权限脚本。当前页面没有相册上传入口。
-- 保留供追溯，不是当前安装步骤；不要对未知生产策略整段重跑。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery-photos',
  'gallery-photos',
  true,
  8388608, -- 8 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- 2. RLS policies on storage.objects for this bucket
-- -----------------------------------------------------------------------------
-- Supabase enables RLS on storage.objects by default. We need:
--   - PUBLIC READ for the bucket so the website can render <img src=...>.
--   - AUTHENTICATED INSERT, restricted to objects whose first path segment
--     equals the uploader's auth.uid(). This enforces the per-user folder
--     prefix `{user_id}/...` from the client.
--   - AUTHENTICATED UPDATE / DELETE limited to the uploader's own folder, so
--     contributors can replace / remove their own files.
--   - Admins (role in profiles.role) can manage any object in the bucket so
--     the moderation workflow can clean up rejected submissions.
-- -----------------------------------------------------------------------------

-- 2a. Public read --------------------------------------------------------------
drop policy if exists "Gallery photos are publicly readable"
  on storage.objects;

create policy "Gallery photos are publicly readable"
on storage.objects
for select
to public
using (
  bucket_id = 'gallery-photos'
);


-- 2b. Authenticated insert into own folder ------------------------------------
-- `storage.foldername(name)` returns the path segments as a text[]. The first
-- segment must equal the uploading user's UUID.
drop policy if exists "Authenticated users can upload to own gallery folder"
  on storage.objects;

create policy "Authenticated users can upload to own gallery folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'gallery-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);


-- 2c. Authenticated update inside own folder ----------------------------------
drop policy if exists "Authenticated users can update own gallery objects"
  on storage.objects;

create policy "Authenticated users can update own gallery objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'gallery-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'gallery-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);


-- 2d. Authenticated delete inside own folder ----------------------------------
drop policy if exists "Authenticated users can delete own gallery objects"
  on storage.objects;

create policy "Authenticated users can delete own gallery objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'gallery-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);


-- 2e. Admins / super_admins can manage everything in the bucket ---------------
-- This mirrors the `Admins can manage albums` pattern used in
-- `setup_official_content.sql`. If `public.profiles` does not exist yet,
-- inspect the target database before changing these historical policies.
drop policy if exists "Admins can manage gallery objects"
  on storage.objects;

create policy "Admins can manage gallery objects"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'gallery-photos'
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  )
)
with check (
  bucket_id = 'gallery-photos'
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  )
);


-- =============================================================================
-- Done. Verify with:
--   select id, name, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'gallery-photos';
--   select policyname from pg_policies
--     where schemaname = 'storage' and tablename = 'objects'
--       and policyname like '%gallery%';
-- =============================================================================
