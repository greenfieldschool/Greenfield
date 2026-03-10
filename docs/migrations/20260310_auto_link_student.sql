-- Auto-link student user to student record based on email/admission number
-- This function is called when a student logs in and has no student_user_links record
-- It matches the email local part (before @) to the student's admission_number

create or replace function public.auto_link_student_by_email()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_role text;
  v_existing_student_id uuid;
  v_admission_number text;
  v_matched_student_id uuid;
  v_domain text;
  v_at_pos int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return null;
  end if;

  -- Get user's email and role
  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id;

  -- Only process student role
  if v_role is distinct from 'student' then
    return null;
  end if;

  -- Check if already linked
  select sul.student_id into v_existing_student_id
  from public.student_user_links sul
  where sul.user_id = v_user_id;

  if v_existing_student_id is not null then
    return v_existing_student_id;
  end if;

  -- Get user email from auth.users
  select u.email into v_email
  from auth.users u
  where u.id = v_user_id;

  if v_email is null or v_email = '' then
    return null;
  end if;

  -- Extract admission number from email (local part before @)
  v_at_pos := position('@' in v_email);
  if v_at_pos < 2 then
    return null;
  end if;

  v_admission_number := lower(substring(v_email from 1 for v_at_pos - 1));

  -- Find matching student by admission number (case-insensitive)
  select s.id into v_matched_student_id
  from public.students s
  where lower(s.admission_number) = v_admission_number
  limit 1;

  if v_matched_student_id is null then
    return null;
  end if;

  -- Create the link
  insert into public.student_user_links (user_id, student_id)
  values (v_user_id, v_matched_student_id)
  on conflict (user_id) do update set student_id = excluded.student_id;

  return v_matched_student_id;
end;
$$;

grant execute on function public.auto_link_student_by_email() to authenticated;
