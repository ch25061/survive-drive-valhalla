# Los Angeles long-route workflow

Illustrated training scenario. Trip lines, candidate percentages, and AVM values are examples; no provider requests were sent for this video.

## 00:00:00.000 — A long trip across greater LA

On screen: Santa Clarita to Long Beach; Set faster or balanced routing; Review highways and tolls.

Narration: Let us compare a longer trip across the Los Angeles area, from Santa Clarita to Long Beach. In Set the trip, place both endpoints and review Valhalla preferences for highways, tolls, and route style. This is an illustrated training scenario; the route lines and property values shown here are examples, not live results.

## 00:00:21.600 — Explore both ends of the trip

On screen: Start and destination gates; Include each no-gate case; Four gates each: 25 pairings.

Narration: Next, review Escape Gates near both ends. They suggest different ways out of Santa Clarita and into Long Beach. If you keep four gates at each end, the no-gate choices make five times five, or twenty-five start and destination pairings. The app prepares the full cross product, not just matching gate numbers.

## 00:00:42.375 — Review the Valhalla batch

On screen: Check the exact request count; Route search spends no AVM credits; Returned candidates can overlap.

Narration: Before routing, check the batch and its request limit. Valhalla returns road routes; some pairings may converge on the same corridor. The number of returned candidates can differ from the number of requests. Route discovery does not use RentCast A V M credits.

## 00:01:00.250 — Screen with saved evidence first

On screen: Map non-highway cells; Reuse known AVM values; Protect under 20% coverage.

Narration: After routes arrive, evaluate the candidate pool. Round zero reuses saved A V M evidence before any new paid lookup. The default cull is thirty-five percent of the nominal pool. Routes with under twenty percent known coverage are protected in this first screen, because too little is known to reject them confidently. Highway runs and attached ramps are outside the A V M comparison.

## 00:01:25.350 — Read coverage before rank

On screen: Lower known Red share ranks higher; Coverage shows uncertainty; Weighted PPSQFT breaks Red ties.

Narration: Now read the ranking with its coverage. A route with a low known Red share can still have many unknown cells. When Red shares are equal, higher weighted price per square foot breaks the tie. In this demonstration, every percentage and property value on screen is illustrative, so use the pattern of reasoning rather than the numbers.

## 00:01:46.650 — Choose who gets more evidence

On screen: INCLUDED routes enter One Round; EXCLUDED routes stay visible; Change either selection.

Narration: INCLUDED means eligible for the next evidence round. EXCLUDED candidates remain in the ranked pool, and can return after new evidence changes the order. You can manually include or exclude routes before preparing another round. Every change updates the proposed A V M cost.

## 00:02:05.900 — Count new lookups before Run

On screen: Start at 5 per INCLUDED route; Deduplicate shared cells; Example: 6 calls = 6 credits.

Narration: Set the new lookup count per included route, starting at five. Then select Calculate exact One Round lookups. S D checks the cache and removes cells shared across routes before showing the new call count. For example, six unique new calls would be six credits, or six cents at the current displayed rate. That example is not a quote for this trip. Run remains a separate action.

## 00:02:29.600 — Let new evidence change the pool

On screen: Inspect the completed round; Set the next cutoff, default 35%; Previously excluded routes may return.

Narration: After a completed One Round, the app reranks the full candidate pool. The next cutoff deactivates the chosen share of the previous nominal quota, with thirty-five percent as the current default. The best candidates fill the remaining slots, including routes excluded earlier if new evidence promotes them. You can continue one priced round at a time.

## 00:02:52.550 — Inspect the route, then choose

On screen: Compare route time and evidence; Inspect map cells and Street View; Export your decision.

Narration: Finally, inspect a candidate on the map. The colored honeycomb represents estimated property values, not a safety score. Check the dates of any Street View imagery and keep your own observations separate. Compare travel time, known coverage, unknown areas, and your priorities. Choose a route and export the session if you want a record. You make the decision.
