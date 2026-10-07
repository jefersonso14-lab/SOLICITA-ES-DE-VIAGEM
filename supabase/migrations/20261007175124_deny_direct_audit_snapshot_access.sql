-- Make the private snapshot table fail closed if it is ever granted a schema
-- usage privilege in a future deployment.
create policy audit_snapshots_deny_direct_access
  on private.audit_snapshots
  for all to public
  using (false)
  with check (false);
