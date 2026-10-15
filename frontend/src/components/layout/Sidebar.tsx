import { GraphIcon, LogoMark } from '../common/icons'

interface SidebarProps {
  repository: string | null
  apiBaseUrl: string
}

export function Sidebar({ repository, apiBaseUrl }: SidebarProps) {
  return (
    <aside className="flex shrink-0 items-center gap-4 border-b border-line bg-surface px-4 py-2.5 md:w-56 md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0 md:p-0">
      <div className="flex items-center gap-2 md:border-b md:border-line md:px-4 md:py-4">
        <LogoMark className="text-accent" />
        <span className="text-[15px] font-semibold tracking-tight">CodeAtlas</span>
      </div>

      <nav aria-label="Main" className="md:p-2">
        <a
          href="#"
          aria-current="page"
          className="flex items-center gap-2.5 rounded-md bg-hover px-2.5 py-1.5 text-[13px] font-medium text-ink"
        >
          <GraphIcon className="text-accent" />
          Graph Explorer
        </a>
      </nav>

      <div className="mt-auto hidden border-t border-line px-4 py-3 text-[11px] md:block">
        <p className="font-medium tracking-wide text-faint uppercase">Repository</p>
        <p className="mt-1 truncate font-mono text-[12px] text-ink" title={repository ?? undefined}>
          {repository ?? '—'}
        </p>
        <p className="mt-2 font-medium tracking-wide text-faint uppercase">API</p>
        <p className="mt-1 truncate font-mono text-[12px] text-muted" title={apiBaseUrl}>
          {apiBaseUrl}
        </p>
      </div>
    </aside>
  )
}
