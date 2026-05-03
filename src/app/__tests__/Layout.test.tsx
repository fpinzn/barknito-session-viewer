import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '../Layout'
import { VIEWER_BUILD_COUNTER } from '../build-counter'
import { useSessionStore } from '../../stores/sessionStore'
import { useUIStore } from '../../stores/uiStore'

vi.mock('../../three/SceneCanvas', () => ({
  SceneCanvas: () => <div>SceneCanvas</div>,
}))

vi.mock('../../components/ControlsBar', () => ({
  ControlsBar: () => <div>ControlsBar</div>,
}))

vi.mock('../../components/ParameterPanel', () => ({
  ParameterPanel: () => <div>ParameterPanel</div>,
}))

vi.mock('../../components/HUD', () => ({
  HUD: () => <div>HUD</div>,
}))

vi.mock('../../components/Legend', () => ({
  Legend: () => <div>Legend</div>,
}))

vi.mock('../../components/KeyboardShortcuts', () => ({
  KeyboardShortcuts: () => null,
}))

vi.mock('../../features/timeline/EventList', () => ({
  EventList: () => <div>EventList</div>,
}))

vi.mock('../../features/gcs-browser/GCSBrowser', () => ({
  GCSBrowser: () => <div>GCSBrowser</div>,
}))

vi.mock('../../features/label-studio/ExportPanel', () => ({
  ExportPanel: () => <div>ExportPanel</div>,
}))

vi.mock('../../features/gcs-browser/FileInspector', () => ({
  FileInspector: () => <div>FileInspector</div>,
}))

describe('Layout', () => {
  beforeEach(() => {
    useSessionStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('shows the current build counter badge', () => {
    render(<Layout />)

    expect(screen.getByText(`build ${VIEWER_BUILD_COUNTER}`)).toBeInTheDocument()
  })
})
