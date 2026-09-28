# Survive Drive TODO

- [x] Bring the required Shotgun Escape Gates cue into view after trip-point placement.
- [x] Show a focused advisory with the HTTP status when an app request returns an error response.
- [x] Show a flashing yellow progress advisory at the Manual or Automatic choice while the initial whole-pool evidence check runs.
- [x] Automatic route-ranking evolution: three bounded AVM evidence rounds. Round 0 starts with a nominal `ceil(N/3)` INCLUDED quota and keeps all routes below 20% known coverage. Each completed evidence round applies the next one-third quota to the original candidate count; previously EXCLUDED routes can fill vacated slots when they rank high enough. One-time preauthorization remains bounded by the per-route/per-round call limit, with an off switch and manual candidate inclusion/exclusion.
- [x] Make Manual and Automatic Route Ranking Evolution clearly distinct and easy to intermix. Show the active mode and a prominent path to prepare a manual reranking round after stopping or completing Automatic; let the user select/deselect viable candidates, preserve acquired evidence and rankings, and require review and approval of each new manual AVM call plan.
- [x] Add a prominent "Hide disabled routes" checkbox beside the route rankings. Hiding should only filter the displayed ranking cards; unchecking it must restore disabled routes with their rankings, evidence, and inclusion state intact.
- [x] Respect user scrolling during guided workflow focus. Once the user scrolls away from an automatically focused next step, stop trying to scroll back to it during rerenders or progress updates. Resume automatic focus only after a new user action starts a step that calls for guided scrolling.
