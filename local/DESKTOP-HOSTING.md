# RS with desktop-hosted Valhalla

Valhalla and its existing road graph remain on the Windows desktop. The private RS website sends approved routing requests through a named Cloudflare Tunnel to `http://127.0.0.1:8006`. The gateway forwards only `/route`, `/status`, and the reviewed highway/tollway `/tile` requests to the existing loopback engine on port 8002.

The phone does not connect directly to the desktop or carry the gateway secret. RS authenticates on the server with `VALHALLA_API_KEY`, a random 32-byte hexadecimal key matching the desktop's private key file. Set the site's `VALHALLA_BASE_URL` to the tunnel's HTTPS origin, without a path. Keep both values in runtime configuration; mark the key secret. Never add the key or Cloudflare connector token to source, browser scripts, URLs, or a session export.

## Desktop setup

1. Save the random key outside the repository in a private file readable by the Windows user running RS. Set its access permissions before starting the gateway.
2. Run `start-desktop-host.ps1 -KeyFile <private-file>`. The existing local launcher reuses healthy Valhalla and bridge processes, retaining map coverage, exclusions, and the local user's trip state.
3. In the existing Cloudflare account, add a new published hostname on a healthy named tunnel with HTTP origin `127.0.0.1:8006`. Preserve other tunnel routes. The hostname exposes only the authenticated gateway. Do not tunnel port 8002, 8003, the desktop preview, or an unrelated local application.
4. Configure the two RS server values and deploy the protected Worker. Check authenticated `/status` and an unauthenticated denial before accepting the connection as ready. These health checks do not request a route or AVM evidence.
5. Run `install-desktop-startup.ps1 -KeyFile <private-file>` to register the current user's limited-permission sign-in task. Keep the existing Cloudflare Windows service enabled. This task does not start before the Windows user signs in.

The PC must remain powered on, awake, and connected to the Internet. The scripts do not change sleep settings. If the engine or connection fails, the gateway reports an error. A route request is forwarded at most once; it is never automatically retried. The hosted Worker continues to claim each approved round in D1 before forwarding, so replaying a submitted round cannot trigger another route request.

## Coverage and verification

This setup uses the current graph: Illinois, Indiana, Ohio, Kentucky, Florida, Southern California, and Texas. It does not add intervening states or nationwide coverage. Engine version and exclusion settings stay unchanged.

Run `node build.mjs`, then `node tests/desktop-host.test.mjs`. The test uses a fake engine and fake D1 claims, checking authentication, exact route/exclusion forwarding, protected road tiles, request limits, failure handling, and duplicate prevention without live provider calls. A real phone route still requires a separately user-approved search in RS.
