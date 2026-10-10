# Permanent AVM grid contract

`H3R8-V1` is one global mesh. Regions, routes, gates, direction, viewport,
existing cache contents, and request order must never change its geometry.

- H3 implementation: `h3-js` **4.3.0**, pinned and bundled locally.
- Resolution: **8**, permanently. Average hexagon area is about 0.737 km²;
  actual size varies with geographic location. Cells are not exact 1 km squares.
- Cell ID: `H3R8-V1-<canonical lowercase 15-character H3 index>`.
- Query coordinate: H3's cell center, rounded once to eight decimal places.
  The human-readable GPS tag always has eight fractional digits.
- Cache identity: schema `survive_drive_avm_cache_h3r8_v1`, provider, canonical
  cell ID and exact subject profile. Coordinates are validated against the
  immutable cell center; they are not used to create alternate cache keys.
- Boundary: H3's complete polygon, including intermediate face-edge vertices.
  Adjacent cells share boundaries. The same cell exists on either side of
  a city, state, former regional-grid, or international boundary.
- Geometry registry: the existing `honeycomb_cells` table is append-only.
  Repeated construction does nothing. A disagreement pauses evaluation;
  it never moves a registered center or silently creates a replacement cell.
- Compatibility: legacy CHI/REG grids and estimates are excluded from active
  maps, cache reads, ranking and provider approvals. Their database rows are
  left archived. Imported legacy routes keep geometry/directions and remap
  before evaluation; old values are never relabeled as H3 estimates.
- Geographic neighborhoods, Orange extension, pooling and exclusion zones
  use H3 adjacency, never the stored q/r columns. Those columns encode the
  high and low words of the H3 index for the existing registry schema.
- Routes are traced in bounded 200 m pieces using a spherical local projection
  and canonical cell polygons. Shared-edge segments receive one owner, so
  distance is not counted twice. Highway authority and provider ceilings
  remain unchanged.

`global-grid-contract.json` records pinned library SHA-256, cell IDs, center
tags and polygon hashes across representative cities, the dateline and polar
locations. `check-global-grid.mjs` validates these against the browser and
Worker implementations. Build rejects a changed library fingerprint, cell ID, center tag or polygon.
Git attributes preserve the pinned library bytes across Windows checkouts.

Do not overwrite this contract, change its rounding/resolution, choose local
anchors, or remap its cache in place. Dependency upgrades must first reproduce
the frozen fixtures. A conflicting geometry must fail visibly before any paid
request. An intentionally different grid would require explicit product
authorization and a distinct namespace; it cannot replace `H3R8-V1` silently.

H3 has 12 pentagonal cells worldwide at this resolution. None lies on U.S.
land. Pentagons and polygons with extra face-edge vertices are supported by
the geometry and adjacency code.

Primary specification: https://h3geo.org/docs/core-library/overview/
Resolution statistics: https://h3geo.org/docs/core-library/restable/
