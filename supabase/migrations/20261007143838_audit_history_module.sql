-- Add a durable, append-only history for travel and financial changes.
alter table public.audit_logs
  add column if not exists travel_request_id uuid;

create index if not exists audit_logs_request_created_idx
  on public.audit_logs (travel_request_id, created_at desc);
create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_data jsonb;
  v_new_data jsonb;
  v_entity_id uuid;
  v_request_id uuid;
  v_attachment_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_data := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_data := to_jsonb(new);
  end if;

  -- Keep the audit useful while excluding direct identifiers, OCR text,
  -- private object paths, and credentials from the snapshots.
  if v_old_data is not null then
    v_old_data := v_old_data - array[
      'cpf', 'cnpj', 'tax_id', 'rg', 'birth_date', 'storage_path',
      'extraction_text', 'password', 'password_hash', 'access_token',
      'refresh_token', 'user_metadata', 'secret', 'secret_key',
      'api_key', 'token', 'encryption_key', 'service_role'
    ];
    if jsonb_typeof(v_old_data->'extracted_data') = 'object' then
      v_old_data := jsonb_set(v_old_data, '{extracted_data}',
        (v_old_data->'extracted_data') - array['cpf', 'cnpj', 'tax_id', 'secret', 'api_key', 'token', 'password'], false);
    end if;
  end if;
  if v_new_data is not null then
    v_new_data := v_new_data - array[
      'cpf', 'cnpj', 'tax_id', 'rg', 'birth_date', 'storage_path',
      'extraction_text', 'password', 'password_hash', 'access_token',
      'refresh_token', 'user_metadata', 'secret', 'secret_key',
      'api_key', 'token', 'encryption_key', 'service_role'
    ];
    if jsonb_typeof(v_new_data->'extracted_data') = 'object' then
      v_new_data := jsonb_set(v_new_data, '{extracted_data}',
        (v_new_data->'extracted_data') - array['cpf', 'cnpj', 'tax_id', 'secret', 'api_key', 'token', 'password'], false);
    end if;
  end if;

  v_entity_id := coalesce(
    nullif(v_new_data->>'id', '')::uuid,
    nullif(v_old_data->>'id', '')::uuid,
    nullif(v_new_data->>'travel_request_id', '')::uuid,
    nullif(v_old_data->>'travel_request_id', '')::uuid,
    nullif(v_new_data->>'collaborator_id', '')::uuid,
    nullif(v_old_data->>'collaborator_id', '')::uuid
  );

  v_request_id := coalesce(
    nullif(v_new_data->>'travel_request_id', '')::uuid,
    nullif(v_old_data->>'travel_request_id', '')::uuid
  );
  if tg_table_name = 'travel_requests' then
    v_request_id := coalesce(nullif(v_new_data->>'id', '')::uuid, nullif(v_old_data->>'id', '')::uuid);
  elsif tg_table_name = 'attachment_extraction_reviews' then
    v_attachment_id := coalesce(nullif(v_new_data->>'attachment_id', '')::uuid,
                                nullif(v_old_data->>'attachment_id', '')::uuid);
    select a.travel_request_id into v_request_id
    from public.attachments a where a.id = v_attachment_id;
  end if;

  insert into public.audit_logs (user_id, entity_type, entity_id, action, old_data, new_data, travel_request_id)
  values (
    (select auth.uid()), tg_table_name, v_entity_id, lower(tg_op),
    v_old_data, v_new_data, v_request_id
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.capture_audit_log() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'collaborators', 'clients', 'contracts', 'travel_requests',
    'travel_request_collaborators', 'tickets', 'accommodations', 'vehicles',
    'meals', 'laundry', 'uber_expenses', 'costs', 'attachments',
    'attachment_extraction_reviews', 'reports', 'expenses', 'imports'
  ] loop
    execute format('drop trigger if exists capture_audit_log on public.%I', v_table);
    execute format(
      'create trigger capture_audit_log after insert or update or delete on public.%I for each row execute function private.capture_audit_log()',
      v_table
    );
  end loop;
end;
$$;

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon;
revoke insert, update, delete, truncate, references, trigger on public.audit_logs from authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists audit_select_admin on public.audit_logs;
drop policy if exists audit_select_authorized_history on public.audit_logs;
create policy audit_select_authorized_history on public.audit_logs
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.active is true
        and p.role in ('admin', 'manager')
    ) or exists (
      select 1 from public.travel_requests r
      where r.id = travel_request_id and r.requester_id = (select auth.uid())
    )
  );
