// The e2e expectations are written for the fixture repository. A reused backend
// that scans something else would fail every test for a confusing reason, so stop early.

const EXPECTED = { repository: 'sample_python_project', module_count: 16, edge_count: 14 }

export default async function globalSetup() {
  const response = await fetch('http://127.0.0.1:8000/api/health')
  const health = (await response.json()) as typeof EXPECTED
  const mismatched = (Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]).filter((key) => health[key] !== EXPECTED[key])
  if (mismatched.length > 0) {
    throw new Error(
      `The backend on :8000 is not serving the fixture repository (got ${JSON.stringify(health)}). ` +
        'Stop it, or restart it without CODEATLAS_REPO, before running the e2e tests.',
    )
  }
}
