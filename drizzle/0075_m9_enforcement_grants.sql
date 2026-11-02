insert into role_capabilities (role, capability)
select grants.role, grants.capability
from (values
  ('staff', 'enforcement.manage'),
  ('staff', 'enforcement.issue_order'),
  ('staff', 'enforcement.record_service'),
  ('staff', 'enforcement.refer_counsel'),
  ('inspector', 'enforcement.manage'),
  ('inspector', 'enforcement.issue_order'),
  ('inspector', 'enforcement.record_service'),
  ('admin', 'enforcement.refer_counsel'),
  ('admin', 'fine.record'),
  ('admin', 'anonymous_intake.enable'),
  ('finance', 'fine.record')
) as grants(role, capability)
where exists (select 1 from role_capabilities existing where existing.role = grants.role)
on conflict do nothing;
