import type { ReactNode } from 'react'

import { AlertIcon } from './icons'

interface StatusMessageProps {
  title: string
  children?: ReactNode
  tone?: 'neutral' | 'error'
  action?: { label: string; onClick: () => void }
  compact?: boolean
}

/** Centered message for loading, empty and error states. */
export function StatusMessage({ title, children, tone = 'neutral', action, compact = false }: StatusMessageProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex h-full flex-col items-center justify-center text-center ${compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12'}`}
    >
      {tone === 'error' && <AlertIcon className="text-danger" width={compact ? 18 : 22} height={compact ? 18 : 22} />}
      <p className={`font-medium ${compact ? 'text-[13px]' : 'text-[15px]'}`}>{title}</p>
      {children && <div className="max-w-md text-[13px] text-muted">{children}</div>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 rounded-md border border-line-strong bg-raised px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-hover"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted">
      <span
        aria-hidden="true"
        className="size-3.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent"
      />
      {label}
    </span>
  )
}
