import { describe, it, expect } from 'vitest'
import { formatPawTooltip } from '../tooltip'

describe('formatPawTooltip', () => {
  const base = {
    paw: 'right_back_paw' as const,
    world: { x: 0.3841, y: -1.2884, z: 0.1342 },
    frameId: 13327,
    ts: 7403,
    suspectReason: null,
  }

  it('names the paw', () => {
    expect(formatPawTooltip(base).lines[0]).toBe('right_back_paw')
  })

  it('reports world position to millimetre precision', () => {
    expect(formatPawTooltip(base).lines[1]).toBe('x 0.384  y -1.288  z 0.134')
  })

  it('reports frame and time', () => {
    expect(formatPawTooltip(base).lines[2]).toBe('frame 13327  ·  7403 ms (7.403 s)')
  })

  it('says nothing extra for a trustworthy sample', () => {
    expect(formatPawTooltip(base).lines).toHaveLength(3)
  })

  it('explains a collapse flag', () => {
    const l = formatPawTooltip({ ...base, suspectReason: 'collapse' }).lines
    expect(l).toHaveLength(4)
    expect(l[3]).toMatch(/collapsed onto another paw/i)
  })

  it('explains a jerk flag', () => {
    const l = formatPawTooltip({ ...base, suspectReason: 'jerk' }).lines
    expect(l[3]).toMatch(/departed and returned/i)
  })

  it('keeps negative coordinates readable', () => {
    const l = formatPawTooltip({
      ...base, world: { x: -0.0575, y: -1.2884, z: -0.1994 },
    }).lines
    expect(l[1]).toBe('x -0.058  y -1.288  z -0.199')
  })
})
