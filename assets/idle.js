import {preferredPair} from './wellbeing.js'
import {talents} from './talents.js'
export const DAY=86400000
export const origin=w=>w.bornAt+(w.nurseryDelay||0)
export const nurseryMeals=30
export const waitingForRice=w=>w.stage===0 && (w.meals||0)<nurseryMeals
export const mealProgress=w=>Math.min(w.meals||0,nurseryMeals)+'/'+nurseryMeals
// The thirtieth serving completes the nursery. Anchor later stages to that meal.
export function completeNursery(w,now,days,extraDays){
  const readyAt=Math.min(now,w.nurseryReadyAt||now)
  w.nurseryReadyAt=readyAt
  w.nurseryMeals=nurseryMeals
  w.nurseryDelay=readyAt-w.bornAt-Math.max(0,days-extraDays)*DAY
}
export function idleGrowth(w,state,now,extra){
  if(!state.idleMode || w.stage===4 || waitingForRice(w))return false
  const end=Math.min(now,origin(w)+(state.growth[3].days-extra)*DAY)
  const start=Math.max(w.idleCursor||0,state.idleSince||0,(w.moodValue??80)<=20?w.moodAt+Math.ceil((21-w.moodValue)/5)*DAY:0,w.nurseryReadyAt||w.firstRiceAt||0,origin(w)+(state.growth[0].days-extra)*DAY)
  const ticks=Math.min(30-(w.idleLessons||0),Math.floor((end-start)/(4*DAY)))
  if(ticks<=0)return false
  const prefs=preferredPair(w)
  const secondary=talents(w).slice()
  w.study ||= [0,0,0]
  for(let j=0;j<ticks;j++){
    const a=prefs[(w.idleLessons||0)%prefs.length],subject=a<3?a:[1,1,1,2,2,0][a-3],talent=a>=3?a-3:[0,1,3][a]
    w.study[subject]=Math.min(100,w.study[subject]+1)
    secondary[talent]=Math.min(100,secondary[talent]+1)
    w.idleLessons=(w.idleLessons||0)+1
  }
  w.talents=secondary
  w.idleCursor=start+ticks*4*DAY
  return true
}
export function visit(w,now=Date.now()){
  const left=w.departedAt||w.milestones?.[4]||now
  const day=Math.max(0,Math.floor((now-left)/DAY)),visiting=day>=7 && day%7===0
  return {visiting,next:left+(Math.floor(day/7)+1)*7*DAY,until:left+(day+1)*DAY,left}
}

