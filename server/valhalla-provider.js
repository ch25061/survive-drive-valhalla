// Provider boundary for the separate Valhalla offshoot. The Shotgun gate
// generator still emits its established request shape; only this adapter
// translates it to Valhalla's ordered locations.
export function validatedRouteOptions(value) {
  if (value === undefined) return {highways:0.5,tolls:0.5,ferries:0.5,exclude_unpaved:false,exclude_cash_only_tolls:false,hov_occupants:0};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Choose valid Valhalla road preferences.');
  const allowed = ['highways','tolls','ferries','exclude_unpaved','exclude_cash_only_tolls','hov_occupants'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw Error('Unsupported Valhalla road preference.');
  const options = {highways:0.5,tolls:0.5,ferries:0.5,exclude_unpaved:false,exclude_cash_only_tolls:false,hov_occupants:0,...value};
  for (const key of ['highways','tolls','ferries']) if (![0,0.5,1].includes(options[key])) throw Error('Choose a supported '+key+' preference.');
  for (const key of ['exclude_unpaved','exclude_cash_only_tolls']) if (typeof options[key] !== 'boolean') throw Error('Choose a valid '+key+' setting.');
  if (![0,2,3].includes(options.hov_occupants)) throw Error('Choose 0, 2, or 3 HOV occupants.');
  return options;
}

export function validatedExclusionPolygons(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1000) throw Error('Use at most 1,000 Valhalla exclusion polygons.');
  let vertices = 0;
  const polygons = value.map((ring, index) => {
    if (!Array.isArray(ring) || ring.length < 4) throw Error('Exclusion polygon '+(index+1)+' needs at least four closed points.');
    vertices += ring.length;
    if (vertices > 20000) throw Error('The combined Valhalla exclusion polygons exceed 20,000 vertices.');
    const points = ring.map(point => {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw Error('Exclusion polygons must contain valid [longitude, latitude] points.');
      return [point[0], point[1]];
    });
    const first = points[0], last = points.at(-1);
    if (first[0] !== last[0] || first[1] !== last[1]) throw Error('Every Valhalla exclusion polygon must be closed.');
    let area = 0;
    for (let i = 0; i < points.length - 1; i++) area += points[i][0] * points[i+1][1] - points[i+1][0] * points[i][1];
    if (!Number.isFinite(area) || Math.abs(area) < 1e-12) throw Error('Valhalla exclusion polygons must enclose an area.');
    return points;
  });
  return polygons;
}

export function valhallaPayload(params) {
  const features = String(params['avoid[features]'] ?? '').split(',').filter(Boolean);
  if (features.length) throw Error('Avoid-road preferences are not yet mapped to equivalent Valhalla behavior. Clear them before routing.');
  if (params.departureTime && params.departureTime !== 'any') throw Error('Timed routing is not enabled in this traffic-free offshoot. Choose Time independent.');
  const point = (value, type) => {
    const [coordinate, suffix] = String(value).split(';');
    if (suffix && suffix !== 'radius=800') throw Error('Unsupported Route Gate radius.');
    const pair = coordinate.split(',').map(Number);
    if (pair.length !== 2 || !pair.every(Number.isFinite) || Math.abs(pair[0]) > 90 || Math.abs(pair[1]) > 180) throw Error('Invalid route location.');
    // Gates shape route diversity. Do not reward proximity to the gate pin,
    // and permit a U-turn there without creating a stop or a separate leg.
    return { lat: pair[0], lon: pair[1], type, ...(type === 'via' ? { rank_candidates: false } : {}), ...(suffix ? { radius: 800 } : {}) };
  };
  const via = params.via ?? [];
  const locations = [point(params.origin, 'break'), ...via.map(value => point(value, 'via')), point(params.destination, 'break')];
  const alternates = via.length ? 0 : Math.min(params.alternatives, 3);
  const options = validatedRouteOptions(params.routeOptions);
  const excludePolygons = validatedExclusionPolygons(params.exclude_polygons);
  return {
    locations,
    costing: 'auto',
    costing_options: { auto: {
      ...(params.routingMode === 'short' ? { use_distance: 0.5 } : {}),
      use_highways: options.highways,
      use_tolls: options.tolls,
      use_ferry: options.ferries,
      exclude_unpaved: options.exclude_unpaved,
      exclude_cash_only_tolls: options.exclude_cash_only_tolls,
      include_hov2: options.hov_occupants >= 2,
      include_hov3: options.hov_occupants >= 3
    } },
    alternates,
    units: 'kilometers',
    directions_type: 'instructions',
    shape_format: 'polyline6',
    ...(excludePolygons.length ? { exclude_polygons: excludePolygons } : {})
  };
}

export function valhallaEndpoint(base) {
  if (typeof base !== 'string' || !base.trim()) throw Error('VALHALLA_BASE_URL is not configured.');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw Error('VALHALLA_BASE_URL must be an HTTPS origin without a path or credentials.');
  url.pathname = '/route';
  return url;
}

export function valhallaRequestHeaders(secret,accept='application/json') {
  if(typeof secret!=='string'||! /^[a-f0-9]{64}$/.test(secret))throw Error('The protected desktop Valhalla connection is not configured.');
  return {Accept:accept,Authorization:'Bearer '+secret};
}

function mvtFields(bytes) {
  let offset=0;
  const varint=()=>{let value=0,multiplier=1;for(let count=0;count<10;count++){if(offset>=bytes.length)throw Error('Valhalla returned a truncated road tile.');const byte=bytes[offset++];value+=(byte&127)*multiplier;if(byte<128)return value;multiplier*=128;}throw Error('Valhalla returned an invalid road tile.');};
  const fields=[];
  while(offset<bytes.length){const tag=varint(),number=tag>>>3,wire=tag&7;if(!number)throw Error('Valhalla returned an invalid road tile field.');if(wire===0)fields.push([number,wire,varint()]);else if(wire===1){if(offset+8>bytes.length)throw Error('Valhalla returned a truncated road tile.');fields.push([number,wire,bytes.subarray(offset,offset+8)]);offset+=8;}else if(wire===2){const length=varint();if(offset+length>bytes.length)throw Error('Valhalla returned a truncated road tile.');fields.push([number,wire,bytes.subarray(offset,offset+length)]);offset+=length;}else if(wire===5){if(offset+4>bytes.length)throw Error('Valhalla returned a truncated road tile.');fields.push([number,wire,bytes.subarray(offset,offset+4)]);offset+=4;}else throw Error('Valhalla returned an unsupported road tile field.');}
  return fields;
}
function mvtValue(bytes){for(const [number,,value]of mvtFields(bytes)){if(number===1)return new TextDecoder().decode(value);if(number===4||number===5)return value;if(number===6)return value%2?-(value+1)/2:value/2;if(number===7)return value!==0;if(number===2&&value.length===4)return new DataView(value.buffer,value.byteOffset,value.byteLength).getFloat32(0,true);if(number===3&&value.length===8)return new DataView(value.buffer,value.byteOffset,value.byteLength).getFloat64(0,true);}return null;}
function mvtGeometry(bytes){let cursor=0,x=0,y=0,command=0,remaining=0,lines=[],line=[];const read=()=>{let value=0,multiplier=1;for(let count=0;count<10;count++){if(cursor>=bytes.length)throw Error('Valhalla returned truncated road geometry.');const byte=bytes[cursor++];value+=(byte&127)*multiplier;if(byte<128)return value;multiplier*=128;}throw Error('Valhalla returned invalid road geometry.');};while(cursor<bytes.length){if(!remaining){const packed=read();command=packed&7;remaining=packed>>>3;if(!remaining||![1,2,7].includes(command))throw Error('Valhalla returned unsupported road geometry.');if(command===1&&line.length){lines.push(line);line=[];}}if(command===7){if(line.length)line.push(line[0].slice());remaining--;continue;}const dx=read(),dy=read(),sx=dx%2?-(dx+1)/2:dx/2,sy=dy%2?-(dy+1)/2:dy/2;x+=sx;y+=sy;line.push([x,y]);remaining--;}if(line.length)lines.push(line);return lines;}
function mvtLayer(bytes,z,x,y){let name='',extent=4096;const keys=[],values=[],features=[];for(const[number,wire,value]of mvtFields(bytes)){if(number===1&&wire===2)name=new TextDecoder().decode(value);else if(number===2&&wire===2)features.push(value);else if(number===3&&wire===2)keys.push(new TextDecoder().decode(value));else if(number===4&&wire===2)values.push(mvtValue(value));else if(number===5&&wire===0)extent=value;}if(name!=='edges')return{segments:[],tolls:[],hasTollAttribute:false};const n=2**z,project=([px,py])=>{const lon=((x+px/extent)/n)*360-180,mercator=Math.PI*(1-2*(y+py/extent)/n);return[lon,Math.atan(Math.sinh(mercator))*180/Math.PI];},segments=[],tolls=[];let hasTollAttribute=false;for(const bytesFeature of features){let type=0,tags=[],geometry;for(const[number,wire,value]of mvtFields(bytesFeature)){if(number===2&&wire===2){let i=0;while(i<value.length){let packed=0,multiplier=1;for(let count=0;count<10;count++){if(i>=value.length)throw Error('Valhalla returned a truncated road feature.');const byte=value[i++];packed+=(byte&127)*multiplier;if(byte<128)break;multiplier*=128;}tags.push(packed);}}else if(number===3&&wire===0)type=value;else if(number===4&&wire===2)geometry=value;}if(type!==2||!geometry)continue;const properties={};for(let i=0;i+1<tags.length;i+=2){const key=keys[tags[i]],value=values[tags[i+1]];if(key!==undefined)properties[key.replace(/^edge\./,'')]=value;}if(Object.prototype.hasOwnProperty.call(properties,'toll'))hasTollAttribute=true;const roadClass=properties.road_class,highway=roadClass==='motorway'||roadClass==='trunk'||properties.ramp===true||properties.ramp===1,isToll=properties.toll===true||properties.toll===1;if(!highway&&!isToll)continue;for(const line of mvtGeometry(geometry)){const points=line.map(project);if(points.length>1){if(highway)segments.push(points);if(isToll)tolls.push(points);}}}return{segments,tolls,hasTollAttribute};}
const cellMinMax=polygon=>({west:Math.min(...polygon.map(point=>point[0])),east:Math.max(...polygon.map(point=>point[0])),south:Math.min(...polygon.map(point=>point[1])),north:Math.max(...polygon.map(point=>point[1]))});
const tileXY=(lon,lat,z)=>{const n=2**z,sin=Math.sin(Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180);return[Math.max(0,Math.min(n-1,Math.floor((lon+180)/360*n))),Math.max(0,Math.min(n-1,Math.floor((1-Math.log((1+sin)/(1-sin))/(2*Math.PI))/2*n)))];};
function segmentIntersectsCell(a,b,polygon){const inside=point=>{let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const [xi,yi]=polygon[i],[xj,yj]=polygon[j],cross=(yi>point[1])!==(yj>point[1])&&point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi;if(cross)result=!result;}return result;},orient=(p,q,r)=>(q[1]-p[1])*(r[0]-q[0])-(q[0]-p[0])*(r[1]-q[1]),intersects=(p,q,r,s)=>{const a1=orient(p,q,r),a2=orient(p,q,s),b1=orient(r,s,p),b2=orient(r,s,q);return(a1===0||a2===0||Math.sign(a1)!==Math.sign(a2))&&(b1===0||b2===0||Math.sign(b1)!==Math.sign(b2));};if(inside(a)||inside(b))return true;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++)if(intersects(a,b,polygon[j],polygon[i]))return true;return false;}
function lineCrossesCell(line,polygon){const lineBounds=cellMinMax(line),cellBounds=cellMinMax(polygon);if(lineBounds.east<cellBounds.west||lineBounds.west>cellBounds.east||lineBounds.north<cellBounds.south||lineBounds.south>cellBounds.north)return false;for(let i=1;i<line.length;i++)if(segmentIntersectsCell(line[i-1],line[i],polygon))return true;return false;}
export async function valhallaHighwayCellMasks(input,base,{fetchImpl=fetch,headers={},zoom=12,maxTiles=128,concurrency=8,maxBytes=32*1024*1024}={}){
  if(!Array.isArray(input?.cells)||input.cells.length>10000)throw Error('Use at most 10,000 known cells when preparing the road-network mask.');
  const cells=input.cells.map(cell=>{if(!cell||typeof cell.cell_id!=='string'||!Array.isArray(cell.polygon)||cell.polygon.length<4||cell.polygon.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90))throw Error('The road-network mask needs valid known-cell polygons.');return{cell_id:cell.cell_id,polygon:cell.polygon};});
  const tiles=new Map();for(const cell of cells){const bounds=cellMinMax(cell.polygon),[x0,y0]=tileXY(bounds.west,bounds.north,zoom),[x1,y1]=tileXY(bounds.east,bounds.south,zoom);for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)tiles.set(x+','+y,{x,y});}
  if(tiles.size>maxTiles)throw Error('The highway/tollway mask spans '+tiles.size+' Valhalla road tiles, above the '+maxTiles+' tile safety limit. Narrow the exclusion area before routing.');
  const url=new URL(base);url.pathname='/tile';url.search='';const roadsByTile=new Map();let hasTollAttribute=false,totalBytes=0;const tileList=[...tiles.values()];let cursor=0;
  async function worker(){while(cursor<tileList.length){const tile=tileList[cursor++],requestUrl=new URL(url);requestUrl.searchParams.set('json',JSON.stringify({tile:{z:zoom,x:tile.x,y:tile.y},filters:{attributes:['edge.road_class','edge.ramp','edge.toll'],action:'include'},generalize:1}));const response=await fetchImpl(requestUrl,{method:'GET',headers:{...headers,Accept:'application/vnd.mapbox-vector-tile'},redirect:'manual',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Valhalla road graph tile '+tile.x+'/'+tile.y+' returned HTTP '+response.status+'.');const bytes=new Uint8Array(await response.arrayBuffer());totalBytes+=bytes.length;if(bytes.length>2*1024*1024)throw Error('A Valhalla road graph tile exceeded 2 MiB.');if(totalBytes>maxBytes)throw Error('The Valhalla road graph mask exceeded its 32 MiB safety limit. Narrow the exclusion area before routing.');const tileKey=tile.x+','+tile.y,roadSet=roadsByTile.get(tileKey)??{highways:[],tolls:[]};for(const[number,wire,data]of mvtFields(bytes)){if(number===3&&wire===2){const parsed=mvtLayer(data,zoom,tile.x,tile.y);roadSet.highways.push(...parsed.segments);roadSet.tolls.push(...parsed.tolls);hasTollAttribute||=parsed.hasTollAttribute;}}roadsByTile.set(tileKey,roadSet);}}
  await Promise.all(Array.from({length:Math.min(concurrency,tileList.length)},()=>worker()));
  if(input.include_tollways&&!hasTollAttribute)throw Error('This Valhalla tile service does not expose tollway edge tags, so the tollway mask could not be verified. No route request was sent.');
  const highway_cell_ids=[],tollway_cell_ids=[];for(const cell of cells){const bounds=cellMinMax(cell.polygon),[x0,y0]=tileXY(bounds.west,bounds.north,zoom),[x1,y1]=tileXY(bounds.east,bounds.south,zoom),highwayLines=[],tollwayLines=[];for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const roadSet=roadsByTile.get(x+','+y);if(roadSet){highwayLines.push(...roadSet.highways);tollwayLines.push(...roadSet.tolls);}}if(highwayLines.some(line=>lineCrossesCell(line,cell.polygon)))highway_cell_ids.push(cell.cell_id);if(tollwayLines.some(line=>lineCrossesCell(line,cell.polygon)))tollway_cell_ids.push(cell.cell_id);}
  const highway_feature_count=[...roadsByTile.values()].reduce((sum,roadSet)=>sum+roadSet.highways.length,0),tollway_feature_count=[...roadsByTile.values()].reduce((sum,roadSet)=>sum+roadSet.tolls.length,0);
  return{highway_cell_ids,tollway_cell_ids,tile_count:tileList.length,highway_feature_count,tollway_feature_count,road_source:'Valhalla static graph tiles',zoom};
}

export function validateValhallaResponse(data, maximum) {
  if (!data || typeof data !== 'object' || !data.trip || !Array.isArray(data.trip.legs) || !data.trip.legs.length) throw Error('Valhalla returned no route.');
  const alternates = Array.isArray(data.alternates) ? data.alternates : [];
  if (alternates.length + 1 > maximum) throw Error('Valhalla returned more routes than requested.');
  for (const candidate of [data, ...alternates]) {
    const trip = candidate.trip ?? candidate;
    if (!Array.isArray(trip.legs) || !trip.legs.length || trip.legs.some(leg => typeof leg.shape !== 'string' || !Number.isFinite(leg.summary?.length) || !Number.isFinite(leg.summary?.time))) throw Error('Valhalla returned incomplete route geometry or measurements.');
  }
  return data;
}
