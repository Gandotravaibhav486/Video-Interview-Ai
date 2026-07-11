-- Storage buckets for recordings, extracted frames, and resumes.
-- Objects are stored under a "<user_id>/..." path prefix; policies restrict
-- access to the owning user via that prefix.

insert into storage.buckets (id, name, public)
values
  ('recordings', 'recordings', false),
  ('frames', 'frames', false),
  ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "users manage their own recordings"
  on storage.objects for all
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users manage their own frames"
  on storage.objects for all
  using (bucket_id = 'frames' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'frames' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users manage their own resumes"
  on storage.objects for all
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
