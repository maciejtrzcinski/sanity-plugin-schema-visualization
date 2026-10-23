import {Card, Flex, Stack, Text} from '@sanity/ui'
import type {CSSProperties} from 'react'

import {useEdgeKinds, useNodeKinds} from '../config'
import {useTranslate} from '../hooks/useTranslate'
import {localized} from '../i18n'
import {cssColor} from '../registry'

const SWATCH: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 2,
  display: 'inline-block',
}

export function Legend() {
  const kinds = useNodeKinds()
  const edgeKinds = useEdgeKinds()
  const t = useTranslate()

  return (
    <Card
      padding={3}
      radius={3}
      shadow={2}
      tone="transparent"
      style={{background: 'var(--card-bg-color)'}}
    >
      <Stack gap={3}>
        <Text size={1} weight="semibold">
          {t('legend.title')}
        </Text>
        <Stack gap={2}>
          {kinds.map((kind) => (
            <Flex key={kind.id} align="center" gap={2}>
              <span style={{...SWATCH, background: cssColor(kind.color)}} />
              <Text size={1}>{localized(t, kind.i18n?.label, kind.label)}</Text>
            </Flex>
          ))}
          <Flex align="center" gap={2}>
            <span style={{...SWATCH, border: '1px dashed var(--card-border-color, #999)'}} />
            <Text size={1}>{t('legend.cluster-hint')}</Text>
          </Flex>
          {edgeKinds.map((edgeKind) => (
            <Flex key={edgeKind.id} align="center" gap={2}>
              <span
                style={{
                  width: 16,
                  height: 0,
                  display: 'inline-block',
                  borderTop: `2px ${edgeKind.dash ? 'dashed' : 'solid'} ${cssColor(edgeKind.color)}`,
                }}
              />
              <Text size={1}>{localized(t, edgeKind.i18n?.label, edgeKind.label)}</Text>
            </Flex>
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}
