# Survive Drive — Valhalla

This repository's `main` branch is the **primary development baseline** for Survive Drive as of September 28, 2026. New Survive Drive features and fixes should start from this Valhalla version.

The current development Site is [survive-drive-valhalla.choppy777.chatgpt.site](https://survive-drive-valhalla.choppy777.chatgpt.site/) (`appgprj_6abaa02b28f0819189305df71487726c`). The existing HERE-based Site at [choppy.fans](https://choppy.fans) remains available at its current address. Moving the public main address is a separate decision.

Valhalla routing, Escape Gate cross-product searches, and route evaluation are implemented here. The Valhalla service is hosted locally on this computer; the Site needs that local connection for route searches. No traffic integration is planned yet.

## Working on this project

- Edit the source files in `dist/` and `server/`. `node build.mjs` copies browser assets into `dist/client/` and regenerates `dist/server/index.js` for publishing.
- Keep the Escape Gate mechanism unless the user explicitly approves changing it. Preserve the full start/destination cross product, including the no-gate pair.
- Rank routes with known eligible AVM evidence by Known Red Miles Under the Red cutoff (fewest first), then Red Percent (lowest first), then Known Coverage (highest first). Returned travel time breaks remaining ties. Routes without known eligible evidence remain unranked and available for evidence selection. Miles without AVM evidence remain unknown and are not counted as Known Red Miles Under.
- Round 0 uses a configurable cull percentage (35% by default), rounded up from the original `N` candidates, and protects every route under 20% known coverage even above the nominal quota. Each completed evidence round removes that round's configured percentage, rounded up, from the previous nominal quota. With 27 routes and 35% throughout, the nominal quotas are 17, 11, then 7. Fill included slots from the full current ranking so excluded routes can return. A reranking without a completed round substitutes within the current quota; saved rounds retain their applied percentages.
- The current lookup workflow approves One Round at a time after an exact cost calculation. Route inclusion can be edited before preparing another round. Imported authorization records do not resume requests; multi-round paid authorization is retired.
- Run relevant offline checks before publishing. `check-ranked-route-selection.mjs`, `check-ranking-evolution.mjs`, `check-red-mileage-cull.mjs`, `check-map-avm-control-lock.mjs`, `check-adjustable-cull.mjs`, `check-route-quota.mjs`, and `check-pool-quota-server.mjs` cover ranking, coverage, culls, control restoration, and provider ceilings.
- Do not use live Valhalla, Census, or RentCast requests as routine tests. The explicitly requested `node check-valhalla-exclude-polygons.mjs --live` integration check is a narrow exception: it sends exactly two sequential requests to a loopback Valhalla `/route` endpoint (baseline, then the same trip with a polygon), has no retries, and sends nothing unless `--live` is present. Provider attempts, including failures, consume their stated budgets.

The Site is identified by `.openai/hosting.json`. Keep that project ID with this source; the HERE Site is a distinct deployment.
