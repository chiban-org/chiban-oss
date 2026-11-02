insert into role_capabilities (role, capability)
select grants.role, grants.capability
from (values
  ('staff', 'rtk.manage'),
  ('staff', 'redaction.create'),
  ('staff', 'disposition.propose'),
  ('records_custodian', 'rtk.manage'),
  ('records_custodian', 'redaction.create'),
  ('records_custodian', 'disposition.propose')
) as grants(role, capability)
where exists (select 1 from role_capabilities existing where existing.role = grants.role)
on conflict do nothing;
