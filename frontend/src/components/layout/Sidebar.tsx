import type { ReactNode } from 'react'

import { AlertIcon, LogoMark, SearchIcon } from '../common/icons'

interface SidebarProps {
  /** False until the graph has loaded; the search and diagnostics actions need it. */
  ready: boolean
  diagnosticsOpen: boolean
  onOpenSearch: () => void
  onToggleDiagnostics: () => void
}

/** Slim icon rail: the two actions that work from anywhere in the app. */
export function Sidebar({ ready, diagnosticsOpen, onOpenSearch, onToggleDiagnostics }: SidebarProps) {
  return (
    <aside className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-3 py-2 md:w-14 md:flex-col md:border-r md:border-b-0 md:px-0 md:py-3">
      <div className="mr-2 grid size-9 place-items-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/25 md:mr-0 md:mb-3" title="CodeAtlas">
        <LogoMark width={18} height={18} />
        <span className="sr-only">CodeAtlas</span>
      </div>

      <div className="ml-auto flex gap-1 md:mt-auto md:ml-0 md:flex-col">
        <RailButton label="Search modules (Ctrl+K)" onClick={onOpenSearch} disabled={!ready}>
          <SearchIcon />
        </RailButton>
        <RailButton label="Scan diagnostics" onClick={onToggleDiagnostics} disabled={!ready} active={diagnosticsOpen}>
          <AlertIcon />
        </RailButton>
      </div>
    </aside>
  )
}

interface RailButtonProps {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function RailButton({ label, active = false, disabled = false, onClick, children }: RailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active || undefined}
      className={`group relative grid size-9 place-items-center rounded-lg transition-colors ${
        active ? 'bg-hover text-ink' : 'text-faint hover:bg-hover hover:text-ink'
      } disabled:pointer-events-none disabled:opacity-40`}
    >
      {children}
      <span className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 hidden -translate-y-1/2 rounded-md border border-line-strong bg-raised px-2 py-1 text-sm whitespace-nowrap text-ink shadow-(--shadow-float) md:group-hover:block">
        {label}
      </span>
    </button>
  )
}
