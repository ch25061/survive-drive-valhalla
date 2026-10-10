
/* Immutable global AVM mesh: H3 4.3.0, resolution 8, center precision 8 decimals.
 * H3R8-V1 is permanent. Do not change its geometry, resolution or precision.
 * q/r are the high/low words of the H3 index, NEVER planar axial coordinates.
 */
(function(global){
  'use strict';
  const H=global.h3,VERSION='H3R8-V1',RES=8,RAD=Math.PI/180,EARTH=6371008.8;
  if(!H)throw Error('The pinned global grid library is unavailable.');
  const cache=new Map();
  const wrap=lon=>((lon+180)%360+360)%360-180;
  function validPoint(lat,lon){if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)throw Error('Choose valid latitude and longitude.');}
  function indexOf(id){const m=/^H3R8-V1-([0-9a-f]{15})$/.exec(id??'');if(!m||!H.isValidCell(m[1])||H.getResolution(m[1])!==RES)throw Error('Use a canonical H3R8-V1 cell.');return m[1];}
  function immutableGeometry(id){
    if(cache.has(id))return cache.get(id);
    const index=indexOf(id),[lat,lon]=H.cellToLatLng(index),centerTag=[lat.toFixed(8),wrap(lon).toFixed(8)];
    const polygon=H.cellToBoundary(index,true).map(p=>Object.freeze([p[0],p[1]]));if(polygon.length>1&&polygon[0][0]===polygon.at(-1)[0]&&polygon[0][1]===polygon.at(-1)[1])polygon.pop();polygon.push(polygon[0]);
    const cell=Object.freeze({grid_version:VERSION,cell_id:id,h3_index:index,q:parseInt(index.slice(0,7),16),r:parseInt(index.slice(7),16),latitude:Number(centerTag[0]),longitude:Number(centerTag[1]),center_tag:centerTag.join(','),polygon:Object.freeze(polygon),query_location:'immutable_h3_center',estimate_ppsqft:null});
    if(cache.size>=20000)cache.clear();cache.set(id,cell);return cell;
  }
  function cellFromId(id){const c=immutableGeometry(id);return{...c,polygon:c.polygon.map(p=>p.slice())};}
  function cellFromIdentity(prefix,q,r){if(prefix!==VERSION||!Number.isSafeInteger(q)||q<0||q>0xfffffff||!Number.isSafeInteger(r)||r<0||r>0xffffffff)throw Error('Invalid immutable cell identity.');return cellFromId(prefix+'-'+q.toString(16).padStart(7,'0')+r.toString(16).padStart(8,'0'));}
  function cellAt(lat,lon){validPoint(lat,lon);return cellFromId(VERSION+'-'+H.latLngToCell(lat,wrap(lon),RES));}
  function neighbors(id){return H.gridDisk(indexOf(id),1).filter(i=>i!==indexOf(id)).map(i=>VERSION+'-'+i).sort();}
  function hops(a,b){try{return H.gridDistance(indexOf(a),indexOf(b));}catch{return null;}}
  const vector=p=>{const lat=p[1]*RAD,lon=p[0]*RAD,c=Math.cos(lat);return[c*Math.cos(lon),c*Math.sin(lon),Math.sin(lat)];},dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
  function angle(a,b){return Math.atan2(Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]),Math.max(-1,Math.min(1,dot(a,b))));}
  function sphericalPoint(a,b,t,theta){const s=Math.sin(theta);if(theta<1e-12)return a.slice();const u=Math.sin((1-t)*theta)/s,v=Math.sin(t*theta)/s;return a.map((x,i)=>u*x+v*b[i]);}
  function geographic(v){return[Math.atan2(v[1],v[0])/RAD,Math.atan2(v[2],Math.hypot(v[0],v[1]))/RAD];}
  function projection(mid){const [lon,lat]=geographic(mid).map(x=>x*RAD),east=[-Math.sin(lon),Math.cos(lon),0],north=[-Math.sin(lat)*Math.cos(lon),-Math.sin(lat)*Math.sin(lon),Math.cos(lat)];return v=>{const d=dot(v,mid);if(d<=0)throw Error('Grid clipping exceeded its local hemisphere.');return[dot(v,east)/d,dot(v,north)/d];};}
  function contains(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length>0){const along=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length,across=Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/length;if(across<=1e-12&&along>=-1e-12&&along<=length+1e-12)return true;}if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<dx*(p[1]-a[1])/dy+a[0])inside=!inside;}return inside;}
  function intersections(a,b,ring){const d=[b[0]-a[0],b[1]-a[1]],cross=(u,v)=>u[0]*v[1]-u[1]*v[0],cuts=[];for(let i=0;i<ring.length-1;i++){const p=ring[i],q=ring[i+1],e=[q[0]-p[0],q[1]-p[1]],delta=[p[0]-a[0],p[1]-a[1]],den=cross(d,e);if(Math.abs(den)<1e-22)continue;const t=cross(delta,e)/den,u=cross(delta,d)/den;if(t>0&&t<1&&u>=-1e-8&&u<=1+1e-8)cuts.push(t);}return cuts;}
  function geometry(route){if(!Array.isArray(route.geometry)||route.geometry.length<2||route.geometry.length>20000)throw Error('Use 2–20,000 valid route geometry points.');for(const p of route.geometry){if(!Array.isArray(p)||p.length!==2)throw Error('Invalid route geometry.');validPoint(p[1],p[0]);}return route.geometry;}
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

  function trace(route){
    const line=geometry(route),ranges=savedAuthority(route),records=new Map(),intervals=new Map();let station=0,work=0;
    for(let i=0;i<line.length-1;i++){
      const a=vector(line[i]),b=vector(line[i+1]),theta=angle(a,b),length=theta*EARTH;if(length<1e-7)continue;if(theta>Math.PI-.001)throw Error('Route contains an ambiguous antipodal segment.');
      const under=ranges.some(p=>p[0]<=i&&i<p[1]),steps=Math.ceil(length/200),pieceLength=length/steps;
      for(let j=0;j<steps;j++){
        if(++work>150000)throw Error('Route exceeds the bounded global-grid tracing limit.');
        const va=sphericalPoint(a,b,j/steps,theta),vb=sphericalPoint(a,b,(j+1)/steps,theta),mid=sphericalPoint(a,b,(j+.5)/steps,theta),project=projection(mid),pa=project(va),pb=project(vb),[lon,lat]=geographic(mid),ids=H.gridDisk(H.latLngToCell(lat,lon,RES),2).map(index=>VERSION+'-'+index).sort(),polygons=ids.map(id=>[id,immutableGeometry(id).polygon.map(p=>project(vector(p)))]);
        const cuts=[0,1,...polygons.flatMap(([,ring])=>intersections(pa,pb,ring))].sort((x,y)=>x-y),unique=cuts.filter((t,k)=>!k||t-cuts[k-1]>1e-8);
        for(let k=0;k<unique.length-1;k++){
          const lo=unique[k],hi=unique[k+1];if(hi-lo<1e-9)continue;const t=(lo+hi)/2,p=[pa[0]+(pb[0]-pa[0])*t,pa[1]+(pb[1]-pa[1])*t];
          let id=polygons.find(([,ring])=>contains(p,ring))?.[0];
          // Sorted IDs and a micrometer boundary tolerance give shared-edge roads one owner.
          if(!id){const v=sphericalPoint(va,vb,t,angle(va,vb)),point=geographic(v);id=VERSION+'-'+H.latLngToCell(point[1],point[0],RES);if(!ids.includes(id))throw Error('Canonical route cell was outside the verified corridor.');}
          const distance=(hi-lo)*pieceLength;if(!records.has(id))records.set(id,{...cellFromId(id),outside_here_distance_m:0,here_distance_m:0});records.get(id)[under?'here_distance_m':'outside_here_distance_m']+=distance;
          if(!under){if(!intervals.has(id))intervals.set(id,[]);intervals.get(id).push([station+j*pieceLength+lo*pieceLength,station+j*pieceLength+hi*pieceLength]);}
        }
      }
      if(!under)station+=length;
    }
    return{records,intervals,total_non_highway_distance_m:station,ranges};
  }
  const traces=new WeakMap();function traced(route){const identity=JSON.stringify([route.geometry,route.here_evidence,route.section_offsets,route.authority_ranges,route.authority_offsets,route.authority_source]);const prior=traces.get(route);if(prior?.identity===identity)return prior.result;const result=trace(route);traces.set(route,{identity,result});return result;}
  function mapRoute(route){const result=traced(route),cells=[...result.records.values()].filter(c=>c.outside_here_distance_m>=1).sort((a,b)=>a.cell_id.localeCompare(b.cell_id)).map(c=>({...c,polygon:c.polygon.map(p=>p.slice()),value_origin:'pending',acquired_at:null}));if(cells.length>1000)throw Error('This route crosses more than 1,000 eligible cells.');return{cells,authority_ranges:result.ranges,authority_offsets:result.ranges.length===1?result.ranges[0]:null,authority_only_cell_count:[...result.records.values()].filter(c=>c.outside_here_distance_m<1&&c.here_distance_m>=1).length,avm_mapping:VERSION,avm_status:cells.length?'mapped_missing_values':'no_eligible_non_highway_cells',authority_rule:'Controlled-access highway runs and their attached ramps are excluded; remaining street segments are AVM-eligible.'};}
  function enclosingHoneycomb(route){const result=traced(route),ids=new Set(result.records.keys());for(const id of result.records.keys())for(const neighbor of neighbors(id))ids.add(neighbor);if(ids.size>10000)throw Error('This route needs more than 10,000 enclosing cells.');return{grid_version:VERSION,grid_anchor:{system:'H3',resolution:RES,contract:VERSION},regional_grid:false,cells:[...ids].sort().map(cellFromId),route_cell_count:result.records.size,neighbor_rings:1};}
  function routeCellPositions(route){const result=traced(route),ids=new Set(route.cells.map(c=>c.cell_id));return{intervals:new Map([...result.intervals].filter(([id])=>ids.has(id))),total_non_highway_distance_m:result.total_non_highway_distance_m};}
  function isCurrentGridCell(cell){try{return (cell?.grid_version===undefined||cell.grid_version===VERSION)&&indexOf(cell.cell_id)&&cell.latitude===immutableGeometry(cell.cell_id).latitude&&cell.longitude===immutableGeometry(cell.cell_id).longitude;}catch{return false;}}
  const grid=Object.freeze({grid_version:VERSION,grid_anchor:{system:'H3',resolution:RES,contract:VERSION},mapRoute,enclosingHoneycomb,routeCellPositions});
  global.SurviveAvm={grid_version:VERSION,grid_anchor:grid.grid_anchor,gridForPoint:(lat,lon)=>{validPoint(lat,lon);return grid;},gridForRoute:route=>{geometry(route);return grid;},cellAt,cellFromId,cellFromIdentity,isCurrentGridCell,neighbors,hops,mapRoute,enclosingHoneycomb,routeCellPositions,authority};
})(typeof globalThis==='undefined'?this:globalThis);
