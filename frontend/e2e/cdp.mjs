// A tiny Chrome DevTools Protocol client.
//
// Zero dependencies: Node 24 ships a global WebSocket, so driving a real
// browser needs nothing installed. This is a genuine Chrome rendering the
// real application -- not jsdom, not a mock.

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

export class Browser {
  constructor(ws, proc, shotDir) {
    this.ws = ws
    this.proc = proc
    this.shotDir = shotDir
    this.id = 0
    this.pending = new Map()
    this.console = []
    this.errors = []
    this.failedRequests = []
    /** method -> handlers, for tests that need to react to a CDP event. */
    this.handlers = new Map()

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id)
        if (p) {
          this.pending.delete(msg.id)
          if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
          else p.resolve(msg.result)
        }
        return
      }
      // --- events we care about
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || [])
          .map((a) => a.value ?? a.description ?? a.type)
          .join(' ')
        this.console.push({ level: msg.params.type, text })
        if (msg.params.type === 'error') this.errors.push(`console.error: ${text}`)
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails
        this.errors.push(
          `uncaught: ${d.exception?.description || d.text}`.split('\n')[0],
        )
      }
      if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry
        this.console.push({ level: e.level, text: e.text })
        if (e.level === 'error') this.errors.push(`log: ${e.text}`)
      }
      const subscribed = this.handlers.get(msg.method)
      if (subscribed) subscribed.forEach((fn) => fn(msg.params))

      if (msg.method === 'Network.responseReceived') {
        const r = msg.params.response
        if (r.status >= 400) this.failedRequests.push(`${r.status} ${r.url}`)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 60000)
    })
  }

  /** Subscribe to a CDP event, e.g. `Fetch.requestPaused`. */
  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, [])
    this.handlers.get(method).push(handler)
  }

  /** Evaluate an expression in the page and return its JSON value. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) {
      throw new Error(
        `page error: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`,
      )
    }
    return r.result.value
  }

  /** Poll an expression until it returns truthy, or fail. */
  async waitFor(label, expression, timeout = 25000, interval = 250) {
    const start = Date.now()
    let last
    while (Date.now() - start < timeout) {
      try {
        // Accept either an expression or a full statement block that returns.
        last = await this.eval(
          /(^|[^.\w])return[\s(]/.test(expression) ? expression : `return (${expression})`,
        )
        if (last) return last
      } catch (e) {
        last = `error: ${e.message}`
      }
      await new Promise((r) => setTimeout(r, interval))
    }
    throw new Error(`waitFor("${label}") timed out after ${timeout}ms; last=${JSON.stringify(last)}`)
  }

  async goto(url) {
    await this.send('Page.navigate', { url })
    await new Promise((r) => setTimeout(r, 900))
  }

  async screenshot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' })
    const path = join(this.shotDir, `${name}.png`)
    writeFileSync(path, Buffer.from(data, 'base64'))
    return path
  }

  async close() {
    try { this.ws.close() } catch {}
    try { this.proc.kill() } catch {}
  }
}

export async function launch({ width = 1440, height = 900 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'tpo-qa-'))
  const shotDir = join(profile, 'shots')
  mkdirSync(shotDir, { recursive: true })

  const proc = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=9333',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ], { stdio: 'ignore' })

  // Wait for the debugging endpoint.
  let wsUrl
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9333/json/version')
      wsUrl = (await res.json()).webSocketDebuggerUrl
      if (wsUrl) break
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!wsUrl) throw new Error('Chrome did not expose a debugging endpoint')

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  const browser = new Browser(ws, proc, shotDir)

  // Attach to a real page target rather than the browser target.
  const targets = await browser.send('Target.getTargets')
  const page = targets.targetInfos.find((t) => t.type === 'page')
  const { sessionId } = await browser.send('Target.attachToTarget', {
    targetId: page.targetId, flatten: true,
  })
  // Route every subsequent message through the page session.
  browser.send = (method, params = {}) => {
    const id = ++browser.id
    browser.ws.send(JSON.stringify({ id, method, params, sessionId }))
    return new Promise((resolve, reject) => {
      browser.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (browser.pending.has(id)) {
          browser.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 60000)
    })
  }

  await browser.send('Page.enable')
  await browser.send('Runtime.enable')
  await browser.send('Log.enable')
  await browser.send('Network.enable')
  return browser
}

/** Helpers injected into the page for text-based interaction. */
export const HELPERS = `
  window.__q = (sel) => document.querySelector(sel);
  window.__all = (sel) => Array.from(document.querySelectorAll(sel));
  window.__byText = (tag, text) => Array.from(document.querySelectorAll(tag))
      .find(el => (el.innerText || '').trim().toLowerCase().includes(text.toLowerCase()));
  window.__clickText = (tag, text) => { const el = window.__byText(tag, text);
      if (!el) return false; el.click(); return true; };
  window.__bodyText = () => document.body.innerText;
  window.__has = (text) => (document.body.innerText || '').toLowerCase()
      .includes(text.toLowerCase());
`
