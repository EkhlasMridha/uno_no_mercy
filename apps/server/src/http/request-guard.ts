import { isIP } from 'node:net';
import { hostname } from 'node:os';

export interface RequestGuardOptions {
  /** Extra hostnames players may type (a custom DNS name for the host). IPs always work. */
  allowedHosts?: string[];
  /** Extra browser origins allowed to open the game socket (cross-origin dev setups). */
  corsOrigins?: string[];
  /**
   * Behind a reverse proxy: take the public host from X-Forwarded-Host and the player's address
   * from X-Forwarded-For. Off by default, because any LAN client could forge those headers.
   */
  trustProxy?: boolean;
  /** Told why a request was refused, so a misconfigured proxy shows up in the server log. */
  onRefused?: (reason: string) => void;
}

/** The subset of an incoming request the guard reads. */
export interface GuardedRequest {
  headers: {
    host?: string;
    origin?: string;
    'x-forwarded-host'?: string | string[];
    'x-forwarded-for'?: string | string[];
  };
  socket?: { remoteAddress?: string };
}

/** All comma-separated entries of a header that may be repeated, in order. */
function headerEntries(value: string | string[] | undefined): string[] {
  return [value ?? []]
    .flat()
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
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
  const refused = (reason: string): false => {
    options.onRefused?.(reason);
    return false;
  };

  /**
   * The host the player's browser asked for. A proxy's first X-Forwarded-Host entry is the one the
   * browser used; the Host header then only names the proxy's upstream.
   */
  const publicHost = (req: GuardedRequest): string | undefined =>
    (options.trustProxy ? headerEntries(req.headers['x-forwarded-host'])[0] : undefined) ??
    req.headers.host;

  /**
   * The player's address. A proxy appends the address it saw to X-Forwarded-For, so only the last
   * entry is trustworthy; earlier ones come from the client and can be forged.
   */
  const addressOf = (req: GuardedRequest): string => {
    const forwarded = options.trustProxy ? headerEntries(req.headers['x-forwarded-for']) : [];
    return clientAddress(forwarded[forwarded.length - 1] ?? req.socket?.remoteAddress);
  };

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

  /** The host check for a request, reporting the hostname when it is refused. */
  const allowsHost = (req: GuardedRequest): boolean => {
    const host = publicHost(req);
    if (isAllowedHost(host)) return true;
    return refused(
      `Refused a request for host "${host ?? ''}". If players open the game by this name, add it to ` +
        'ALLOWED_HOSTS. Behind a reverse proxy, also set TRUST_PROXY=1 and forward X-Forwarded-Host.',
    );
  };

  return {
    isAllowedHost,
    isAllowedOrigin,
    allowsHost,
    addressOf,
    /** Both checks, for the Socket.IO handshake. */
    allows: (req: GuardedRequest): boolean => {
      if (!allowsHost(req)) return false;
      const host = publicHost(req);
      if (isAllowedOrigin(req.headers.origin, host)) return true;
      return refused(
        `Refused a game socket from origin "${req.headers.origin ?? ''}" for host "${host ?? ''}". ` +
          'Behind a reverse proxy, set TRUST_PROXY=1 and forward X-Forwarded-Host $http_host ' +
          '(with the port).',
      );
    },
  };
}

export type RequestGuard = ReturnType<typeof createRequestGuard>;

/** Strips the IPv4-mapped IPv6 prefix so one device always counts under one address. */
export function clientAddress(remoteAddress: string | undefined): string {
  return (remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
}
