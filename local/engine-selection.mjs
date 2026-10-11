// Choose one complete graph before the request. Never retry against another engine.
export const FLORIDA_BOUNDS = [-87.64, 24.39, -79.97, 31.01];
export const NATIONAL_ENGINE_BOUNDS = [-180, -90, 180, 90];
export function validateRegionalEngines(value) {
  if (value?.schema !== 'rs_regional_engines_v1' || !Array.isArray(value.regions)) throw Error('Invalid regional road configuration.');
  return value.regions.map(region => {
    const url = new URL(region.base_url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Regional road engines must use a local HTTP origin.');
    const expected=region.name==='Florida'?FLORIDA_BOUNDS:region.name==='United States'?NATIONAL_ENGINE_BOUNDS:null;
    if (!expected || JSON.stringify(region.bounds) !== JSON.stringify(expected)) throw Error('Unknown regional road coverage.');
    return {...region, base_url: url.origin};
  });
}
export function engineForPoints(points, regions, primary = 'http://127.0.0.1:8002') {
  if (!Array.isArray(points) || !points.length) return primary;
  for (const region of regions) {
    const [west,south,east,north] = region.bounds;
    if (points.every(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lon) && p.lon >= west && p.lon <= east && p.lat >= south && p.lat <= north)) return region.base_url;
  }
  return primary;
}
