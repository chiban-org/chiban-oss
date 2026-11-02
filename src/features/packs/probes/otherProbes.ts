import type {
  CodeEditionEntry,
  GateRule,
  ProceedingClassification,
  RecordRule,
} from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { appealSuspends } from '@/features/appeals/suspension'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import {
  codeEditionPanelRows,
  describeCodeEdition,
  resolveCodeEdition,
} from '@/features/building/codeEdition'
import { effectiveBindings } from '@/features/config/bindings'
import { buildGateDefinition } from '@/features/gates/registry'
import { loadPack } from '@/features/packs/loadPack'
import { classificationSummary } from '@/features/packs/ruleSummary'
import type { CivilDate } from '@/types/civilDate'
import { ALL_POLICY_FIELDS } from './clockProbes'
import {
  classificationOf,
  editionOf,
  type FieldProbe,
  gateRule,
  packRule,
  packWith,
  probe,
} from './probe'
import { observeRule, ruleProbes } from './ruleProbes'

const d = (s: string) => s as CivilDate
const NOOP_GATE = () => Promise.resolve({ status: 'pass' as const })
const SAMPLE_RECORD = {
  receiptDate: '2027-03-01',
  completedDate: null,
  classification: 'residential',
  dwellingUnits: 1,
  editionKey: 'e',
  applicantElection: null,
  localAmendmentsInForce: [],
}

function gateProbe(mutate: (r: GateRule) => GateRule): FieldProbe {
  return probe<GateRule>({
    base: () => gateRule('nh.bp.regional_impact'),
    mutate,
    observe: (rule, original) => {
      const built = buildGateDefinition(rule, NOOP_GATE)
      const definition = {
        key: built.key,
        label: built.label,
        citation: built.citation,
        kind: built.kind,
        appliesTo: built.appliesTo,
        boundBy: built.boundBy,
      }
      return { generic: observeRule(rule, original), definition }
    },
  })
}

function recordProbe(mutate: (r: RecordRule) => RecordRule): FieldProbe {
  return probe<RecordRule>({
    base: () => {
      const rule = packRule('nh.bp.code_edition')
      if (rule.kind !== 'required_record') throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'shape')
      return rule
    },
    mutate,
    observe: (rule) => codeEditionPanelRows(rule, SAMPLE_RECORD),
  })
}

const SAMPLE_TYPE = {
  classification: 'nh.building_permit',
  bindings: [],
} as unknown as ApplicationTypeBody

function classificationProbe(
  mutate: (c: ProceedingClassification) => ProceedingClassification,
): FieldProbe {
  return probe<ProceedingClassification>({
    base: () => classificationOf('nh.building_permit'),
    mutate,
    observe: (c) => ({
      bindings: effectiveBindings(SAMPLE_TYPE, { ...loadPack(), classifications: [c] }),
      summary: classificationSummary(c, loadPack()),
    }),
  })
}

function observeEdition(entry: CodeEditionEntry): unknown {
  const prior = editionOf('nh.edition.unverified_before_2024_07_01')
  const table = [entry, prior]
  return {
    resolved: ['2024-03-01', '2024-07-01', '2024-09-01', '2025-02-01'].map((date) =>
      resolveCodeEdition(table, d(date)),
    ),
    elected: ['2024-09-01', '2025-02-01'].map((date) =>
      resolveCodeEdition(table, d(date), prior.key),
    ),
    description: describeCodeEdition(entry, d('2025-08-01')),
  }
}

function editionProbe(mutate: (e: CodeEditionEntry) => CodeEditionEntry): FieldProbe {
  return probe<CodeEditionEntry>({
    base: () => editionOf('nh.edition.2024_07_01'),
    mutate,
    observe: observeEdition,
  })
}

export function otherProbes(): Record<string, FieldProbe> {
  return {
    ...ruleProbes('gate', 'nh.bp.regional_impact', ['policy']),
    'gate.gateKind': gateProbe((r) => ({ ...r, gateKind: 'administrative' as never })),
    'gate.appliesTo': gateProbe((r) => ({ ...r, appliesTo: ['closed'] })),
    ...ruleProbes('required_record', 'nh.bp.code_edition', ALL_POLICY_FIELDS),
    'required_record.fields': recordProbe((r) => ({ ...r, fields: [...r.fields].reverse() })),
    ...ruleProbes('effect', 'nh.appeal.suspension', ALL_POLICY_FIELDS),
    'effect.effect': probe({
      base: () => packRule('nh.appeal.suspension'),
      mutate: (r) => ({ ...r, effect: 'other' as never }),
      observe: (rule) => appealSuspends(packWith([rule]), new Set([rule.key])),
    }),
    ...ruleProbes('town_setting', 'town.bp.validity', ALL_POLICY_FIELDS),
    'town_setting.unit': probe({
      base: () => packRule('town.bp.validity'),
      mutate: (r) => ({ ...r, unit: 'days' as never }),
      observe: observeRule,
    }),
    'classification.key': classificationProbe((c) => ({ ...c, key: 'nh.trade_permit' })),
    'classification.label': classificationProbe((c) => ({ ...c, label: 'Changed' })),
    'classification.mandatoryRuleKeys': classificationProbe((c) => ({
      ...c,
      mandatoryRuleKeys: c.mandatoryRuleKeys.slice(1),
    })),
    'code_edition.key': editionProbe((e) => ({ ...e, key: 'changed' })),
    'code_edition.label': editionProbe((e) => ({ ...e, label: 'Changed' })),
    'code_edition.status': editionProbe((e) => ({ ...e, status: 'unverified' })),
    'code_edition.effectiveFrom': editionProbe((e) => ({ ...e, effectiveFrom: d('2025-01-01') })),
    'code_edition.enforcementFrom': editionProbe((e) => ({
      ...e,
      enforcementFrom: d('2026-01-01'),
    })),
    'code_edition.components.code': editionProbe((e) => ({
      ...e,
      components: e.components.map((c, i) => (i === 0 ? { ...c, code: 'XYZ' } : c)),
    })),
    'code_edition.components.edition': editionProbe((e) => ({
      ...e,
      components: e.components.map((c, i) => (i === 0 ? { ...c, edition: '1999' } : c)),
    })),
    'code_edition.amendmentPackages.effectiveFrom': editionProbe((e) => ({
      ...e,
      amendmentPackages: e.amendmentPackages.map((p, i) =>
        i === 0 ? { ...p, effectiveFrom: d('2026-01-01') } : p,
      ),
    })),
    'code_edition.amendmentPackages.label': editionProbe((e) => ({
      ...e,
      amendmentPackages: e.amendmentPackages.map((p, i) =>
        i === 0 ? { ...p, label: 'Changed' } : p,
      ),
    })),
    'code_edition.electionWindow.until': editionProbe((e) => ({
      ...e,
      electionWindow:
        e.electionWindow === null ? null : { ...e.electionWindow, until: d('2024-08-01') },
    })),
    'code_edition.electionWindow.mayElect': editionProbe((e) => ({
      ...e,
      electionWindow:
        e.electionWindow === null ? null : { ...e.electionWindow, mayElect: ['other'] },
    })),
    'code_edition.citation.label': editionProbe((e) => ({
      ...e,
      citation: { ...e.citation, label: 'Changed' },
    })),
    'code_edition.citation.url': editionProbe((e) => ({
      ...e,
      citation: { ...e.citation, url: 'https://example.test/c' },
    })),
  }
}
