'use strict';
(function(global){
  const tokenValid=token=>typeof token==='string'&&/^\d{8}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token);
  async function api(action,body){
    const response=await fetch('/api/phone-handoff/'+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error'});
    const type=response.headers.get('content-type')??'';if(!type.includes('application/json'))throw Error('Sign in to RS on this phone with the same account, then scan the QR code again.');
    const result=await response.json();if(!response.ok)throw Error(result.error||'Route transfer is unavailable. Try again.');return result;
  }
  function qrImage(url){
    const qr=global.qrcode(0,'M');qr.addData(url,'Byte');qr.make();
    const image=document.createElement('img');image.src=qr.createDataURL(6,24);image.alt='Scan to open this chosen route on your phone';image.width=280;image.height=280;return image;
  }
  function download(gpx,filename,handoff=false){
    const blob=new Blob([gpx],{type:handoff?'application/vnd.routescrewtiny.navigation':'application/gpx+xml'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=handoff?filename.replace(/\.gpx$/,'.rsnav'):filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function androidIntent(gpx,origin){
    const fallback=new URL('/android.html',origin);if(fallback.protocol!=='https:'&&fallback.hostname!=='localhost'&&fallback.hostname!=='127.0.0.1')throw Error('Use the secure RS site.');
    const intent='intent://navigate/#Intent;scheme=rs-osmand;package=net.routescrewtiny.bridge;S.gpx='+encodeURIComponent(gpx)+';S.browser_fallback_url='+encodeURIComponent(fallback.href)+';end';return intent.length<=240000?intent:null;
  }
  async function validatePacket(packet){
    if(packet?.schema!=='rs_phone_handoff_v1'||typeof packet.gpx!=='string'||new TextEncoder().encode(packet.gpx).length>2*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(packet.gpx)||typeof packet.route_name!=='string'||packet.route_name.length>500||!/^survive-drive-king-of-the-hill-[a-zA-Z0-9_-]{1,80}\.gpx$/.test(packet.filename)||!Number.isInteger(packet.turns)||packet.turns<0||packet.turns>20000)throw Error('This transferred route is invalid. Send it again from desktop RS.');
    const doc=new DOMParser().parseFromString(packet.gpx,'application/xml'),ns='http://www.topografix.com/GPX/1/1',points=Array.from(doc.getElementsByTagNameNS(ns,'trkpt'));
    if(doc.getElementsByTagName('parsererror').length||doc.documentElement.localName!=='gpx'||doc.documentElement.namespaceURI!==ns||points.length!==packet.points||points.length<2||points.length>20000||points.some(p=>p.parentNode?.localName!=='trkseg'||['lat','lon'].some((k,i)=>!p.hasAttribute(k)||!p.getAttribute(k).trim()||!Number.isFinite(Number(p.getAttribute(k)))||Math.abs(Number(p.getAttribute(k)))>(i?180:90))))throw Error('The transferred path is incomplete or invalid. Send it again from desktop RS.');
    if(!Number.isFinite(Date.parse(packet.expires_at))||Date.parse(packet.expires_at)<=Date.now())throw Error('This route link expired. Send it again from desktop RS.');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(packet.gpx))),x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==packet.sha256)throw Error('Route integrity check failed. Send it again from desktop RS.');return packet;
  }
  let desktop=null,selectionKey=null,choice=null,loading=false,desktopBusy=false,generation=0,transfer=null;
  function hideTransfer(){transfer=null;if(desktop){desktop.result.hidden=true;desktop.qr.replaceChildren();desktop.link.value='';}}
  function installDesktop(panel){
    if(desktop)return;
    const section=document.createElement('section');section.className='phone-route-transfer';
    const send=document.createElement('button');send.type='button';send.id='send-route-to-phone';send.className='primary';send.textContent='Send chosen route to my phone';
    const status=document.createElement('p');status.id='phone-handoff-status';status.className='hint';status.setAttribute('role','status');status.textContent='Choose your route, then send it to your phone with a QR code. No new route search or AVM calls.';
    const result=document.createElement('div');result.id='phone-handoff-result';result.hidden=true;
    const name=document.createElement('strong'),qr=document.createElement('div');qr.className='phone-route-qr';
    const help=document.createElement('p');help.textContent='Scan with your phone camera. Sign in to RS with the same account, then tap Send to OsmAnd. If sign-in loses the route link, scan again. This link expires in 24 hours.';
    const label=document.createElement('label');label.textContent='Phone route link';const link=document.createElement('input');link.type='text';link.readOnly=true;link.setAttribute('aria-label','Phone route link');label.append(link);
    const copy=document.createElement('button');copy.type='button';copy.className='secondary';copy.textContent='Copy phone link';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link.value);status.textContent='Phone link copied. Open it on your phone to receive this chosen route.';}catch{link.focus();link.select();status.textContent='Select and copy the phone link below.';}});
    const revoke=document.createElement('button');revoke.type='button';revoke.className='secondary';revoke.textContent='Revoke this phone link';revoke.addEventListener('click',async()=>{if(!transfer)return;const token=transfer.token;revoke.disabled=true;try{await api('delete',{token});if(transfer?.token===token){generation++;hideTransfer();status.textContent='Phone link revoked. Your chosen route is still available in RS.';}}catch(error){if(transfer?.token===token)status.textContent=error.message;}finally{revoke.disabled=false;}});
    result.append(name,qr,help,label,copy,revoke);section.append(send,status,result);panel.append(section);desktop={send,status,result,name,qr,link};
    send.addEventListener('click',sendChosenToPhone);
  }
  async function sendChosenToPhone(){
    if(!desktop||desktop.send.disabled||loading||!choice)return;
    const op=++generation,key=selectionKey,snapshot=choice;loading=true;desktop.send.disabled=true;desktop.status.textContent='Saving your complete chosen route for phone pickup…';hideTransfer();
    try{
      const gpx=global.chosenOsmAndGpx(snapshot),saved=await api('create',{gpx:gpx.xml,filename:gpx.filename,points:gpx.points,turns:gpx.turns,route_name:snapshot.osmand_track.name});
      if(op!==generation||key!==selectionKey)return;
      if(!tokenValid(saved.token)||saved.url!==location.origin+'/phone-route.html#'+saved.token)throw Error('The route server returned an invalid phone link.');
      transfer=saved;desktop.name.textContent='Ready for your phone: '+saved.route_name;desktop.qr.replaceChildren(qrImage(saved.url));desktop.link.value=saved.url;desktop.result.hidden=false;desktop.status.textContent='Full chosen path saved · '+gpx.points+' points. Scan the QR code to receive it. No route or AVM requests were made.';
    }catch(error){if(op===generation)desktop.status.textContent='Could not prepare the phone link: '+error.message+' Your chosen route is unchanged.';}
    finally{loading=false;if(desktop)desktop.send.disabled=desktopBusy||!choice;}
  }
  function renderDesktop(options){
    if(!desktop)return;
    const next=options.chosenSelected?options.choice:null,key=next?next.candidate_id+'|'+next.chosen_at:null;
    if(key!==selectionKey){generation++;hideTransfer();desktop.status.textContent=next?'Ready to send '+next.osmand_track.name+' to your phone.':'Choose your selected route to enable the phone handoff.';}
    selectionKey=key;choice=next;desktopBusy=options.busy;desktop.send.disabled=desktopBusy||loading||!next;
  }
  global.SurvivePhoneHandoff={api,qrImage,download,androidIntent,validatePacket,tokenValid,installDesktop,renderDesktop,sendChosenToPhone};
})(window);
