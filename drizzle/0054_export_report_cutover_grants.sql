insert into role_capabilities (role, capability)
select grants.role, grants.capability
from (values
  ('admin', 'export.download'),
  ('admin', 'export.recovery'),
  ('admin', 'export.import'),
  ('admin', 'report.view'),
  ('admin', 'cutover.import'),
  ('staff', 'report.view'),
  ('staff', 'cutover.import'),
  ('finance', 'report.view'),
  ('records_custodian', 'export.download')
) as grants(role, capability)
where exists (select 1 from role_capabilities existing where existing.role = grants.role)
on conflict do nothing;
