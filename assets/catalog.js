import {talentNames} from './talents.js'
export const attributes=['学识','艺术','体能',...talentNames]
const prices=Array.from({length:9},(_,i)=>10*9**i)
const primary=[1,4,6,9,12,16,20,24,30]
const secondary=[0,0,2,3,4,5,7,9,12]
const third=[0,0,0,0,0,0,3,4,6]
// Rows share a discipline; each column unlocks the next price and effect tier.
const names=[
  '潮汐图鉴 星海航行手册 海图绘制册 星象观测镜 远洋测绘箱 海港星历 深海观测站 天穹星图 星海百科全书',
  '贝壳水彩盒 海港乐谱集 海港舞鞋 月光竖琴 玻璃彩绘架 鲸歌录音机 珍珠音乐盒 海潮协奏谱 星海交响总谱',
  '浮潜练习环 巡海训练套装 平衡训练板 竞速泳鳍 潮流阻力带 远泳浮标 深潜训练器 海峡接力棒 环海挑战套装',
  '潮声诗集 贝壳听筒 风声采集瓶 雨夜手记 海底声景册 浪花留声盒 蓝鲸共鸣器 潮汐诗选 月海回音琴',
  '礼仪折扇 珍珠手扇 茶席礼仪书 水晶茶具 海港舞会帖 古典礼服册 月华礼仪镜 王庭仪典册 星光礼赞',
  '蔷薇发带 蓝宝石胸针 舞台手镜 海风麦克风 星光表演服 剧场台本 珊瑚聚光灯 蓝鲸演出箱 星海舞台',
  '拳术练习手套 训练壶铃 弹力拉环 负重沙袋 攀岩绳组 船坞划桨器 拓荒训练锤 海潮举重架 远航动力舱',
  '练习手帐 远足短靴 航程计步表 风雨旅行包 晨练计划册 山海路线图 极地远征靴 长航日志 不息灯塔',
  '园艺育苗盆 值日记录册 班级事务本 港口轮值表 温室管理箱 海鸟救护包 社区计划书 船长工作台 群岛守护日志'
].map(row=>row.split(' '))
const partners=[[7,8],[5,4],[6,7],[1,0],[5,8],[4,1],[2,7],[8,2],[7,0]]
function item(attribute,index){
  const values=[[attribute,primary[index]]]
  if(secondary[index])values.push([partners[attribute][0],secondary[index]])
  if(third[index])values.push([partners[attribute][1],third[index]])
  return {name:names[attribute][index],tier:index+1,cost:prices[index]*10000,effects:values,energy:index<2?2:3}
}
// The first ten positions are the persistent inventory IDs used by previous releases.
export const catalog=[item(0,0),item(0,1),item(1,0),item(1,1),item(2,0),item(2,1),
  {name:'时光沙漏',kind:'clock',cost:100000000,effects:[]},{name:'幼鲸白饭',kind:'rice',cost:10000,effects:[]},item(3,0),item(1,2)]
const existing=new Set(catalog.map(g=>g.name))
for(let a=0;a<names.length;a++)for(let t=0;t<9;t++)if(!existing.has(names[a][t]))catalog.push(item(a,t))
// Keep the nine existing gift slots so stored quantities and custom prices carry over.
const sweets='蜂蜜热可可 草莓大福 焦糖布丁 桂花奶冻 蜜桃千层 海盐芝士塔 珍珠慕斯 蓝莓舒芙蕾 星海庆典蛋糕'.split(' ')
const dinners='芝麻饭团 紫菜蒸蛋 鲜虾烧卖 南瓜浓汤 菌菇焗饭 鲑鱼茶泡饭 奶油海鲜面 海港什锦锅 远航团圆宴'.split(' ')
sweets.forEach((name,i)=>catalog.push({name,tier:i+1,kind:'gift',cost:prices[i]*15000,
  cheer:[8,16,22,28,34,40,50,60,75][i],effects:[]}))
dinners.forEach((name,i)=>catalog.push({name,tier:i+1,kind:'energy',cost:20000*9**i,
  restore:[1,1.5,2,2.5,3,3.5,4,5,6][i],effects:[]}))
export const defaultPrices=catalog.map(g=>g.cost)
// Pre-0.12.15 defaults, indexed by the same persistent inventory IDs.
const previousTiers=[10,30,50,80,120,180,260,380,550]
export const previousDefaultPrices=catalog.map(g=>g.kind==='clock'?1000000:g.kind==='rice'?10000:
  g.kind==='energy'?[2,4,7,11,16,22,30,42,56][g.tier-1]*10000:
  previousTiers[g.tier-1]*(g.kind==='gift'?15000:10000))
export const priceText=value=>value%10000===0?(value/10000).toLocaleString()+' 万':value.toLocaleString()

