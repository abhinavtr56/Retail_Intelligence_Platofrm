/**
 * REGRESSION: concurrent scenario runs must each resolve independently.
 *
 * THE DEFECT THIS PINS. `useSimulateScenario` is one shared react-query
 * mutation observer. `mutate(vars, { onSuccess })` stores those callbacks on
 * the OBSERVER, not on the request — so running scenario A and then running
 * scenario B before A returned overwrote A's callbacks with B's. A's request
 * succeeded on the server and nothing on the client ever heard about it:
 * `applyResult` never ran, `running` was never cleared, and A's card sat on
 * "Running against the KPI engine…" indefinitely.
 *
 * WHY THIS IS A BROWSER TEST. The bug is in the mutation observer's lifecycle
 * under real concurrency. A store-level unit test would pass against the broken
 * code, because the store was never at fault — it is the callbacks that went
 * missing. Reproducing it needs React, react-query and two overlapping requests,
 * which is to say: the running application. This project has no frontend test
 * runner, so this drives real headless Chrome over CDP with zero dependencies
 * (Node 22+ ships a global WebSocket).
 *
 * RUN IT:
 *   1. npm run build            (in frontend/)
 *   2. python -m uvicorn app.main:app --port 8011     (in backend/, serves dist)
 *   3. node e2e/concurrent-runs.mjs
 *
 * Optional: E2E_BASE=http://127.0.0.1:8011 to point elsewhere.
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
const inject = () => b.eval(HELPERS + ' return 1')

const click = (t) => b.eval(
  'const el = Array.from(document.querySelectorAll("button"))' +
  '  .find(x => !x.disabled && (x.innerText || "").includes(' + JSON.stringify(t) + '));' +
  'if (!el) return "not-found"; el.click(); return "clicked";')

/** Each scenario card, as {name, state, detail}. */
const cards = () => b.eval(
  'return Array.from(document.querySelectorAll("button"))' +
  '  .map(x => (x.innerText || "").split("\\n"))' +
  '  .filter(p => p.some(l => /^(MEASURED|SIMULATED|NOT SIMULATED|RUNNING|FAILED|ERROR)$/i.test(l.trim())))' +
  '  .map(p => ({ name: p[0].trim(),' +
  '               state: p.find(l => /^(MEASURED|SIMULATED|NOT SIMULATED|RUNNING|FAILED|ERROR)$/i.test(l.trim())).trim(),' +
  '               detail: (p[p.length - 1] || "").trim() }));')

const cardFor = async (name) => (await cards()).find((c) => c.name === name)

async function login() {
  await b.goto(`${BASE}/#/login`)
  await inject()
  await b.waitFor('login form', 'return !!document.querySelector("input[type=password]")')
  await b.eval(
    'const set = (e, v) => { const p = Object.getPrototypeOf(e);' +
    ' Object.getOwnPropertyDescriptor(p, "value").set.call(e, v);' +
    ' e.dispatchEvent(new Event("input", { bubbles: true })); };' +
    'const i = Array.from(document.querySelectorAll("input"));' +
    'set(i.find(x => x.type === "email") || i[0], "e2e@transorg.com");' +
    'set(document.querySelector("input[type=password]"), "e2e-regression");' +
    'document.querySelector("input[type=password]").closest("form").requestSubmit();' +
    'return 1;')
  await b.waitFor('signed in', 'return !location.hash.includes("login")', 20000)
}

async function studio() {
  await b.goto(`${BASE}/#/simulation`)
  await inject()
  await b.waitFor('scenarios seeded',
    'return document.body.innerText.includes("Optimized Plan") ? 1 : false', 60000)
  await b.waitFor('baseline done',
    'return !document.body.innerText.includes("Calculating baseline") ? 1 : false', 60000)
  await sleep(1200)
  await inject()
}

/** Select a scenario and its depth, then click Run. Does NOT wait. */
async function startRun(scenario, depth) {
  await inject()
  const picked = await click(scenario)
  await sleep(700)
  await inject()
  const depthPicked = await click(depth)
  await sleep(500)
  await inject()
  const ran = await click('Run Simulation')
  return picked === 'clicked' && depthPicked === 'clicked' && ran === 'clicked'
}

/** Wait until no card anywhere is still RUNNING. */
async function allSettled(timeout = 90000) {
  return b.waitFor('all runs settled',
    'return !document.body.innerText.includes("Running against the KPI engine") ? 1 : false',
    timeout).then(() => true).catch(() => false)
}

async function main() {
  b = await launch()
  await login()

  // ------------------------------------------------------- A → B, overlapping
  console.log('\n=== A and B started concurrently (the original defect) ===')
  await studio()
  const aStarted = await startRun('Optimized Plan', '15%')
  // Deliberately do NOT wait for A. This is the reproduction.
  await sleep(120)
  const bStarted = await startRun('Aggressive Growth', '20%')
  check('both runs started while the first was still in flight', aStarted && bStarted,
    `A=${aStarted} B=${bStarted}`)

  const settled = await allSettled()
  check('no card is left RUNNING', settled,
    settled ? 'both resolved' : 'a card is STILL RUNNING after 90s')

  await sleep(1200)
  await inject()
  const a = await cardFor('Optimized Plan')
  const bCard = await cardFor('Aggressive Growth')
  check('A resolved (SIMULATED or an error)',
    !!a && /SIMULATED|FAILED|ERROR/i.test(a.state) && a.state !== 'NOT SIMULATED',
    a ? `${a.state} · ${a.detail}` : 'card missing')
  check('B resolved (SIMULATED or an error)',
    !!bCard && /SIMULATED|FAILED|ERROR/i.test(bCard.state) && bCard.state !== 'NOT SIMULATED',
    bCard ? `${bCard.state} · ${bCard.detail}` : 'card missing')

  // Each result must describe its OWN treatment: A ran at 15%, B at 20%.
  check("A's result is A's own run (15%)", !!a && a.detail.includes('15%'), a?.detail)
  check("B's result is B's own run (20%)", !!bCard && bCard.detail.includes('20%'), bCard?.detail)
  check('the two results are different', a?.detail !== bCard?.detail)

  // ------------------------------------------------------------ A → B → A
  console.log('\n=== A → B → A ===')
  await studio()
  const s1 = await startRun('Optimized Plan', '10%')
  await sleep(100)
  const s2 = await startRun('Aggressive Growth', '25%')          // overlaps A
  check('A and B started overlapping', s1 && s2, `${s1} ${s2}`)

  // A SCENARIO THAT IS ALREADY RUNNING CANNOT BE RE-RUN, BY DESIGN:
  // LeverPanel's button is `disabled={running || !canRun}`, so the UI refuses a
  // second submit of the SAME scenario. That is the correct guard and this test
  // must not fight it — the third run is issued once A has settled, while B may
  // still be in flight.
  // While a run is in flight the button reads "Running simulation…" and is
  // disabled, so the same scenario cannot be submitted twice.
  const aBusy = await b.eval(
    'const el = Array.from(document.querySelectorAll("button"))' +
    '  .find(x => /Running simulation|Run Simulation/.test(x.innerText || ""));' +
    'return el ? { label: el.innerText.trim(), disabled: el.disabled } : "missing";')
  check('a scenario already running cannot be submitted twice',
    aBusy !== 'missing' && aBusy.disabled === true, JSON.stringify(aBusy))

  await b.waitFor('A settles',
    'const c = Array.from(document.querySelectorAll("button"))' +
    '  .map(x => (x.innerText || "").split("\\n"))' +
    '  .find(p => p[0] && p[0].trim() === "Optimized Plan");' +
    'return c && !c.some(l => l.trim() === "RUNNING") ? 1 : false;', 90000)
    .catch(() => null)

  const s3 = await startRun('Optimized Plan', '20%')
  check('A can be re-run once it has settled', s3, String(s3))

  const settled3 = await allSettled()
  check('no card is left RUNNING after three runs', settled3)
  await sleep(1200)
  await inject()
  const a3 = await cardFor('Optimized Plan')
  const b3 = await cardFor('Aggressive Growth')
  check('A settled on its LAST run (20%)', !!a3 && a3.detail.includes('20%'),
    a3 ? `${a3.state} · ${a3.detail}` : 'missing')
  check('B settled on its own run (25%)', !!b3 && b3.detail.includes('25%'),
    b3 ? `${b3.state} · ${b3.detail}` : 'missing')

  // ------------------------------------------- one run alone still works
  console.log('\n=== a single run, unchanged behaviour ===')
  await studio()
  const solo = await startRun('Aggressive Growth', '15%')
  const soloSettled = await allSettled()
  await sleep(1000)
  await inject()
  const soloCard = await cardFor('Aggressive Growth')
  check('a lone run still resolves normally', solo && soloSettled
    && !!soloCard && soloCard.state === 'SIMULATED',
    soloCard ? `${soloCard.state} · ${soloCard.detail}` : 'missing')
  // The handoff needs the recommendation AND the risk assessment, not just the
  // scenario result — a decision record is refused without them. So wait for
  // those panels to settle before asking whether the button is live.
  await b.waitFor('downstream panels settle',
    'const t = document.body.innerText;' +
    'return (!t.includes("Assessing risk and governance")' +
    '     && !t.includes("Preparing the comparison")) ? 1 : false;', 90000).catch(() => null)
  await sleep(1500)
  check('the handoff is still available after a run',
    (await b.eval(
      'const el = Array.from(document.querySelectorAll("button"))' +
      '  .find(x => (x.innerText || "").includes("Open Decision Center"));' +
      'return el ? !el.disabled : false;')) === true)

  // --------------------------------------------------------- console hygiene
  console.log('\n=== console ===')
  // The 401 on /api/auth/me before signing in is the documented signed-out
  // probe, not a defect.
  const errors = b.errors.filter((e) => !/401|favicon|DevTools|Autofill/i.test(e))
  check('no console or runtime errors', errors.length === 0,
    errors.slice(0, 4).join(' || ') || 'clean')

  // ------------------------------------------------------------------- done
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
  if (b) {
    try { console.error('cards:', JSON.stringify(await cards())) } catch {}
    await b.close()
  }
  process.exit(2)
})
