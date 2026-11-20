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
    const modes = [
      {id:'work', label:'工作', key:'F8'},
      {id:'family', label:'次元之家', key:'F9'}
    ]
    const hintsKey = 'dsh-dim-womb.show-mode-shortcuts'
    function initialHints() {
      try { return localStorage.getItem(hintsKey) !== 'off' } catch { return true }
    }
    function initialMode() {
      try { const saved = localStorage.getItem(modeKey); if (saved==='private') localStorage.setItem(modeKey,'family'); return ['family','private'].includes(saved) ? 'family' : 'work' }
      catch { return 'work' }
    }

    function ModeSwitch({mode, choose, fallback, showHints}) {
      return h('div', {className:'dsh-mode-seat', 'data-fallback':fallback || undefined, role:'group', 'aria-label':'界面模式'},
        h('style', null, `
          .dsh-mode-seat{display:inline-flex;gap:2px;padding:2px;margin:0 8px;align-self:center;align-items:center;flex:none;border:1px solid var(--dsw-alias-border-l2,#716483);border-radius:8px;background:var(--dsw-alias-bg-module-platform,#27233c);color:var(--dsw-alias-label-secondary,#e4dff1);line-height:1;-webkit-app-region:no-drag;pointer-events:auto}
          .dsh-mode-seat[data-fallback]{order:-1;align-self:flex-start;margin:5px 12px}
          .dsh-mode-seat button{background:transparent;color:inherit;border:0;border-radius:5px;padding:5px 9px;cursor:pointer;font:500 12px/1.25 system-ui,sans-serif;white-space:nowrap}
          .dsh-mode-seat kbd{display:inline-block;margin-inline-start:5px;font:500 10px/1.3 system-ui,sans-serif;color:inherit;opacity:.85;white-space:nowrap}
          @media(max-width:920px){.dsh-mode-seat kbd{display:block;margin:2px 0 0;font-size:9px}}
          @container(max-width:570px){.dsh-mode-seat kbd{display:block;margin:2px 0 0;font-size:9px}}
          .dsh-mode-seat button[aria-pressed=true]{background:#554573;color:white}
          .dsh-mode-seat button:focus-visible{outline:2px solid #9984c4;outline-offset:1px}
        `),
        ...modes.map(({id, label, key}) => h('button', {
          key:id, type:'button', 'aria-label':label+'模式', 'aria-pressed':mode===id,
          title:showHints?label+'模式（Ctrl + Shift + '+key+'）':undefined, 'aria-keyshortcuts':'Control+Shift+'+key,
          onClick:() => choose(id)
        }, label, showHints && h('kbd', {'aria-hidden':true}, 'Ctrl+Shift+'+key)))
      )
    }

    // Project the existing conversation through a slot inside the overview card.
    // Its nodes, React ownership, draft, and native event handlers stay in place.
    function HomeWorkspace({usePanelInfo, useSessions, app}) {
      const panel = usePanelInfo(info => info.activePanelId)
      const [mode, setMode] = React.useState(initialMode)
      const [showHints, setShowHints] = React.useState(initialHints)
      function changeHints(enabled) {
        try { localStorage.setItem(hintsKey, enabled ? 'on' : 'off') } catch { /* usable without storage */ }
        setShowHints(enabled)
      }
      React.useEffect(() => {
        function syncHints(event) {
          if (event.storageArea === localStorage && (event.key === hintsKey || event.key === null)) setShowHints(initialHints())
        }
        window.addEventListener('storage', syncHints)
        return () => window.removeEventListener('storage', syncHints)
      }, [])
      const [privateSeat, setPrivateSeat] = React.useState(null)
      const [nativeSeat, setNativeSeat] = React.useState(null)
      const integrated = mode !== 'work' && (panel === null || panel === 'schedules')
      const session = useSessions(state => Object.values(state.byId).find(s => s.retainedBy.mainView > 0)?.id)
      const lastSession = React.useRef(session)
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
        function onModeKey(event) {
          if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey || event.isComposing) return
          const target = modes.find(item => item.key === event.key)
          if (!target) return
          event.preventDefault()
          event.stopPropagation()
          if (!event.repeat) chooseMode(target.id)
        }
        window.addEventListener('keydown', onModeKey, true)
        return () => {
          window.removeEventListener('dim-womb:private', enter)
          window.removeEventListener('keydown', onModeKey, true)
        }
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
        if (!session) return
        const previous = lastSession.current
        lastSession.current = session
        if (!previous || previous === session || currentPanel.current !== null) return
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
              setMode('work')
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
      const settingsSeat = integrated && privateSeat?.getRootNode().getElementById?.('shortcut-hint-setting')
      return h(React.Fragment, null,
        seat && createPortal(h(ModeSwitch, {mode, choose:chooseMode, showHints,
          fallback:seat === nativeSeat && seat.tagName !== 'HEADER'}), seat),
        settingsSeat && createPortal(h('label', null,
          h('input', {type:'checkbox', checked:showHints, onChange:event=>changeHints(event.target.checked)}),
          '在模式按钮旁显示老板键提示'), settingsSeat)
      )
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
