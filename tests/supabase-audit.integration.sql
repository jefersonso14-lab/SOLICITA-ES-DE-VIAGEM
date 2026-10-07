-- Run against a Supabase project after migrations are applied. All checks are
-- temporary; the transaction is rolled back even if an assertion fails.
begin;

do $$
declare
  v_rls_enabled boolean;
  v_select_policy boolean;
  v_snapshots_isolated boolean;
  v_snapshot_deny_policy boolean;
begin
  select relrowsecurity into v_rls_enabled
  from pg_catalog.pg_class
  where oid = 'public.audit_logs'::regclass;
  if v_rls_enabled is distinct from true then
    raise exception 'audit_logs must have row level security enabled';
  end if;

  select exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ) into v_select_policy;
  if not v_select_policy then
    raise exception 'authenticated history SELECT policy is missing';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs'
      and column_name in ('old_data', 'new_data')
  ) then
    raise exception 'public audit_logs must not contain snapshot values';
  end if;
  if not has_column_privilege('authenticated', 'public.audit_logs', 'changed_fields', 'SELECT') then
    raise exception 'authenticated users must be able to read changed_fields';
  end if;
  select not has_schema_privilege('authenticated', 'private', 'USAGE')
    and not has_table_privilege('authenticated', 'private.audit_snapshots', 'SELECT')
  into v_snapshots_isolated;
  if v_snapshots_isolated is distinct from true then
    raise exception 'authenticated users must not be able to access private snapshots';
  end if;
  select exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'private'
      and tablename = 'audit_snapshots'
      and policyname = 'audit_snapshots_deny_direct_access'
      and cmd = 'ALL'
  ) into v_snapshot_deny_policy;
  if not v_snapshot_deny_policy then
    raise exception 'private snapshots must have an explicit deny-all policy';
  end if;
  if has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
    or has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
    or has_table_privilege('authenticated', 'public.audit_logs', 'DELETE') then
    raise exception 'authenticated users must not be able to mutate audit_logs';
  end if;
  if has_function_privilege('authenticated', 'private.capture_audit_log()', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.audit_changed_fields(jsonb,jsonb)', 'EXECUTE') then
    raise exception 'authenticated users must not be able to execute private audit functions';
  end if;
end;
$$;

create temporary table audit_probe (
  id uuid primary key,
  amount numeric not null,
  description text,
  cpf text,
  password text,
  extracted_data jsonb
);
create trigger capture_audit_probe
after insert or update or delete on audit_probe
for each row execute function private.capture_audit_log();

do $$
declare
  v_probe_id uuid := '00000000-0000-4000-8000-000000000071';
  v_audit_id uuid;
  v_fields text[];
  v_old_data jsonb;
  v_new_data jsonb;
begin
  insert into pg_temp.audit_probe (id, amount, description, cpf, password, extracted_data)
  values (v_probe_id, 25.50, 'Comprovante de teste', 'cpf-falso', 'senha-falsa',
    '{"supplier":"Fornecedor de teste","tax_id":"cnpj-falso"}'::jsonb);
  update pg_temp.audit_probe
  set amount = 40.50, description = 'Comprovante revisado'
  where id = v_probe_id;

  select id, changed_fields into v_audit_id, v_fields
  from public.audit_logs
  where entity_type = 'audit_probe' and entity_id = v_probe_id and action = 'update'
  order by created_at desc limit 1;
  if v_audit_id is null then
    raise exception 'audit trigger did not record the update';
  end if;
  if v_fields is distinct from array['amount', 'description']::text[] then
    raise exception 'unexpected changed fields: %', v_fields;
  end if;

  select old_data, new_data into v_old_data, v_new_data
  from private.audit_snapshots where audit_log_id = v_audit_id;
  if (v_old_data ->> 'amount')::numeric is distinct from 25.50
    or (v_new_data ->> 'amount')::numeric is distinct from 40.50 then
    raise exception 'private snapshots did not retain the before/after values';
  end if;
  if v_old_data ? 'cpf' or v_new_data ? 'cpf'
    or v_old_data ? 'password' or v_new_data ? 'password'
    or (v_new_data -> 'extracted_data') ? 'tax_id' then
    raise exception 'private snapshots retained a sensitive field';
  end if;
end;
$$;

-- Exercise the financial boundary: an extracted document starts without a
-- cost, a requester cannot confirm it, and a manager can confirm it once.
insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000000072'),
  ('00000000-0000-4000-8000-000000000073');
insert into public.profiles (id, full_name, role, active)
values
  ('00000000-0000-4000-8000-000000000072', 'Manager de integração', 'manager', true),
  ('00000000-0000-4000-8000-000000000073', 'Solicitante de integração', 'requester', true);
insert into public.travel_requests (id, os, requester_id, start_date, end_date)
values (
  '00000000-0000-4000-8000-000000000074',
  'TEST-AUDIT-20261007-1',
  '00000000-0000-4000-8000-000000000073',
  date '2026-10-07', date '2026-10-08'
);
insert into public.attachments (
  id, travel_request_id, file_name, storage_path, mime_type, file_size,
  extraction_status, extracted_data, uploaded_by
)
values (
  '00000000-0000-4000-8000-000000000075',
  '00000000-0000-4000-8000-000000000074',
  'integration-test.pdf', 'integration-test/integration-test.pdf',
  'application/pdf', 123, 'extracted',
  '{"amount":100,"category":"hotel","supplier":"Hotel de teste"}'::jsonb,
  '00000000-0000-4000-8000-000000000073'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000073';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000073","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v_denied boolean := false;
begin
  begin
    perform public.confirm_attachment_cost(
      '00000000-0000-4000-8000-000000000075',
      '{"amount":125.75,"category":"hotel","supplier":"Hotel teste","document_number":"NF-TESTE"}'::jsonb
    );
  exception when others then
    if sqlerrm not like 'Somente gestores%' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'requester unexpectedly confirmed a financial cost';
  end if;
end;
$$;
reset role;

create temporary table confirmation_results (first_cost_id uuid, repeated_cost_id uuid);
grant insert on confirmation_results to authenticated;
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000072';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000072","role":"authenticated"}';
set local role authenticated;
do $$
declare
  v_first uuid;
  v_repeated uuid;
begin
  v_first := public.confirm_attachment_cost(
    '00000000-0000-4000-8000-000000000075',
    '{"amount":125.75,"date":"2026-10-07","category":"hotel","supplier":"Hotel teste","document_number":"NF-TESTE"}'::jsonb
  );
  v_repeated := public.confirm_attachment_cost(
    '00000000-0000-4000-8000-000000000075',
    '{"amount":125.75,"date":"2026-10-07","category":"hotel","supplier":"Hotel teste","document_number":"NF-TESTE"}'::jsonb
  );
  insert into pg_temp.confirmation_results values (v_first, v_repeated);
end;
$$;
reset role;

do $$
declare
  v_cost_id uuid;
  v_repeated_cost_id uuid;
  v_attachment public.attachments%rowtype;
begin
  select first_cost_id, repeated_cost_id into v_cost_id, v_repeated_cost_id
  from pg_temp.confirmation_results;
  if v_cost_id is null or v_cost_id is distinct from v_repeated_cost_id then
    raise exception 'confirmation is not idempotent';
  end if;
  if (select count(*) from public.costs
      where travel_request_id = '00000000-0000-4000-8000-000000000074'
        and source = 'attachment') <> 1 then
    raise exception 'confirmation must create exactly one linked cost';
  end if;
  if not exists (
    select 1 from public.costs
    where id = v_cost_id
      and travel_request_id = '00000000-0000-4000-8000-000000000074'
      and amount = 125.75 and category = 'hotel'
      and cost_date = date '2026-10-07' and source = 'attachment'
  ) then
    raise exception 'confirmed cost fields or OS linkage are incorrect';
  end if;
  select * into v_attachment from public.attachments
  where id = '00000000-0000-4000-8000-000000000075';
  if v_attachment.extraction_status <> 'confirmed'
    or v_attachment.cost_id is distinct from v_cost_id
    or v_attachment.reviewed_by is distinct from '00000000-0000-4000-8000-000000000072'::uuid
    or v_attachment.reviewed_at is null then
    raise exception 'confirmed cost is not linked and attributed on the attachment';
  end if;
  if (select count(*) from public.attachment_extraction_reviews
      where attachment_id = v_attachment.id and reviewer_id = '00000000-0000-4000-8000-000000000072'
        and action = 'corrected' and cost_id = v_cost_id) <> 1 then
    raise exception 'the corrected review event was not recorded exactly once';
  end if;
end;
$$;

rollback;
