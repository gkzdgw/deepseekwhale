import {preferenceText,mood,resting,energyLimit,changeMood,lessonFeeling,sessionEnergy,learningGain,rounded} from './wellbeing.js'
import {catalog,attributes,defaultPrices} from './catalog.js'
export {defaultPrices} from './catalog.js'
import {mountMarket,choiceGroup} from './market.js'
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
function schedule(w) {
  const day=localDay(),max=energyLimit(w)
  const r=w.routine?.day===day?w.routine:{day,energy:max,used:0}
  const energy=Math.min(r.energy,max)
  return {...r,energy,max,closed:r.used>=dailyUses || energy<2}
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
    if(!w||w.stage!==0||!w.meals||resting(w))return
    const today=schedule(w)
    if(today.closed)return
    w.routine={day:today.day,used:today.used+1,energy:today.energy-2}
    if(schedule(w).closed){w.practiceDays=(w.practiceDays||0)+1;updateStage(w,Date.now(),true)}
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
    input.type='number';input.min='1';input.max='10000000000';input.step='1'
    input.id='shop-price-'+i
    label.append(name,input)
    const group=priceGroups[catalog[i].tier||0]
    if(catalog[i].kind==='rice')group.prepend(label)
    else group.append(label)
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
    availableRice:controls.rice,refreshPantry:controls.refreshPantry,useItem,unavailable,residentId:home.selectedId,student})
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
      if (!res.ok) throw Error('missing')
      const {cents}=await res.json()
      if (!Number.isSafeInteger(cents) || cents<=0) { note.textContent='暂无可兑换金额。';return }
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
    if(today.closed)return '今日已休息 · 明日 0 点恢复'
    if(item.kind==='gift')return w.lastGiftDay===today.day?'今天已吃心情料理':mood(w)>=100?'心情已满':''
    if(item.kind==='energy')return w.lastEnergyFoodDay===today.day?'今天已吃体力料理':today.energy>=today.max?'体力已满':''
    if(w.diploma)return '已毕业'
    if(resting(w))return '心情低落，正在休息'
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
    if(schedule(w).closed){
      w.practiceDays=(w.practiceDays||0)+1
      change=' 学堂成长 +1 天。今天的学习已结束，明日 0 点恢复。'+updateStage(w,Date.now(),true)
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
    if (!state.historyGrant && !note.textContent) note.textContent='按 10 元折合 1 亿游戏 Token 估算，每份档案可领取一次。'
    el('academy-wallet').textContent = Math.floor(state.tokenPool).toLocaleString('zh-CN') + ' Token 可用'
    el('academy-status').textContent = !w ? '共用库存' : w.diploma ? '毕业成绩 · '+w.diploma.rank+' 级' : ['幼鲸 · 成长中','Q 版小人 · 启蒙','少女 · 研习','少女 · 研习','成女 · 往届补修'][w.stage]
    el('academy-stats').textContent = !w ? '选择一位住民即可查看她能使用的物品。' : subjects.map((name,i) => name+' '+stats[i]+'/100').join('　')
    if (w && !w.form) el('academy-stats').textContent += '　成长日龄 '+ageDays(w)+' 天'
    const today=w?schedule(w):null
    el('academy-day').textContent=w && w.stage>=1 && !w.diploma?'第 '+(ageDays(w)+1)+' 个成长日 · 体力 '+today.energy+'/'+today.max+' · 心情 '+mood(w)+'/100 · 今日还可使用 '+(today.closed?0:dailyUses-today.used)+' 份教材':''
    el('academy-likes').textContent=w && state.showPreferences?preferenceText(w):''
    if(w && today.closed)el('academy-day').textContent='今日已休息，明日 0 点恢复学习和进食。'
    else if(w && w.stage>=1 && resting(w))el('academy-day').textContent='心情 '+mood(w)+'/100 · 正在休息。可吃心情料理，或等自然恢复。'

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

