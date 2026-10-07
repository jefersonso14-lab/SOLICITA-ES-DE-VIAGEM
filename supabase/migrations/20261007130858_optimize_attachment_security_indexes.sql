-- Keep one UPDATE policy for attachments and index the new review foreign keys.
drop policy if exists attachments_manage_admin on public.attachments;
drop policy if exists "requesters save pending extraction suggestions" on public.attachments;

create policy "authorized users update attachment extraction" on public.attachments
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

create index if not exists attachment_reviews_attachment_id_idx
  on public.attachment_extraction_reviews (attachment_id);
create index if not exists attachment_reviews_cost_id_idx
  on public.attachment_extraction_reviews (cost_id);
create index if not exists attachment_reviews_reviewer_id_idx
  on public.attachment_extraction_reviews (reviewer_id);
create index if not exists attachments_reviewed_by_idx
  on public.attachments (reviewed_by);
