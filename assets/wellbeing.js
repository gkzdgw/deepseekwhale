import {birthRoute,paths} from './growth-paths.js'
import {attributes} from './catalog.js'
const DAY=86400000
const rates=[150,130,115,100,90,80,65,50,10]
// Each route orders the same nine attributes from strongest affinity to strongest resistance.
const priorities=[
  [0,8,7,1,4,3,5,2,6],[2,6,5,1,7,3,0,4,8],[1,3,0,5,7,4,6,2,8],
  [1,3,0,4,8,5,7,2,6],[4,1,3,5,7,0,8,2,6],[5,1,4,2,3,8,7,0,6],
  [0,7,3,4,1,8,2,6,5],[7,8,5,2,6,4,0,1,3],[8,3,1,4,7,0,5,2,6],
  [4,5,8,1,3,0,7,2,6],[6,7,1,5,2,0,3,4,8],[8,0,7,5,4,2,3,1,6],
  [0,7,8,3,2,6,1,4,5],[5,3,1,0,8,7,4,2,6],[8,2,3,7,6,0,1,4,5],
  [5,4,1,3,8,2,7,0,6],[8,7,2,5,0,6,1,3,4],[2,6,7,8,5,3,0,1,4],
  [0,3,1,8,4,7,5,2,6]
]
export const affinity=(w,a)=>rates[priorities[birthRoute(w)].indexOf(a)]
export const rounded=n=>Math.round(n*100)/100
export const learningGain=(w,a,points)=>rounded(points*affinity(w,a)/100)
export function preferenceText(w){
  const order=priorities[birthRoute(w)]
  return '出生倾向 · '+paths[birthRoute(w)][0]+'　'+order.map((a,i)=>attributes[a]+' '+rates[i]+'%').join(' · ')
}
export const preferredPair=w=>priorities[birthRoute(w)].slice(0,2)
export const mood=w=>Math.min(100,(w.moodValue??80)+5*Math.max(0,Math.floor((Date.now()-(w.moodAt||w.bornAt||Date.now()))/DAY)))
export const resting=w=>mood(w)<=20
export function energyLimit(w){
  const max=w.stage===4?18:w.stage>=2?12:6
  const feeling=mood(w)
  return feeling<=20?max/2:feeling<=45?max-1:max
}
export function changeMood(w,delta){w.moodValue=Math.max(0,Math.min(100,mood(w)+delta));w.moodAt=Date.now()}
export function lessonFeeling(w,item){
  const score=item.effects.reduce((sum,[a,points])=>sum+affinity(w,a)*points,0)/item.effects.reduce((n,[,v])=>n+v,0)
  return score<=50?-12:score<=80?-6:score>=115?2:0
}
export const sessionEnergy=(w,item)=>item.energy+Number(lessonFeeling(w,item)<0)


