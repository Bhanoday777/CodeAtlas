import { describe, expect, it } from 'vitest'

import type { GraphNode, GraphResponse } from '../types/api'
import { clusterNodeId, edgeId, shortLabel, toElements } from './graphElements'

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
  modules: elements.filter((e) => e.group === 'nodes' && e.data.kind === 'module'),
  clusters: elements.filter((e) => e.group === 'nodes' && e.data.kind === 'package'),
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
    const { modules } = split(toElements(g))
    expect(modules.map((n) => n.data.id)).toEqual(['manage', 'shop', 'shop.main'])
    expect(modules[1].data).toMatchObject({ label: 'shop', path: 'shop/__init__.py', isPackage: true })
  })

  it('keeps edge direction: source imports target', () => {
    const g = graph([node('manage'), node('shop.main')], [['manage', 'shop.main']])
    const { edges } = split(toElements(g))
    expect(edges).toHaveLength(1)
    expect(edges[0].data).toEqual({ id: edgeId('manage', 'shop.main'), source: 'manage', target: 'shop.main' })
  })

  it('only connects edges to modules, never to package boxes', () => {
    const g = graph([node('shop', { is_package: true }), node('shop.main')], [['shop', 'shop.main']])
    const { edges, clusters } = split(toElements(g))
    const clusterIds = new Set(clusters.map((c) => c.data.id))
    expect(edges.every((e) => !clusterIds.has(e.data.source!) && !clusterIds.has(e.data.target!))).toBe(true)
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
    const { modules } = split(toElements(g))
    expect(modules.map((n) => n.classes)).toEqual(['module package', 'module scan-error', 'module'])
  })

  it('places modules inside nested package boxes', () => {
    const g = graph(
      [node('manage'), node('shop', { is_package: true }), node('shop.models', { is_package: true }), node('shop.models.order')],
      [],
    )
    const { modules, clusters } = split(toElements(g))
    const parentOf = Object.fromEntries([...modules, ...clusters].map((e) => [e.data.id, e.data.parent]))
    expect(parentOf).toEqual({
      manage: undefined,
      shop: clusterNodeId('shop'),
      'shop.models': clusterNodeId('shop.models'),
      'shop.models.order': clusterNodeId('shop.models'),
      [clusterNodeId('shop')]: undefined,
      [clusterNodeId('shop.models')]: clusterNodeId('shop'),
    })
  })

  it('weights nodes by how many modules import them (0 = none, 1 = most imported)', () => {
    const g = graph([node('a', { dependent_count: 0 }), node('b', { dependent_count: 1 }), node('c', { dependent_count: 4 })], [])
    const weights = split(toElements(g)).modules.map((n) => n.data.weight)
    expect(weights).toEqual([0, 0.5, 1])
  })

  it('returns nothing for an empty graph', () => {
    expect(toElements(graph([], []))).toEqual([])
  })
})
