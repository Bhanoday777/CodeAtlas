import { describe, expect, it } from 'vitest'

import type { GraphNode } from '../types/api'
import { searchModules } from './searchModules'

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
