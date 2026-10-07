-- Keep full audit snapshots outside the exposed public schema. The history API
-- only needs the changed field names, not previous field values.
alter table public.audit_logs
  add column if not exists changed_fields text[] not null default '{}';

create table if not exists private.audit_snapshots (
  audit_log_id uuid primary key references public.audit_logs(id) on delete cascade,
  old_data jsonb,
  new_data jsonb
);
alter table private.audit_snapshots enable row level security;
revoke all on private.audit_snapshots from public, anon, authenticated;

create or replace function private.audit_changed_fields(old_snapshot jsonb, new_snapshot jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(field.key order by field.key), array[]::text[])
  from (
    select key from pg_catalog.jsonb_object_keys(coalesce(old_snapshot, '{}'::jsonb)) as key
    union
    select key from pg_catalog.jsonb_object_keys(coalesce(new_snapshot, '{}'::jsonb)) as key
  ) as field
  where field.key not in (
    'id', 'created_at', 'updated_at', 'user_id', 'uploaded_by', 'reviewed_by',
    'created_by', 'storage_path', 'extraction_text'
  )
    and old_snapshot -> field.key is distinct from new_snapshot -> field.key;
$$;

revoke all on function private.audit_changed_fields(jsonb, jsonb) from public, anon, authenticated;

update public.audit_logs as log
set changed_fields = private.audit_changed_fields(log.old_data, log.new_data);

insert into private.audit_snapshots (audit_log_id, old_data, new_data)
select id, old_data, new_data
from public.audit_logs
where old_data is not null or new_data is not null
on conflict (audit_log_id) do nothing;

alter table public.audit_logs
  drop column if exists old_data,
  drop column if exists new_data;

create or replace function private.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_data jsonb;
  v_new_data jsonb;
  v_changed_fields text[];
  v_entity_id uuid;
  v_request_id uuid;
  v_attachment_id uuid;
  v_audit_log_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_data := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_data := to_jsonb(new);
  end if;

  if v_old_data is not null then
    v_old_data := v_old_data - array[
      'cpf', 'cnpj', 'tax_id', 'rg', 'birth_date', 'storage_path',
      'extraction_text', 'password', 'password_hash', 'access_token',
      'refresh_token', 'user_metadata', 'secret', 'secret_key',
      'api_key', 'token', 'encryption_key', 'service_role'
    ];
    if pg_catalog.jsonb_typeof(v_old_data->'extracted_data') = 'object' then
      v_old_data := pg_catalog.jsonb_set(v_old_data, '{extracted_data}',
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
    if pg_catalog.jsonb_typeof(v_new_data->'extracted_data') = 'object' then
      v_new_data := pg_catalog.jsonb_set(v_new_data, '{extracted_data}',
        (v_new_data->'extracted_data') - array['cpf', 'cnpj', 'tax_id', 'secret', 'api_key', 'token', 'password'], false);
    end if;
  end if;

  v_changed_fields := private.audit_changed_fields(v_old_data, v_new_data);
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
    select attachment.travel_request_id into v_request_id
    from public.attachments as attachment where attachment.id = v_attachment_id;
  end if;

  insert into public.audit_logs (
    user_id, entity_type, entity_id, action,
    travel_request_id, changed_fields
  )
  values (
    (select auth.uid()), tg_table_name, v_entity_id, pg_catalog.lower(tg_op),
    v_request_id, v_changed_fields
  ) returning id into v_audit_log_id;

  insert into private.audit_snapshots (audit_log_id, old_data, new_data)
  values (v_audit_log_id, v_old_data, v_new_data);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.capture_audit_log() from public, anon, authenticated;
