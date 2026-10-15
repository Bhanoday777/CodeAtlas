import { useEffect, useMemo, useRef, useState, type Ref } from 'react'

import { shortLabel } from '../../lib/graphElements'
import { ROOT_COLOR, type PackageModel } from '../../lib/packages'
import { searchModules } from '../../lib/searchModules'
import type { GraphNode } from '../../types/api'
import { SearchIcon } from '../common/icons'

// Rendering thousands of rows on every keystroke is wasted work; narrow the search instead.
const MAX_ROWS = 400
const TOP_LEVEL = '(top level)'

interface ModuleExplorerProps {
  nodes: GraphNode[]
  packages: PackageModel
  selectedId: string | null
  onSelect: (moduleId: string) => void
}

interface Group {
  key: string
  label: string
  color: string
  modules: GraphNode[]
}

/** Modules grouped by the package that directly contains them; top-level modules first. */
function groupByPackage(modules: GraphNode[], packages: PackageModel): Group[] {
  const groups = new Map<string, Group>()
  for (const module of modules) {
    const pkg = packages.clusterOf.get(module.id) ?? null
    const key = pkg ?? TOP_LEVEL
    let group = groups.get(key)
    if (!group) {
      group = { key, label: pkg ?? 'Top level', color: pkg ? packages.colorOf(module.id) : ROOT_COLOR, modules: [] }
      groups.set(key, group)
    }
    group.modules.push(module)
  }
  return [...groups.values()].sort((a, b) =>
    a.key === TOP_LEVEL ? -1 : b.key === TOP_LEVEL ? 1 : a.key.localeCompare(b.key),
  )
}

export function ModuleExplorer({ nodes, packages, selectedId, onSelect }: ModuleExplorerProps) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const searching = query.trim() !== ''

  const matches = useMemo(() => searchModules(nodes, query), [nodes, query])
  const groups = useMemo(() => groupByPackage(matches.slice(0, MAX_ROWS), packages), [matches, packages])
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Keep the selected row visible when the selection comes from the graph.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <section aria-label="Modules" className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line p-3">
        <label className="relative block">
          <span className="sr-only">Filter modules by name or path</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
            }}
            placeholder="Filter modules or paths"
            spellCheck={false}
            autoComplete="off"
            className="h-8 w-full rounded-lg border border-line-strong bg-raised pr-2.5 pl-8 text-[13px] text-ink transition-colors placeholder:text-faint focus:border-accent/70 focus:bg-surface focus:outline-none"
          />
        </label>
        <p className="mt-2 flex justify-between text-[11px] text-faint" aria-live="polite">
          <span>{searching ? `${matches.length} of ${nodes.length} match` : `${nodes.length} modules`}</span>
          <span>{packages.clusters.length} packages</span>
        </p>
        {matches.length > MAX_ROWS && (
          <p className="mt-1 text-[11px] text-warn">Showing the first {MAX_ROWS}. Refine the filter.</p>
        )}
      </div>

      {matches.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-[13px] text-muted">No modules match “{query.trim()}”.</p>
          <p className="mt-1 text-[12px] text-faint">The filter matches dotted module names and file paths.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {groups.map((group) => {
            // A collapsed group still opens to show the selected module.
            const open = searching || !collapsed.has(group.key) || group.modules.some((m) => m.id === selectedId)
            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggle(group.key)}
                  aria-expanded={open}
                  disabled={searching}
                  className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-line/60 bg-surface/95 px-3 py-1.5 text-left backdrop-blur transition-colors hover:bg-hover disabled:hover:bg-surface/95"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" className={`text-faint transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
                    <path d="M2.5 1 6 4 2.5 7" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: group.color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted">{group.label}</span>
                  <span className="font-mono text-[10.5px] text-faint">{group.modules.length}</span>
                </button>
                {open && (
                  <ul className="py-0.5">
                    {group.modules.map((node) => (
                      <ModuleRow
                        key={node.id}
                        node={node}
                        selected={node.id === selectedId}
                        buttonRef={node.id === selectedId ? selectedRef : undefined}
                        onSelect={onSelect}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

interface ModuleRowProps {
  node: GraphNode
  selected: boolean
  buttonRef?: Ref<HTMLButtonElement>
  onSelect: (moduleId: string) => void
}

function ModuleRow({ node, selected, buttonRef, onSelect }: ModuleRowProps) {
  return (
    <li>
      <button
        ref={buttonRef}
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(node.id)}
        title={`${node.id}\n${node.path}`}
        className={`relative flex w-full items-center gap-2 py-1.5 pr-3 pl-7 text-left transition-colors ${
          selected ? 'bg-accent/10' : 'hover:bg-hover'
        }`}
      >
        {selected && <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-accent" aria-hidden="true" />}
        <span className={`min-w-0 flex-1 truncate text-[13px] ${selected ? 'font-medium text-accent-ink' : 'text-ink'}`}>
          {node.is_package ? <span className="text-muted">__init__</span> : shortLabel(node.id)}
        </span>
        {node.has_scan_error && (
          <span className="rounded border border-danger/40 px-1 font-mono text-[10px] leading-4 text-danger">error</span>
        )}
        {node.dependent_count > 0 && (
          <span
            className="font-mono text-[10.5px] text-faint tabular-nums"
            title={`Imported by ${node.dependent_count} ${node.dependent_count === 1 ? 'module' : 'modules'}`}
          >
            ←{node.dependent_count}
          </span>
        )}
      </button>
    </li>
  )
}
