// Circle pages use the existing durable catalog and attempt tables, with v11 keys.
async function ringCached(db,id){const row=await db.prepare('SELECT catalog_json FROM intersection_catalog_pages WHERE page_id = ?').bind(id).first();return row?JSON.parse(row.catalog_json):null;}
async function ringSave(db,id,center,radius,value){await db.prepare('INSERT INTO intersection_catalog_pages (page_id, catalog_version, center_latitude, center_longitude, radius_m, catalog_json, acquired_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(page_id) DO NOTHING').bind(id,SurviveCensusRing.VERSION,center[0],center[1],radius,JSON.stringify(value),new Date().toISOString()).run();}
async function mergeCensusRing(db,plan,zero){
  const existing=await ringCached(db,plan.id);if(existing)return json({catalog:existing,...zero});
  // Retain IDs and at most ~2,000 geographic bins, not the entire road geometry.
  const seen=new Set(),seeds=new Map(),chunkSpec={origin:plan.origin,radius_m:plan.radius_m,inner_radius_m:plan.inner_m,allow_empty:true,checkpoint_seeds:seeds,maximum_vertices:4096,maximum_segments:4096,defer_result:true};
  let rawRoads=0,vertices=0,segments=0,chunks=0,buffer=[],bufferVertices=0;
  const flush=()=>{if(!buffer.length)return;tigerIntersections({features:buffer},chunkSpec);chunks++;buffer=[];bufferVertices=0;};
  try{
    for(let offset=0;offset<plan.circles.length;offset+=8){
      const ids=plan.circles.slice(offset,offset+8).map(c=>c.id),result=await db.prepare('SELECT page_id, catalog_json FROM intersection_catalog_pages WHERE page_id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all(),pages=new Map(result.results.map(row=>[row.page_id,row]));
      if(ids.some(id=>!pages.has(id)))return json({error:'Some circles are unfinished. Completed circles are saved; select Retry to continue.',...zero},409);
      for(const id of ids){const circle=JSON.parse(pages.get(id).catalog_json);if(circle.schema!=='survive_drive_census_circle_v1'||!Array.isArray(circle.roads))throw Error('A saved circle is invalid.');
        for(const road of circle.roads){rawRoads++;const key=SurviveCensusRing.roadKey(road);if(seen.has(key))continue;seen.add(key);vertices+=road.paths.reduce((sum,path)=>sum+path.length,0);segments+=road.paths.reduce((sum,path)=>sum+Math.max(0,path.length-1),0);
          if(seen.size>200000||vertices>2000000){const error=Error('The ring exceeds the total processing budget of 200,000 unique roads or 2,000,000 coordinates. Saved circles are retained. Narrow the band before GO.');error.code='ring_total_processing_limit';throw error;}
          for(const path of road.paths)for(let start=0;start<path.length-1;start+=4095){
            const part=path.slice(start,start+4096);if(bufferVertices+part.length>4096||buffer.length>=256)flush();
            buffer.push({attributes:{NAME:road.name},geometry:{paths:[part]}});bufferVertices+=part.length;
          }
        }
      }
    }
    flush();
    const points=tigerIntersections({features:[]},{...chunkSpec,defer_result:false}),unique=Array.from(new Map(points.map(p=>[p.latitude.toFixed(6)+','+p.longitude.toFixed(6),p])).values());
    const summary={circles:plan.circles.length,unique_roads:seen.size,duplicate_roads_removed:rawRoads-seen.size,vertices,segments,chunks_processed:chunks};
    const catalog={schema:'survive_drive_intersection_catalog_v1',version:SurviveCensusRing.VERSION,source:'Census roads merged in bounded chunks from overlapping circles; duplicate roads removed and gate points clipped to the requested ring.',coverage:{center:plan.origin,inner_radius_m:plan.inner_m,radius_m:plan.radius_m,exhaustive:true,jurisdiction:'USA'},intersections:unique,search_summary:summary};
    await ringSave(db,plan.id,plan.origin,plan.radius_m,catalog);console.log(JSON.stringify({event:'census_ring_merged',ring_id:plan.id,...summary,candidates:unique.length}));return json({catalog,...zero});
  }catch(error){const failureCode=error.code??'ring_merge_processing';console.error(JSON.stringify({event:'census_ring_merge_failed',ring_id:plan.id,failure_code:failureCode,unique_roads:seen.size,vertices,segments,chunks_processed:chunks,error:error.message}));return json({error:error.message,failure_code:failureCode,retryable:failureCode!=='ring_total_processing_limit',...zero},422);}
}
async function censusRing(request,env,operation){
  let body,plan;try{body=await readBody(request,operation==='ingest'?5*1024*1024+32768:4096);plan=SurviveCensusRing.plan(body);}catch(error){return json({error:error.message},400);}
  const db=database(env),zero={source_attempted:false,source_calls:0,here_calls:0,rentcast_calls:0};
  if(operation==='plan'){const catalog=await ringCached(db,plan.id);return json({plan,catalog,...zero});}
  if(operation==='merge')return mergeCensusRing(db,plan,zero);
  const index=body.circle_index,circle=Number.isInteger(index)?plan.circles[index]:null;if(!circle)return json({error:'Use a circle from the current ring plan.',...zero},400);
  const saved=await ringCached(db,circle.id);if(saved)return json({cached:true,circle_id:circle.id,...zero});
  if(operation==='release'){
    if(![circle.id,circle.id+'-retry-2',circle.id+'-retry-3'].includes(body.claim_id))return json({error:'The unused reservation does not match this circle.',...zero},409);
    const ids=[circle.id,circle.id+'-retry-2',circle.id+'-retry-3'],later=ids.slice(ids.indexOf(body.claim_id)+1);if(!later.length)later.push('no-later-circle-claim');
    await db.prepare('DELETE FROM provider_rounds WHERE round_id = ? AND provider = ? AND settings = ? AND NOT EXISTS (SELECT 1 FROM provider_rounds WHERE provider = ? AND round_id IN ('+later.map(()=>'?').join(',')+'))').bind(body.claim_id,'Census TIGERweb',JSON.stringify(circle),'Census TIGERweb',...later).run();
    return json({released:true,...zero});
  }
  if(operation==='claim'){
    const used=await catalogAttemptCount(db,circle.id),retry=body.retry_requested===true;if(used>=3||used>0&&!retry)return json({error:used>=3?'This circle has used its three attempts.':'This circle was attempted before. Select Retry to resume the ring.',retry_available:used<3,...zero},409);
    const attempt=used+1,claimId=used?circle.id+'-retry-'+attempt:circle.id;
    const row=await db.prepare('INSERT INTO provider_rounds (round_id, provider, settings, maximum_attempts, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM provider_rounds WHERE provider = ? AND round_id IN (?, ?, ?)) = ? ON CONFLICT(round_id) DO NOTHING RETURNING round_id').bind(claimId,'Census TIGERweb',JSON.stringify(circle),1,new Date().toISOString(),'Census TIGERweb',circle.id,circle.id+'-retry-2',circle.id+'-retry-3',used).first();if(!row)return json({error:'Another search reserved this circle. No duplicate Census request was made.',...zero},409);
    return json({circle_id:circle.id,claim_id:claimId,attempt_number:attempt,census_request:SurviveCensusRing.request(circle),...zero});
  }
  if(operation==='ingest'){
    if(![circle.id,circle.id+'-retry-2',circle.id+'-retry-3'].includes(body.claim_id))return json({error:'The circle claim does not match this request.',...zero},409);
    const row=await db.prepare('SELECT settings FROM provider_rounds WHERE round_id = ? AND provider = ?').bind(body.claim_id,'Census TIGERweb').first();if(!row||JSON.stringify(JSON.parse(row.settings))!==JSON.stringify(circle))return json({error:'No matching circle request was reserved.',...zero},409);
    let roads;try{roads=SurviveCensusRing.normalize(body.census_payload);}catch(error){console.error(JSON.stringify({provider:'Census TIGERweb',circle_id:circle.id,phase:'circle_validation',error:error.message,feature_count:body.census_payload?.features?.length,transfer_limit:body.census_payload?.exceededTransferLimit===true}));return json({error:error.message,failure_code:'census_circle_validation',source_attempted:true,source_calls:1,here_calls:0,rentcast_calls:0},422);}
    await ringSave(db,circle.id,circle.center,circle.radius_m,{schema:'survive_drive_census_circle_v1',roads});return json({cached:true,circle_id:circle.id,road_count:roads.length,source_attempted:true,source_calls:1,here_calls:0,rentcast_calls:0});
  }
  return json({error:'Unknown circle operation.',...zero},404);
}
