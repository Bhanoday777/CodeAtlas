// Runs the frontend's response guards, API client and graph conversion on the
// committed API snapshots in contract/fixture/. The backend test
// (backend/tests/contract/test_contract_snapshots.py) checks that the real API
// still produces exactly these files, so a contract change fails on one side.

import { describe, expect, it, vi } from 'vitest'

import { toElements, edgeId } from './lib/graphElements'
import { impactHighlight } from './lib/impact'
import { buildPackageModel } from './lib/packages'
import { ApiError, createApiClient, type ApiClient } from './services/api'
import type { GraphResponse, ImpactResponse, ModuleDetail, ScanIssuesResponse } from './types/api'
import { errorTitle } from './lib/errorText'

interface Snapshot {
  /** "GET /api/..." */
  request: string
  status: number
  body: unknown
}

const files = import.meta.glob<Snapshot>('../../contract/fixture/*.json', { eager: true, import: 'default' })
const snapshots = new Map(Object.entries(files).map(([path, snapshot]) => [path.split('/').pop()!.replace(/\.json$/, ''), snapshot]))

function snapshot(name: string): Snapshot {
  const found = snapshots.get(name)
  if (!found) throw new Error(`contract/fixture/${name}.json is missing`)
  return found
}

const named = (prefix: string) => [...snapshots.keys()].filter((name) => name.startsWith(prefix)).sort()

/** An API client whose fetch answers with the snapshot recorded for that request. */
function clientFromSnapshots(): ApiClient {
  const byPath = new Map([...snapshots.values()].map((s) => [s.request.replace(/^GET /, ''), s]))
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const path = new URL(String(input)).pathname
    const recorded = byPath.get(path)
    if (!recorded) throw new Error(`no snapshot for ${path}`)
    return new Response(JSON.stringify(recorded.body), { status: recorded.status, headers: { 'Content-Type': 'application/json' } })
  })
  return createApiClient('http://api.test', fetchMock)
}

const client = clientFromSnapshots()
const graph = snapshot('graph').body as GraphResponse

describe('contract snapshots', () => {
  it('are all consumed by this test, except the health check the UI does not call', () => {
    const consumed = ['graph', 'scan-issues', ...named('module--'), ...named('impact--'), ...named('error--')]
    expect([...snapshots.keys()].sort()).toEqual([...consumed, 'health'].sort())
    expect(named('module--').length).toBeGreaterThan(0)
    expect(named('impact--').length).toBeGreaterThan(0)
  })
})

describe('graph snapshot', () => {
  it('passes the client guard', async () => {
    await expect(client.getGraph()).resolves.toEqual(graph)
  })

  it('converts to Cytoscape elements with every module, every edge, and the API edge direction', () => {
    const packages = buildPackageModel(graph.nodes)
    const elements = toElements(graph, packages)
    const modules = elements.filter((e) => e.data.kind === 'module')
    const edges = elements.filter((e) => e.group === 'edges')
    expect(modules.map((e) => e.data.id).sort()).toEqual(graph.nodes.map((n) => n.id).sort())
    expect(edges.map((e) => [e.data.source, e.data.target])).toEqual(graph.edges.map((e) => [e.source, e.target]))
    // Every module's package box exists, so Cytoscape can nest it.
    const ids = new Set(elements.map((e) => e.data.id))
    for (const element of elements) if (element.data.parent) expect(ids).toContain(element.data.parent)
  })

  it('has summary counts that agree with its own nodes and edges', () => {
    expect(graph.summary.modules).toBe(graph.nodes.length)
    expect(graph.summary.edges).toBe(graph.edges.length)
  })
})

describe('module detail snapshots', () => {
  it.each(named('module--'))('%s passes the guard and agrees with the graph edges', async (name) => {
    const id = name.slice('module--'.length)
    const detail: ModuleDetail = await client.getModule(id)
    expect(detail).toEqual(snapshot(name).body)
    const imports = graph.edges.filter((e) => e.source === id).map((e) => e.target)
    const importedBy = graph.edges.filter((e) => e.target === id).map((e) => e.source)
    expect(detail.dependencies).toEqual(imports.sort())
    expect(detail.dependents).toEqual(importedBy.sort())
  })
})

describe('impact snapshots', () => {
  const edgeIds = new Set(graph.edges.map((e) => edgeId(e.source, e.target)))

  it.each(named('impact--'))('%s passes the guard and every explanation path is drawn with real graph edges', async (name) => {
    const id = name.slice('impact--'.length)
    const report: ImpactResponse = await client.getImpact(id)
    expect(report).toEqual(snapshot(name).body)
    const highlight = impactHighlight(id, report, null)
    expect(highlight.ready).toBe(true)
    expect(highlight.buckets.size).toBe(report.affected.length)
    for (const edge of highlight.pathEdges) expect(edgeIds).toContain(edge)
  })
})

describe('scan issues snapshot', () => {
  it('passes the client guard', async () => {
    const issues: ScanIssuesResponse = await client.getScanIssues()
    expect(issues).toEqual(snapshot('scan-issues').body)
  })
})

describe('error snapshot', () => {
  it("surfaces the API's 404 detail as an http error with a readable title", async () => {
    const recorded = snapshot('error--unknown-module')
    const id = decodeURIComponent(recorded.request.split('/').pop()!)
    const error = await client.getModule(id).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).message).toBe(`404: ${(recorded.body as { detail: string }).detail}`)
    expect(errorTitle(error as ApiError, 'this module')).toBe('This module was not found')
  })
})
