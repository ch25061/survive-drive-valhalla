'use strict';
(function(){
  const el=id=>document.getElementById(id),handoff=window.SurvivePhoneHandoff;let packet=null,loading=false;
  function downloadRoute(file){if(!packet)return;handoff.download(packet.gpx,packet.filename,file);el('phone-launch-status').textContent=file?'Open the downloaded .rsnav file with RS → OsmAnd. Check the route name, then tap Start.':'GPX downloaded. Open it in OsmAnd and select it for navigation.';}
  async function load(){
    if(loading)return;const token=location.hash.slice(1);packet=null;el('received-route').hidden=true;el('retry-phone-route').hidden=true;el('phone-launch-status').textContent='';
    if(!handoff.tokenValid(token)){el('phone-route-status').textContent='Scan the QR code beside your chosen route in desktop RS to open this page.';return;}
    loading=true;el('phone-route-status').textContent='Receiving your chosen route…';
    try{
      const received=await handoff.validatePacket(await handoff.api('read',{token}));if(location.hash.slice(1)!==token)return;packet=received;
      el('received-route-name').textContent=packet.route_name;el('received-route-details').textContent=packet.points.toLocaleString()+' path points · '+packet.turns+' turn reference points · available until '+new Date(packet.expires_at).toLocaleString();
      el('phone-route-status').textContent='Your desktop choice is ready. Send it to OsmAnd below.';
      const android=/Android/i.test(navigator.userAgent),intent=android?handoff.androidIntent(packet.gpx,location.origin):null;
      el('phone-send-osmand').hidden=!intent;if(intent)el('phone-send-osmand').href=intent;else el('phone-send-osmand').removeAttribute('href');
      el('phone-download-handoff').hidden=!android||!!intent;el('received-route').hidden=false;
      if(!android)el('phone-route-status').textContent='Route received. Open this same link on your Android phone to send it to OsmAnd, or download GPX below.';
    }catch(error){packet=null;if(location.hash.slice(1)===token){el('phone-route-status').textContent=error.message;el('retry-phone-route').hidden=false;}}finally{loading=false;if(location.hash.slice(1)!==token)load();}
  }
  el('retry-phone-route').addEventListener('click',load);el('phone-download-handoff').addEventListener('click',()=>downloadRoute(true));el('phone-download-gpx').addEventListener('click',()=>downloadRoute(false));
  el('phone-send-osmand').addEventListener('click',()=>{el('phone-launch-status').textContent='Opening the RS Android companion. Review the route name and tap Start chosen route in OsmAnd. RS cannot confirm navigation started.';});
  window.addEventListener('hashchange',load);load();
})();
