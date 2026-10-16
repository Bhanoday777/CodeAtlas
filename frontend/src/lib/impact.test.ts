import { describe, expect, it } from 'vitest'

import type { ImpactResponse } from '../types/api'
import { distanceBucket, groupByDistance, impactHighlight, pathEdgeIds, stepVerb } from './impact'

// GET /api/impact/shop.services.pricing on the fixture (contract/fixture/impact--shop.services.pricing.json).
const PRICING: ImpactResponse = {
  changed_module: 'shop.services.pricing',
  affected: [
    { id: 'shop.lazy', distance: 1, path: ['shop.lazy', 'shop.services.pricing'] },
    { id: 'shop.services.orders', distance: 1, path: ['shop.services.orders', 'shop.services.pricing'] },
    { id: 'shop.main', distance: 2, path: ['shop.main', 'shop.services.orders', 'shop.services.pricing'] },
    { id: 'shop.services', distance: 2, path: ['shop.services', 'shop.services.orders', 'shop.services.pricing'] },
    { id: 'manage', distance: 3, path: ['manage', 'shop.main', 'shop.services.orders', 'shop.services.pricing'] },
  ],
  direct: ['shop.lazy', 'shop.services.orders'],
  transitive: ['shop.main', 'shop.services', 'manage'],
  diagnostics: [],
}

// The fixture's import cycle: cycle_a imports cycle_b and cycle_b imports cycle_a.
const CYCLE: ImpactResponse = {
  changed_module: 'shop.cycle_a',
  affected: [{ id: 'shop.cycle_b', distance: 1, path: ['shop.cycle_b', 'shop.cycle_a'] }],
  direct: ['shop.cycle_b'],
  transitive: [],
  diagnostics: [],
}

const NOTHING: ImpactResponse = { changed_module: 'manage', affected: [], direct: [], transitive: [], diagnostics: [] }

describe('distanceBucket', () => {
  it('keeps 1 and 2 and puts everything farther in bucket 3', () => {
    expect([1, 2, 3, 4, 9].map(distanceBucket)).toEqual([1, 2, 3, 3, 3])
  })
})

describe('groupByDistance', () => {
  it('groups by exact distance, nearest first, keeping the API order inside a group', () => {
    const groups = groupByDistance(PRICING)
    expect(groups.map((g) => [g.distance, g.modules.map((m) => m.id)])).toEqual([
      [1, ['shop.lazy', 'shop.services.orders']],
      [2, ['shop.main', 'shop.services']],
      [3, ['manage']],
    ])
  })

  it('returns no groups when nothing imports the module', () => {
    expect(groupByDistance(NOTHING)).toEqual([])
  })
})

describe('pathEdgeIds', () => {
  it('turns a path into importer → imported edges', () => {
    expect(pathEdgeIds(['manage', 'shop.main', 'shop.services.orders'])).toEqual([
      'manage→shop.main',
      'shop.main→shop.services.orders',
    ])
  })
})

describe('impactHighlight', () => {
  it('buckets every affected module by distance', () => {
    const highlight = impactHighlight('shop.services.pricing', PRICING, null)
    expect(Object.fromEntries(highlight.buckets)).toEqual({
      'shop.lazy': 1,
      'shop.services.orders': 1,
      'shop.main': 2,
      'shop.services': 2,
      manage: 3,
    })
    expect(highlight.ready).toBe(true)
    expect(highlight.focus).toBeNull()
  })

  it('collects the explanation-path edges as a tree: one edge per affected module', () => {
    const { pathEdges } = impactHighlight('shop.services.pricing', PRICING, null)
    expect([...pathEdges].sort()).toEqual([
      'manage→shop.main',
      'shop.lazy→shop.services.pricing',
      'shop.main→shop.services.orders',
      'shop.services.orders→shop.services.pricing',
      'shop.services→shop.services.orders',
    ])
    expect(pathEdges.size).toBe(PRICING.affected.length)
  })

  it('focuses one module’s path', () => {
    const { focus } = impactHighlight('shop.services.pricing', PRICING, 'manage')
    expect(focus).toEqual({
      id: 'manage',
      nodes: ['manage', 'shop.main', 'shop.services.orders', 'shop.services.pricing'],
      edges: ['manage→shop.main', 'shop.main→shop.services.orders', 'shop.services.orders→shop.services.pricing'],
    })
  })

  it('has no focus for the changed module or an unaffected one', () => {
    expect(impactHighlight('shop.services.pricing', PRICING, 'shop.services.pricing').focus).toBeNull()
    expect(impactHighlight('shop.services.pricing', PRICING, 'shop.models.order').focus).toBeNull()
  })

  it('handles an import cycle without listing the changed module as affected', () => {
    const highlight = impactHighlight('shop.cycle_a', CYCLE, null)
    expect([...highlight.buckets.keys()]).toEqual(['shop.cycle_b'])
    expect([...highlight.pathEdges]).toEqual(['shop.cycle_b→shop.cycle_a'])
  })

  it('is not ready while loading or while a report for another module is still shown', () => {
    expect(impactHighlight('shop.services.pricing', null, null)).toMatchObject({ ready: false, buckets: new Map() })
    expect(impactHighlight('shop.models.order', PRICING, null).ready).toBe(false)
  })

  it('is ready with nothing highlighted when nothing imports the module', () => {
    const highlight = impactHighlight('manage', NOTHING, null)
    expect(highlight.ready).toBe(true)
    expect(highlight.buckets.size).toBe(0)
    expect(highlight.pathEdges.size).toBe(0)
  })
})

describe('stepVerb', () => {
  // clusterOf maps a package's own __init__ to itself, a plain module to its package.
  const packages = { clusterOf: new Map<string, string | null>([['shop', 'shop'], ['shop.models', 'shop.models'], ['shop.models.order', 'shop.models'], ['manage', null]]) }

  it('says "imports from" for a package, since the edge may come from a module inside it', () => {
    expect(stepVerb('shop.models', packages)).toBe('imports from')
    expect(stepVerb('shop', packages)).toBe('imports from')
  })

  it('says "imports" for a plain module', () => {
    expect(stepVerb('shop.models.order', packages)).toBe('imports')
    expect(stepVerb('manage', packages)).toBe('imports')
  })
})
