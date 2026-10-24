# LAN setup

One computer (the **host**) runs the Node.js server, which also serves the game page. Everyone else opens
the host's LAN address in a browser. No internet connection is needed once dependencies are installed and the
game is built.

> **Security:** LAN mode listens on every network interface. Use it only on a trusted home or office network.
> Never forward the port on your router or expose it to the internet. See [Keeping the host safe](#8-keeping-the-host-safe).

## 1. Requirements (host only)

- Node.js 20 or newer (check with `node -v`).
- The project folder. Run `npm install` once while you have internet access, or copy a folder that already
  has `node_modules`.

## 2. Build and start

```bash
npm install          # once
npm run build        # builds shared package, server and client
npm run start:lan    # serve on 0.0.0.0:3000
```

The console prints the addresses, for example:

```
  Local:  http://localhost:3000
  LAN:    http://192.168.1.23:3000
```

Share the **LAN** address with the other players. Your own IP will differ, and the server never assumes one.

Options:

| What                   | How                                                        |
| ---------------------- | ---------------------------------------------------------- |
| Different port         | `npm run start:lan -- --port 4000` (or the `PORT` env var) |
| Specific interface     | `npm start -- --host 192.168.1.23`                         |
| Local only (no LAN)    | `npm start` (binds to `127.0.0.1`)                         |
| Reconnect grace period | env `RECONNECT_GRACE_SECONDS=180` (default 120)            |
| Join by a custom name  | env `ALLOWED_HOSTS=gamebox.lan` (IP addresses always work) |
| Sockets per device     | env `MAX_CONNECTIONS_PER_IP=32` (default 32)               |
| Rooms at once          | env `MAX_ROOMS=50` (default 50)                            |
| Behind nginx           | env `TRUST_PROXY=1` (see _Behind nginx_ below)             |

### Or run it in Docker

The image builds everything and runs one Node process that serves both the page and the game socket. Only
Docker is needed on the host, not Node.js.

```bash
docker compose up -d --build    # build and start on port 3000
docker compose logs -f          # follow the server log
docker compose down             # stop (all rooms are closed)
```

Without Compose: `docker build -t nomercy-lan .` then `docker run -d -p 3000:3000 nomercy-lan`.

The `LAN:` address printed in the container log is the container's internal IP (`172.17.x.x`). Share the
**host machine's** LAN IP instead. To use another port, change the left side of the mapping
(`-p 4000:3000`). The firewall rule in section 4 is still needed on Windows.

### Behind nginx

The server refuses host names it doesn't know and sockets whose `Origin` doesn't match the host, so a proxy
has to tell it which address the player's browser used. Three things are needed:

1. Start the server with `TRUST_PROXY=1`. It then reads the public host from `X-Forwarded-Host` and each
   player's address from `X-Forwarded-For`. Leave it off without a proxy: players could forge those headers.
2. Add the public name to `ALLOWED_HOSTS`, for example `ALLOWED_HOSTS=uno.example.com`.
3. Forward the WebSocket upgrade and the headers:

```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

server {
  listen 80;
  server_name uno.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Use `$http_host`, not `$host`: `$host` drops the port, and on a non-standard port (`:8080`) the socket is
then refused because the origin no longer matches. Serve the game at the root of its own host name; a
sub-path such as `/uno/` is not supported. HTTPS at the proxy works as is.

With Docker Compose, set the two variables under `environment` in `compose.yaml` and point `proxy_pass` at
the published port (or at `http://nomercy:3000` when nginx runs in the same Compose network). If something
is still refused, the server log says which host or origin it rejected and why.

## 3. Players join

1. Connect the phone or laptop to the **same Wi-Fi/Ethernet network** as the host.
2. Open `http://<host-LAN-IP>:3000` (plain `http`, include the port).
3. Enter a name and the 5-character room code shown in the host's lobby.

## 4. Windows Firewall

The first time Node listens on the network, Windows asks whether to allow it. Tick **Private networks** and
click **Allow access**.

If you dismissed that prompt, add a rule in an **administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "No Mercy LAN" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

Also make sure the Wi-Fi network is set to **Private**: Settings → Network & internet → Wi-Fi → (your
network) → Network profile type: Private. Windows blocks inbound connections on "Public" networks.

To remove the rule later: `Remove-NetFirewallRule -DisplayName "No Mercy LAN"`.

macOS: System Settings → Network → Firewall → allow incoming connections for `node`.
Linux (ufw): `sudo ufw allow 3000/tcp`.

## 5. Development mode

```bash
npm run dev        # server :3000 (tsx watch, invariant checks) + Vite :5173 (proxying sockets)
npm run dev:lan    # same, reachable from other devices via http://<LAN-IP>:5173
```

## 6. Troubleshooting

| Symptom                                                    | Fix                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Other devices can't open the page                          | Use `start:lan` (not `start`). Check the firewall rule, that the network profile is Private, and that both devices are on the same network (guest Wi-Fi often isolates clients). Try `ping <host-IP>` |
| Several "LAN" addresses are printed                        | Use the one on your Wi-Fi/Ethernet adapter (usually `192.168.x.x` or `10.x.x.x`). Virtual adapters (WSL/Hyper-V/VPN, e.g. `172.x.x.x`) are not reachable from phones                                  |
| `Port 3000 is already in use`                              | Start with `--port 3001`, or stop the other program (`Get-NetTCPConnection -LocalPort 3000` shows which process)                                                                                      |
| Page loads but says "Connecting to the host…"              | A proxy, VPN or browser extension may be blocking WebSockets. The client falls back to HTTP long-polling automatically. Disable the VPN and reload                                                    |
| Behind nginx: `421`, or stuck on "Connecting to the host…" | Set `TRUST_PROXY=1` and `ALLOWED_HOSTS`, and forward `X-Forwarded-Host $http_host` (see _Behind nginx_). The server log names the host or origin it refused                                           |
| "That room is no longer available"                         | The server was restarted or everyone left. Rooms only live in memory, so create a new one                                                                                                             |
| A player dropped mid-game                                  | They have 2 minutes to reopen the same tab/browser (it reconnects automatically). After that they forfeit and the game continues                                                                      |
| "This seat was opened in another window"                   | The same player opened the game in a second tab. Only the newest tab stays connected                                                                                                                  |
| Plain `http` page on a phone doesn't allow clipboard copy  | Expected on non-HTTPS origins. Read the room code from the screen                                                                                                                                     |
| `Client bundle not found` printed                          | Run `npm run build` before `npm run start:lan`                                                                                                                                                        |
| Page says "Open the game by the host machine's IP address" | Use the IP address the server printed, or add your hostname with `ALLOWED_HOSTS`                                                                                                                      |

## 7. Offline check

After `npm run build`, the bundle in `apps/client/dist` contains all JavaScript, CSS and the font. It loads
nothing from a CDN and has no analytics. You can disconnect the host and the players from the internet: as
long as they share the LAN, the game works.

## 8. Keeping the host safe

Players only ever talk to the game server, and the server only understands game moves. Nothing a player
sends reaches files, a shell or a database. On top of that:

- **Play on the production build** (`npm run start:lan`, `make play` or Docker). `npm run dev:lan` also puts
  the Vite dev server on the network. It is locked to the client files, but it is a development tool.
- **Docker is the most isolated option.** The container runs as an unprivileged user on a read-only file
  system, with no Linux capabilities and capped memory and processes. It cannot see the host's files.
- **Open the game by IP address** (`http://192.168.1.23:3000`). Requests that arrive under an unknown
  hostname get `421`, which stops DNS-rebinding web pages from reaching the server. If you gave the host a
  DNS name, add it with `ALLOWED_HOSTS`.
- **Other websites can't use the game socket.** A page on another site that a player has open is refused at
  the handshake.
- **One device can hold 32 sockets.** That stops one phone or laptop from filling every room. Docker Desktop
  (Windows/macOS) can show every player under one internal address; if players get refused there, raise
  `MAX_CONNECTIONS_PER_IP` in `compose.yaml`.
- **Keep dependencies patched:** run `npm audit` now and then. `npm audit --omit=dev` (what actually runs on
  game night) should report 0 vulnerabilities.
- Keep the firewall rule scoped to **Private** networks (section 4) and stop the server when you're done.
