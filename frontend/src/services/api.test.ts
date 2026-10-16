import { describe, expect, it, vi } from 'vitest'

import type { GraphResponse, ImpactResponse, ModuleDetail } from '../types/api'
import { ApiError, createApiClient, resolveBaseUrl } from './api'

const BASE = 'http://api.test'

// Shaped like the real /api/graph response for fixtures/sample_python_project (trimmed).
const GRAPH: GraphResponse = {
  repository: 'sample_python_project',
  nodes: [
    { id: 'manage', path: 'manage.py', is_package: false, has_scan_error: false, dependency_count: 1, dependent_count: 0 },
    { id: 'shop.main', path: 'shop/main.py', is_package: false, has_scan_error: false, dependency_count: 0, dependent_count: 1 },
  ],
  edges: [{ source: 'manage', target: 'shop.main' }],
  summary: { modules: 2, edges: 1, external_imports: 6, unresolved_imports: 3, scan_errors: 1, warnings: 0 },
}

const MODULE: ModuleDetail = {
  id: 'manage',
  path: 'manage.py',
  is_package: false,
  has_scan_error: false,
  dependencies: ['shop.main'],
  dependents: [],
  external_imports: [{ raw: 'import sys', lineno: 1 }],
  unresolved_imports: [{ raw: 'from . import settings', lineno: 3 }],
}

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), { status, statusText, headers: { 'Content-Type': 'application/json' } })
}

function clientReturning(response: Response | Error) {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response
    return response
  })
  return { client: createApiClient(BASE, fetchMock), fetchMock }
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('expected the request to fail')
}

describe('resolveBaseUrl', () => {
  it('uses the documented local default when unset or blank', () => {
    expect(resolveBaseUrl(undefined)).toBe('http://127.0.0.1:8000')
    expect(resolveBaseUrl('  ')).toBe('http://127.0.0.1:8000')
  })

  it('strips trailing slashes', () => {
    expect(resolveBaseUrl('http://localhost:9000//')).toBe('http://localhost:9000')
  })
})

describe('getGraph', () => {
  it('returns the parsed graph and calls /api/graph', async () => {
    const { client, fetchMock } = clientReturning(jsonResponse(GRAPH))
    await expect(client.getGraph()).resolves.toEqual(GRAPH)
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/graph`)
  })

  it('accepts an empty graph', async () => {
    const empty = { ...GRAPH, nodes: [], edges: [], summary: { ...GRAPH.summary, modules: 0, edges: 0 } }
    const { client } = clientReturning(jsonResponse(empty))
    await expect(client.getGraph()).resolves.toEqual(empty)
  })

  it('reports an unreachable backend as a network error, not an empty result', async () => {
    const { client } = clientReturning(new TypeError('Failed to fetch'))
    const error = await caught(client.getGraph())
    expect(error.kind).toBe('network')
    expect(error.message).toContain(BASE)
  })

  it('reports a non-2xx response as an http error', async () => {
    const { client } = clientReturning(new Response('boom', { status: 500, statusText: 'Internal Server Error' }))
    const error = await caught(client.getGraph())
    expect(error.kind).toBe('http')
    expect(error.status).toBe(500)
  })

  it('rejects a body that does not match the contract', async () => {
    const { client } = clientReturning(jsonResponse({ repository: 'x', nodes: 'nope' }))
    expect((await caught(client.getGraph())).kind).toBe('invalid')
  })

  it('rejects a body that is not JSON', async () => {
    const { client } = clientReturning(new Response('<html>', { status: 200 }))
    expect((await caught(client.getGraph())).kind).toBe('invalid')
  })

  it('rejects an edge that points at a module missing from nodes', async () => {
    const broken = { ...GRAPH, edges: [{ source: 'manage', target: 'ghost' }] }
    const { client } = clientReturning(jsonResponse(broken))
    expect((await caught(client.getGraph())).kind).toBe('invalid')
  })

  it('passes abort errors through unchanged so callers can ignore them', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const { client } = clientReturning(abort)
    await expect(client.getGraph()).rejects.toBe(abort)
  })
})

describe('getModule', () => {
  it('returns module details', async () => {
    const { client, fetchMock } = clientReturning(jsonResponse(MODULE))
    await expect(client.getModule('manage')).resolves.toEqual(MODULE)
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/modules/manage`)
  })

  it('percent-encodes the module ID', async () => {
    const { client, fetchMock } = clientReturning(jsonResponse(MODULE))
    await client.getModule('pkg.café/x?y#z')
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/modules/pkg.caf%C3%A9%2Fx%3Fy%23z`)
  })

  it("surfaces the backend's 404 detail for an unknown module", async () => {
    const { client } = clientReturning(jsonResponse({ detail: "Unknown module: 'nope'" }, 404, 'Not Found'))
    const error = await caught(client.getModule('nope'))
    expect(error.kind).toBe('http')
    expect(error.status).toBe(404)
    expect(error.message).toBe("404: Unknown module: 'nope'")
  })
})

describe('getScanIssues', () => {
  it('returns scan issues', async () => {
    const issues = {
      scan_errors: [{ path: 'shop/broken.py', message: 'SyntaxError: invalid syntax', lineno: 3 }],
      unresolved_imports: [{ module: 'manage', raw: 'from . import settings', lineno: 3 }],
      self_imports: [],
      diagnostics: [{ code: 'scan_errors', message: '1 file(s) could not be parsed' }],
      limitations: ['Static analysis of import statements only.'],
    }
    const { client, fetchMock } = clientReturning(jsonResponse(issues))
    await expect(client.getScanIssues()).resolves.toEqual(issues)
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/scan/issues`)
  })
})

// GET /api/impact/shop.services.pricing on the fixture (contract/fixture/impact--shop.services.pricing.json).
const IMPACT: ImpactResponse = {
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
  diagnostics: [{ code: 'scan_errors', message: '1 file(s) could not be parsed' }],
}

describe('getImpact', () => {
  it('returns the impact report', async () => {
    const { client, fetchMock } = clientReturning(jsonResponse(IMPACT))
    await expect(client.getImpact('shop.services.pricing')).resolves.toEqual(IMPACT)
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/impact/shop.services.pricing`)
  })

  it('percent-encodes the module ID', async () => {
    const { client, fetchMock } = clientReturning(jsonResponse(IMPACT))
    await client.getImpact('pkg/x?y')
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/impact/pkg%2Fx%3Fy`)
  })

  it('accepts a module that nothing imports', async () => {
    const empty = { changed_module: 'manage', affected: [], direct: [], transitive: [], diagnostics: [] }
    const { client } = clientReturning(jsonResponse(empty))
    await expect(client.getImpact('manage')).resolves.toEqual(empty)
  })

  it.each([
    ['a path that does not start at the affected module', { 0: { ...IMPACT.affected[0], path: ['shop.main', 'shop.services.pricing'] } }],
    ['a path that does not end at the changed module', { 0: { ...IMPACT.affected[0], path: ['shop.lazy', 'shop.main'] } }],
    ['a distance that does not match the path length', { 0: { ...IMPACT.affected[0], distance: 2 } }],
  ])('rejects %s', async (_name, patch) => {
    const affected = Object.assign([...IMPACT.affected], patch)
    const { client } = clientReturning(jsonResponse({ ...IMPACT, affected }))
    expect((await caught(client.getImpact('shop.services.pricing'))).kind).toBe('invalid')
  })

  it('rejects direct / transitive lists that disagree with the distances', async () => {
    const { client } = clientReturning(jsonResponse({ ...IMPACT, direct: ['shop.lazy'] }))
    expect((await caught(client.getImpact('shop.services.pricing'))).kind).toBe('invalid')
  })

  it("surfaces the backend's 404 for an unknown module", async () => {
    const { client } = clientReturning(jsonResponse({ detail: "Unknown module: 'nope'" }, 404, 'Not Found'))
    const error = await caught(client.getImpact('nope'))
    expect(error.status).toBe(404)
  })
})
