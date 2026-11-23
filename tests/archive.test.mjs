import assert from 'node:assert/strict'
import test from 'node:test'
import {webcrypto} from 'node:crypto'
import {newArchiveId} from '../assets/archive.js'

test('archive IDs are unique UUIDs with and without the secure-context API', t=>{
  const pattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  assert.match(newArchiveId(),pattern)
  t.mock.getter(globalThis,'crypto',()=>({getRandomValues:bytes=>webcrypto.getRandomValues(bytes)}))
  const ids=Array.from({length:128},()=>newArchiveId())
  assert.equal(new Set(ids).size,ids.length)
  for(const id of ids)assert.match(id,pattern)
})
