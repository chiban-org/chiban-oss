# Chiban export format

Format version 2.0.0.

This archive holds one town's records exported from Chiban. It is a standard zip file, so it
opens on any computer without extra software. Every file inside is plain text or the original
bytes of a stored document, so the records stay readable without Chiban. Data files are
compressed; stored documents are kept as they are.

## Layout

- `manifest.json`: first entry. Lists every data file and every stored file with its SHA-256.
- `manifest.sha256`: the SHA-256 of `manifest.json` in `sha256sum` format.
- `FORMAT.md`: this document.
- `data/{entity}.ndjson`: one JSON object per line, one file per entity, ordered by primary key.
  Keys are sorted. Timestamps are UTC with microseconds. Dates are `YYYY-MM-DD`. Geometry is
  GeoJSON in EPSG:4326.
- `files/sha256/{aa}/{bb}/{sha256}`: the exact bytes of each stored document, named by their
  SHA-256, stored once however many documents use them.

## Manifest fields

- `format`, `formatVersion`, `kind` (`business` or `incremental`), `exportId`,
  `baseExportId`, `createdAt`.
- `town`: name, state, time zone. `appVersion`, `pack`, `migrationHead`: the software that
  wrote the archive.
- `entities[]`: `name`, `path`, `count`, `sha256`, `inExport`.
- `files[]`: `sha256`, `size`, `contentType`, `path`, `inExport`.
- `inExport` is the export whose archive holds the bytes. In a full export it equals
  `exportId`. In an incremental export an unchanged entity or file points at the earlier export.

Credentials never appear in an archive: password hashes, authenticator secrets, payment
processor keys, calendar secrets, and sign-in or link tokens are omitted. Records that need them
are restored without them and must be set up again.

## Entities

### abutter_list_candidates

File: `data/abutter_list_candidates.ndjson`. Ordered by id.

- `id`: uuid
- `list_id`: uuid
- `parcel_id`: uuid
- `reasons`: jsonb
- `excluded`: boolean
- `exclusion_reason`: text, nullable

References:
- `list_id` refers to `abutter_lists`
- `parcel_id` refers to `parcels`

### abutter_list_recipients

File: `data/abutter_list_recipients.ndjson`. Ordered by id.

- `id`: uuid
- `list_id`: uuid
- `origin_key`: text
- `position`: integer
- `data`: jsonb
- `excluded`: boolean
- `exclusion_reason`: text, nullable
- `qualifies`: boolean, nullable
- `decision_reason`: text, nullable

References:
- `list_id` refers to `abutter_lists`

### abutter_lists

File: `data/abutter_lists.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `version`: integer
- `status`: text
- `strategy_key`: text
- `strategy_version`: integer
- `resolver_key`: text
- `resolver_version`: integer
- `drawn_on`: date
- `layers`: jsonb
- `incomplete`: jsonb
- `crossings_attested_by`: uuid, nullable
- `crossings_attested_at`: timestamp with time zone, nullable
- `issued_by`: uuid, nullable
- `issued_at`: timestamp with time zone, nullable
- `snapshot`: jsonb, nullable
- `snapshot_sha256`: text, nullable
- `superseded_by`: uuid, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### acceptance_schedules

File: `data/acceptance_schedules.ndjson`. Ordered by application_id.

- `application_id`: uuid
- `meeting_id`: uuid
- `set_by`: uuid
- `set_at`: timestamp with time zone

References:
- `application_id` refers to `applications`
- `meeting_id` refers to `board_meetings`

### agenda_items

File: `data/agenda_items.ndjson`. Ordered by id.

- `id`: uuid
- `meeting_id`: uuid
- `position`: integer
- `kind`: text
- `hearing_id`: uuid, nullable
- `title`: text
- `description`: text

References:
- `meeting_id` refers to `agendas`
- `hearing_id` refers to `hearings`

### agendas

File: `data/agendas.ndjson`. Ordered by meeting_id.

- `meeting_id`: uuid
- `status`: text
- `revision`: integer
- `published_at`: timestamp with time zone, nullable
- `document_id`: uuid, nullable

References:
- `meeting_id` refers to `board_meetings`

### alias_overrides

File: `data/alias_overrides.ndjson`. Ordered by id.

- `id`: uuid
- `format`: text
- `value`: text
- `parcel_id`: uuid
- `replaced_parcel_id`: uuid, nullable
- `reason`: text
- `expires_on`: date, nullable
- `superseded_by`: uuid, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `parcel_id` refers to `parcels`
- `replaced_parcel_id` refers to `parcels`

### anonymous_intake_verifications

File: `data/anonymous_intake_verifications.ndjson`. Ordered by id.

- `id`: uuid
- `image_ref`: text, nullable
- `app_version`: text
- `caddyfile_sha256`: text
- `ran_at`: timestamp with time zone
- `passed`: boolean
- `findings`: jsonb

### appeal_nodes

File: `data/appeal_nodes.ndjson`. Ordered by id.

- `id`: uuid
- `kind`: text
- `application_id`: uuid, nullable
- `decision_id`: uuid, nullable
- `parent_id`: uuid, nullable
- `linked_pb_node_id`: uuid, nullable
- `occurred_on`: date
- `outcome`: text, nullable
- `status`: text
- `untimely`: boolean
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `application_id` refers to `applications`
- `decision_id` refers to `board_decisions`

### appeals

File: `data/appeals.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `kind`: text
- `filed_on`: date
- `appellant_name`: text
- `resolved_on`: date, nullable
- `outcome`: text, nullable
- `recorded_by`: uuid
- `resolved_by`: uuid, nullable

References:
- `application_id` refers to `applications`

### application_conditions

File: `data/application_conditions.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `code`: text
- `text_snapshot`: text
- `blocks_issuance`: boolean
- `status`: text
- `status_reason`: text, nullable
- `changed_by`: uuid
- `changed_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### application_notes

File: `data/application_notes.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `body`: text
- `author_id`: uuid
- `created_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### application_number_counters

File: `data/application_number_counters.ndjson`. Ordered by prefix, year.

- `prefix`: text
- `year`: integer
- `last`: integer

### application_parcels

File: `data/application_parcels.ndjson`. Ordered by application_id, parcel_id.

- `application_id`: uuid
- `parcel_id`: uuid
- `added_by`: uuid
- `added_at`: timestamp with time zone

References:
- `application_id` refers to `applications`
- `parcel_id` refers to `parcels`

### application_professionals

File: `data/application_professionals.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `name`: text
- `profession`: text
- `business_address`: text
- `seal_on_plat`: boolean
- `added_by`: uuid
- `added_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### application_snapshots

File: `data/application_snapshots.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `sequence`: integer
- `reason`: text
- `body`: jsonb
- `body_sha256`: text
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### applications

File: `data/applications.ndjson`. Ordered by id.

- `id`: uuid
- `seq`: bigserial
- `project_id`: uuid
- `number`: text
- `application_type_key`: text
- `config_pins`: jsonb
- `state`: text
- `substep`: text, nullable
- `row_version`: integer
- `values`: jsonb
- `facts`: jsonb
- `received_date`: date, nullable
- `completed_date`: date, nullable
- `decided_on`: date, nullable
- `issued_on`: date, nullable
- `closure_reason`: text, nullable
- `permit_revision`: integer
- `permit_corrected_on`: date, nullable
- `responsible_user_id`: uuid, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone
- `updated_at`: timestamp with time zone

References:
- `project_id` refers to `projects`

### association_rosters

File: `data/association_rosters.ndjson`. Ordered by id.

- `id`: uuid
- `parcel_id`: uuid
- `association_name`: text
- `officers`: jsonb
- `as_of`: date
- `checked_on`: date, nullable
- `ended_on`: date, nullable
- `ended_at`: timestamp with time zone, nullable
- `updated_by`: uuid
- `updated_at`: timestamp with time zone

References:
- `parcel_id` refers to `parcels`

### attestations

File: `data/attestations.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `user_id`: uuid
- `statement_text`: text
- `statement_sha256`: text
- `attested_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### audit_log

File: `data/audit_log.ndjson`. Ordered by id.

- `id`: uuid
- `at`: timestamp with time zone
- `actor_kind`: text
- `actor_user_id`: uuid, nullable
- `actor_job`: text, nullable
- `action`: text
- `entity_type`: text
- `entity_id`: text
- `before`: jsonb, nullable
- `after`: jsonb, nullable

### board_decisions

File: `data/board_decisions.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `hearing_id`: uuid
- `meeting_id`: uuid
- `voted_on`: date
- `outcome`: text
- `motion`: text
- `votes`: jsonb
- `findings`: text
- `conditions`: jsonb
- `reasons_for_disapproval`: text, nullable
- `filed_on`: date, nullable
- `minutes_document_id`: uuid, nullable
- `written_decision_document_id`: uuid, nullable
- `letter_document_id`: uuid, nullable
- `recorded_by`: uuid
- `recorded_at`: timestamp with time zone

References:
- `application_id` refers to `applications`
- `hearing_id` refers to `hearings`
- `meeting_id` refers to `board_meetings`

### board_meetings

File: `data/board_meetings.ndjson`. Ordered by id.

- `id`: uuid
- `board_id`: uuid
- `meeting_date`: date
- `kind`: text
- `status`: text
- `location`: text
- `starts_at_minute`: integer
- `cancel_reason`: text, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `board_id` refers to `boards`

### board_memberships

File: `data/board_memberships.ndjson`. Ordered by id.

- `id`: uuid
- `user_id`: uuid
- `board_id`: uuid
- `title`: text
- `term_start`: date
- `term_end`: date, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `board_id` refers to `boards`

### board_packet_access

File: `data/board_packet_access.ndjson`. Ordered by id.

- `id`: uuid
- `link_id`: uuid, nullable
- `packet_id`: uuid, nullable
- `user_id`: uuid, nullable
- `version_id`: uuid, nullable
- `accessed_at`: timestamp with time zone

References:
- `link_id` refers to `board_packet_links`
- `packet_id` refers to `board_packets`

### board_packet_items

File: `data/board_packet_items.ndjson`. Ordered by packet_id, document_id.

- `packet_id`: uuid
- `document_id`: uuid
- `version_id`: uuid, nullable
- `former_version_id`: uuid, nullable
- `position`: integer
- `approval_id`: uuid, nullable
- `withdrawn_at`: timestamp with time zone, nullable
- `withdrawn_reason`: text, nullable
- `sent_at`: timestamp with time zone, nullable
- `removed_at`: timestamp with time zone, nullable
- `removal_sent_at`: timestamp with time zone, nullable
- `replaces_document_id`: uuid, nullable

References:
- `packet_id` refers to `board_packets`
- `document_id` refers to `documents`
- `version_id` refers to `document_versions`
- `approval_id` refers to `rendition_approvals`

### board_packet_links

File: `data/board_packet_links.ndjson`. Ordered by id.

- `id`: uuid
- `packet_id`: uuid
- `recipient_name`: text
- `recipient_email`: citext
- `expires_at`: timestamp with time zone
- `revoked_at`: timestamp with time zone, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `packet_id` refers to `board_packets`

Omitted columns: `token_hash`

### board_packet_members

File: `data/board_packet_members.ndjson`. Ordered by packet_id, user_id.

- `packet_id`: uuid
- `user_id`: uuid
- `sent_at`: timestamp with time zone
- `last_sent_at`: timestamp with time zone

References:
- `packet_id` refers to `board_packets`
- `user_id` refers to `users`

### board_packets

File: `data/board_packets.ndjson`. Ordered by id.

- `id`: uuid
- `title`: text
- `board_id`: uuid
- `meeting_date`: date
- `meeting_id`: uuid, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone
- `sent_at`: timestamp with time zone, nullable
- `last_sent_at`: timestamp with time zone, nullable

References:
- `board_id` refers to `boards`
- `meeting_id` refers to `board_meetings`

### boards

File: `data/boards.ndjson`. Ordered by id.

- `id`: uuid
- `kind`: text
- `name`: text
- `short_name`: text
- `archived_at`: timestamp with time zone, nullable
- `created_by`: uuid, nullable
- `created_at`: timestamp with time zone

### calendar_accounts

File: `data/calendar_accounts.ndjson`. Ordered by id.

- `id`: uuid
- `kind`: text
- `tenant_id`: text
- `client_id`: text
- `authority_base`: text
- `graph_base`: text
- `is_active`: boolean
- `created_by`: uuid
- `created_at`: timestamp with time zone

Omitted columns: `client_secret_enc`

### calendar_pushes

File: `data/calendar_pushes.ndjson`. Ordered by id.

- `id`: uuid
- `inspection_id`: uuid
- `sequence`: integer
- `op`: text
- `inspector_user_id`: uuid
- `target_kind`: text
- `scheduled_date`: date
- `start_minute`: integer
- `duration_minutes`: integer
- `status`: text
- `attempts`: integer
- `last_error`: text, nullable
- `external_ref`: text, nullable
- `created_at`: timestamp with time zone
- `sent_at`: timestamp with time zone, nullable

References:
- `inspection_id` refers to `inspections`

### census_classifications

File: `data/census_classifications.ndjson`. Ordered by application_id.

- `application_id`: uuid
- `category`: text
- `excluded_reason`: text, nullable
- `phase`: text
- `buildings`: integer
- `housing_units`: integer
- `valuation_dollars`: integer
- `classified_by`: uuid
- `classified_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### certificates_of_occupancy

File: `data/certificates_of_occupancy.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `number`: text
- `issued_on`: date
- `final_inspection_id`: uuid
- `document_id`: uuid
- `issued_by`: uuid
- `issued_at`: timestamp with time zone

References:
- `application_id` refers to `applications`
- `final_inspection_id` refers to `inspections`
- `document_id` refers to `documents`

### clock_adjustments

File: `data/clock_adjustments.ndjson`. Ordered by id.

- `id`: uuid
- `clock_id`: uuid
- `kind`: text
- `days`: integer, nullable
- `new_due`: date, nullable
- `reason`: text
- `legal_authority`: jsonb, nullable
- `applicant_consent`: boolean
- `superseded_by`: uuid, nullable
- `created_by`: text
- `created_at`: timestamp with time zone

References:
- `clock_id` refers to `clocks`

### clocks

File: `data/clocks.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `rule_key`: text
- `rule_version`: integer
- `pack_version`: text
- `start_event`: text
- `start_date`: date
- `length_value`: integer
- `length_unit`: text
- `counting_method`: text
- `computed_due`: date
- `current_due`: date
- `rolled_from`: date, nullable
- `status`: text
- `met_on`: date, nullable
- `source`: text
- `replaced_due`: date, nullable
- `superseded_by`: uuid, nullable
- `superseded_reason`: text, nullable
- `created_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### code_edition_records

File: `data/code_edition_records.ndjson`. Ordered by application_id.

- `application_id`: uuid
- `receipt_date`: date
- `completed_date`: date, nullable
- `classification`: text, nullable
- `dwelling_units`: integer, nullable
- `edition_key`: text
- `edition_label`: text
- `edition_status`: text
- `applicant_election`: text, nullable
- `local_amendments_in_force`: jsonb
- `recorded_by`: uuid
- `recorded_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### complaints

File: `data/complaints.ndjson`. Ordered by id.

- `id`: uuid
- `number`: text
- `case_id`: uuid, nullable
- `channel`: text
- `received_on`: date
- `location_text`: text
- `parcel_id`: uuid, nullable
- `description_original`: text
- `description_public`: text, nullable
- `public_text_approved_by`: uuid, nullable
- `public_text_approved_at`: timestamp with time zone, nullable
- `complainant_name`: text, nullable
- `complainant_email`: citext, nullable
- `complainant_phone`: text, nullable
- `created_by`: uuid, nullable
- `is_probe`: boolean
- `created_at`: timestamp with time zone

References:
- `case_id` refers to `enforcement_cases`
- `parcel_id` refers to `parcels`

### completeness_votes

File: `data/completeness_votes.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `meeting_id`: uuid
- `voted_on`: date
- `outcome`: text
- `reason`: text, nullable
- `recorded_by`: uuid
- `recorded_at`: timestamp with time zone

References:
- `application_id` refers to `applications`
- `meeting_id` refers to `board_meetings`

### config_versions

File: `data/config_versions.ndjson`. Ordered by id.

- `id`: uuid
- `kind`: text
- `key`: text
- `version`: integer
- `status`: text
- `body`: jsonb
- `upstream_template_id`: text, nullable
- `upstream_template_version`: integer, nullable
- `rolled_back_from`: integer, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone
- `published_by`: uuid, nullable
- `published_at`: timestamp with time zone, nullable

### contractor_claims

File: `data/contractor_claims.ndjson`. Ordered by id.

- `id`: uuid
- `project_id`: uuid
- `party_id`: uuid
- `email`: citext
- `sent_by`: uuid
- `sent_by_kind`: text
- `expires_at`: timestamp with time zone
- `created_at`: timestamp with time zone
- `claimed_at`: timestamp with time zone, nullable
- `claimed_by`: uuid, nullable
- `revoked_at`: timestamp with time zone, nullable

References:
- `project_id` refers to `projects`
- `party_id` refers to `project_parties`

Omitted columns: `token_hash`

### counsel_outcomes

File: `data/counsel_outcomes.ndjson`. Ordered by id.

- `id`: uuid
- `referral_id`: uuid
- `kind`: text
- `occurred_on`: date
- `court`: text, nullable
- `docket`: text, nullable
- `document_id`: uuid, nullable
- `note`: text, nullable
- `recorded_by`: uuid
- `created_at`: timestamp with time zone

References:
- `referral_id` refers to `counsel_referrals`
- `document_id` refers to `documents`

### counsel_referrals

File: `data/counsel_referrals.ndjson`. Ordered by id.

- `id`: uuid
- `case_id`: uuid
- `referred_on`: date
- `counsel_name`: text
- `purpose`: text
- `packet_document_id`: uuid
- `referred_by`: uuid

References:
- `case_id` refers to `enforcement_cases`
- `packet_document_id` refers to `documents`

### cutover_reconciliations

File: `data/cutover_reconciliations.ndjson`. Ordered by id.

- `id`: uuid
- `list_sha256`: text
- `report`: jsonb
- `created_by`: uuid
- `created_at`: timestamp with time zone
- `signed_off_by`: uuid, nullable
- `signed_off_at`: timestamp with time zone, nullable

### cutover_rows

File: `data/cutover_rows.ndjson`. Ordered by legacy_number.

- `legacy_number`: text
- `application_id`: uuid
- `imported_by`: uuid
- `imported_at`: timestamp with time zone
- `source_sha256`: text

References:
- `application_id` refers to `applications`

### des_proximity_determinations

File: `data/des_proximity_determinations.ndjson`. Ordered by application_id.

- `application_id`: uuid
- `suggested`: jsonb
- `determination`: text
- `reason`: text
- `determined_by`: uuid
- `determined_on`: date

References:
- `application_id` refers to `applications`

### disposition_batches

File: `data/disposition_batches.ndjson`. Ordered by id.

- `id`: uuid
- `as_of`: date
- `status`: text
- `proposed_by`: uuid
- `proposed_at`: timestamp with time zone
- `approved_by`: uuid, nullable
- `approved_at`: timestamp with time zone, nullable
- `executed_at`: timestamp with time zone, nullable
- `cancelled_at`: timestamp with time zone, nullable

### disposition_items

File: `data/disposition_items.ndjson`. Ordered by batch_id, record_kind, record_id.

- `batch_id`: uuid
- `record_kind`: text
- `record_id`: uuid
- `series_key`: text
- `series_version`: text
- `eligible_on`: date
- `outcome`: text, nullable

References:
- `batch_id` refers to `disposition_batches`

### disposition_tombstones

File: `data/disposition_tombstones.ndjson`. Ordered by id.

- `id`: uuid
- `batch_id`: uuid
- `record_kind`: text
- `record_id`: uuid
- `title`: text
- `series_key`: text
- `series_version`: text
- `series_citation`: jsonb
- `retention_basis`: jsonb
- `version_ids`: uuid[]
- `file_sha256s`: text[]
- `proposed_by`: uuid
- `approved_by`: uuid
- `executed_at`: timestamp with time zone

References:
- `batch_id` refers to `disposition_batches`

### document_text

File: `data/document_text.ndjson`. Ordered by version_id.

- `version_id`: uuid
- `text`: text
- `has_text_layer`: boolean

References:
- `version_id` refers to `document_versions`

Omitted columns: `tsv`

### document_versions

File: `data/document_versions.ndjson`. Ordered by id.

- `id`: uuid
- `document_id`: uuid
- `role`: text
- `file_sha256`: text
- `filename`: text
- `content_type`: text
- `created_by`: uuid, nullable
- `derived_from_version_id`: uuid, nullable
- `redaction_job_id`: uuid, nullable
- `created_at`: timestamp with time zone

References:
- `document_id` refers to `documents`
- `file_sha256` refers to `files`
- `derived_from_version_id` refers to `document_versions`

### documents

File: `data/documents.ndjson`. Ordered by id.

- `id`: uuid
- `seq`: bigserial
- `record_kind`: text
- `record_id`: uuid
- `title`: text
- `doc_kind`: text
- `audiences`: text[]
- `is_public`: boolean
- `public_changed_by`: uuid, nullable
- `public_changed_at`: timestamp with time zone, nullable
- `created_by_kind`: text
- `created_by`: uuid, nullable
- `migration_batch_id`: uuid, nullable
- `superseded_by`: uuid, nullable
- `disposed_at`: timestamp with time zone, nullable
- `disposed_tombstone_id`: uuid, nullable
- `created_at`: timestamp with time zone

References:
- `migration_batch_id` refers to `migration_batches`
- `superseded_by` refers to `documents`

Typed references:
- `record_id` by `record_kind`: application to `applications`, inspection to `inspections`, project to `projects`, parcel to `parcels`, meeting to `board_meetings`, migration_batch to `migration_batches`, enforcement_case to `enforcement_cases`

### enforcement_appeals

File: `data/enforcement_appeals.ndjson`. Ordered by id.

- `id`: uuid
- `case_id`: uuid
- `target_kind`: text
- `target_id`: uuid
- `filed_on`: date
- `appellant_name`: text
- `board`: text
- `resolved_on`: date, nullable
- `outcome`: text, nullable
- `recorded_by`: uuid
- `created_at`: timestamp with time zone

References:
- `case_id` refers to `enforcement_cases`

### enforcement_cases

File: `data/enforcement_cases.ndjson`. Ordered by id.

- `id`: uuid
- `number`: text
- `parcel_id`: uuid, nullable
- `location_text`: text
- `status`: text
- `opened_on`: date
- `closed_on`: date, nullable
- `closure_reason`: text, nullable
- `assigned_to`: uuid, nullable
- `is_public`: boolean
- `public_summary`: text, nullable
- `row_version`: integer
- `created_at`: timestamp with time zone
- `updated_at`: timestamp with time zone

References:
- `parcel_id` refers to `parcels`

### enforcement_designations

File: `data/enforcement_designations.ndjson`. Ordered by id.

- `id`: uuid
- `user_id`: uuid
- `title`: text
- `adopting_authority`: text
- `adopted_on`: date
- `ended_on`: date, nullable

### enforcement_fines

File: `data/enforcement_fines.ndjson`. Ordered by id.

- `id`: uuid
- `case_id`: uuid
- `order_id`: uuid, nullable
- `kind`: text
- `rule_key`: text, nullable
- `amount_cents`: integer
- `imposed_on`: date
- `court`: text
- `docket`: text
- `judgment_step_id`: uuid, nullable
- `counsel_outcome_id`: uuid, nullable
- `recorded_by`: uuid
- `created_at`: timestamp with time zone

References:
- `case_id` refers to `enforcement_cases`
- `order_id` refers to `enforcement_orders`
- `judgment_step_id` refers to `order_court_steps`
- `counsel_outcome_id` refers to `counsel_outcomes`

### enforcement_notes

File: `data/enforcement_notes.ndjson`. Ordered by id.

- `id`: uuid
- `case_id`: uuid
- `observed_on`: date
- `body`: text
- `author_id`: uuid
- `created_at`: timestamp with time zone

References:
- `case_id` refers to `enforcement_cases`

### enforcement_orders

File: `data/enforcement_orders.ndjson`. Ordered by id.

- `id`: uuid
- `case_id`: uuid
- `number`: text
- `rule_key`: text
- `rule_version`: integer
- `finding_ids`: uuid[]
- `corrective_action`: text
- `corrective_deadline`: date, nullable
- `cease_immediately`: boolean
- `status`: text
- `drafted_by`: uuid
- `issued_on`: date, nullable
- `issued_by`: uuid, nullable
- `document_id`: uuid, nullable
- `row_version`: integer
- `created_at`: timestamp with time zone

References:
- `case_id` refers to `enforcement_cases`
- `document_id` refers to `documents`

### export_targets

File: `data/export_targets.ndjson`. Ordered by id.

- `id`: uuid
- `kind`: text
- `name`: text
- `settings`: jsonb
- `day_of_month`: integer
- `is_active`: boolean
- `created_at`: timestamp with time zone

Omitted columns: `credentials_enc`, `run_requested_at`, `last_success_at`, `last_failure_at`, `last_error`

### fee_assessments

File: `data/fee_assessments.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `stage`: text
- `sequence`: integer
- `schedule_version_id`: uuid
- `computation`: jsonb
- `total_cents`: integer
- `assessed_by`: text
- `assessed_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### fee_overrides

File: `data/fee_overrides.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `fee_code`: text
- `kind`: text
- `amount_cents`: integer, nullable
- `reason`: text
- `superseded_by`: uuid, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### file_tombstones

File: `data/file_tombstones.ndjson`. Ordered by sha256.

- `sha256`: text
- `size_bytes`: bigint
- `content_type`: text
- `deleted_at`: timestamp with time zone
- `batch_id`: uuid

References:
- `batch_id` refers to `disposition_batches`

### files

File: `data/files.ndjson`. Ordered by sha256.

- `sha256`: text
- `size_bytes`: bigint
- `content_type`: text
- `storage_key`: text
- `created_at`: timestamp with time zone

### gate_overrides

File: `data/gate_overrides.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `gate_key`: text
- `kind`: text
- `reason`: text, nullable
- `legal_authority`: jsonb, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone
- `revoked_at`: timestamp with time zone, nullable
- `revoked_by`: uuid, nullable

References:
- `application_id` refers to `applications`

### gis_features

File: `data/gis_features.ndjson`. Ordered by id.

- `id`: uuid
- `layer_key`: text
- `source_key`: text
- `name`: text, nullable
- `geom`: geometry(Geometry, 4326)

### gis_layers

File: `data/gis_layers.ndjson`. Ordered by key.

- `key`: text
- `required`: boolean
- `adapter`: text, nullable
- `source_url`: text, nullable
- `mapping`: jsonb
- `stale_after_days`: integer
- `refresh_interval_hours`: integer
- `last_success_at`: timestamp with time zone, nullable
- `last_failure_at`: timestamp with time zone, nullable
- `last_error`: text, nullable

### hearings

File: `data/hearings.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `meeting_id`: uuid
- `kind`: text
- `status`: text
- `continued_from`: uuid, nullable
- `continuation_announced`: boolean, nullable
- `announced_details`: text, nullable
- `notice_set_id`: uuid
- `properly_noticed_at`: timestamp with time zone, nullable
- `properly_noticed_by`: uuid, nullable
- `held_on`: date, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `application_id` refers to `applications`
- `meeting_id` refers to `board_meetings`
- `notice_set_id` refers to `notice_sets`

### historical_records

File: `data/historical_records.ndjson`. Ordered by id.

- `id`: uuid
- `record_type`: text
- `number`: text, nullable
- `recorded_on`: date, nullable
- `description`: text, nullable
- `values`: jsonb
- `source_file`: text
- `source_sha256`: text
- `source_sheet`: text
- `source_row`: integer
- `imported_by`: uuid
- `imported_at`: timestamp with time zone

### import_exceptions

File: `data/import_exceptions.ndjson`. Ordered by id.

- `id`: uuid
- `layer_key`: text
- `first_run_id`: uuid
- `last_seen_run_id`: uuid
- `row_key`: text
- `kind`: text
- `content_hash`: text
- `payload`: jsonb
- `detail`: text
- `status`: text
- `disposition_by`: uuid, nullable
- `disposition_reason`: text, nullable
- `created_at`: timestamp with time zone

References:
- `first_run_id` refers to `import_runs`
- `last_seen_run_id` refers to `import_runs`

### import_runs

File: `data/import_runs.ndjson`. Ordered by id.

- `id`: uuid
- `layer_key`: text
- `adapter`: text
- `actor_user_id`: uuid, nullable
- `actor_job`: text, nullable
- `input_hash`: text
- `status`: text
- `started_at`: timestamp with time zone
- `finished_at`: timestamp with time zone, nullable
- `report`: jsonb, nullable
- `error`: text, nullable

### inspection_item_results

File: `data/inspection_item_results.ndjson`. Ordered by inspection_id, item_key.

- `inspection_id`: uuid
- `item_key`: text
- `label_snapshot`: text
- `required`: boolean
- `outcome`: text
- `note`: text, nullable

References:
- `inspection_id` refers to `inspections`

### inspections

File: `data/inspections.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `checklist_version_id`: uuid
- `inspection_type`: text
- `is_final`: boolean
- `status`: text
- `channel`: text
- `requested_by_user_id`: uuid, nullable
- `requested_at`: timestamp with time zone
- `preferred_date`: date, nullable
- `contact_name`: text
- `contact_phone`: text, nullable
- `access_notes`: text, nullable
- `reinspection_of`: uuid, nullable
- `inspector_user_id`: uuid, nullable
- `scheduled_date`: date, nullable
- `start_minute`: integer, nullable
- `duration_minutes`: integer, nullable
- `calendar_sequence`: integer
- `result_notes`: text, nullable
- `result_recorded_by`: uuid, nullable
- `result_recorded_at`: timestamp with time zone, nullable
- `cancel_reason`: text, nullable
- `off_grid_reason`: text, nullable
- `row_version`: integer
- `created_at`: timestamp with time zone
- `updated_at`: timestamp with time zone

References:
- `application_id` refers to `applications`
- `checklist_version_id` refers to `config_versions`

### inspector_calendars

File: `data/inspector_calendars.ndjson`. Ordered by user_id.

- `user_id`: uuid
- `kind`: text
- `email`: citext
- `graph_user_id`: text, nullable
- `updated_by`: uuid
- `updated_at`: timestamp with time zone

### ledger_allocations

File: `data/ledger_allocations.ndjson`. Ordered by id.

- `id`: uuid
- `entry_id`: uuid
- `target_kind`: text
- `application_id`: uuid, nullable
- `fee_assessment_id`: uuid, nullable
- `stage`: text, nullable
- `fee_code`: text, nullable
- `fine_id`: uuid, nullable
- `amount_cents`: integer

References:
- `entry_id` refers to `ledger_entries`
- `application_id` refers to `applications`
- `fee_assessment_id` refers to `fee_assessments`
- `fine_id` refers to `enforcement_fines`

### ledger_entries

File: `data/ledger_entries.ndjson`. Ordered by id.

- `id`: uuid
- `entry_type`: text
- `method`: text
- `amount_cents`: integer
- `posted_at`: timestamp with time zone
- `business_date`: date
- `receipt_id`: uuid, nullable
- `reverses_entry_id`: uuid, nullable
- `payment_attempt_id`: uuid, nullable
- `processor`: text, nullable
- `processor_account_id`: uuid, nullable
- `processor_object_id`: text, nullable
- `check_number`: text, nullable
- `payer_name`: text
- `payer_user_id`: uuid, nullable
- `reason`: text, nullable
- `actor_kind`: text
- `actor_user_id`: uuid, nullable
- `actor_job`: text, nullable

References:
- `receipt_id` refers to `receipts`
- `reverses_entry_id` refers to `ledger_entries`
- `payment_attempt_id` refers to `payment_attempts`

### legal_holds

File: `data/legal_holds.ndjson`. Ordered by id.

- `id`: uuid
- `target_kind`: text
- `target_id`: uuid
- `reason`: text
- `placed_by`: uuid
- `placed_at`: timestamp with time zone
- `released_by`: uuid, nullable
- `released_at`: timestamp with time zone, nullable
- `release_reason`: text, nullable

Typed references:
- `target_id` by `target_kind`: project to `projects`, application to `applications`, document to `documents`

### license_checks

File: `data/license_checks.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `license_number`: text
- `license_type`: text
- `result`: text
- `note`: text, nullable
- `lookup_url`: text
- `checked_by`: uuid
- `checked_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### meeting_minutes

File: `data/meeting_minutes.ndjson`. Ordered by meeting_id.

- `meeting_id`: uuid
- `document_id`: uuid
- `status`: text
- `approved_on`: date, nullable
- `recorded_by`: uuid
- `recorded_at`: timestamp with time zone

References:
- `meeting_id` refers to `board_meetings`
- `document_id` refers to `documents`

### migration_batches

File: `data/migration_batches.ndjson`. Ordered by id.

- `id`: uuid
- `name`: text
- `source_root`: text
- `series_key`: text
- `folder_pattern`: text
- `id_format`: text
- `status`: text
- `report`: jsonb, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone
- `updated_at`: timestamp with time zone

### migration_items

File: `data/migration_items.ndjson`. Ordered by id.

- `id`: uuid
- `batch_id`: uuid
- `source_path`: text
- `size_bytes`: bigint
- `sha256`: text
- `folder_key`: text, nullable
- `outcome`: text, nullable
- `except_reason`: text, nullable
- `document_id`: uuid, nullable
- `duplicate_of_item`: uuid, nullable
- `parcel_link`: text
- `ocr_status`: text
- `ocr_reason`: text, nullable
- `created_at`: timestamp with time zone

References:
- `batch_id` refers to `migration_batches`
- `document_id` refers to `documents`

### notice_items

File: `data/notice_items.ndjson`. Ordered by id.

- `id`: uuid
- `set_id`: uuid
- `requirement_key`: text
- `requirement_version`: integer
- `source`: text
- `channel`: text
- `recipient_key`: text, nullable
- `recipient_name`: text, nullable
- `recipient_address`: text, nullable
- `roles`: text[]
- `due_on`: date
- `counting_method`: text

References:
- `set_id` refers to `notice_sets`

### notice_proof_supersessions

File: `data/notice_proof_supersessions.ndjson`. Ordered by proof_id.

- `proof_id`: uuid
- `superseded_by_proof_id`: uuid
- `recorded_at`: timestamp with time zone

References:
- `proof_id` refers to `notice_proofs`
- `superseded_by_proof_id` refers to `notice_proofs`

### notice_proofs

File: `data/notice_proofs.ndjson`. Ordered by id.

- `id`: uuid
- `item_id`: uuid
- `method`: text
- `reference`: text, nullable
- `effective_on`: date
- `document_id`: uuid
- `recorded_by`: uuid
- `recorded_at`: timestamp with time zone

References:
- `item_id` refers to `notice_items`

### notice_sets

File: `data/notice_sets.ndjson`. Ordered by id.

- `id`: uuid
- `subject_kind`: text
- `subject_id`: uuid
- `application_id`: uuid, nullable
- `anchor_date`: date
- `inherited_from`: uuid, nullable
- `created_at`: timestamp with time zone

### notification_outbox

File: `data/notification_outbox.ndjson`. Ordered by id.

- `id`: uuid
- `event`: text
- `application_id`: uuid
- `recipient_user_id`: uuid
- `payload`: jsonb
- `status`: text
- `drop_reason`: text, nullable
- `attempts`: integer
- `created_at`: timestamp with time zone
- `sent_at`: timestamp with time zone, nullable

References:
- `application_id` refers to `applications`

### order_court_steps

File: `data/order_court_steps.ndjson`. Ordered by id.

- `id`: uuid
- `order_id`: uuid
- `kind`: text
- `occurred_on`: date
- `court`: text
- `docket`: text, nullable
- `document_id`: uuid
- `judgment_outcome`: text, nullable
- `appeal_due`: jsonb, nullable
- `recorded_by`: uuid
- `created_at`: timestamp with time zone

References:
- `order_id` refers to `enforcement_orders`
- `document_id` refers to `documents`

### order_service_events

File: `data/order_service_events.ndjson`. Ordered by id.

- `id`: uuid
- `order_id`: uuid
- `recipient_id`: uuid, nullable
- `method`: text
- `served_on`: date
- `server_name`: text, nullable
- `server_role`: text, nullable
- `newspaper`: text, nullable
- `proof_document_id`: uuid
- `recorded_by`: uuid
- `created_at`: timestamp with time zone

References:
- `order_id` refers to `enforcement_orders`
- `recipient_id` refers to `order_service_recipients`
- `proof_document_id` refers to `documents`

### order_service_recipients

File: `data/order_service_recipients.ndjson`. Ordered by id.

- `id`: uuid
- `order_id`: uuid
- `role`: text
- `name`: text
- `address`: text
- `source`: text
- `answer_due`: jsonb, nullable
- `answered_on`: date, nullable
- `answer_document_id`: uuid, nullable

References:
- `order_id` refers to `enforcement_orders`
- `answer_document_id` refers to `documents`

### order_service_role_checks

File: `data/order_service_role_checks.ndjson`. Ordered by order_id, role.

- `order_id`: uuid
- `role`: text
- `outcome`: text
- `basis`: text
- `checked_by`: uuid
- `checked_on`: date

References:
- `order_id` refers to `enforcement_orders`

### parcel_aliases

File: `data/parcel_aliases.ndjson`. Ordered by id.

- `id`: uuid
- `parcel_id`: uuid
- `format`: text
- `value`: text
- `value_normalized`: text
- `status`: text
- `source`: text
- `retired_on`: date, nullable
- `retired_reason`: text, nullable
- `created_at`: timestamp with time zone

References:
- `parcel_id` refers to `parcels`
- `format` refers to `parcel_id_formats`

### parcel_id_formats

File: `data/parcel_id_formats.ndjson`. Ordered by key.

- `key`: text
- `label`: text
- `kind`: text
- `width`: integer, nullable
- `is_display`: boolean

### parcel_lineage_events

File: `data/parcel_lineage_events.ndjson`. Ordered by id.

- `id`: uuid
- `kind`: text
- `effective_date`: date
- `effective_basis`: text
- `reference`: text, nullable
- `note`: text, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone

### parcel_lineage_links

File: `data/parcel_lineage_links.ndjson`. Ordered by event_id, parcel_id, role.

- `event_id`: uuid
- `parcel_id`: uuid
- `role`: text

References:
- `event_id` refers to `parcel_lineage_events`
- `parcel_id` refers to `parcels`

### parcel_record_carry_forwards

File: `data/parcel_record_carry_forwards.ndjson`. Ordered by link_id, to_parcel_id.

- `link_id`: uuid
- `to_parcel_id`: uuid
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `link_id` refers to `parcel_record_links`
- `to_parcel_id` refers to `parcels`

### parcel_record_links

File: `data/parcel_record_links.ndjson`. Ordered by id.

- `id`: uuid
- `record_kind`: text
- `record_id`: uuid
- `parcel_id`: uuid, nullable
- `raw_ref_format`: text, nullable
- `raw_ref_value`: text, nullable
- `status`: text
- `linked_via`: text, nullable
- `created_at`: timestamp with time zone

References:
- `parcel_id` refers to `parcels`

Typed references:
- `record_id` by `record_kind`: application to `applications`, inspection to `inspections`, document to `documents`, historical_record to `historical_records`, enforcement_case to `enforcement_cases`

### parcels

File: `data/parcels.ndjson`. Ordered by id.

- `id`: uuid
- `geom`: geometry(MultiPolygon, 4326), nullable
- `site_address`: text, nullable
- `owner_name`: text, nullable
- `mailing_address`: text, nullable
- `status`: text
- `retired_on`: date, nullable
- `created_at`: timestamp with time zone
- `updated_at`: timestamp with time zone

### park_rosters

File: `data/park_rosters.ndjson`. Ordered by id.

- `id`: uuid
- `parcel_id`: uuid
- `park_name`: text
- `owner_name`: text
- `owner_mailing_address`: text
- `tenants`: jsonb
- `as_of`: date
- `checked_on`: date, nullable
- `ended_on`: date, nullable
- `ended_at`: timestamp with time zone, nullable
- `updated_by`: uuid
- `updated_at`: timestamp with time zone

References:
- `parcel_id` refers to `parcels`

### payment_attempt_transitions

File: `data/payment_attempt_transitions.ndjson`. Ordered by id.

- `id`: uuid
- `attempt_id`: uuid
- `from_state`: text
- `to_state`: text
- `source`: text
- `event_id`: text, nullable
- `at`: timestamp with time zone

References:
- `attempt_id` refers to `payment_attempts`

### payment_attempts

File: `data/payment_attempts.ndjson`. Ordered by id.

- `id`: uuid
- `processor_account_id`: uuid
- `channel`: text
- `state`: text
- `outcome_unknown`: boolean
- `base_cents`: integer
- `convenience_fee_cents`: integer
- `amount_cents`: integer
- `planned_allocations`: jsonb
- `payer_name`: text
- `payer_email`: text, nullable
- `payer_user_id`: uuid, nullable
- `checkout_ref`: text, nullable
- `processor_object_id`: text, nullable
- `idempotency_key`: text
- `anomaly`: text, nullable
- `last_check_error`: text, nullable
- `last_checked_at`: timestamp with time zone, nullable
- `created_by_user_id`: uuid, nullable
- `manual_outcome`: text, nullable
- `manual_note`: text, nullable
- `manual_by_user_id`: uuid, nullable
- `manual_at`: timestamp with time zone, nullable
- `processor_mismatch`: text, nullable
- `created_at`: timestamp with time zone
- `updated_at`: timestamp with time zone
- `row_version`: integer

References:
- `processor_account_id` refers to `processor_accounts`

### peril_certifications

File: `data/peril_certifications.ndjson`. Ordered by id.

- `id`: uuid
- `appeal_id`: uuid
- `certified_on`: date
- `certified_by`: uuid
- `categories`: text[]
- `statement`: text

References:
- `appeal_id` refers to `enforcement_appeals`

### preservation_records

File: `data/preservation_records.ndjson`. Ordered by id.

- `id`: uuid
- `original_version_id`: uuid
- `required`: boolean
- `status`: text
- `reason`: text, nullable
- `detail`: text, nullable
- `attempts`: integer
- `pdfa_version_id`: uuid, nullable
- `updated_at`: timestamp with time zone

References:
- `original_version_id` refers to `document_versions`
- `pdfa_version_id` refers to `document_versions`

### processor_accounts

File: `data/processor_accounts.ndjson`. Ordered by id.

- `id`: uuid
- `processor`: text
- `mode`: text
- `account_ref`: text
- `settings`: jsonb
- `created_by`: uuid
- `created_at`: timestamp with time zone

Omitted columns: `credentials_enc`, `webhook_secret_enc`, `is_active`

### processor_events

File: `data/processor_events.ndjson`. Ordered by id.

- `id`: uuid
- `processor_account_id`: uuid
- `event_id`: text
- `type`: text
- `object_id`: text, nullable
- `received_at`: timestamp with time zone
- `processed_at`: timestamp with time zone, nullable
- `outcome`: text, nullable

References:
- `processor_account_id` refers to `processor_accounts`

Omitted columns: `raw`

### project_parties

File: `data/project_parties.ndjson`. Ordered by id.

- `id`: uuid
- `project_id`: uuid
- `user_id`: uuid, nullable
- `email`: citext, nullable
- `name`: text
- `role`: text
- `owner_authorization_on_file`: boolean
- `added_by`: uuid
- `added_at`: timestamp with time zone
- `removed_at`: timestamp with time zone, nullable

References:
- `project_id` refers to `projects`

### projects

File: `data/projects.ndjson`. Ordered by id.

- `id`: uuid
- `parcel_id`: uuid
- `title`: text
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `parcel_id` refers to `parcels`

### receipt_number_counters

File: `data/receipt_number_counters.ndjson`. Ordered by year.

- `year`: integer
- `last`: integer

### receipts

File: `data/receipts.ndjson`. Ordered by id.

- `id`: uuid
- `number`: text
- `kind`: text
- `issued_at`: timestamp with time zone
- `business_date`: date
- `payer_name`: text
- `payer_email`: citext, nullable
- `total_cents`: integer
- `tendered_cents`: integer, nullable
- `change_cents`: integer, nullable
- `simulated`: boolean

### record_events

File: `data/record_events.ndjson`. Ordered by id.

- `id`: uuid
- `project_id`: uuid, nullable
- `case_id`: uuid, nullable
- `application_id`: uuid, nullable
- `kind`: text
- `occurred_on`: date
- `recorded_by_kind`: text
- `recorded_by`: uuid, nullable
- `note`: text, nullable

References:
- `project_id` refers to `projects`
- `case_id` refers to `enforcement_cases`
- `application_id` refers to `applications`

### redaction_boxes

File: `data/redaction_boxes.ndjson`. Ordered by id.

- `id`: uuid
- `job_id`: uuid
- `page`: integer, nullable
- `pdf_box`: jsonb, nullable
- `image_box`: jsonb, nullable
- `exemption_key`: text
- `other_citation`: text, nullable
- `explanation`: text

References:
- `job_id` refers to `redaction_jobs`

### redaction_jobs

File: `data/redaction_jobs.ndjson`. Ordered by id.

- `id`: uuid
- `document_id`: uuid
- `source_version_id`: uuid
- `purpose`: text
- `rtk_request_id`: uuid, nullable
- `status`: text
- `failure_reason`: text, nullable
- `result_version_id`: uuid, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone
- `finished_at`: timestamp with time zone, nullable

References:
- `document_id` refers to `documents`
- `source_version_id` refers to `document_versions`
- `rtk_request_id` refers to `rtk_requests`
- `result_version_id` refers to `document_versions`

### refund_requests

File: `data/refund_requests.ndjson`. Ordered by refund_object_id.

- `refund_object_id`: text
- `entry_id`: uuid
- `allocations`: jsonb
- `created_at`: timestamp with time zone

References:
- `entry_id` refers to `ledger_entries`

### regional_impact_determinations

File: `data/regional_impact_determinations.ndjson`. Ordered by application_id.

- `application_id`: uuid
- `determination`: text
- `previous_board_ref`: text, nullable
- `determined_on`: date
- `determined_by`: uuid

References:
- `application_id` refers to `applications`

### regional_impact_notices

File: `data/regional_impact_notices.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `recipient_kind`: text
- `recipient_name`: text
- `method`: text
- `mailed_on`: date
- `reference`: text, nullable
- `recorded_by`: uuid
- `recorded_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### regional_impact_parties

File: `data/regional_impact_parties.ndjson`. Ordered by application_id, municipality_key.

- `application_id`: uuid
- `municipality_key`: text

References:
- `application_id` refers to `applications`

### reliance_links

File: `data/reliance_links.ndjson`. Ordered by variance_application_id, planning_application_id.

- `variance_application_id`: uuid
- `planning_application_id`: uuid
- `resolved_on`: date, nullable

References:
- `variance_application_id` refers to `applications`
- `planning_application_id` refers to `applications`

### remediation_tasks

File: `data/remediation_tasks.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `kind`: text
- `description`: text
- `status`: text
- `transition_id`: text
- `created_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### rendition_approvals

File: `data/rendition_approvals.ndjson`. Ordered by id.

- `id`: uuid
- `document_id`: uuid
- `version_id`: uuid
- `purpose`: text
- `rtk_request_id`: uuid, nullable
- `approved_by_kind`: text
- `approved_by`: uuid, nullable
- `approved_at`: timestamp with time zone
- `review_statement`: text
- `revoked_at`: timestamp with time zone, nullable
- `revoked_by`: uuid, nullable
- `revoke_reason`: text, nullable

References:
- `document_id` refers to `documents`
- `version_id` refers to `document_versions`
- `rtk_request_id` refers to `rtk_requests`

### restraining_orders

File: `data/restraining_orders.ndjson`. Ordered by id.

- `id`: uuid
- `appeal_id`: uuid
- `issued_by`: text
- `issued_on`: date
- `document_id`: uuid
- `dissolved_on`: date, nullable

References:
- `appeal_id` refers to `enforcement_appeals`
- `document_id` refers to `documents`

### restriction_holdings

File: `data/restriction_holdings.ndjson`. Ordered by id.

- `id`: uuid
- `parcel_id`: uuid
- `holder_name`: text
- `holder_mailing_address`: text
- `restriction_kind`: text
- `recorded_reference`: text
- `ended_on`: date, nullable
- `ended_at`: timestamp with time zone, nullable
- `checked_on`: date, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `parcel_id` refers to `parcels`

### retention_assignments

File: `data/retention_assignments.ndjson`. Ordered by id.

- `id`: uuid
- `record_kind`: text
- `record_id`: uuid
- `series_key`: text
- `series_version`: integer
- `reason`: text
- `assigned_by_kind`: text
- `assigned_by`: uuid, nullable
- `assigned_at`: timestamp with time zone
- `superseded_at`: timestamp with time zone, nullable

Typed references:
- `record_id` by `record_kind`: document to `documents`, application_snapshot to `application_snapshots`

### review_assignments

File: `data/review_assignments.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `reviewer_user_id`: uuid, nullable
- `board_id`: uuid, nullable
- `comment_by`: date, nullable
- `assigned_by`: uuid
- `assigned_at`: timestamp with time zone
- `removed_at`: timestamp with time zone, nullable
- `status`: text
- `signed_off_at`: timestamp with time zone, nullable

References:
- `application_id` refers to `applications`
- `board_id` refers to `boards`

### review_comments

File: `data/review_comments.ndjson`. Ordered by id.

- `id`: uuid
- `assignment_id`: uuid
- `author_user_id`: uuid, nullable
- `body`: text
- `created_at`: timestamp with time zone

References:
- `assignment_id` refers to `review_assignments`

### role_capabilities

File: `data/role_capabilities.ndjson`. Ordered by role, capability.

- `role`: text
- `capability`: text

### roster_reviews

File: `data/roster_reviews.ndjson`. Ordered by id.

- `id`: uuid
- `kind`: text
- `reviewed_on`: date
- `reviewed_by`: uuid
- `recorded_at`: timestamp with time zone

### rtk_release_items

File: `data/rtk_release_items.ndjson`. Ordered by release_id, document_id.

- `release_id`: uuid
- `document_id`: uuid
- `version_id`: uuid, nullable
- `former_version_id`: uuid, nullable
- `approval_id`: uuid, nullable
- `position`: integer
- `withdrawn_at`: timestamp with time zone, nullable
- `withdrawn_reason`: text, nullable

References:
- `release_id` refers to `rtk_releases`
- `document_id` refers to `documents`
- `version_id` refers to `document_versions`
- `approval_id` refers to `rendition_approvals`

### rtk_releases

File: `data/rtk_releases.ndjson`. Ordered by id.

- `id`: uuid
- `request_id`: uuid
- `sequence`: integer
- `released_on`: date
- `method`: text
- `letter_document_id`: uuid, nullable
- `released_by`: uuid
- `link_expires_at`: timestamp with time zone, nullable
- `link_revoked_at`: timestamp with time zone, nullable
- `created_at`: timestamp with time zone

References:
- `request_id` refers to `rtk_requests`
- `letter_document_id` refers to `documents`

Omitted columns: `link_token_hash`

### rtk_requests

File: `data/rtk_requests.ndjson`. Ordered by id.

- `id`: uuid
- `number`: text
- `received_on`: date
- `received_via`: text
- `requester_name`: text, nullable
- `requester_contact`: text, nullable
- `description`: text
- `status`: text
- `response_due`: jsonb
- `stated_due`: jsonb, nullable
- `open_due_on`: date, nullable
- `first_response_on`: date, nullable
- `first_response_kind`: text, nullable
- `first_response_url`: text, nullable
- `created_by`: uuid
- `created_at`: timestamp with time zone
- `row_version`: integer

### rtk_time_statements

File: `data/rtk_time_statements.ndjson`. Ordered by id.

- `id`: uuid
- `request_id`: uuid
- `stated_on`: date
- `stated_date`: date
- `delay_reason`: text
- `cost_estimate`: jsonb

References:
- `request_id` refers to `rtk_requests`

### rtk_withholdings

File: `data/rtk_withholdings.ndjson`. Ordered by id.

- `id`: uuid
- `request_id`: uuid
- `release_id`: uuid, nullable
- `scope`: text
- `document_id`: uuid, nullable
- `record_description`: text
- `exemption_key`: text
- `other_citation`: text, nullable
- `explanation`: text
- `created_by`: uuid
- `created_at`: timestamp with time zone

References:
- `request_id` refers to `rtk_requests`
- `release_id` refers to `rtk_releases`

### rule_transitions_applied

File: `data/rule_transitions_applied.ndjson`. Ordered by id.

- `id`: text
- `applied_at`: timestamp with time zone
- `applied_by`: text
- `affected`: integer

### selectmen_certifications

File: `data/selectmen_certifications.ndjson`. Ordered by id.

- `id`: uuid
- `application_id`: uuid
- `requested_on`: date
- `outcome`: text
- `decided_on`: date, nullable
- `recorded_by`: uuid
- `recorded_at`: timestamp with time zone

References:
- `application_id` refers to `applications`

### town_settings

File: `data/town_settings.ndjson`. Ordered by id.

- `id`: integer
- `name`: text
- `state_code`: text
- `time_zone`: text
- `basemap_raster_url`: text, nullable
- `basemap_attribution`: text, nullable
- `service_status`: text
- `service_status_since`: date, nullable
- `export_window_days`: integer
- `anonymous_intake_enabled`: boolean
- `updated_at`: timestamp with time zone

### trc_routings

File: `data/trc_routings.ndjson`. Ordered by application_id, department_key.

- `application_id`: uuid
- `department_key`: text
- `assignment_id`: uuid
- `comment_due`: date, nullable

References:
- `application_id` refers to `applications`
- `assignment_id` refers to `review_assignments`

### user_roles

File: `data/user_roles.ndjson`. Ordered by user_id, role.

- `user_id`: uuid
- `role`: text

References:
- `user_id` refers to `users`

### users

File: `data/users.ndjson`. Ordered by id.

- `id`: uuid
- `email`: citext
- `display_name`: text
- `kind`: text
- `is_active`: boolean
- `created_at`: timestamp with time zone

Omitted columns: `password_hash`, `totp_secret_enc`, `totp_enabled`, `totp_last_counter`

### violation_findings

File: `data/violation_findings.ndjson`. Ordered by id.

- `id`: uuid
- `case_id`: uuid
- `provision_kind`: text
- `provision_ref`: text
- `facts`: text
- `inspection_date`: date
- `found_on`: date
- `found_by`: uuid
- `status`: text

References:
- `case_id` refers to `enforcement_cases`

### violation_notices

File: `data/violation_notices.ndjson`. Ordered by id.

- `id`: uuid
- `case_id`: uuid
- `finding_ids`: uuid[]
- `sent_on`: date
- `method`: text
- `sent_by`: uuid
- `received_on`: date, nullable
- `receipt_basis`: text, nullable
- `document_id`: uuid, nullable

References:
- `case_id` refers to `enforcement_cases`
- `document_id` refers to `documents`
