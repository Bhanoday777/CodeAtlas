import { useState } from 'react'

import type { PackageModel } from '../../lib/packages'

const MAX_PACKAGES = 10

/** Explains the graph's visual encoding. Colors match graphStyle.ts. Collapsed by default to keep the canvas clear. */
export function GraphLegend({ packages, impactMode }: { packages: PackageModel; impactMode: boolean }) {
  const [open, setOpen] = useState(false)
  const shown = packages.clusters.slice(0, MAX_PACKAGES)

  return (
    <div className="absolute right-3 bottom-3 w-[250px] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-lg border border-line-strong bg-surface/85 text-xs text-muted shadow-(--shadow-float) backdrop-blur-md">
      {open && (
        <div id="graph-legend" className="animate-fade-in space-y-3 border-b border-line px-3 py-2.5">
          <div className="space-y-1.5">
            <LegendSwatch className="border-line-strong" label="Module" />
            <LegendSwatch className="border-dashed border-line-strong" label="Package __init__.py" />
            <LegendSwatch className="border-danger" label="Could not be parsed" />
            <div className="flex items-center gap-2">
              <span className="flex w-[26px] items-end justify-center gap-0.5" aria-hidden="true">
                <span className="h-1.5 w-2 rounded-[2px] border border-line-strong" />
                <span className="h-2.5 w-3 rounded-[3px] border border-line-strong" />
              </span>
              <span>Larger = imported by more modules</span>
            </div>
            <p className="text-faint">
              Importing <span className="font-mono">a.b.c</span> also points to packages <span className="font-mono">a</span> and{' '}
              <span className="font-mono">a.b</span>: Python runs their <span className="font-mono">__init__.py</span> first.
            </p>
          </div>
          {impactMode ? (
            <div className="space-y-1.5">
              <p className="text-faint">Change impact</p>
              <LegendSwatch className="border-impact bg-impact" label="Changed module" />
              <LegendSwatch className="border-impact bg-impact/15" label="Imports it directly (distance 1)" />
              <LegendSwatch className="border-impact-2 bg-impact-2/10" label="Distance 2" />
              <LegendSwatch className="border-impact-3 bg-impact-3/10" label="Distance 3 or more" />
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-[26px] rounded-full bg-impact/70" aria-hidden="true" />
                <span>Explanation path</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-faint">Selected module</p>
              <LegendSwatch className="border-accent bg-accent/15" label="Modules it imports" />
              <LegendSwatch className="border-incoming bg-incoming/15" label="Modules that import it" />
            </div>
          )}
          {shown.length > 0 && (
            <div className="space-y-1">
              <p className="text-faint">Packages</p>
              {shown.map((cluster) => (
                <div key={cluster.id} className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: cluster.color }} aria-hidden="true" />
                  <span className="truncate font-mono">{cluster.id}</span>
                </div>
              ))}
              {packages.clusters.length > MAX_PACKAGES && (
                <p className="text-faint">+{packages.clusters.length - MAX_PACKAGES} more</p>
              )}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="graph-legend"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-hover hover:text-ink"
      >
        <svg width="26" height="8" aria-hidden="true">
          <path d="M1 4h18" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
          <path d="M18 0.5 25 4l-7 3.5Z" fill="currentColor" opacity="0.6" />
        </svg>
        <span>
          <span className="text-ink">A → B</span> means A depends on B
        </span>
        <span className="ml-auto pl-2 text-faint">{open ? 'Hide' : 'Legend'}</span>
      </button>
    </div>
  )
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2.5 w-[26px] rounded-[3px] border bg-raised ${className}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
