import {BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps} from '@xyflow/react'
import {memo} from 'react'

import type {FlowEdge} from '../flowModel'

/** An HTML label: React Flow sizes SVG edge labels with `getBBox`, a forced layout per label. */
function FieldEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
}: EdgeProps<FlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              padding: '2px 4px',
              borderRadius: 3,
              fontSize: 10,
              color: 'var(--card-muted-fg-color, #999)',
              background: 'color-mix(in srgb, var(--card-bg-color, #fff) 90%, transparent)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

export const FieldEdge = memo(FieldEdgeComponent)
