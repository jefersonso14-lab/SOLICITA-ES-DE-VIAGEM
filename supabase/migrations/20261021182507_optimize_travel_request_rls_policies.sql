-- Cache auth.uid() once per statement for child-row policies, as recommended
-- by Supabase, while preserving each policy's existing access conditions.
drop policy travel_request_children_insert_owner on public.tickets;
create policy travel_request_children_insert_owner
on public.tickets for insert to authenticated
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = tickets.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_update_owner on public.tickets;
create policy travel_request_children_update_owner
on public.tickets for update to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = tickets.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
))
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = tickets.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_delete_owner on public.tickets;
create policy travel_request_children_delete_owner
on public.tickets for delete to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = tickets.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_insert_owner on public.accommodations;
create policy travel_request_children_insert_owner
on public.accommodations for insert to authenticated
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = accommodations.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_update_owner on public.accommodations;
create policy travel_request_children_update_owner
on public.accommodations for update to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = accommodations.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
))
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = accommodations.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_delete_owner on public.accommodations;
create policy travel_request_children_delete_owner
on public.accommodations for delete to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = accommodations.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_insert_owner on public.vehicles;
create policy travel_request_children_insert_owner
on public.vehicles for insert to authenticated
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = vehicles.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_update_owner on public.vehicles;
create policy travel_request_children_update_owner
on public.vehicles for update to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = vehicles.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
))
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = vehicles.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_delete_owner on public.vehicles;
create policy travel_request_children_delete_owner
on public.vehicles for delete to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = vehicles.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_insert_owner on public.meals;
create policy travel_request_children_insert_owner
on public.meals for insert to authenticated
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = meals.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_update_owner on public.meals;
create policy travel_request_children_update_owner
on public.meals for update to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = meals.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
))
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = meals.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_delete_owner on public.meals;
create policy travel_request_children_delete_owner
on public.meals for delete to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = meals.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_insert_owner on public.laundry;
create policy travel_request_children_insert_owner
on public.laundry for insert to authenticated
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = laundry.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_update_owner on public.laundry;
create policy travel_request_children_update_owner
on public.laundry for update to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = laundry.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
))
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = laundry.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_delete_owner on public.laundry;
create policy travel_request_children_delete_owner
on public.laundry for delete to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = laundry.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_insert_owner on public.uber_expenses;
create policy travel_request_children_insert_owner
on public.uber_expenses for insert to authenticated
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = uber_expenses.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_update_owner on public.uber_expenses;
create policy travel_request_children_update_owner
on public.uber_expenses for update to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = uber_expenses.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
))
with check (exists (
  select 1 from public.travel_requests tr
  where tr.id = uber_expenses.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

drop policy travel_request_children_delete_owner on public.uber_expenses;
create policy travel_request_children_delete_owner
on public.uber_expenses for delete to authenticated
using (exists (
  select 1 from public.travel_requests tr
  where tr.id = uber_expenses.travel_request_id
    and (tr.requester_id = (select auth.uid()) or is_admin_or_manager())
));

-- The SELECT policies already grant admins the same read access as the ALL
-- policies, so make admin write permissions explicit and avoid duplicate
-- permissive SELECT policies without changing authorization behavior.
drop policy collaborators_manage_admin on public.collaborators;
create policy collaborators_insert_admin
on public.collaborators for insert to authenticated
with check (is_admin_or_manager());
create policy collaborators_update_admin
on public.collaborators for update to authenticated
using (is_admin_or_manager())
with check (is_admin_or_manager());
create policy collaborators_delete_admin
on public.collaborators for delete to authenticated
using (is_admin_or_manager());

drop policy costs_manage_admin on public.costs;
create policy costs_insert_admin
on public.costs for insert to authenticated
with check (is_admin_or_manager());
create policy costs_update_admin
on public.costs for update to authenticated
using (is_admin_or_manager())
with check (is_admin_or_manager());
create policy costs_delete_admin
on public.costs for delete to authenticated
using (is_admin_or_manager());
