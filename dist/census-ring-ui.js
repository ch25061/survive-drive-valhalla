'use strict';
// Loaded before app.js; work starts only through its explicit GO/Retry handlers.
const CENSUS_CIRCLE_TIMEOUT_MS=60000;
// A completed Census response can be saved again after a database outage without another Census request.
const pendingCensusCircleSaves={start:new Map(),destination:new Map()};
function pendingCensusKey(circleId){return 'survive-drive-census-pending-'+circleId;}
function rememberPendingCensus(side,circleId,pending){pendingCensusCircleSaves[side].set(circleId,pending);try{globalThis.sessionStorage?.setItem(pendingCensusKey(circleId),JSON.stringify(pending));}catch{/* Keep the response in this tab's memory when browser storage is full or disabled. */}}
function restorePendingCensus(side,plan){for(const circle of plan.circles){if(pendingCensusCircleSaves[side].has(circle.id))continue;try{const raw=globalThis.sessionStorage?.getItem(pendingCensusKey(circle.id));if(!raw)continue;const pending=JSON.parse(raw);if(pending.ring_id===plan.id&&[circle.id,circle.id+'-retry-2',circle.id+'-retry-3'].includes(pending.claim_id)&&pending.payload&&typeof pending.payload==='object')pendingCensusCircleSaves[side].set(circle.id,pending);}catch{/* Corrupt or unavailable browser storage cannot authorize another Census request. */}}}
function forgetPendingCensus(side,circleId){pendingCensusCircleSaves[side].delete(circleId);try{globalThis.sessionStorage?.removeItem(pendingCensusKey(circleId));}catch{/* The confirmed server cache remains authoritative. */}}
function markCensusCircleSaved(side,circleId){state.uncertainAttempts=state.uncertainAttempts.filter(item=>!(item.provider==='Census TIGERweb'&&item.page_id===circleId&&item.side===side&&item.scope==='circle_not_cached'));providerCounts();}
function censusCircleError(error){return ['TimeoutError','AbortError'].includes(error?.name)?Error('Census road request exceeded the 60-second limit.'):error;}
async function checkCensusRing(origin,options,epoch,side,retry=false){
  const label=side==='start'?'Start':'Destination',status=$(side==='start'?'shotgun-status':'shotgun-status-destination'),params={origin,inner_miles:options.inner_miles,outer_miles:options.outer_miles},expected=window.SurviveCensusRing.plan(params),current=()=>epoch===state.catalogFaultEpochs[side];
  pendingCensusCircleSaves[side]??=new Map();state.catalogRingSettled??={};state.catalogRingEpoch??={};
  if(state.catalogBusy[side]){const sameEpoch=state.catalogRingEpoch[side]===epoch;await state.catalogRingSettled[side];if(sameEpoch||!current())return;}
  if(!current())return;
  state.catalogBusy[side]=true;state.catalogRingEpoch[side]=epoch;let settled;state.catalogRingSettled[side]=new Promise(resolve=>{settled=resolve;});const endWorking=beginWorking(status);let completed=0,attempted=0,stopped=false,failure=null;
  state.catalogFaults[side]={kind:'ring',epoch,origin,options,page_id:expected.id};const activeCircles=new Set();
  const message=text=>{if(current()){status.textContent=text;workflowPhase(text);}};
  const reportProgress=()=>{const active=[...activeCircles].sort((a,b)=>a-b).map(index=>index+1);const detail=failure?'Circle '+(failure.index+1)+' failed; finishing in-flight circles '+(active.length?active.join(', '):'none')+'.':active.length?'Checking circles '+active.join(', ')+'.':'Waiting for the next circle.';message('WAIT — '+label+': '+completed+' of '+expected.circles.length+' circles finished. '+detail+' Up to 3 at a time; no action needed.');};
  async function post(operation,extra={}){
    const maximumAttempts=operation==='ingest'?3:1;
    for(let attempt=1;attempt<=maximumAttempts;attempt++){
      const response=await providerFetch('/api/intersections/ring/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...params,...extra}),suppressHttpAdvisory:operation==='ingest'});
      const result=await appJson(response,label+' road search',true);
      if(response.ok)return result;
      if(operation==='ingest'&&response.status===503&&attempt<maximumAttempts&&current()){
        message('WAIT — '+label+': road catalog storage was temporarily unavailable. Retrying the save ('+(attempt+1)+' of '+maximumAttempts+'); the completed Census response is held and no Census request is repeated.');
        await new Promise(resolve=>setTimeout(resolve,attempt===1?1000:3000));
        continue;
      }
      throw Error(result.error||label+' road search returned HTTP '+response.status+'.');
    }
  }
  try{
    message('WAIT — '+label+': checking saved road data for '+expected.circles.length+' small circles covering the '+params.inner_miles+'–'+params.outer_miles+' mile band. No action needed.');
    const prepared=await post('plan');if(!current())return;if(prepared.plan?.id!==expected.id||prepared.plan.maximum_source_requests!==expected.circles.length)throw Error('The returned road-search plan does not match these settings.');
    let catalog=prepared.catalog;restorePendingCensus(side,expected);
    if(!catalog){
      for(const [circleId,pending] of pendingCensusCircleSaves[side]){
        if(pending.ring_id!==expected.id)continue;
        const index=expected.circles.findIndex(circle=>circle.id===circleId);
        if(index<0)continue;
        message('WAIT — '+label+': saving a Census response already received for circle '+(index+1)+'. No new Census request for this circle.');
        await post('ingest',{circle_index:index,claim_id:pending.claim_id,census_payload:pending.payload});
        forgetPendingCensus(side,circleId);
        markCensusCircleSaved(side,circleId);
      }
      let cursor=0;
      async function run(){while(!stopped&&current()&&cursor<expected.circles.length){const index=cursor++,circle=expected.circles[index];let sent=false,ingested=false;activeCircles.add(index);reportProgress();
        try{
          const claim=await post('claim',{circle_index:index,retry_requested:retry});
          if(claim.circle_id!==circle.id)throw Error('The returned circle does not match the plan.');
          if(!current()){
            // Nothing was dispatched: return this unused reservation so an edit
            // does not consume a Census attempt. Unknown outcomes stay reserved.
            if(!claim.cached&&claim.claim_id)await post('release',{circle_index:index,claim_id:claim.claim_id});
            return;
          }
          // A peer failure stops new claims; finish these already-reserved circles.
          if(!claim.cached){const descriptor=window.SurviveCensusRing.request(circle);if(claim.census_request?.url!==descriptor.url||claim.census_request?.maximum_response_bytes!==descriptor.maximum_response_bytes||![1,2,3].includes(claim.attempt_number)||claim.claim_id!==(claim.attempt_number===1?circle.id:circle.id+'-retry-'+claim.attempt_number))throw Error('The Census circle request does not match its reserved budget.');
            sent=true;attempted++;state.providerCalls.Catalog++;providerCounts();
            const response=await appFetch(descriptor.url,{method:'GET',headers:{Accept:'application/json'},redirect:'error',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(CENSUS_CIRCLE_TIMEOUT_MS)}),payload=await censusResponseJson(response,descriptor.maximum_response_bytes);
            // Cache a request that already completed even if settings changed.
            // This does not launch another Census request or restore old gates.
            rememberPendingCensus(side,circle.id,{ring_id:expected.id,claim_id:claim.claim_id,payload});
            await post('ingest',{circle_index:index,claim_id:claim.claim_id,census_payload:payload});ingested=true;
            forgetPendingCensus(side,circle.id);
            markCensusCircleSaved(side,circle.id);
          }
          completed++;activeCircles.delete(index);reportProgress();
        }catch(error){activeCircles.delete(index);if(sent&&!ingested)state.uncertainAttempts.push({provider:'Census TIGERweb',page_id:circle.id,side,scope:'circle_not_cached'});if(!failure)failure={index,error:censusCircleError(error)};stopped=true;reportProgress();}
      }}
      await Promise.all([run(),run(),run()]);if(!current())return;
      if(failure)throw Error(label+' search stopped at circle '+(failure.index+1)+' of '+expected.circles.length+'. '+failure.error.message+' '+completed+' completed circles were saved.');
      message('WAIT — '+label+': all '+expected.circles.length+' circles finished. Merging roads, removing duplicates, and choosing gates within your band.');
      const merged=await post('merge');if(!current())return;catalog=merged.catalog;
    }
    const valid=window.SurviveShotgun.validateCatalog(catalog);if(!catalogCovers(origin,params.outer_miles,valid,params.inner_miles))throw Error('The returned roads do not cover the complete requested ring.');
    state.intersectionCatalogs[side]=valid;if(side==='start')state.intersectionCatalog=valid;state.catalogFaults[side]=null;setCatalogRetryCue(side);
    log(label+' ring complete: '+expected.circles.length+' circles; '+attempted+' Census requests this run; '+(catalog.search_summary?.unique_roads??0)+' unique roads; '+(catalog.search_summary?.duplicate_roads_removed??0)+' duplicate road results removed.');
    suggestShotgunGates({side,skipPageFault:true});
  }catch(error){if(current()){setCatalogRetryCue(side,expected.id);const pending=[...pendingCensusCircleSaves[side].values()].filter(item=>item.ring_id===expected.id).length;const retryMessage=error.message+' No automatic Census retry. Select Retry '+label+' Census lookup to resume using saved circles.'+(pending?' Retry first saves '+pending+' completed Census response'+(pending===1?'':'s')+' still held in this tab, without requesting those circles again.':'');status.textContent=retryMessage;notice(retryMessage);const list=$('http-error-advisory-list');if(list&&typeof document.createElement==='function'){const row=document.createElement('li');row.textContent=status.textContent;list.append(row);if($('http-error-advisory').hidden){$('http-error-advisory').hidden=false;$('close-http-error-advisory').focus?.();}}}}
  finally{endWorking();state.catalogBusy[side]=false;settled();providerCounts();updateNextAction();}
}

function updateCensusRingBudget(){const target=$('shotgun-search-budget');if(!target||!window.SurviveCensusRing)return;try{const plan=window.SurviveCensusRing.plan({origin:[0,0],inner_miles:Number($('shotgun-inner').value),outer_miles:Number($('shotgun-outer').value)});target.textContent=plan.circles.length+' small circles per trip end — up to '+(plan.circles.length*2)+' Census requests for both ends. Saved circles reduce that number. Nothing starts until GO.';}catch{target.textContent='Enter valid inner and outer radii to see the circle-search limit. Nothing starts until GO.';}}
