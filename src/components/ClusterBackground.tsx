import {useConfig} from '../config'
import {useTranslate} from '../hooks/useTranslate'
import {localized} from '../i18n'
import type {ClusterBox} from '../layout'
import {cssColor} from '../registry'

function tintFor(color: string) {
  return {
    background: `color-mix(in srgb, ${color} 5%, transparent)`,
    border: `color-mix(in srgb, ${color} 25%, transparent)`,
    text: color,
  }
}

export function ClusterBackgrounds({clusters}: {clusters: ClusterBox[]}) {
  const {kindById, catchAll} = useConfig()
  const t = useTranslate()

  return (
    <>
      {clusters.map((cluster) => {
        const kind = kindById.get(cluster.kind) ?? catchAll
        const tint = tintFor(cssColor(kind.color))
        return (
          <div
            key={cluster.id}
            style={{
              position: 'absolute',
              transform: `translate(${cluster.x}px, ${cluster.y}px)`,
              width: cluster.width,
              height: cluster.height,
              background: tint.background,
              border: `1px dashed ${tint.border}`,
              borderRadius: 16,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: 12,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: tint.text,
              }}
            >
              {localized(t, kind.i18n?.clusterLabel, kind.clusterLabel)}
            </div>
          </div>
        )
      })}
    </>
  )
}
