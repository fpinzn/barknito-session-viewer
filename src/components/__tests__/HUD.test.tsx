import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { HUD } from '../HUD'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useSessionStore } from '../../stores/sessionStore'

describe('HUD', () => {
  beforeEach(() => {
    usePlaybackStore.getState().reset()
    useSessionStore.getState().reset()
  })

  it('shows the recorded frame id separately from the frame index', () => {
    const sensorFrameMap = new Map([
      [4935, { ts: 16120, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [4936, { ts: 16143, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)
    usePlaybackStore.getState().setFrameIdx(1)

    render(<HUD />)

    expect(screen.getByText('4936')).toBeInTheDocument()
  })

  it('badges a session that relies on the legacy coordinate convention', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 0, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)
    useSessionStore.setState({ sessionMeta: { sessionId: '20260520-154443-fca8' } })

    render(<HUD />)

    expect(screen.getByText(/legacy coords/i)).toBeInTheDocument()
  })

  it('does not badge a session that declares display-space coordinates', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 0, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)
    useSessionStore.setState({
      sessionMeta: { sessionId: 'future', landmarkSpace: 'display_top_left' },
    })

    render(<HUD />)

    expect(screen.queryByText(/legacy coords/i)).not.toBeInTheDocument()
  })
})

