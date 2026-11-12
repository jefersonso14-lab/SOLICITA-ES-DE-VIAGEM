-- Let active signed-in staff add catalog entries from a travel request.
-- RLS keeps writes limited to active profiles; there are no requester update/delete policies.
alter table public.clients enable row level security;
alter table public.contracts enable row level security;

grant insert on public.clients, public.contracts to authenticated;

create unique index if not exists clients_active_normalized_name_uidx
  on public.clients (lower(btrim(name)))
  where active;

create unique index if not exists contracts_active_client_normalized_name_uidx
  on public.contracts (coalesce(client_id::text, ''), lower(btrim(name)))
  where active;

drop policy if exists clients_insert_active_users on public.clients;
create policy clients_insert_active_users
  on public.clients for insert to authenticated
  with check (exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and p.role in ('requester', 'manager', 'admin')
  ));

drop policy if exists contracts_insert_active_users on public.contracts;
create policy contracts_insert_active_users
  on public.contracts for insert to authenticated
  with check (exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and p.role in ('requester', 'manager', 'admin')
  ));

