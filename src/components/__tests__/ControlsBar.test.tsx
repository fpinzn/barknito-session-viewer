import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ControlsBar } from '../ControlsBar'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useSessionStore } from '../../stores/sessionStore'

describe('ControlsBar', () => {
  beforeEach(() => {
    usePlaybackStore.getState().reset()
    useSessionStore.getState().reset()
  })

  it('shows visible and session milliseconds in the timeline label', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 16120, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 20000, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)
    useSessionStore.getState().setVideoDurationMs(60342)
    usePlaybackStore.getState().setFrameIdx(1)
    usePlaybackStore.getState().setPlaybackTimes(20000, 3890)

    render(<ControlsBar />)

    expect(screen.getByText('2 / 2 · visible 3890 ms · session 20000 ms')).toBeInTheDocument()
  })
})
