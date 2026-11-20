import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeBillingReward as sum} from '../lib/index.js';
import {catalog,defaultPrices,previousDefaultPrices} from '../assets/catalog.js';
import {upgradeEconomy,validPrice} from '../assets/academy.js';
import {safePurchaseTotal} from '../assets/market.js';
test('mixed billing uses local FX and frozen CNY once, without changing input',()=>{
 const ledger={config:{currency:'CNY',exchangeRate:7,fxRates:{CNY:6}},days:{'2026-01-01':{cost:2},'2026-01-02':{cost:99,costCny:3}}};
 const before=JSON.stringify(ledger); const result=sum(ledger);
 assert.equal(result.cents,1700);assert.equal(result.estimatedDays,1);assert.equal(result.dayCount,2);
 assert.equal(JSON.stringify(ledger),before);
 assert.equal(sum({days:{'2026-01-01':{costCny:0,cost:100}}}).cents,0);
 assert.equal(sum({config:{fxRates:{CNY:8}},days:{'2026-01-01':{cost:1}}}).cents,800);
});
test('missing FX, malformed values and overflow cannot generate rewards',()=>{
 for(const ledger of [{},{days:[]},{days:{'2026-01-01':{cost:1}}},{days:{'2026-01-01':{costCny:-1}}},{days:{'2026-01-01':{costCny:'10'}}},{days:{'2026-01-01':{costCny:1e20}}}])assert.throws(()=>sum(ledger));
 assert.equal(sum({days:{}}).cents,0);
});
test('each item family increases ninefold; hourglass costs 100 million',()=>{
 for(const kind of ['gift','energy',undefined]){
   const items=catalog.filter(g=>g.kind===kind && (kind || g.effects[0][0]===0)).sort((a,b)=>a.tier-b.tier);
   assert.equal(items.length,9);
   for(let i=1;i<items.length;i++)assert.equal(items[i].cost,9*items[i-1].cost);
 }
 assert.equal(catalog.find(g=>g.kind==='clock').cost,100000000);
 assert.ok(defaultPrices.every(validPrice));
 assert.equal(safePurchaseTotal(6457008150000,9999),null);
 assert.equal(safePurchaseTotal(100000000,10),1000000000);
});
test('old defaults migrate once while custom prices, inventory and grants survive',()=>{
 const state={economyVersion:3,prices:previousDefaultPrices.slice(),tokenPool:123,schoolBag:[2,3],historyGrant:{cents:20,tokens:7}};
 state.prices[1]=123456;
 upgradeEconomy(state);
 assert.equal(state.prices[1],123456);assert.equal(state.prices[6],100000000);
 assert.equal(state.prices[3],defaultPrices[3]);assert.deepEqual(state.schoolBag,[2,3]);
 assert.equal(state.tokenPool,123);assert.equal(state.historyGrant.tokens,7);
 const snapshot=JSON.stringify(state);upgradeEconomy(state);assert.equal(JSON.stringify(state),snapshot);
});
