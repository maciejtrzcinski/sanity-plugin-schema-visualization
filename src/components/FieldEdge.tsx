import {BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps} from '@xyflow/react'
import {memo} from 'react'

import type {FlowEdge} from '../flowModel'

/**
 * A smoothstep edge whose field-name label is HTML rather than SVG text.
 *
 * React Flow sizes an SVG edge label's background with `getBBox`, which forces
 * a synchronous layout of the whole canvas — once per label. Selecting a
 * well-connected type lights a dozen labels at once, and on a 331-type schema
 * those measurements were the single largest cost of a click. An HTML label
 * in `EdgeLabelRenderer` needs no measuring: the browser sizes its background
 * with its text.
 */
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
