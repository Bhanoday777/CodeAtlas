import cytoscape, { type Core } from 'cytoscape'
import dagre from 'cytoscape-dagre'
import { useEffect, useMemo, useRef, useState } from 'react'

import { toElements, type ModuleNodeData } from '../../lib/graphElements'
import type { GraphResponse } from '../../types/api'
import { GraphControls } from './GraphControls'
import { GraphLegend } from './GraphLegend'
import { graphStyle, layoutOptions } from './graphStyle'

cytoscape.use(dagre)

const SELECTION_CLASSES = 'selected dependency dependent outgoing incoming faded'
const ZOOM_STEP = 1.3
const ANIMATION = { duration: 200, easing: 'ease-out-cubic' } as const

interface DependencyGraphProps {
  graph: GraphResponse
  selectedId: string | null
  onSelect: (moduleId: string | null) => void
}

export function DependencyGraph({ graph, selectedId, onSelect }: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const onSelectRef = useRef(onSelect)
  const [hovered, setHovered] = useState<ModuleNodeData | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
  })

  // Conversion and layout run only when the graph data itself changes.
  const elements = useMemo(() => toElements(graph), [graph])

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

    cy.on('tap', 'node', (event) => onSelectRef.current(event.target.id()))
    cy.on('tap', (event) => {
      if (event.target === cy) onSelectRef.current(null)
    })
    cy.on('mouseover', 'node', (event) => {
      event.target.addClass('hovered')
      setHovered(event.target.data() as ModuleNodeData)
      container.style.cursor = 'pointer'
    })
    cy.on('mouseout', 'node', (event) => {
      event.target.removeClass('hovered')
      setHovered(null)
      container.style.cursor = ''
    })

    // Panels opening or the window resizing change the container size.
    const observer = new ResizeObserver(() => cy.resize())
    observer.observe(container)

    return () => {
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
      cy.elements().difference(node.closedNeighborhood()).addClass('faded')
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
    cy.animate({ fit: { eles: cy.elements(), padding: 40 } }, ANIMATION)
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
        className="h-full w-full"
        role="img"
        aria-label={`Dependency graph of ${graph.repository}: ${graph.nodes.length} modules, ${graph.edges.length} import edges. Use the module list to select modules with the keyboard.`}
      />
      <GraphControls onZoomIn={() => zoomBy(ZOOM_STEP)} onZoomOut={() => zoomBy(1 / ZOOM_STEP)} onFit={fit} onReset={reset} />
      <GraphLegend />
      {hovered && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md border border-line bg-surface/95 px-2.5 py-1.5 text-xs shadow-lg">
          <div className="truncate font-mono text-ink">{hovered.id}</div>
          <div className="truncate font-mono text-faint">{hovered.path}</div>
        </div>
      )}
    </div>
  )
}
