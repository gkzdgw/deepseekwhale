import {talents,signatureTalent} from './talents.js'
// Targets are relative study, art and fitness shares, followed by a feeding target.
export const paths = [
  ['普通高中生','职场新人',4,3,3,12],['叛逆少女','街头设计师',1,4,5,10],
  ['中二病少女','幻想剧场导演',5,4,1,14],['文艺少女','绘本画师',2,7,1,14],
  ['高雅少女','小提琴演奏家',3,6,1,40],['辣妹','潮流造型师',1,6,3,32],
  ['清冷妹妹','清冷佳人',7,2,1,8],['傲人姐姐','自信的领队',4,1,5,38],
  ['居家少女','人妻形态',3,4,3,55],['公主','公主',3,6,1,65],
  ['魔王','魔王',2,4,4,50],['学生会长','议事会长',6,2,2,45],
  ['理科少女','科研学者',8,1,1,25],['广播社少女','电台主播',4,5,1,30],
  ['土妹子','田园园艺师',2,3,5,50],['校花','庆典主持人',2,6,2,25],
  ['打工少女','咖啡店主',3,2,5,25],['假小子','运动教练',1,1,8,24],
  ['文学少女','小说家',6,3,1,18]
]
const traits = ['安静','好奇','黏人','贪吃','爱睡','爱闹','怕生','慢热','爱干净']
const likes = [[0,8],[1,4],[3,9],[4,0],[2,8],[5,9],[0,3],[1,2],[5,1]]
function hash(id) {return Array.from(String(id)).reduce((n,c)=>(31*n+c.codePointAt(0))%65521,0)}
export function ensureTrait(w) {
  if(!traits.includes(w.trait)) w.trait=traits[hash(w.id)%traits.length]
  return w.trait
}
export function favoriteItems(w) {return likes[traits.indexOf(ensureTrait(w))]}
export function birthRoute(w){
  if(!Number.isInteger(w.birthRoute)||!paths[w.birthRoute])w.birthRoute=hash(w.id+'|'+ensureTrait(w))%paths.length
  return w.birthRoute
}
export function routeIndex(w) {
  if(Number.isInteger(w.adultRoute) && paths[w.adultRoute])return w.adultRoute
  const birth=birthRoute(w)
  const amounts=w.learning||w.study||[0,0,0]
  const total=amounts.reduce((n,v)=>n+v,0)
  if(!total && !w.meals)return birth
  // A small inherited baseline yields to accumulated absorption. Feeding differentiates similar courses.
  const prior=paths[birth].slice(2,5)
  const mix=prior.map((n,i)=>((amounts[i]||0)+2*n)/(total+20))
  const meals=Math.min(65,Math.max(0,(w.meals||0)-(w.nurseryMeals||0)+(w.snacksEaten||0)))
  const facets=talents(w), peak=Math.max(1,...facets)
  let best=0, distance=Infinity
  paths.forEach((path,i)=>{
    const education=mix.reduce((sum,v,k)=>sum+(v-path[k+2]/10)**2,0)
    const score=education+.022*(1-facets[signatureTalent[i]]/peak)+.075*((meals-path[5])/65)**2
    if(score<distance){best=i;distance=score}
  })
  return best
}
export function residentPortrait(w) {
  const file=w.stage===0?'whale-calf.png':w.stage===1?'chibi-cutout.png':'resident-'+Number(w.stage===4)+'-'+routeIndex(w)+'.png'
  return '/__dim-womb/outfits/'+file
}
export function routeName(w) {return paths[routeIndex(w)][Number(w.stage===4)]}

