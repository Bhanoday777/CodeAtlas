import cytoscape, { type Core } from 'cytoscape'
import dagre from 'cytoscape-dagre'
import { useEffect, useMemo, useRef, useState } from 'react'

import { toElements, type ModuleNodeData } from '../../lib/graphElements'
import type { PackageModel } from '../../lib/packages'
import type { GraphResponse } from '../../types/api'
import { GraphControls } from './GraphControls'
import { GraphLegend } from './GraphLegend'
import { graphStyle, layoutOptions } from './graphStyle'

cytoscape.use(dagre)

const SELECTION_CLASSES = 'selected dependency dependent outgoing incoming faded dimmed'
const ZOOM_STEP = 1.3
const GRID_SIZE = 22
const ANIMATION = { duration: 220, easing: 'ease-out-cubic' } as const

interface DependencyGraphProps {
  graph: GraphResponse
  packages: PackageModel
  selectedId: string | null
  onSelect: (moduleId: string | null) => void
}

export function DependencyGraph({ graph, packages, selectedId, onSelect }: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const onSelectRef = useRef(onSelect)
  const [hovered, setHovered] = useState<ModuleNodeData | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    onSelectRef.current = onSelect
  })

  // Conversion and layout run only when the graph data itself changes.
  const elements = useMemo(() => toElements(graph, packages), [graph, packages])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const cy = cytoscape({
      container,
      elements,
      style: graphStyle,
      layout: layoutOptions,
      minZoom: 0.1,
      maxZoom: 3,
      boxSelectionEnabled: false,
      autounselectify: true, // selection is owned by React (selectedId), shown with classes
      hideEdgesOnViewport: elements.length > 3000,
    })
    cyRef.current = cy

    // Dot grid that pans and zooms with the graph.
    let frame = 0
    const syncViewport = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const z = cy.zoom()
        const { x, y } = cy.pan()
        const size = GRID_SIZE * z
        container.style.backgroundSize = `${size}px ${size}px`
        container.style.backgroundPosition = `${x}px ${y}px`
        setZoom(z)
      })
    }
    syncViewport()
    cy.on('viewport', syncViewport)

    cy.on('tap', 'node.module', (event) => onSelectRef.current(event.target.id()))
    cy.on('tap', (event) => {
      if (event.target === cy) onSelectRef.current(null)
    })
    cy.on('mouseover', 'node.module', (event) => {
      event.target.addClass('hovered')
      setHovered(event.target.data() as ModuleNodeData)
      container.style.cursor = 'pointer'
    })
    cy.on('mouseout', 'node.module', (event) => {
      event.target.removeClass('hovered')
      setHovered(null)
      container.style.cursor = ''
    })

    // The canvas measures labels with the web fonts; redraw once they have loaded.
    document.fonts?.ready.then(() => {
      if (!cy.destroyed()) cy.style().update()
    })

    // Panels opening or the window resizing change the container size.
    const observer = new ResizeObserver(() => cy.resize())
    observer.observe(container)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      cy.destroy()
      cyRef.current = null
      setHovered(null)
    }
  }, [elements])

  // Reflect the selection without re-running the layout.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.elements().removeClass(SELECTION_CLASSES)
      if (selectedId === null) return
      const node = cy.getElementById(selectedId)
      if (node.empty()) return
      const outgoing = node.outgoers('edge')
      const incoming = node.incomers('edge')
      outgoing.addClass('outgoing')
      incoming.addClass('incoming')
      outgoing.targets().difference(node).addClass('dependency')
      incoming.sources().difference(node).addClass('dependent')
      node.addClass('selected')
      const focus = node.closedNeighborhood()
      cy.elements('node.module, edge').difference(focus).addClass('faded')
      // Package boxes are dimmed rather than faded: a parent's opacity would also fade its children.
      cy.nodes('.cluster').difference(focus.nodes().ancestors()).addClass('dimmed')
    })

    // Bring the node into view only if it is off-screen (e.g. picked from the explorer).
    if (selectedId === null) return
    const node = cy.getElementById(selectedId)
    if (node.empty()) return
    const box = node.renderedBoundingBox({})
    const visible = box.x1 >= 0 && box.y1 >= 0 && box.x2 <= cy.width() && box.y2 <= cy.height()
    if (!visible) {
      cy.stop()
      cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 0.9) }, ANIMATION)
    }
  }, [selectedId, elements])

  const zoomBy = (factor: number) => {
    const cy = cyRef.current
    if (!cy) return
    const level = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor))
    cy.stop()
    cy.animate({ zoom: { level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } }, ANIMATION)
  }

  const fit = () => {
    const cy = cyRef.current
    if (!cy) return
    cy.stop()
    cy.animate({ fit: { eles: cy.elements(), padding: 36 } }, ANIMATION)
  }

  // Reset: original layout positions (undoes node dragging), whole graph in view, no selection.
  const reset = () => {
    const cy = cyRef.current
    if (!cy) return
    cy.stop()
    cy.layout(layoutOptions).run()
    onSelectRef.current(null)
  }

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden bg-canvas">
      <div
        ref={containerRef}
        // Explicit size: Cytoscape sets `position: relative` on its container, so inset-0 would collapse it.
        className="h-full w-full bg-[radial-gradient(circle,rgb(255_255_255/0.055)_1px,transparent_1.3px)]"
        role="img"
        aria-label={`Dependency graph of ${graph.repository}: ${graph.nodes.length} modules, ${graph.edges.length} import edges. Use the module list or Ctrl+K to select modules with the keyboard.`}
      />
      {/* Soft vignette keeps the overlays readable without hiding the graph. */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_80px_rgb(0_0_0/0.45)]" aria-hidden="true" />

      <GraphControls
        zoomPercent={Math.round(zoom * 100)}
        onZoomIn={() => zoomBy(ZOOM_STEP)}
        onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
        onFit={fit}
        onReset={reset}
      />
      <GraphLegend packages={packages} />
      {hovered && <HoverCard node={hovered} />}
    </div>
  )
}

function HoverCard({ node }: { node: ModuleNodeData }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 max-w-[min(360px,calc(100%-1.5rem))] animate-fade-in rounded-lg border border-line-strong bg-surface/90 px-3 py-2 shadow-(--shadow-float) backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: node.color }} aria-hidden="true" />
        <span className="truncate font-mono text-[12px] text-ink">{node.id}</span>
      </div>
      <div className="mt-0.5 truncate pl-4 font-mono text-[11px] text-faint">{node.path}</div>
      <div className="mt-1.5 flex gap-3 pl-4 text-[11px] text-muted">
        <span>
          <span className="text-accent">→</span> imports {node.dependencyCount}
        </span>
        <span>
          <span className="text-incoming">←</span> imported by {node.dependentCount}
        </span>
        {node.hasScanError && <span className="text-danger">could not be parsed</span>}
      </div>
    </div>
  )
}
