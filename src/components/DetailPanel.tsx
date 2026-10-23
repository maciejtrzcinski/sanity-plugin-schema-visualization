import {AddIcon} from '@sanity/icons/Add'
import {CloseIcon} from '@sanity/icons/Close'
import {FilterIcon} from '@sanity/icons/Filter'
import {WarningOutlineIcon} from '@sanity/icons/WarningOutline'
import {Badge, Box, Button, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {useId, useMemo} from 'react'
import {useIntentLink} from 'sanity/router'

import {useConfig, useEdgeKind, useKind} from '../config'
import type {CreateDocumentTarget} from '../createDocument'
import {edgeBadgeLabel} from '../edgeKinds'
import {severityTone, type HealthIssue} from '../healthRules'
import {useTranslate} from '../hooks/useTranslate'
import type {TranslateFn} from '../i18n'
import {NO_ANNOTATIONS, type NodeAnnotations} from '../nodeAnnotations'
import {collectNodeBadges} from '../nodeBadges'
import type {FieldSummary, GraphEdge, GraphNode} from '../types'
import {NodeBadgeChip} from './NodeBadgeChip'

const CONNECTION_ROW_CLASS = 'sv-connection-row'

/**
 * A connection row is one big button. Plain CSS rather than `Card as="button"`:
 * the card drops its border when rendered as a button, and its hover tint is
 * too faint to read as clickable.
 */
const CONNECTION_ROW_CSS = `
.${CONNECTION_ROW_CLASS} {
  appearance: none;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: inherit;
  background: transparent;
  border: 1px solid var(--card-border-color);
  border-radius: 3px;
  cursor: pointer;
}
.${CONNECTION_ROW_CLASS}:hover {
  background: color-mix(in srgb, var(--card-focus-ring-color) 12%, transparent);
  border-color: var(--card-focus-ring-color);
}
.${CONNECTION_ROW_CLASS}:focus-visible {
  outline: 2px solid var(--card-focus-ring-color);
  outline-offset: 1px;
}
`

export interface DetailPanelProps {
  node: GraphNode
  edges: GraphEdge[]
  issues: HealthIssue[]
  isFocused: boolean
  /** Per-node data loaded after the graph was built — see `NodeAnnotations`. */
  annotations?: NodeAnnotations
  /** Where "New <type>" leads; omitted when the Studio wouldn't offer it — see `useCreateDocumentTarget`. */
  createDocument?: CreateDocumentTarget
  onClose: () => void
  onNavigate: (nodeId: string) => void
  onToggleFocus: () => void
}

export function DetailPanel({
  node,
  edges,
  issues,
  isFocused,
  annotations = NO_ANNOTATIONS,
  createDocument,
  onClose,
  onNavigate,
  onToggleFocus,
}: DetailPanelProps) {
  const kind = useKind(node.kind)
  const {nodeBadges} = useConfig()
  const t = useTranslate()
  const outgoing = useMemo(() => edges.filter((e) => e.source === node.id), [edges, node.id])
  const incoming = useMemo(
    () => edges.filter((e) => e.target === node.id && e.source !== node.id),
    [edges, node.id],
  )

  // The same registry the cards paint, so a badge a consumer registers shows
  // up here too. `expanded` is always true: the panel lists every field, so
  // the collapsed card's "N fields" summary would only repeat the heading.
  const badges = useMemo(() => {
    const warningCount = issues.filter((issue) => issue.severity === 'warning').length
    return collectNodeBadges(
      node,
      {
        t,
        annotations,
        connectionCount: outgoing.length + incoming.length,
        issueCount: issues.length,
        warningCount,
        infoCount: issues.length - warningCount,
        expanded: true,
        surface: 'panel',
      },
      nodeBadges,
    )
  }, [node, annotations, outgoing, incoming, issues, nodeBadges, t])

  return (
    <Card
      shadow={3}
      style={{width: 320, height: '100%', overflowY: 'auto', flexShrink: 0}}
      borderLeft
    >
      <style>{CONNECTION_ROW_CSS}</style>
      <Box padding={4}>
        <Flex align="flex-start" justify="space-between" gap={2}>
          <Stack gap={2}>
            <Heading size={1}>{node.title}</Heading>
            {node.title !== node.name && (
              <Text size={1} muted style={{fontFamily: 'var(--font-family-monospace)'}}>
                {node.name}
              </Text>
            )}
          </Stack>
          <Button icon={CloseIcon} mode="bleed" onClick={onClose} aria-label={t('detail.close')} />
        </Flex>

        <Box marginTop={3}>
          <Flex gap={2} align="center" wrap="wrap">
            <Badge tone={kind.tone}>{node.baseType}</Badge>
            {badges.map((badge) => (
              <NodeBadgeChip key={badge.id} badge={badge} />
            ))}
          </Flex>
        </Box>

        {node.groups && node.groups.length > 0 && (
          <Box marginTop={3}>
            <Text size={1} muted>
              {t('detail.groups', {
                groups: node.groups
                  .map((group) => {
                    const title = group.title ?? group.name
                    return group.isDefault ? t('detail.group-default', {title}) : title
                  })
                  .join(t('detail.list-separator')),
              })}
            </Text>
          </Box>
        )}

        <Box marginTop={3}>
          <Button
            icon={FilterIcon}
            mode={isFocused ? 'default' : 'ghost'}
            tone={isFocused ? 'primary' : undefined}
            text={isFocused ? t('detail.focus-on') : t('detail.focus-off')}
            fontSize={1}
            onClick={onToggleFocus}
            style={{width: '100%'}}
          />
        </Box>

        {createDocument && (
          <Box marginTop={2}>
            <CreateDocumentButton
              target={createDocument}
              label={t('detail.create-document', {title: node.title})}
            />
          </Box>
        )}

        <Stack gap={4} marginTop={5}>
          {issues.length > 0 && (
            <Stack gap={3}>
              <Flex align="center" gap={2}>
                <WarningOutlineIcon />
                <Text size={1} weight="semibold">
                  {t('detail.issues', {count: issues.length})}
                </Text>
              </Flex>
              <Stack gap={2}>
                {issues.map((issue) => (
                  <Card
                    key={issue.id}
                    padding={3}
                    radius={2}
                    tone={severityTone(issue.severity)}
                    border
                  >
                    <Text size={1}>{issue.message}</Text>
                  </Card>
                ))}
              </Stack>
            </Stack>
          )}

          <Stack gap={3}>
            <Text size={1} weight="semibold">
              {t('detail.fields', {count: node.fields.length})}
            </Text>
            {node.fields.length === 0 && (
              <Text size={1} muted>
                {t('detail.no-fields')}
              </Text>
            )}
            <Stack gap={4}>
              {node.fields.map((field) => (
                <Card key={field.name} padding={3} radius={2} tone="transparent" border>
                  <Stack gap={2}>
                    <Flex justify="space-between" align="center">
                      <Text
                        size={1}
                        weight="semibold"
                        style={{fontFamily: 'var(--font-family-monospace)'}}
                      >
                        {field.name}
                      </Text>
                    </Flex>
                    <Text size={1} muted>
                      {field.typeLabel}
                    </Text>
                    {(field.groups || field.fieldset) && (
                      <Text size={0} muted>
                        {fieldPlacement(field, node, t)}
                      </Text>
                    )}
                    {field.options.length > 0 && (
                      <Flex gap={1} wrap="wrap">
                        {field.options.map((opt) => (
                          <Badge
                            key={opt.id}
                            tone={opt.tone === 'default' ? undefined : opt.tone}
                            fontSize={0}
                          >
                            {opt.label}
                          </Badge>
                        ))}
                      </Flex>
                    )}
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Stack>

          <Stack gap={3}>
            <Text size={1} weight="semibold">
              {t('detail.outgoing', {count: outgoing.length})}
            </Text>
            {outgoing.length === 0 && (
              <Text size={1} muted>
                {t('detail.no-connections')}
              </Text>
            )}
            <Stack gap={2}>
              {outgoing.map((edge) => (
                <ConnectionRow
                  key={edge.id}
                  edge={edge}
                  otherId={edge.target}
                  onNavigate={onNavigate}
                />
              ))}
            </Stack>
          </Stack>

          <Stack gap={3}>
            <Text size={1} weight="semibold">
              {t('detail.incoming', {count: incoming.length})}
            </Text>
            {incoming.length === 0 && (
              <Text size={1} muted>
                {t('detail.no-connections')}
              </Text>
            )}
            <Stack gap={2}>
              {incoming.map((edge) => (
                <ConnectionRow
                  key={edge.id}
                  edge={edge}
                  otherId={edge.source}
                  onNavigate={onNavigate}
                />
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Box>
    </Card>
  )
}

/** Which group(s) and fieldset a field sits in, by their titles. */
function fieldPlacement(field: FieldSummary, node: GraphNode, t: TranslateFn): string {
  const parts: string[] = []
  if (field.groups) {
    const titleOf = (name: string) => node.groups?.find((g) => g.name === name)?.title ?? name
    parts.push(
      t('detail.field-groups', {
        groups: field.groups.map(titleOf).join(t('detail.list-separator')),
      }),
    )
  }
  if (field.fieldset) {
    const fieldset = node.fieldsets?.find((f) => f.name === field.fieldset)
    parts.push(t('detail.field-fieldset', {fieldset: fieldset?.title ?? field.fieldset}))
  }
  return parts.join(t('detail.meta-separator'))
}

/**
 * The way out of the graph and into the rest of the Studio: Sanity's `create`
 * intent, which the Structure tool answers by opening this type's document
 * list with a new document in it. An intent rather than a hand-built URL, so
 * it lands wherever the Studio's own structure puts the type — and whichever
 * tool claims it, in a Studio that replaced Structure entirely. Nothing is
 * written until the user edits the new document.
 *
 * Rendered as an anchor so it behaves like a link (middle-click, copy address)
 * rather than a button that happens to navigate.
 */
function CreateDocumentButton({target, label}: {target: CreateDocumentTarget; label: string}) {
  const {onClick, href} = useIntentLink({
    intent: 'create',
    params: target.payload ? [target.params, target.payload] : target.params,
  })

  return (
    <Button
      as="a"
      href={href}
      onClick={onClick}
      icon={AddIcon}
      mode="ghost"
      text={label}
      fontSize={1}
      style={{width: '100%'}}
    />
  )
}

function ConnectionRow({
  edge,
  otherId,
  onNavigate,
}: {
  edge: GraphEdge
  otherId: string
  onNavigate: (nodeId: string) => void
}) {
  const edgeKind = useEdgeKind(edge.kind)
  const t = useTranslate()
  const id = useId()

  return (
    <button
      type="button"
      className={CONNECTION_ROW_CLASS}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-via`}
      onClick={() => onNavigate(otherId)}
    >
      <Flex align="center" justify="space-between" gap={2} padding={2}>
        <Stack gap={2}>
          <Text
            id={`${id}-name`}
            size={1}
            weight="medium"
            style={{fontFamily: 'var(--font-family-monospace)'}}
          >
            {otherId}
          </Text>
          <Text id={`${id}-via`} size={0} muted>
            {t('detail.via', {
              path: edge.fieldPath ?? t('detail.via-field', {name: edge.fieldName}),
            })}
          </Text>
        </Stack>
        <Badge tone={edgeKind.tone} fontSize={0}>
          {edgeBadgeLabel(edge, edgeKind, t)}
        </Badge>
      </Flex>
    </button>
  )
}
