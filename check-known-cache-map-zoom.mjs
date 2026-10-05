import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const start=source.indexOf('async function refreshKnownCacheCells(){');
const end=source.indexOf('\nfunction drawKnownAvmLayer',start);
assert.ok(start>=0&&end>start,'the shared-cache map refresh remains directly testable');
let fits=0,fetches=0;
const cell={cell_id:'CHI1K-V1-Q0-R0',grid_version:'CHI1K-V1',q:0,r:0,latitude:41.9,longitude:-87.7,estimate_ppsqft:321,polygon:[[-87.71,41.89],[-87.69,41.89],[-87.69,41.91],[-87.71,41.91],[-87.71,41.89]]};
const context={map:{getBounds:()=>null,fitBounds:()=>fits++},knownCacheCells:[],knownCacheBoundsKey:null,knownCacheRequestEpoch:0,knownCacheAutoFitDone:false,current:()=>null,L:{latLngBounds:points=>points},$:()=>({checked:true}),appFetch:async()=>{fetches++;return{};},appJson:async()=>({provider_calls:0,cells:[cell]}),validMapEstimate:value=>Number.isFinite(value)&&value>0,renderKnownAvmCellControl(){},drawMap(){}};
vm.createContext(context);
vm.runInContext(source.slice(start,end),context);
await vm.runInContext('refreshKnownCacheCells()',context);
assert.equal(fits,1,'the initial known-cell cache load frames the map once before a trip exists');
for(const reset of ['red-slider-reset','exclusion-slider-reset']){context.knownCacheBoundsKey=reset;await vm.runInContext('refreshKnownCacheCells()',context);assert.equal(fits,1,reset+' preserves the existing map zoom after candidates are discarded');}
assert.equal(fetches,3,'only read-only cache checks are repeated; no provider is contacted');
console.log('Passed initial known-cell map framing and Red/Exclusion slider-reset zoom preservation. Provider calls: 0.');