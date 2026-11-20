import {preferenceText,mood,resting,energyLimit,changeMood,lessonFeeling,sessionEnergy,learningGain,rounded} from './wellbeing.js'
import {catalog,attributes,defaultPrices} from './catalog.js'
export {defaultPrices} from './catalog.js'
import {mountMarket} from './market.js'
import {talents} from './talents.js'
import {routeIndex,paths} from './growth-paths.js'
import {mountDropHome,ageDays} from './drop-home.js'
const subjects = ['学识','艺术','体能']
const priceNames=catalog.map(g=>g.name)
export const validPrice = n => Number.isSafeInteger(n) && n >= 1 && n <= 10000000000
// Calibrated to one usage statement; this is a game exchange rate.
const legacyPrices=[600,1200,600,1200,600,1200,30000,800]
export function grantForCents(cents) {
  return Math.min(Number.MAX_SAFE_INTEGER, Number(BigInt(cents)*100000n))
}
export function upgradeEconomy(state) {
  if(state.economyVersion>=3)return
  const old=[5000000,10000000,5000000,10000000,5000000,10000000,100000000,500000,5000000,10000000]
  state.prices=state.prices.map((p,i)=>(p===old[i] || (state.economyVersion<2 && p===legacyPrices[i]))?defaultPrices[i]:p)
  // Already granted balances stand, even when yesterday's exchange rate was more generous.
  const grant=state.historyGrant
  if (Number.isSafeInteger(grant?.cents) && grant.cents>0 && Number.isSafeInteger(grant.tokens)) {
    const revised=grantForCents(grant.cents)
    state.tokenPool=Math.min(Number.MAX_SAFE_INTEGER,state.tokenPool+Math.max(0,revised-grant.tokens))
    grant.tokens=Math.max(grant.tokens,revised)
  }
  state.economyVersion=3
}
const dailyUses=3
function schedule(w) {
  const day=ageDays(w)+1
  const max=energyLimit(w),r=w.routine?.day===day?w.routine:{day,energy:max,used:0}
  return {...r,energy:Math.min(r.energy,max),max}
}
function scores(whale) {
  return subjects.map((_,i) => Math.min(100, Math.max(0, Number(whale.study?.[i]) || 0)))
}
export function grade(whale) {
  const foundation=scores(whale).reduce((a,b)=>a+b,0)
  const specialty=talents(whale).reduce((a,b)=>a+b,0)
  const total=Math.round(foundation*.7+specialty*.15)
  return {total,rank:total>=240?'S':total>=180?'A':total>=100?'B':'C'}
}
export function mountAcademy(root, getState, save, readSharedChanges, updateStage, controls) {
  const el = id => root.getElementById(id)
  const select = el('academy-student')

  controls.play=id=>{
    readSharedChanges()
    const w=getState().whales.find(w=>w.id===id)
    if(!w||w.stage!==0||!w.meals||resting(w))return
    const today=schedule(w)
    w.routine={day:today.day,used:today.used+1,energy:Math.max(0,today.energy-2)}
    if(!w.routine.energy){w.practiceDays=(w.practiceDays||0)+1;updateStage(w,Date.now(),true)}
    save();render()
  }
  controls.routine=schedule
  const home=mountDropHome(root,getState,priceNames,controls)
  const guide=el('academy-routes')
  for(const [teen,adult,study,art,fitness,meals] of paths){
    const row=document.createElement('li')
    row.textContent=teen+' → '+adult+' · '+[study,art,fitness].join(' / ')+' · 成长期加餐约 '+meals+' 份'
    guide.append(row)
  }
  let rosterKey, boardKey
  const prices = priceNames.map((name,i) => {
    const label=document.createElement('label'), input=document.createElement('input')
    input.type='number';input.min='1';input.max='10000000000';input.step='1'
    input.id='shop-price-'+i
    label.append(name,input)
    const key=catalog[i].tier||0
    let section=el('price-group-'+key)
    if(!section){
      const details=document.createElement('details'),summary=document.createElement('summary')
      summary.textContent=key?'第 '+key+' 档':'生活补给';details.open=key===0
      section=document.createElement('div');section.id='price-group-'+key;section.className='price-group'
      details.append(summary,section);el('price-fields').append(details)
    }
    section.append(label)
    return input
  })
  function fillPrices() {
    prices.forEach((input,i)=>{input.value=getState().prices[i]})
    el('hourglass-days').value=getState().hourglassDays
    el('price-status').textContent=''
  }
  el('price-default').onclick=()=>{prices.forEach((input,i)=>{input.value=defaultPrices[i]});el('hourglass-days').value=1;el('price-status').textContent='默认价格已填入，点保存后生效。'}
  el('price-save').onclick=()=>{
    const values=prices.map(input=>input.valueAsNumber)
    const days=el('hourglass-days').valueAsNumber
    if (!Number.isInteger(days) || days<1 || days>3650) {el('price-status').textContent='沙漏天数须为 1 至 3650 的整数。';return}
    if (!values.every(validPrice)) {el('price-status').textContent='价格须为 1 至 10000000000 的整数。';return}
    readSharedChanges()
    getState().prices=values;getState().hourglassDays=days;save()
    el('price-status').textContent='物价已保存。'
  }
  const market=mountMarket(root,{getState,readSharedChanges,save,render,current,routine:schedule,
    availableRice:controls.rice,refreshPantry:controls.refreshPantry,useItem,unavailable})
  controls.openBag=market.openBag
  const claim = el('history-credit'), note = el('history-note')
  let claiming = false
  claim.onclick = async () => {
    if (claiming) return
    claiming = true
    claim.disabled = true
    try {
      const res = await fetch('/__dim-womb/api/billing-reward',{cache:'no-store'})
      if (!res.ok) throw Error('missing')
      const {cents}=await res.json()
      if (!Number.isSafeInteger(cents) || cents<=0) { note.textContent='暂无可兑换金额。';return }
      const apply = () => {
        readSharedChanges()
        const state=getState()
        if (state.historyGrant) return
        state.historyGrant={cents,tokens:grantForCents(cents)}
        state.tokenPool=Math.min(Number.MAX_SAFE_INTEGER,state.tokenPool+state.historyGrant.tokens)
        save()
      }
      if (navigator.locks) await navigator.locks.request('dsh-whale-school-purchase',apply)
      else apply()
    } catch {note.textContent='未找到可用的人民币账单汇总，可在费用统计更新后再试。'}
    finally {claiming=false;render()}
  }
  function current() { return getState().whales.find(w => w.id === select.value) }
  function unavailable(i,w){
    if(!w)return '请选择使用对象'
    const item=catalog[i]
    if(item.kind==='rice'){
      if(w.stage!==0)return '仅限幼鲸'
      return controls.rice()>0?'':'白饭已投出'
    }
    if(item.kind==='clock')return w.stage===4?'已成年':''
    if(w.stage===0)return '从 Q 版小人阶段开始'
    const today=schedule(w)
    if(item.kind==='gift')return w.lastGiftDay===today.day?'今天已吃心情料理':mood(w)>=100?'心情已满':''
    if(item.kind==='energy')return w.lastEnergyFoodDay===today.day?'今天已吃体力料理':today.energy>=today.max?'体力已满':''
    if(w.diploma)return '已毕业'
    if(resting(w))return '心情低落，正在休息'
    if(today.used>=dailyUses)return '今日教材已用完'
    if(today.energy<sessionEnergy(w,item))return '体力不足'
    if(item.effects.every(([a])=>a>=3 && talents(w)[a-3]>=100))return '属性已满'
    return ''
  }
  function useItem(i,id){
    const state=getState(),w=state.whales.find(resident=>resident.id===id)
    const item=catalog[i],name=item.name
    if(w)updateStage(w,Date.now())
    const reason=unavailable(i,w)
    if(reason)return reason
    if(item.kind==='rice')return controls.feed(id)?w.name+'吃了 1 份幼鲸白饭。':'没有可投喂的白饭。'
    if(!(state.schoolBag[i]>0))return '这件物品已用完。'
    const today=schedule(w)
    state.schoolBag[i]--
    if(item.kind==='gift' || item.kind==='energy'){
      const before=item.kind==='gift'?mood(w):today.energy
      let after,label
      if(item.kind==='gift'){
        changeMood(w,item.cheer);w.lastGiftDay=today.day
        after=mood(w);label='心情'
      }else{
        today.energy=Math.min(today.max,today.energy+item.restore);w.lastEnergyFoodDay=today.day
        after=today.energy;label='体力'
      }
      w.routine={day:today.day,used:today.used,energy:today.energy}
      w.snacksEaten=(w.snacksEaten||0)+1
      save();return w.name+'吃了'+name+'，'+label+' '+before+' → '+after+'。'
    }
    if(item.kind==='clock'){
      w.bonusDays=(Number(w.bonusDays)||0)+state.hourglassDays
      const event=updateStage(w,Date.now(),true)
      save();return w.name+'使用了时光沙漏，成长日龄 +'+state.hourglassDays+' 天。'+event
    }
    const stats=scores(w),energy=sessionEnergy(w,item)
    const specialties=talents(w).slice(), report=[]
    w.learning ||= [...stats]
    for(const [a,base] of item.effects){
      const points=learningGain(w,a,base),values=a<3?stats:specialties,index=a<3?a:a-3
      const before=values[index]
      values[index]=Math.min(100,rounded(before+points))
      if(a<3)w.learning[a]=rounded(w.learning[a]+points)
      report.push(attributes[a]+' +'+rounded(values[index]-before))
    }
    w.study=stats;w.talents=specialties
    const feeling=lessonFeeling(w,item);if(feeling)changeMood(w,feeling)
    w.routine={day:today.day,used:today.used+1,energy:today.energy-energy}
    let change=''
    if(w.routine.energy===1){w.routine.energy=0;change=' 最后 1 点体力用于整理教材。'}
    if(w.routine.used>=dailyUses || w.routine.energy<2){
      w.practiceDays=(w.practiceDays||0)+1
      w.routine=schedule(w)
      change+=' 已休息，进入下一天。'+updateStage(w,Date.now(),true)
    }
    save()
    return w.name+'使用了'+name+'，'+report.join('、')+'。'+change
  }
  function render() {
    const state = getState()
    el('academy-tab').hidden = false
    home.refreshDetails()
    const active=!el('view-academy').classList.contains('hidden')
    if (!active && !market.isOpen()) return
    if(active)home.render()
    const roster = state.whales
    const key = JSON.stringify(roster.map(w => [w.id,w.name]))
    if (key !== rosterKey) {
      const last = select.value
      select.replaceChildren(new Option('选择住民',''),...roster.map(w => new Option(w.name,w.id)))
      if (roster.some(w => w.id===last)) select.value = last
      rosterKey = key
    }
    const w = current()
    const stats = w ? scores(w) : [0,0,0]
    claim.disabled = claiming || Boolean(state.historyGrant)
    if (state.historyGrant) note.textContent='已领取 · ¥'+(state.historyGrant.cents/100).toFixed(2)+' → '+state.historyGrant.tokens.toLocaleString()+' 游戏 Token'
    else if (!note.textContent) note.textContent='按 10 元折合 1 亿游戏 Token 估算，每份档案可领取一次。'
    el('academy-wallet').textContent = Math.floor(state.tokenPool).toLocaleString() + ' Token 可用'
    el('academy-status').textContent = !w ? '共用库存' : w.diploma ? '毕业成绩 · '+w.diploma.rank+' 级' : ['幼鲸 · 成长中','Q 版小人 · 启蒙','少女 · 研习','少女 · 研习','成女 · 往届补修'][w.stage]
    el('academy-stats').textContent = !w ? '选择一位住民即可查看她能使用的物品。' : subjects.map((name,i) => name+' '+stats[i]+'/100').join('　')
    if (w && !w.form) el('academy-stats').textContent += '　成长日龄 '+ageDays(w)+' 天'
    const today=w?schedule(w):null
    el('academy-day').textContent=w && w.stage>=1 && !w.diploma?'第 '+today.day+' 个成长日 · 体力 '+today.energy+'/'+today.max+' · 心情 '+mood(w)+'/100 · 今日还可使用 '+(dailyUses-today.used)+' 份教材':''
    el('academy-likes').textContent=w && state.showPreferences?preferenceText(w):''
    if(w && w.stage>=1 && resting(w))el('academy-day').textContent='心情 '+mood(w)+'/100 · 正在休息。可吃心情料理，或等自然恢复。'

    el('store-wallet').textContent=el('academy-wallet').textContent
    market.refresh()
    el('academy-graduate').hidden = !w || w.stage!==4 || Boolean(w.diploma)
    const grads = state.whales.filter(w => w.diploma).sort((a,b) => b.diploma.total-a.diploma.total)
    const rows = grads.map(g => (g.diploma.total===grads[0].diploma.total?'最高 · ':'') + g.name + '　' + g.diploma.rank + ' 级 · ' + g.diploma.total + ' 分')
    if (!rows.length) rows.push('尚无毕业成绩')
    if (JSON.stringify(rows)!==boardKey) {
      boardKey = JSON.stringify(rows)
      el('academy-board').replaceChildren(...rows.map(text => {const li=document.createElement('li');li.textContent=text;return li}))
    }
  }
  select.onchange = () => {el('academy-feedback').textContent='';render()}
  el('academy-graduate').onclick = () => {
    const w = current()
    if (!w || w.stage!==4 || w.diploma || !confirm('以当前成绩完成补修？结业后成绩将固定。')) return
    w.adultRoute=routeIndex(w)
    w.diploma = grade(w)
    save()
    render()
  }
  return {render,fillPrices,home}
}

