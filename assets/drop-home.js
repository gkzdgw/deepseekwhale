import {preferenceText,mood,resting} from './wellbeing.js'
import {origin,visit,waitingForRice,mealProgress,nurseryMeals} from './idle.js'
import {residentPortrait,routeName} from './growth-paths.js'
import {talents,talentNames} from './talents.js'
const DAY=86400000
export function extraDays(w){return (Number(w.bonusDays)||0)+(Number(w.practiceDays)||0)}
export function ageDays(w,now=Date.now()){return Math.max(0,Math.floor((now-origin(w))/DAY))+extraDays(w)}
const stages=['小鲸鱼','Q 版小人','少女','成女']
const habitats=['幼鲸水族馆','水下乐园','少女寝室','海港商街','回家探望']
const backgrounds=['map-lagoon.jpg','map-coral.jpg','map-dorm.jpg','map-city.jpg','drop-home.jpg']
const zone=w=>w.stage===4?3:Math.min(2,w.stage)
const date=ts=>new Date(ts).toLocaleDateString('zh-CN')
export function mountDropHome(root,getState,itemNames,controls){
  const el=id=>root.getElementById(id)
  const dialog=el('resident-sheet'),floor=el('room-floor')
  root.querySelector('.app').append(dialog)
  let page=0,place=2,lastKey,selected
  el('room-close').onclick=()=>dialog.close()
  el('room-prev').onclick=()=>{page--;render()}
  el('room-next').onclick=()=>{page++;render()}
  function travel(to){
    if(!to){controls.aquarium();return}
    place=to;page=0;render()
  }
  const location=w=>w.stage===4&&visit(w).visiting?4:zone(w)
  const tabs=habitats.map((name,i)=>{
    const button=document.createElement('button');button.type='button'
    button.onclick=()=>travel(i);el('room-tabs').append(button);return button
  })
  const barsGroup=name=>['学识','艺术','体能'].includes(name)?'base':['感受性','气质','魅力'].includes(name)?'social':'practice'
  const bars=['学识','艺术','体能',...talentNames].map(name=>{
    const label=document.createElement('label'),value=document.createElement('span'),meter=document.createElement('progress')
    meter.max=100;meter.setAttribute('aria-label',name)
    label.dataset.group=barsGroup(name);label.append(name,value,meter);el('room-scores').append(label);return {value,meter}
  })
  const track=stages.map(name=>{const tag=document.createElement('span');tag.textContent=name;el('room-track').append(tag);return tag})
  function details(w){
    const stage=zone(w)
    el('room-name').textContent=w.name
    el('room-style').textContent=stages[stage]+' · '+(stage<2?habitats[stage]:routeName(w))+(w.diploma?' · '+w.diploma.rank+' 级':'')
    el('room-interests').textContent=getState().showPreferences?preferenceText(w):''
    el('room-mood').value=mood(w);el('room-mood-value').textContent=mood(w)+'/100'+(resting(w)?' · 正在休息':'')
    const stamina=controls.routine(w)
    el('room-energy').max=stamina.max;el('room-energy').value=stamina.energy
    el('room-energy-value').textContent=stamina.energy+'/'+stamina.max

    el('nursery-progress').hidden=w.stage!==0
    el('nursery-count').textContent=mealProgress(w)
    el('nursery-bar').value=Math.min(w.meals||0,nurseryMeals)
    const img=el('room-portrait'),src=residentPortrait(w)
    if(img.getAttribute('src')!==src)img.src=src
    const values=[...(w.study||[0,0,0]),...talents(w)]
    bars.forEach(({value,meter},i)=>{meter.value=Number(values[i])||0;value.textContent=meter.value+'/100'})
    track.forEach((tag,i)=>{if(i===stage)tag.setAttribute('aria-current','step');else tag.removeAttribute('aria-current')})
    const age=waitingForRice(w)?Math.min(ageDays(w),getState().growth[0].days):ageDays(w)
    el('room-age').textContent='出生 '+date(w.bornAt)+' · 实际 '+Math.max(0,Math.floor((Date.now()-w.bornAt)/DAY))+' 天 · 沙漏 +'+(w.bonusDays||0)+' 天 · 学堂 +'+(w.practiceDays||0)+' 天'
    const next=getState().growth[[0,1,3,4][stage]]
    el('room-next-stage').textContent='成长日龄 '+age+' 天'+(next?' · 预计 '+date(origin(w)+(next.days-extraDays(w))*DAY)+' 进入'+stages[stage+1]:' · 已成年')
    if(waitingForRice(w))el('room-next-stage').textContent='白饭 '+mealProgress(w)+' · 再吃 '+(nurseryMeals-w.meals)+' 份就长成 Q 版鲸鱼娘。'
    const info=visit(w)
    el('room-visit').textContent=w.stage===4?'于 '+date(info.left)+' 搬到海港商街 · '+(info.visiting?'今天在家，'+date(info.until)+' 返回商街':'下次回家 '+date(info.next)):((getState().idleMode?'放置养成开启':'手动培养')+' · 已完成 '+(w.idleLessons||0)+' 次自主学习')
    const routine=controls.routine(w)
    el('room-play').hidden=w.stage!==0
    el('room-play').disabled=!w.meals||resting(w)
    el('room-play').textContent='嬉水 · 2 体力（剩余 '+routine.energy+'/'+routine.max+'）'
    const records=Object.entries(w.milestones||{}).filter(([i])=>Number(i)!==3).map(([i,ts])=>date(ts)+' '+stages[zone({stage:Number(i)})])
    el('room-record').textContent=records.join(' / ')
    const stock=controls.rice()
    el('room-feed').hidden=w.stage!==0
    el('room-feed').disabled=w.stage!==0 || stock<1
    el('room-feed').textContent='投喂白饭 · 库存 '+stock
  }
  function open(id){
    const w=getState().whales.find(r=>r.id===id)
    if(!w)return
    selected=id;details(w)
    if(!dialog.open)dialog.showModal()
  }
  function refreshDetails(){
    if(!dialog.open)return
    const w=getState().whales.find(r=>r.id===selected)
    if(w)details(w);else dialog.close()
  }
  el('room-play').onclick=()=>{const id=selected;const play=()=>{controls.play(id);refreshDetails()};if(navigator.locks)navigator.locks.request('dsh-whale-school-purchase',play);else play()}
  el('room-bag').onclick=()=>controls.openBag(selected)
  el('room-feed').onclick=()=>{
    const id=selected,feed=()=>{controls.feed(id);refreshDetails()}
    if(navigator.locks)navigator.locks.request('dsh-whale-school-purchase',feed);else feed()
  }
  function render(){
    const all=getState().whales,roster=all.filter(w=>location(w)===place)
    const pages=Math.max(1,Math.ceil(roster.length/4))
    page=Math.min(pages-1,Math.max(0,page))
    const group=roster.slice(page*4,page*4+4)
    const counts=[0,0,0,0,0];all.forEach(w=>counts[location(w)]++)
    const key=JSON.stringify([place,page,counts,group.map(w=>[w.id,w.name,residentPortrait(w)])])
    if(key===lastKey)return
    lastKey=key
    tabs.forEach((button,i)=>{button.textContent=habitats[i]+' · '+counts[i];button.setAttribute('aria-pressed',String(i===place))})
    floor.style.backgroundImage="url('/__dim-womb/outfits/"+backgrounds[place]+"')"
    el('room-page').textContent=(page+1)+' / '+pages
    el('room-prev').disabled=!page;el('room-next').disabled=page===pages-1
    el('room-hint').textContent=roster.length?'点击住民查看成长档案。':place===4?'今天没有回家探望的住民。成女每 7 天回家住 1 天。':habitats[place]+'暂时没有住民。进入'+stages[place]+'阶段后会自动入住。'
    floor.replaceChildren(...group.map((w,i)=>{
      const b=document.createElement('button'),img=document.createElement('img'),name=document.createElement('span')
      b.type='button';b.className='room-person';b.dataset.zone=place
      b.style.left=(Math.round((i+.5)*100/group.length)-9)+'%';b.style.setProperty('--delay',(-2*i)+'s')
      img.src=residentPortrait(w);img.alt='';name.textContent=w.name;b.append(img,name)
      b.onclick=()=>open(w.id);return b
    }))
  }
  return {render,travel,open,refreshDetails}
}
