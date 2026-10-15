import { describe, expect, it } from 'vitest'

import type { GraphNode, GraphResponse } from '../types/api'
import { edgeId, shortLabel, toElements } from './graphElements'

function node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    path: `${id.replaceAll('.', '/')}.py`,
    is_package: false,
    has_scan_error: false,
    dependency_count: 0,
    dependent_count: 0,
    ...overrides,
  }
}

function graph(nodes: GraphNode[], edges: [string, string][]): GraphResponse {
  return {
    repository: 'repo',
    nodes,
    edges: edges.map(([source, target]) => ({ source, target })),
    summary: { modules: nodes.length, edges: edges.length, external_imports: 0, unresolved_imports: 0, scan_errors: 0, warnings: 0 },
  }
}

const split = (elements: ReturnType<typeof toElements>) => ({
  nodes: elements.filter((e) => e.group === 'nodes'),
  edges: elements.filter((e) => e.group === 'edges'),
})

describe('shortLabel', () => {
  it('uses the last segment of a dotted ID', () => {
    expect(shortLabel('shop.models.order')).toBe('order')
    expect(shortLabel('manage')).toBe('manage')
  })
})

describe('toElements', () => {
  it('creates one node per module, keyed by the module ID', () => {
    const g = graph([node('manage'), node('shop', { is_package: true, path: 'shop/__init__.py' }), node('shop.main')], [])
    const { nodes } = split(toElements(g))
    expect(nodes.map((n) => n.data.id)).toEqual(['manage', 'shop', 'shop.main'])
    expect(nodes[1].data).toMatchObject({ label: 'shop', path: 'shop/__init__.py', isPackage: true })
  })

  it('keeps edge direction: source imports target', () => {
    const g = graph([node('manage'), node('shop.main')], [['manage', 'shop.main']])
    const { edges } = split(toElements(g))
    expect(edges).toHaveLength(1)
    expect(edges[0].data).toEqual({ id: edgeId('manage', 'shop.main'), source: 'manage', target: 'shop.main' })
  })

  it('keeps both edges of an import cycle as distinct elements', () => {
    const g = graph([node('a'), node('b')], [['a', 'b'], ['b', 'a']])
    const { edges } = split(toElements(g))
    expect(edges.map((e) => [e.data.source, e.data.target])).toEqual([['a', 'b'], ['b', 'a']])
    expect(new Set(edges.map((e) => e.data.id)).size).toBe(2)
  })

  it('handles a self-loop without dropping it', () => {
    const { edges } = split(toElements(graph([node('a')], [['a', 'a']])))
    expect(edges.map((e) => e.data)).toEqual([{ id: edgeId('a', 'a'), source: 'a', target: 'a' }])
  })

  it('skips a repeated edge instead of creating a duplicate element ID', () => {
    const { edges } = split(toElements(graph([node('a'), node('b')], [['a', 'b'], ['a', 'b']])))
    expect(edges).toHaveLength(1)
  })

  it('marks packages and modules with scan errors with classes', () => {
    const g = graph([node('pkg', { is_package: true }), node('broken', { has_scan_error: true }), node('plain')], [])
    const { nodes } = split(toElements(g))
    expect(nodes.map((n) => n.classes)).toEqual(['package', 'scan-error', ''])
  })

  it('returns nothing for an empty graph', () => {
    expect(toElements(graph([], []))).toEqual([])
  })
})
