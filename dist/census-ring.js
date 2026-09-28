'use strict';
(function(root){
  const MILE=1609.344,EARTH=6371008.8,STEP=1.4*MILE,RADIUS=Math.ceil(1.05*MILE),MAX_CIRCLES=1024,VERSION='tiger-v11-circles';
  const token=n=>(n<0?'n':'p')+Math.abs(n).toFixed(6).replace('.','');
  function destination(origin,x,y){const rho=Math.hypot(x,y);if(!rho)return origin.slice();const r=Math.PI/180,lat=origin[0]*r,lon=origin[1]*r,c=rho/EARTH,s=Math.sin(c),co=Math.cos(c),p=Math.asin(co*Math.sin(lat)+y*s*Math.cos(lat)/rho),l=lon+Math.atan2(x*s,rho*Math.cos(lat)*co-y*Math.sin(lat)*s);return[Number((p/r).toFixed(6)),Number(((((l/r)+180)%360+360)%360-180).toFixed(6))];}
  function plan(body){
    if(!Array.isArray(body?.origin)||body.origin.length!==2||!body.origin.every(Number.isFinite)||Math.abs(body.origin[0])>85||Math.abs(body.origin[1])>180)throw Error('Use valid trip coordinates between 85 degrees south and north.');
    const inner=Number(body.inner_miles),outer=Number(body.outer_miles);if(!Number.isFinite(inner)||!Number.isFinite(outer)||inner<.25||inner>19||outer<.5||outer>20||inner>=outer)throw Error('Use an inner radius of 0.25–19 miles and an outer radius of 0.5–20 miles, with inner smaller than outer.');
    const origin=body.origin.map(v=>Number(v.toFixed(6))),circles=[],a=inner*MILE,b=outer*MILE,half=STEP/2,n=Math.ceil((b+half)/STEP);
    // Each intersecting square is covered by its circumscribing small circle.
    // The extra 6% radius covers rounding and spherical projection distortion.
    for(let y=-n;y<=n;y++)for(let x=-n;x<=n;x++){const px=x*STEP,py=y*STEP,min=Math.hypot(Math.max(0,Math.abs(px)-half),Math.max(0,Math.abs(py)-half)),max=Math.hypot(Math.abs(px)+half,Math.abs(py)+half);if(min>b||max<a)continue;const center=destination(origin,px,py);circles.push({center,radius_m:RADIUS,id:VERSION+'-'+token(center[0])+'-'+token(center[1])+'-r'+RADIUS});}
    if(circles.length>MAX_CIRCLES)throw Error('This ring exceeds the 1,024-circle search limit. Narrow the band.');
    return{schema:'survive_drive_census_ring_v1',id:VERSION+'-ring-'+token(origin[0])+'-'+token(origin[1])+'-i'+Math.round(a*1000)+'-o'+Math.round(b*1000),origin,inner_miles:inner,outer_miles:outer,inner_m:a,radius_m:b,circles,maximum_source_requests:circles.length};
  }
  function request(circle){const url=new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/7/query');for(const[k,v]of Object.entries({where:'1=1',geometry:JSON.stringify({x:circle.center[1],y:circle.center[0],spatialReference:{wkid:4326}}),geometryType:'esriGeometryPoint',distance:String(circle.radius_m),units:'esriSRUnit_Meter',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'OBJECTID,OID,BASENAME,NAME',returnGeometry:'true',outSR:'4326',geometryPrecision:'6',resultRecordCount:'2000',f:'json'}))url.searchParams.set(k,v);return{url:url.href,method:'GET',headers:{Accept:'application/json'},maximum_response_bytes:5*1024*1024};}
  function normalize(data){
    if(data?.error)throw Error('Census could not complete this small-circle query.');
    if(!Array.isArray(data?.features))throw Error('Census returned no readable road list.');
    if(data.exceededTransferLimit===true||data.properties?.exceededTransferLimit===true||data.features.length>=2000)throw Error('This small circle reached the 2,000-road result limit. No incomplete roads were accepted.');
    const roads=new Map();let vertices=0;
    for(const feature of data.features){const p=feature.attributes??feature.properties??{},name=String(p.NAME??p.BASENAME??'').trim().replace(/\s+/g,' ');if(!name||name.length>150)continue;const g=feature.geometry,paths=g?.paths??(g?.type==='LineString'?[g.coordinates]:g?.type==='MultiLineString'?g.coordinates:null);if(!Array.isArray(paths))throw Error('Census returned unreadable road geometry.');
      const clean=paths.map(path=>{if(!Array.isArray(path))throw Error('Census returned unreadable road geometry.');return path.map(point=>{if(++vertices>50000)throw Error('This small circle exceeded the road-geometry limit.');if(!Array.isArray(point)||point.length<2||!point.slice(0,2).every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90)throw Error('Census returned invalid road coordinates.');return point.slice(0,2).map(v=>Number(v.toFixed(6)));});}).filter(path=>path.length>1);
      const oid=p.OID??p.OBJECTID,key=oid!=null?'road-'+String(oid):roadKey({id:'geometry-',paths:clean});if(!roads.has(key))roads.set(key,{id:key,name,paths:clean});
    }
    const result=Array.from(roads.values());if(new TextEncoder().encode(JSON.stringify(result)).length>750000)throw Error('This small circle exceeded the saved-road size limit.');return result;
  }
  function roadKey(road){if(!road.id.startsWith('geometry-'))return road.id;const paths=road.paths.map(path=>{const forward=JSON.stringify(path),reverse=JSON.stringify(path.slice().reverse());return forward<reverse?forward:reverse;}).sort();return'geometry-'+JSON.stringify(paths);}
  root.SurviveCensusRing={plan,request,normalize,roadKey,destination,MILE,MAX_CIRCLES,VERSION};
})(typeof window==='undefined'?globalThis:window);
