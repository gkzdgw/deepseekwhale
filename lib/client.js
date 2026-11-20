/**
 * dsh-dim-womb · Client 半边
 * ==========================
 *
 * 总览通过浏览器原生 slot 接入同一份 DSH Conversation。原生聊天继续管理会话和输入。
 */
window.__ModuleLoader__.load({
  id: 'dsh-dim-womb',
  factory(require) {
    const React = require('react')
    const {createPortal} = require('react-dom')
    const h = React.createElement

    const NS = 'dim-womb'
    const ID = 'dim-womb'
    const inject = ['slots', 'layout', 'uiWorkspace']
    const modeKey = 'dsh-dim-womb.display-mode'
    function initialMode() {
      try { const saved = localStorage.getItem(modeKey); if (saved==='private') localStorage.setItem(modeKey,'family'); return ['family','private'].includes(saved) ? 'family' : 'work' }
      catch { return 'work' }
    }

    function ModeSwitch({mode, choose, fallback}) {
      return h('div', {className:'dsh-mode-seat', 'data-fallback':fallback || undefined, role:'group', 'aria-label':'界面模式'},
        h('style', null, `
          .dsh-mode-seat{display:inline-flex;gap:2px;padding:2px;margin:0 8px;align-self:center;align-items:center;flex:none;border:1px solid var(--dsw-alias-border-l2,#716483);border-radius:8px;background:var(--dsw-alias-bg-module-platform,#27233c);color:var(--dsw-alias-label-secondary,#e4dff1);line-height:1;-webkit-app-region:no-drag;pointer-events:auto}
          .dsh-mode-seat[data-fallback]{order:-1;align-self:flex-start;margin:5px 12px}
          .dsh-mode-seat button{background:transparent;color:inherit;border:0;border-radius:5px;padding:5px 9px;cursor:pointer;font:500 12px/1.25 system-ui,sans-serif;white-space:nowrap}
          .dsh-mode-seat button[aria-pressed=true]{background:#554573;color:white}
          .dsh-mode-seat button:focus-visible{outline:2px solid #9984c4;outline-offset:1px}
        `),
        ...[['work','工作'],['family','次元之家']].map(([id, label]) => h('button', {
          key:id, type:'button', 'aria-label':label+'模式', 'aria-pressed':mode===id,
          onClick:() => choose(id)
        }, label))
      )
    }

    // Project the existing conversation through a slot inside the overview card.
    // Its nodes, React ownership, draft, and native event handlers stay in place.
    function HomeWorkspace({usePanelInfo, useSessions, app}) {
      const panel = usePanelInfo(info => info.activePanelId)
      const [mode, setMode] = React.useState(initialMode)
      const [privateSeat, setPrivateSeat] = React.useState(null)
      const [nativeSeat, setNativeSeat] = React.useState(null)
      const integrated = mode !== 'work' && (panel === null || panel === 'schedules')
      const session = useSessions(state => Object.values(state.byId).find(s => s.retainedBy.mainView > 0)?.id)
      const home = React.useRef(null)
      const selected = React.useRef('overview')
      const currentPanel = React.useRef(panel)
      currentPanel.current = panel
      function chooseMode(next) {
        try { localStorage.setItem(modeKey, next) } catch { /* usable without storage */ }
        if (next !== 'work' && panel !== null && panel !== 'schedules') app.layout.selectPanel(null)
        setMode(next)
      }
      React.useEffect(() => {
        function enter() { chooseMode('family') }
        window.addEventListener('dim-womb:private', enter)
        return () => window.removeEventListener('dim-womb:private', enter)
      }, [panel, app])
      React.useLayoutEffect(() => {
        if (integrated && privateSeat) return
        const shell = document.querySelector('[data-shell-overlay]')?.parentElement
        if (!shell) return
        const observer = new MutationObserver(locate)
        function locate() {
          const main = shell.querySelector('[data-slot="main"]')
          const header = main?.querySelector('header[data-window-drag]') || main?.parentElement
          setNativeSeat(header || null)
          observer.disconnect()
          if (!main || header === main.parentElement) {
            observer.observe(main || shell, {childList:true, subtree:true})
          }
          for (let parent=header?.parentElement; parent && shell.contains(parent); parent=parent.parentElement) {
            observer.observe(parent,{childList:true})
          }
        }
        locate()
        return () => observer.disconnect()
      }, [panel, integrated, privateSeat, session])
      React.useEffect(() => {
        if (currentPanel.current !== null) return
        selected.current = 'overview'
        home.current?.show('overview')
      }, [session])
      React.useEffect(() => {
        home.current?.show(panel === 'schedules' ? 'automation' : selected.current)
      }, [panel])
      React.useEffect(() => {
        if (!integrated) return
        const shell = document.querySelector('[data-shell-overlay]')?.parentElement
        if (!shell) return
        let owner, lifecycle
        async function mount() {
          const next = shell.querySelector('[data-slot="main"]')
          if (next === owner) return
          lifecycle?.abort()
          owner = next
          home.current = null
          setPrivateSeat(null)
          if (!next) return
          lifecycle = new AbortController()
          const {signal} = lifecycle
          try {
            const [module, response] = await Promise.all([
              import('/__dim-womb/dashboard.js'),
              fetch('/__dim-womb/home.html', {signal})
            ])
            if (!response.ok) throw new Error('HTTP ' + response.status)
            const html = await response.text()
            if (signal.aborted) return
            const navigation = {
              family:true,
              startRoleplay: prompt => app.uiWorkspace.startSession(undefined, {prompt}),
              newSession: () => { selected.current = 'overview'; app.uiWorkspace.startSession(); home.current?.show('overview') },
              toggleSidebar: () => app.layout.toggleSidebar(),
              hasSchedules: () => app.slots.entries('main').some(entry => entry.options.key === 'schedules'),
              navigate(view) {
                if (view === 'automation') app.layout.selectPanel('schedules')
                else {
                  selected.current = view
                  if (currentPanel.current === 'schedules') app.layout.selectPanel(null)
                }
              }
            }
            const reserve = await module.loadReserveSettings(signal)
            if (signal.aborted) return
            home.current = module.embedDashboard(next, html, signal, navigation, reserve)
            home.current.show(currentPanel.current === 'schedules' ? 'automation' : selected.current)
            setPrivateSeat(next.shadowRoot.getElementById('private-mode-seat'))
          } catch (error) {
            if (!signal.aborted) {
              lifecycle.abort()
              chooseMode('work')
              console.warn('[dim-womb] 总览加载失败', error)
            }
          }
        }
        const observer = new MutationObserver(mount)
        // Observe slot hosts, never the streaming transcript.
        observer.observe(shell, {childList:true})
        for (const column of shell.children) observer.observe(column, {childList:true})
        mount()
        return () => {
          observer.disconnect()
          lifecycle?.abort()
          home.current = null
          setPrivateSeat(null)
        }
      }, [integrated, mode, app])
      const seat = integrated && privateSeat ? privateSeat : nativeSeat
      return seat ? createPortal(h(ModeSwitch, {mode, choose:chooseMode,
        fallback:seat === nativeSeat && seat.tagName !== 'HEADER'}), seat) : null
    }

    function apply(ctx) {
      if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function') return { apply, name: NS }

      try {
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name:'shell.overlay', id:'dim-womb-home',
          inject:() => ({app:ctx}),
        }, HomeWorkspace)), 'dim-womb: chat home')

        function SidebarHome() {
          React.useEffect(() => {
            if (!document.querySelector('[data-shell-overlay]')) return
            window.dispatchEvent(new Event('dim-womb:private'))
            ctx.layout.selectPanel(null)
          }, [])
          return null
        }
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: ID,
        }, SidebarHome)), 'dim-womb: main page')
      } catch (error) {
        // 槽位 API 变了也不要把整页聊天拖下水
        try { console.warn('[dim-womb] 挂载失败', error) } catch { /* ignore */ }
      }

      return { apply, name: NS }
    }

    return { inject, apply, name: NS }
  },
})
