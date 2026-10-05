# Survive Drive TODO

- [x] **HIGH PRIORITY — Rank routes by absolute Red overland mileage, rather than Red percentage.** Requested during the October 2, 2026 live demonstration; completed and verified offline on October 2, 2026. Adding non-red detour miles cannot improve the primary score when the route's red mileage is unchanged.
  - Current route-card order: Known Red Miles Under, Red Percent, then Known Coverage; returned travel time breaks remaining ties.
  - Keep missing distance unknown, keep routes with no known eligible evidence unranked, and show Known Coverage immediately after Red Percent. The route sort uses recorded Known Red Miles Under rather than adding unmeasured miles to that score.
  - Apply the new order to route ranking and cull selection. Keep cell acquisition selection on its separate evidence and coverage diagnostics. Preserve full-pool reranking, shared-cell evidence updates, excluded-route promotion, configurable cull quotas, exact provider ceilings, and no retries.
  - Verify offline that a non-red detour cannot improve the primary score, ties use the intended order, partial coverage remains clear, and excluded routes can return. Do not make live provider calls solely to test this change.
  - Current rule (updated October 3, 2026): known Red miles lead for routes with known evidence; Red Percent and Known Coverage break ties, then returned travel time. Incomplete routes sort on measured Red miles only, remain marked provisional, and keep their unknown distance and coverage visible. Routes with no known evidence remain unranked.
  - Validation passed: offline build; ranked route selection; evolution intervals and no-evidence sampling; shared-cell updates and excluded-route promotion; configurable compounding culls and coverage protection; exact route quotas and server ceilings; ranking UI; 36 independent detour/comparator cases; fractional-distance detour invariance; mocked failure/replay/budget checks. No live provider calls or deployment.

- [x] **Restore route-ranking and parameter controls after a map-cell AVM lookup.** Separately authorized and verified offline on October 2, 2026.
  - Refresh pool controls when the request begins and after `state.busy` clears, alongside the existing evaluation-control refresh. Controls stay locked through the attempt and cache check, then return to their appropriate enabled state.
  - The actual-renderer regression passed success, preflight failure, confirmed provider failure, and uncertain submission cases. Failures retain their accounting, unknown outcomes retain their blocked plan, and repeated approval sends no retry. No extra provider calls, publishing, or changes to the live Firefox session.

- [x] Bring the required Shotgun Escape Gates cue into view after trip-point placement.
- [x] When a Destination Approach Gate set needs a decision, scroll the workflow to its approval panel and keep the large **Accept limited set** button in view. User scrolling cancels delayed correction.
- [x] Show a focused advisory with the HTTP status when an app request returns an error response.
- [x] Show real-time Route Ranking progress in its area and move there immediately; the first pass completes free Round 0 without a separate Prescreening pause.
- [x] Retire automatic multi-round paid AVM authorization. After each free cache check, show the exact unique-cell request count and wait for explicit user approval before authorizing a one-round AVM plan; imported Automatic records remain review-only.
- [x] Keep the Route Ranking workflow on explicit One Round runs. Preserve route inclusion controls and acquired rankings/evidence between rounds.
- [x] Add a prominent "Hide disabled routes" checkbox beside the route rankings. Hiding should only filter the displayed ranking cards; unchecking it must restore disabled routes with their rankings, evidence, and inclusion state intact.
- [x] Respect user scrolling during guided workflow focus. Once the user scrolls away from an automatically focused next step, stop trying to scroll back to it during rerenders or progress updates. Resume automatic focus only after a new user action starts a step that calls for guided scrolling.
- [x] Restore the PPSQFT value card on hover over route-containing map cells. The sticky cell tooltip stays interactive beneath route and highway strokes.
- [x] Preserve the map's current zoom when resetting the Red or Exclusion Zone sliders. Known-cell cache refreshes frame the map only once before the first trip.
