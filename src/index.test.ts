import {describe, expect, it} from 'vitest'

import * as registryEntry from './exports/registry'
import {enUSResources} from './i18n'
import {I18N_NAMESPACE} from './i18nNamespace'
import * as rootEntry from './index'
import {enUSLocaleBundle, schemaVisualization} from './index'

describe('schemaVisualization', () => {
  it('ships its English bundle, so a Studio has something to translate from', () => {
    const plugin = schemaVisualization()

    expect(plugin.i18n?.bundles).toEqual([enUSLocaleBundle])
    expect(enUSLocaleBundle.namespace).toBe(I18N_NAMESPACE)
    expect(enUSLocaleBundle.locale).toBe('en-US')
  })

  it('hands the Studio a loader, so the strings stay out of its entry chunk', async () => {
    const {resources} = enUSLocaleBundle
    if (typeof resources !== 'function') {
      throw new Error('`resources` is the eager form — the strings are back in the entry chunk')
    }

    expect(await resources()).toBe(enUSResources)
  })
})

describe('entry points', () => {
  it('keeps the root to what a sanity.config.ts needs', () => {
    // Every Studio runs this entry at boot; the extensibility surface lives in `/registry`.
    expect(Object.keys(rootEntry).sort()).toEqual([
      'I18N_NAMESPACE',
      'enUSLocaleBundle',
      'schemaVisualization',
    ])
  })
})

describe('the /registry entry point', () => {
  it('publishes exactly this surface', () => {
    expect(Object.keys(registryEntry).sort()).toMatchInlineSnapshot(`
      [
        "GRAPH_JSON_VERSION",
        "arrayDescriber",
        "attributePathsRule",
        "computeHealthIssues",
        "connectivityFilter",
        "createAttributePathsRule",
        "createDefaultFilters",
        "createKindsFilter",
        "crossDatasetReferenceDescriber",
        "defaultEdgeKinds",
        "defaultFieldBadges",
        "defaultFieldDescribers",
        "defaultHealthRules",
        "defaultNodeBadges",
        "defaultNodeKinds",
        "deprecatedBadge",
        "deprecatedFilter",
        "deprecatedTargetRule",
        "deprecatedTypeBadge",
        "docCountBadge",
        "documentKind",
        "emptyDocumentTypeRule",
        "enUSResources",
        "externalReferenceKind",
        "fallbackDescriber",
        "fieldSummaryBadge",
        "fromSanityLint",
        "globalDocumentReferenceDescriber",
        "graphToJson",
        "graphToMermaid",
        "healthFilter",
        "hiddenBadge",
        "hotspotBadge",
        "initialValueBadge",
        "initialValueTypeBadge",
        "insertBefore",
        "layoutBadge",
        "listBadge",
        "namedTypeDescriber",
        "objectDescriber",
        "objectKind",
        "orphanedTypeRule",
        "otherKind",
        "previewDereferenceRule",
        "readOnlyBadge",
        "referenceDescriber",
        "referenceKind",
        "referenceTargetRule",
        "replaceById",
        "requiredBadge",
        "requiredHiddenRule",
        "reusesKind",
        "schemaToGraph",
        "slugWithoutSourceRule",
        "sourceBadge",
        "systemBadge",
        "systemTypesFilter",
        "validationBadge",
        "without",
      ]
    `)
  })
})
