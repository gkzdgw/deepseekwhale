import {exportCode,importCode} from './archive.js'
import {origin,completeNursery,idleGrowth,waitingForRice,mealProgress} from './idle.js'
import {extraDays} from './drop-home.js'
import {birthRoute,ensureTrait,routeIndex,routeName,residentPortrait} from './growth-paths.js'
import {mountAcademy, grade, upgradeEconomy, defaultPrices, validPrice} from './academy.js'
import {defaultGestationMinutes,validGestationMinutes} from './gestation.js'
// Shared by the standalone dashboard and its DSH overview.
const overviewRoots = new WeakSet()

const settingsUrl = '/__dim-womb/api/settings'
export async function loadReserveSettings(signal) {
  try {
    const result = await fetch(settingsUrl, {signal, cache:'no-store'})
    if (result.ok) return await result.json()
  } catch { /* Existing browser settings remain available when offline. */ }
  return null
}

export function embedDashboard(host, html, signal, navigation, reserve) {
  const page = new DOMParser().parseFromString(html, 'text/html')
  const style = page.querySelector('head style')
  const app = page.querySelector('.app')
  const tip = page.getElementById('tip')
  if (!style || !app?.querySelector('#overview-chat slot') || !tip) throw new Error('总览模板不完整')
  if (host.shadowRoot && !overviewRoots.has(host.shadowRoot)) throw new Error('主区域已由其他界面组件接管')
  const root = host.shadowRoot || host.attachShadow({mode:'open'})
  overviewRoots.add(root)
  const dashboard = document.createElement('div')
  dashboard.className = 'whale-dashboard archive-mode'
  dashboard.append(document.importNode(app, true), document.importNode(tip, true))
  // A neutral slot restores the shell's original content on unload or failure.
  signal.addEventListener('abort', () => root.replaceChildren(document.createElement('slot')), {once:true})
  root.replaceChildren(document.importNode(style, true), dashboard)
  const chat = root.querySelector('.chat-surface')
  const slot = chat.querySelector('slot')
  const openView = mountDashboard(root, {signal, reserve, family:true, navigate:navigation.navigate, startRoleplay:navigation.startRoleplay})
  const workspace = root.getElementById('workspaces-button')
  const closeWorkspace = attachWorkspaceMenu(host, workspace, root, signal, navigation)
  root.getElementById('session-new').addEventListener('click', () => {
    closeWorkspace()
    navigation.newSession()
  })
  root.getElementById('automation-button').hidden = !navigation.hasSchedules()
  return {
    show(view) {
      const target = view === 'automation' ? root.getElementById('view-automation') : chat
      if (slot.parentElement !== target) target.append(slot)
      openView(view)
      closeWorkspace()
    }
  }
}

function attachWorkspaceMenu(host, button, root, signal, navigation) {
  const shell = host.parentElement.parentElement
  const sidebar = shell.querySelector('[data-slot="sidebar"]')?.parentElement
  if (!sidebar) { button.hidden = true; return () => {} }
  const css = document.createElement('style')
  css.textContent = `
    [data-whale-shell] > :has(> [data-slot="main"]){grid-column:1 / 3;grid-row:1}
    [data-whale-shell] [data-slot="main.conversation"] [data-conversation-content]{--dsh-chat-content-width:var(--dsh-chat-user-width,clamp(220px,calc(var(--dsh-conversation-column-width,800px) - 80px),1440px))}
    [data-whale-shell] > [data-side="sidebar"]{display:none}
    [data-whale-drawer]{display:none}
    [data-whale-drawer="open"]{display:block;position:fixed;z-index:15;top:var(--whale-menu-top);left:var(--whale-menu-left);width:min(330px,calc(100vw - 20px));height:min(570px,calc(100dvh - var(--whale-menu-top) - 10px));border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 14px 48px #08081960;overflow:hidden}
  `
  document.head.append(css)
  shell.dataset.whaleShell = ''
  sidebar.dataset.whaleDrawer = 'closed'
  let expandedByMenu = false
  function close(restoreFocus = false) {
    if (sidebar.dataset.whaleDrawer !== 'open') return
    sidebar.dataset.whaleDrawer = 'closed'
    button.setAttribute('aria-expanded','false')
    if (expandedByMenu && !shell.hasAttribute('data-sidebar-collapsed')) navigation.toggleSidebar()
    expandedByMenu = false
    if (restoreFocus) button.focus({preventScroll:true})
  }
  function position() {
    const rect = button.getBoundingClientRect()
    sidebar.style.setProperty('--whale-menu-top', (rect.bottom + 6) + 'px')
    sidebar.style.setProperty('--whale-menu-left', Math.max(10, Math.min(rect.left, innerWidth - 340)) + 'px')
  }
  button.addEventListener('click', () => {
    if (sidebar.dataset.whaleDrawer === 'open') return close(true)
    position()
    expandedByMenu = shell.hasAttribute('data-sidebar-collapsed')
    if (expandedByMenu) navigation.toggleSidebar()
    sidebar.dataset.whaleDrawer = 'open'
    button.setAttribute('aria-expanded','true')
    requestAnimationFrame(() => {
      if (sidebar.dataset.whaleDrawer === 'open') sidebar.querySelector('[role="treeitem"],button')?.focus({preventScroll:true})
    })
  }, {signal})
  window.addEventListener('resize', position, {signal})
  root.addEventListener('pointerdown', e => { if (!e.composedPath().includes(button)) close() }, {signal})
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"],[role="menu"]')) close(true)
  }, {signal})
  sidebar.addEventListener('click', e => {
    if (e.target.closest('[data-row-key^="session:"]') && !e.target.closest('[aria-haspopup]')) close()
  }, {signal})
  signal.addEventListener('abort', () => {
    close()
    delete shell.dataset.whaleShell
    delete sidebar.dataset.whaleDrawer
    sidebar.style.removeProperty('--whale-menu-top')
    sidebar.style.removeProperty('--whale-menu-left')
    css.remove()
  }, {once:true})
  return close
}

export function mountDashboard(root, {signal, reserve, family = true, navigate, startRoleplay} = {}) {

  var KEY = 'dsh-dim-womb.state.v2'
  var OLD_KEY = 'dsh-dim-womb.state.v1'
  var HOUR = 3600 * 1000
  var MIN = 60 * 1000

  var stageNames = ['小鲸鱼','Q 版小人','少女','少女','成女']
  var minDays = [2,2,3,3]
  var defaultGrowth = [20,40,70,100].map(days => ({days}))
  function validGrowth(rules) {
    return Array.isArray(rules) && rules.length === 4 && rules.every((rule,i) => {
      var duration = rule?.days - (i ? rules[i-1].days : 0)
      return Number.isInteger(duration) && duration >= minDays[i] && duration <= 3650
    })
  }

  var PER_REQUEST = 0.8          // 每次请求涨多少格
  var DAY_MS = 24 * HOUR
  var DESIRE_TAU = 10 * MIN      // 欲望往目标值靠的时间常数

  var DEFAULTS = {
    name: '本地档案',
    growth: defaultGrowth, idleMode:true, showPreferences:false, idleSince:0, cycleVersion:0,
    capacity: 200,
    hatchAt: null,
    gestationMinutes: defaultGestationMinutes,
    rate: 4,
    sensitivity: 1,
    bound: true,
    storage: 51.9,
    bondPeak: 0,
    lastBondedAt: 0,
    desire: -1,        // -1 = 还没落位，第一次渲染时按公式算出一个起点
    lastSatisfiedAt: Date.now(),
    lastActivityAt: 0,
    seenAt: 0,
    mood: 'quiet',
    outfit: 'casual',
    outfitMode: 'mood',
    outfitMood: '',
    feed: 0,
    tokenPool: 0,
    schoolBag: [],
    prices:defaultPrices,
    hourglassDays:1,
    historyGrant: null,
    economyVersion:0,
    lastTokens: null,
    meterCursor: null,
    meterAwaitingBaseline: false,
    archiveId: null,
    firstMealGranted: false,
    riceFed: 0,
    riceStock: 0,
    births: 0,
    whales: [],
    incubating: null,
    lastPregnancy: null,
    events: [],
    updatedAt: Date.now()
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)) }
  function pad(n) { return n < 10 ? '0' + n : String(n) }

  function load(fromSharedArchive=false, replacement=null) {
    var rawV2 = null
    var rawV1 = null
    try {
      rawV2 = localStorage.getItem(KEY)
      rawV1 = rawV2 ? null : localStorage.getItem(OLD_KEY)
    } catch (e) { rawV2 = null; rawV1 = null }
    var parsed = {}
    var raw = rawV2 || rawV1
    if (raw) { try { parsed = JSON.parse(raw) || {} } catch (e) { parsed = {} } }
    if(replacement){parsed=replacement;rawV2=true}
    var out = {}
    for (var k in DEFAULTS) out[k] = parsed[k] === undefined ? structuredClone(DEFAULTS[k]) : parsed[k]
    if (out.growth?.length === 3 && out.growth.some((r,i) => r?.days !== [3,14,35][i])) {
      const old = out.growth
      const last = Math.max(6, old[2].days-old[1].days)
      const durations=[old[0].days,old[1].days-old[0].days,Math.floor(last/2),Math.ceil(last/2)]
      let age=0
      out.growth=durations.map((d,i)=>({days:age+=Math.max(minDays[i],d)}))
    }
    if (!Number.isInteger(out.hourglassDays) || out.hourglassDays<1 || out.hourglassDays>3650) out.hourglassDays=1
    if(Array.isArray(out.prices) && [8,10,83,92].includes(out.prices.length))out.prices=out.prices.concat(defaultPrices.slice(out.prices.length))
    if (!Array.isArray(out.prices) || out.prices.length!==defaultPrices.length || !out.prices.every(validPrice)) out.prices=defaultPrices.slice()
    if (!Array.isArray(out.schoolBag)) out.schoolBag=[]
    if(!out.cycleVersion && JSON.stringify(out.growth?.map(r=>r?.days))==='[200,400,700,1000]')out.growth=defaultGrowth
    out.cycleVersion=1
    if (!validGrowth(out.growth)) out.growth = defaultGrowth
    if (!Array.isArray(out.events)) out.events = []
    for (const event of out.events) {
      if(event?.tag==='诞生' && typeof event.text==='string')event.text=event.text.replace(/（(?:安静|好奇|黏人|贪吃|爱睡|爱闹|怕生|慢热|爱干净)）$/,'')
      if (event?.tag === '孵化' && typeof event.text === 'string' && event.text.startsWith('鲸卵开始孵化 · ')) {
        event.tag = '孕育'
        event.text = event.text.replace('鲸卵开始孵化', '母鲸开始孕育幼鲸')
      }
    }
    if (typeof out.name !== 'string' || !out.name) out.name = DEFAULTS.name
    out.capacity = clamp(Number(out.capacity) || 200, 10, 9999)
    if (reserve && !fromSharedArchive) Object.assign(out, {capacity:reserve.capacity, hatchAt:reserve.hatchAt})
    if (!fromSharedArchive && validGestationMinutes(reserve?.gestationMinutes)) out.gestationMinutes=reserve.gestationMinutes
    if (!validGestationMinutes(out.gestationMinutes)) out.gestationMinutes=defaultGestationMinutes
    if (!(out.hatchAt >= 1 && out.hatchAt <= out.capacity)) out.hatchAt = Math.round(out.capacity * 9) / 10
    out.rate = clamp(Number(out.rate), 0, 240); if (!isFinite(out.rate)) out.rate = 0
    out.sensitivity = clamp(Number(out.sensitivity) || 1, 0.1, 5)
    out.storage = Number.isFinite(Number(out.storage)) ? Math.max(0, Number(out.storage)) : 0
    out.desire = clamp(Number(out.desire) || 0, 0, 100)
    // 老档案（v1 / 旧算法）里的欲望值是死值 100，搬过来只会一路往下掉，
    // 所以标记成 -1：第一次渲染时按新公式直接落位。
    if (!rawV2 || parsed.desire === undefined) out.desire = -1
    out.updatedAt = Number(out.updatedAt) || Date.now()
    out.feed = clamp(Number(out.feed) || 0, 0, 99999)
    out.tokenPool = clamp(Number(out.tokenPool) || 0, 0, Number.MAX_SAFE_INTEGER)
    upgradeEconomy(out)
    out.lastTokens = out.lastTokens == null || (!Object.prototype.hasOwnProperty.call(parsed, 'firstMealGranted') && !out.lastTokens) ? null : clamp(Number(out.lastTokens) || 0, 0, Number.MAX_SAFE_INTEGER)
    out.riceFed = clamp(Number(out.riceFed) || 0, 0, 1e9)
    out.riceStock = clamp(Number(out.riceStock) || 0, 0, 9999)
    out.whales = Array.isArray(out.whales) ? out.whales.filter(function (w) { return w && typeof w === 'object' }) : []
    out.births = Math.max(out.whales.length, Number.isSafeInteger(out.births) ? out.births : 0)
    if (!Number.isFinite(parsed.bondPeak)) {
      // Older archives recorded the latest interaction warmth, but no historical maximum.
      var oldBase = 0.8 * out.births / (out.births + 8)
      var oldWarmth = clamp(Number(parsed.closeness) || 0, 0, 1)
      out.bondPeak = Math.round(100 * (oldBase + (1 - oldBase) * oldWarmth))
      out.lastBondedAt = Date.now()
    }
    out.bondPeak = clamp(Math.round(out.bondPeak), 0, 100)
    if (!(Number.isFinite(out.lastBondedAt) && out.lastBondedAt > 0)) out.lastBondedAt = Date.now()
    if (!out.firstMealGranted && out.whales.length) {
      if (!out.riceStock) out.riceStock = 1
      out.firstMealGranted = true
    }
    for (var wi = 0; wi < out.whales.length; wi++) {
      var wh = out.whales[wi]
      if (typeof wh.satiety !== 'number') wh.satiety = 40
      wh.meals = Math.max(0, Math.floor(Number(wh.meals) || 0))
      wh.form = Object.prototype.hasOwnProperty.call(adultNames, wh.form) ? wh.form : null
      wh.bornAt = Number(wh.bornAt) > 0 ? Number(wh.bornAt) : out.updatedAt
      // v2 的 girlAt 代表已进入少女期。迁移后保留该阶段与累计饭量。
      ensureTrait(wh);birthRoute(wh)
      if(wh.form && !wh.departedAt)wh.departedAt=wh.milestones?.[4]||Date.now()
      wh.stage = wh.form ? 4 : Math.max(wh.girlAt > 0 ? 2 : 0, clamp(Math.floor(Number(wh.stage) || 0), 0, 3))
    }
    for(const graduate of out.whales) if(graduate.diploma && graduate.adultRoute==null) graduate.adultRoute=routeIndex(graduate)
    if (['maid', 'school', 'lolita', 'casual'].indexOf(out.outfit) < 0) out.outfit = 'casual'
    if (['mood', 'maid', 'school', 'lolita', 'casual'].indexOf(out.outfitMode) < 0) out.outfitMode = 'mood'
    if (out.incubating) {
      if (!Number.isFinite(out.incubating.startedAt) || out.incubating.startedAt <= 0) out.incubating = null
      else if (!(out.incubating.durationMs > 0 && Number.isFinite(out.incubating.durationMs))) {
        out.incubating.durationMs = 3 * MIN // Already started under the three-minute rule.
      }
    }
    out.bound = out.bound !== false
    return out
  }

  var adultNames = { casual:'日常装', school:'校服', lolita:'洛丽塔', maid:'女仆装', classic:'经典女仆装', flash:'Flash 女仆装' }
  var state = load()
  var savedSnapshot
  var activity = { connected: false, source: 'none', lastAt: 0, requests1h: 0, requests24h: 0, tokens24h: 0, activeMinutesToday: 0 }
  var seenAt = Number(state.seenAt) || 0
  var mood = state.mood || 'quiet'
  var hitTimer = 0
  var activityKnown = false

  function save() {
    state.seenAt = seenAt
    state.mood = mood
    try { const snapshot = JSON.stringify(state); localStorage.setItem(KEY, snapshot); savedSnapshot = snapshot } catch (e) { /* 隐私模式 */ }
  }

  function pushEvent(text, tag) {
    state.events.unshift({ at: Date.now(), text: text, tag: tag || '' })
    if (state.events.length > 40) state.events.length = 40
  }

  /* ---------------------------------------------------------- 时间推进 */
  function addStorage(amount, allowOverflow) {
    var room = Math.max(0, state.capacity - state.storage)
    state.storage += allowOverflow ? amount : Math.min(amount, room)
  }

  function inPregnancy(period, timestamp) {
    return period && timestamp >= period.startedAt && timestamp < period.startedAt + period.durationMs
  }

  function advance(dtMs) {
    if (dtMs <= 0) return
    if (state.rate > 0) {
      var before = state.storage
      var now = Date.now()
      var start = now - dtMs
      var term = state.incubating
      if (term) {
        var beforeTerm = clamp(term.startedAt - start, 0, dtMs)
        var duringTerm = Math.max(0, Math.min(now, term.startedAt + term.durationMs) - Math.max(start, term.startedAt))
        addStorage(state.rate * beforeTerm / HOUR, false)
        addStorage(state.rate * duringTerm / HOUR, true)
        addStorage(state.rate * Math.max(0, dtMs - beforeTerm - duringTerm) / HOUR, false)
      } else {
        addStorage(state.rate * dtMs / HOUR, false)
      }
      var crossed = Math.floor(state.storage) - Math.floor(before)
      if (crossed > 0 && state.events.length < 40) {
        // 自然吸收只在跨整格时记一笔，且不刷屏
        var last = state.events[0]
        if (!last || Date.now() - last.at > 20 * MIN || !/吸收 \+/.test(last.text)) {
          pushEvent('自然吸收 +' + crossed + ' 格', '')
        }
      }
    }
    state.updatedAt = Date.now()
  }

  /* ------------------------------------------------------ 活动 → 状态 */
  function lastTouchAt() {
    // 有真实活动来源时，以它为准；否则退回本机记的时间点
    if (activity.connected && activity.lastAt) {
      return Math.max(state.lastActivityAt || 0, activity.lastAt)
    }
    return Math.max(state.lastActivityAt || 0, state.lastSatisfiedAt || 0)
  }

  function idleMs() {
    return Math.max(0, Date.now() - lastTouchAt())
  }

  function creditUsage(meter){
    if(!meter?.days || !meter.baseline?.days)return
    const opening=state.meterAwaitingBaseline ? {since:meter.today,days:{[meter.today]:meter.days[meter.today]||0}} : meter.baseline
    const cursor=state.meterCursor || {since:opening.since,days:{...opening.days}}
    state.meterAwaitingBaseline=false
    let changed=!state.meterCursor,gain=0
    for(const [day,total] of Object.entries(meter.days)){
      if(day<cursor.since || day>meter.today || !Number.isSafeInteger(total) || total<0)continue
      const paid=cursor.days[day]||0
      if(total<=paid)continue
      gain+=total-paid
      cursor.days[day]=total
      changed=true
    }
    if(changed){
      state.meterCursor=cursor
      if(state.bound)state.tokenPool=clamp(state.tokenPool+gain,0,Number.MAX_SAFE_INTEGER)
      save()
    }
  }

  function applyActivity(data) {
    readSharedChanges()
    var previous = activity
    activity = data
    activityKnown = true
    creditUsage(data?.meter)
    if (!data || !data.connected) { render(); return }
    if (!state.bound) { render(); return }

    if (!state.meterCursor && data.source === 'token-monitor' && Number.isFinite(data.tokens24h)) {
      var total = Math.max(0, data.tokens24h)
      if (total !== state.lastTokens) {
        if (state.lastTokens !== null) state.tokenPool = clamp(state.tokenPool + Math.max(0, total - state.lastTokens), 0, Number.MAX_SAFE_INTEGER)
        state.lastTokens = total
        save()
      }
    }

    if (previous.connected && previous.source === data.source && data.tokens24h > previous.tokens24h) {
      var art = $('art')
      art.classList.remove('hit')
      art.getBoundingClientRect()
      art.classList.add('hit')
      clearTimeout(hitTimer)
      hitTimer = setTimeout(function () { art.classList.remove('hit') }, 1000)
    }
    var now = Date.now()
    if (seenAt === 0) {
      // 第一次接上：以当前为基线，不把历史一次性倒进来；
      // 但如果刚刚还在用，就先把亲密度垫一点，别让它是 0。
      seenAt = data.lastAt || now
      var recent = data.lastAt ? now - data.lastAt : Infinity
      if (recent < 10 * MIN) {
        if (state.bondPeak === 0) growBond(1, data.lastAt)
        state.lastActivityAt = data.lastAt
        state.lastSatisfiedAt = data.lastAt
      }
      save()
      render()
      return
    }

    var fresh = (data.recent || []).filter(function (t) { return t > seenAt && now - t < 6 * HOUR })
    if (fresh.length === 0) {
      if (data.lastAt > seenAt) {
        if (data.source === 'sessions') growBond(1, data.lastAt)
        seenAt = data.lastAt
        save()
      }
      render()
      return
    }

    seenAt = Math.max(seenAt, data.lastAt)
    var n = Math.min(fresh.length, 40)
    var gain = n * PER_REQUEST * state.sensitivity
    var unit = PER_REQUEST * state.sensitivity
    for (var timestamp of fresh.slice(0, n)) {
      addStorage(unit, inPregnancy(state.incubating, timestamp) || inPregnancy(state.lastPregnancy, timestamp))
    }
    growBond(n, data.lastAt)
    // 每次靠近都攒饲料；储存已经满了就翻倍，算是溢出补偿
    var wasFull = state.storage >= state.capacity - 1e-6
    state.feed = clamp(state.feed + n * (wasFull ? 2 : 1) * FEED_PER_REQUEST, 0, 99999)

    // 被满足只会松一口气，不会把欲望归零（归零会让它看着像在倒退）
    state.desire = clamp(state.desire - Math.min(8, n * 1.2), 0, 100)
    state.lastActivityAt = now
    state.lastSatisfiedAt = now
    pushEvent('你来了 · ' + n + ' 次靠近 · +' + gain.toFixed(1) + ' 格', '靠近')
    save()
    render()
  }

  /* ------------------------------------------------------------ 心情 */
  var MOODS = {
    clingy: { word: '黏着', line: '你刚来过，核心还没缓下来。' },
    calm: { word: '安定', line: '热度还留着，慢慢做你的就好。' },
    waiting: { word: '等待', line: '灯亮着，偶尔看一眼门口。' },
    lonely: { word: '寂寞', line: '安静得有点久了，只有吸收还在自己转。' },
    cold: { word: '冷清', line: '很久没有动静，它把功耗降到最低。' },
    quiet: { word: '离线', line: '还没接上活动来源，先按时间自己走。' }
  }

  function moodFor(idle, close) {
    if (!activity.connected) return 'quiet'
    var m = idle / MIN
    if (m < 3) return close > 0.35 ? 'clingy' : 'calm'
    if (m < 45) return 'calm'
    if (m < 240) return 'waiting'
    if (m < 720) return 'lonely'
    return 'cold'
  }

  /* ------------------------------------------------------------ 渲染 */
  function $(id) { return root.getElementById(id) }

  function hhmm(ms) {
    var total = Math.max(0, Math.floor(ms / 1000))
    var h = Math.floor(total / 3600)
    var m = Math.floor((total % 3600) / 60)
    var s = total % 60
    return h > 0 ? h + ':' + pad(m) : pad(m) + ':' + pad(s)
  }

  function ago(ms) {
    if (ms < MIN) return '刚刚'
    if (ms < HOUR) return Math.floor(ms / MIN) + ' 分钟前'
    if (ms < 24 * HOUR) return Math.floor(ms / HOUR) + ' 小时前'
    return Math.floor(ms / (24 * HOUR)) + ' 天前'
  }

  function clock(ts) {
    var d = new Date(ts)
    return pad(d.getHours()) + ':' + pad(d.getMinutes())
  }

  function zoneIndex(ratio) {
    if (ratio < 0.25) return 0
    if (ratio < 0.55) return 1
    if (ratio < 0.85) return 2
    return 3
  }

  function growBond(points, at) {
    state.bondPeak = Math.min(100, state.bondPeak + points)
    state.lastBondedAt = Math.max(state.lastBondedAt, at)
  }

  function affection() {
    var quietDays = Math.max(0, (Date.now() - state.lastBondedAt) / DAY_MS - 3)
    return state.bondPeak / 100 * (1 - Math.min(10, quietDays) / 100)
  }

  function bondPercent() { return Math.ceil(affection() * 100 - 1e-9) }

  function marriageStage() {
    var peak = state.bondPeak
    if (peak < 20) return ['新婚相知', '两人还在摸索彼此的小习惯。喜欢就轻声问一句，偶尔有点害羞。']
    if (peak < 40) return ['渐生默契', '记得我的习惯，可以拿两人之间的小事开个温柔的玩笑。']
    if (peak < 60) return ['心有灵犀', '熟悉到一个眼神就能会意，偶尔主动说想我、想挨着我坐。']
    if (peak < 80) return ['相依相伴', '相处自在，愿意主动表达爱意，也知道什么时候安静陪伴。']
    return ['岁月同心', '像相伴多年的爱人，用两个人懂的玩笑或平常的一句话，亲昵地表达牵挂。']
  }

  function roleplayOpening() {
    if (family) return '我们在次元之家一起照顾小鲸鱼。请扮演温柔的水族馆管理员，和我聊聊鲸鱼们今天的生活和学习。'
    var [stage, style] = marriageStage()
    return '想和你演一段水族馆闭馆后的日常。你是成年的鲸鱼妈妈，我是你的成年伴侣。'
      + '我们一起迎接过 ' + state.births + ' 只小鲸鱼，此刻亲密度 ' + bondPercent() + '%。'
      + '我们的夫妻关系是「' + stage + '」。' + style + '像自然聊天一样，只在合适的时候带一点暧昧，不用念数值。'
      + '我换到正事或说结束时，就恢复普通助手的语气。今晚我替你留了盏灯，你想坐我旁边吗？'
  }

  if (startRoleplay) $('roleplay-start').addEventListener('click', () => startRoleplay(roleplayOpening()))

  function render() {
    var growthEvent = '', growthNow = Date.now()
    for (var resident of state.whales) growthEvent = updateStage(resident, growthNow) || growthEvent
    if (growthEvent) {
      $('meal-feedback').textContent = growthEvent
      save()
    }
    var bond = affection()
    var idle = idleMs()
    var next = moodFor(idle, bond)
    if (next !== mood && next !== 'quiet') {
      if (next === 'lonely' || next === 'cold') pushEvent('安静了很久 · 转入' + MOODS[next].word, '等待')
      if (next === 'clingy') pushEvent('热度回满 · ' + MOODS[next].word, '')
      mood = next
      save()
    }
    var text = MOODS[mood] || MOODS.quiet

    var ratio = state.capacity > 0 ? state.storage / state.capacity : 0
    var pct = Math.round(ratio * 100)

    // 热度：储存打底，亲密加成，再抖一点
    var heat = clamp(0.38 + ratio * 0.26 + bond * 0.30 + Math.sin(Date.now() / 60000) * 0.015, 0, 1)

    // 欲望：储存越满越胀，空窗越久越想要；刚来过只回落一点，不会跌到 0
    var idleH = idle / HOUR
    var idleFactor = 1 - Math.exp(-idleH / 1.5)    // 1 小时约涨一半，6 小时基本拉满
    var target = clamp(8 + ratio * 40 + idleFactor * 52, 0, 100)
    // 第一次渲染时还没有活动读数，先别拿占位时间点落位；等第一份读数到了再定起点
    if (state.desire < 0 && activityKnown) state.desire = target
    if (state.desire >= 0) {
      // 涨得快、落得慢：看着才是"越久越高"，而不是被时长拖着往下走
      var tau = target > state.desire ? 2 * MIN : 12 * MIN
      state.desire = clamp(state.desire + (target - state.desire) * (1 - Math.exp(-1000 / tau)), 0, 100)
    }
    var shownDesire = state.desire >= 0 ? state.desire : target

    var crave = clamp(Math.round(idleH * 0.6), 0, 20)

    // 顶部那句话
    var line = $('mood-line')
    line.textContent = text.line
    line.setAttribute('data-mood', mood)
    $('user-name').textContent = state.name
    $('user-sub').textContent = state.bound
      ? (activity.connected ? '跟随 DSH 用量 · 只读' : '等待活动来源 · 只读')
      : '仅按时间累积 · 只读'

    // 中间四格
    var art = $('art')
    art.setAttribute('data-mood', mood)
    var hasTokens = state.bound && activity.connected && activity.source === 'token-monitor'
    var tokenCount = hasTokens ? Math.max(0, Number(activity.tokens24h) || 0) : 0
    // 对数刻度让小会话和大量使用时的变化都看得见。
    var signal = Math.min(1, Math.log1p(tokenCount) / Math.log1p(1000000))
    art.style.setProperty('--signal-strength', (0.28 + 0.72 * signal).toFixed(2))
    art.style.setProperty('--signal-period', (7 - 5 * signal).toFixed(2) + 's')
    const water = $('heart-water')
    const coreCapacity = 200
    const coreRatio = clamp(state.storage / coreCapacity, 0, 1)
    const corePercent = Math.floor(coreRatio * 1000) / 10
    if (water) {
      // Keep a small visible meniscus inside the two lobes at full capacity.
      water.style.transform = 'translateY(' + (890 - 710 * coreRatio).toFixed(2) + 'px)'
      $('heart-shade').setAttribute('opacity', (0.60 - 0.44 * coreRatio).toFixed(3))
    } else $('projection-fluid')?.setAttribute('y', (253 - 142 * clamp(ratio, 0, 1)).toFixed(2))
    var usage = hasTokens ? '近 24h 输出 · ' + fmtToken(tokenCount) : state.bound ? '等待 token 读数' : '用量联动已关闭'
    $('projection-tokens').textContent = usage
    art.setAttribute('aria-label', (water ? '爱心投影，核心水位 ' + corePercent : '子宫正面投影，储存 ' + pct) + '%，' + usage)
    $('mod-link').textContent = activity.connected
      ? (activity.source === 'token-monitor' ? '已接入 · 请求记录' : '已接入 · 会话文件')
      : '未接入'
    $('mod-core').textContent = '亲密 ' + bondPercent() + '%'
    $('mod-store').textContent = water ? corePercent + '% · 满格 200' : pct + '%'
    $('mod-shape').textContent = text.word
    $('mod-link-box').classList.toggle('live', activity.connected)
    $('mod-core-box').classList.toggle('live', bond > 0.2)
    $('mod-store-box').classList.toggle('live', water ? coreRatio > 0 : pct > 0)
    $('mod-shape-box').classList.toggle('live', mood === 'clingy')

    // 参数
    $('p-elapsed').textContent = hhmm(idle)
    $('p-elapsed-src').textContent = activity.connected ? '最近一次靠近' : '来源：本地档案'
    $('p-rate').textContent = String(state.rate)
    $('p-heat').textContent = String(Math.round(heat * 100))
    var frac = state.storage - Math.floor(state.storage)
    $('p-hold').textContent = state.rate > 0 ? hhmm(((1 - frac) / state.rate) * HOUR) : '—'

    // 储存
    $('store-n').textContent = state.storage.toFixed(1)
    $('hatch-gate').textContent = state.hatchAt + ' 格可孕育'
    $('store-bar').parentElement.style.setProperty('--hatch-mark', (100 * state.hatchAt / state.capacity) + '%')
    $('store-cap').textContent = String(state.capacity)
    $('store-pct').textContent = pct + '%'
    $('store-bar').style.width = Math.min(100, ratio * 100) + '%'
    $('zone-name').textContent = state.storage > state.capacity ? '超额储存 +' + (state.storage - state.capacity).toFixed(1) + ' 格' : ['初始区','稳定区','满足区','临界区'][zoneIndex(ratio)]

    // 核心 / 亲密
    $('close-n').textContent = String(bondPercent())
    $('close-bar').style.width = bondPercent() + '%'
    $('link-state').textContent = activity.connected ? '已接入' : '离线'
    $('link-state').classList.toggle('on', activity.connected)
    $('link-empty').classList.toggle('hidden', activity.connected)
    $('kv-last').textContent = activity.connected && activity.lastAt ? ago(Date.now() - activity.lastAt) : '—'
    $('kv-1h').textContent = (activity.requests1h || 0) + ' 次'
    $('kv-24h').textContent = (activity.requests24h || 0) + ' 次'
    $('kv-min').textContent = (activity.activeMinutesToday || 0) + ' 分钟'
    $('kv-tok').textContent = fmtToken(activity.tokens24h || 0)

    // 欲望
    $('desire-n').textContent = String(Math.round(shownDesire))
    $('desire-pct').textContent = Math.round(shownDesire) + '%'
    $('desire-bar').style.width = shownDesire + '%'
    $('crave').textContent = String(crave)

    academy.render()
    renderEvents()
    renderHatch()
    renderAquarium()
    renderMother(Math.round(shownDesire))
  }

  function fmtToken(n) {
    if (!n) return '0 token'
    if (n < 1000) return n + ' token'
    if (n < 1e6) return (n / 1000).toFixed(1) + 'k token'
    return (n / 1e6).toFixed(2) + 'M token'
  }

  function eventRow(ev) {
    var li = document.createElement('li')
    var t = document.createElement('time')
    t.textContent = clock(ev.at)
    var d = document.createElement('span')
    d.className = 'd'
    var s = document.createElement('span')
    s.textContent = ev.text
    li.appendChild(t); li.appendChild(d); li.appendChild(s)
    if (ev.tag) {
      var tag = document.createElement('span')
      tag.className = 'tag'
      tag.textContent = ev.tag
      li.appendChild(tag)
    }
    return li
  }

  var lastEvents = null, lastEventCount = -1
  function renderEvents() {
    if (lastEventCount === state.events.length && lastEvents === state.events[0]) return
    lastEvents = state.events[0]
    lastEventCount = state.events.length
    $('latest-event').textContent = lastEvents ? clock(lastEvents.at) + ' · ' + lastEvents.text : '暂无事件'
    var recent = $('recent-list')
    var all = $('ev-list')
    recent.innerHTML = ''
    all.innerHTML = ''
    var head = state.events.slice(0, 3)
    for (var i = 0; i < head.length; i++) recent.appendChild(eventRow(head[i]))
    if (head.length === 0) {
      var empty = document.createElement('li')
      empty.textContent = '还没有事件。'
      empty.style.color = 'rgba(150,140,180,.75)'
      recent.appendChild(empty)
    }
    for (var j = 0; j < state.events.length; j++) all.appendChild(eventRow(state.events[j]))
    $('ev-count').textContent = state.events.length + ' 条'

  }

  /* ------------------------------------------------------------ 交互 */
  var nav = $('nav')
  var layout = root.querySelector('.layout')
  var zoom = null
  function openView(view) {

    if (zoom) { zoom.cancel(); zoom = null }
    setScan(false)
    for (var tab of nav.querySelectorAll('button[data-view]')) {
      var selected = tab.dataset.view === view
      tab.classList.toggle('on', selected)
      if (selected) tab.setAttribute('aria-current','page'); else tab.removeAttribute('aria-current')
    }
    for (var pane of layout.querySelectorAll('main.stage')) pane.classList.toggle('hidden', pane.id !== 'view-' + view)
    $('view-scroll').scrollTop = 0
    hideTip()
    layout.dataset.active = view
    if (view === 'academy') academy.render()
    if (view === 'prices') academy.fillPrices()
    if (view === 'settings') fillForm()
    if (view === 'aquarium') {
      initBubbles()
      renderAquarium()
      startScene()
    } else {
      stopScene()
    }
  }
  nav.addEventListener('click', function (event) {
    var tab = event.target.closest('button[data-view]')
    if (tab) {
      if (navigate) navigate(tab.dataset.view)
      openView(tab.dataset.view)
    }
  })
  function setScan(active) {
    var sheet = $('scan-sheet')
    if (active && !sheet.open) {
      if (tipEl) { hideTip(); sheet.append(tipEl) }
      sheet.showModal()
    }
    if (!active && sheet.open) sheet.close()
    $('mother-open').setAttribute('aria-expanded', String(active))
  }
  $('all-events').addEventListener('click', function () { openView('events') })
  $('to-aquarium').addEventListener('click', function () { openView('aquarium') })
  $('mother-back').addEventListener('click', function () { setScan(false); $('mother-open').focus({preventScroll:true}) })
  $('scan-sheet').addEventListener('close', function () {
    $('mother-open').setAttribute('aria-expanded', 'false')
    hideTip()
    if (tipEl) (root.querySelector('.whale-dashboard') || document.body).append(tipEl)
  })
  $('mother-open').setAttribute('aria-haspopup', 'dialog')
  $('mother-open').setAttribute('aria-controls', 'scan-sheet')
  $('mother-open').setAttribute('aria-expanded', 'false')
  $('mother-open').addEventListener('click', function () {
    if (zoom) return
    function enter() { setScan(true); if (zoom) zoom.cancel(); zoom = null; $('mother-back').focus({preventScroll:true}) }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !$('mother-image').animate) { enter(); return }
    zoom = $('mother-image').animate([{transform:'scale(1)',opacity:1},{transform:'scale(2.8)',opacity:0}],{duration:300,easing:'ease-in',fill:'forwards'})
    zoom.onfinish = enter
  })

  function fillForm() {
    state.growth.forEach(function (r, i) {
      $('growth-days-' + i).value = r.days - (i ? state.growth[i-1].days : 0)
    })
    $('growth-message').textContent = ''
    $('cfg-preferences').checked=state.showPreferences
    $('cfg-idle').checked=state.idleMode
    $('cfg-name').value = state.name
    $('cfg-cap').value = String(state.capacity)
    $('cfg-hatch').value = String(state.hatchAt)
    $('cfg-gestation-hours').value = Math.floor(state.gestationMinutes/60)
    $('cfg-gestation-minutes').value = state.gestationMinutes%60
    $('cfg-rate').value = String(state.rate)
    $('cfg-bind').checked = state.bound
    $('cfg-sens').value = String(state.sensitivity)
  }

  $('cfg-save').addEventListener('click', async function () {
    var capacity = $('cfg-cap').valueAsNumber, hatchAt = $('cfg-hatch').valueAsNumber
    var message = $('growth-message')
    if (!Number.isInteger(capacity) || capacity < 10 || capacity > 9999) {
      message.textContent = '储存上限请填 10 至 9999 的整数。'
      $('cfg-cap').focus()
      return
    }
    if (!Number.isFinite(hatchAt) || hatchAt < 1 || hatchAt > capacity || !Number.isInteger(hatchAt * 10)) {
      message.textContent = '孕育门槛须在 1 格和储存上限之间，最多保留一位小数。'
      $('cfg-hatch').focus()
      return
    }
    const hours=$('cfg-gestation-hours'), minutes=$('cfg-gestation-minutes')
    const gestationMinutes=hours.valueAsNumber*60+minutes.valueAsNumber
    if (!hours.validity.valid || !minutes.validity.valid || !validGestationMinutes(gestationMinutes)) {
      message.textContent='孕育时长须为 1 分钟至 365 天。小时和分钟请填整数，分钟为 0–59。'
      ;(!minutes.validity.valid ? minutes : hours).focus()
      return
    }
    var totalDays = 0
    var rules = state.growth.map(function (_, i) {
      return {days:totalDays += $('growth-days-' + i).valueAsNumber}
    })
    if (!validGrowth(rules)) {
      $('growth-message').textContent = '每段请输入整天数，最低依次为 2、2、3、3 天，每段最多 3650 天。'
      return
    }
    $('cfg-save').disabled = true
    message.textContent = '正在保存…'
    let stored
    try {
      var result = await fetch(settingsUrl, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({capacity, hatchAt, gestationMinutes})})
      if (!result.ok) throw Error('save failed')
      stored = await result.json()
    } catch {
      message.textContent = '保存失败。请确认 DSH Web 已重启并加载新版插件，再点保存。'
      return
    } finally { $('cfg-save').disabled = false }
    readSharedChanges()
    reserve = {capacity, hatchAt, gestationMinutes}
    if(state.idleMode!==$('cfg-idle').checked){state.idleSince=Date.now();state.idleMode=$('cfg-idle').checked}
    state.showPreferences=$('cfg-preferences').checked
    state.growth = rules
    message.textContent = '已保存 · 上限 ' + capacity + ' 格，满 ' + hatchAt + ' 格可孕育。下次孕育时长为 ' + Math.floor(gestationMinutes/60) + ' 小时 ' + gestationMinutes%60 + ' 分钟。'
    if (stored?.gestationMinutes!==gestationMinutes) message.textContent+='时长已保存在此浏览器。重启 DSH Web 后再保存一次，即可同步到本机配置。'
    state.name = ($('cfg-name').value || '').trim().slice(0, 24) || DEFAULTS.name
    var previousCapacity = state.capacity
    state.capacity = capacity
    state.hatchAt = hatchAt
    state.gestationMinutes = gestationMinutes
    var rate = clamp(Number($('cfg-rate').value), 0, 240)
    state.rate = isFinite(rate) ? rate : 0
    state.sensitivity = clamp(Number($('cfg-sens').value) || 1, 0.1, 5)
    state.bound = $('cfg-bind').checked
    if (!state.incubating && state.capacity < previousCapacity) {
      var savedOverflow = Math.max(0, state.storage - previousCapacity)
      state.storage = Math.min(state.storage, state.capacity) + savedOverflow
    }
    pushEvent('设置已更新', '')
    save()
    render()
  })

  const resetSheet=$('reset-sheet'),resetConfirm=$('reset-confirm'),resetCancel=$('reset-cancel')
  const code=$('archive-code'),transferMessage=$('archive-message')
  let incoming=null
  const resetWarning=$('reset-warning').textContent
  const resetImpact=$('archive-impact').textContent
  function confirmArchive(candidate){
    incoming=candidate
    $('reset-error').textContent=''
    $('reset-title').textContent=candidate?'替换当前家庭档案？':'从零开始？'
    $('reset-warning').textContent=candidate?candidate.name+' · '+candidate.whales.length+' 位住民 · '+candidate.tokenPool.toLocaleString('zh-CN')+' Token':resetWarning
    $('archive-impact').textContent=candidate?'确认后，将用这份存档覆盖当前进度和游戏设置。可以先取消，导出当前存档备份。':resetImpact
    resetConfirm.textContent=candidate?'确认替换存档':'确认清空并重新开始'
    resetSheet.showModal();resetCancel.focus()
  }
  $('cfg-reset').onclick=()=>confirmArchive(null)
  resetSheet.addEventListener('close',()=>{incoming=null})
  resetCancel.onclick=()=>resetSheet.close()
  function syncCodeActions(){
    const empty=!code.value.trim()
    $('archive-copy').disabled=empty;$('archive-import').disabled=empty
  }
  code.oninput=()=>{syncCodeActions();transferMessage.textContent=''}
  $('archive-export').onclick=async()=>{
    try{
      readSharedChanges();code.value=await exportCode(state);syncCodeActions();code.select()
      transferMessage.textContent='存档码已生成。复制后，在另一台电脑的设置中粘贴并预览导入。'
    }catch{transferMessage.textContent='导出失败，请确认浏览器支持压缩存档后重试。'}
  }
  $('archive-copy').onclick=async()=>{
    try{await navigator.clipboard.writeText(code.value);transferMessage.textContent='存档码已复制。'}
    catch{code.focus();code.select();transferMessage.textContent='已选中存档码，请按 Ctrl+C 复制。'}
  }
  $('archive-import').onclick=async()=>{
    const input=code.value
    try{const candidate=await importCode(input);if(code.value===input && !resetSheet.open)confirmArchive(candidate)}
    catch(error){transferMessage.textContent=error.message}
  }
  resetSheet.addEventListener('cancel',e=>{if(resetConfirm.disabled)e.preventDefault()})
  resetConfirm.onclick=async()=>{
    if(resetConfirm.disabled)return
    resetConfirm.disabled=true;resetCancel.disabled=true
    const reset=async()=>{
      readSharedChanges()
      const candidate=incoming
      const configValues=candidate?{capacity:candidate.capacity,hatchAt:candidate.hatchAt,gestationMinutes:candidate.gestationMinutes}
        :{capacity:DEFAULTS.capacity,hatchAt:180,gestationMinutes:defaultGestationMinutes}
      const res=await fetch('/__dim-womb/api/activity',{cache:'no-store',signal})
      if(!res.ok)throw Error('activity')
      const reading=await res.json()
      const now=Date.now(),meter=reading.meter
      const base=candidate || {...structuredClone(DEFAULTS),storage:0,economyVersion:3,updatedAt:now,lastSatisfiedAt:now}
      const fresh=load(true,{...base,...configValues,archiveId:crypto.randomUUID(),seenAt:now,
        meterAwaitingBaseline:!meter,meterCursor:meter?{since:meter.today,days:{[meter.today]:meter.days[meter.today]||0}}:null,
        lastTokens:reading.source==='token-monitor'?reading.tokens24h:null})
      const snapshot=JSON.stringify(fresh)
      const previous={capacity:state.capacity,hatchAt:state.hatchAt,gestationMinutes:state.gestationMinutes}
      const storeSettings=values=>fetch(settingsUrl,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(values),signal})
      const config=await storeSettings(configValues)
      if(!config.ok)throw Error('settings')
      try {localStorage.setItem(KEY,snapshot)}
      catch(error){await storeSettings(previous);throw error}
      reserve=configValues;state=fresh;savedSnapshot=snapshot;seenAt=now;lastTick=now;mood=state.mood
      localStorage.removeItem(OLD_KEY)
      if(candidate)advance(Math.max(0,now-state.updatedAt))
      activity=reading
      resetSheet.close();fillForm();render();save();code.value='';syncCodeActions()
      transferMessage.textContent=candidate?'存档已导入。之后的用量从本机当前读数开始结算。':''
      $('growth-message').textContent=candidate?'':'已重置次元之家。游戏余额为 0，之后按新增用量结算。'
    }
    try {
      if(navigator.locks)await navigator.locks.request('dsh-whale-school-purchase',reset)
      else await reset()
    } catch {$('reset-error').textContent='档案未能完成保存。请检查 DSH 连接和浏览器存储空间，再试一次。'}
    finally {resetConfirm.disabled=false;resetCancel.disabled=false}
  }

  $('ev-clear').addEventListener('click', function () {
    state.events = []
    save()
    render()
  })

  /* ------------------------------------------------------- 悬浮说明 */
  var tipEl = null
  var tipTarget = null

  function placeTip(el) {
    if (!tipEl) return
    tipEl.textContent = el.getAttribute('data-tip') || ''
    if (!tipEl.textContent) return
    tipEl.style.left = '0px'
    tipEl.style.top = '0px'
    tipEl.classList.add('on')
    var rect = el.getBoundingClientRect()
    var box = tipEl.getBoundingClientRect()
    var left = rect.left + rect.width / 2 - box.width / 2
    left = Math.max(10, Math.min(window.innerWidth - box.width - 10, left))
    var top = rect.bottom + 9
    if (top + box.height > window.innerHeight - 10) top = Math.max(10, rect.top - box.height - 9)
    tipEl.style.left = left + 'px'
    tipEl.style.top = top + 'px'
  }

  function hideTip() {
    if (tipEl) tipEl.classList.remove('on')
    tipTarget = null
  }

  function wireTips() {
    tipEl = root.getElementById('tip')
    if (!tipEl) return
    root.addEventListener('mouseover', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null
      if (!el || el === tipTarget) return
      tipTarget = el
      placeTip(el)
    }, {signal})
    root.addEventListener('mouseout', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null
      if (el && el === tipTarget) hideTip()
    }, {signal})
    root.addEventListener('focusin', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null
      if (el) { tipTarget = el; placeTip(el) }
    }, {signal})
    root.addEventListener('focusout', hideTip, {signal})
    // 滚动时跟着元素走，而不是直接消失；鼠标离开文档才收起来
    window.addEventListener('scroll', function () { if (tipTarget) placeTip(tipTarget) }, {capture:true, signal})
    window.addEventListener('resize', function () { if (tipTarget) placeTip(tipTarget) }, {signal})
    root.addEventListener('mouseleave', hideTip, {signal})
  }

  /* ---------------------------------------------------------- 孕育 / 水族馆 */
  var FEED_PER_REQUEST = 1
  function hatchCost() { return Math.min(state.hatchAt, state.capacity * 0.45) }

  var WHALE_TRAITS = ['安静', '好奇', '黏人', '贪吃', '爱睡', '爱闹', '怕生', '慢热', '爱干净']
  var NAME_A = ['小', '阿', '贝', '汐', '沫', '露', '浪', '深', '团']
  var NAME_B = ['鲸', '蓝', '泡', '尾', '潮', '星', '眠', '盐', '月']

  function pick(list) { return list[Math.floor(Math.random() * list.length)] }

  function newWhale(hue, bornAt) {
    var name = pick(NAME_A) + pick(NAME_B)
    return {
      id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: name,
      hue: hue,
      trait: pick(WHALE_TRAITS),
      satiety: 40,
      meals: 0,
      form: null,
      bornAt: bornAt,
      stage: 0
    }
  }

  /** 小鲸鱼：侧面、朝左，颜色按 hue 变 */
  /** Q 版小鲸鱼：正面、圆头、大眼睛、腮红、厚描边 */
  function whaleSvg(hue) {
    var light = 'hsl(' + hue + ',90%,82%)'
    var mid = 'hsl(' + hue + ',76%,62%)'
    var deep = 'hsl(' + hue + ',70%,45%)'
    var ink = 'hsl(' + hue + ',55%,28%)'
    return '<svg viewBox="0 0 120 104" aria-hidden="true">' +
      // 尾鳍（身后）
      '<path d="M78 78c10 4 20 3 27-3-3 9-3 16 0 24-8-6-18-8-27-5z" fill="' + deep + '" stroke="' + ink + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      // 身体
      '<ellipse cx="58" cy="58" rx="35" ry="31" fill="' + mid + '" stroke="' + ink + '" stroke-width="2.6"/>' +
      // 肚皮
      '<ellipse cx="58" cy="70" rx="24" ry="15" fill="' + light + '" opacity=".65"/>' +
      // 胸鳍
      '<ellipse cx="25" cy="66" rx="9" ry="6" fill="' + deep + '" stroke="' + ink + '" stroke-width="2.2" transform="rotate(-24 25 66)"/>' +
      '<ellipse cx="91" cy="66" rx="9" ry="6" fill="' + deep + '" stroke="' + ink + '" stroke-width="2.2" transform="rotate(24 91 66)"/>' +
      // 眼睛
      '<ellipse cx="46" cy="52" rx="7" ry="8.6" fill="#101a2e"/>' +
      '<ellipse cx="70" cy="52" rx="7" ry="8.6" fill="#101a2e"/>' +
      '<circle cx="43.6" cy="48.6" r="2.8" fill="#ffffff"/><circle cx="67.6" cy="48.6" r="2.8" fill="#ffffff"/>' +
      '<circle cx="48" cy="56" r="1.4" fill="#bfe9ff"/><circle cx="72" cy="56" r="1.4" fill="#bfe9ff"/>' +
      // 腮红 / 嘴
      '<ellipse cx="34" cy="63" rx="5" ry="2.8" fill="#ff9fc0" opacity=".55"/>' +
      '<ellipse cx="82" cy="63" rx="5" ry="2.8" fill="#ff9fc0" opacity=".55"/>' +
      '<path d="M54 63c2 2.6 6 2.6 8 0" fill="none" stroke="' + ink + '" stroke-width="2.2" stroke-linecap="round"/>' +
      // 喷水
      '<path d="M58 26c0-7 3-12 7-14M58 26c0-6-3-10-6-12" fill="none" stroke="' + light + '" stroke-width="3" stroke-linecap="round" opacity=".9"/>' +
      '<circle cx="58" cy="10" r="2.6" fill="' + light + '" opacity=".8"/>' +
      '<circle cx="70" cy="15" r="1.8" fill="' + light + '" opacity=".6"/>' +
      '</svg>'
  }
  function hatchInfo() {
    var ratio = state.capacity > 0 ? state.storage / state.capacity : 0
    if (state.incubating) {
      var elapsed = Date.now() - state.incubating.startedAt
      return { mode: 'incubating', progress: clamp(elapsed / state.incubating.durationMs, 0, 1), ratio: ratio }
    }
    var ready = state.storage >= state.hatchAt
    return { mode: ready ? 'ready' : 'idle', progress: ratio, ratio: ratio }
  }

  function startHatch() {
    readSharedChanges()
    var info = hatchInfo()
    if (info.mode !== 'ready') return
    state.storage = Math.max(0, state.storage - hatchCost())
    state.incubating = { startedAt: Date.now(), durationMs: state.gestationMinutes * MIN, hue: 170 + Math.floor(Math.random() * 90) }
    pushEvent('母鲸开始孕育幼鲸 · 消耗 ' + hatchCost().toFixed(1) + ' 格储存', '孕育')
    save()
    render()
  }

  function finishHatch() {
    if (!state.incubating) return
    var whale = newWhale(state.incubating.hue, state.incubating.startedAt + state.incubating.durationMs)
    state.whales.unshift(whale)
    state.births++
    growBond(5, whale.bornAt)
    if (!state.firstMealGranted) {
      state.riceStock = Math.min(9999, state.riceStock + 1)
      state.firstMealGranted = true
    }
    // Keep graduates available for the lifetime leaderboard; the tank renders at most twelve.
    state.lastPregnancy = state.incubating
    state.incubating = null
    pushEvent('小鲸鱼出生 · ' + whale.name, '诞生')
    save()
  }



  var scene = { whales: [], rices: [], timer: 0, last: 0, running: false, bubblesReady: false }

  function tankEl() { return root.getElementById('tank') }

  function initBubbles() {
    if (scene.bubblesReady) return
    var box = root.getElementById('bubbles')
    if (!box) return
    var html = ''
    for (var i = 0; i < 16; i++) {
      var left = Math.round(Math.random() * 96) + 2
      var dur = (7 + Math.random() * 7).toFixed(1)
      var delay = (Math.random() * 8).toFixed(1)
      var size = 4 + Math.round(Math.random() * 4)
      html += '<i style="left:' + left + '%;width:' + size + 'px;height:' + size +
        'px;animation-duration:' + dur + 's;animation-delay:' + delay + 's"></i>'
    }
    box.innerHTML = html
    scene.bubblesReady = true
  }

  function updateStage(whale, now, active=false) {
    if(waitingForRice(whale))return ''
    if(whale.stage===0)completeNursery(whale,now,state.growth[0].days,extraDays(whale))
    if(idleGrowth(whale,state,now,extraDays(whale)))save()
    var event = ''
    while (whale.stage < 4) {
      var rule = state.growth[whale.stage]
      if (now - origin(whale) + extraDays(whale)*DAY_MS < rule.days * 24 * HOUR) break
      whale.stage++
      if(whale.stage===3)continue
      whale.milestones ||= {}
      whale.milestones[whale.stage]=active ? now : Math.min(now,Math.max(whale.nurseryReadyAt||whale.firstRiceAt||whale.bornAt,origin(whale)+(rule.days-extraDays(whale))*DAY_MS))
      if (whale.stage === 4) {
        whale.departedAt=whale.milestones[4]
        whale.adultRoute=routeIndex(whale)
        whale.form = pick(Object.keys(adultNames))
        whale.diploma = grade(whale)
      }
      event = whale.name + (whale.form ? '成年了 · ' + routeName(whale) : '进入' + stageNames[whale.stage] + '期')
      pushEvent(event, '成长')
    }
    return event
  }

  function growthLabel(whale, now) {
    if(!whale.stage)return '幼鲸 · 白饭 '+mealProgress(whale)+' · '+'喂养中'
    if (whale.form) return '成年 · ' + routeName(whale) + (whale.diploma ? ' · ' + whale.diploma.rank : '')
    var rule = state.growth[whale.stage>=2?3:whale.stage]
    var remaining = Math.max(0, Math.ceil((origin(whale) + (rule.days - extraDays(whale)) * DAY_MS - now) / HOUR))
    var age = remaining > 48 ? '还需 ' + Math.ceil(remaining / 24) + ' 天' : remaining ? '还需 ' + remaining + ' 小时' : '日龄已到'
    return stageNames[whale.stage] + ' · 成长期加餐 ' + (whale.snacksEaten||0) + ' 份' + ' · ' + age
  }

  function appearance(sprite) {
    var whale = sprite.whale, now = Date.now()
    var file, height, width
    if (whale.form) {
      file = residentPortrait(whale).split('/').pop()
      height = 182
      width = 107
    } else {
      var stage = whale.stage, next = state.growth[stage]
      var prior = stage ? state.growth[stage-1] : {days:0, meals:0}
      var ageDays = (now - origin(whale)) / DAY_MS + extraDays(whale)
      var progress = stage===0 ? Math.min(1,whale.meals/30) : clamp((ageDays-prior.days)/(next.days-prior.days), 0, 1)
      file = residentPortrait(whale).split('/').pop()
      height = Math.round([39, 76, 114, 146][stage] + progress * [15, 22, 31, 18][stage])
      width = Math.round(height * [1.35, 0.80, 0.82, 0.82][stage])
    }
    sprite.el.dataset.stage = String(whale.stage)
    var label = whale.name + ' · ' + growthLabel(whale, now)
    if (sprite.width === width && sprite.file === file && sprite.label === label) return
    sprite.width = width
    sprite.height = height
    sprite.el.style.width = width + 'px'
    sprite.el.style.height = height + 'px'
    var img = sprite.el.firstElementChild
    if (sprite.file !== file) {
      img.src = '/__dim-womb/outfits/' + file
      img.style.filter = whale.form ? '' : 'hue-rotate(' + ((whale.hue || 210) - 210) * 0.55 + 'deg)'
      sprite.file = file
    }
    sprite.label = label
    sprite.el.lastElementChild.textContent = label
    img.alt = label
  }

  /** 按 state.whales 同步水里的精灵（最多 12 只，多的收在数字里） */
  let tankPage=0
  function syncWhaleSprites() {
    var layer = root.getElementById('whale-layer')
    var tank = tankEl()
    if (!layer || !tank) return
    var tankW = tank.clientWidth || 800
    var tankH = tank.clientHeight || 430
    var swimRange = Math.max(20, tankH - 132 - 42)
    const calves=state.whales.filter(w=>w.stage===0),pages=Math.max(1,Math.ceil(calves.length/4))
    tankPage=clamp(tankPage,0,pages-1)
    $('tank-prev').disabled=!tankPage;$('tank-next').disabled=tankPage===pages-1
    $('tank-page').textContent=(tankPage+1)+' / '+pages
    var list=calves.slice(4*tankPage,4*tankPage+4)

    var alive = {}
    for (var i = 0; i < list.length; i++) alive[list[i].id] = true

    // 移除已经不存在的
    scene.rices = scene.rices.filter(function (r) {
      if (alive[r.eater.id]) return true
      r.el.remove()
      return false
    })
    scene.whales = scene.whales.filter(function (w) {
      if (alive[w.id]) return true
      if (w.el && w.el.parentNode) w.el.parentNode.removeChild(w.el)
      return false
    })

    // 新增
    for (var j = 0; j < list.length; j++) {
      var whale = list[j]
      var found = null
      for (var k = 0; k < scene.whales.length; k++) {
        if (scene.whales[k].id === whale.id) { found = scene.whales[k]; break }
      }
      if (found) { found.lane=j; found.whale=whale; appearance(found); continue }
      var el = document.createElement('div')
      el.className = 'whale'
      el.setAttribute('role','button');el.tabIndex=0
      el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();academy.home.open(el.dataset.whaleId)}}
      el.dataset.whaleId = whale.id
      el.appendChild(document.createElement('img'))
      var tag = document.createElement('div')
      tag.className = 'tag'
      el.appendChild(tag)
      layer.appendChild(el)
      var sprite = {
        whale: whale,lane:j,
        id: whale.id,
        name: whale.name,
        el: el,
        x: 8 + (j + 0.5) / list.length * Math.max(0, tankW - 126),
        y: 20 + swimRange * (0.25 + (j * 0.37) % 0.72),
        depth: 0.25 + (j * 0.37) % 0.72,
        vx: (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 14),
        phase: Math.random() * Math.PI * 2,
        satiety: typeof whale.satiety === 'number' ? whale.satiety : 40,
        target: null
      }
      el.style.setProperty('--phase', -sprite.phase + 's')
      el.classList.toggle('flip', sprite.vx > 0)
      appearance(sprite)
      scene.whales.push(sprite)
    }

    var empty = root.getElementById('tank-empty')
    if (empty) empty.style.display = list.length ? 'none' : 'grid'
  }

  function availableRice() { return Math.max(0, state.riceStock - scene.rices.length) }

  function scatter(x, y, chosen) {
    if (!scene.whales.length || !availableRice()) {
      $('meal-feedback').textContent = !scene.whales.length ? '等第一只小鲸鱼入住后就能投喂。' : '手上没有白饭了，先兑换一份。'
      return
    }
    var tank = tankEl()
    x = clamp(x, 10, tank.clientWidth - 12)
    y = clamp(y, 10, tank.clientHeight - 12)
    function distance(s) { return Math.hypot(s.x + s.width / 2 - x, s.y + s.height / 2 - y) }
    var eater = chosen || scene.whales.reduce(function (best, s) { return distance(s) < distance(best) ? s : best })
    const laneWidth=tank.clientWidth/scene.whales.length
    x=clamp(x,eater.lane*laneWidth+eater.width/2+4,(eater.lane+1)*laneWidth-eater.width/2-4)
    var el = document.createElement('div')
    el.className = 'rice'
    el.style.left = (x - 10) + 'px'
    el.style.top = (y - 10) + 'px'
    $('rice-layer').appendChild(el)
    scene.rices.push({el:el, x:x, y:y, eater:eater})
    $('meal-feedback').textContent = '投下一份白饭，' + eater.name + (eater.whale.stage ? '正朝白饭赶来。' : '正在游过来。')
    updateHomeHud()
  }

  function popAt(x, y, text) {
    var layer = root.getElementById('rice-layer')
    if (!layer) return
    var el = document.createElement('div')
    el.className = 'pop'
    el.textContent = text
    el.style.left = x + 'px'
    el.style.top = y + 'px'
    layer.appendChild(el)
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el) }, 900)
  }

  function stepScene(dt) {
    var tank = tankEl()
    if (!tank) return
    var tankW = tank.clientWidth || 800
    var tankH = tank.clientHeight || 430
    // 按住民分配白饭；缸壁处以能到达的中心点判断接触。
    for (var r of scene.rices) {
      r.y = Math.min(tankH - 20, r.y + dt * 38)
      r.el.style.top = (r.y - 10) + 'px'
    }
    for (var s of scene.whales) {
      var target = scene.rices.find(function (r) { return r.eater === s })
      var stage = s.whale.stage
      var laneWidth=tankW/scene.whales.length
      var left = s.lane*laneWidth+4, right = Math.max(left,(s.lane+1)*laneWidth-s.width-4)
      var top = 8, bottom = Math.max(top, tankH - s.height - 7)
      var oldX = s.x
      s.el.toggleAttribute('data-seeking', Boolean(target))
      var tx, ty
      if (target) {
        tx = clamp(target.x - s.width / 2, left, right)
        ty = clamp(target.y - s.height * 0.55, top, bottom)
        var dx = tx - s.x, dy = ty - s.y
        var dist = Math.hypot(dx, dy)
        var move = Math.min(1, dt * 170 / Math.max(1, dist))
        s.x += dx * move
        s.y += dy * move
        if (Math.abs(dx) > 2) s.vx = Math.sign(dx) * Math.abs(s.vx)
        if (dist < 15) {
          target.el.remove()
          scene.rices.splice(scene.rices.indexOf(target), 1)
          const id=s.id
          const consume=()=>{
            readSharedChanges()
            const whale=state.whales.find(w=>w.id===id)
            if(!whale || whale.stage!==0 || state.riceStock<1)return
            const now=Date.now()
            state.riceStock--;whale.meals++;whale.satiety=Math.min(100,whale.satiety+22)
            const change=updateStage(whale,now)
            $('meal-feedback').textContent=change || (whale.name+'吃了一份白饭 · '+growthLabel(whale,now))
            popAt(s.x+s.width/2,s.y+8,change?'成长！':mealProgress(whale))
            save();renderAquarium();updateHomeHud()
          }
          if(navigator.locks)navigator.locks.request('dsh-whale-school-purchase',consume);else consume()
        }
      } else {
        s.phase += dt * 1.6
        var stride = stage === 1 ? 0.9 + 0.25 * Math.sin(s.phase * 4)
          : stage === 2 ? 0.78 : stage >= 3 ? 0.56 : 1
        s.x += s.vx * stride * dt
        if (s.x <= left) s.vx = Math.abs(s.vx)
        if (s.x >= right) s.vx = -Math.abs(s.vx)
        // The calf swims at its own depth. Humanoid residents move along the tank floor.
        ty = stage === 0 ? clamp(20 + (bottom - 40) * s.depth + Math.sin(s.phase) * 6, top, bottom)
          : clamp(bottom - s.depth * 20, top, bottom)
        s.y += clamp(ty - s.y, -80 * dt, 80 * dt)
        s.whale.satiety = Math.max(0, s.whale.satiety - dt * 0.35)
      }
      s.x = clamp(s.x, left, right)
      s.el.style.left = s.x + 'px'
      s.y = clamp(s.y, top, bottom)
      s.el.style.top = s.y + 'px'
      // The painted calf faces left. Mirror the artwork alone when it travels right.
      if (Math.abs(s.x - oldX) > 0.015) s.el.classList.toggle('flip', s.x > oldX)
    }
  }

  // 用定时器而不是 rAF：iframe 里不可见/后台时 rAF 会被节流到停摆，定时器更稳
  function startScene() {
    if (scene.running) return
    scene.running = true
    scene.last = Date.now()
    scene.timer = setInterval(function () {
      if (!scene.running) return
      var now = Date.now()
      var dt = Math.min(0.1, (now - scene.last) / 1000)
      scene.last = now
      try { stepScene(dt) } catch (e) { /* 单帧出错不要停掉整个场景 */ }
    }, 33)
  }

  function stopScene() {
    scene.running = false
    if (scene.timer) clearInterval(scene.timer)
    scene.timer = 0
  }

  function updateHomeHud() {
    var pool = Math.floor(state.tokenPool || 0)
    var stock = availableRice()
    $('scatter-btn').disabled = !stock || !state.whales.some(w=>w.stage===0)
    var poolN = root.getElementById('pool-n')
    if (poolN) poolN.textContent = Math.floor(pool).toLocaleString('zh-CN') + ' Token 可用'
    var riceN = root.getElementById('rice-n')
    if (riceN) riceN.textContent = String(stock)
    var count = root.getElementById('whale-count')
    if (count) count.textContent = String(state.whales.filter(w=>w.stage===0).length)
    const price=state.prices[7]
    const quantity=$('rice-quantity').valueAsNumber
    const valid=Number.isInteger(quantity) && quantity>=1 && quantity<=9999
    const total=price*quantity
    const fits=state.riceStock+quantity<=9999
    $('buy-rice').disabled=!valid || !fits || pool<total
    var hint = root.getElementById('feed-hint')
    if (hint) hint.textContent = '每份白饭 '+price.toLocaleString()+' Token'+(!valid?' · 数量须为 1–9999 的整数':!fits?(state.riceStock>=9999?' · 库存已满':' · 库存最多还能放 '+(9999-state.riceStock)+' 份'):' · 合计 '+total.toLocaleString()+' Token'+(pool<total?' · 还差 '+(total-pool).toLocaleString()+' Token':''))

  }

  function renderAquarium() {
    var grid = root.getElementById('whale-layer')
    if (!grid) return
    var tank = tankEl()
    if (!tank || !scene.running && $('view-aquarium').classList.contains('hidden')) return
    syncWhaleSprites()
    academy.home.refreshTankTabs()
    updateHomeHud()
  }

  function renderHatch() {
    var info = hatchInfo()
    var running = info.mode === 'incubating'
    var ready = info.mode === 'ready'
    const duration = running ? state.incubating.durationMs : state.gestationMinutes * MIN
    const leftMs = running ? state.incubating.startedAt + duration - Date.now() : duration
    var seconds = Math.ceil(clamp(leftMs, 0, duration) / 1000)
    var percent = running ? Math.floor(info.progress * 100) : 0
    var newest = state.whales[0]
    var recentBirth = !running && newest && Date.now() - newest.bornAt < 5 * MIN
    $('hatch-clock-label').textContent = running ? '距幼鲸出生' : '游戏孕育时长'
    $('hatch-clock').textContent = pad(Math.floor(seconds / 3600)) + ':' + pad(Math.floor(seconds / 60) % 60) + ':' + pad(seconds % 60)
    $('family-summary').textContent = '累计出生 ' + state.births + ' 只 · ' + marriageStage()[0] + ' · 好感 ' + bondPercent() + '%'
    $('family-base').textContent = marriageStage()[0] + ' · 最高 ' + state.bondPeak + '% · 最低保留 ' + Math.ceil(state.bondPeak * 0.9) + '%'
    $('hatch-title').textContent = running ? '孕育中' : ready ? '可孕育' : '储存中'
    $('hatch-box').dataset.mode = info.mode
    $('hatch-track').hidden = !running
    $('hatch-bar').style.width = percent + '%'
    $('hatch-percent').textContent = percent + '%'
    $('hatch-meter').setAttribute('aria-valuenow', String(percent))
    $('hatch-btn').disabled = !ready
    $('hatch-btn').textContent = running ? '正在孕育' : '开始孕育'
    $('hatch-hint').textContent = running ? '孕育期间可超额储存，幼鲸出生后余额可用于下一胎。' : ready
      ? '本次孕育消耗 ' + hatchCost().toFixed(1) + ' 格储存。'
      : '还需 ' + (Math.ceil(Math.max(0, state.hatchAt - state.storage) * 10) / 10).toFixed(1) + ' 格即可孕育。'
    $('to-aquarium').hidden = !recentBirth
    if (recentBirth) $('to-aquarium').textContent = newest.name + '已出生 · 前往水族馆 →'
  }

  /* ------------------------------------------------------------ 循环 */
  var lastTick = Date.now()
  const tickTimer = setInterval(function () {
    var now = Date.now()
    advance(now - lastTick)
    lastTick = now
    if (state.incubating && now - state.incubating.startedAt >= state.incubating.durationMs) finishHatch()
    render()
  }, 1000)

  let polling=false
  async function poll() {
    if(polling || signal?.aborted)return
    polling=true
    const archive=state.archiveId
    try {
      const res=await fetch('/__dim-womb/api/activity',{cache:'no-store',credentials:'same-origin',signal})
      if(!res.ok)return
      const data=await res.json()
      const apply=()=>{readSharedChanges();if(data && !signal?.aborted && archive===state.archiveId)applyActivity(data)}
      if(navigator.locks)await navigator.locks.request('dsh-whale-school-purchase',apply)
      else apply()
    } catch {activityKnown=true}
    finally {polling=false}
  }
  var tankBox = root.getElementById('tank')
  tankBox.style.cursor = 'pointer'
  tankBox.addEventListener('click', function (event) {
    if(event.target.closest('.map-tools'))return
    var rect = tankBox.getBoundingClientRect()
    var node = event.target.closest('.whale')
    var chosen = node && scene.whales.find(function (s) { return s.el === node })
    if(chosen){academy.home.open(chosen.id);return}
    scatter(event.clientX - rect.left, event.clientY - rect.top, chosen)
  })
  $('scatter-btn').addEventListener('click', function () {
    scatter(tankBox.clientWidth / 2, tankBox.clientHeight * 0.35)
  })


  initBubbles()
  if (!root.getElementById('view-aquarium').classList.contains('hidden')) startScene()

  var hatchBtn = root.getElementById('hatch-btn')
  if (hatchBtn) hatchBtn.addEventListener('click', startHatch)
  var motherPoses = {
    calm: ['安定', '双手交叠，安静微笑'],
    bright: ['重逢', '微笑着抬手迎接'],
    waiting: ['等待', '侧身望向来处'],
    shy: [family ? '有点害羞' : '发情 · 害羞', '脸颊泛红，移开视线，指尖捏住围裙边'],
    lonely: ['寂寞', '轻抱双臂，望向一旁'],
    tired: ['困倦', '微垂眼睑，双手放松'],
    ready: ['待孕育', '双手合在胸前，眼中带着期待'],
    hatching: ['孕育中', '低头微笑，隔着围裙轻抚腹部']
  }
  function renderMother(desire) {
    var phase = hatchInfo().mode
    var current = activity.connected ? mood : 'quiet'
    var moods = {clingy:'bright', calm:'calm', quiet:'calm', waiting:'waiting', lonely:'lonely', cold:'tired'}
    var pose = moods[current] || 'calm'
    if (phase === 'incubating') pose = 'hatching'
    else if (current !== 'lonely' && current !== 'cold') {
      if (current !== 'quiet' && desire >= 75) pose = 'shy'
      else if (phase === 'ready') pose = 'ready'
    }
    var image = $('mother-image')
    if (image.dataset.pose !== pose) {
      var path = '/__dim-womb/outfits/mother-maid-v2-' + pose + '.png'
      for (var portrait of [image, $('keeper-image')]) {
        portrait.dataset.pose = pose
        portrait.alt = '鲸鱼妈妈 · ' + motherPoses[pose][1]
        portrait.onerror = pose === 'calm' ? null : function () {
          this.onerror = null
          this.src = '/__dim-womb/outfits/mother-maid-v2-calm.png'
        }
        portrait.src = path
      }
    }
    $('mother-status').textContent = motherPoses[pose][0]
  }

  function readSharedChanges() {
    let raw
    try { raw = localStorage.getItem(KEY) } catch { return false }
    if (raw === savedSnapshot) return false
    state = load(true)
    savedSnapshot = raw
    seenAt = Number(state.seenAt) || 0
    mood = state.mood || 'quiet'
    lastTick = Date.now()
    advance(lastTick - state.updatedAt)
    for (const sprite of scene.whales) {
      const resident = state.whales.find(w => w.id === sprite.id)
      if (resident) sprite.whale = resident
    }
    return true
  }
  const academy = mountAcademy(root, () => state, save, readSharedChanges, updateStage,{
    aquarium:()=>openView('aquarium'),
    rice:availableRice,
    refreshPantry:updateHomeHud,
    feed(id){
      readSharedChanges()
      const resident=state.whales.find(w=>w.id===id)
      if(!resident || resident.stage!==0 || availableRice()<1)return false
      state.riceStock--;resident.meals++;resident.satiety=Math.min(100,(resident.satiety||0)+22)
      updateStage(resident,Date.now());save();render();return true
    }
  })
  $('tank-prev').onclick=()=>{tankPage--;renderAquarium()}
  $('tank-next').onclick=()=>{tankPage++;renderAquarium()}
  for(const button of root.querySelectorAll('[data-travel]'))button.onclick=()=>{
    openView('academy');academy.home.travel(Number(button.dataset.travel))
    $('room-floor').scrollIntoView({block:'center'})
  }
  window.addEventListener('storage', event => {
    if (event.key === KEY && readSharedChanges()) render()
  }, {signal})
  advance(Date.now() - state.updatedAt)
  if (state.incubating && Date.now() >= state.incubating.startedAt + state.incubating.durationMs) finishHatch()
  lastTick = Date.now()
  save()
  wireTips()
  render()
  poll()
  const pollTimer = setInterval(poll, 3000)
  signal?.addEventListener('abort', () => {
    clearInterval(tickTimer)
    clearInterval(pollTimer)
    clearTimeout(hitTimer)
    stopScene()
    if (zoom) zoom.cancel()
  }, {once:true})

  // 支持 ?view=help / events / settings 直接打开某一页
  try {
    var wanted = root === document && new URLSearchParams(location.search).get('view')
    if (['mother','scan','hatch'].includes(wanted)) { openView('overview'); if (wanted === 'scan') setScan(true) }
    else if (wanted) {
      var btn = nav.querySelector('button[data-view="' + wanted + '"]')
      if (btn) btn.click()
    }
  } catch (e) { /* 旧浏览器就算了 */ }
  return openView
}
