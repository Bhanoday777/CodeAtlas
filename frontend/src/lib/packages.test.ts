import { describe, expect, it } from 'vitest'

import type { GraphNode } from '../types/api'
import { buildPackageModel, containingPackage, PACKAGE_COLORS, ROOT_COLOR } from './packages'

const node = (id: string, is_package = false): GraphNode => ({
  id,
  path: `${id.replaceAll('.', '/')}${is_package ? '/__init__.py' : '.py'}`,
  is_package,
  has_scan_error: false,
  dependency_count: 0,
  dependent_count: 0,
})

// Mirrors fixtures/sample_python_project (subset).
const FIXTURE = [
  node('manage'),
  node('shop', true),
  node('shop.main'),
  node('shop.models', true),
  node('shop.models.order'),
  node('shop.services', true),
  node('shop.services.orders'),
]

describe('containingPackage', () => {
  it('puts a package __init__ in its own package and a module in its parent', () => {
    expect(containingPackage(node('shop.services', true))).toBe('shop.services')
    expect(containingPackage(node('shop.services.orders'))).toBe('shop.services')
  })

  it('returns null for a top-level module', () => {
    expect(containingPackage(node('manage'))).toBeNull()
  })
})

describe('buildPackageModel', () => {
  it('creates nested clusters sorted by ID, with module counts', () => {
    const { clusters } = buildPackageModel(FIXTURE)
    expect(clusters.map(({ id, parent, moduleCount }) => ({ id, parent, moduleCount }))).toEqual([
      { id: 'shop', parent: null, moduleCount: 2 },
      { id: 'shop.models', parent: 'shop', moduleCount: 2 },
      { id: 'shop.services', parent: 'shop', moduleCount: 2 },
    ])
  })

  it('adds intermediate clusters that have no modules of their own', () => {
    const { clusters } = buildPackageModel([node('ns.sub.mod')])
    expect(clusters.map((c) => [c.id, c.parent, c.moduleCount])).toEqual([
      ['ns', null, 0],
      ['ns.sub', 'ns', 1],
    ])
  })

  it('colors modules by package, deterministically, and top-level modules neutrally', () => {
    const model = buildPackageModel(FIXTURE)
    expect(model.colorOf('shop.models.order')).toBe(model.colorOf('shop.models'))
    expect(model.colorOf('shop.models')).not.toBe(model.colorOf('shop.services'))
    expect(model.colorOf('manage')).toBe(ROOT_COLOR)
    expect(model.colorOf('shop')).toBe(PACKAGE_COLORS[0])
    expect(buildPackageModel([...FIXTURE].reverse()).colorOf('shop.services')).toBe(model.colorOf('shop.services'))
  })

  it('handles a repository with no packages', () => {
    const model = buildPackageModel([node('a'), node('b')])
    expect(model.clusters).toEqual([])
    expect(model.clusterOf.get('a')).toBeNull()
  })
})
