import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const css=readFileSync('dist/style.css','utf8');
assert.match(css,/\.is-working\{[^}]*background-color:#fff1a8;[^}]*animation:working-flash \.5s ease-in-out infinite!important/);
assert.match(css,/@keyframes working-flash\{0%,100%\{[^}]+\}50%\{[^}]+\}\}/,'2 Hz means one complete bright-dim-bright cycle every 0.5 seconds');
assert.doesNotMatch(css,/animation:working-flash \.5s[^;]*alternate/,'alternate would stretch the full pulse to one second');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.is-working\{animation:none!important;background-color:#fff1a8!important\}\}/);

for(const marker of [
  "beginWorking('shotgun-status','shotgun-status-destination')",
  "beginWorking(status)",
  "beginWorking('here-result')",
  "beginWorking('honeycomb-status')",
  "beginWorking('evaluation-result')",
  "beginWorking('cache-status')",
  "beginWorking('cache-lookup-result')",
  "beginWorking('map-avm-status')",
  "beginWorking('avm-plan-summary')",
  "beginWorking('avm-service-status','avm-plan-summary')",
  "beginWorking('pool-screening-summary'",
  "beginWorking('approve-pool-screening','pool-screening-status','primary-ranking'",
  "beginWorking('provider-status')"
])assert.ok(source.includes(marker),'missing working-state integration: '+marker);

const elements=new Map();
function element(){
  const classes=new Set(),attributes={};
  return{value:'',checked:false,disabled:false,hidden:false,textContent:'',children:[],listeners:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);},contains:c=>classes.has(c)},setAttribute(k,v){attributes[k]=String(v);},getAttribute:k=>attributes[k]??null,removeAttribute:k=>delete attributes[k],replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},addEventListener(k,fn){this.listeners[k]=fn;},focus(){}};
}
const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
for(const [id,value]of Object.entries({'origin':'41.9,-87.7','destination':'41.8,-87.6','origin-name':'Start','destination-name':'End','departure-mode':'any','routing-mode':'fast','candidate-limit':'7','here-key':'','avm-cap':'0','shotgun-inner':'1','shotgun-outer':'3','shotgun-spacing':'0.75','shotgun-count':'6'}))get(id).value=value;

let releaseCatalog;
const bundledCatalog=JSON.parse(readFileSync('dist/intersection-catalog-chicago-v1.json','utf8'));
const ui={crypto:webcrypto,TextEncoder,TextDecoder,URL,AbortSignal,Response,Headers,structuredClone,document:{activeElement:null,getElementById:get,querySelectorAll:()=>[],querySelector:()=>null,createElement:element,createElementNS:element,addEventListener(){}},fetch(path){if(path!=='intersection-catalog-chicago-v1.json')throw Error('Unexpected fetch '+path);return new Promise(resolve=>{releaseCatalog=()=>resolve(Response.json(bundledCatalog));});}};
ui.window=ui;vm.createContext(ui);vm.runInContext(readFileSync('dist/shotgun-gates.js','utf8'),ui);vm.runInContext(source.replace(/\ninit\(\);\s*$/,''),ui);
const status=get('here-result'),finishOuter=ui.SurviveDrive.beginWorking(status),finishInner=ui.SurviveDrive.beginWorking('here-result');
assert.equal(status.classList.contains('is-working'),true);
assert.equal(status.getAttribute('aria-busy'),'true');
finishInner();
assert.equal(status.classList.contains('is-working'),true,'nested work must keep flashing until every operation finishes');
finishOuter();
assert.equal(status.classList.contains('is-working'),false);
assert.equal(status.getAttribute('aria-busy'),null);
finishOuter();
assert.equal(status.classList.contains('is-working'),false,'cleanup must be idempotent');

const approval=get('approve-pool-screening'),finishApproval=ui.SurviveDrive.beginWorking('approve-pool-screening');
assert.equal(approval.classList.contains('is-working'),true,'the screening approval button must flash yellow while its plan is running');
assert.equal(approval.getAttribute('aria-busy'),'true');
finishApproval();
assert.equal(approval.classList.contains('is-working'),false);
assert.equal(approval.getAttribute('aria-busy'),null);

const catalogPull=ui.SurviveDrive.loadBundledIntersectionCatalog();
assert.equal(get('shotgun-status').classList.contains('is-working'),true);
assert.equal(get('shotgun-status-destination').classList.contains('is-working'),true);
assert.equal(get('shotgun-status').getAttribute('aria-busy'),'true');
releaseCatalog();
await catalogPull;
assert.equal(get('shotgun-status').classList.contains('is-working'),false);
assert.equal(get('shotgun-status-destination').classList.contains('is-working'),false);
assert.equal(get('shotgun-status').getAttribute('aria-busy'),null);

console.log('Passed light-yellow working flash, reduced-motion fallback, accessibility state, nested cleanup, and integration coverage for Census, HERE, honeycomb, cache, AVM, map-cell, pool evolution, and provider pulls. Provider calls: 0.');
