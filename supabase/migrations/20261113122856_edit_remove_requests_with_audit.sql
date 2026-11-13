-- Edit requests by their owner or an active administrator, and allow only administrators to archive them.
-- Archiving preserves the request row and all financial, attachment, and audit relationships.
alter table public.travel_requests
  add column if not exists deleted_at timestamptz;

revoke update, delete, truncate on table public.travel_requests from public, anon, authenticated;
grant update (
  os, client_id, contract_id, state, city, origin, job_site_address, manager_name,
  hotel_quote_requested, vehicle_quote_requested, meal_extra_payment,
  taxi_uber_requested, notebook_loan_requested, vacation_status,
  start_date, end_date, updated_at, deleted_at
) on table public.travel_requests to authenticated;

drop policy if exists travel_requests_select_owner_or_admin on public.travel_requests;
create policy travel_requests_select_owner_or_admin
on public.travel_requests for select to authenticated
using (
  (requester_id = (select auth.uid()) and deleted_at is null)
  or is_admin_or_manager()
);

drop policy if exists travel_requests_update_owner_or_admin on public.travel_requests;
create policy travel_requests_update_owner_or_admin
on public.travel_requests for update to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active is true
      and (
        p.role = 'admin'
        or (p.role = 'requester' and p.id = travel_requests.requester_id)
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active is true
      and (
        p.role = 'admin'
        or (
          p.role = 'requester'
          and p.id = travel_requests.requester_id
          and travel_requests.deleted_at is null
        )
      )
  )
);

drop policy if exists request_children_delete_requester_or_admin on public.travel_request_collaborators;
create policy request_children_delete_requester_or_admin
on public.travel_request_collaborators for delete to authenticated
using (
  exists (
    select 1
    from public.travel_requests tr
    join public.profiles p on p.id = (select auth.uid())
    where tr.id = travel_request_collaborators.travel_request_id
      and tr.deleted_at is null
      and p.active is true
      and (
        p.role = 'admin'
        or (p.role = 'requester' and tr.requester_id = p.id)
      )
  )
);

create or replace function public.update_travel_request(
  p_travel_request_id uuid,
  p_os text,
  p_client_id uuid,
  p_contract_id uuid,
  p_state text,
  p_city text,
  p_origin text,
  p_job_site_address text,
  p_manager_name text,
  p_hotel_quote_requested boolean,
  p_vehicle_quote_requested boolean,
  p_meal_extra_payment boolean,
  p_taxi_uber_requested boolean,
  p_notebook_loan_requested boolean,
  p_vacation_status text,
  p_start_date date,
  p_end_date date,
  p_collaborator_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated_id uuid;
  v_collaborator_ids uuid[] := coalesce(p_collaborator_ids, '{}'::uuid[]);
begin
  if nullif(btrim(coalesce(p_os, '')), '') is null then
    raise exception 'Informe o número da OS.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Informe um período de viagem válido.';
  end if;
  if coalesce(p_vacation_status, '') not in ('pending', 'yes', 'no') then
    raise exception 'Previsão de férias inválida.';
  end if;

  if exists (
    select 1
    from unnest(v_collaborator_ids) as requested(id)
    left join public.collaborators c on c.id = requested.id and c.active is true
    where requested.id is not null and c.id is null
  ) then
    raise exception 'A lista contém colaborador inativo ou inexistente.';
  end if;

  update public.travel_requests
  set os = btrim(p_os),
      client_id = p_client_id,
      contract_id = p_contract_id,
      state = nullif(btrim(coalesce(p_state, '')), ''),
      city = nullif(btrim(coalesce(p_city, '')), ''),
      origin = nullif(btrim(coalesce(p_origin, '')), ''),
      job_site_address = nullif(btrim(coalesce(p_job_site_address, '')), ''),
      manager_name = nullif(btrim(coalesce(p_manager_name, '')), ''),
      hotel_quote_requested = coalesce(p_hotel_quote_requested, false),
      vehicle_quote_requested = coalesce(p_vehicle_quote_requested, false),
      meal_extra_payment = coalesce(p_meal_extra_payment, false),
      taxi_uber_requested = coalesce(p_taxi_uber_requested, false),
      notebook_loan_requested = coalesce(p_notebook_loan_requested, false),
      vacation_status = p_vacation_status,
      start_date = p_start_date,
      end_date = p_end_date,
      updated_at = now()
  where id = p_travel_request_id
    and deleted_at is null
  returning id into v_updated_id;

  if v_updated_id is null then
    raise exception 'Solicitação não encontrada ou sem permissão para editar.';
  end if;

  delete from public.travel_request_collaborators trc
  where trc.travel_request_id = p_travel_request_id
    and not (trc.collaborator_id = any(v_collaborator_ids));

  insert into public.travel_request_collaborators (travel_request_id, collaborator_id)
  select p_travel_request_id, requested.id
  from (select distinct unnest(v_collaborator_ids) as id) requested
  where requested.id is not null
  on conflict (travel_request_id, collaborator_id) do nothing;
end;
$$;

revoke all on function public.update_travel_request(uuid, text, uuid, uuid, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, text, date, date, uuid[]) from public, anon;
grant execute on function public.update_travel_request(uuid, text, uuid, uuid, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, text, date, date, uuid[]) to authenticated;

create or replace view public.travel_request_cost_report
with (security_invoker = true)
as
select
  tr.id as travel_request_id,
  tr.os,
  tr.client_id,
  c.name as client_name,
  tr.contract_id,
  ct.code as contract_code,
  ct.name as contract_name,
  tr.state,
  tr.city,
  tr.manager_name,
  tr.start_date,
  tr.end_date,
  tr.days,
  tr.status,
  coalesce(sum(co.amount), 0::numeric) as total_cost,
  count(co.id)::integer as cost_items
from public.travel_requests tr
left join public.clients c on c.id = tr.client_id
left join public.contracts ct on ct.id = tr.contract_id
left join public.costs co on co.travel_request_id = tr.id
where tr.deleted_at is null
group by tr.id, c.name, ct.code, ct.name;
