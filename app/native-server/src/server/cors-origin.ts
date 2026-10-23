/**
 * Origin allow-list check for the local HTTP API.
 *
 * Kept in its own module so it can be unit-tested without importing
 * `server/index.ts`, which pulls in fastify, the agent engines and the database.
 */

/** One allow-list entry: a pattern for extension schemes, or an origin string. */
export type OriginPattern = RegExp | string;

/**
 * Parse an origin into scheme + host, or return null when it is not a usable
 * origin.
 *
 * Returns null for the literal string "null", which browsers send for sandboxed
 * iframes and some `file://` documents. Treating that as a parse failure keeps
 * it out of the allow-list rather than letting it match by accident.
 */
function parseOrigin(value: string): { protocol: string; hostname: string } | null {
  if (!value || value === 'null') {
    return null;
  }
  try {
    const url = new URL(value);
    if (!url.protocol || !url.hostname) {
      return null;
    }
    return { protocol: url.protocol, hostname: url.hostname };
  } catch {
    // Malformed Origin header — must be rejected, never thrown, or the CORS
    // callback turns a hostile header into a 500.
    return null;
  }
}

/**
 * Compare a request `Origin` against a single allow-list entry.
 *
 * String entries are compared as origins — scheme plus host, parsed by the
 * WHATWG URL parser — and never as string prefixes.
 *
 * Why this matters: the previous implementation used `origin.startsWith(pattern)`.
 * With `'http://127.0.0.1'` in the list, a domain the attacker fully controls
 * satisfies the test while sharing no host with the loopback address —
 * `'http://127.0.0.1.example.com'.startsWith('http://127.0.0.1')` is `true`.
 * Since this server exposes browser automation and filesystem routes, that let
 * any page on such a domain drive the browser with no interaction beyond a visit.
 *
 * Port is deliberately not compared: no entry in the allow-list pins one, and the
 * server's own port is chosen at runtime.
 */
export function matchesOriginPattern(origin: string, pattern: OriginPattern): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(origin);
  }

  const requested = parseOrigin(origin);
  const allowed = parseOrigin(pattern);
  if (!requested || !allowed) {
    return false;
  }

  return requested.protocol === allowed.protocol && requested.hostname === allowed.hostname;
}

/**
 * Decide whether a request `Origin` may talk to this server.
 *
 * A missing origin is the caller's problem to handle, not this function's: it is
 * what curl and server-to-server callers send, and the CORS plugin allows it
 * before reaching here.
 */
export function isOriginAllowed(origin: string, allowList: readonly OriginPattern[]): boolean {
  return allowList.some((pattern) => matchesOriginPattern(origin, pattern));
}
