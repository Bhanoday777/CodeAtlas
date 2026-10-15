import { describe, expect, it } from 'vitest'

import type { GraphNode } from '../types/api'
import { rankModules, searchModules } from './searchModules'

const nodes: GraphNode[] = [
  ['manage', 'manage.py'],
  ['shop.models', 'shop/models/__init__.py'],
  ['shop.models.order', 'shop/models/order.py'],
  ['shop.services.pricing', 'shop/services/pricing.py'],
].map(([id, path]) => ({ id, path, is_package: path.endsWith('__init__.py'), has_scan_error: false, dependency_count: 0, dependent_count: 0 }))

const ids = (query: string) => searchModules(nodes, query).map((n) => n.id)

describe('searchModules', () => {
  it('returns every module for an empty or blank query', () => {
    expect(ids('')).toHaveLength(4)
    expect(ids('   ')).toHaveLength(4)
  })

  it('matches module IDs', () => {
    expect(ids('models.order')).toEqual(['shop.models.order'])
    expect(ids('pricing')).toEqual(['shop.services.pricing'])
  })

  it('matches file paths', () => {
    expect(ids('models/__init__')).toEqual(['shop.models'])
    expect(ids('.py')).toHaveLength(4)
  })

  it('ignores case and surrounding whitespace', () => {
    expect(ids('  MANAGE ')).toEqual(['manage'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(ids('nonexistent')).toEqual([])
  })

  it('keeps the input order', () => {
    expect(ids('shop')).toEqual(['shop.models', 'shop.models.order', 'shop.services.pricing'])
  })
})

describe('rankModules', () => {
  const ranked = (query: string, limit?: number) => rankModules(nodes, query, limit).map((n) => n.id)

  it('puts an exact module name first, then name prefixes, then other ID matches', () => {
    // "order" is the exact name of shop.models.order; nothing else is named "order".
    expect(ranked('order')).toEqual(['shop.models.order'])
    expect(ranked('models')).toEqual(['shop.models', 'shop.models.order'])
    // Name prefixes (manage, models) before a segment match inside the ID (shop.models.order).
    expect(ranked('m')).toEqual(['manage', 'shop.models', 'shop.models.order'])
  })

  it('falls back to path matches last', () => {
    expect(ranked('__init__')).toEqual(['shop.models'])
  })

  it('uses the same normalization as searchModules and finds the same set', () => {
    for (const query of ['  SHOP ', 'pric', '.py', 'zzz']) {
      expect(new Set(ranked(query))).toEqual(new Set(searchModules(nodes, query).map((n) => n.id)))
    }
  })

  it('limits the number of results', () => {
    expect(ranked('', 2)).toEqual(['manage', 'shop.models'])
    expect(ranked('shop', 1)).toEqual(['shop.models'])
  })
})
