import type { ReactNode } from 'react'

import { FitIcon, ResetIcon, ZoomInIcon, ZoomOutIcon } from '../common/icons'

interface GraphControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onReset: () => void
}

export function GraphControls({ onZoomIn, onZoomOut, onFit, onReset }: GraphControlsProps) {
  return (
    <div
      role="toolbar"
      aria-label="Graph view"
      className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-md border border-line bg-surface/95 shadow-lg"
    >
      <ControlButton label="Zoom in" onClick={onZoomIn}>
        <ZoomInIcon />
      </ControlButton>
      <ControlButton label="Zoom out" onClick={onZoomOut}>
        <ZoomOutIcon />
      </ControlButton>
      <ControlButton label="Fit graph to view" onClick={onFit}>
        <FitIcon />
      </ControlButton>
      <ControlButton label="Reset layout and selection" onClick={onReset}>
        <ResetIcon />
      </ControlButton>
    </div>
  )
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center border-b border-line text-muted transition-colors last:border-b-0 hover:bg-hover hover:text-ink"
    >
      {children}
    </button>
  )
}
