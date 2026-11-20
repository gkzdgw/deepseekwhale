/**
 * dsh-dim-womb · Host 半边
 * ========================
 *
 * 两件事：
 *
 *   1. 把 assets/ 里的那一页「次元生殖腔体 · 状态档案」交出去
 *      GET /__dim-womb/              → 面板本体（单文件，样式和脚本都内联）
 *
 *   2. 提供一个「最近有没有在用 DSH」的活动读数
 *      GET /__dim-womb/api/activity  → { connected, lastAt, requests1h, ... }
 *
 * 活动读数是只读的：tail 一下 token-monitor 的 request-details.jsonl，
 * 数一数最近一小时/一天有多少次模型请求、多少 token；那个文件不在，
 * 就退回看 sessions 目录的修改时间。不写盘、不改任何会话。
 */
import {defaultGestationMinutes,validGestationMinutes} from '../assets/gestation.js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, closeSync, createReadStream, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

export const name = 'dim-womb'
export const version = '0.12.13'

const ROUTE_PREFIX = '/__dim-womb/'
/**
 * 注册时不能带尾斜杠：webServer 的 prefix 匹配是
 * `url === path || url.startsWith(path + '/')`，带尾斜杠就变成要求
 * `/__dim-womb//home.html`，正常请求反而 404。
 */
export const REGISTER_PATH = '/__dim-womb'
export const ACTIVITY_PATH = '/__dim-womb/api/activity'
const BASE = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
}

/* ------------------------------------------------------------ 活动读数 */

function dshHome(env = process.env) {
  const configured = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  return configured ? resolve(configured) : join(homedir(), '.dsh')
}

/** token-monitor / damage-pulse 写的逐次请求明细（一行一条 attempt）。 */
export function detailFile(env = process.env) {
  return join(dshHome(env), 'data', 'dsh-token-monitor', 'request-details.jsonl')
}

/** 只读文件尾部若干字节，按行切；第一条可能是半行，丢掉。 */
function readTailLines(file, bytes) {
  const size = statSync(file).size
  const start = Math.max(0, size - bytes)
  const length = size - start
  const buffer = Buffer.alloc(length)
  const fd = openSync(file, 'r')
  try {
    readSync(fd, buffer, 0, length, start)
  } finally {
    closeSync(fd)
  }
  let text = buffer.toString('utf8')
  if (start > 0) {
    const nl = text.indexOf('\n')
    text = nl >= 0 ? text.slice(nl + 1) : ''
  }
  return text.split('\n').filter(Boolean)
}

function attemptOf(line) {
  try {
    const row = JSON.parse(line)
    const value = row && row.value ? row.value : row
    if (!value || typeof value !== 'object') return null
    const at = Number(value.timestamp ?? value.endedAt ?? value.startedAt)
    if (!Number.isFinite(at) || at <= 0) return null
    const out = Number(value.outputTokens) || 0
    return { at, out }
  } catch {
    return null
  }
}

/** sessions 兜底：最近被写过的会话目录时间。 */
function sessionsFallback(now) {
  const root = join(dshHome(), 'sessions')
  let newest = 0
  let visited = 0
  try {
    for (const workspace of readdirSync(root, { withFileTypes: true })) {
      if (!workspace.isDirectory()) continue
      const dir = join(root, workspace.name)
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        visited += 1
        try {
          const info = statSync(join(dir, entry.name))
          if (info.mtimeMs > newest) newest = info.mtimeMs
        } catch { /* 读不到就算 */ }
      }
      if (visited > 4000) break
    }
  } catch {
    return null
  }
  if (!newest) return null
  return {
    connected: true,
    source: 'sessions',
    lastAt: newest,
    idleMs: Math.max(0, now - newest),
    requests1h: 0,
    requests24h: 0,
    tokens24h: 0,
    activeMinutesToday: 0,
    recent: [],
  }
}

export function readActivity(env = process.env, now = Date.now()) {
  const file = detailFile(env)
  let attempts = []
  try {
    attempts = readTailLines(file, 131072).map(attemptOf).filter(Boolean)
  } catch {
    attempts = []
  }

  if (attempts.length === 0) {
    const fallback = sessionsFallback(now)
    if (fallback) return fallback
    return {
      connected: false,
      source: 'none',
      lastAt: 0,
      idleMs: 0,
      requests1h: 0,
      requests24h: 0,
      tokens24h: 0,
      activeMinutesToday: 0,
      recent: [],
    }
  }

  attempts.sort((a, b) => a.at - b.at)
  const lastAt = attempts[attempts.length - 1].at

  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const sinceMidnight = midnight.getTime()

  let requests1h = 0
  let requests24h = 0
  let tokens24h = 0
  const minutes = new Set()

  for (const attempt of attempts) {
    if (now - attempt.at <= 3_600_000) requests1h += 1
    if (now - attempt.at <= 86_400_000) {
      requests24h += 1
      tokens24h += attempt.out
    }
    if (attempt.at >= sinceMidnight) minutes.add(Math.floor(attempt.at / 60_000))
  }

  return {
    connected: true,
    source: 'token-monitor',
    lastAt,
    idleMs: Math.max(0, now - lastAt),
    requests1h,
    requests24h,
    tokens24h,
    activeMinutesToday: minutes.size,
    recent: attempts.slice(-40).map((attempt) => attempt.at),
  }
}

/* ---------------------------------------------------------------- 静态 */

function sendText(res, status, text) {
  if (res.headersSent || res.writableEnded) return
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(text)
}

function sendJson(res, status, body) {
  if (res.headersSent || res.writableEnded) return
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/** 把请求路径安全地映射成 assets 下的绝对路径；越界一律拒绝。 */
export function resolveAsset(url) {
  const raw = String(url || '').split('?')[0].split('#')[0]
  let rel
  try {
    rel = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (rel === REGISTER_PATH) rel = ROUTE_PREFIX
  if (!rel.startsWith(ROUTE_PREFIX)) return null
  rel = rel.slice(ROUTE_PREFIX.length)
  if (!rel || rel === '/') rel = 'home.html'
  const full = normalize(join(BASE, rel))
  if (full !== BASE && !full.startsWith(BASE + sep)) return null
  return full
}

function validSettings(value) {
  return Number.isInteger(value?.capacity) && value.capacity >= 10 && value.capacity <= 9999 &&
    Number.isFinite(value.hatchAt) && value.hatchAt >= 1 && value.hatchAt <= value.capacity &&
    Number.isInteger(value.hatchAt * 10) &&
    (value.gestationMinutes === undefined || validGestationMinutes(value.gestationMinutes))
}

// Use the billing plugin's daily numeric buckets. Its session records never enter the response.
const tokenFields=['input','output','cacheRead','cacheWrite','reasoning']
function localDay(date){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
function createUsageReader(){
  let cached,stamp,baseline
  return async function readUsage(){
    try {
      const file=join(dshHome(),'storages','cost-meter','ledger.json')
      const stat=statSync(file),key=[stat.ino,stat.mtimeMs,stat.size].join('/')
      if (!cached || key!==stamp){
        const {DatabaseSync}=await import('node:sqlite')
        const db=new DatabaseSync(':memory:')
        try {
          const json=readFileSync(file,'utf8').replace(/^\uFEFF/,'')
          if(db.prepare("SELECT json_type(?, '$.days') AS type").get(json).type!=='object')return null
          const buckets=tokenFields.map(field=>"coalesce(json_extract(value,'$."+field+"'),0)").join('+')
          const rows=db.prepare(`SELECT key AS day, ${buckets} AS tokens FROM json_each(?, '$.days')`).all(json)
          const days={}
          for(const {day,tokens} of rows){
            if(!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isSafeInteger(tokens) || tokens<0)return null
            days[day]=tokens
          }
          cached=days;stamp=key
        } finally {db.close()}
      }
      const today=localDay(new Date())
      baseline ??= {since:today,days:{[today]:cached[today]||0}}
      return {today,days:cached,baseline}
    } catch {return null}
  }
}

async function billingReward(req, res) {
  if (req.method !== 'GET') return sendText(res,405,'method not allowed')
  try {
    // Only project the cost meter's top-level daily CNY amounts. Never traverse session records.
    const ledger = readFileSync(join(dshHome(), 'storages','cost-meter','ledger.json'),'utf8').replace(/^\uFEFF/,'')
    const {DatabaseSync} = await import('node:sqlite')
    const db = new DatabaseSync(':memory:')
    try {
      const {total, days, priced} = db.prepare(`SELECT sum(amount) AS total,count(*) AS days,count(amount) AS priced FROM
        (SELECT CASE WHEN json_type(value,'$.costCny') IN ('integer','real') THEN json_extract(value,'$.costCny') END AS amount
         FROM json_each(?, '$.days') WHERE key GLOB '????-??-??')`).get(ledger)
      if (days !== priced) return sendText(res,422,'部分日期缺少人民币账单汇总')
      const cents=Math.max(0,Math.round((total || 0)*100))
      return sendJson(res,200,{cents})
    } finally {db.close()}
  } catch (error) {
    return sendText(res,error.code==='ENOENT'?404:503,'未能读取本机人民币账单汇总')
  }
}

async function reserveSettings(req, res) {
  const file = join(dshHome(), 'data', 'dsh-dim-womb', 'settings.json')
  const readSettings = () => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  try {
    if (req.method === 'GET') {
      const settings = readSettings()
      if (!validSettings(settings)) return sendText(res, 422, '配置中的容量、孕育门槛或时长无效')
      return sendJson(res, 200, settings)
    }
    if (req.method !== 'PUT') return sendText(res, 405, 'method not allowed')
    if (req.headers['content-type'] !== 'application/json' || req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return sendText(res, 403, '请求来源无效')
    let body = ''
    for await (const part of req) {
      body += part
      if (body.length > 1024) return sendText(res, 413, '配置过长')
    }
    let settings
    try { settings = JSON.parse(body) } catch { return sendText(res, 400, '配置格式有误') }
    if (!validSettings(settings)) return sendText(res, 400, '配置数值无效')
    let gestationMinutes = settings.gestationMinutes
    if (gestationMinutes === undefined) {
      // Older clients only submit capacity and threshold.
      try { gestationMinutes = readSettings().gestationMinutes }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      if (!validGestationMinutes(gestationMinutes)) gestationMinutes=defaultGestationMinutes
    }
    const data = {capacity:settings.capacity, hatchAt:settings.hatchAt, gestationMinutes}
    mkdirSync(dirname(file), {recursive:true})
    const temp = file + '.' + randomUUID() + '.tmp'
    try {
      writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', 'utf8')
      renameSync(temp, file)
    } finally { rmSync(temp, {force:true}) }
    return sendJson(res, 200, data)
  } catch (error) {
    if (req.method === 'GET' && error.code === 'ENOENT') return sendJson(res, 200, null)
    return sendText(res, 500, '无法读写储存配置')
  }
}

export function apply(ctx) {
  if (!ctx || typeof ctx.inject !== 'function') return

  ctx.inject(['webServer', 'connection'], (scoped) => {
    const readUsage=createUsageReader()
    void readUsage()
    scoped.effect(() => scoped.webServer.register({
      kind: 'prefix',
      path: REGISTER_PATH,
      handler: async (req, res) => {
        try {
          if (!scoped.connection.authorizeIndex(req, res)) return
        } catch {
          sendText(res, 403, '没有访问权限')
          return
        }
        if (String(req.url).split('?')[0] === '/__dim-womb/api/billing-reward') return billingReward(req,res)
        if (String(req.url).split('?')[0] === '/__dim-womb/api/settings') return reserveSettings(req, res)
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendText(res, 405, 'method not allowed')
          return
        }

        const pathname = String(req.url || '').split('?')[0]
        if (pathname === ACTIVITY_PATH) {
          try {
            sendJson(res, 200, {...readActivity(),meter:await readUsage()})
          } catch (error) {
            sendJson(res, 200, {
              connected: false,
              source: 'error',
              lastAt: 0,
              idleMs: 0,
              requests1h: 0,
              requests24h: 0,
              tokens24h: 0,
              activeMinutesToday: 0,
              recent: [],
              detail: error instanceof Error ? error.message : String(error),
            })
          }
          return
        }

        const full = resolveAsset(req.url)
        if (!full) {
          sendText(res, 403, '路径不合法')
          return
        }

        let info
        try {
          info = statSync(full)
        } catch {
          sendText(res, 404, '找不到这个文件')
          return
        }
        if (!info.isFile()) {
          sendText(res, 404, '不是文件')
          return
        }

        const type = MIME[extname(full).toLowerCase()] || 'application/octet-stream'
        res.writeHead(200, {
          'content-type': type,
          'content-length': info.size,
          'cache-control': 'no-cache',
          'x-content-type-options': 'nosniff',
          // 页面完全自包含：脚本/样式内联，只允许自己这一个同源读数接口
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
        })
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        const stream = createReadStream(full)
        stream.on('error', () => {
          try { res.destroy() } catch { /* 已经断了 */ }
        })
        stream.pipe(res)
      },
    }), 'dim-womb: assets')
  })
}
