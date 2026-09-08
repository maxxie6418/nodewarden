import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CheckCircle2, Eraser, ExternalLink, Globe, Link2, RefreshCw, Square, Trash2 } from 'lucide-preact';
import { Link } from 'wouter';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  buildCleanupOverview,
  buildUriProbePlan,
  isCipherVisibleInCleanup,
  runUriProbe,
  type CleanupCandidate,
  type UriProbeResult,
} from '@/lib/vault-cleanup';
import { t } from '@/lib/i18n';
import type { Cipher } from '@/lib/types';

interface VaultCleanupPageProps {
  ciphers: Cipher[];
  loading: boolean;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
}

type UriFilter = 'issues' | 'all';

function duplicateKeyOf(candidate: CleanupCandidate): string {
  return `${candidate.username.toLowerCase()}\u0000${candidate.password}`;
}

function formatDate(value: number): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value);
}

export default function VaultCleanupPage(props: VaultCleanupPageProps) {
  const overview = useMemo(() => buildCleanupOverview(props.ciphers), [props.ciphers]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [probeResult, setProbeResult] = useState<UriProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeProgress, setProbeProgress] = useState({ checked: 0, total: 0 });
  const [uriFilter, setUriFilter] = useState<UriFilter>('issues');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const probeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    probeAbortRef.current?.abort();
  }, []);

  const duplicateIdSet = useMemo(
    () => new Set(overview.duplicateCipherIds),
    [overview.duplicateCipherIds]
  );

  const toggleSelected = (cipherId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(cipherId)) next.delete(cipherId);
      else next.add(cipherId);
      return next;
    });
  };

  const selectGroupAll = (group: { items: CleanupCandidate[] }) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of group.items) next.add(item.cipherId);
      return next;
    });
  };

  const selectOlderDuplicates = (group: { items: CleanupCandidate[] }) => {
    const newestByKey = new Map<string, CleanupCandidate>();
    for (const item of group.items) {
      const key = duplicateKeyOf(item);
      const existing = newestByKey.get(key);
      if (!existing || item.updatedAt > existing.updatedAt) newestByKey.set(key, item);
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of group.items) {
        if (newestByKey.get(duplicateKeyOf(item)) !== item) next.add(item.cipherId);
      }
      return next;
    });
  };

  const selectedCount = selectedIds.size;

  const confirmMoveToTrash = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length || deleting) return;
    setDeleting(true);
    try {
      await props.onBulkDelete(ids);
      await props.onRefresh();
      setSelectedIds(new Set());
      setConfirmOpen(false);
      props.onNotify('success', t('txt_cleanup_moved_to_trash', { count: ids.length }));
    } catch {
      props.onNotify('error', t('txt_cleanup_move_failed'));
    } finally {
      setDeleting(false);
    }
  };

  const stopProbe = () => {
    probeAbortRef.current?.abort();
  };

  const startProbe = () => {
    if (probing) return;
    probeAbortRef.current?.abort();
    const controller = new AbortController();
    probeAbortRef.current = controller;
    setProbing(true);
    setProbeResult(null);
    setUriFilter('issues');
    const plan = buildUriProbePlan(props.ciphers);
    setProbeProgress({ checked: 0, total: plan.reduce((sum, item) => sum + item.uris.length, 0) });
    void runUriProbe(
      plan,
      controller.signal,
      (checked, total) => setProbeProgress({ checked, total })
    ).then((result) => {
      if (controller.signal.aborted) return;
      setProbeResult(result);
      setProbing(false);
    });
  };

  const probeItemsByCipher = useMemo(() => {
    const map = new Map<string, UriProbeResult['items']>();
    for (const item of probeResult?.items || []) {
      const list = map.get(item.cipherId) || [];
      list.push(item);
      map.set(item.cipherId, list);
    }
    return map;
  }, [probeResult]);

  const filteredProbeCiphers = useMemo(() => {
    if (!probeResult) return [];
    return props.ciphers.filter((cipher) => {
      if (!isCipherVisibleInCleanup(cipher)) return false;
      const items = probeItemsByCipher.get(cipher.id) || [];
      if (!items.length) return false;
      if (uriFilter === 'all') return true;
      return items.some((item) => item.reachability !== 'ok');
    });
  }, [props.ciphers, probeResult, probeItemsByCipher, uriFilter]);

  const visibleCipherIds = useMemo(() => new Set(props.ciphers.map((cipher) => cipher.id)), [props.ciphers]);
  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => visibleCipherIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleCipherIds]);

  return (
    <section className="vault-cleanup-page" aria-label={t('txt_vault_cleanup')}>
      <div className="vault-cleanup-intro card">
        <div className="vault-cleanup-intro-icon"><Eraser size={22} /></div>
        <div>
          <h2>{t('txt_vault_cleanup')}</h2>
          <p>{t('txt_vault_cleanup_privacy')}</p>
        </div>
      </div>

      <div className="vault-cleanup-section card">
        <div className="vault-cleanup-section-head">
          <div className="vault-cleanup-section-title">
            <Globe size={17} />
            <h3>{t('txt_cleanup_domain_section')}</h3>
          </div>
          {overview.domainGroups.length > 0 && (
            <span className="vault-cleanup-section-meta">
              {t('txt_cleanup_domain_summary', { groups: overview.domainGroups.length, count: overview.groupedCount })}
            </span>
          )}
        </div>
        <p className="vault-cleanup-section-help muted">{t('txt_cleanup_domain_help')}</p>

        {!overview.domainGroups.length && !props.loading ? (
          <div className="vault-cleanup-empty"><CheckCircle2 size={24} aria-hidden="true" /> <span>{t('txt_cleanup_domain_empty')}</span></div>
        ) : (
          <div className="vault-cleanup-groups">
            {overview.domainGroups.map((group) => (
              <div className="vault-cleanup-group" key={group.site}>
                <div className="vault-cleanup-group-head">
                  <span className="vault-cleanup-group-site">{group.site} · {group.items.length}</span>
                  <button type="button" className="btn btn-secondary small" onClick={() => selectGroupAll(group)}>
                    {t('txt_cleanup_select_group')}
                  </button>
                  <button type="button" className="btn btn-secondary small" onClick={() => selectOlderDuplicates(group)}>
                    {t('txt_cleanup_select_older_duplicates')}
                  </button>
                </div>
                <div className="vault-cleanup-rows">
                  {group.items.map((item) => (
                    <CleanupRow
                      key={item.cipherId}
                      item={item}
                      selected={selectedIds.has(item.cipherId)}
                      duplicate={duplicateIdSet.has(item.cipherId)}
                      onToggle={() => toggleSelected(item.cipherId)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="vault-cleanup-section card">
        <div className="vault-cleanup-section-head">
          <div className="vault-cleanup-section-title">
            <Link2 size={17} />
            <h3>{t('txt_cleanup_uri_section')}</h3>
          </div>
          <span className="vault-cleanup-section-meta">
            {t('txt_cleanup_uri_summary', { count: overview.uriCandidateCount })}
          </span>
        </div>
        <p className="vault-cleanup-section-help muted">{t('txt_cleanup_uri_help')}</p>

        <div className="vault-cleanup-probe-actions">
          {probing ? (
            <button type="button" className="btn btn-secondary" onClick={stopProbe}>
              <Square size={15} className="btn-icon" /> {t('txt_cleanup_uri_stop')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={props.loading || overview.uriCandidateCount === 0}
              onClick={startProbe}
            >
              {probeResult ? <RefreshCw size={15} className="btn-icon" /> : <Link2 size={15} className="btn-icon" />}
              {probeResult ? t('txt_cleanup_uri_recheck') : t('txt_cleanup_uri_start')}
            </button>
          )}
          {probing && (
            <span className="vault-cleanup-probe-progress" aria-live="polite">
              <RefreshCw size={14} className="btn-icon spin" />
              {t('txt_cleanup_probe_progress', { checked: probeProgress.checked, total: probeProgress.total })}
            </span>
          )}
        </div>

        {probeResult && !probing && (
          <div className="vault-cleanup-probe-summary">
            <span className="vault-cleanup-chip">{t('txt_cleanup_uri_checked', { count: probeResult.checked })}</span>
            <span className="vault-cleanup-chip danger">{t('txt_cleanup_uri_unreachable', { count: probeResult.unreachableCount })}</span>
            <span className="vault-cleanup-chip muted">{t('txt_cleanup_uri_unknown', { count: probeResult.unknownCount })}</span>
            <button
              type="button"
              className={`vault-cleanup-chip toggle ${uriFilter === 'issues' ? 'active' : ''}`}
              onClick={() => setUriFilter(uriFilter === 'issues' ? 'all' : 'issues')}
            >
              {uriFilter === 'issues' ? t('txt_cleanup_uri_all_issues') : t('txt_cleanup_uri_show_all')}
            </button>
          </div>
        )}

        {probeResult && !probing && !filteredProbeCiphers.length && (
          <div className="vault-cleanup-empty"><CheckCircle2 size={24} aria-hidden="true" /> <span>{t('txt_cleanup_uri_no_issues')}</span></div>
        )}

        {probeResult && !probing && filteredProbeCiphers.length > 0 && (
          <div className="vault-cleanup-groups">
            {filteredProbeCiphers.map((cipher) => {
              const items = probeItemsByCipher.get(cipher.id) || [];
              return (
                <div className="vault-cleanup-group" key={cipher.id}>
                  <div className="vault-cleanup-rows">
                    {items.map((item) => (
                      <CleanupRow
                        key={`${item.cipherId}:${item.uri}`}
                        item={{
                          cipherId: item.cipherId,
                          name: item.name,
                          username: '',
                          password: '',
                          uris: [item.uri],
                          host: item.host,
                          site: item.host,
                          createdAt: item.createdAt,
                          updatedAt: item.updatedAt,
                        }}
                        selected={selectedIds.has(item.cipherId)}
                        duplicate={false}
                        reachability={item.reachability}
                        onToggle={() => toggleSelected(item.cipherId)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="vault-cleanup-footer">
        <button
          type="button"
          className="btn btn-danger"
          disabled={selectedCount === 0 || deleting}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 size={15} className="btn-icon" /> {t('txt_cleanup_move_to_trash', { count: selectedCount })}
        </button>
        {selectedCount > 0 && (
          <button type="button" className="btn btn-secondary" disabled={deleting} onClick={() => setSelectedIds(new Set())}>
            {t('txt_cleanup_clear_selection')}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        variant="warning"
        danger
        title={t('txt_cleanup_confirm_title')}
        message={t('txt_cleanup_confirm_message', { count: selectedCount })}
        confirmText={t('txt_cleanup_move_to_trash', { count: selectedCount })}
        confirmDisabled={deleting}
        onConfirm={() => void confirmMoveToTrash()}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}

function CleanupRow(props: {
  item: CleanupCandidate;
  selected: boolean;
  duplicate: boolean;
  reachability?: 'ok' | 'unreachable' | 'unknown';
  onToggle: () => void;
}) {
  const uri = props.item.uris[0] || '';
  return (
    <label className={`vault-cleanup-row ${props.selected ? 'selected' : ''}`}>
      <input type="checkbox" checked={props.selected} onChange={props.onToggle} />
      <span className="vault-cleanup-row-main">
        <span className="vault-cleanup-row-title">
          <strong>{props.item.name || t('txt_no_name')}</strong>
          {props.item.username && <span className="vault-cleanup-row-user">{props.item.username}</span>}
          {props.duplicate && <span className="vault-cleanup-badge danger">{t('txt_cleanup_badge_duplicate')}</span>}
          {props.reachability === 'ok' && <span className="vault-cleanup-badge ok">{t('txt_cleanup_uri_ok')}</span>}
          {props.reachability === 'unreachable' && <span className="vault-cleanup-badge danger">{t('txt_cleanup_uri_unreachable_short')}</span>}
          {props.reachability === 'unknown' && <span className="vault-cleanup-badge muted">{t('txt_cleanup_uri_unknown_short')}</span>}
        </span>
        <span className="vault-cleanup-row-sub">
          {uri ? <span className="vault-cleanup-row-uri">{uri}</span> : <span className="vault-cleanup-row-uri muted">{t('txt_cleanup_item_no_uri')}</span>}
          <span>{t('txt_cleanup_created', { value: formatDate(props.item.createdAt) })}</span>
          <span>{t('txt_cleanup_updated', { value: formatDate(props.item.updatedAt) })}</span>
        </span>
      </span>
      <span className="vault-cleanup-row-actions" onClick={(event) => event.stopPropagation()}>
        <Link href={`/vault?cipher=${encodeURIComponent(props.item.cipherId)}`} className="btn btn-secondary small">
          <ExternalLink size={14} className="btn-icon" />{t('txt_password_security_jump')}
        </Link>
      </span>
    </label>
  );
}
