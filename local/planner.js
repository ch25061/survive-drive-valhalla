'use strict';
const $=id=>document.getElementById(id);
const waypoints=[];
const markers=[];
const routeLayers=[];
let map,pick=null,selectedRoute=0,busy=false;
const colors=['#2257d6','#f28c28','#8a48bf','#008f8d'];

function message(value,error=false){$('message').textContent=value;$('message').classList.toggle('error',error);}
function point(value){
  const parts=String(value).trim().split(',').map(x=>Number(x.trim()));
  if(parts.length!==2||!parts.every(Number.isFinite)||Math.abs(parts[0])>90||Math.abs(parts[1])>180)throw Error('Enter latitude, longitude using valid coordinates.');
  return parts;
}
function coordinate(pair){return pair[0].toFixed(6)+', '+pair[1].toFixed(6);}
function renderMarkers(){
  if(!map)return;
  for(const marker of markers)marker.remove();markers.length=0;
  for(const [id,label] of [['origin','Start'],['destination','Destination']]){
    try{const p=point($(id).value);markers.push(L.marker(p).addTo(map).bindTooltip(label,{permanent:true,direction:'top'}));}catch{}
  }
  waypoints.forEach((p,i)=>{markers.push(L.circleMarker(p,{radius:8,color:'#893bc0',fillColor:'#c879eb',fillOpacity:.9}).addTo(map).bindTooltip('Waypoint '+(i+1),{permanent:true,direction:'top'}));});
}
function renderWaypoints(){
  const list=$('waypoints');list.replaceChildren();
  waypoints.forEach((p,i)=>{const li=document.createElement('li');li.append(document.createTextNode(coordinate(p)+' · 200 m radius'));
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.addEventListener('click',()=>{waypoints.splice(i,1);renderWaypoints();renderMarkers();clearRoutes();});li.append(remove);list.append(li);});
  $('count').disabled=waypoints.length>0;
}
function clearRoutes(){for(const layer of routeLayers)layer.remove();routeLayers.length=0;$('routes').textContent='No search for these points yet.';}
function chooseRoute(index){selectedRoute=index;routeLayers.forEach((layer,i)=>{layer.setStyle({weight:i===index?7:4,opacity:i===index?1:.5});if(i===index)layer.bringToFront();});document.querySelectorAll('.route').forEach((button,i)=>button.classList.toggle('selected',i===index));}
function renderRoutes(routes){
  clearRoutes();const box=$('routes');box.replaceChildren();
  routes.forEach((route,i)=>{
    const latlngs=route.geometry.map(([lon,lat])=>[lat,lon]);const layer=L.polyline(latlngs,{color:colors[i],weight:4,opacity:.65}).addTo(map);routeLayers.push(layer);layer.on('click',()=>chooseRoute(i));
    const button=document.createElement('button');button.type='button';button.className='route';button.textContent='Route '+(i+1)+' · '+(route.length_m/1000).toFixed(1)+' km · '+Math.round(route.duration_s/60)+' min';button.addEventListener('click',()=>chooseRoute(i));box.append(button);
  });
  chooseRoute(0);const bounds=L.featureGroup([...routeLayers,...markers]).getBounds();if(bounds.isValid())map.fitBounds(bounds.pad(.12));
}
async function status(){try{const response=await fetch('/status',{cache:'no-store'}),result=await response.json();$('status').textContent=result.valhalla_ready?'Valhalla is ready on this computer':'Valhalla is not ready';$('status').className=result.valhalla_ready?'ready':'bad';$('search').disabled=!result.valhalla_ready;return result.valhalla_ready;}catch{$('status').textContent='Local service unavailable';$('status').className='bad';$('search').disabled=true;return false;}}
async function search(){
  if(busy)return;
  let origin,destination;try{origin=point($('origin').value);destination=point($('destination').value);}catch(error){message(error.message,true);return;}
  if(!await status()){message('Start the local Valhalla service, then refresh this page.',true);return;}
  busy=true;$('search').disabled=true;message('Searching this computer’s road map…');clearRoutes();
  const params={origin:coordinate(origin),destination:coordinate(destination),via:waypoints.map(p=>coordinate(p)+';radius=200'),transportMode:'car',routingMode:$('mode').value,departureTime:'any',alternatives:waypoints.length?0:Number($('count').value)-1};
  try{
    const response=await fetch('/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved:true,round_id:crypto.randomUUID(),params}),signal:AbortSignal.timeout(30000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Route request failed.');
    const routes=SurviveValhalla.convertRoutes(data.response,data.round_id);renderRoutes(routes);message(routes.length+' route'+(routes.length===1?'':'s')+' returned. No automatic retries.');
  }catch(error){message(error.message||'Route request failed. No automatic retry was made.',true);}finally{busy=false;await status();}
}
function initMap(){
  if(!globalThis.L){message('The map library could not load. Check your Internet connection and refresh.',true);return;}
  map=L.map('map').setView([40.5,-87.2],7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map);
  map.on('click',event=>{if(!pick)return;const p=[event.latlng.lat,event.latlng.lng];if(pick==='waypoint'){waypoints.push(p);renderWaypoints();}else $(pick).value=coordinate(p);pick=null;document.querySelectorAll('[data-pick]').forEach(button=>button.classList.remove('active-pick'));renderMarkers();clearRoutes();});
}
document.querySelectorAll('[data-pick]').forEach(button=>button.addEventListener('click',()=>{pick=button.dataset.pick;document.querySelectorAll('[data-pick]').forEach(item=>item.classList.toggle('active-pick',item===button));message('Click the map to place '+(pick==='waypoint'?'a waypoint':pick)+'.');}));
for(const id of ['origin','destination'])$(id).addEventListener('change',()=>{renderMarkers();clearRoutes();});
$('add-waypoint').addEventListener('click',()=>{try{waypoints.push(point($('waypoint').value));$('waypoint').value='';renderWaypoints();renderMarkers();clearRoutes();message('Waypoint added.');}catch(error){message(error.message,true);}});
$('search').addEventListener('click',search);
initMap();status();
