import { useCallback, useEffect, useMemo, useState } from 'react'

import { Spinner, StatusMessage } from './components/common/StatusMessage'
import { DiagnosticsPanel } from './components/diagnostics/DiagnosticsPanel'
import { DependencyGraph } from './components/graph/DependencyGraph'
import { ImpactReport } from './components/impact/ImpactReport'
import { Sidebar } from './components/layout/Sidebar'
import { SummaryStrip } from './components/layout/SummaryStrip'
import { WorkspaceHeader } from './components/layout/WorkspaceHeader'
import { CommandPalette } from './components/modules/CommandPalette'
import { ModuleDetailPanel } from './components/modules/ModuleDetailPanel'
import { ModuleExplorer } from './components/modules/ModuleExplorer'
import { useGraph, useImpact } from './hooks/useCodeAtlas'
import { errorTitle } from './lib/errorText'
import { shortLabel } from './lib/graphElements'
import { impactHighlight } from './lib/impact'
import { buildPackageModel, type PackageModel } from './lib/packages'
import { api } from './services/api'
import type { GraphResponse } from './types/api'

function App() {
  const graph = useGraph()
  const data = graph.status === 'success' ? graph.data : null
  const packages = useMemo(() => (data ? buildPackageModel(data.nodes) : null), [data])
  const [selectedId, select] = useSelection(data)
  const impact = useImpactMode(data)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const closeDiagnostics = useCallback(() => setDiagnosticsOpen(false), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const openDiagnostics = useCallback(() => setDiagnosticsOpen(true), [])

  // Entering impact also selects the module, so exiting returns to its details.
  const { enter: enterImpact, exit: exitImpact } = impact
  const analyzeImpact = useCallback(
    (id: string) => {
      select(id)
      enterImpact(id)
    },
    [select, enterImpact],
  )

  // Esc leaves impact mode, unless it is closing the palette or the diagnostics drawer.
  const impactActive = impact.changedId !== null
  useEffect(() => {
    if (!impactActive || paletteOpen || diagnosticsOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) exitImpact()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [impactActive, paletteOpen, diagnosticsOpen, exitImpact])

  // Ctrl+K / Cmd+K opens the module palette once there is a graph to search.
  useEffect(() => {
    if (!data) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data])

  const apiStatus = graph.status === 'success' ? 'connected' : graph.status === 'error' ? 'unavailable' : 'loading'

  return (
    <div className="flex h-full flex-col md:flex-row">
      <Sidebar
        ready={data !== null}
        diagnosticsOpen={diagnosticsOpen}
        onOpenSearch={openPalette}
        onToggleDiagnostics={() => setDiagnosticsOpen((open) => !open)}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceHeader repository={data?.repository ?? null} apiStatus={apiStatus} apiBaseUrl={api.baseUrl} onOpenSearch={openPalette} />

        {graph.status === 'loading' && (
          <div className="flex flex-1 items-center justify-center">
            <Spinner label="Loading dependency graph…" />
          </div>
        )}

        {graph.status === 'error' && (
          <StatusMessage tone="error" title={errorTitle(graph.error, 'the graph')} action={{ label: 'Retry', onClick: graph.retry }}>
            <p>{graph.error.message}</p>
            {graph.error.kind === 'network' && (
              <p className="mt-2">
                Start the backend with{' '}
                <code className="rounded bg-raised px-1 py-0.5 font-mono text-[12px] text-ink">
                  .venv/Scripts/python -m uvicorn app.main:app
                </code>{' '}
                (macOS/Linux: <code className="font-mono text-[12px] text-ink">.venv/bin/python</code>) from{' '}
                <code className="font-mono text-[12px] text-ink">backend/</code>, and open this page at{' '}
                <code className="font-mono text-[12px] text-ink">http://localhost:5173</code> (the origin the API allows).
              </p>
            )}
          </StatusMessage>
        )}

        {data && packages && (
          <>
            <SummaryStrip
              summary={data.summary}
              packageCount={data.nodes.filter((n) => n.is_package).length}
              onOpenDiagnostics={openDiagnostics}
            />
            {data.nodes.length === 0 ? (
              <StatusMessage title="No Python modules found">
                The backend scanned <span className="font-mono text-ink">{data.repository}</span> and found no{' '}
                <code className="font-mono">.py</code> files, so there is nothing to draw.
              </StatusMessage>
            ) : (
              <GraphWorkspace
                graph={data}
                packages={packages}
                selectedId={selectedId}
                onSelect={select}
                impact={impact}
                onAnalyzeImpact={analyzeImpact}
                onOpenDiagnostics={openDiagnostics}
              />
            )}
          </>
        )}
      </main>

      {data && (
        <DiagnosticsPanel
          open={diagnosticsOpen}
          onClose={closeDiagnostics}
          onSelectModule={(id) => {
            exitImpact()
            select(id)
            closeDiagnostics()
          }}
        />
      )}

      {data && packages && paletteOpen && (
        <CommandPalette
          nodes={data.nodes}
          packages={packages}
          onSelect={(id) => {
            exitImpact()
            select(id)
          }}
          onAnalyzeImpact={analyzeImpact}
          onClose={closePalette}
        />
      )}
    </div>
  )
}

/** The selected module, shared by the graph, the explorer, the detail panel and the palette. */
function useSelection(graph: GraphResponse | null) {
  const [selection, setSelection] = useState<{ graph: GraphResponse | null; id: string | null }>({ graph, id: null })
  // A newly loaded graph (e.g. after a retry) starts with nothing selected.
  const selectedId = selection.graph === graph ? selection.id : null
  const select = useCallback((id: string | null) => setSelection({ graph, id }), [graph])
  return [selectedId, select] as const
}

/**
 * Impact mode: the module whose change is being analyzed, and the affected module
 * whose explanation path is focused. Like the selection, it resets for a new graph.
 */
function useImpactMode(graph: GraphResponse | null) {
  const [mode, setMode] = useState<{ graph: GraphResponse | null; changedId: string | null; focusedId: string | null }>({
    graph,
    changedId: null,
    focusedId: null,
  })
  const current = mode.graph === graph ? mode : { graph, changedId: null, focusedId: null }
  const enter = useCallback((id: string) => setMode({ graph, changedId: id, focusedId: null }), [graph])
  const exit = useCallback(() => setMode({ graph, changedId: null, focusedId: null }), [graph])
  const focus = useCallback(
    (id: string | null) => setMode((m) => (m.graph === graph && m.changedId !== null ? { ...m, focusedId: id } : m)),
    [graph],
  )
  return { changedId: current.changedId, focusedId: current.focusedId, enter, exit, focus }
}

type ImpactMode = ReturnType<typeof useImpactMode>

interface GraphWorkspaceProps {
  graph: GraphResponse
  packages: PackageModel
  selectedId: string | null
  onSelect: (moduleId: string | null) => void
  impact: ImpactMode
  onAnalyzeImpact: (moduleId: string) => void
  onOpenDiagnostics: () => void
}

function GraphWorkspace({ graph, packages, selectedId, onSelect, impact, onAnalyzeImpact, onOpenDiagnostics }: GraphWorkspaceProps) {
  const report = useImpact(impact.changedId)
  const reportData = report.status === 'success' ? report.data : null
  const { changedId, focusedId, focus, exit } = impact
  const highlight = useMemo(
    () => (changedId === null ? null : impactHighlight(changedId, reportData, focusedId)),
    [changedId, reportData, focusedId],
  )

  // In impact mode, picking a module (graph or list) focuses its explanation path instead
  // of selecting it. Picking it again, the changed module, an unaffected module or the
  // empty canvas clears the focus.
  const pick = highlight
    ? (id: string | null) => focus(id !== null && id !== focusedId && highlight.buckets.has(id) ? id : null)
    : onSelect

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(380px,62vh)_auto_auto] overflow-y-auto lg:grid-cols-[264px_minmax(0,1fr)_340px] lg:grid-rows-1 lg:overflow-hidden">
      <div className="order-2 min-h-0 border-line bg-surface max-lg:max-h-96 max-lg:border-t lg:order-1 lg:border-r">
        <ModuleExplorer
          nodes={graph.nodes}
          packages={packages}
          selectedId={highlight ? (focusedId ?? changedId) : selectedId}
          onSelect={pick}
        />
      </div>
      <div className="relative order-1 min-h-0 lg:order-2">
        <DependencyGraph graph={graph} packages={packages} selectedId={selectedId} impact={highlight} onSelect={pick} />
        {highlight && (
          <ImpactBanner changedId={highlight.changed} affected={highlight.ready ? highlight.buckets.size : null} onExit={exit} />
        )}
      </div>
      <div className="order-3 min-h-0 border-line bg-surface max-lg:border-t lg:border-l">
        {changedId !== null ? (
          <ImpactReport
            changedId={changedId}
            report={report}
            focusedId={focusedId}
            packages={packages}
            onFocus={focus}
            onExit={exit}
            onOpenDiagnostics={onOpenDiagnostics}
          />
        ) : (
          <ModuleDetailPanel selectedId={selectedId} packages={packages} onSelect={onSelect} onAnalyzeImpact={onAnalyzeImpact} />
        )}
      </div>
    </div>
  )
}

/** Floating reminder on the canvas that the graph shows impact, not the normal selection. */
function ImpactBanner({ changedId, affected, onExit }: { changedId: string; affected: number | null; onExit: () => void }) {
  return (
    <div className="absolute top-3 left-3 flex max-w-[calc(100%-5rem)] animate-fade-in items-center gap-2.5 rounded-lg border border-impact/40 bg-surface/90 py-1.5 pr-1.5 pl-3 text-[12px] shadow-(--shadow-float) backdrop-blur-md">
      <span className="size-2 shrink-0 rounded-full bg-impact" aria-hidden="true" />
      <span className="min-w-0 truncate text-muted">
        Impact of <span className="font-medium text-ink">{shortLabel(changedId)}</span>
        {affected !== null && (
          <>
            {' · '}
            <span className="text-impact tabular-nums">{affected}</span> affected
          </>
        )}
      </span>
      <button
        type="button"
        onClick={onExit}
        className="shrink-0 rounded-md px-2 py-0.5 text-muted transition-colors hover:bg-hover hover:text-ink"
      >
        Exit <kbd className="text-[10px] text-faint">Esc</kbd>
      </button>
    </div>
  )
}

export default App
