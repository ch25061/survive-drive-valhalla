# Survive Drive · Local Valhalla

Double-click **Open Local Valhalla.cmd**. It starts the routing engine and opens [the local route page](http://127.0.0.1:8003/) in your default browser. The engine and page listen only on this computer. After a Windows restart, run the launcher again.

The local page lets you set a start, destination, and optional fuzzy waypoints on a map or by coordinates. Each waypoint is visited in order with a 200 meter road search radius. Without waypoints, Valhalla may return up to four alternatives. Every **Search routes** click sends one local request. It never retries automatically. The page is for routing only; AVM evaluation and the full review workflow remain in the separate published offshoot.

The Illinois and Indiana road graph is in the sibling `work/valhalla-local` folder and uses about 1.75 GB. Routing outside the included states is not supported. The service uses the `pyvalhalla` 3.9.0 Windows package and [Geofabrik Illinois](https://download.geofabrik.de/north-america/us/illinois.html) and [Indiana](https://download.geofabrik.de/north-america/us/indiana.html) OpenStreetMap extracts.

The [published offshoot](https://survive-drive-valhalla.choppy777.chatgpt.site/) also has a local connection check. Its private sign-in and the browser's local network controls may prevent that hosted page from reaching this computer. The local page avoids that connection boundary.

For diagnostics, `http://127.0.0.1:8002/status` checks Valhalla and `http://127.0.0.1:8003/status` checks the local page and bridge. Request IDs are recorded in `work/valhalla-local/claims.jsonl` to prevent a repeated attempt after a restart.
