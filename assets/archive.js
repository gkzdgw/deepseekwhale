// Versioned portable game save. Gzip validates its footer on decompression.
const prefix='DWH1.'
const limit=8*1024*1024
const encoder=new TextEncoder()
const liveFields=['lastTokens','meterCursor','meterAwaitingBaseline','archiveId','seenAt']

// LAN HTTP pages can use getRandomValues even when randomUUID is unavailable.
export function newArchiveId(){
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID()
  const bytes=crypto.getRandomValues(new Uint8Array(16))
  bytes[6]=(bytes[6]&15)|64
  bytes[8]=(bytes[8]&63)|128
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')
}

async function readLimited(stream){
  const reader=stream.getReader(),chunks=[]
  let size=0
  try {
    for(;;){
      const {done,value}=await reader.read()
      if(done)break
      size+=value.length
      if(size>limit){await reader.cancel();throw Error('存档内容过大。')}
      chunks.push(value)
    }
  } finally {reader.releaseLock()}
  return new Uint8Array(await new Blob(chunks).arrayBuffer())
}

export async function exportCode(state){
  const data={...state}
  for(const field of liveFields)delete data[field]
  data.historyGrant=state.historyGrant?{claimed:true}:null
  const raw=encoder.encode(JSON.stringify(data))
  if(raw.length>limit)throw Error('存档内容过大。')
  const bytes=await readLimited(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')))
  let binary=''
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
  return prefix+btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
}

export async function importCode(raw){
  const code=raw.replace(/\s/g,'')
  if(!code.startsWith(prefix))throw Error('需要以 DWH1. 开头的次元之家存档码。')
  const encoded=code.slice(prefix.length)
  if(!encoded || encoded.length>Math.ceil(limit*4/3) || !/^[A-Za-z0-9_-]+$/.test(encoded))throw Error('存档码不完整，请重新复制。')
  let data
  try {
    const binary=atob(encoded.replaceAll('-','+').replaceAll('_','/'))
    const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0))
    const decoded=await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')))
    data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded),(key,value)=>{
      if(['__proto__','constructor','prototype'].includes(key))throw Error()
      return value
    })
  }catch{throw Error('存档码损坏或内容过大，请重新复制完整的一串。')}
  const natural=n=>Number.isSafeInteger(n) && n>=0
  const numbers=xs=>xs==null || (Array.isArray(xs) && xs.every(Number.isFinite))
  const resident=w=>w && typeof w.id==='string' && typeof w.name==='string' && Number.isInteger(w.stage) &&
    w.stage>=0 && w.stage<=4 && numbers(w.study) && numbers(w.talents) && numbers(w.learning) &&
    (w.milestones==null || (typeof w.milestones==='object' && Object.values(w.milestones).every(Number.isFinite)))
  if(typeof data?.name!=='string' || !natural(data.tokenPool) || !Array.isArray(data.whales) ||
     !data.whales.every(resident) ||
     new Set(data.whales.map(w=>w.id)).size!==data.whales.length ||
     !Array.isArray(data.events) || !data.events.every(e=>e && typeof e.text==='string' && Number.isFinite(e.at)) ||
     !Array.isArray(data.schoolBag) || !data.schoolBag.every(n=>n===null || natural(n)) ||
     !Array.isArray(data.prices) || !data.prices.every(n=>natural(n) && n>0) ||
     !Number.isFinite(data.storage) || data.storage<0 || !Number.isFinite(data.updatedAt) ||
     !Number.isInteger(data.capacity) || data.capacity<10 || data.capacity>9999 ||
     !Number.isFinite(data.hatchAt) || data.hatchAt<1 || data.hatchAt>data.capacity || !Number.isInteger(data.hatchAt*10) ||
     !Number.isInteger(data.gestationMinutes) || data.gestationMinutes<1 || data.gestationMinutes>525600)
    throw Error('这串数据缺少有效的养成档案。')
  for(const field of liveFields)delete data[field]
  data.historyGrant=data.historyGrant?{claimed:true}:null
  return data
}
