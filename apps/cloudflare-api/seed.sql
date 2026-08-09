INSERT OR IGNORE INTO workflows (
  id,country_code,state_code,service_code,tenancy_role,version,status,authoritative_language,definition_json,approved_by,approved_at,effective_at,retired_at,created_at,updated_at
) VALUES
('workflow-ng-la-tenant-v1','NG','LA','ng-la-tenancy-tenant-assessment','tenant',1,'review','en','{"seed":"synthetic","legalApprovalRequired":true}',NULL,NULL,NULL,NULL,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z'),
('workflow-ng-la-landlord-v1','NG','LA','ng-la-tenancy-landlord-assessment','landlord',1,'review','en','{"seed":"synthetic","legalApprovalRequired":true}',NULL,NULL,NULL,NULL,'2026-08-09T00:00:00.000Z','2026-08-09T00:00:00.000Z');
