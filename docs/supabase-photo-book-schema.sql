create table if not exists public.photo_book_projects (
  id text primary key,
  owner_email text not null,
  project_type text not null,
  status text not null,
  start_date date not null,
  end_date date not null,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  payload jsonb not null
);

create index if not exists photo_book_projects_owner_email_idx
  on public.photo_book_projects (owner_email);

create index if not exists photo_book_projects_updated_at_idx
  on public.photo_book_projects (updated_at desc);

create or replace function public.touch_photo_book_project_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_photo_book_project_updated_at on public.photo_book_projects;

create trigger set_photo_book_project_updated_at
before update on public.photo_book_projects
for each row
execute function public.touch_photo_book_project_updated_at();
