-- Pictures on exam questions
--
-- Teachers can attach one image (diagram, map, chart, photo) to a question. The image is uploaded
-- from the browser straight to the public "exam-images" storage bucket and the question keeps its URL.
--
-- 1. exam_questions.image_url holds the public URL of the picture (null when there is none).
-- 2. The "exam-images" bucket is public (students read pictures by URL), accepts PNG / JPG / WEBP / GIF
--    up to 2 MB, and only staff can upload, replace or delete files in it.
-- Re-running is harmless.

alter table public.exam_questions add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-images', 'exam-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exam_images_public_read on storage.objects;
create policy exam_images_public_read
  on storage.objects
  for select
  using (bucket_id = 'exam-images');

drop policy if exists exam_images_staff_insert on storage.objects;
create policy exam_images_staff_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'exam-images' and public.is_staff());

drop policy if exists exam_images_staff_update on storage.objects;
create policy exam_images_staff_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'exam-images' and public.is_staff())
  with check (bucket_id = 'exam-images' and public.is_staff());

drop policy if exists exam_images_staff_delete on storage.objects;
create policy exam_images_staff_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'exam-images' and public.is_staff());
