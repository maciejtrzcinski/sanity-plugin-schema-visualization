import {DocumentsIcon} from '@sanity/icons/Documents'
import {Box, Button, Text} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'
import {useEffect, useState} from 'react'

import {useTranslate} from '../hooks/useTranslate'
import {formatRelativeTime, type DocumentCountsStatus} from './index'

/**
 * The toolbar's "Load doc counts" control.
 *
 * Lives with the feature rather than in `Toolbar.tsx`, and reaches the toolbar
 * through its `extraActions` slot. The toolbar renders whatever it is handed
 * and imports nothing from here, so the whole feature — query, state, cache,
 * annotations and this button — is one directory that depends on core rather
 * than the other way round.
 *
 * Whether it appears at all is the tool root's call (`documentCounts: true`,
 * and at least one countable type): with nothing to count, `load` is a silent
 * no-op, and a button that does nothing is worse than no button.
 */
export function DocumentCountsButton({
  status,
  fetchedAt,
  onClick,
}: {
  status: DocumentCountsStatus
  fetchedAt?: number
  onClick: () => void
}) {
  const t = useTranslate()
  // `formatRelativeTime` is only minute-precise, so a minutely tick keeps the
  // tooltip honest without meaningful re-render cost.
  const [, setNowTick] = useState(0)
  const showTooltip = status === 'loaded' && fetchedAt !== undefined
  useEffect(() => {
    if (!showTooltip) return undefined
    const id = setInterval(() => setNowTick((tick) => tick + 1), 60_000)
    return () => clearInterval(id)
  }, [showTooltip])

  const button = (
    <Button
      icon={DocumentsIcon}
      mode="ghost"
      tone={status === 'error' ? 'critical' : 'default'}
      text={
        status === 'loaded'
          ? t('toolbar.doc-counts-refresh')
          : status === 'error'
            ? t('toolbar.doc-counts-retry')
            : t('toolbar.doc-counts-load')
      }
      fontSize={1}
      padding={2}
      loading={status === 'loading'}
      disabled={status === 'loading'}
      onClick={onClick}
    />
  )

  if (!showTooltip) return button

  return (
    <Tooltip
      content={
        <Box padding={2}>
          <Text size={1}>
            {t('toolbar.doc-counts-loaded', {when: formatRelativeTime(fetchedAt, undefined, t)})}
          </Text>
        </Box>
      }
    >
      {button}
    </Tooltip>
  )
}
