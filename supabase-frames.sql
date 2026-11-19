-- Run once in Supabase Dashboard -> SQL Editor.
-- Private bucket for each user's uploaded frames (image + photo-spot data). Each user can only touch files in their own folder (<user id>/...).
insert into storage.buckets (id, name, public, file_size_limit)
values ('frames', 'frames', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "frames: read own"   on storage.objects;
drop policy if exists "frames: insert own" on storage.objects;
drop policy if exists "frames: update own" on storage.objects;
drop policy if exists "frames: delete own" on storage.objects;

create policy "frames: read own"   on storage.objects for select to authenticated
  using (bucket_id = 'frames' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "frames: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'frames' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "frames: update own" on storage.objects for update to authenticated
  using (bucket_id = 'frames' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'frames' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "frames: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'frames' and (storage.foldername(name))[1] = auth.uid()::text);
