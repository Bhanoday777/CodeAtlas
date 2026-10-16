import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { shortLabel } from '../../lib/graphElements'
import type { PackageModel } from '../../lib/packages'
import { rankModules } from '../../lib/searchModules'
import type { GraphNode } from '../../types/api'
import { SearchIcon } from '../common/icons'

const MAX_RESULTS = 50

interface CommandPaletteProps {
  nodes: GraphNode[]
  packages: PackageModel
  onSelect: (moduleId: string) => void
  /** Shift+Enter: analyze the change impact of the chosen module. */
  onAnalyzeImpact: (moduleId: string) => void
  onClose: () => void
}

/**
 * Keyboard quick-jump to a module (Ctrl/Cmd+K). Mounted only while open, so every
 * opening starts with an empty query. Focus returns to where it was on close.
 */
export function CommandPalette({ nodes, packages, onSelect, onAnalyzeImpact, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const results = useMemo(() => rankModules(nodes, query, MAX_RESULTS), [nodes, query])
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    return () => previous?.focus?.()
  }, [])

  // Keep the active row visible while moving with the arrow keys.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (node: GraphNode | undefined, impact = false) => {
    if (!node) return
    if (impact) onAnalyzeImpact(node.id)
    else onSelect(node.id)
    onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(results[active], event.shiftKey)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[14vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to module"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-[600px] animate-pop-in overflow-hidden rounded-xl border border-line-strong bg-surface shadow-(--shadow-float)"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <SearchIcon className="shrink-0 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a module by name or path…"
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            className="h-12 min-w-0 flex-1 bg-transparent text-md text-ink placeholder:text-faint focus:outline-none"
          />
          <kbd className="rounded border border-line-strong bg-raised px-1.5 text-2xs text-muted">Esc</kbd>
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-10 text-center text-base text-muted">No modules match “{query.trim()}”.</p>
        ) : (
          <ul id={listId} ref={listRef} role="listbox" aria-label="Modules" className="max-h-[50vh] overflow-y-auto p-1.5">
            {results.map((node, index) => (
              <li
                key={node.id}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === active}
                onMouseMove={() => setActive(index)}
                onClick={(event) => choose(node, event.shiftKey)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${index === active ? 'bg-hover' : ''}`}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: packages.colorOf(node.id) }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-ink">
                    <Highlight text={node.is_package ? `${shortLabel(node.id)} (package)` : shortLabel(node.id)} query={query} />
                  </span>
                  <span className="block truncate font-mono text-xs text-faint">
                    <Highlight text={node.id} query={query} />
                  </span>
                </span>
                {node.has_scan_error && <span className="font-mono text-2xs text-danger">error</span>}
                <span className="shrink-0 font-mono text-2xs text-faint tabular-nums" title="Imports · imported by">
                  →{node.dependency_count} ←{node.dependent_count}
                </span>
                {index === active && (
                  <kbd className="text-xs text-muted" title="Enter selects · Shift+Enter analyzes impact">
                    ↵
                  </kbd>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-4 border-t border-line px-4 py-2 text-xs text-faint">
          <span>
            <kbd className="text-muted">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="text-muted">↵</kbd> select
          </span>
          <span>
            <kbd className="text-impact">⇧↵</kbd> analyze impact
          </span>
          <span>
            <kbd className="text-muted">esc</kbd> close
          </span>
          <span className="ml-auto">
            {results.length} of {nodes.length}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Emphasizes the first case-insensitive occurrence of the query. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase()
  const at = needle ? text.toLowerCase().indexOf(needle) : -1
  if (at === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-accent/20 text-accent-ink">{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  )
}
