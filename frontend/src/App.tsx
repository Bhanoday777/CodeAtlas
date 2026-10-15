import { useCallback, useState } from 'react'

import { Spinner, StatusMessage } from './components/common/StatusMessage'
import { DiagnosticsPanel } from './components/diagnostics/DiagnosticsPanel'
import { DependencyGraph } from './components/graph/DependencyGraph'
import { Sidebar } from './components/layout/Sidebar'
import { SummaryStrip } from './components/layout/SummaryStrip'
import { WorkspaceHeader } from './components/layout/WorkspaceHeader'
import { ModuleDetailPanel } from './components/modules/ModuleDetailPanel'
import { ModuleExplorer } from './components/modules/ModuleExplorer'
import { useGraph } from './hooks/useCodeAtlas'
import { errorTitle } from './lib/errorText'
import { api } from './services/api'
import type { GraphResponse } from './types/api'

function App() {
  const graph = useGraph()
  const data = graph.status === 'success' ? graph.data : null
  const [selectedId, select] = useSelection(data)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const closeDiagnostics = useCallback(() => setDiagnosticsOpen(false), [])

  return (
    <div className="flex h-full flex-col md:flex-row">
      <Sidebar repository={data?.repository ?? null} apiBaseUrl={api.baseUrl} />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceHeader
          repository={data?.repository ?? null}
          loading={graph.status === 'loading'}
          summary={data?.summary ?? null}
          diagnosticsOpen={diagnosticsOpen}
          onToggleDiagnostics={() => setDiagnosticsOpen((open) => !open)}
        />

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
                from <code className="font-mono text-[12px] text-ink">backend/</code>, and open this page at{' '}
                <code className="font-mono text-[12px] text-ink">http://localhost:5173</code> (the origin the API allows).
              </p>
            )}
          </StatusMessage>
        )}

        {data && (
          <>
            <SummaryStrip summary={data.summary} />
            {data.nodes.length === 0 ? (
              <StatusMessage title="No Python modules found">
                The backend scanned <span className="font-mono text-ink">{data.repository}</span> and found no{' '}
                <code className="font-mono">.py</code> files, so there is nothing to draw.
              </StatusMessage>
            ) : (
              <GraphWorkspace graph={data} selectedId={selectedId} onSelect={select} />
            )}
          </>
        )}
      </main>

      {data && (
        <DiagnosticsPanel
          open={diagnosticsOpen}
          onClose={closeDiagnostics}
          onSelectModule={(id) => {
            select(id)
            closeDiagnostics()
          }}
        />
      )}
    </div>
  )
}

/** The selected module, shared by the graph, the explorer and the detail panel. */
function useSelection(graph: GraphResponse | null) {
  const [selection, setSelection] = useState<{ graph: GraphResponse | null; id: string | null }>({ graph, id: null })
  // A newly loaded graph (e.g. after a retry) starts with nothing selected.
  const selectedId = selection.graph === graph ? selection.id : null
  const select = useCallback((id: string | null) => setSelection({ graph, id }), [graph])
  return [selectedId, select] as const
}

interface GraphWorkspaceProps {
  graph: GraphResponse
  selectedId: string | null
  onSelect: (moduleId: string | null) => void
}

function GraphWorkspace({ graph, selectedId, onSelect }: GraphWorkspaceProps) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(360px,60vh)_auto_auto] overflow-y-auto lg:grid-cols-[260px_minmax(0,1fr)_320px] lg:grid-rows-1 lg:overflow-hidden">
      <div className="order-2 min-h-0 border-line max-lg:max-h-80 max-lg:border-t lg:order-1 lg:border-r">
        <ModuleExplorer nodes={graph.nodes} selectedId={selectedId} onSelect={onSelect} />
      </div>
      <div className="order-1 min-h-0 lg:order-2">
        <DependencyGraph graph={graph} selectedId={selectedId} onSelect={onSelect} />
      </div>
      <div className="order-3 min-h-0 border-line bg-surface max-lg:border-t lg:border-l">
        <ModuleDetailPanel selectedId={selectedId} onSelect={onSelect} />
      </div>
    </div>
  )
}

export default App
