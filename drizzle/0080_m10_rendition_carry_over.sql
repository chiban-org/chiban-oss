INSERT INTO "rendition_approvals" ("document_id", "version_id", "purpose", "approved_by_kind", "review_statement")
SELECT d.id,
  coalesce(
    (SELECT v.id FROM document_versions v WHERE v.document_id = d.id AND v.role = 'public_redacted' ORDER BY v.created_at DESC, v.id DESC LIMIT 1),
    (SELECT v.id FROM document_versions v WHERE v.document_id = d.id AND v.role = 'original' LIMIT 1)
  ),
  'public',
  'system',
  'Carried over from Phase 1 publication.'
FROM documents d
WHERE d.is_public
  AND coalesce(
    (SELECT v.id FROM document_versions v WHERE v.document_id = d.id AND v.role = 'public_redacted' ORDER BY v.created_at DESC, v.id DESC LIMIT 1),
    (SELECT v.id FROM document_versions v WHERE v.document_id = d.id AND v.role = 'original' LIMIT 1)
  ) IS NOT NULL
ON CONFLICT DO NOTHING;
