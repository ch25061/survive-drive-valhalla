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
    const minimumSize=Number.isInteger(options.minimumSize)?Math.max(1,options.minimumSize):1;
    const maskedCellIds=new Set(Array.isArray(options.maskedCellIds)?options.maskedCellIds:[]),connectorCellIds=new Set();
    const unique=new Map();
    for(const cell of cells??[]){
      if(!cell||typeof cell.cell_id!=='string'||!Number.isFinite(cell.estimate_ppsqft)||cell.estimate_ppsqft>=cutoff||!Number.isFinite(cell.latitude)||!Number.isFinite(cell.longitude)||!Array.isArray(cell.polygon))continue;
      const parsed=axial(cell);if(!parsed)continue;
      const id=parsed.grid+'|'+parsed.q+','+parsed.r;
      if(!unique.has(id))unique.set(id,{...cell,...parsed});
    }
    const byGrid=new Map();
    for(const [key,cell] of unique){if(!byGrid.has(cell.grid))byGrid.set(cell.grid,new Map());byGrid.get(cell.grid).set(cell.q+','+cell.r,{...cell,_key:key});}
    const clusters=[];
    for(const [grid,gridCells] of byGrid){
      const unseen=new Set(gridCells.keys());
      while(unseen.size){
        const seed=unseen.values().next().value;unseen.delete(seed);
        const queue=[seed],members=[];
        while(queue.length){
          const coord=queue.pop(),cell=gridCells.get(coord);members.push(cell);
          for(const [dq,dr] of DIRECTIONS){const adjacent=(cell.q+dq)+','+(cell.r+dr);if(unseen.delete(adjacent))queue.push(adjacent);}
        }
        const component=new Map(members.map(cell=>[cell.q+','+cell.r,cell])),removed=new Set(members.filter(cell=>maskedCellIds.has(cell.cell_id)).map(cell=>cell.q+','+cell.r));
        // Valhalla treats each supplied ring as a filled exclusion polygon, not a hole.
        // Open a shortest cell-wide seam from every protected road cell to the component
        // boundary, so the protected cell is outside the actual polygon geometry.
        for(const start of removed){
          const startCell=component.get(start);if(!startCell)continue;
          const queue=[start],parent=new Map([[start,null]]);let boundary=null;
          for(let cursor=0;cursor<queue.length&&boundary===null;cursor++){
            const coord=queue[cursor],cell=component.get(coord);
            for(const [dq,dr] of DIRECTIONS){const adjacent=(cell.q+dq)+','+(cell.r+dr);if(!component.has(adjacent)){boundary=coord;break;}}
            if(boundary!==null)break;
            for(const [dq,dr] of DIRECTIONS){const adjacent=(cell.q+dq)+','+(cell.r+dr);if(component.has(adjacent)&&!parent.has(adjacent)){parent.set(adjacent,coord);queue.push(adjacent);}}
          }
          if(boundary!==null){let coord=boundary;while(coord!==null){removed.add(coord);coord=parent.get(coord)??null;}}
        }
        for(const coord of removed){const cell=component.get(coord);if(cell&&!maskedCellIds.has(cell.cell_id))connectorCellIds.add(cell.cell_id);}
        const remaining=new Map(members.filter(cell=>!removed.has(cell.q+','+cell.r)).map(cell=>[cell.q+','+cell.r,cell]));
        const zonesUnseen=new Set(remaining.keys());
        while(zonesUnseen.size){
          const zoneSeed=zonesUnseen.values().next().value;zonesUnseen.delete(zoneSeed);const zoneQueue=[zoneSeed],zoneMembers=[];
          while(zoneQueue.length){const coord=zoneQueue.pop(),cell=remaining.get(coord);zoneMembers.push(cell);for(const [dq,dr] of DIRECTIONS){const adjacent=(cell.q+dq)+','+(cell.r+dr);if(zonesUnseen.delete(adjacent))zoneQueue.push(adjacent);}}
          if(zoneMembers.length<minimumSize)continue;
          zoneMembers.sort((a,b)=>a.cell_id.localeCompare(b.cell_id));
          const rings=boundaryRings(zoneMembers);
          if(rings.length)clusters.push({grid,cell_count:zoneMembers.length,cell_ids:zoneMembers.map(cell=>cell.cell_id),rings});
        }
      }
    }
    clusters.sort((a,b)=>b.cell_count-a.cell_count||a.cell_ids[0].localeCompare(b.cell_ids[0]));
    clusters.masked_connector_cell_ids=[...connectorCellIds].sort();
    return clusters;
  }

  root.RedExclusionZones={clusterRedCells,polygonsPerimeterMeters};
})(globalThis);
