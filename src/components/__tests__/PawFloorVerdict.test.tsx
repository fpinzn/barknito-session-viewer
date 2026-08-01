import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PawFloorVerdict } from '../PawFloorVerdict'
import { useSessionStore } from '../../stores/sessionStore'
import { ingestText } from '../../features/file-ingest/ingest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pawFixture = readFileSync(
  join(__dirname, '../../features/file-ingest/fixtures/paw-floor-sample.csv'),
  'utf-8',
)
const sensorFixture = readFileSync(
  join(__dirname, '../../features/file-ingest/fixtures/paw-floor-sensor-sample.csv'),
  'utf-8',
)

describe('PawFloorVerdict', () => {
  beforeEach(() => {
    useSessionStore.getState().reset()
  })

  it('renders nothing without paw data', () => {
    const { container } = render(<PawFloorVerdict />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing with paw data but no sensor data', () => {
    ingestText(pawFixture, 'paw_floor.csv')
    const { container } = render(<PawFloorVerdict />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a verdict once paw and sensor data are both present', () => {
    ingestText(sensorFixture, 'sensors.csv')
    ingestText(pawFixture, 'paw_floor.csv')
    render(<PawFloorVerdict />)
    expect(screen.getByTestId('paw-floor-verdict')).toBeInTheDocument()
  })

  it('never presents a paw depth reading', () => {
    ingestText(sensorFixture, 'sensors.csv')
    ingestText(pawFixture, 'paw_floor.csv')
    const { container } = render(<PawFloorVerdict />)
    expect(container.textContent).not.toMatch(/paw depth/i)
  })

  it('renders real angles, never NaN', () => {
    ingestText(sensorFixture, 'sensors.csv')
    ingestText(pawFixture, 'paw_floor.csv')
    const { container } = render(<PawFloorVerdict />)
    expect(container.textContent).not.toMatch(/NaN/)
  })
})
