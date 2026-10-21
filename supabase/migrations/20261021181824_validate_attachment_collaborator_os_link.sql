create or replace function public.confirm_attachment_cost(p_attachment_id uuid, p_fields jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_attachment public.attachments%rowtype;
  v_user uuid := auth.uid();
  v_cost_id uuid;
  v_action text;
  v_collaborator_id uuid;
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

  if nullif(p_fields->>'collaborator_id', '') is not null then
    begin
      v_collaborator_id := (p_fields->>'collaborator_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Identificador do colaborador inválido.';
    end;
    if not exists (
      select 1 from public.travel_request_collaborators as participant
      where participant.travel_request_id = v_attachment.travel_request_id
        and participant.collaborator_id = v_collaborator_id
    ) then
      raise exception 'O colaborador informado não pertence à OS do anexo.';
    end if;
  end if;

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
      v_collaborator_id, 'attachment', v_user)
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
