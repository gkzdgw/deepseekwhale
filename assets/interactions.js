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
  let shownId,lastPoint,petUntil=0,petCue,distance=0,lessonAt
  function refresh(w,opening=false){
    if(opening || w.id!==shownId || lessonAt!==w.lessonReaction?.at){
      shownId=w.id;lessonAt=w.lessonReaction?.at;petUntil=0;lastPoint=null;distance=0
    }
    paintBubble(bubble,Date.now()<petUntil?petCue:residentCue(w,routine(w)))
  }
  function pet(){
    const w=getResident()
    if(!w || Date.now()<petUntil)return
    petCue=residentCue(w,routine(w),true);petUntil=Date.now()+2000
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
