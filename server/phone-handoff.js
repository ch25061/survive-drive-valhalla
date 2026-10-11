// Short-lived chosen-route files. Sites retains its existing owner-only sign-in boundary.
const PHONE_HANDOFF_PREFIX='rs-phone-handoffs/v1/';
const PHONE_HANDOFF_TTL=24*60*60*1000;
const PHONE_HANDOFF_MAX_BYTES=2*1024*1024;
const phoneTokenValid=token=>typeof token==='string'&&/^\d{8}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token);
async function phoneHandoffHash(gpx){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(gpx))),x=>x.toString(16).padStart(2,'0')).join('');}
function validatePhoneHandoff(body){
  if(!body||typeof body.gpx!=='string'||new TextEncoder().encode(body.gpx).length>PHONE_HANDOFF_MAX_BYTES)throw Error('The full chosen route must fit within the companion’s 2 MB limit.');
  if(/<!DOCTYPE|<!ENTITY/i.test(body.gpx)||!/<gpx\s[^>]*xmlns="http:\/\/www.topografix.com\/GPX\/1\/1"/.test(body.gpx)||!/<\/gpx>\s*$/.test(body.gpx))throw Error('Use the GPX produced by Choose selected route.');
  const points=[...body.gpx.matchAll(/<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"\s*\/>/g)];
  if(points.length<2||points.length>20000||points.length!==body.points||(body.gpx.match(/<trkpt\b/g)||[]).length!==points.length||points.some(p=>!p[1].trim()||!p[2].trim()||!Number.isFinite(Number(p[1]))||!Number.isFinite(Number(p[2]))||Math.abs(Number(p[1]))>90||Math.abs(Number(p[2]))>180))throw Error('The chosen route has invalid or incomplete path points.');
  if(typeof body.route_name!=='string'||!body.route_name.trim()||body.route_name.length>500||!Number.isInteger(body.turns)||body.turns<0||body.turns>20000||typeof body.filename!=='string'||!/^survive-drive-king-of-the-hill-[a-zA-Z0-9_-]{1,80}\.gpx$/.test(body.filename))throw Error('Choose the route again to prepare its handoff.');
  return{gpx:body.gpx,route_name:body.route_name,filename:body.filename,points:points.length,turns:body.turns};
}
async function removeExpiredPhoneHandoffs(bucket,now){
  // Only our temporary namespace is touched; dates sort the oldest files first.
  const page=await bucket.list({prefix:PHONE_HANDOFF_PREFIX,limit:128,include:['customMetadata']});
  const expired=page.objects.filter(object=>Number(object.customMetadata?.expires_at)>0&&Number(object.customMetadata.expires_at)<=now).map(object=>object.key);
  if(expired.length)await bucket.delete(expired);
}
async function phoneHandoff(request,env,action){
  const url=new URL(request.url);
  if(request.method!=='POST')return json({error:'Use the RS handoff controls.',provider_calls:0},405);
  if(request.headers.get('Origin')!==url.origin)return json({error:'Same-origin request required.',provider_calls:0},403);
  const bucket=env.TUTORIAL_MEDIA;
  if(!bucket?.put||!bucket?.get)return json({error:'Route transfer storage is unavailable. Use Download GPX instead.',provider_calls:0},503);
  let body;try{body=await readBody(request,action==='create'?3*1024*1024:256);}catch(error){return json({error:error.message,provider_calls:0},400);}
  if(action==='create'){
    let route;try{route=validatePhoneHandoff(body);}catch(error){return json({error:error.message,provider_calls:0},400);}
    const now=Date.now(),token=new Date(now).toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomUUID(),expiresAt=now+PHONE_HANDOFF_TTL;
    const packet={schema:'rs_phone_handoff_v1',...route,sha256:await phoneHandoffHash(route.gpx),created_at:new Date(now).toISOString(),expires_at:new Date(expiresAt).toISOString()};
    await bucket.put(PHONE_HANDOFF_PREFIX+token,JSON.stringify(packet),{httpMetadata:{contentType:'application/json'},customMetadata:{expires_at:String(expiresAt)}});
    // Cleanup does not turn a completed transfer into an ambiguous save failure.
    try{await removeExpiredPhoneHandoffs(bucket,now);}catch{}
    return json({token,url:url.origin+'/phone-route.html#'+token,expires_at:packet.expires_at,route_name:route.route_name,points:route.points,sha256:packet.sha256,provider_calls:0},201);
  }
  if(!phoneTokenValid(body?.token))return json({error:'This route link is invalid. Scan a new QR code in desktop RS.',provider_calls:0},400);
  if(action==='delete'){await bucket.delete(PHONE_HANDOFF_PREFIX+body.token);return json({revoked:true,provider_calls:0});}
  const object=await bucket.get(PHONE_HANDOFF_PREFIX+body.token);
  if(!object)return json({error:'This route link is unavailable or was revoked. Send it again from desktop RS.',provider_calls:0},404);
  const packet=await object.json();
  if(!Number.isFinite(Date.parse(packet.expires_at))||Date.parse(packet.expires_at)<=Date.now()){await bucket.delete(PHONE_HANDOFF_PREFIX+body.token);return json({error:'This route link expired. Send it again from desktop RS.',provider_calls:0},410);}
  return json({...packet,provider_calls:0});
}
