import { useSessionStore } from '../stores/sessionStore'
import { getSkeletonDef } from '../constants'

export function Legend() {
  const models = useSessionStore(s => s.models)

  if (models.length === 0) return null

  // Collect legend entries from all models
  const entries: Array<{ label: string; color: [number, number, number] }> = []
  const seen = new Set<string>()

  for (const modelId of models) {
    const def = getSkeletonDef(modelId)
    for (const entry of def.legend) {
      const key = `${entry.label}-${entry.color.join(',')}`
      if (!seen.has(key)) {
        seen.add(key)
        entries.push(entry)
      }
    }
  }

  return (
    <div className="legend">
      {entries.map((entry) => (
        <div key={entry.label} className="entry">
          <div
            className="swatch"
            style={{
              backgroundColor: `rgb(${Math.round(entry.color[0] * 255)}, ${Math.round(entry.color[1] * 255)}, ${Math.round(entry.color[2] * 255)})`,
            }}
          />
          <span>{entry.label}</span>
        </div>
      ))}
    </div>
  )
}
