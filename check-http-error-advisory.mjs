import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('dist/app.js','utf8');
const html=readFileSync('dist/index.html','utf8');
const panelMarkup=html.match(/<section id="http-error-panel"[\s\S]*?<\/section>/)?.[0];
assert.ok(panelMarkup,'HTTP errors have an inline panel');
assert.doesNotMatch(panelMarkup,/alertdialog|aria-modal|selected-route-popup/);
assert.equal(html.includes('id="http-error-advisory"'),false,'the HTTP popup markup is removed');
assert.equal(/(?<![\w.])fetch\(/.test(source),false,'direct requests use the shared error reporter');

const classifier=source.match(/async function isExpectedExcludedGateNoPath\(response,input,options\)\{[^\n]*\}/)?.[0];
const wrapper=source.match(/async function appFetch\(input,options\)\{[^\n]*\}/)?.[0];
const reporting=source.match(/const httpErrorEntries=new Map\(\);[\s\S]*?\n(?=\/\/ A single visible account)/)?.[0];
const binding=source.match(/function bindHttpErrorPanel\(\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(classifier&&wrapper&&reporting&&binding);
assert.doesNotMatch(reporting+binding,/\.focus\(|scrollIntoView|preventDefault|keydown|alertdialog|aria-modal/,'reporting never takes focus or traps keyboard navigation');

function harness({legacy=false}={}){
  const nodes=new Map(),handlers=new Map();
  const active={};
  let placements=0,requests=0,status=200,errorBody={error:'No path could be found for input'},lastOptions,lastResponse,networkError;
  function node(id=''){
    return {id,hidden:true,children:[],attributes:new Map(),listeners:new Map(),
      replaceChildren(...children){this.children=[...children];},
      append(...children){this.children.push(...children);for(const child of children)if(child.id)nodes.set(child.id,child);},
      after(child){placements++;nodes.set(child.id,child);},
      remove(){nodes.delete(this.id);},
      setAttribute(name,value){this.attributes.set(name,value);},
      addEventListener(type,callback){this.listeners.set(type,callback);},
      focus(){throw Error('An HTTP error must not steal focus');}
    };
  }
  nodes.set('notice',node('notice'));
  if(legacy)nodes.set('http-error-advisory',node('http-error-advisory'));
  else for(const id of ['http-error-panel','http-error-list','clear-http-errors'])nodes.set(id,node(id));
  const document={activeElement:active,getElementById:id=>nodes.get(id),createElement:()=>node(),addEventListener:(type,callback)=>handlers.set(type,callback)};
  const context={document,fetch:async(input,options)=>{
    requests++;lastOptions=options;if(networkError)throw networkError;
    const body=errorBody;
    lastResponse={status,ok:status<400,clone(){return{json:async()=>body};}};
    return lastResponse;
  }};
  vm.createContext(context);
  vm.runInContext('const $=id=>document.getElementById(id);'+classifier+wrapper+reporting+binding+'globalThis.test={appFetch,bindHttpErrorPanel};',context);
  context.test.bindHttpErrorPanel();
  return {nodes,document,handlers,active,...context.test,
    setStatus(value,body=errorBody){status=value;errorBody=body;},
    failNetwork(error){networkError=error;},
    get requests(){return requests;},get placements(){return placements;},
    get lastOptions(){return lastOptions;},get lastResponse(){return lastResponse;}
  };
}

const h=harness();
const panel=h.nodes.get('http-error-panel'),list=h.nodes.get('http-error-list'),clear=h.nodes.get('clear-http-errors');
await h.appFetch('/api/providers/status');
assert.equal(panel.hidden,true,'success is silent');
const excludedRequest={method:'POST',body:JSON.stringify({params:{via:['41,-87'],exclude_polygons:[[[-87,41],[-86,41],[-86,42],[-87,41]]]}})};
h.setStatus(400,{error:'Exclusion Zone Contains Escape Gate'});
await h.appFetch('http://127.0.0.1:8003/route',excludedRequest);
assert.equal(panel.hidden,true,'excluded-gate failures remain in their route batch panel');
h.setStatus(400,{error:'No path could be found for input'});
await h.appFetch('http://127.0.0.1:8003/route',excludedRequest);
assert.equal(panel.hidden,true,'expected excluded-gate no-path outcomes stay quiet');
const returned=await h.appFetch('http://127.0.0.1:8003/route',{method:'POST',body:JSON.stringify({params:{via:['41,-87']}})});
assert.equal(returned,h.lastResponse,'the caller still receives the original failed response');
assert.equal(panel.hidden,false,'other failures appear inline');
assert.match(list.children[0].textContent,/Local Valhalla route request returned HTTP 400/);
clear.listeners.get('click')();
assert.equal(panel.hidden,true);assert.equal(list.children.length,0);

h.setStatus(429);
await Promise.all([h.appFetch('/api/providers/avm/lookup?token=private'),h.appFetch('/api/providers/avm/lookup')]);
assert.equal(panel.hidden,false);
assert.match(list.children[0].textContent,/RentCast value request returned HTTP 429 \(2 times\)/,'parallel repeated failures aggregate');
assert.doesNotMatch(list.children[0].textContent,/private/,'query data is never displayed');
h.setStatus(502);
await h.appFetch('/api/providers/valhalla');
await h.appFetch('http://127.0.0.1:8003/route');
await h.appFetch('/api/providers/status');
assert.equal(list.children.length,4,'distinct services and statuses remain separate');
assert.match(list.children[1].textContent,/Valhalla route request returned HTTP 502/);
assert.match(list.children[2].textContent,/Local Valhalla route request returned HTTP 502/);
assert.match(list.children[3].textContent,/provider connection check returned HTTP 502/);
assert.equal(h.requests,9,'reporting sends no additional request or retry');
assert.equal(h.document.activeElement,h.active,'errors leave the current focus untouched');
assert.equal(h.handlers.size,0,'errors install no keyboard or backdrop handlers');
assert.equal(panel.listeners.size,0,'the inline panel has no backdrop dismissal behavior');

h.setStatus(200);await h.appFetch('reference.json');
assert.equal(list.children.length,4,'a later success does not erase failure evidence');
h.setStatus(404);await h.appFetch('reference.json');
assert.equal(list.children.length,5,'new errors accumulate until explicitly cleared');
clear.listeners.get('click')();
await h.appFetch('reference.json');
assert.equal(list.children.length,1,'clearing resets counts and stale reports');
h.setStatus(401);await h.appFetch('/api/providers/status',{suppressHttpAdvisory:true,method:'GET'});
assert.equal(list.children.length,1,'existing caller suppression is preserved');
assert.equal(h.lastOptions.method,'GET');
assert.equal('suppressHttpAdvisory' in h.lastOptions,false,'private reporting options are not sent to fetch');
const networkFailure=Error('Offline');h.failNetwork(networkFailure);
await assert.rejects(h.appFetch('reference.json'),error=>error===networkFailure,'network errors still reach current-step handlers');
assert.equal(h.requests,14,'no automatic retry is added');

const legacy=harness({legacy:true});
assert.equal(legacy.nodes.has('http-error-advisory'),false,'stale preview HTML loses its old modal');
assert.equal(legacy.placements,1,'stale preview HTML gets an inline panel beside notices');
assert.equal(legacy.nodes.get('http-error-panel').className,'inset http-error-panel');
assert.equal(legacy.nodes.get('http-error-list').attributes.get('aria-live'),'polite');
legacy.setStatus(503);await legacy.appFetch('/api/providers/valhalla');
assert.equal(legacy.nodes.get('http-error-panel').hidden,false);
assert.match(legacy.nodes.get('http-error-list').children[0].textContent,/HTTP 503/);
assert.equal(legacy.document.activeElement,legacy.active);
assert.equal(legacy.handlers.size,0);
console.log('Passed panel-only HTTP errors: repeated failures aggregate without focus changes, expected excluded-gate failures stay in route panels, original responses and no-retry behavior are preserved, and stale preview HTML is supported.');
