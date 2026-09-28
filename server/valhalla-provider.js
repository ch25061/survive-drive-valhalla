// Provider boundary for the separate Valhalla offshoot. The Shotgun gate
// generator still emits its established request shape; only this adapter
// translates it to Valhalla's ordered locations.
export function valhallaPayload(params) {
  const features = String(params['avoid[features]'] ?? '').split(',').filter(Boolean);
  if (features.length) throw Error('Avoid-road preferences are not yet mapped to equivalent Valhalla behavior. Clear them before routing.');
  if (params.departureTime && params.departureTime !== 'any') throw Error('Timed routing is not enabled in this traffic-free offshoot. Choose Time independent.');
  const point = (value, type) => {
    const [coordinate, suffix] = String(value).split(';');
    if (suffix && suffix !== 'radius=200') throw Error('Unsupported Escape Gate radius.');
    const pair = coordinate.split(',').map(Number);
    if (pair.length !== 2 || !pair.every(Number.isFinite) || Math.abs(pair[0]) > 90 || Math.abs(pair[1]) > 180) throw Error('Invalid route location.');
    return { lat: pair[0], lon: pair[1], type, ...(suffix ? { radius: 200 } : {}) };
  };
  const via = params.via ?? [];
  const locations = [point(params.origin, 'break'), ...via.map(value => point(value, 'through')), point(params.destination, 'break')];
  const alternates = via.length ? 0 : Math.min(params.alternatives, 3);
  return {
    locations,
    costing: 'auto',
    costing_options: { auto: { ...(params.routingMode === 'short' ? { shortest: true } : {}) } },
    alternates,
    units: 'kilometers',
    directions_type: 'instructions',
    shape_format: 'polyline6'
  };
}

export function valhallaEndpoint(base) {
  if (typeof base !== 'string' || !base.trim()) throw Error('VALHALLA_BASE_URL is not configured.');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw Error('VALHALLA_BASE_URL must be an HTTPS origin without a path or credentials.');
  url.pathname = '/route';
  return url;
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
