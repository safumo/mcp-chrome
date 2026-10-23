/**
 * Site-storage readers (fork addition): read a specific website's cookies,
 * localStorage and sessionStorage.
 *
 * - Cookies are read from the background via chrome.cookies (includes
 *   HttpOnly), no tab needed.
 * - localStorage/sessionStorage are per-origin page state, so the tool finds
 *   an existing tab at the origin or opens a background one, reads the store
 *   via chrome.scripting, and closes the tab only if it created it.
 */

import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';

interface SiteStorageToolParams {
  url: string;
}

interface CookieItem {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  sameSite?: string;
}

function buildResult(payload: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: false,
  };
}

/** Normalize a user-supplied url or bare domain to an origin (https default). */
function normalizeToOrigin(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error('url must not be empty');
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error(`Invalid url: ${input}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Only http/https urls are supported, got: ${url.protocol}`);
  }
  return url.origin;
}

async function findOrCreateTab(origin: string): Promise<{ tabId: number; created: boolean }> {
  const matches = await chrome.tabs.query({ url: `${origin}/*` });
  const existing = matches.find((t) => typeof t.id === 'number');
  if (existing && typeof existing.id === 'number') {
    return { tabId: existing.id, created: false };
  }
  const created = await chrome.tabs.create({ url: origin, active: false });
  if (typeof created.id !== 'number') throw new Error('Failed to create tab');
  return { tabId: created.id, created: true };
}

async function waitForTabLoad(tabId: number, timeoutMs = 10000): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab ${tabId} did not finish loading within ${timeoutMs}ms`));
    }, timeoutMs);
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Read localStorage ('local') or sessionStorage ('session') in the tab's origin. */
async function readDomStorage(tabId: number, storageType: 'local' | 'session') {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (type: 'local' | 'session') => {
      const store = type === 'local' ? localStorage : sessionStorage;
      const items: Record<string, string> = {};
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key !== null) items[key] = store.getItem(key) ?? '';
      }
      return items;
    },
    args: [storageType],
  });
  const items = results?.[0]?.result;
  if (items === undefined || items === null) {
    throw new Error(`No result returned when reading ${storageType}Storage in tab ${tabId}`);
  }
  return items as Record<string, string>;
}

class GetCookiesTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.GET_COOKIES;

  async execute(args: SiteStorageToolParams): Promise<ToolResult> {
    try {
      const raw = String(args?.url ?? '').trim();
      if (!raw) throw new Error('Missing required argument: url');

      const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
      const cookies: CookieItem[] = (
        hasProtocol
          ? await chrome.cookies.getAll({ url: normalizeToOrigin(raw) })
          : await chrome.cookies.getAll({ domain: raw })
      ).map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        expirationDate: c.expirationDate,
        sameSite: c.sameSite,
      }));

      return buildResult({ url: raw, count: cookies.length, cookies });
    } catch (error) {
      return createErrorResponse(
        `Failed to get cookies: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

abstract class DomStorageTool extends BaseBrowserToolExecutor {
  protected abstract storageType: 'local' | 'session';

  async execute(args: SiteStorageToolParams): Promise<ToolResult> {
    let createdTabId: number | null = null;
    try {
      const origin = normalizeToOrigin(String(args?.url ?? ''));
      const { tabId, created } = await findOrCreateTab(origin);
      createdTabId = created ? tabId : null;
      await waitForTabLoad(tabId);

      const items = await readDomStorage(tabId, this.storageType);
      return buildResult({
        url: origin,
        type: `${this.storageType}Storage`,
        count: Object.keys(items).length,
        items,
      });
    } catch (error) {
      return createErrorResponse(
        `Failed to read ${this.storageType}Storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (createdTabId !== null) {
        chrome.tabs.remove(createdTabId).catch(() => {});
      }
    }
  }
}

class GetLocalStorageTool extends DomStorageTool {
  name = TOOL_NAMES.BROWSER.GET_LOCAL_STORAGE;
  protected storageType = 'local' as const;
}

class GetSessionStorageTool extends DomStorageTool {
  name = TOOL_NAMES.BROWSER.GET_SESSION_STORAGE;
  protected storageType = 'session' as const;
}

export const getCookiesTool = new GetCookiesTool();
export const getLocalStorageTool = new GetLocalStorageTool();
export const getSessionStorageTool = new GetSessionStorageTool();
