import { beforeEach, describe, expect, it } from 'vitest'
import { useUIStore } from '../uiStore'

describe('uiStore view mode', () => {
  beforeEach(() => {
    useUIStore.getState().reset()
  })

  it('opens every session in split view', () => {
    expect(useUIStore.getState().viewMode).toBe('split')
  })

  it('returns to split view when a new session resets the store', () => {
    useUIStore.getState().setViewMode('scene')
    useUIStore.getState().reset()

    expect(useUIStore.getState().viewMode).toBe('split')
  })
})
