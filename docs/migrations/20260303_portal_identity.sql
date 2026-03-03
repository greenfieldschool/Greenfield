create or replace function public.portal_identity()
returns table (
  role text,
  student_id uuid,
  guardian_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select p.role from public.profiles p where p.id = auth.uid() limit 1) as role,
    (select sul.student_id from public.student_user_links sul where sul.user_id = auth.uid() limit 1) as student_id,
    (select gul.guardian_id from public.guardian_user_links gul where gul.user_id = auth.uid() limit 1) as guardian_id;
$$;

grant execute on function public.portal_identity() to authenticated;
