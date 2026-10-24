import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { loadConfig } from './config.js';
import { cryptoRng } from './engine/index.js';
import { createHttpApp } from './http/app.js';
import { createSocketServer } from './net/socket-server.js';

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => (iface as { address: string }).address);
}

const config = loadConfig();
// Each distinct refusal is logged once (and only the first few), so a flood can't fill the log.
const loggedRefusals = new Set<string>();
const guardOptions = {
  allowedHosts: config.allowedHosts,
  trustProxy: config.trustProxy,
  onRefused: (reason: string) => {
    if (loggedRefusals.has(reason) || loggedRefusals.size >= 20) return;
    loggedRefusals.add(reason);
    console.warn(reason);
  },
};
const app = createHttpApp(config.clientDist, guardOptions);
const httpServer = createServer(app);
// Slow or idle clients can't hold sockets open forever, and the total stays bounded.
httpServer.headersTimeout = 10_000;
httpServer.requestTimeout = 30_000;
httpServer.maxConnections = 1_000;
const { io, manager } = createSocketServer(httpServer, {
  rng: cryptoRng,
  reconnectGraceMs: config.reconnectGraceMs,
  checkInvariants: config.dev,
  maxConnectionsPerIp: config.maxConnectionsPerIp,
  maxRooms: config.maxRooms,
  ...guardOptions,
});

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Try: npm start -- --port 3001`);
  } else {
    console.error('Server error:', error.message);
  }
  process.exit(1);
});

httpServer.listen(config.port, config.host, () => {
  console.info('\n  No Mercy LAN server');
  console.info(
    `  Mode:   ${config.dev ? 'development' : 'production'}${config.lanMode ? ' · LAN' : ' · local only'}`,
  );
  console.info(`  Local:  http://localhost:${config.port}`);
  if (config.lanMode) {
    for (const address of lanAddresses())
      console.info(`  LAN:    http://${address}:${config.port}`);
    console.info('  Only run LAN mode on trusted local networks.');
  } else {
    console.info('  LAN access is off. Use "npm run start:lan" so other devices can join.');
  }
  if (config.trustProxy) {
    console.info('  Proxy:  trusting X-Forwarded-Host and X-Forwarded-For');
  }
  if (!config.clientDist) console.info('  Client bundle not found: serving API/socket only.');
  console.info('');
});

function shutdown(): void {
  console.info('\nShutting down: all in-memory rooms will be closed.');
  manager.closeAll('The host stopped the server.');
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
