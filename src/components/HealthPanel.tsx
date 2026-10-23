import {CloseIcon} from '@sanity/icons/Close'
import {WarningOutlineIcon} from '@sanity/icons/WarningOutline'
import {Badge, Box, Button, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {useMemo} from 'react'

import {useConfig} from '../config'
import {groupIssuesByRule, severityTone, type HealthIssue} from '../healthRules'
import {useTranslate} from '../hooks/useTranslate'
import {localized} from '../i18n'
import type {GraphNode} from '../types'

export interface HealthPanelProps {
  issues: HealthIssue[]
  nodesById: Map<string, GraphNode>
  onSelectNode: (nodeId: string) => void
  onClose: () => void
}

export function HealthPanel({issues, nodesById, onSelectNode, onClose}: HealthPanelProps) {
  const {healthRules} = useConfig()
  const t = useTranslate()
  // Grouped in rule order, and labelled from the rule itself — no separate
  // category-to-label map to keep in sync.
  const grouped = useMemo(() => groupIssuesByRule(issues, healthRules), [issues, healthRules])

  return (
    // A flex column so the header stays put and only the list scrolls; the
    // panel's container caps its height (see `SchemaVisualizationTool`).
    <Card
      shadow={3}
      radius={3}
      style={{
        width: 340,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Card padding={4} borderBottom style={{flexShrink: 0}}>
        <Flex align="center" justify="space-between" gap={2}>
          <Flex align="center" gap={2}>
            <WarningOutlineIcon />
            <Heading size={1}>{t('health.title')}</Heading>
          </Flex>
          <Button icon={CloseIcon} mode="bleed" onClick={onClose} aria-label={t('health.close')} />
        </Flex>
      </Card>

      <Box padding={4} style={{minHeight: 0, overflowY: 'auto'}}>
        {issues.length === 0 ? (
          <Text size={1} muted>
            {t('health.empty')}
          </Text>
        ) : (
          <Stack gap={5}>
            {grouped.map(({rule, issues: ruleIssues}) => (
              <Stack gap={3} key={rule.id}>
                <Flex align="center" gap={2}>
                  <Text size={1} weight="semibold">
                    {localized(t, rule.i18n?.label, rule.label)}
                  </Text>
                  <Badge tone={severityTone(rule.severity)} fontSize={0}>
                    {ruleIssues.length}
                  </Badge>
                </Flex>
                <Stack gap={2}>
                  {ruleIssues.map((issue) => {
                    const node = nodesById.get(issue.nodeId)
                    return (
                      <Card
                        key={issue.id}
                        padding={3}
                        radius={2}
                        tone={severityTone(issue.severity)}
                        border
                      >
                        <Stack gap={2}>
                          <Button
                            mode="bleed"
                            padding={0}
                            text={node?.title ?? issue.nodeId}
                            onClick={() => onSelectNode(issue.nodeId)}
                            style={{fontWeight: 600}}
                          />
                          <Text size={1}>{issue.message}</Text>
                        </Stack>
                      </Card>
                    )
                  })}
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Box>
    </Card>
  )
}
