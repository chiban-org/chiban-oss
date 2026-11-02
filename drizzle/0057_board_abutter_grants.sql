insert into role_capabilities (role, capability)
select grants.role, grants.capability
from (values
  ('admin', 'board.record'),
  ('admin', 'abutters.manage'),
  ('staff', 'board.record'),
  ('staff', 'abutters.manage')
) as grants(role, capability)
where exists (select 1 from role_capabilities existing where existing.role = grants.role)
on conflict do nothing;
