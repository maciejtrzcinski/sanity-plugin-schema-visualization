import {Badge, Box, Text} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'

import type {CollectedNodeBadge} from '../nodeBadges'

/**
 * One badge from the node-badge registry, on either surface that renders the
 * list — a type's card header and the detail panel. Shared so a custom badge
 * looks the same in both without its author rendering it twice. Each surface
 * lays the row out itself, since only the panel puts the base-type badge in
 * the same row and only the card's gap has to match `badgeRowHeight`.
 */
export function NodeBadgeChip({badge, fontSize}: {badge: CollectedNodeBadge; fontSize?: number}) {
  const content =
    badge.variant === 'text' ? (
      <Text size={fontSize} muted>
        {badge.label}
      </Text>
    ) : (
      <Badge tone={badge.tone} fontSize={fontSize}>
        {badge.label}
      </Badge>
    )

  if (!badge.tooltip) return content

  return (
    <Tooltip
      content={
        <Box padding={2}>
          <Text size={1}>{badge.tooltip}</Text>
        </Box>
      }
    >
      {content}
    </Tooltip>
  )
}
