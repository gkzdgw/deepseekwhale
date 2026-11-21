import {preferenceText,mood,resting,energyLimit,changeMood,lessonFeeling,sessionEnergy,learningGain,rounded} from './wellbeing.js'
import {catalog,attributes,defaultPrices,previousDefaultPrices,priceText} from './catalog.js'
export {defaultPrices} from './catalog.js'
import {mountMarket,choiceGroup} from './market.js'
import {talents} from './talents.js'
import {routeIndex,paths} from './growth-paths.js'
import {mountDropHome,ageDays} from './drop-home.js'
const subjects = ['学识','艺术','体能']
const priceNames=catalog.map(g=>g.name)
export const MAX_PRICE = 10000000000000
export const validPrice = n => Number.isSafeInteger(n) && n >= 1 && n <= MAX_PRICE
// Calibrated to one usage statement; this is a game exchange rate.
const legacyPrices=[600,1200,600,1200,600,1200,30000,800]
export function grantForCents(cents) {
  return Math.min(Number.MAX_SAFE_INTEGER, Number(BigInt(cents)*100000n))
}
export function upgradeEconomy(state) {
  if(state.economyVersion>=4)return
  const version=state.economyVersion || 0
  const old=[5000000,10000000,5000000,10000000,5000000,10000000,100000000,500000,5000000,10000000]
  state.prices=state.prices.map((p,i)=>(p===previousDefaultPrices[i] || (version<3 && p===old[i]) || (version<2 && p===legacyPrices[i]))?defaultPrices[i]:p)
  // Already granted balances stand, even when yesterday's exchange rate was more generous.
  const grant=state.historyGrant
  if (version<3 && Number.isSafeInteger(grant?.cents) && grant.cents>0 && Number.isSafeInteger(grant.tokens)) {
    const revised=grantForCents(grant.cents)
    state.tokenPool=Math.min(Number.MAX_SAFE_INTEGER,state.tokenPool+Math.max(0,revised-grant.tokens))
    grant.tokens=Math.max(grant.tokens,revised)
  }
  state.economyVersion=4
}
const dailyUses=3
// Spending an action changes stamina and the daily quota, never growth time.
export function spendStudyAction(w,today,energy){
  w.routine={day:today.day,used:today.used+1,energy:Math.max(0,today.energy-energy)}
}
export function advanceWithHourglass(w,days){
  if(w.stage>=4)return false
  w.bonusDays=(Number(w.bonusDays)||0)+days
  return true
}
function localDay(time=Date.now()){
  const date=new Date(time)
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}

// Old saves used growth age (including lessons and hourglasses) as the daily key.
export function migrateDailyRoutine(w,savedAt){
  if(![w.routine?.day,w.lastGiftDay,w.lastEnergyFoodDay].some(Number.isInteger))return
  const oldDay=ageDays(w,savedAt)+1,day=localDay(savedAt)
  if(w.routine?.day===oldDay){
    // The old automatic rollover uniquely saved a fresh routine including its max.
    if(w.practiceDays>0 && w.routine.used===0 && Number.isFinite(w.routine.max)){
      w.routine.used=dailyUses
      w.routine.energy=0
    }
    w.routine.day=day
  }
  for(const field of ['lastGiftDay','lastEnergyFoodDay']){
    if(Number.isInteger(w[field]))w[field]=w[field]===oldDay?day:null
  }
  if(Number.isInteger(w.routine?.day))delete w.routine
}
// Older saves recorded only the calendar day, even when an hourglass had just been used.
function moodMealDay(w,day){
  return w.lastHourglassDay===day ? day+'/clock' : day
}
function schedule(w) {
  const day=localDay(),max=energyLimit(w)
  const r=w.routine?.day===day?w.routine:{day,energy:max,used:0}
  const energy=Math.min(r.energy,max)
  // In 0.12.8 a spent hourglass saved a full, unused routine without a date marker.
  const legacyRest=!w.lastHourglassDay && w.bonusDays>0 && w.routine?.day===day && r.used===0 && energy===max
  const moodRest=resting(w) && w.lastHourglassDay!==day && !legacyRest
  return {...r,energy,max,moodRest,closed:r.used>=dailyUses || energy<2}
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
  const student = choiceGroup(el('academy-student'), () => {el('academy-feedback').textContent='';render()})

  controls.play=id=>{
    readSharedChanges()
    const w=getState().whales.find(w=>w.id===id)
    if(!w||w.stage!==0||!w.meals)return
    const today=schedule(w)
    if(today.closed || today.moodRest)return
    spendStudyAction(w,today,2)
    save();render()
  }
  controls.routine=schedule
  const home=mountDropHome(root,getState,priceNames,controls,render)
  const guide=el('academy-routes')
  for(const [teen,adult,study,art,fitness,meals] of paths){
    const row=document.createElement('li')
    row.textContent=teen+' → '+adult+' · '+[study,art,fitness].join(' / ')+' · 成长期加餐约 '+meals+' 份'
    guide.append(row)
  }
  let rosterKey, boardKey
  const priceGroups=[el('price-group-0')]
  const tiers=Math.max(...catalog.map(item=>item.tier||0))
  for(let tier=1;tier<=tiers;tier++){
    const details=document.createElement('details'),summary=document.createElement('summary'),group=document.createElement('div')
    summary.textContent='第 '+tier+' 档'
    group.id='price-group-'+tier;group.className='price-group'
    priceGroups.push(group);details.append(summary,group);el('price-fields').append(details)
  }
  const prices = priceNames.map((name,i) => {
    const label=document.createElement('label'), input=document.createElement('input')
    input.type='number';input.min='1';input.max=String(MAX_PRICE);input.step='1'
    input.id='shop-price-'+i
    const preview=document.createElement('small')
    input.setAttribute('aria-describedby',input.id+'-units')
    preview.id=input.id+'-units'
    input.oninput=()=>{preview.textContent=validPrice(input.valueAsNumber)?priceText(input.valueAsNumber)+' 游戏 Token':'请输入有效的整数价格'}
    label.append(name,input,preview)
    const group=priceGroups[catalog[i].tier||0]
    if(catalog[i].kind==='rice')group.prepend(label)
    else group.append(label)
    return input
  })
  function fillPrices() {
    prices.forEach((input,i)=>{input.value=getState().prices[i];input.oninput()})
    el('hourglass-days').value=getState().hourglassDays
    el('price-status').textContent=''
  }
  el('price-default').onclick=()=>{prices.forEach((input,i)=>{input.value=defaultPrices[i];input.oninput()});el('hourglass-days').value=1;el('price-status').textContent='默认价格已填入，点保存后生效。'}
  el('price-save').onclick=()=>{
    const values=prices.map(input=>input.valueAsNumber)
    const days=el('hourglass-days').valueAsNumber
    if (!Number.isInteger(days) || days<1 || days>3650) {el('price-status').textContent='沙漏天数须为 1 至 3650 的整数。';return}
    if (!values.every(validPrice)) {el('price-status').textContent='价格须为 1 至 '+MAX_PRICE+' 的整数。';return}
    readSharedChanges()
    getState().prices=values;getState().hourglassDays=days;save()
    el('price-status').textContent='物价已保存。'
  }
  const market=mountMarket(root,{getState,readSharedChanges,save,render,current,routine:schedule,
    availableRice:controls.rice,refreshPantry:controls.refreshPantry,clockScope,useItem,unavailable,residentId:home.selectedId,student})
  controls.showResidentItems=market.showResidentItems
  const claim = el('history-credit'), note = el('history-note')
  let claiming = false
  claim.onclick = async () => {
    if (claiming) return
    const archive=getState().archiveId
    claiming = true
    claim.disabled = true
    try {
      const res = await fetch('/__dim-womb/api/billing-reward',{cache:'no-store'})
      if (!res.ok) {
        note.textContent = res.status===422 ? await res.text() : res.status===404 ? '本机未找到费用统计账本，请先导入或记录费用。' : '读取本机账单失败（HTTP '+res.status+'），请确认 DSH 已连接。'
        return
      }
      const {cents,estimatedDays,exchangeRate}=await res.json()
      if (!Number.isSafeInteger(cents) || cents<=0) { note.textContent='暂无可兑换金额。';return }
      const tokens=grantForCents(cents)
      const estimate=estimatedDays ? '\n其中 '+estimatedDays+' 天为旧版美元账单，按本地汇率 '+exchangeRate+' 估算，非历史实际汇率。' : ''
      note.textContent='本机账单约 ¥'+(cents/100).toFixed(2)+'，可领取 '+priceText(tokens)+' 游戏 Token。'+(estimatedDays?'含旧账单换算估算。':'')
      if (!confirm(note.textContent+estimate+'\n账单仅在本机读取，汇总与领取记录仅保存在当前浏览器，不上传。每份档案可领取一次，确认领取？')) return
      const apply = () => {
        readSharedChanges()
        const state=getState()
        if (state.historyGrant || state.archiveId!==archive) return
        state.historyGrant={cents,tokens:grantForCents(cents)}
        state.tokenPool=Math.min(Number.MAX_SAFE_INTEGER,state.tokenPool+state.historyGrant.tokens)
        save()
      }
      if (navigator.locks) await navigator.locks.request('dsh-whale-school-purchase',apply)
      else apply()
    } catch {note.textContent='未找到可用的人民币账单汇总，可在费用统计更新后再试。'}
    finally {claiming=false;render()}
  }
  function current() { return getState().whales.find(w => w.id === student.value) }
  function clockScope(){
    const {name,residents}=home.currentMap()
    const canUse=residents.some(w=>{
      if(w.stage<4)return true
      const today=schedule(w)
      return today.energy<today.max || today.used>0 || (mood(w)<100 && w.lastGiftDay===moodMealDay(w,today.day))
    })
    return {name,residents,reason:canUse?'':residents.length?'成年住民当前无需恢复':'当前地图暂无住民'}
  }
  function showTimePassage(map,days){
    root.querySelector('.time-passage')?.remove()
    const notice=document.createElement('div'),icon=document.createElement('img'),caption=document.createElement('span')
    notice.className='time-passage'
    notice.setAttribute('aria-hidden','true')
    icon.src='/__dim-womb/outfits/hourglass.png';icon.alt=''
    caption.textContent=map+' · '+(days?'时光流转 +'+days+' 天':'体力已恢复')
    notice.append(icon,caption)
    const surface=root.querySelector('dialog[open]') || el('view-academy')
    surface.append(notice)
    setTimeout(()=>notice.remove(),1700)
  }
  function useClock(i,map){
    const state=getState(),scope=clockScope()
    if(map!==scope.name)return '地图已切换，请在当前地图重新使用。'
    if(scope.reason)return scope.reason
    if(!(state.schoolBag[i]>0))return '沙漏已用完'
    state.schoolBag[i]--
    const now=Date.now(),growing=scope.residents.some(w=>w.stage<4)
    for(const resident of scope.residents){
      if(advanceWithHourglass(resident,state.hourglassDays)){
        updateStage(resident,now,true,false)
      }
      resident.lastHourglassDay=localDay(now)
      resident.lastGiftDay=null
      resident.routine={day:resident.lastHourglassDay,energy:energyLimit(resident),used:0}
    }
    save()
    showTimePassage(scope.name,growing?state.hourglassDays:0)
    return scope.name+'的 '+scope.residents.length+' 位住民已恢复体力和行动次数，心情料理次数已刷新。'+(growing?'成长中的住民已推进 '+state.hourglassDays+' 天。':'')
  }
  function unavailable(i,w){
    const item=catalog[i]
    if(item.kind==='clock')return clockScope().reason
    if(!w)return '请选择使用对象'
    if(item.kind==='rice'){
      if(w.stage!==0)return '仅限幼鲸'
      return controls.rice()>0?'':'白饭已投出'
    }
    if(w.stage===0)return '从 Q 版小人阶段开始'
    const today=schedule(w)
    if(today.closed)return '今日已休息 · 明日 0 点恢复'
    if(item.kind==='gift')return w.lastGiftDay===moodMealDay(w,today.day)?'本轮已吃心情料理':mood(w)>=100?'心情已满':''
    if(item.kind==='energy')return w.lastEnergyFoodDay===today.day?'今天已吃体力料理':today.energy>=today.max?'体力已满':''
    if(w.diploma)return '已毕业'
    if(today.moodRest)return '心情低落 · 可用沙漏或心情料理'
    if(today.energy<sessionEnergy(w,item))return '需 '+sessionEnergy(w,item)+' 点体力 · 当前 '+today.energy+' 点'
    if(item.effects.every(([a])=>a>=3 && talents(w)[a-3]>=100))return '属性已满'
    return ''
  }
  function useItem(i,id,map){
    const state=getState(),w=state.whales.find(resident=>resident.id===id)
    const item=catalog[i],name=item.name
    if(item.kind==='clock')return useClock(i,map)
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
        changeMood(w,item.cheer);w.lastGiftDay=moodMealDay(w,today.day)
        after=mood(w);label='心情'
      }else{
        today.energy=Math.min(today.max,today.energy+item.restore);w.lastEnergyFoodDay=today.day
        after=today.energy;label='体力'
      }
      w.routine={day:today.day,used:today.used,energy:today.energy}
      w.snacksEaten=(w.snacksEaten||0)+1
      save();return w.name+'吃了'+name+'，'+label+' '+before+' → '+after+'。'
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
    w.lessonReaction={feeling,at:Date.now()}
    spendStudyAction(w,today,energy)
    let change=''
    if(schedule(w).closed){
      change=' 今天的学习已结束，明日 0 点恢复。学习不推进成长日期。'
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
      const last = student.value
      student.populate([['','只看库存'],...roster.map(w => [w.id,w.name])],roster.some(w=>w.id===last)?last:'')
      rosterKey = key
    }
    const w = current()
    const stats = w ? scores(w) : [0,0,0]
    claim.disabled = claiming || Boolean(state.historyGrant)
    el('history-offer').hidden=Boolean(state.historyGrant)
    if (!state.historyGrant && !note.textContent) note.textContent='按 10 元折合 1 亿游戏 Token 估算，每份档案可领取一次。仅读本机账单，领取记录保存在当前浏览器，不上传。'
    el('academy-wallet').textContent = priceText(Math.floor(state.tokenPool)) + ' 游戏 Token 可用'
    el('academy-status').textContent = !w ? '共用库存' : w.diploma ? '毕业成绩 · '+w.diploma.rank+' 级' : ['幼鲸 · 成长中','Q 版小人 · 启蒙','少女 · 研习','少女 · 研习','成女 · 往届补修'][w.stage]
    el('academy-stats').textContent = !w ? '选择一位住民即可查看她能使用的物品。' : subjects.map((name,i) => name+' '+stats[i]+'/100').join('　')
    if (w && !w.form) el('academy-stats').textContent += '　成长日龄 '+ageDays(w)+' 天'
    const today=w?schedule(w):null
    el('academy-day').textContent=w && w.stage>=1 && !w.diploma?'第 '+(ageDays(w)+1)+' 个成长日 · 体力 '+today.energy+'/'+today.max+' · 心情 '+mood(w)+'/100 · 今日还可使用 '+(today.closed?0:dailyUses-today.used)+' 份教材':''
    el('academy-likes').textContent=w && state.showPreferences?preferenceText(w):''
    if(w && today.closed)el('academy-day').textContent='今日已休息，明日 0 点恢复学习和进食。'
    else if(w && w.stage>=1 && today.moodRest)el('academy-day').textContent='心情 '+mood(w)+'/100 · 正在休息。可吃心情料理，或等自然恢复。'

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

