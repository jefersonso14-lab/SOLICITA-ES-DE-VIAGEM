-- Extend the existing private travel-attachments bucket and attachments.cost_id link.
alter table public.attachments
  add column if not exists extraction_text text,
  add column if not exists extraction_method text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

-- The existing bucket and Storage RLS policies already bind uploads to auth.uid()
-- or active managers. Preserve those policies and tighten the bucket's limits.
update storage.buckets set public = false, file_size_limit = 15728640,
  allowed_mime_types = array[
    'application/pdf','application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv','image/jpeg','image/png'
  ] where id = 'travel-attachments';

create table if not exists public.attachment_extraction_reviews (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references public.attachments(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  extracted_data jsonb not null,
  action text not null check (action in ('confirmed', 'corrected', 'rejected')),
  cost_id uuid references public.costs(id) on delete set null
);
alter table public.attachment_extraction_reviews enable row level security;
revoke all on public.attachment_extraction_reviews from anon;
grant select, insert on public.attachment_extraction_reviews to authenticated;

create policy "review readers can see request reviews" on public.attachment_extraction_reviews
  for select to authenticated using (
    exists (
      select 1 from public.attachments a
      join public.travel_requests r on r.id = a.travel_request_id
      where a.id = attachment_id and (
        r.requester_id = (select auth.uid()) or exists (
          select 1 from public.profiles p where p.id = (select auth.uid())
            and p.active is true and p.role in ('admin', 'manager')
        )
      )
    )
  );
create policy "managers record extraction reviews" on public.attachment_extraction_reviews
  for insert to authenticated with check (
    reviewer_id = (select auth.uid()) and exists (
      select 1 from public.profiles p where p.id = (select auth.uid())
        and p.active is true and p.role in ('admin','manager')
    )
  );

create policy "requesters save pending extraction suggestions" on public.attachments
  for update to authenticated using (
    exists (select 1 from public.travel_requests r where r.id = travel_request_id
      and (r.requester_id = (select auth.uid()) or exists (
        select 1 from public.profiles p where p.id = (select auth.uid())
          and p.active is true and p.role in ('admin','manager')
      )))
  ) with check (
    exists (select 1 from public.travel_requests r where r.id = travel_request_id
      and (r.requester_id = (select auth.uid()) or exists (
        select 1 from public.profiles p where p.id = (select auth.uid())
          and p.active is true and p.role in ('admin','manager')
      )))
  );

create or replace function public.guard_attachment_extraction_review()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_is_manager boolean;
begin
  select exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.active is true and p.role in ('admin','manager')) into v_is_manager;
  if not v_is_manager and (
      new.travel_request_id is distinct from old.travel_request_id
      or new.storage_path is distinct from old.storage_path
      or new.file_name is distinct from old.file_name
      or new.mime_type is distinct from old.mime_type
      or new.file_size is distinct from old.file_size
      or new.uploaded_by is distinct from old.uploaded_by
      or new.cost_id is distinct from old.cost_id
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
  ) then
    raise exception 'Somente gestores podem alterar os metadados e a confirmação do anexo.';
  end if;
  if not v_is_manager and (
      new.extracted_data is distinct from old.extracted_data
      or new.extraction_status is distinct from old.extraction_status
      or new.extraction_text is distinct from old.extraction_text
      or new.extraction_method is distinct from old.extraction_method
  ) then
    if not exists (select 1 from public.travel_requests r where r.id = new.travel_request_id
        and r.requester_id = (select auth.uid()))
        or new.extraction_status not in ('pending','extracted') then
      raise exception 'Somente o solicitante da OS pode salvar sugestões ainda não confirmadas.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists attachments_extraction_requires_manager on public.attachments;
create trigger attachments_extraction_requires_manager before update on public.attachments
  for each row execute function public.guard_attachment_extraction_review();

create or replace function public.confirm_attachment_cost(p_attachment_id uuid, p_fields jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_attachment public.attachments%rowtype;
  v_user uuid := auth.uid();
  v_cost_id uuid;
  v_action text;
begin
  if v_user is null then raise exception 'Autenticação obrigatória.'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user
      and p.active is true and p.role in ('admin','manager')) then
    raise exception 'Somente gestores podem confirmar despesas.';
  end if;
  select a.* into v_attachment from public.attachments a
    join public.travel_requests r on r.id = a.travel_request_id
    where a.id = p_attachment_id for update of a;
  if not found then raise exception 'Anexo não encontrado.'; end if;
  if v_attachment.extraction_status = 'confirmed' and v_attachment.cost_id is not null then
    return v_attachment.cost_id;
  end if;
  if coalesce((p_fields->>'amount')::numeric, 0) <= 0 then
    raise exception 'Informe um valor positivo para confirmar o custo.';
  end if;
  if coalesce(p_fields->>'category','other') not in ('ticket','baggage','hotel','vehicle','toll','parking','fuel','meal','laundry','uber','other') then
    raise exception 'Categoria inválida.';
  end if;
  insert into public.costs (travel_request_id, category, description, amount, cost_date,
      collaborator_id, source, created_by)
    values (v_attachment.travel_request_id, coalesce(nullif(p_fields->>'category',''), 'other'),
      concat_ws(' · ', nullif(p_fields->>'supplier',''), nullif(p_fields->>'document_number',''), v_attachment.file_name),
      (p_fields->>'amount')::numeric, nullif(p_fields->>'date','')::date,
      nullif(p_fields->>'collaborator_id','')::uuid, 'attachment', v_user)
    returning id into v_cost_id;
  v_action := case when p_fields is distinct from v_attachment.extracted_data then 'corrected' else 'confirmed' end;
  update public.attachments set extracted_data = p_fields, extraction_status = 'confirmed',
    cost_id = v_cost_id, reviewed_by = v_user, reviewed_at = now() where id = p_attachment_id;
  insert into public.attachment_extraction_reviews (attachment_id, reviewer_id, extracted_data, action, cost_id)
    values (p_attachment_id, v_user, p_fields, v_action, v_cost_id);
  return v_cost_id;
end;
$$;
revoke all on function public.confirm_attachment_cost(uuid, jsonb) from public, anon;
grant execute on function public.confirm_attachment_cost(uuid, jsonb) to authenticated;
