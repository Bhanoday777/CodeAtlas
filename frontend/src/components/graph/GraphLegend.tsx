import { useState } from 'react'

/** Explains the graph's visual encoding. Colors match graphStyle.ts. Collapsed by default to keep the canvas clear. */
export function GraphLegend() {
  const [open, setOpen] = useState(false)

  return (
    <div className="absolute right-3 bottom-3 max-w-[calc(100%-1.5rem)] rounded-md border border-line bg-surface/95 text-[11px] text-muted shadow-lg">
      {open && (
        <div id="graph-legend" className="flex flex-col gap-1.5 border-b border-line px-3 py-2">
          <LegendSwatch className="border-line-strong bg-raised" label="Module" />
          <LegendSwatch className="border-dashed border-line-strong bg-surface" label="Package (__init__.py)" />
          <LegendSwatch className="border-danger bg-raised" label="Could not be parsed" />
          <div className="mt-0.5 border-t border-line pt-1.5 text-faint">When a module is selected:</div>
          <LegendSwatch className="border-accent bg-raised" label="Modules it imports" />
          <LegendSwatch className="border-incoming bg-incoming/15" label="Modules that import it" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="graph-legend"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:text-ink"
      >
        <svg width="26" height="8" aria-hidden="true">
          <path d="M1 4h18" stroke="#3a4352" strokeWidth="1.5" />
          <path d="M18 0.5 25 4l-7 3.5Z" fill="#3a4352" />
        </svg>
        <span>
          <span className="text-ink">A → B</span> means A imports B
        </span>
        <span className="ml-auto pl-2 text-faint">{open ? 'Hide' : 'Legend'}</span>
      </button>
    </div>
  )
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2.5 w-[26px] rounded-[3px] border ${className}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
