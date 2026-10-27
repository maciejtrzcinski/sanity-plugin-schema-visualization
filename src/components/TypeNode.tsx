import {ChevronDownIcon} from '@sanity/icons/ChevronDown'
import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {InfoOutlineIcon} from '@sanity/icons/InfoOutline'
import {WarningOutlineIcon} from '@sanity/icons/WarningOutline'
import {Badge, Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'
import {Handle, Position} from '@xyflow/react'
import {memo} from 'react'

import {useConfig, useKind} from '../config'
import {nodeBadgeContext, type TypeNodeData} from '../flowModel'
import {severityTone} from '../healthRules'
import {useTranslate} from '../hooks/useTranslate'
import {MAX_VISIBLE_FIELDS, NODE_WIDTH} from '../layout'
import {collectNodeBadges} from '../nodeBadges'
import {NodeBadgeChip} from './NodeBadgeChip'

function TypeNodeComponent({
  data,
  selected,
  // `layoutGraph` picks these off the layout direction. React Flow hands them
  // to a custom node but doesn't place its handles for it, so the sides have to
  // be forwarded to the `Handle`s below — that's what React Flow measures when
  // it routes an edge.
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: {
  data: TypeNodeData
  selected?: boolean
  sourcePosition?: Position
  targetPosition?: Position
}) {
  const {node, expanded, warningCount, infoCount, onToggleExpand} = data
  const {nodeBadges} = useConfig()
  const kind = useKind(node.kind)
  const t = useTranslate()
  const Icon = kind.icon
  const canExpand = node.fields.length > 0
  // One badge for both severities, painted from the worse of the two — a card
  // carrying nothing but advisory notes shouldn't read as a warning.
  const issueCount = warningCount + infoCount
  const worstSeverity = warningCount > 0 ? 'warning' : 'info'
  const IssueIcon = warningCount > 0 ? WarningOutlineIcon : InfoOutlineIcon
  const issueSummary = [
    warningCount > 0 && t('card.warnings', {count: warningCount}),
    infoCount > 0 && t('card.notes', {count: infoCount}),
  ]
    .filter(Boolean)
    .join(' · ')

  const badges = collectNodeBadges(node, nodeBadgeContext(data, t), nodeBadges)

  return (
    <Card
      radius={3}
      shadow={selected ? 3 : 1}
      tone={kind.tone}
      style={{
        // Must match what `layoutGraph` reserves per node, or dagre's spacing
        // won't line up with what's actually painted.
        width: NODE_WIDTH,
        border: selected
          ? '2px solid var(--card-focus-ring-color, #2276fc)'
          : '1px solid transparent',
        transition: 'box-shadow 120ms ease',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={targetPosition} style={{visibility: 'hidden'}} />
      <Handle type="source" position={sourcePosition} style={{visibility: 'hidden'}} />

      <Box
        padding={3}
        style={{borderBottom: expanded ? '1px solid var(--card-border-color)' : undefined}}
      >
        <Flex align="center" gap={2}>
          {canExpand ? (
            <Button
              icon={expanded ? ChevronDownIcon : ChevronRightIcon}
              mode="bleed"
              padding={1}
              aria-label={expanded ? t('card.collapse-fields') : t('card.expand-fields')}
              onClick={(event) => {
                event.stopPropagation()
                onToggleExpand(node.id)
              }}
            />
          ) : (
            <Icon />
          )}
          <Stack gap={1} flex={1} style={{minWidth: 0}}>
            <Text size={1} weight="semibold" textOverflow="ellipsis">
              {node.title}
            </Text>
            {node.title !== node.name && (
              <Text size={0} muted textOverflow="ellipsis">
                {node.name}
              </Text>
            )}
          </Stack>
          {issueCount > 0 && (
            <Tooltip
              content={
                <Box padding={2}>
                  <Text size={1}>{issueSummary}</Text>
                </Box>
              }
            >
              <Badge tone={severityTone(worstSeverity)} fontSize={0} padding={2} radius={6}>
                <Flex align="center" gap={1}>
                  <IssueIcon />
                  {issueCount}
                </Flex>
              </Badge>
            </Tooltip>
          )}
          <Badge tone={kind.tone} fontSize={0}>
            {node.baseType}
          </Badge>
        </Flex>
        {badges.length > 0 && (
          // `badgeRowHeight` reserves space for exactly this list, over the
          // same registry and the same context — so a badge added to the
          // registry is measured without touching `layout.ts`. The `gap={1}`
          // here is the `BADGE_GAP` it assumes.
          <Flex gap={1} marginTop={2} align="center" wrap="wrap">
            {badges.map((badge) => (
              <NodeBadgeChip key={badge.id} badge={badge} fontSize={0} />
            ))}
          </Flex>
        )}
      </Box>

      {expanded && node.fields.length > 0 && (
        // No height clamp here: `estimateNodeHeight` reserves space for exactly
        // the rows rendered below, and the two must agree or dagre's spacing
        // won't match what's painted.
        <Box padding={2}>
          <Stack gap={1}>
            {node.fields.slice(0, MAX_VISIBLE_FIELDS).map((field) => (
              <Flex key={field.name} align="center" gap={2} padding={1}>
                <Text
                  size={1}
                  style={{minWidth: 0, flexShrink: 0, fontFamily: 'var(--font-family-monospace)'}}
                >
                  {field.name}
                </Text>
                <Text size={0} muted textOverflow="ellipsis" style={{flex: 1, minWidth: 0}}>
                  {field.typeLabel}
                </Text>
                {field.options.length > 0 && (
                  <Flex gap={1} flex="none">
                    {field.options.slice(0, 2).map((opt) => (
                      <Badge
                        key={opt.id}
                        tone={opt.tone === 'default' ? undefined : opt.tone}
                        fontSize={0}
                        padding={1}
                      >
                        {opt.label}
                      </Badge>
                    ))}
                  </Flex>
                )}
              </Flex>
            ))}
            {node.fields.length > MAX_VISIBLE_FIELDS && (
              <Box padding={1}>
                <Text size={0} muted>
                  {t('card.more-fields', {count: node.fields.length - MAX_VISIBLE_FIELDS})}
                </Text>
              </Box>
            )}
          </Stack>
        </Box>
      )}

      {node.isLeaf && (
        <Box padding={3}>
          <Text size={0} muted>
            {t('card.leaf-note')}
          </Text>
        </Box>
      )}
    </Card>
  )
}

export const TypeNode = memo(TypeNodeComponent)
