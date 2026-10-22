import { isIP } from 'node:net';
import { hostname } from 'node:os';

export interface RequestGuardOptions {
  /** Extra hostnames players may type (a custom DNS name for the host). IPs always work. */
  allowedHosts?: string[];
  /** Extra browser origins allowed to open the game socket (cross-origin dev setups). */
  corsOrigins?: string[];
}

/** The subset of an incoming request the guard reads. */
export interface GuardedRequest {
  headers: { host?: string; origin?: string };
}

function hostnameOf(hostHeader: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(hostHeader);
  if (bracketed) return bracketed[1]!.toLowerCase();
  return hostHeader.replace(/:\d+$/, '').toLowerCase();
}

/**
 * Names this machine answers to. Anything else in the Host header means the request came through a
 * DNS name we never published, which is how DNS-rebinding pages reach a LAN server.
 */
function knownHostnames(allowedHosts: string[]): Set<string> {
  const machine = hostname().toLowerCase();
  return new Set(
    ['localhost', machine, `${machine}.local`, ...allowedHosts].map((h) => h.toLowerCase()),
  );
}

export function createRequestGuard(options: RequestGuardOptions = {}) {
  const hosts = knownHostnames(options.allowedHosts ?? []);
  const extraOrigins = new Set(options.corsOrigins ?? []);

  /** True when the Host header names this machine by IP, localhost or a configured name. */
  const isAllowedHost = (hostHeader: string | undefined): boolean => {
    if (!hostHeader) return false;
    const name = hostnameOf(hostHeader);
    return isIP(name) !== 0 || hosts.has(name);
  };

  /**
   * Browsers always send Origin on a WebSocket or cross-origin request, and WebSockets skip CORS,
   * so a page on another site could otherwise drive the game socket from a player's browser.
   * Non-browser clients send no Origin; they can already forge anything, so they pass.
   */
  const isAllowedOrigin = (origin: string | undefined, hostHeader: string | undefined): boolean => {
    if (!origin) return true;
    if (extraOrigins.has(origin)) return true;
    try {
      return new URL(origin).host === hostHeader?.toLowerCase();
    } catch {
      return false;
    }
  };

  return {
    isAllowedHost,
    isAllowedOrigin,
    /** Both checks, for the Socket.IO handshake. */
    allows: (req: GuardedRequest): boolean =>
      isAllowedHost(req.headers.host) && isAllowedOrigin(req.headers.origin, req.headers.host),
  };
}

export type RequestGuard = ReturnType<typeof createRequestGuard>;

/** Strips the IPv4-mapped IPv6 prefix so one device always counts under one address. */
export function clientAddress(remoteAddress: string | undefined): string {
  return (remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
}
