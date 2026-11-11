import {Badge, Box, Text} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'

import type {CollectedNodeBadge} from '../nodeBadges'

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
