import assert from 'node:assert/strict';

const BASELINE = {
  origin: {lat:41.9000,lon:-87.6500},
  destination: {lat:41.9100,lon:-87.6400}
};
const HALF_LAT = 0.00045;
const HALF_LON = 0.00035;

function decodePolyline6(value) {
  if (typeof value !== 'string' || !value.length || value.length > 160000) throw Error('Valhalla returned an invalid route shape.');
  const points=[];let index=0,lat=0,lon=0;
  function delta(){let result=0,shift=0,byte;do{if(index>=value.length||shift>35)throw Error('Invalid Valhalla polyline.');byte=value.charCodeAt(index++)-63;if(byte<0||byte>63)throw Error('Invalid Valhalla polyline.');result|=(byte&31)<<shift;shift+=5;}while(byte>=32);return(result&1)?~(result>>1):result>>1;}
  while(index<value.length){lat+=delta();lon+=delta();points.push([lon/1e6,lat/1e6]);}
  if(points.length<2)throw Error('Valhalla route shape has fewer than two points.');
  return points;
}

function rectangleAround(point) {
  const [lon,lat]=point;
  return [[lon-HALF_LON,lat-HALF_LAT],[lon+HALF_LON,lat-HALF_LAT],[lon+HALF_LON,lat+HALF_LAT],[lon-HALF_LON,lat+HALF_LAT],[lon-HALF_LON,lat-HALF_LAT]];
}

function segmentIntersectsRing(a,b,ring) {
  const minX=Math.min(...ring.map(p=>p[0])),maxX=Math.max(...ring.map(p=>p[0]));
  const minY=Math.min(...ring.map(p=>p[1])),maxY=Math.max(...ring.map(p=>p[1]));
  let t0=0,t1=1,dx=b[0]-a[0],dy=b[1]-a[1];
  for(const [p,q] of [[-dx,a[0]-minX],[dx,maxX-a[0]],[-dy,a[1]-minY],[dy,maxY-a[1]]]){
    if(Math.abs(p)<1e-15){if(q<0)return false;continue;}
    const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}
  }
  return true;
}

function routeIntersectsRing(points,ring) {
  return points.some(point=>point[0]>=Math.min(...ring.map(p=>p[0]))&&point[0]<=Math.max(...ring.map(p=>p[0]))&&point[1]>=Math.min(...ring.map(p=>p[1]))&&point[1]<=Math.max(...ring.map(p=>p[1])))||points.slice(1).some((point,index)=>segmentIntersectsRing(points[index],point,ring));
}

function routeGeometry(response,label) {
  const shape=response?.trip?.legs?.[0]?.shape;
  if(typeof shape!=='string')throw Error(`${label}: Valhalla did not return a route shape.`);
  return decodePolyline6(shape);
}

function validateLoopbackEndpoint(value) {
  const url=new URL(value);
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.pathname!=='/route'||url.username||url.password||url.search||url.hash)throw Error('The polygon integration check only sends requests to a loopback HTTP /route endpoint.');
  return url;
}

function payload(id) {
  return {locations:[BASELINE.origin,BASELINE.destination],costing:'auto',units:'kilometers',shape_format:'polyline6',directions_type:'none',id};
}

function offlineChecks() {
  const ring=rectangleAround([-87.6481,41.9045]);
  assert.equal(ring.length,5,'the exclusion ring is closed');
  assert.ok(ring.every(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)),'polygon points use finite [longitude, latitude] coordinates');
  assert.equal(ring[0][0],ring.at(-1)[0]);assert.equal(ring[0][1],ring.at(-1)[1]);
  assert.equal(routeIntersectsRing([[-87.6481,41.9040],[-87.6481,41.9050]],ring),true,'the segment intersection check detects a route crossing');
  assert.equal(routeIntersectsRing([[-87.6490,41.9045],[-87.6486,41.9045]],ring),false,'the segment intersection check permits a detour around the zone');
}

offlineChecks();
if(!process.argv.includes('--live')){
  console.log('Offline polygon and route-intersection checks passed. No network request sent.');
  console.log('To compare an unexcluded baseline with its polygon-constrained reroute on local Valhalla, run: node check-valhalla-exclude-polygons.mjs --live');
  process.exit(0);
}

const endpoint=validateLoopbackEndpoint(process.env.VALHALLA_ROUTE_URL??'http://127.0.0.1:8002/route');
const sendOnce=async body=>{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{throw Error(`Valhalla returned non-JSON HTTP ${response.status}.`);}
  if(!response.ok)throw Error(`Valhalla returned HTTP ${response.status}: ${data.error??data.status??'route request failed'}. No retry was made.`);
  return data;
};

// Exactly two sequential local-engine requests: baseline, then the same trip
// with a closed polygon centered on the baseline route. No retries or alternates.
const baseline=await sendOnce(payload('exclude-polygon-baseline-test'));
const baselinePoints=routeGeometry(baseline,'Baseline');
const center=baselinePoints[Math.floor((baselinePoints.length-1)*0.35)];
const ring=rectangleAround(center);
assert.ok(routeIntersectsRing(baselinePoints,ring),'the generated polygon must cross the unexcluded baseline');
const constrained=await sendOnce({...payload('exclude-polygon-constrained-test'),exclude_polygons:[ring]});
const constrainedPoints=routeGeometry(constrained,'Polygon-constrained reroute');
assert.equal(routeIntersectsRing(constrainedPoints,ring),false,'the constrained Valhalla route must avoid the polygon crossed by its baseline');
assert.notDeepEqual(constrainedPoints,baselinePoints,'Valhalla must return a route changed by the exclusion polygon');
assert.ok(Number.isFinite(baseline.trip?.summary?.length)&&Number.isFinite(constrained.trip?.summary?.length),'both route responses must include measured route summaries');
console.log(`Passed local Valhalla polygon reroute: baseline ${baseline.trip.summary.length} km crossed the test zone; constrained route ${constrained.trip.summary.length} km avoided it. Exactly 2 requests; no retries.`);
