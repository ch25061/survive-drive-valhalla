/* Locked CHI1K-V1 grid and exact segment clipping, ported from the saved pilot. */
(function(global){
  'use strict';
  function createGrid(LAT,LON,PREFIX,MAX_DISTANCE){
  const RAD=Math.PI/180, EARTH=6371008.8;
  const SIN=Math.sin(LAT*RAD),COS=Math.cos(LAT*RAD),SPACING=1000,HEIGHT=Math.sqrt(3)*500,RADIUS=1000/Math.sqrt(3);
  function forward(lon,lat){const phi=lat*RAD,delta=(lon-LON)*RAD,c=Math.acos(Math.max(-1,Math.min(1,SIN*Math.sin(phi)+COS*Math.cos(phi)*Math.cos(delta)))),k=c===0?1:c/Math.sin(c);return[EARTH*k*Math.cos(phi)*Math.sin(delta),EARTH*k*(COS*Math.sin(phi)-SIN*Math.cos(phi)*Math.cos(delta))];}
  function inverse(x,y){const rho=Math.hypot(x,y);if(!rho)return[LON,LAT];const c=rho/EARTH,s=Math.sin(c),co=Math.cos(c);const longitude=(LON*RAD+Math.atan2(x*s,rho*COS*co-y*SIN*s))/RAD;return[longitude>180||longitude< -180?((longitude+180)%360+360)%360-180:longitude,Math.asin(co*SIN+y*s*COS/rho)/RAD];}
  function center(q,r){return[SPACING*(q+r/2),HEIGHT*r];}
  function vertices(q,r){const [x,y]=center(q,r);return Array.from({length:6},(_,i)=>[x+RADIUS*Math.cos((30+i*60)*RAD),y+RADIUS*Math.sin((30+i*60)*RAD)]);}
  function clip(start,end,polygon){const dx=end[0]-start[0],dy=end[1]-start[1];let enter=0,leave=1;for(let i=0;i<6;i++){const a=polygon[i],b=polygon[(i+1)%6],ex=b[0]-a[0],ey=b[1]-a[1],side=ex*(start[1]-a[1])-ey*(start[0]-a[0]),direction=ex*dy-ey*dx;if(Math.abs(direction)<=1e-8){if(side < -1e-8)return null;continue;}const bound=-side/direction;if(direction>0)enter=Math.max(enter,bound);else leave=Math.min(leave,bound);if(enter>leave+1e-8)return null;}return[Math.max(0,enter),Math.min(1,leave)];}
  function authority(route){
    const sections=route.here_evidence?.sections,offsets=route.section_offsets;
    if(!Array.isArray(sections)||!Array.isArray(offsets)||sections.length!==offsets.length||!sections.length)throw Error('This route needs its saved HERE spans to determine highway authority. Load the last HERE response.');
    const segmentKinds=Array(route.geometry.length-1).fill(null);
    for(let s=0;s<sections.length;s++){
      const start=offsets[s].start_offset,end=offsets[s].end_offset,spans=sections[s].spans;
      if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>=route.geometry.length||start>=end||!Array.isArray(spans)||!spans.length||spans[0].offset!==0)throw Error('HERE authority evidence is incomplete; no AVM requests can be prepared.');
      const localCount=end-start;
      for(let i=0;i<spans.length;i++){
        const span=spans[i],next=i+1<spans.length?spans[i+1].offset:localCount;
        if(!Number.isInteger(span.offset)||span.offset<0||span.offset>localCount||!Number.isInteger(next)||next<span.offset||next>localCount||!Array.isArray(span.streetAttributes))throw Error('HERE span offsets or street attributes are incomplete.');
        const ramp=span.streetAttributes.includes('ramp'),controlled=span.streetAttributes.includes('controlledAccessHighway');
        for(let j=start+span.offset;j<start+next;j++){
          const prior=segmentKinds[j],kind={ramp,controlled};
          if(prior&&(prior.ramp!==kind.ramp||prior.controlled!==kind.controlled))throw Error('HERE sections contain conflicting highway authority evidence.');
          segmentKinds[j]=kind;
        }
      }
    }
    for(let i=0;i<segmentKinds.length;i++)if(!segmentKinds[i])throw Error('HERE sections contain a gap. Highway authority is unknown across that gap.');
    const highway=segmentKinds.map(kind=>kind.controlled);
    // A ramp belongs to HERE highway authority only when it is attached to a
    // controlled-access run.  Extend through complete chains of adjoining
    // ramps, but stop at the first ordinary surface-street span.
    for(let i=0;i<highway.length;i++)if(highway[i]){
      for(let j=i-1;j>=0&&segmentKinds[j].ramp;j--)highway[j]=true;
      for(let j=i+1;j<highway.length&&segmentKinds[j].ramp;j++)highway[j]=true;
    }
    const ranges=[];
    for(let i=0;i<highway.length;){
      if(!highway[i]){i++;continue;}
      const entry=i;while(i<highway.length&&highway[i])i++;ranges.push([entry,i]);
    }
    return ranges;
  }
  function savedAuthority(route){
    if(route.here_evidence)return authority(route);
    if(route.live_here)throw Error('This live route needs its complete saved HERE spans.');
    if(route.live_valhalla&&route.authority_source!=='valhalla_maneuvers_v1')throw Error('Valhalla highway evidence is unavailable for this route. Load its original response or search again before AVM evaluation.');
    const ranges=Array.isArray(route.authority_ranges)?route.authority_ranges:Array.isArray(route.authority_offsets)?[route.authority_offsets]:null;
    if(!ranges)throw Error('This route needs its saved HERE spans or highway-authority offsets.');
    if(ranges.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)||p[0]<0||p[0]>=p[1]||p[1]>=route.geometry.length))throw Error('Saved highway authority is incomplete.');return ranges;
  }
  function mapRoute(route){
    if(!Array.isArray(route.geometry)||route.geometry.length<2||route.geometry.length>20000)throw Error('Use a route with 2–20,000 geometry points.');
    const ranges=savedAuthority(route),points=route.geometry.map(p=>{if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('Invalid route geometry.');const xy=forward(...p);if(Math.hypot(...xy)>MAX_DISTANCE)throw Error('Route exceeds this regional honeycomb extent.');return xy;}),records=new Map();let work=0;
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)continue;const under=ranges.some(p=>p[0]<=i&&i<p[1]);
      const minX=Math.min(a[0],b[0])-RADIUS,maxX=Math.max(a[0],b[0])+RADIUS,minY=Math.min(a[1],b[1])-RADIUS,maxY=Math.max(a[1],b[1])+RADIUS;
      for(let r=Math.floor(minY/HEIGHT)-1;r<=Math.ceil(maxY/HEIGHT)+1;r++)for(let q=Math.floor(minX/SPACING-r/2)-1;q<=Math.ceil(maxX/SPACING-r/2)+1;q++){
        if(++work>2000000)throw Error('Route geometry exceeds this evaluation’s processing limit.');
        const hit=clip(a,b,vertices(q,r));if(!hit)continue;const distance=Math.max(0,hit[1]-hit[0])*length;if(distance<=1e-7)continue;
        const id=PREFIX+'-Q'+(q>=0?'+':'')+q+'-R'+(r>=0?'+':'')+r;
        if(!records.has(id))records.set(id,{cell_id:id,q,r,outside_here_distance_m:0,here_distance_m:0});const cell=records.get(id);cell[under?'here_distance_m':'outside_here_distance_m']+=distance;
      }
    }
    const cells=Array.from(records.values()).filter(c=>c.outside_here_distance_m>=1).sort((a,b)=>a.r-b.r||a.q-b.q);
    if(cells.length>1000)throw Error('This route crosses more than 1,000 eligible cells.');
    for(const cell of cells){const [lon,lat]=inverse(...center(cell.q,cell.r));cell.latitude=Number(lat.toFixed(8));cell.longitude=Number(lon.toFixed(8));cell.polygon=vertices(cell.q,cell.r).map(p=>inverse(...p));cell.polygon.push(cell.polygon[0].slice());cell.estimate_ppsqft=null;cell.value_origin='pending';cell.acquired_at=null;cell.query_location='locked_grid_center';}
    return{cells,authority_ranges:ranges,authority_offsets:ranges.length===1?ranges[0]:null,authority_only_cell_count:Array.from(records.values()).filter(c=>c.outside_here_distance_m<1&&c.here_distance_m>=1).length,avm_mapping:PREFIX,avm_status:cells.length?'mapped_missing_values':'no_eligible_non_highway_cells',authority_rule:route.live_valhalla?'Valhalla highway maneuvers and their attached ramps are excluded; remaining street segments are AVM-eligible.':'each controlled-access highway run plus its attached entry and exit ramps is HERE and excluded; every remaining overland segment is OURS and AVM-eligible'};
  }
  function routeCellPositions(route){
    if(!Array.isArray(route.geometry)||route.geometry.length<2||route.geometry.length>20000)throw Error('Spaced sampling needs the saved route geometry.');
    let ranges;
    if(route.live_valhalla&&route.authority_source!=='valhalla_maneuvers_v1')throw Error('Valhalla highway evidence is unavailable for spaced sampling.');
    if(route.here_evidence)ranges=authority(route);
    else if(Array.isArray(route.authority_ranges))ranges=route.authority_ranges;
    else if(Array.isArray(route.authority_offsets))ranges=[route.authority_offsets];
    else throw Error('Spaced sampling needs the route highway-authority evidence. Evaluate the selected route first.');
    if(ranges.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)||p[0]<0||p[0]>=p[1]||p[1]>=route.geometry.length))throw Error('Spaced sampling needs valid highway-authority offsets.');
    const intervals=new Map(),ids=new Set(route.cells.map(c=>c.cell_id)),points=route.geometry.map(p=>{if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('Invalid route geometry.');const xy=forward(...p);if(Math.hypot(...xy)>MAX_DISTANCE)throw Error('Spaced sampling needs the enclosing regional honeycomb.');return xy;});
    let station=0,work=0;
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length||ranges.some(p=>p[0]<=i&&i<p[1]))continue;
      for(let r=Math.floor((Math.min(a[1],b[1])-RADIUS)/HEIGHT)-1;r<=Math.ceil((Math.max(a[1],b[1])+RADIUS)/HEIGHT)+1;r++)for(let q=Math.floor((Math.min(a[0],b[0])-RADIUS)/SPACING-r/2)-1;q<=Math.ceil((Math.max(a[0],b[0])+RADIUS)/SPACING-r/2)+1;q++){
        if(++work>2000000)throw Error('Route geometry exceeds the spaced-sampling processing limit.');
        const id=PREFIX+'-Q'+(q>=0?'+':'')+q+'-R'+(r>=0?'+':'')+r;if(!ids.has(id))continue;
        const hit=clip(a,b,vertices(q,r));if(!hit||(hit[1]-hit[0])*length<=1e-7)continue;
        if(!intervals.has(id))intervals.set(id,[]);intervals.get(id).push([station+hit[0]*length,station+hit[1]*length]);
      }
      station+=length;
    }
    return{intervals,total_non_highway_distance_m:station};
  }
  function enclosingHoneycomb(route){
    if(!Array.isArray(route.geometry)||route.geometry.length<2||route.geometry.length>20000)throw Error('Honeycomb coverage needs 2–20,000 route geometry points.');
    const points=route.geometry.map(p=>{if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('Invalid route geometry.');const xy=forward(...p);if(Math.hypot(...xy)>MAX_DISTANCE)throw Error('Route exceeds this regional honeycomb extent. Evaluation is paused.');return xy;}),crossed=new Map();let work=0;
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1];
      for(let r=Math.floor((Math.min(a[1],b[1])-RADIUS)/HEIGHT)-1;r<=Math.ceil((Math.max(a[1],b[1])+RADIUS)/HEIGHT)+1;r++)for(let q=Math.floor((Math.min(a[0],b[0])-RADIUS)/SPACING-r/2)-1;q<=Math.ceil((Math.max(a[0],b[0])+RADIUS)/SPACING-r/2)+1;q++){
        if(++work>2000000)throw Error('Honeycomb construction exceeds this route processing limit. Evaluation is paused.');const hit=clip(a,b,vertices(q,r));if(hit&&hit[1]>=hit[0])crossed.set(q+','+r,{q,r});
      }
    }
    const all=new Map(crossed);for(const {q,r} of crossed.values())for(const [dq,dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]])all.set((q+dq)+','+(r+dr),{q:q+dq,r:r+dr});
    if(all.size>10000)throw Error('This route needs more than 10,000 enclosing honeycomb cells. Evaluation is paused.');
    const cells=Array.from(all.values()).sort((a,b)=>a.r-b.r||a.q-b.q).map(({q,r})=>{const [lon,lat]=inverse(...center(q,r)),polygon=vertices(q,r).map(p=>inverse(...p));polygon.push(polygon[0].slice());return{cell_id:PREFIX+'-Q'+(q>=0?'+':'')+q+'-R'+(r>=0?'+':'')+r,q,r,latitude:Number(lat.toFixed(8)),longitude:Number(lon.toFixed(8)),polygon};});
    return{grid_version:PREFIX,grid_anchor:{latitude:LAT,longitude:LON},regional_grid:PREFIX!=='CHI1K-V1',cells,route_cell_count:crossed.size,neighbor_rings:1};
  }
  return{grid_version:PREFIX,grid_anchor:{latitude:LAT,longitude:LON},mapRoute,enclosingHoneycomb,routeCellPositions,authority,forward,inverse,center,vertices,clip};
  }
  // Geographic regions own their anchors. Route shape, direction, gates and
  // selected candidate never change the lattice. CHI1K-V1 keeps its original
  // projection and identifiers while covering North America, including Hawaii.
  const REGION_RADIUS=8000000;
  const legacy=createGrid(41.91063814,-87.66769738,'CHI1K-V1',REGION_RADIUS);
  const fixedRegions=[
    {latitude:-15,longitude:-60,prefix:'REG1K-V1-LAT-15-LON-60'},
    {latitude:50,longitude:10,prefix:'REG1K-V1-LAT+50-LON+10'},
    {latitude:0,longitude:20,prefix:'REG1K-V1-LAT+0-LON+20'},
    {latitude:35,longitude:100,prefix:'REG1K-V1-LAT+35-LON+100'},
    {latitude:-25,longitude:135,prefix:'REG1K-V1-LAT-25-LON+135'}
  ];
  const grids=new Map([['CHI1K-V1',legacy],...fixedRegions.map(region=>[region.prefix,createGrid(region.latitude,region.longitude,region.prefix,REGION_RADIUS)])]);
  function gridForVersion(prefix){
    if(grids.has(prefix))return grids.get(prefix);
    // Older route-dependent grids remain readable at their original locations.
    const match=/^REG1K-V1-LAT([+-]\d+)-LON([+-]\d+)$/.exec(prefix??'');
    if(!match)throw Error('Saved map-cell evidence has an unsupported grid.');
    const lat=Number(match[1]),lon=Number(match[2]),signed=n=>(n>=0?'+':'')+n;
    if(!Number.isInteger(lat)||Math.abs(lat)>89||!Number.isInteger(lon)||lon< -180||lon>=180||prefix!=='REG1K-V1-LAT'+signed(lat)+'-LON'+signed(lon))throw Error('Saved map-cell evidence has an invalid regional anchor.');
    return createGrid(lat,lon,prefix,2000000);
  }
  function gridForPoint(latitude,longitude){
    if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw Error('Choose a valid map point.');
    const lon=longitude===180?-180:longitude;
    const prefix=lon< -30?(latitude>=0?'CHI1K-V1':fixedRegions[0].prefix):lon<60?(latitude>=35?fixedRegions[1].prefix:fixedRegions[2].prefix):(latitude>=0?fixedRegions[3].prefix:fixedRegions[4].prefix);
    return grids.get(prefix);
  }
  function cellFromIdentity(prefix,q,r){
    const grid=gridForVersion(prefix);
    if(!Number.isSafeInteger(q)||!Number.isSafeInteger(r)||Math.abs(q)>10000||Math.abs(r)>10000)throw Error('Invalid locked-grid honeycomb coordinates.');
    const center=grid.center(q,r);if(Math.hypot(...center)>(grids.has(prefix)?REGION_RADIUS:2000000)+2000)throw Error('Cell is outside its regional honeycomb extent.');
    const [lon,lat]=grid.inverse(...center),polygon=grid.vertices(q,r).map(p=>grid.inverse(...p));polygon.push(polygon[0].slice());
    return{grid_version:prefix,cell_id:prefix+'-Q'+(q>=0?'+':'')+q+'-R'+(r>=0?'+':'')+r,q,r,latitude:Number(lat.toFixed(8)),longitude:Number(lon.toFixed(8)),polygon,estimate_ppsqft:null};
  }
  function isCurrentGridCell(cell){
    if(!Number.isFinite(cell?.latitude)||!Number.isFinite(cell?.longitude))return true;
    const match=/^(.*)-Q[+-]?\d+-R[+-]?\d+$/.exec(cell.cell_id??'');
    return !match||match[1]===gridForPoint(cell.latitude,cell.longitude).grid_version;
  }
  function gridForRoute(route){
    const geometry=route.geometry;if(!Array.isArray(geometry)||geometry.length<2||geometry.length>20000||geometry.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90))throw Error('Use 2–20,000 valid longitude, latitude geometry points.');
    // Imported routes may explicitly retain their validated original grid;
    // preserving that snapshot avoids invalidating already acquired evidence.
    const retained=route.retained_grid_version,grid=retained?gridForVersion(retained):gridForPoint(geometry[0][1],geometry[0][0]);
    if(!retained&&geometry.some(p=>gridForPoint(p[1],p[0]).grid_version!==grid.grid_version))throw Error('This route crosses fixed geographic grid regions. Use a route within one region.');
    const extent=grids.has(grid.grid_version)?REGION_RADIUS:2000000;
    if(geometry.some(p=>Math.hypot(...grid.forward(...p))>extent))throw Error('Route exceeds its fixed regional honeycomb extent. Evaluation is paused.');return grid;
  }
  function cellAt(latitude,longitude,route){
    if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw Error('Choose a valid map point.');
    const grid=gridForPoint(latitude,longitude);
    if(Math.hypot(...grid.forward(longitude,latitude))>REGION_RADIUS)throw Error('Map point exceeds its fixed regional honeycomb extent.');
    const [x,y]=grid.forward(longitude,latitude),r0=Math.round(y/(Math.sqrt(3)*500));let best;
    for(let r=r0-2;r<=r0+2;r++){const q0=Math.round(x/1000-r/2);for(let q=q0-2;q<=q0+2;q++){const center=grid.center(q,r),distance=(x-center[0])**2+(y-center[1])**2;if(!best||distance<best.distance)best={q,r,distance};}}
    const {q,r}=best,[lon,lat]=grid.inverse(...grid.center(q,r)),polygon=grid.vertices(q,r).map(p=>grid.inverse(...p));polygon.push(polygon[0].slice());
    return{grid_version:grid.grid_version,cell_id:grid.grid_version+'-Q'+(q>=0?'+':'')+q+'-R'+(r>=0?'+':'')+r,q,r,latitude:Number(lat.toFixed(8)),longitude:Number(lon.toFixed(8)),polygon,estimate_ppsqft:null};
  }
  global.SurviveAvm={...legacy,cellAt,cellFromIdentity,gridForPoint,gridForRoute,isCurrentGridCell,mapRoute:route=>gridForRoute(route).mapRoute(route),enclosingHoneycomb:route=>gridForRoute(route).enclosingHoneycomb(route),routeCellPositions:route=>gridForRoute(route).routeCellPositions(route)};
})(typeof globalThis==='undefined'?this:globalThis);
