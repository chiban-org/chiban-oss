insert into role_capabilities (role, capability)
select grants.role, grants.capability
from (values
  ('admin', 'board.manage_members'),
  ('staff', 'board.manage_members')
) as grants(role, capability)
where exists (select 1 from role_capabilities existing where existing.role = grants.role)
on conflict do nothing;
