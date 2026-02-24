alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '')
  and u.email is not null;

create unique index if not exists profiles_email_unique
  on public.profiles (lower(email));
