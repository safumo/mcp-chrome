import { isOriginAllowed, matchesOriginPattern } from './cors-origin';
import type { OriginPattern } from './cors-origin';

const EXTENSION_ID = 'hbdgbgagpkpjffpklnamcljpakneikee';

// The shipped allow-list shape: one pinned extension origin plus loopback.
const ALLOW_LIST: readonly OriginPattern[] = [
  `chrome-extension://${EXTENSION_ID}`,
  'http://127.0.0.1',
];

describe('isOriginAllowed', () => {
  it('allows the pinned extension origin', () => {
    expect(isOriginAllowed(`chrome-extension://${EXTENSION_ID}`, ALLOW_LIST)).toBe(true);
  });

  it('allows loopback on any port, since the server port is chosen at runtime', () => {
    expect(isOriginAllowed('http://127.0.0.1', ALLOW_LIST)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:12306', ALLOW_LIST)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:65535', ALLOW_LIST)).toBe(true);
  });

  // The regression this module exists for. A prefix test passed this origin:
  // 'http://127.0.0.1.example.com'.startsWith('http://127.0.0.1') === true.
  it('rejects a hostile domain that merely starts with the loopback address', () => {
    expect(isOriginAllowed('http://127.0.0.1.example.com', ALLOW_LIST)).toBe(false);
    expect(isOriginAllowed('http://127.0.0.1.attacker.example', ALLOW_LIST)).toBe(false);
    expect(isOriginAllowed('http://127.0.0.1x.example.com', ALLOW_LIST)).toBe(false);
  });

  it('rejects a path-segment variant that also satisfied the prefix test', () => {
    expect(isOriginAllowed('http://127.0.0.1.example.com/127.0.0.1', ALLOW_LIST)).toBe(false);
  });

  it('rejects a scheme mismatch on an otherwise allowed host', () => {
    expect(isOriginAllowed('https://127.0.0.1', ALLOW_LIST)).toBe(false);
  });

  it('rejects an unrelated origin', () => {
    expect(isOriginAllowed('https://example.com', ALLOW_LIST)).toBe(false);
  });

  it('rejects a different extension id', () => {
    expect(isOriginAllowed('chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh', ALLOW_LIST)).toBe(
      false,
    );
  });

  it('rejects an extension id that is a prefix of the allowed one', () => {
    expect(isOriginAllowed(`chrome-extension://${EXTENSION_ID.slice(0, 20)}`, ALLOW_LIST)).toBe(
      false,
    );
  });

  // Browsers send the literal string for sandboxed iframes and some file:// documents.
  it('rejects the literal null origin', () => {
    expect(isOriginAllowed('null', ALLOW_LIST)).toBe(false);
  });

  it('returns false for a malformed origin rather than throwing', () => {
    for (const bad of ['', 'not a url', 'http://', '://missing-scheme', '\u0000']) {
      expect(() => isOriginAllowed(bad, ALLOW_LIST)).not.toThrow();
      expect(isOriginAllowed(bad, ALLOW_LIST)).toBe(false);
    }
  });

  it('rejects everything when the allow-list is empty', () => {
    expect(isOriginAllowed('http://127.0.0.1', [])).toBe(false);
  });
});

describe('matchesOriginPattern', () => {
  it('still honours RegExp entries, so callers can widen the list if they must', () => {
    expect(matchesOriginPattern('moz-extension://abcd-1234', /^moz-extension:\/\//)).toBe(true);
    expect(matchesOriginPattern('https://example.com', /^moz-extension:\/\//)).toBe(false);
  });

  it('treats a malformed allow-list entry as matching nothing', () => {
    expect(matchesOriginPattern('http://127.0.0.1', 'not a url')).toBe(false);
  });
});
