/* Valhalla polyline6 decoder and Survive Drive route adapter. */
(function (global) {
  'use strict';
  function decodePolyline6(value) {
    if (typeof value !== 'string' || !value || value.length > 160000) throw Error('Invalid Valhalla route shape.');
    const points=[];let index=0,lat=0,lon=0;
    function coordinate(){let result=0,shift=0,byte;do{if(index>=value.length||shift>35)throw Error('Invalid Valhalla polyline.');byte=value.charCodeAt(index++)-63;if(byte<0||byte>63)throw Error('Invalid Valhalla polyline.');result|=(byte&31)<<shift;shift+=5;}while(byte>=32);return(result&1)?~(result>>1):result>>1;}
    while(index<value.length){lat+=coordinate();lon+=coordinate();const p=[lon/1e6,lat/1e6];if(!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90||points.length>=20000)throw Error('Valhalla route geometry is invalid or too large.');points.push(p);}
    if(points.length<2)throw Error('Valhalla route shape has fewer than two points.');return points;
  }
  // Valhalla reports whether any highway occurs within each maneuver. Exclude
  // that entire maneuver, plus adjoining ramp maneuvers, rather than letting
  // highway distance contribute to AVM cells or red-distance totals.
  function highwayRanges(kinds){
    if(Array.from(kinds).some(kind=>!kind))return null;
    const excluded=kinds.map(kind=>kind.highway);
    for(let i=0;i<excluded.length;i++)if(excluded[i]){
      for(let j=i-1;j>=0&&kinds[j].ramp;j--)excluded[j]=true;
      for(let j=i+1;j<excluded.length&&kinds[j].ramp;j++)excluded[j]=true;
    }
    const ranges=[];
    for(let i=0;i<excluded.length;){if(!excluded[i]){i++;continue;}const start=i;while(i<excluded.length&&excluded[i])i++;ranges.push([start,i]);}
    return ranges;
  }
  function convertRoutes(response,roundId,{maximumDurationSeconds=Infinity}={}){
    if(!(maximumDurationSeconds===Infinity||Number.isFinite(maximumDurationSeconds)&&maximumDurationSeconds>=0))throw Error('Choose a valid route time limit.');
    const candidates=[response,...(Array.isArray(response?.alternates)?response.alternates:[])];
    if(candidates.length<1||candidates.length>4)throw Error('Unexpected Valhalla route count.');
    let discarded=0;
    const converted=candidates.map((candidate,index)=>{
      const trip=candidate?.trip??candidate;
      if(!Array.isArray(trip?.legs)||!trip.legs.length)throw Error('Valhalla trip has no legs.');
      const returnedDuration=trip.legs.reduce((seconds,leg)=>{const time=leg.summary?.time;if(!Number.isFinite(time)||time<0)throw Error('Valhalla trip duration is incomplete.');return seconds+time;},0);
      if(!Number.isFinite(returnedDuration))throw Error('Valhalla trip duration is invalid.');
      // Reject long detours before decoding geometry or constructing AVM evidence.
      if(returnedDuration>maximumDurationSeconds){discarded++;return null;}
      const geometry=[],highwayTransitions=[],segmentKinds=[];let length=0,duration=0,onHighway=null;
      for(const leg of trip.legs){const points=decodePolyline6(leg.shape);if(!Number.isFinite(leg.summary?.length)||!Number.isFinite(leg.summary?.time))throw Error('Valhalla trip summary is incomplete.');length+=leg.summary.length*1000;duration+=leg.summary.time;const duplicate=geometry.length&&geometry.at(-1)[0]===points[0][0]&&geometry.at(-1)[1]===points[0][1],offset=geometry.length-(duplicate?1:0);geometry.push(...(duplicate?points.slice(1):points));if(geometry.length>20000)throw Error('Valhalla route has too many points.');
        for(const maneuver of Array.isArray(leg.maneuvers)?leg.maneuvers:[]){if(!Number.isInteger(maneuver?.begin_shape_index)||maneuver.begin_shape_index<0||maneuver.begin_shape_index>=points.length)continue;const highway=typeof maneuver.highway==='boolean'?maneuver.highway:null,type=maneuver.type,index=offset+maneuver.begin_shape_index,exit=type===20||type===21,ramp=type===17||type===18||type===19;let kind=null;if(exit){if(onHighway!==false)kind='exit';onHighway=false;}else if(highway===true&&onHighway===false){kind='entry';onHighway=true;}else if(highway===false&&onHighway===true){kind='exit';onHighway=false;}else if(ramp&&onHighway!==true){kind='entry';onHighway=true;}else if(highway!==null)onHighway=highway;if(kind&&index>=0&&index<geometry.length&&highwayTransitions.length<100&&!highwayTransitions.some(item=>item.index===index&&item.kind===kind))highwayTransitions.push({index,kind});
          const end=maneuver.end_shape_index;if(!Number.isInteger(end)||end<maneuver.begin_shape_index||end>=points.length)continue;
          for(let local=maneuver.begin_shape_index;local<end;local++){const globalIndex=offset+local,next={highway:highway===true,ramp};const prior=segmentKinds[globalIndex];if(prior&&(prior.highway!==next.highway||prior.ramp!==next.ramp))throw Error('Valhalla highway maneuvers conflict.');segmentKinds[globalIndex]=next;}
        }
      }
      segmentKinds.length=geometry.length-1;
      const ranges=highwayRanges(segmentKinds);
      const warnings=Array.isArray(trip.warnings)?trip.warnings.map(w=>String(w?.message??w)).slice(0,12):[];
      return{id:roundId+'-'+(index+1),route_number:index+1,name:'Valhalla route '+(index+1),geometry,length_m:length,duration_s:duration,cells:[],authority_ranges:ranges??[],authority_offsets:ranges?.length===1?ranges[0]:null,authority_only_cell_count:0,authority_source:ranges?'valhalla_maneuvers_v1':'unverified',authority_rule:ranges?'Valhalla highway maneuvers and their attached ramps are excluded from AVM screening.':'Valhalla highway maneuvers are incomplete; AVM evaluation is paused.',highway_transitions:highwayTransitions,exposure:null,live_valhalla:true,live_here:false,avm_status:'unevaluated',notices:warnings,valhalla_evidence:{locations:trip.locations??[],route_status:trip.status??null}};
    }).filter(Boolean);
    converted.raw_count=candidates.length;converted.discarded_duration_count=discarded;
    return converted;
  }
  function restoreSavedTransitions(routes,records){
    if(!Array.isArray(routes)||!Array.isArray(records))return 0;
    const targets=new Map(routes.filter(route=>route.live_valhalla&&(route.authority_source!=='valhalla_maneuvers_v1'||!Array.isArray(route.highway_transitions)||!route.highway_transitions.length)).map(route=>[route.id,route]));let restored=0;
    for(const record of records.slice(0,1000)){
      if(!targets.size)break;
      const roundId=record?.round_id;
      if(record?.provider!=='Valhalla'||typeof roundId!=='string'||![1,2,3,4].some(index=>targets.has(roundId+'-'+index)))continue;
      let candidates;try{candidates=convertRoutes(record.response,roundId);}catch{continue;}
      for(const candidate of candidates){const target=targets.get(candidate.id);if(!target||target.geometry.length!==candidate.geometry.length||target.geometry.some((point,index)=>point[0]!==candidate.geometry[index][0]||point[1]!==candidate.geometry[index][1]))continue;target.highway_transitions=candidate.highway_transitions;target.authority_ranges=candidate.authority_ranges;target.authority_offsets=candidate.authority_offsets;target.authority_source=candidate.authority_source;target.authority_rule=candidate.authority_rule;targets.delete(candidate.id);restored++;}
    }
    return restored;
  }
  global.SurviveValhalla={decodePolyline6,convertRoutes,restoreSavedTransitions};
})(typeof globalThis==='undefined'?this:globalThis);
