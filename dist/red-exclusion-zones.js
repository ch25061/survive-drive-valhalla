(function(root){
  const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
  const CELL_ID=/^(.*)-Q([+-]?\d+)-R([+-]?\d+)$/;

  function axial(cell){
    const match=CELL_ID.exec(cell?.cell_id??'');
    return match?{grid:match[1],q:Number(match[2]),r:Number(match[3])}:null;
  }

  function vertexKey(point){return Math.round(point[0]*1e7)+','+Math.round(point[1]*1e7);}

  function polygonsPerimeterMeters(polygons){
    const radius=6371008.8;let total=0;
    for(const ring of polygons??[])for(let i=1;i<ring.length;i++){
      const [lon1,lat1]=ring[i-1],[lon2,lat2]=ring[i],toRadians=Math.PI/180,dLat=(lat2-lat1)*toRadians,dLon=(lon2-lon1)*toRadians,a=Math.sin(dLat/2)**2+Math.cos(lat1*toRadians)*Math.cos(lat2*toRadians)*Math.sin(dLon/2)**2;
      total+=2*radius*Math.asin(Math.min(1,Math.sqrt(a)));
    }
    return Math.ceil(total);
  }

  function signedArea(ring){let area=0;for(let i=0;i<ring.length-1;i++)area+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];return area/2;}

  function boundaryRings(cells){
    const edges=new Map();
    for(const cell of cells){
      const points=cell.polygon;
      if(!Array.isArray(points)||points.length<4)continue;
      const ring=points.length>1&&vertexKey(points[0])===vertexKey(points.at(-1))?points.slice(0,-1):points;
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],ka=vertexKey(a),kb=vertexKey(b),key=ka<kb?ka+'|'+kb:kb+'|'+ka;
        if(edges.has(key))edges.delete(key);else edges.set(key,{from:ka,to:kb,a,b});
      }
    }
    const outgoing=new Map();
    for(const edge of edges.values()){
      if(!outgoing.has(edge.from))outgoing.set(edge.from,[]);
      outgoing.get(edge.from).push(edge);
    }
    const unused=new Set(edges.values()),rings=[];
    while(unused.size){
      const first=unused.values().next().value,start=first.from;
      let edge=first,ring=[first.a],guard=0,closed=false;
      while(edge&&guard++<=edges.size+1){
        unused.delete(edge);ring.push(edge.b);
        if(edge.to===start){closed=true;break;}
        const candidates=(outgoing.get(edge.to)??[]).filter(candidate=>unused.has(candidate));
        if(!candidates.length)break;
        const incoming=Math.atan2(edge.b[1]-edge.a[1],edge.b[0]-edge.a[0]);
        candidates.sort((a,b)=>{
          const turn=e=>{const angle=Math.atan2(e.b[1]-e.a[1],e.b[0]-e.a[0])-incoming;return(angle%(Math.PI*2)+Math.PI*2)%(Math.PI*2);};
          return turn(a)-turn(b);
        });
        edge=candidates[0];
      }
      if(closed&&ring.length>=4){ring[ring.length-1]=ring[0];if(Math.abs(signedArea(ring))>1e-12)rings.push(ring);}
    }
    return rings.sort((a,b)=>Math.abs(signedArea(b))-Math.abs(signedArea(a)));
  }

  function clusterRedCells(cells,cutoff,options={}){
    const minimumSize=Number.isInteger(options.minimumSize)?Math.max(1,options.minimumSize):1,masked=new Set(options.maskedCellIds??[]),connectors=new Set(),all=new Map();
    const isH3=cell=>/^H3R8-V1-[0-9a-f]{15}$/.test(cell.cell_id);
    const adjacent=cell=>isH3(cell)?root.SurviveAvm.neighbors(cell.cell_id):DIRECTIONS.map(([dq,dr])=>cell.grid+'-Q'+(cell.q+dq>=0?'+':'')+(cell.q+dq)+'-R'+(cell.r+dr>=0?'+':'')+(cell.r+dr));
    for(const cell of cells??[]){if(!cell||typeof cell.cell_id!=='string'||!Number.isFinite(cell.estimate_ppsqft)||cell.estimate_ppsqft>=cutoff||!Number.isFinite(cell.latitude)||!Number.isFinite(cell.longitude)||!Array.isArray(cell.polygon))continue;const parsed=isH3(cell)?{grid:'H3R8-V1'}:axial(cell);if(parsed&&!all.has(cell.cell_id))all.set(cell.cell_id,{...cell,...parsed});}
    const unseen=new Set(all.keys()),clusters=[];
    while(unseen.size){
      const seed=unseen.values().next().value,queue=[seed],members=new Map();unseen.delete(seed);
      while(queue.length){const id=queue.pop(),cell=all.get(id);members.set(id,cell);for(const neighbor of adjacent(cell))if(unseen.delete(neighbor))queue.push(neighbor);}
      const removed=new Set([...members.keys()].filter(id=>masked.has(id)));
      // Open a cell-wide seam to the component boundary around protected roads.
      for(const start of [...removed]){const queue=[start],parent=new Map([[start,null]]);let boundary=null;for(let i=0;i<queue.length&&boundary===null;i++){const id=queue[i],neighbors=adjacent(members.get(id));if(neighbors.some(n=>!members.has(n))){boundary=id;break;}for(const n of neighbors)if(members.has(n)&&!parent.has(n)){parent.set(n,id);queue.push(n);}}if(boundary!==null){let id=boundary;while(id!==null){removed.add(id);id=parent.get(id)??null;}}}
      for(const id of removed)if(!masked.has(id))connectors.add(id);
      const remaining=new Set([...members.keys()].filter(id=>!removed.has(id)));
      while(remaining.size){const first=remaining.values().next().value,queue=[first],zone=[];remaining.delete(first);while(queue.length){const id=queue.pop(),cell=members.get(id);zone.push(cell);for(const n of adjacent(cell))if(remaining.delete(n))queue.push(n);}if(zone.length<minimumSize)continue;zone.sort((a,b)=>a.cell_id.localeCompare(b.cell_id));const rings=boundaryRings(zone);if(rings.length)clusters.push({grid:zone[0].grid,cell_count:zone.length,cell_ids:zone.map(c=>c.cell_id),rings});}
    }
    clusters.sort((a,b)=>b.cell_count-a.cell_count||a.cell_ids[0].localeCompare(b.cell_ids[0]));clusters.masked_connector_cell_ids=[...connectors].sort();return clusters;
  }

  root.RedExclusionZones={clusterRedCells,polygonsPerimeterMeters};
})(globalThis);
