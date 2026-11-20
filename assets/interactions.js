import {ensureTrait} from './growth-paths.js'
import {mood} from './wellbeing.js'

const cues={
  happy:['😊','心情好'],quiet:['😌','平静'],sad:['😔','情绪低落'],sleepy:['😴','疲倦'],hungry:['🍚','想吃白饭'],
  liked:['🤩','喜欢这堂课'],neutral:['🤔','正在消化课程'],disliked:['😣','不喜欢这堂课'],weary:['😖','累了，想休息'],
  close:['🥰','亲近'],shy:['😳','害羞'],curious:['🧐','好奇'],playful:['😆','开心'],snack:['😋','满足']
}
const petByTrait={安静:'quiet',好奇:'curious',黏人:'close',贪吃:'snack',爱睡:'quiet',爱闹:'playful',怕生:'shy',慢热:'shy',爱干净:'happy'}
function condition(w,day){
  if(day.closed || day.energy/day.max<.5)return 'sleepy'
  if(mood(w)<=30)return 'sad'
  if(w.stage===0 && (w.satiety??40)<30)return 'hungry'
  return mood(w)>=65?'happy':'quiet'
}
export function residentCue(w,day,pet=false){
  const state=condition(w,day)
  if(pet){
    if(state==='sleepy')return 'weary'
    if(state==='sad' || state==='hungry')return state
    return petByTrait[ensureTrait(w)]
  }
  const lesson=w.lessonReaction,age=Date.now()-lesson?.at
  if(age>=0 && age<12000)return lesson.feeling>0?'liked':lesson.feeling<0?'disliked':'neutral'
  return state
}
export function paintBubble(node,cue){
  if(node.dataset.cue===cue)return
  const [icon,label]=cues[cue]
  node.dataset.cue=cue
  node.textContent=icon
  node.setAttribute('role','img')
  node.setAttribute('aria-label',label)
  node.title=label
}
export function mountPetting(button,getResident,routine){
  const bubble=button.querySelector('.resident-bubble')
  // Both atlases share four life-stage rows. Columns 0–3 use the original expressions.
  const portraits={
    happy:[0,'微笑'],quiet:[0,'平静'],sad:[2,'委屈'],sleepy:[3,'困倦'],hungry:[2,'肚子饿了'],
    liked:[1,'开心'],neutral:[5,'若有所思'],disliked:[2,'有些失落'],weary:[3,'疲惫'],
    close:[6,'安心'],shy:[4,'害羞'],curious:[5,'好奇'],playful:[1,'欢喜'],snack:[1,'满足'],
    reassured:[6,'放松下来'],withdraw:[7,'想独处一会儿']
  }
  let lastPet=0,strokes=0
  let shownId,lastPoint,petUntil=0,petCue,distance=0,lessonAt
  function refresh(w,opening=false){
    if(opening || w.id!==shownId || lessonAt!==w.lessonReaction?.at){
      shownId=w.id;lessonAt=w.lessonReaction?.at;petUntil=0;lastPoint=null;distance=0;lastPet=0;strokes=0
    }
    const cue=Date.now()<petUntil?petCue:residentCue(w,routine(w))
    const row=w.stage===4?3:Math.min(2,w.stage)
    if(bubble.dataset.cue===cue && bubble.dataset.row===String(row))return
    const [index,label]=portraits[cue]
    bubble.dataset.cue=cue;bubble.dataset.row=String(row)
    bubble.dataset.sheet=index<4?'original':'nuance'
    bubble.style.backgroundPosition=(index%4*100/3)+'% '+(row*100/3)+'%'
    bubble.setAttribute('role','img');bubble.setAttribute('aria-label',label);bubble.title=label
  }
  function pet(){
    const w=getResident()
    const now=Date.now()
    if(!w || now-lastPet<900)return
    strokes=now-lastPet<4500?strokes+1:1
    lastPet=now
    petCue=residentCue(w,routine(w),true)
    if(strokes>=3 || (strokes===2 && petCue==='weary'))petCue='withdraw'
    else if(strokes===2 && ['shy','sad','quiet','close'].includes(petCue))petCue='reassured'
    petUntil=now+2600
    refresh(w)
  }
  button.onpointermove=e=>{
    if(e.pointerType==='touch')return
    if(lastPoint)distance+=Math.hypot(e.clientX-lastPoint.x,e.clientY-lastPoint.y)
    lastPoint={x:e.clientX,y:e.clientY}
    if(distance>=16){distance=0;pet()}
  }
  button.onpointerleave=()=>{lastPoint=null;distance=0}
  button.onclick=pet
  return refresh
}
