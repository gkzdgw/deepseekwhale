import {catalog,attributes,priceText} from './catalog.js'
import {mood,learningGain,sessionEnergy} from './wellbeing.js'

const categories=['全部','幼鲸白饭','心情料理','体力料理','教材','时光沙漏',...attributes]
const groups={rice:'幼鲸白饭',gift:'心情料理',energy:'体力料理',clock:'时光沙漏'}
function matches(item,category,tier){
  return (!tier || item.tier===tier) && (category==='全部' || category===(groups[item.kind]||'教材') ||
    item.effects.some(([a])=>attributes[a]===category))
}
function paintIcon(icon,item){
  icon.setAttribute('aria-hidden','true')
  if(item.kind==='rice'){
    icon.className='nursery-rice-icon'
    return
  }
  const symbols={gift:['☕','🍡','🍮','🥛','🍑','🧀','🍥','🫐','🍰'],energy:['🍙','🥚','🥟','🍲','🍛','🍣','🍝','🥘','🍱']}
  if(symbols[item.kind]){
    icon.className='rice-icon'
    icon.textContent=item.tier?symbols[item.kind][item.tier-1]:symbols[item.kind]
    return
  }
  icon.className='school-icon'
  if(item.kind==='clock'){
    icon.style.backgroundImage="url('/__dim-womb/outfits/hourglass.png')"
    icon.style.backgroundSize='contain'
    return
  }
  const attr=item.effects[0][0]
  if(attr<3){icon.style.backgroundPosition=attr*50+'% '+(item.tier%2?0:50)+'%';return}
  const tile=(attr-3)*2+Number(item.tier>1)
  icon.style.backgroundImage="url('/__dim-womb/outfits/specialties.png')"
  icon.style.backgroundSize='400% 300%'
  icon.style.backgroundPosition=(tile%4*100/3)+'% '+Math.floor(tile/4)*50+'%'
}
function describe(item,state,w,routine){
  switch(item.kind){
    case 'rice':return '仅限幼鲸 · 白饭成长进度 +1 份'
    case 'clock':return '成长日龄 +'+state.hourglassDays+' 天'
    case 'gift':return '第二阶段起 · 心情 +'+item.cheer+(w?.stage>=1?'（当前 '+mood(w)+' → '+Math.min(100,mood(w)+item.cheer)+'）':'')
    case 'energy':{
      const day=w?.stage>=1?routine(w):null
      return '第二阶段起 · 体力 +'+item.restore+(day?'（当前 '+day.energy+' → '+Math.min(day.max,day.energy+item.restore)+'）':'')
    }
    default:{
      const show=w && state.showPreferences
      const stats=item.effects.map(([a,v])=>attributes[a]+' +'+(show?learningGain(w,a,v):v))
      return (show?'预计':'基础')+' '+stats.join(' · ')+' / '+(show?sessionEnergy(w,item):item.energy)+' 体力'
    }
  }
}

export function mountMarket(root,{getState,readSharedChanges,save,render,current,routine,availableRice,refreshPantry,useItem,unavailable}){
  const el=id=>root.getElementById(id)
  const shop=el('school-store'),bag=el('school-bag'),quantity=el('store-quantity')
  root.querySelector('.app').append(shop,bag)
  const owned=(state,i)=>catalog[i].kind==='rice'?state.riceStock:state.schoolBag[i]||0
  function transact(action){
    const run=()=>{readSharedChanges();action();render()}
    if(navigator.locks)return navigator.locks.request('dsh-whale-school-purchase',run)
    run()
  }
  function buyReason(state,i,n){
    if(!Number.isSafeInteger(n)||n<1||n>9999)return '数量须为 1–9999 的整数'
    if(!Number.isSafeInteger(owned(state,i)+n)||(catalog[i].kind==='rice' && state.riceStock+n>9999))return '库存容量不足'
    return state.prices[i]*n>state.tokenPool?'余额不足':''
  }
  function buy(i,n){
    const s=getState(),reason=buyReason(s,i,n)
    if(reason)return reason
    s.tokenPool-=s.prices[i]*n
    if(catalog[i].kind==='rice'){s.riceStock+=n;s.riceFed=(s.riceFed||0)+n}
    else s.schoolBag[i]=owned(s,i)+n
    save()
    if(catalog[i].kind==='rice')refreshPantry()
    return '已购入 '+catalog[i].name+' × '+n+'，共 '+priceText(s.prices[i]*n)+' Token。'
  }
  function buildCards(container,isBag){
    return catalog.map((item,i)=>{
      const card=document.createElement('article'),icon=document.createElement('i'),rank=document.createElement('span')
      const name=document.createElement('strong'),effect=document.createElement('small'),count=document.createElement('b'),button=document.createElement('button')
      rank.className='item-rank';rank.textContent=item.tier?'第 '+item.tier+' 档':'补给'
      paintIcon(icon,item);name.textContent=item.name
      button.type='button';button.className='btn';button.dataset.item=i
      button.onclick=()=>{
        const id=current()?.id,n=quantity.valueAsNumber
        transact(()=>{
          const feedback=isBag?useItem(i,id):buy(i,n)
          el(isBag?'academy-feedback':'store-feedback').textContent=feedback
        })
      }
      card.style.order=item.tier||0
      card.append(icon,rank,name,effect,count,button);container.append(card)
      return {card,effect,count,button}
    })
  }
  const views=[['store',shop,el('academy-shop')],['bag',bag,el('bag-items')]]
  const grids={}
  for(const [prefix,dialog] of views){
    for(const category of categories)el(prefix+'-attribute').add(new Option(category,category))
    const tier=el(prefix+'-tier')
    tier.add(new Option('全部档位','0'))
    for(let n=1;n<=9;n++)tier.add(new Option('第 '+n+' 档',String(n)))
    el(prefix+'-attribute').onchange=tier.onchange=render
    el(prefix+'-close').onclick=()=>dialog.close()
  }
  const riceItem=catalog.findIndex(item=>item.kind==='rice')
  const riceQuantity=el('rice-quantity')
  riceQuantity.oninput=refreshPantry
  el('buy-rice').onclick=()=>{
    const n=riceQuantity.valueAsNumber
    transact(()=>{el('meal-feedback').textContent=buy(riceItem,n)})
  }
  quantity.oninput=render
  for(const kiosk of root.querySelectorAll('[data-shop]'))kiosk.onclick=e=>{
    e.stopPropagation();readSharedChanges()
    el('store-attribute').value='全部';el('store-tier').value='0';el('store-feedback').textContent=''
    quantity.value='1';shop.showModal();render()
  }
  function openBag(id){
    readSharedChanges()
    if(shop.open)shop.close()
    el('bag-attribute').value='全部';el('bag-tier').value='0';el('academy-feedback').textContent=''
    bag.showModal();render()
    el('academy-student').value=id||'';render();bag.scrollTop=0
  }
  el('store-bag').onclick=()=>openBag()
  for(const btn of root.querySelectorAll('[data-bag]'))btn.onclick=()=>openBag()
  const snapshots={}
  function refresh(){
    const s=getState(),w=current()
    for(const [prefix,dialog,container] of views){
      if(!dialog.open)continue
      const isBag=dialog===bag,category=el(prefix+'-attribute').value,tier=Number(el(prefix+'-tier').value),n=quantity.valueAsNumber
      const cards=grids[prefix] ||= buildCards(container,isBag)
      const today=w?routine(w):null
      const key=JSON.stringify([category,tier,n,s.tokenPool,s.prices,s.schoolBag,s.riceStock,availableRice(),s.hourglassDays,isBag&&[w,w&&mood(w),today,s.showPreferences]])
      if(snapshots[prefix]===key)continue
      snapshots[prefix]=key
      let shown=0,kinds=0,units=0
      cards.forEach(({card,effect,count,button},i)=>{
        const item=catalog[i],stock=owned(s,i)
        if(stock){kinds++;units+=stock}
        card.hidden=!matches(item,category,tier) || (isBag && stock<=0)
        if(card.hidden)return
        shown++
        effect.textContent=describe(item,s,isBag?w:null,routine)
        if(isBag){
          const reason=unavailable(i,w)
          count.textContent='× '+stock.toLocaleString();count.setAttribute('aria-label','持有 '+stock+' 份')
          button.hidden=!w
          button.disabled=Boolean(reason);button.textContent=reason||'使用 1 份'
        }else{
          const reason=buyReason(s,i,n)
          count.textContent=priceText(s.prices[i])+' Token / 份'
          button.disabled=Boolean(reason);button.textContent=reason||'买 '+n+' 份 · '+priceText(s.prices[i]*n)+' Token'
        }
      })
      if(isBag){
        el('bag-resident').hidden=!w
        el('bag-summary').textContent=kinds+' 种物品 · 共 '+units.toLocaleString()+' 份'
        el('bag-empty').textContent=kinds?'此分类下没有库存。':'背包还是空的。到地图上的学堂商店购买物品。'
      }
      el(prefix+'-empty').hidden=shown>0
    }
  }
  return {openBag,refresh,isOpen:()=>shop.open||bag.open}
}
