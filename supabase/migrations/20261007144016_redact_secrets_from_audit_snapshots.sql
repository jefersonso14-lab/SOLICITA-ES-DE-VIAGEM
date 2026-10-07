-- Keep private values and credentials out of the JSON snapshots.
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
