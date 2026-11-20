import {catalog,attributes,priceText} from './catalog.js'
import {mood,learningGain,sessionEnergy} from './wellbeing.js'

const categories=['全部','幼鲸白饭','心情料理','体力料理','教材','时光沙漏',...attributes]
const groups={rice:'幼鲸白饭',gift:'心情料理',energy:'体力料理',clock:'时光沙漏'}
const itemCategories=new Map(catalog.map(item=>[item,[groups[item.kind]||'教材',...item.effects.map(([a])=>attributes[a])]]))
function matches(item,category,tier){
  return (!tier || item.tier===tier) && (category==='全部' || itemCategories.get(item).includes(category))
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
    case 'clock':return '当前地图全体恢复体力与行动次数 · 成长期 +'+state.hourglassDays+' 天'
    case 'gift':return '第二阶段起 · 心情 +'+item.cheer+(w?.stage>=1?'（当前 '+mood(w)+' → '+Math.min(100,mood(w)+item.cheer)+'）':'')
    case 'energy':{
      const day=w?.stage>=1?routine(w):null
      return '第二阶段起 · 体力 +'+item.restore+(day?'（当前 '+day.energy+' → '+Math.min(day.max,day.energy+item.restore)+'）':'')
    }
    default:{
      const show=w && state.showPreferences
      const stats=item.effects.map(([a,v])=>attributes[a]+' +'+(show?learningGain(w,a,v):v))
      return (show?'预计':'基础')+' '+stats.join(' · ')+' · 消耗'+(w?sessionEnergy(w,item):item.energy)+'点体力'
    }
  }
}

// Native radio groups support pointer, Tab and arrow-key selection.
export function choiceGroup(group,onChange){
  group.onchange=onChange
  return {
    get value(){return group.querySelector('input:checked')?.value ?? ''},
    set value(value){
      for(const input of group.querySelectorAll('input'))input.checked=input.value===value
    },
    showAvailable(values,all){
      if(!values.has(this.value))this.value=all
      for(const input of group.querySelectorAll('input')){
        input.parentElement.hidden=input.value!==all && !values.has(input.value)
      }
      group.closest('.filter-row').hidden=values.size===0
    },
    populate(options,selected){
      const fragment=document.createDocumentFragment()
      for(const [value,text] of options){
        const label=document.createElement('label'),input=document.createElement('input'),caption=document.createElement('span')
        input.type='radio';input.name=group.id;input.value=value;input.checked=value===selected
        caption.textContent=text;label.append(input,caption);fragment.append(label)
      }
      group.replaceChildren(fragment)
    }
  }
}

export function mountMarket(root,{getState,readSharedChanges,save,render,current,routine,availableRice,refreshPantry,clockScope,useItem,unavailable,residentId,student}){
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
  function buildCards(container,prefix){
    return catalog.map((item,i)=>{
      const card=document.createElement('article'),icon=document.createElement('i'),rank=document.createElement('span')
      const name=document.createElement('strong'),effect=document.createElement('small'),count=document.createElement('b'),button=document.createElement('button')
      rank.className='item-rank';rank.textContent=item.tier?'第 '+item.tier+' 档':'补给'
      paintIcon(icon,item);name.textContent=item.name
      button.type='button';button.className='btn';button.dataset.item=i
      button.onclick=()=>{
        const id=prefix==='room'?residentId():current()?.id,n=quantity.valueAsNumber
        const map=item.kind==='clock' && prefix!=='store'?clockScope().name:null
        transact(()=>{
          const feedback=prefix==='store'?buy(i,n):useItem(i,id,map)
          el(prefix==='bag'?'academy-feedback':prefix+'-feedback').textContent=feedback
        })
      }
      card.style.order=item.tier||0
      card.append(icon,rank,name,effect,count,button);container.append(card)
      return {card,effect,count,button}
    })
  }
  const views=[['store',shop,el('academy-shop')],['bag',bag,el('bag-items')],['room',el('resident-sheet'),el('room-items')]]
  const grids={},filters={}
  const categoryChoices=categories.map(c=>[c,c==='全部'?'全部分类':c])
  const tierChoices=[['0','全部档位'],...Array.from({length:9},(_,i)=>[String(i+1),String(i+1)+' 档'])]
  for(const [prefix,dialog] of views){
    const category=choiceGroup(el(prefix+'-attribute'),refresh),tier=choiceGroup(el(prefix+'-tier'),refresh)
    category.populate(categoryChoices,'全部');tier.populate(tierChoices,'0')
    filters[prefix]={category,tier}
    if(prefix!=='room')el(prefix+'-close').onclick=()=>dialog.close()
  }
  const riceItem=catalog.findIndex(item=>item.kind==='rice')
  const riceQuantity=el('rice-quantity')
  riceQuantity.oninput=refreshPantry
  el('buy-rice').onclick=()=>{
    const n=riceQuantity.valueAsNumber
    transact(()=>{el('meal-feedback').textContent=buy(riceItem,n)})
  }
  const clockItem=catalog.findIndex(item=>item.kind==='clock')
  const clockQuantity=el('clock-quantity'),clockButton=el('buy-clock'),clockUse=el('use-clock'),clockFeedback=el('clock-feedback')
  function refreshClock(scope){
    const s=getState(),n=clockQuantity.valueAsNumber,price=s.prices[clockItem]
    const reason=buyReason(s,clockItem,n)
    el('clock-stock').textContent='持有 '+owned(s,clockItem).toLocaleString()+' 个 · '+priceText(price)+' Token / 个'
    clockUse.disabled=!owned(s,clockItem)||Boolean(scope.reason)
    clockUse.textContent='对'+scope.name+'使用 1 个'
    clockUse.title=scope.reason||('影响当前地图全部 '+scope.residents.length+' 位住民')
    clockButton.disabled=Boolean(reason)
    clockButton.textContent=reason||'购买 · '+priceText(price*n)+' Token'
  }
  clockQuantity.oninput=()=>{clockFeedback.textContent='';refreshClock(clockScope())}
  clockButton.onclick=()=>{
    const n=clockQuantity.valueAsNumber
    transact(()=>{clockFeedback.textContent=buy(clockItem,n)})
  }
  clockUse.onclick=()=>{
    const map=clockScope().name
    transact(()=>{clockFeedback.textContent=useItem(clockItem,null,map)})
  }
  quantity.oninput=render
  for(const kiosk of root.querySelectorAll('[data-shop]'))kiosk.onclick=e=>{
    e.stopPropagation();readSharedChanges()
    filters.store.category.value='全部';filters.store.tier.value='0';el('store-feedback').textContent=''
    quantity.value='1';shop.showModal();render()
  }
  function openBag(id){
    readSharedChanges()
    if(shop.open)shop.close()
    filters.bag.category.value='全部';filters.bag.tier.value='0';el('academy-feedback').textContent=''
    bag.showModal();render()
    student.value=id||'';render();bag.scrollTop=0
  }
  el('store-bag').onclick=()=>openBag()
  for(const btn of root.querySelectorAll('[data-bag]'))btn.onclick=()=>openBag()
  const search=el('room-search'),usable=el('room-usable')
  search.oninput=render
  usable.onchange=render
  function showResidentItems(){
    search.value='';usable.checked=false;filters.room.category.value='全部';filters.room.tier.value='0'
    el('room-feedback').textContent='';el('room-items').scrollTop=0
    refresh()
  }
  const snapshots={}
  function refresh(){
    const s=getState()
    const scope=clockScope()
    refreshClock(scope)
    for(const [prefix,dialog,container] of views){
      if(!dialog.open)continue
      const isBag=prefix!=='store',inline=prefix==='room'
      const w=inline?s.whales.find(whale=>whale.id===residentId()):current()
      const query=inline?search.value.trim().toLowerCase():'',onlyUsable=inline && usable.checked
      const filter=filters[prefix],n=quantity.valueAsNumber
      const cards=grids[prefix] ||= buildCards(container,prefix)
      const today=w?routine(w):null
      const key=JSON.stringify([filter.category.value,filter.tier.value,n,query,onlyUsable,scope.name,scope.reason,s.tokenPool,s.prices,s.schoolBag,s.riceStock,availableRice(),s.hourglassDays,isBag&&[w,w&&mood(w),today,s.showPreferences]])
      if(snapshots[prefix]===key)continue
      snapshots[prefix]=key
      if(isBag){
        const stock=catalog.filter((_,i)=>owned(s,i)>0)
        filter.category.showAvailable(new Set(stock.flatMap(item=>itemCategories.get(item))),'全部')
        const selected=filter.category.value
        const tiers=stock.filter(item=>item.tier && matches(item,selected,0)).map(item=>String(item.tier))
        filter.tier.showAvailable(new Set(tiers),'0')
      }
      const category=filter.category.value,tier=Number(filter.tier.value)
      let shown=0,kinds=0,units=0
      cards.forEach(({card,effect,count,button},i)=>{
        const item=catalog[i],stock=owned(s,i)
        if(stock){kinds++;units+=stock}
        const reason=isBag && stock?unavailable(i,w):''
        card.hidden=!matches(item,category,tier) || (isBag && stock<=0) ||
          (query && !item.name.toLowerCase().includes(query)) || (onlyUsable && Boolean(reason))
        if(card.hidden)return
        shown++
        effect.textContent=describe(item,s,isBag?w:null,routine)
        if(isBag){
          count.textContent='× '+stock.toLocaleString();count.setAttribute('aria-label','持有 '+stock+' 份')
          button.hidden=!w && item.kind!=='clock'
          button.disabled=Boolean(reason);button.textContent=reason||(item.kind==='clock'?'对'+scope.name+'使用 1 个':'使用 1 份')
        }else{
          const reason=buyReason(s,i,n)
          count.textContent=priceText(s.prices[i])+' Token / 份'
          button.disabled=Boolean(reason);button.textContent=reason||'买 '+n+' 份 · '+priceText(s.prices[i]*n)+' Token'
        }
      })
      if(isBag){
        if(!inline)el('bag-resident').hidden=!w
        el(prefix+'-summary').textContent=kinds+' 种物品 · 共 '+units.toLocaleString()+' 份'
        el(prefix+'-empty').textContent=kinds?'没有符合当前筛选的物品。':'背包还是空的。到地图上的学堂商店购买物品。'
      }
      el(prefix+'-empty').hidden=shown>0
    }
  }
  return {showResidentItems,refresh,isOpen:()=>views.some(([,dialog])=>dialog.open)}
}
