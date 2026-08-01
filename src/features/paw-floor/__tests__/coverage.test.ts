import { describe, it, expect } from 'vitest'
import { timelineCoverage } from '../coverage'

describe('timelineCoverage', () => {
  it('is 1 when every sensor frame has a paw sample at the same moment', () => {
    expect(timelineCoverage([0, 33, 66], [0, 33, 66], 100)).toBeCloseTo(1, 6)
  })

  it('is 0 when paw samples are far from every sensor frame', () => {
    expect(timelineCoverage([50_000], [0, 33, 66], 100)).toBeCloseTo(0, 6)
  })

  it('counts a sensor frame covered when a paw sample is within tolerance', () => {
    // 80 ms away is inside a 100 ms tolerance; 400 ms is not.
    expect(timelineCoverage([80], [0], 100)).toBeCloseTo(1, 6)
    expect(timelineCoverage([400], [0], 100)).toBeCloseTo(0, 6)
  })

  it('handles paw samples that only span part of the session', () => {
    // Sensor frames every 100 ms across 1 s; paw data only in the first half.
    const sensor = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]
    const paw = [0, 100, 200, 300, 400]
    expect(timelineCoverage(paw, sensor, 50)).toBeCloseTo(0.5, 6)
  })

  it('returns 0 for empty inputs rather than dividing by zero', () => {
    expect(timelineCoverage([], [0, 33], 100)).toBe(0)
    expect(timelineCoverage([0, 33], [], 100)).toBe(0)
    expect(timelineCoverage([], [], 100)).toBe(0)
  })

  it('does not require the inputs to be pre-sorted', () => {
    expect(timelineCoverage([66, 0, 33], [66, 33, 0], 10)).toBeCloseTo(1, 6)
  })
})
