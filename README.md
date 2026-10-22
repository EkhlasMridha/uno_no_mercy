# No Mercy LAN

A real-time multiplayer card game for 2–6 players on a local network, built to the official rules of the
168-card **UNO Show 'em No Mercy** base game. It uses original artwork and is not affiliated with Mattel.
No one else around? **Play with computer** seats 1–19 computer opponents and deals you straight in.

- React + TypeScript + Vite + Tailwind client
- Node.js + Express + Socket.IO server with an authoritative, pure-TypeScript rules engine
- Shared types, event contracts and Zod schemas in `packages/shared`
- In-memory only: no database, no cloud, works without internet on a LAN

## Quick start

```bash
npm install
npm run build
npm run start:lan      # then open the printed LAN URL on every device
```

Or with Docker: `docker compose up -d --build`, then open `http://<host-LAN-IP>:3000`
(see [LAN setup](docs/LAN-SETUP.md#or-run-it-in-docker)).

| Command                                                 | Purpose                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                                           | Dev mode: server on :3000 + Vite on :5173 (open http://localhost:5173) |
| `npm run dev:lan`                                       | Dev mode reachable from other devices (http://LAN-IP:5173)             |
| `npm run build`                                         | Build shared, server and client                                        |
| `npm start`                                             | Production server, localhost only                                      |
| `npm run start:lan`                                     | Production server on all interfaces (LAN)                              |
| `npm test`                                              | Engine, simulation and Socket.IO integration tests                     |
| `npm run typecheck` / `npm run lint` / `npm run format` | Quality checks                                                         |

## Documentation

- [docs/RULES.md](docs/RULES.md): card composition, every rule, edge cases and chosen policies
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): layers, state machine, protocol, security
- [docs/GAME-FLOW.md](docs/GAME-FLOW.md): room lifecycle, turn walkthrough, validation scenarios
- [docs/LAN-SETUP.md](docs/LAN-SETUP.md): hosting, firewall, troubleshooting
