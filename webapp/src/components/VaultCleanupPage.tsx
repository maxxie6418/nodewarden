import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CheckCircle2, ChevronLeft, ChevronRight, Eraser, ExternalLink, Globe, Link2, RefreshCw, Trash2 } from 'lucide-preact';
import { Link } from 'wouter';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  buildCleanupOverview,
  buildUriProbeRows,
  probeUriReachability,
  uriProbeRowKey,
  type CleanupCandidate,
  type UriProbeItem,
  type UriReachability,
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
type CleanupMode = 'domains' | 'links';

const LINK_PAGE_SIZE = 20;

function duplicateKeyOf(candidate: CleanupCandidate): string {
  return `${candidate.username.toLowerCase()}\u0000${candidate.password}`;
}

function formatDate(value: number): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value);
}

export default function VaultCleanupPage(props: VaultCleanupPageProps) {
  const overview = useMemo(() => buildCleanupOverview(props.ciphers), [props.ciphers]);
  const [mode, setMode] = useState<CleanupMode>('domains');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ---- Dead-link importable rows (one URI per row) ----
  const [linkRows, setLinkRows] = useState<UriProbeItem[] | null>(null);
  const [rowResults, setRowResults] = useState<Record<string, UriReachability>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [linkPage, setLinkPage] = useState(1);
  const [uriFilter, setUriFilter] = useState<UriFilter>('issues');
  const [checkingRows, setCheckingRows] = useState<Set<string>>(() => new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ checked: 0, total: 0 });
  const batchAbortRef = useRef<AbortController | null>(null);
  const rowResultsRef = useRef<Record<string, UriReachability>>({});

  // ---- Duplicate-domain helpers ----
  const duplicateIdSet = useMemo(
    () => new Set(overview.duplicateCipherIds),
    [overview.duplicateCipherIds]
  );

  useEffect(() => () => {
    batchAbortRef.current?.abort();
  }, []);

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

  const confirmMoveToTrash = async () => {
    const ids = deletionCipherIds;
    if (!ids.length || deleting) return;
    setDeleting(true);
    try {
      await props.onBulkDelete(ids);
      await props.onRefresh();
      setSelectedIds(new Set());
      setSelectedRowKeys(new Set());
      setConfirmOpen(false);
      props.onNotify('success', t('txt_cleanup_moved_to_trash', { count: ids.length }));
    } catch {
      props.onNotify('error', t('txt_cleanup_move_failed'));
    } finally {
      setDeleting(false);
    }
  };

  // ===================== Dead-link import + check =====================

  const rowKey = (row: UriProbeItem) => uriProbeRowKey(row.cipherId, row.uri);

  const rowCount = linkRows?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(rowCount / LINK_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, linkPage), pageCount);

  const visibleRows = useMemo(() => {
    if (!linkRows) return [];
    const start = (safePage - 1) * LINK_PAGE_SIZE;
    return linkRows.slice(start, start + LINK_PAGE_SIZE);
  }, [linkRows, safePage]);

  const checkedSummary = useMemo(() => {
    const results = Object.values(rowResults);
    const unreachable = results.filter((r) => r === 'unreachable').length;
    const unknown = results.filter((r) => r === 'unknown').length;
    return { checked: results.length, unreachable, unknown };
  }, [rowResults]);

  const visibleIssueRows = useMemo(() => {
    if (!linkRows) return [];
    if (uriFilter === 'all') return visibleRows;
    return visibleRows.filter((row) => {
      const result = rowResults[rowKey(row)];
      return result === 'unreachable' || result === 'unknown';
    });
  }, [visibleRows, rowResults, uriFilter, rowKey]);

  const isLinkImported = linkRows !== null;

  const importLinks = () => {
    const rows = buildUriProbeRows(props.ciphers);
    setLinkRows(rows);
    rowResultsRef.current = {};
    setRowResults({});
    setLinkPage(1);
    setUriFilter('issues');
    setSelectedRowKeys(new Set(rows.map(rowKey)));
    setBatchRunning(false);
    setBatchProgress({ checked: 0, total: 0 });
  };

  const reimportLinks = () => {
    importLinks();
  };

  const toggleRow = (key: string) => {
    if (batchRunning) return;
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setAllRowsSelected = (selected: boolean) => {
    if (batchRunning || !linkRows) return;
    setSelectedRowKeys(selected ? new Set(linkRows.map(rowKey)) : new Set());
  };

  const checkSingleRow = async (row: UriProbeItem) => {
    const key = rowKey(row);
    if (checkingRows.has(key) || batchRunning) return;
    setCheckingRows((current) => new Set(current).add(key));
    try {
      const controller = new AbortController();
      const reachability = await probeUriReachability(row.uri, controller.signal);
      rowResultsRef.current = { ...rowResultsRef.current, [key]: reachability };
      setRowResults(rowResultsRef.current);
    } finally {
      setCheckingRows((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const startBatchCheck = () => {
    if (batchRunning || !linkRows) return;
    const selected = Array.from(selectedRowKeys);
    const targetRows = linkRows.filter((row) => selected.includes(rowKey(row)));
    if (targetRows.length === 0) return;
    batchAbortRef.current?.abort();
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setBatchRunning(true);
    setBatchProgress({ checked: 0, total: targetRows.length });
    void (async () => {
      let index = 0;
      while (index < targetRows.length) {
        if (controller.signal.aborted) break;
        const row = targetRows[index];
        index += 1;
        const key = rowKey(row);
        setCheckingRows((current) => new Set(current).add(key));
        const reachability = await probeUriReachability(row.uri, controller.signal);
        if (!controller.signal.aborted) {
          rowResultsRef.current = { ...rowResultsRef.current, [key]: reachability };
          setRowResults(rowResultsRef.current);
          setBatchProgress({ checked: index, total: targetRows.length });
        }
        setCheckingRows((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
      if (!controller.signal.aborted) {
        setUriFilter('issues');
      }
      setBatchRunning(false);
    })();
  };

  const stopBatchCheck = () => {
    batchAbortRef.current?.abort();
    setBatchRunning(false);
  };

  const linkSelectionCount = selectedRowKeys.size;
  const linkSelectedCipherIds = useMemo(() => {
    if (!linkRows) return new Set<string>();
    const ids = new Set<string>();
    for (const row of linkRows) {
      if (selectedRowKeys.has(rowKey(row))) ids.add(row.cipherId);
    }
    return ids;
  }, [linkRows, selectedRowKeys]);

  const deletionCipherIds = useMemo(() => {
    if (mode !== 'links') return Array.from(selectedIds);
    return Array.from(linkSelectedCipherIds);
  }, [mode, selectedIds, linkSelectedCipherIds]);

  // 分页数据变化时若批量在跑禁止翻页，翻页后保留选择与结果
  const goToPage = (page: number) => {
    if (batchRunning) return;
    setLinkPage(Math.min(Math.max(1, page), pageCount));
  };

  return (
    <section className="vault-cleanup-page" aria-label={t('txt_vault_cleanup')}>
      <div className="vault-cleanup-intro card">
        <div className="vault-cleanup-intro-icon"><Eraser size={22} /></div>
        <div>
          <h2>{t('txt_vault_cleanup')}</h2>
          <p>{t('txt_vault_cleanup_privacy')}</p>
        </div>
      </div>

      <div className="vault-cleanup-mode-switch" role="tablist" aria-label={t('txt_cleanup_mode')}>
        <button type="button" role="tab" aria-selected={mode === 'domains'} className={`vault-cleanup-mode-tab ${mode === 'domains' ? 'active' : ''}`} onClick={() => setMode('domains')}>
          <Globe size={15} className="btn-icon" /> {t('txt_cleanup_domain_section')}
        </button>
        <button type="button" role="tab" aria-selected={mode === 'links'} className={`vault-cleanup-mode-tab ${mode === 'links' ? 'active' : ''}`} onClick={() => setMode('links')}>
          <Link2 size={15} className="btn-icon" /> {t('txt_cleanup_uri_section')}
        </button>
      </div>

      {mode === 'domains' && <div className="vault-cleanup-section card">
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
      </div>}

      {mode === 'links' && <div className="vault-cleanup-section card">
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

        {!isLinkImported ? (
          <div className="vault-cleanup-import-empty">
            <Link2 size={28} aria-hidden="true" />
            {overview.uriCandidateCount === 0 ? (
              <p className="muted">{t('txt_cleanup_uri_no_links')}</p>
            ) : (
              <p className="muted">{t('txt_cleanup_uri_import_hint')}</p>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={props.loading || overview.uriCandidateCount === 0}
              onClick={importLinks}
            >
              <Link2 size={15} className="btn-icon" /> {t('txt_cleanup_uri_import')}
            </button>
          </div>
        ) : (
          <>
            <div className="vault-cleanup-links-toolbar">
              <span className="vault-cleanup-section-meta">
                {t('txt_cleanup_uri_link_count', { count: rowCount })}
              </span>
              <div className="vault-cleanup-links-actions">
                <button type="button" className="btn btn-secondary small" disabled={batchRunning} onClick={() => setAllRowsSelected(true)}>
                  {t('txt_cleanup_uri_select_all')}
                </button>
                <button type="button" className="btn btn-secondary small" disabled={batchRunning} onClick={() => setAllRowsSelected(false)}>
                  {t('txt_cleanup_uri_select_none')}
                </button>
                <button type="button" className="btn btn-primary small" disabled={batchRunning || linkSelectionCount === 0} onClick={startBatchCheck}>
                  {t('txt_cleanup_uri_batch_check', { count: linkSelectionCount })}
                </button>
                {batchRunning && (
                  <button type="button" className="btn btn-danger small" onClick={stopBatchCheck}>
                    <Trash2 size={14} className="btn-icon" /> {t('txt_cleanup_uri_end')}
                  </button>
                )}
              </div>
            </div>

            {batchRunning && (
              <div className="vault-cleanup-progress-wrap" aria-live="polite">
                <progress max={batchProgress.total || 1} value={batchProgress.checked} aria-label={t('txt_cleanup_probe_progress', { checked: batchProgress.checked, total: batchProgress.total })} />
                <span>{t('txt_cleanup_probe_progress', { checked: batchProgress.checked, total: batchProgress.total })}</span>
              </div>
            )}

            <div className="vault-cleanup-rows">
              {visibleIssueRows.length === 0 && rowCount > 0 && (
                <div className="vault-cleanup-empty"><CheckCircle2 size={24} aria-hidden="true" /> <span>{t('txt_cleanup_uri_no_issues')}</span></div>
              )}
              {visibleIssueRows.map((row) => {
                const key = rowKey(row);
                const checking = checkingRows.has(key);
                const result = rowResults[key];
                return (
                  <LinkRow
                    key={key}
                    row={row}
                    selected={selectedRowKeys.has(key)}
                    checking={checking}
                    batchRunning={batchRunning}
                    reachability={result}
                    onToggle={() => toggleRow(key)}
                    onCheck={() => void checkSingleRow(row)}
                  />
                );
              })}
              {rowCount === 0 && (
                <div className="vault-cleanup-empty"><CheckCircle2 size={24} aria-hidden="true" /> <span>{t('txt_cleanup_uri_no_links')}</span></div>
              )}
            </div>

            {pageCount > 1 && (
              <div className="vault-cleanup-pagination">
                <button
                  type="button"
                  className="btn btn-secondary small"
                  disabled={safePage <= 1 || batchRunning}
                  onClick={() => goToPage(safePage - 1)}
                  aria-label={t('txt_cleanup_uri_prev_page')}
                >
                  <ChevronLeft size={14} className="btn-icon" />
                </button>
                <span className="vault-cleanup-page-info">{t('txt_cleanup_uri_page_info', { page: safePage, pages: pageCount })}</span>
                <button
                  type="button"
                  className="btn btn-secondary small"
                  disabled={safePage >= pageCount || batchRunning}
                  onClick={() => goToPage(safePage + 1)}
                  aria-label={t('txt_cleanup_uri_next_page')}
                >
                  <ChevronRight size={14} className="btn-icon" />
                </button>
              </div>
            )}

            {checkedSummary.checked > 0 && !batchRunning && (
              <div className="vault-cleanup-probe-summary">
                <span className="vault-cleanup-chip">{t('txt_cleanup_uri_checked', { count: checkedSummary.checked })}</span>
                <span className="vault-cleanup-chip danger">{t('txt_cleanup_uri_unreachable', { count: checkedSummary.unreachable })}</span>
                <span className="vault-cleanup-chip muted">{t('txt_cleanup_uri_unknown', { count: checkedSummary.unknown })}</span>
                <button
                  type="button"
                  className={`vault-cleanup-chip toggle ${uriFilter === 'issues' ? 'active' : ''}`}
                  onClick={() => setUriFilter(uriFilter === 'issues' ? 'all' : 'issues')}
                >
                  {uriFilter === 'issues' ? t('txt_cleanup_uri_all_issues') : t('txt_cleanup_uri_show_all')}
                </button>
              </div>
            )}
          </>
        )}

        <div className="vault-cleanup-reimport-row">
          {isLinkImported && (
            <button type="button" className="btn btn-secondary small" disabled={batchRunning || props.loading} onClick={reimportLinks}>
              <RefreshCw size={14} className="btn-icon" /> {t('txt_cleanup_uri_reimport')}
            </button>
          )}
        </div>
      </div>}

      <div className="vault-cleanup-footer">
        <button
          type="button"
          className="btn btn-danger"
          disabled={deletionCipherIds.length === 0 || deleting}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 size={15} className="btn-icon" /> {t('txt_cleanup_move_to_trash', { count: deletionCipherIds.length })}
        </button>
        {deletionCipherIds.length > 0 && (
          <button type="button" className="btn btn-secondary" disabled={deleting} onClick={() => { setSelectedIds(new Set()); setSelectedRowKeys(new Set()); }}>
            {t('txt_cleanup_clear_selection')}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        variant="warning"
        danger
        title={t('txt_cleanup_confirm_title')}
        message={t('txt_cleanup_confirm_message', { count: deletionCipherIds.length })}
        confirmText={t('txt_cleanup_move_to_trash', { count: deletionCipherIds.length })}
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

function LinkRow(props: {
  row: UriProbeItem;
  selected: boolean;
  checking: boolean;
  batchRunning: boolean;
  reachability?: UriReachability;
  onToggle: () => void;
  onCheck: () => void;
}) {
  const result = props.reachability;
  const hasResult = result === 'ok' || result === 'unreachable' || result === 'unknown';
  const checking = props.checking;
  return (
    <label className={`vault-cleanup-row vault-cleanup-link-row ${props.selected ? 'selected' : ''}`}>
      <input type="checkbox" checked={props.selected} disabled={props.batchRunning} onChange={props.onToggle} />
      <span className="vault-cleanup-row-main">
        <span className="vault-cleanup-row-title">
          <strong>{props.row.name || t('txt_no_name')}</strong>
          {hasResult && result === 'ok' && <span className="vault-cleanup-badge ok">{t('txt_cleanup_uri_ok')}</span>}
          {hasResult && result === 'unreachable' && <span className="vault-cleanup-badge danger">{t('txt_cleanup_uri_unreachable_short')}</span>}
          {hasResult && result === 'unknown' && <span className="vault-cleanup-badge muted">{t('txt_cleanup_uri_unknown_short')}</span>}
          {checking && <span className="vault-cleanup-badge muted">{t('txt_cleanup_uri_checking_one')}</span>}
          {!checking && !hasResult && <span className="vault-cleanup-badge muted">{t('txt_cleanup_uri_pending')}</span>}
        </span>
        <span className="vault-cleanup-row-sub">
          <span className="vault-cleanup-row-uri" title={props.row.uri}>{props.row.uri}</span>
        </span>
      </span>
      <span className="vault-cleanup-row-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="btn btn-secondary small" disabled={checking || props.batchRunning} onClick={props.onCheck}>
          <Link2 size={14} className="btn-icon" /> {t('txt_cleanup_uri_check_one')}
        </button>
        <Link href={`/vault?cipher=${encodeURIComponent(props.row.cipherId)}`} className="btn btn-secondary small">
          <ExternalLink size={14} className="btn-icon" />{t('txt_password_security_jump')}
        </Link>
      </span>
    </label>
  );
}
