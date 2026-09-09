import { normalizeEquivalentDomain } from '@shared/domain-normalize';
import type { Cipher } from './types';
import { hostFromUri } from './website-utils';

const URI_PROBE_TIMEOUT_MS = 8_000;
const URI_PROBE_MAX_CONCURRENT = 2;
export const URI_PROBE_BATCH_SIZE = 8;

// Reachability verdicts reported per link row.
//  - ok: the resource responded and is usable (2xx/3xx).
//  - restricted: the server responded but gates the content (401/403/405/407/408/429).
//    The link is alive, but access requires auth or is rate limited.
//  - gone: the resource is confirmed missing (404/410) or its name no longer resolves.
//  - server_error: the server responded with an error status (5xx). The link exists
//    but is currently broken.
//  - unreachable: the resource could not be reached at all (network/DNS/TLS failure,
//    connection refused or timed out, and no server answered).
//  - unknown: no verdict could be produced (non-http(s) scheme, http target probed
//    from an https page whose server rejects https upgrades, CORS-blocked check
//    that also timed out, etc.). It may still be valid.
export type UriReachability = 'ok' | 'restricted' | 'gone' | 'server_error' | 'unreachable' | 'unknown';

export interface CleanupCandidate {
  cipherId: string;
  name: string;
  username: string;
  password: string;
  uris: string[];
  host: string;
  site: string;
  createdAt: number;
  updatedAt: number;
}

export interface DomainGroup {
  site: string;
  items: CleanupCandidate[];
}

export interface AccountGroup {
  account: string;
  items: CleanupCandidate[];
}

export interface UriProbeItem {
  cipherId: string;
  name: string;
  uri: string;
  host: string;
  reachability: UriReachability;
  createdAt: number;
  updatedAt: number;
}

export interface UriProbeResult {
  items: UriProbeItem[];
  total: number;
  checked: number;
  unreachableCount: number;
  unknownCount: number;
  deadCount: number;
}

export interface CleanupOverview {
  domainGroups: DomainGroup[];
  accountGroups: AccountGroup[];
  groupedCount: number;
  duplicateCipherIds: string[];
  uriCandidateCount: number;
}

function valueOrFallback(value: string | null | undefined): string {
  if (value == null) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return /^\d+\.\w+\|[^|]+\|[^|]+$/.test(trimmed) ? '' : trimmed;
}

function cipherDeletedValue(cipher: Cipher): boolean {
  return !!(cipher.deletedDate || (cipher as { deletedAt?: string | null }).deletedAt);
}

function cipherArchivedValue(cipher: Cipher): boolean {
  return !!(cipher.archivedDate || (cipher as { archivedAt?: string | null }).archivedAt);
}

export function isCipherVisibleInCleanup(cipher: Cipher): boolean {
  return Number(cipher.type || 1) === 1
    && !cipherDeletedValue(cipher)
    && !cipherArchivedValue(cipher);
}

function decValue(field: string | null | undefined, decField: string | null | undefined): string {
  const dec = valueOrFallback(decField);
  if (dec) return dec;
  return valueOrFallback(field);
}

function candidateUsername(cipher: Cipher): string {
  return decValue(cipher.login?.username, cipher.login?.decUsername).trim();
}

function candidateUris(cipher: Cipher): string[] {
  const uris = new Set<string>();
  for (const uri of cipher.login?.uris || []) {
    const raw = decValue(uri.uri, uri.decUri).trim();
    if (raw) uris.add(raw);
  }
  return Array.from(uris);
}

function timeValue(value: string | null | undefined): number {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : 0;
}

function candidateDuplicateKey(username: string, password: string): string {
  return `${username.toLowerCase()}\u0000${password}`;
}

export function siteFromUri(uri: string): string {
  const normalized = normalizeEquivalentDomain(uri);
  if (normalized) return normalized;
  const host = hostFromUri(uri).trim().toLowerCase().replace(/^www\./, '');
  return host || uri.trim().toLowerCase();
}

function buildCandidate(cipher: Cipher): CleanupCandidate {
  const username = candidateUsername(cipher);
  const password = decValue(cipher.login?.password, cipher.login?.decPassword);
  const uris = candidateUris(cipher);
  const primaryUri = uris[0] || '';
  return {
    cipherId: cipher.id,
    name: decValue(cipher.name, cipher.decName),
    username,
    password,
    uris,
    host: primaryUri ? hostFromUri(primaryUri).trim().toLowerCase() : '',
    site: primaryUri ? siteFromUri(primaryUri) : '',
    createdAt: timeValue(cipher.creationDate),
    updatedAt: timeValue(cipher.revisionDate || cipher.creationDate),
  };
}

function candidateKey(candidate: CleanupCandidate): string {
  return candidateDuplicateKey(candidate.username, candidate.password);
}

export function buildCleanupOverview(ciphers: Cipher[]): CleanupOverview {
  const candidates = ciphers.filter(isCipherVisibleInCleanup).map(buildCandidate);

  const bySite = new Map<string, CleanupCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.site) continue;
    const group = bySite.get(candidate.site) || [];
    group.push(candidate);
    bySite.set(candidate.site, group);
  }

  const domainGroups: DomainGroup[] = [];
  for (const [site, items] of bySite) {
    if (items.length < 2) continue;
    items.sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      return a.name.localeCompare(b.name);
    });
    domainGroups.push({ site, items });
  }
  domainGroups.sort((a, b) => b.items.length - a.items.length || a.site.localeCompare(b.site));

  const byAccount = new Map<string, CleanupCandidate[]>();
  for (const candidate of candidates) {
    const account = candidate.username.trim() || '\u0000empty';
    const group = byAccount.get(account) || [];
    group.push(candidate);
    byAccount.set(account, group);
  }

  const accountGroups: AccountGroup[] = [];
  for (const [account, items] of byAccount) {
    items.sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      return a.name.localeCompare(b.name);
    });
    accountGroups.push({ account: account === '\u0000empty' ? '' : account, items });
  }
  accountGroups.sort((a, b) => b.items.length - a.items.length || a.account.localeCompare(b.account));

  const keyCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }
  const duplicateCipherIds = candidates
    .filter((candidate) => (keyCounts.get(candidateKey(candidate)) || 0) >= 2)
    .map((candidate) => candidate.cipherId);

  return {
    domainGroups,
    accountGroups,
    groupedCount: domainGroups.reduce((sum, group) => sum + group.items.length, 0),
    duplicateCipherIds,
    uriCandidateCount: candidates.filter((candidate) => candidate.uris.length > 0).length,
  };
}

export function buildUriProbePlan(ciphers: Cipher[]): CleanupCandidate[] {
  return ciphers
    .filter(isCipherVisibleInCleanup)
    .map(buildCandidate)
    .filter((candidate) => candidate.uris.length > 0);
}

export function uriProbeRowKey(cipherId: string, uri: string): string {
  return `${cipherId}\u0000${uri}`;
}

// Builds one row per URI so each link can be checked and displayed independently.
export function buildUriProbeRows(ciphers: Cipher[]): UriProbeItem[] {
  const rows: UriProbeItem[] = [];
  const seen = new Set<string>();
  for (const candidate of ciphers.filter(isCipherVisibleInCleanup).map(buildCandidate)) {
    for (const uri of candidate.uris) {
      const key = uriProbeRowKey(candidate.cipherId, uri);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        cipherId: candidate.cipherId,
        name: candidate.name,
        uri,
        host: hostFromUri(uri).trim().toLowerCase(),
        reachability: 'unknown',
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      });
    }
  }
  rows.sort((a, b) => a.host.localeCompare(b.host) || a.uri.localeCompare(b.uri));
  return rows;
}

export function createUriProbeResult(total: number): UriProbeResult {
  return { items: [], total, checked: 0, unreachableCount: 0, unknownCount: 0, deadCount: 0 };
}

function isHttpUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

/** Classify an HTTP status code into a verdict. */
function verdictFromStatus(status: number): UriReachability {
  if (status >= 200 && status < 400) return 'ok';
  if (status === 401 || status === 403 || status === 405 || status === 407 || status === 408 || status === 429) {
    return 'restricted';
  }
  if (status === 404 || status === 410) return 'gone';
  if (status >= 500) return 'server_error';
  return 'unknown';
}

/** Upgrade an http:// target to https:// so it can be probed from an https page. */
function httpsUpgradeUri(uri: string): string | null {
  return /^http:\/\//i.test(uri) ? `https://${uri.slice(7)}` : null;
}

export function probeUriReachability(uri: string, signal?: AbortSignal): Promise<UriReachability> {
  return new Promise((resolve) => {
    let settled = false;
    const controller = new AbortController();
    let timeoutId: number | null = null;
    const finish = (value: UriReachability) => {
      if (settled) return;
      settled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      controller.abort();
      resolve(value);
    };

    if (signal?.aborted) {
      finish('unknown');
      return;
    }
    const onExternalAbort = () => finish('unknown');
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    if (!isHttpUrl(uri)) {
      // Non-http(s) schemes (mailto:, custom protocols...) can't be probed.
      finish('unknown');
      return;
    }

    // Browsers block http:// requests from https pages (mixed content). Retry
    // such targets over https:// instead of giving up on them.
    const httpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const upgradeUri = httpsPage && /^http:\/\//i.test(uri) ? httpsUpgradeUri(uri) : null;

    // When the probe is running against a possibly-http-only site (upgraded to
    // https) a timeout does not prove the site is dead, so keep it 'unknown'.
    timeoutId = window.setTimeout(() => finish(upgradeUri ? 'unknown' : 'unreachable'), URI_PROBE_TIMEOUT_MS);

    const attemptNoCors = (probeUri: string) => {
      void fetch(probeUri, { method: 'GET', mode: 'no-cors', redirect: 'follow', signal: controller.signal }).then(
        () => finish('ok'),
        () => finish(upgradeUri ? 'unknown' : 'unreachable')
      );
    };

    const probeWithFallback = (probeUri: string) => {
      void fetch(probeUri, { method: 'HEAD', mode: 'cors', redirect: 'follow', signal: controller.signal })
        .then((response) => finish(verdictFromStatus(response.status)))
        .catch(() => {
          if (settled) return;
          void fetch(probeUri, { method: 'GET', mode: 'cors', redirect: 'follow', signal: controller.signal })
            .then((response) => finish(verdictFromStatus(response.status)))
            .catch(() => {
              if (settled) return;
              attemptNoCors(probeUri);
            });
        });
    };

    if (upgradeUri) {
      // Retry the link over https. A status from the https server proves the
      // site is alive; an opaque answer proves it answers; any hard failure
      // leaves us unable to tell http-only sites apart from dead ones.
      void fetch(upgradeUri, { method: 'HEAD', mode: 'cors', redirect: 'follow', signal: controller.signal })
        .then((response) => {
          if (settled) return;
          const verdict = verdictFromStatus(response.status);
          finish(verdict === 'unreachable' ? 'unknown' : verdict);
        })
        .catch(() => {
          if (settled) return;
          void fetch(upgradeUri, { method: 'GET', mode: 'cors', redirect: 'follow', signal: controller.signal })
            .then((response) => {
              if (settled) return;
              const verdict = verdictFromStatus(response.status);
              finish(verdict === 'unreachable' ? 'unknown' : verdict);
            })
            .catch(() => {
              if (settled) return;
              attemptNoCors(upgradeUri);
            });
        });
      return;
    }

    probeWithFallback(uri);
  });
}

export async function runUriProbe(
  candidates: CleanupCandidate[],
  signal?: AbortSignal,
  onProgress?: (checked: number, total: number) => void
): Promise<UriProbeResult> {
  const entries: Array<{ candidate: CleanupCandidate; uri: string }> = [];
  for (const candidate of candidates) {
    for (const uri of candidate.uris) {
      entries.push({ candidate, uri });
    }
  }

  const result = createUriProbeResult(entries.length);
  let nextIndex = 0;
  const workerCount = Math.min(URI_PROBE_MAX_CONCURRENT, entries.length || 1);
  const runWorker = async () => {
    while (nextIndex < entries.length) {
      if (signal?.aborted) return;
      const entry = entries[nextIndex];
      nextIndex += 1;
      const reachability = await probeUriReachability(entry.uri, signal);
      if (signal?.aborted) return;
      const host = hostFromUri(entry.uri).trim().toLowerCase();
      const existing = result.items.find(
        (item) => item.cipherId === entry.candidate.cipherId && item.uri === entry.uri
      );
      if (existing) {
        existing.reachability = reachability;
      } else {
        result.items.push({
          cipherId: entry.candidate.cipherId,
          name: entry.candidate.name,
          uri: entry.uri,
          host,
          reachability,
          createdAt: entry.candidate.createdAt,
          updatedAt: entry.candidate.updatedAt,
        });
      }
      result.checked += 1;
      if (reachability === 'unreachable' || reachability === 'gone' || reachability === 'server_error') {
        result.unreachableCount += 1;
        result.deadCount += 1;
      }
      if (reachability === 'unknown') result.unknownCount += 1;
      onProgress?.(result.checked, entries.length);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  if (!signal?.aborted) {
    result.items.sort((a, b) => a.host.localeCompare(b.host) || a.uri.localeCompare(b.uri));
  }
  return result;
}
