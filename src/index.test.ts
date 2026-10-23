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

    // The same object the core translates against, so a key can't be defined
    // for the Studio and missing from `defaultTranslate`.
    expect(await resources()).toBe(enUSResources)
  })
})

describe('entry points', () => {
  it('keeps the root to what a sanity.config.ts needs', () => {
    // This is the module every Studio that installs the plugin runs at boot.
    // A re-export added here is a re-export every one of them downloads,
    // opened tool or not — the extensibility surface lives in `/registry`.
    expect(Object.keys(rootEntry).sort()).toEqual([
      'I18N_NAMESPACE',
      'enUSLocaleBundle',
      'schemaVisualization',
    ])
  })
})

describe('the /registry entry point', () => {
  it('publishes exactly this surface', () => {
    // Every name here is a promise — `@public` ones until the next major. A new
    // export should show up in review as a change to this list, not slip out
    // unnoticed; release tags themselves are checked by `pkg-utils --strict`.
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
