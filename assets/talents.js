export const talentNames=['感受性','气质','魅力','力量','毅力','责任感']
export const lessons=[
  [[0,3],[5,4]], [[4,8],[5,8]], [[0,8],[1,3]], [[1,10],[2,7]],
  [[3,8],[4,4]], [[3,12],[5,6]], [], [], [[0,12]], [[1,6],[2,8]]
]
export function talents(w){
  if(Array.isArray(w.talents))return w.talents
  const [s,a,f]=w.study||[0,0,0]
  return [a,(a+s)/2,a,f,f,s].map(n=>Math.round(n*.45))
}
export const signatureTalent=[5,3,0,0,1,2,4,4,5,1,3,5,4,2,4,2,5,3,0]

