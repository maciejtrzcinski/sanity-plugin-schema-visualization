import {DownloadIcon} from '@sanity/icons/Download'
import {Button, Card, Flex} from '@sanity/ui'
import {useToast} from '@sanity/ui/toast'
import {getNodesBounds, useReactFlow, useStore, type Rect} from '@xyflow/react'
import {useCallback, useState} from 'react'

import {useConfig} from '../config'
import {graphToJson, graphToMermaid} from '../exportModel'
import {viewportToSvg} from '../exportSvg'
import {useTranslate} from '../hooks/useTranslate'
import {localized} from '../i18n'
import type {ClusterBox} from '../layout'
import type {SchemaGraph} from '../types'

const EXPORT_PADDING = 48

export interface ExportControlsProps {
  graph: SchemaGraph
  direction: 'LR' | 'TB'
  clusters: ClusterBox[]
  fileName: string
  suspendCulling: () => Promise<void>
  resumeCulling: () => void
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(a.x + a.width, b.x + b.width)
  const bottom = Math.max(a.y + a.height, b.y + b.height)
  return {x, y, width: right - x, height: bottom - y}
}

/** SVG only: vectors stay crisp and have no canvas size ceiling. */
export function ExportControls({
  graph,
  direction,
  clusters,
  fileName,
  suspendCulling,
  resumeCulling,
}: ExportControlsProps) {
  const {getNodes} = useReactFlow()
  const flowEl = useStore((s) => s.domNode)
  const toast = useToast()
  const t = useTranslate()
  const [exporting, setExporting] = useState(false)
  const {kindById, catchAll} = useConfig()

  const baseName = fileName.replace(/\.svg$/, '')
  const handleExportMermaid = useCallback(() => {
    const text = graphToMermaid(graph, {
      direction,
      kindLabel: (kind) => {
        const def = kindById.get(kind) ?? catchAll
        return localized(t, def.i18n?.clusterLabel, def.clusterLabel)
      },
    })
    triggerDownload(new Blob([text], {type: 'text/plain;charset=utf-8'}), `${baseName}.mmd`)
  }, [graph, direction, kindById, catchAll, t, baseName])
  const handleExportJson = useCallback(() => {
    triggerDownload(
      new Blob([graphToJson(graph)], {type: 'application/json;charset=utf-8'}),
      `${baseName}.json`,
    )
  }, [graph, baseName])

  const handleExport = useCallback(async () => {
    const nodes = getNodes()
    if (nodes.length === 0) return

    setExporting(true)
    try {
      await suspendCulling()

      const viewportEl = flowEl?.querySelector<HTMLElement>('.react-flow__viewport')
      if (!viewportEl) return

      // Cluster bands sit outside React Flow's nodes and can extend past them.
      let bounds = getNodesBounds(nodes)
      for (const cluster of clusters) {
        bounds = unionRect(bounds, cluster)
      }

      const backgroundColor =
        getComputedStyle(viewportEl).getPropertyValue('--card-bg-color').trim() || '#ffffff'

      const svg = viewportToSvg(viewportEl, {
        width: Math.ceil(bounds.width) + EXPORT_PADDING * 2,
        height: Math.ceil(bounds.height) + EXPORT_PADDING * 2,
        offsetX: EXPORT_PADDING - bounds.x,
        offsetY: EXPORT_PADDING - bounds.y,
        backgroundColor,
      })
      triggerDownload(new Blob([svg], {type: 'image/svg+xml;charset=utf-8'}), fileName)
    } catch (err) {
      toast.push({
        status: 'error',
        title: t('canvas.export-error'),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      resumeCulling()
      setExporting(false)
    }
  }, [getNodes, flowEl, clusters, fileName, suspendCulling, resumeCulling, toast, t])

  return (
    <Card padding={1} radius={3} shadow={2} style={{background: 'var(--card-bg-color)'}}>
      <Flex gap={1}>
        <Button
          icon={DownloadIcon}
          mode="bleed"
          fontSize={1}
          padding={2}
          text={t('canvas.export-svg')}
          loading={exporting}
          disabled={exporting}
          onClick={handleExport}
        />
        <Button
          mode="bleed"
          fontSize={1}
          padding={2}
          text={t('canvas.export-mermaid')}
          disabled={graph.nodes.length === 0}
          onClick={handleExportMermaid}
        />
        <Button
          mode="bleed"
          fontSize={1}
          padding={2}
          text={t('canvas.export-json')}
          disabled={graph.nodes.length === 0}
          onClick={handleExportJson}
        />
      </Flex>
    </Card>
  )
}
