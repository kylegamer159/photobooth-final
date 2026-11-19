-- Run once in Supabase Dashboard -> SQL Editor.
-- Private gallery bucket "booth". Each user can only touch files in their own folder (<user id>/...).
insert into storage.buckets (id, name, public, file_size_limit)
values ('booth', 'booth', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "booth: read own"   on storage.objects;
drop policy if exists "booth: insert own" on storage.objects;
drop policy if exists "booth: delete own" on storage.objects;

create policy "booth: read own"   on storage.objects for select to authenticated
  using (bucket_id = 'booth' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "booth: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'booth' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "booth: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'booth' and (storage.foldername(name))[1] = auth.uid()::text);
