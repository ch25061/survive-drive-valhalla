# Survive Drive tutorial storyboard

First cut: real controls captured from a clean local preview. No provider requests were made for filming.

## 00:00:00.000 — Your trip. Your evidence. Your choice.

Screen: `overview`. Compare candidate routes; Understand what is known; Make the final decision.

Narration: Welcome to Survive Drive. Set a trip, compare candidate routes, inspect the evidence, and choose for yourself. The app organizes information; it does not declare a route safe. This tour shows the controls and why they exist.

## 00:00:16.075 — Why so many controls?

Screen: `ranking`. One cell can appear on many routes; Cached values cost no new lookup; Exact plans prevent surprise calls.

Narration: Most of this machinery exists to keep AVM lookups economical. A cell can be shared by several routes, and a saved value can be reused without a new RentCast request. At one cent per new lookup, ten million uncached lookups would total one hundred thousand dollars. A nationwide prefill could reach or exceed that scale, depending on grid density. SD focuses on the cells relevant to your trip instead.

## 00:00:42.250 — Set the trip and road preferences

Screen: `trip`. Place S and D on the map; Choose route preferences; No live traffic in this version.

Narration: Enter coordinates or place the start and destination on the map. You can name each point, choose faster travel or a balance of time and distance, and set road preferences such as highways and tolls. These preferences guide Valhalla; avoid does not guarantee that a road type will disappear. This version does not use live traffic.

## 00:01:03.400 — Review Escape Gates

Screen: `gates`. Review both ends; Choose ring and gate settings; GO finds road suggestions.

Narration: Escape Gates offer possible approaches near both ends of the trip. Adjust the ring and gate settings, then select GO to find road suggestions. Review the gates before searching. With sixteen gates at each end, including the no-gate cases, the full cross product is seventeen by seventeen, or two hundred eighty-nine Valhalla requests. The exact batch is shown before the search.

## 00:01:28.200 — See the route request budget

Screen: `search`. Prepared batch is explicit; Local Valhalla supplies routes; Failures stop for review.

Narration: The route budget shows the prepared Valhalla requests and provider-attempt count. When the local Valhalla service is ready, the prepared batch starts automatically within that limit. A failed request stops the workflow for review. There is no automatic Valhalla retry. The route search does not spend AVM credits.

## 00:01:48.975 — Round 0 uses known evidence

Screen: `evaluate`. Map eligible route cells; Check the shared AVM cache; Cull before buying new evidence.

Narration: Evaluate first maps eligible route cells and checks saved AVM values. Round zero ranks with that known evidence before asking for new paid lookups. Its default cutoff deactivates thirty-five percent of the nominal candidates, while routes with less than twenty percent known coverage are protected. Unknown cells remain unknown; they are not treated as low values.

## 00:02:13.425 — Read the ranking carefully

Screen: `ranking`. Coverage tells how much is known; INCLUDED routes get future evidence; EXCLUDED routes stay in the ranking.

Narration: Each candidate shows its rank, known coverage, and unknown cells. INCLUDED means eligible for the next evidence round; EXCLUDED candidates remain visible and can return after reranking. The Red cutoff classifies known cells by price per square foot. This is a geographic value signal, not a measured safety rating. Highway runs and attached ramps are left out of AVM evaluation.

## 00:02:39.325 — Price One Round before Run

Screen: `round`. Set lookups per INCLUDED route; Calculate exact unique cells; Run is a separate choice.

Narration: For more evidence, choose the number of new cells per INCLUDED route. SD checks the shared cache and removes duplicate cells across routes. Calculate exact One Round lookups to see the final new-call count before you select Run. Each new lookup is counted as one credit at one cent in the current cost display. Failed attempts count, and paid provider calls are not retried automatically.

## 00:03:04.500 — Read the map as evidence

Screen: `evaluate`. Red is below your PPSQFT cutoff; Color range changes contrast; Missing evidence stays unknown.

Narration: Set the Red threshold for ranking and the upper map-color bound for visual contrast. Changing these settings reclassifies or recolors saved evidence without buying new values. Colored cells describe estimated property value around a route, not danger or safety. A missing AVM value still means unknown.

## 00:03:26.050 — Inspect, then decide

Screen: `inspect`. Open Street View from a map point; Check image dates; Record your own observations.

Narration: Open Street View from a map point and check when the imagery was taken. Record what you notice separately from the AVM signal. Then compare route trade-offs and choose a candidate. Export the session or decision if you want a copy. You remain in control of the route and every new evidence round.
