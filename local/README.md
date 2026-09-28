# Local Valhalla for Survive Drive

The routing engine and browser bridge run only on this Windows computer. The graph was built from the Illinois and Indiana OpenStreetMap extracts in the adjacent `work/valhalla-local/data` folder. Those files currently use about 1.75 GB and do not cover routes outside those states.

Run `start-local-valhalla.ps1` to start both background services after restarting Windows. Check `http://127.0.0.1:8002/status` for Valhalla and `http://127.0.0.1:8003/status` for the bridge. The bridge allows requests only from the private Survive Drive Valhalla Site, its pending custom subdomain, or a local command without an Origin header. It keeps a durable record of attempted route IDs to prevent automatic retries after a restart.

In the Site, select **Check local Valhalla connection**, review the prepared batch and call budget, then select **Search these routes with Valhalla**. If the browser asks whether the Site may reach a service on this computer, allow it to use the local routing service. No external tunnel or cloud Valhalla server is configured.

Map data: [Geofabrik Illinois](https://download.geofabrik.de/north-america/us/illinois.html), [Geofabrik Indiana](https://download.geofabrik.de/north-america/us/indiana.html). Valhalla package: `pyvalhalla` 3.9.0 from PyPI.
