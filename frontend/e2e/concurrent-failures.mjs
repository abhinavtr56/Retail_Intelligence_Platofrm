/**
 * REGRESSION: when concurrent scenario runs are mixed success and failure,
 * each scenario must settle on ITS OWN outcome.
 *
 * The companion to `concurrent-runs.mjs`. That one proves two successful runs
 * no longer displace each other; this one proves a FAILING run settles its own
 * card and — just as importantly — does not settle anybody else's. Before the
 * fix both callbacks lived on one shared observer, so whichever run finished
 * last decided what every card said.
 *
 * HOW THE FAILURE IS INDUCED. Chrome's Fetch domain pauses each
 * `/api/simulation/simulate` request; the test reads the scenario id out of the
 * POST body and fails exactly one of them. Nothing in the application is
 * stubbed or mocked: the other request goes to the real backend and is computed
 * by the real engine.
 *
 * RUN IT (same prerequisites as concurrent-runs.mjs):
 *   node e2e/concurrent-failures.mjs
 */

import { launch, HELPERS } from './cdp.mjs'

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8011'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`)
}

let b
let failScenarioId = null          // which scenario's request to fail, if any
const inject = () => b.eval(HELPERS + ' return 1')

const click = (t) => b.eval(
  'const el = Array.from(document.querySelectorAll("button"))' +
  '  .find(x => !x.disabled && (x.innerText || "").includes(' + JSON.stringify(t) + '));' +
  'if (!el) return "not-found"; el.click(); return "clicked";')

const cards = () => b.eval(
  'return Array.from(document.querySelectorAll("button"))' +
  '  .map(x => (x.innerText || "").split("\\n"))' +
  '  .filter(p => p.some(l => /^(MEASURED|SIMULATED|NOT SIMULATED|RUNNING|FAILED|ERROR)$/i.test(l.trim())))' +
  '  .map(p => ({ name: p[0].trim(),' +
  '               state: p.find(l => /^(MEASURED|SIMULATED|NOT SIMULATED|RUNNING|FAILED|ERROR)$/i.test(l.trim())).trim(),' +
  '               body: p.join(" · ") }));')

const cardFor = async (n) => (await cards()).find((c) => c.name === n)

async function login() {
  await b.goto(`${BASE}/#/login`); await inject()
  await b.waitFor('login', 'return !!document.querySelector("input[type=password]")')
  await b.eval(
    'const set = (e, v) => { const p = Object.getPrototypeOf(e);' +
    ' Object.getOwnPropertyDescriptor(p, "value").set.call(e, v);' +
    ' e.dispatchEvent(new Event("input", { bubbles: true })); };' +
    'const i = Array.from(document.querySelectorAll("input"));' +
    'set(i.find(x => x.type === "email") || i[0], "e2e@transorg.com");' +
    'set(document.querySelector("input[type=password]"), "e2e-regression");' +
    'document.querySelector("input[type=password]").closest("form").requestSubmit();' +
    'return 1;')
  await b.waitFor('in', 'return !location.hash.includes("login")', 20000)
}

async function studio() {
  await b.goto(`${BASE}/#/simulation`); await inject()
  await b.waitFor('seeded', 'return document.body.innerText.includes("Optimized Plan") ? 1 : false', 60000)
  await b.waitFor('baseline', 'return !document.body.innerText.includes("Calculating baseline") ? 1 : false', 60000)
  await sleep(1200); await inject()
}

async function startRun(scenario, depth) {
  await inject()
  const a = await click(scenario); await sleep(700); await inject()
  const c = await click(depth); await sleep(500); await inject()
  const r = await click('Run Simulation')
  return a === 'clicked' && c === 'clicked' && r === 'clicked'
}

const allSettled = (t = 90000) => b.waitFor('settled',
  'return !document.body.innerText.includes("Running against the KPI engine") ? 1 : false', t)
  .then(() => true).catch(() => false)

/** Fail the /simulate request whose body names `failScenarioId`; pass the rest. */
async function interceptSimulate() {
  await b.send('Fetch.enable', {
    patterns: [{ urlPattern: '*/api/simulation/simulate*', requestStage: 'Request' }],
  })
  b.on('Fetch.requestPaused', async (p) => {
    let target = false
    try {
      const body = p.request.postData ? JSON.parse(p.request.postData) : {}
      target = failScenarioId !== null && body.scenario_id === failScenarioId
    } catch { /* not JSON — let it through */ }
    try {
      if (target) await b.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' })
      else await b.send('Fetch.continueRequest', { requestId: p.requestId })
    } catch { /* the request may already be gone */ }
  })
}

async function main() {
  b = await launch()
  await login()
  await interceptSimulate()

  // ------------------------------------------------- A fails, B succeeds
  console.log('\n=== A FAILS, B SUCCEEDS (overlapping) ===')
  await studio()
  failScenarioId = 'optimized-plan'
  const a1 = await startRun('Optimized Plan', '15%')
  await sleep(120)
  const b1 = await startRun('Aggressive Growth', '20%')
  check('both runs started', a1 && b1, `${a1} ${b1}`)
  check('neither card is left RUNNING', await allSettled())

  await sleep(1200); await inject()
  const aFail = await cardFor('Optimized Plan')
  const bOk = await cardFor('Aggressive Growth')
  check('A shows its own failure, not a result',
    !!aFail && aFail.state !== 'RUNNING' && aFail.state !== 'SIMULATED',
    aFail ? `${aFail.state}` : 'missing')
  check('A surfaces an error message', !!aFail && /fail|error|could not|unable/i.test(aFail.body),
    aFail ? aFail.body.slice(0, 90) : '')
  check('B still succeeded on its own request',
    !!bOk && bOk.state === 'SIMULATED' && bOk.body.includes('20%'),
    bOk ? `${bOk.state} · ${bOk.body.slice(-46)}` : 'missing')

  // ------------------------------------------------- A succeeds, B fails
  console.log('\n=== A SUCCEEDS, B FAILS (overlapping) ===')
  await studio()
  failScenarioId = 'aggressive-growth'
  const a2 = await startRun('Optimized Plan', '10%')
  await sleep(120)
  const b2 = await startRun('Aggressive Growth', '25%')
  check('both runs started', a2 && b2, `${a2} ${b2}`)
  check('neither card is left RUNNING', await allSettled())

  await sleep(1200); await inject()
  const aOk = await cardFor('Optimized Plan')
  const bFail = await cardFor('Aggressive Growth')
  check('A succeeded on its own request',
    !!aOk && aOk.state === 'SIMULATED' && aOk.body.includes('10%'),
    aOk ? `${aOk.state} · ${aOk.body.slice(-46)}` : 'missing')
  check('B shows its own failure, not A\'s result',
    !!bFail && bFail.state !== 'RUNNING' && bFail.state !== 'SIMULATED',
    bFail ? `${bFail.state}` : 'missing')
  check('B surfaces an error message', !!bFail && /fail|error|could not|unable/i.test(bFail.body),
    bFail ? bFail.body.slice(0, 90) : '')

  // ------------------------------------------------- recovery
  console.log('\n=== a failed scenario can be run again ===')
  failScenarioId = null                       // stop failing anything
  const retry = await startRun('Aggressive Growth', '25%')
  check('retry started', retry)
  check('neither card is left RUNNING', await allSettled())
  await sleep(1200); await inject()
  const recovered = await cardFor('Aggressive Growth')
  check('the previously failed scenario now succeeds',
    !!recovered && recovered.state === 'SIMULATED' && recovered.body.includes('25%'),
    recovered ? `${recovered.state} · ${recovered.body.slice(-46)}` : 'missing')
  const stillOk = await cardFor('Optimized Plan')
  check('the other scenario was not disturbed by the retry',
    !!stillOk && stillOk.state === 'SIMULATED' && stillOk.body.includes('10%'),
    stillOk ? stillOk.body.slice(-46) : 'missing')

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('FAILURES:')
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ' — ' + f.detail : ''}`))
  }
  await b.close()
  process.exit(failed.length ? 1 : 0)
}

main().catch(async (e) => {
  console.error('\nDRIVER ERROR:', e.message)
  if (b) { try { console.error('cards:', JSON.stringify(await cards())) } catch {} ; await b.close() }
  process.exit(2)
})
