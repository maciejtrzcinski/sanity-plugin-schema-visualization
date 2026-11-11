import {DocumentsIcon} from '@sanity/icons/Documents'
import {Box, Button, Text} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'
import {useEffect, useState} from 'react'

import {useTranslate} from '../hooks/useTranslate'
import {formatRelativeTime, type DocumentCountsStatus} from './index'

/** Whether it appears at all is the tool root's call: with nothing to count, `load` is a no-op. */
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
