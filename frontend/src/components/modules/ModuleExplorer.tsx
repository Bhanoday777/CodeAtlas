import { useEffect, useMemo, useRef, useState } from 'react'

import { shortLabel } from '../../lib/graphElements'
import { searchModules } from '../../lib/searchModules'
import type { GraphNode } from '../../types/api'
import { SearchIcon } from '../common/icons'

// Rendering thousands of rows on every keystroke is wasted work; narrow the search instead.
const MAX_ROWS = 400

interface ModuleExplorerProps {
  nodes: GraphNode[]
  selectedId: string | null
  onSelect: (moduleId: string) => void
}

export function ModuleExplorer({ nodes, selectedId, onSelect }: ModuleExplorerProps) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => searchModules(nodes, query), [nodes, query])
  const shown = matches.length > MAX_ROWS ? matches.slice(0, MAX_ROWS) : matches
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Keep the selected row visible when the selection comes from the graph.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return (
    <section aria-label="Modules" className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line p-3">
        <label className="relative block">
          <span className="sr-only">Search modules by name or path</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
            }}
            placeholder="Search modules or paths"
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-md border border-line bg-raised py-1.5 pr-2.5 pl-8 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </label>
        <p className="mt-2 text-[11px] text-faint" aria-live="polite">
          {query.trim() === ''
            ? `${nodes.length} ${nodes.length === 1 ? 'module' : 'modules'}`
            : `${matches.length} of ${nodes.length} match`}
          {matches.length > MAX_ROWS && ` · showing first ${MAX_ROWS}, refine the search`}
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-muted">
          <p>No modules match “{query.trim()}”.</p>
          <p className="mt-1 text-[12px] text-faint">Search matches dotted module names and file paths.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {shown.map((node) => {
            const selected = node.id === selectedId
            return (
              <li key={node.id}>
                <button
                  ref={selected ? selectedRef : undefined}
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(node.id)}
                  title={node.path}
                  className={`group flex w-full items-center gap-2 border-l-2 px-3 py-1.5 text-left transition-colors ${
                    selected ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-hover'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] ${selected ? 'text-accent-ink' : 'text-ink'}`}>
                      {shortLabel(node.id)}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-faint">{node.id}</span>
                  </span>
                  {node.has_scan_error && <Badge tone="danger">error</Badge>}
                  {node.is_package && <Badge>pkg</Badge>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Badge({ children, tone }: { children: string; tone?: 'danger' }) {
  return (
    <span
      className={`shrink-0 rounded border px-1 py-px font-mono text-[10px] leading-tight ${
        tone === 'danger' ? 'border-danger/40 text-danger' : 'border-line-strong text-faint'
      }`}
    >
      {children}
    </span>
  )
}
