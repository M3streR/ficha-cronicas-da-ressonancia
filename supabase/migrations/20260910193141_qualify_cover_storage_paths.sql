-- Explicit correlation: chronicles also has a column named name.
alter policy chronicle_covers_read on storage.objects
using (bucket_id = 'chronicle-covers' and exists (
  select 1 from public.chronicles c
  where c.id::text = (storage.foldername(storage.objects.name))[2]
    and c.owner_id::text = (storage.foldername(storage.objects.name))[1]
    and (c.cover_path = storage.objects.name or c.owner_id = (select auth.uid()))
));
alter policy chronicle_covers_upload on storage.objects
with check (bucket_id = 'chronicle-covers' and exists (
  select 1 from public.chronicle_cover_cleanup q where q.path = storage.objects.name
    and q.owner_id = (select auth.uid()) and q.not_before > now()
) and exists (
  select 1 from public.chronicles c
  where c.id::text = (storage.foldername(storage.objects.name))[2]
    and c.owner_id = (select auth.uid())
));
