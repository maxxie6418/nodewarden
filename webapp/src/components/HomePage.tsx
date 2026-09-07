import { useMemo, useState } from 'preact/hooks';
import {
  Archive,
  ArrowLeft,
  ArrowUpDown,
  Calendar,
  Copy,
  ExternalLink,
  FolderOpen,
  Grid2X2,
  List,
  Pencil,
  Plus,
  Search,
  Star,
  StickyNote,
  Trash2,
  X,
} from 'lucide-preact';
import WebsiteIcon from '@/components/vault/WebsiteIcon';
import type { Cipher, Folder } from '@/lib/types';
import { firstCipherUri, hostFromUri } from '@/lib/website-utils';
import { t } from '@/lib/i18n';

export type CollectionPageMode = 'home' | 'notes' | 'bookmarks';

type SortBy = 'name' | 'date' | 'favorite';

interface CollectionPageProps {
  mode?: CollectionPageMode;
  ciphers: Cipher[];
  folders: Folder[];
  loading: boolean;
  onNavigate: (path: string) => void;
}

function isActiveCipher(cipher: Cipher): boolean {
  return !cipher.deletedDate && !cipher.archivedDate;
}

function cipherName(cipher: Cipher): string {
  return cipher.decName || cipher.name || t('txt_no_name');
}

function folderName(cipher: Cipher, folders: Folder[]): string {
  if (!cipher.folderId) return t('txt_no_folder');
  const folder = folders.find((f) => f.id === cipher.folderId);
  return folder?.decName || folder?.name || t('txt_no_folder');
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

/* ── Detail Panel ── */
function CipherDetail(props: {
  cipher: Cipher;
  kind: 'note' | 'bookmark';
  folders: Folder[];
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  const isNote = props.kind === 'note';
  const uri = firstCipherUri(props.cipher);
  const folder = folderName(props.cipher, props.folders);
  const created = formatDate(props.cipher.creationDate);
  const revised = formatDate(props.cipher.revisionDate);

  return (
    <div className="collection-detail">
      <button type="button" className="btn btn-secondary small collection-back" onClick={props.onBack}>
        <ArrowLeft size={15} /> {t('txt_back')}
      </button>

      <div className="collection-detail-heading">
        <span className="collection-detail-icon">{isNote ? <StickyNote size={22} /> : <ExternalLink size={22} />}</span>
        <div>
          <span className="collection-kicker">{isNote ? t('nav_notes') : t('nav_bookmarks')}</span>
          <h1>{cipherName(props.cipher)}</h1>
        </div>
      </div>

      <div className="collection-detail-meta">
        <span className="collection-detail-meta-item"><FolderOpen size={13} /> {folder}</span>
        {created && <span className="collection-detail-meta-item"><Calendar size={13} /> {t('txt_created')}: {created}</span>}
        {revised && <span className="collection-detail-meta-item"><Calendar size={13} /> {t('txt_updated')}: {revised}</span>}
        {props.cipher.favorite && <span className="collection-detail-meta-item collection-detail-meta-fav"><Star size={13} fill="currentColor" /> {t('txt_favorites')}</span>}
      </div>

      {isNote ? (
        <div className="collection-detail-note">{props.cipher.decNotes || props.cipher.notes || t('txt_no_notes')}</div>
      ) : (
        <a className="collection-detail-link" href={uri} target="_blank" rel="noreferrer">
          <ExternalLink size={16} /> {uri}
        </a>
      )}

      <div className="collection-detail-actions">
        {!isNote && uri && (
          <a className="btn btn-primary small" href={uri} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> {t('txt_open_link')}
          </a>
        )}
        {isNote && (
          <button type="button" className="btn btn-primary small" onClick={() => copyToClipboard(props.cipher.decNotes || props.cipher.notes || '')}>
            <Copy size={14} /> {t('txt_copy_content')}
          </button>
        )}
        {!isNote && (
          <button type="button" className="btn btn-secondary small" onClick={() => copyToClipboard(uri || '')}>
            <Copy size={14} /> {t('txt_copy_link')}
          </button>
        )}
        <button type="button" className="btn btn-secondary small" onClick={() => props.onNavigate('/vault')}>
          <Pencil size={14} /> {t('txt_edit_in_vault')}
        </button>
      </div>
    </div>
  );
}

function CollectionDetailPanel(props: {
  cipher: Cipher | null;
  kind: 'note' | 'bookmark';
  folders: Folder[];
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="collection-detail-panel">
      {props.cipher ? (
        <CipherDetail cipher={props.cipher} kind={props.kind} folders={props.folders} onBack={props.onBack} onNavigate={props.onNavigate} />
      ) : (
        <div className="collection-detail-empty">{t('txt_select_item')}</div>
      )}
    </div>
  );
}

/* ── Note List ── */
function NoteList(props: {
  notes: Cipher[];
  folders: Folder[];
  selectedId?: string;
  onOpen: (cipher: Cipher) => void;
  compact?: boolean;
}) {
  if (!props.notes.length) return <div className="collection-empty">{t('txt_no_items')}</div>;
  return (
    <div className={`collection-note-list${props.compact ? ' compact' : ''}`}>
      {props.notes.map((cipher) => (
        <button
          type="button"
          className={`collection-note-row ${props.selectedId === cipher.id ? 'active' : ''}`}
          key={cipher.id}
          onClick={() => props.onOpen(cipher)}
        >
          <span className="collection-note-icon"><StickyNote size={16} /></span>
          <span className="collection-note-copy">
            <strong>{cipherName(cipher)}</strong>
            <span>{cipher.decNotes || cipher.notes || t('txt_no_notes')}</span>
            <span className="collection-note-meta">
              <span className="collection-note-folder">{folderName(cipher, props.folders)}</span>
              {cipher.revisionDate && <span>{formatDate(cipher.revisionDate)}</span>}
            </span>
          </span>
          {cipher.favorite && <Star size={14} className="collection-favorite" fill="currentColor" />}
        </button>
      ))}
    </div>
  );
}

/* ── Bookmark List ── */
function BookmarkList(props: {
  ciphers: Cipher[];
  folders: Folder[];
  cardMode: boolean;
  selectedId?: string;
  onOpen: (cipher: Cipher) => void;
}) {
  if (!props.ciphers.length) return <div className="collection-empty">{t('txt_no_items')}</div>;
  return (
    <div className={`collection-bookmark-list${props.cardMode ? ' cards' : ''}`}>
      {props.ciphers.map((cipher) => {
        const uri = firstCipherUri(cipher);
        const host = hostFromUri(uri);
        return (
          <button
            type="button"
            className={`collection-bookmark ${props.selectedId === cipher.id ? 'active' : ''}`}
            key={cipher.id}
            onClick={() => props.onOpen(cipher)}
          >
            <span className="collection-site-icon"><WebsiteIcon cipher={cipher} /></span>
            <span className="collection-bookmark-copy">
              <strong>{cipherName(cipher)}</strong>
              <span>{host || uri || t('txt_no_uri')}</span>
              <span className="collection-bookmark-meta">
                <span className="collection-bookmark-folder">{folderName(cipher, props.folders)}</span>
                {cipher.revisionDate && <span>{formatDate(cipher.revisionDate)}</span>}
              </span>
            </span>
            {cipher.favorite && <Star size={14} className="collection-favorite" fill="currentColor" />}
            <span className="collection-bookmark-hover-actions">
              <a
                className="collection-hover-btn"
                href={uri || ''}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={t('txt_open_link')}
              >
                <ExternalLink size={14} />
              </a>
              <button
                type="button"
                className="collection-hover-btn"
                onClick={(e) => { e.stopPropagation(); copyToClipboard(uri || ''); }}
                title={t('txt_copy_link')}
              >
                <Copy size={14} />
              </button>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Toolbar Components ── */
function SearchField(props: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="collection-search">
      <Search size={16} />
      <input
        value={props.value}
        onInput={(event) => props.onChange((event.currentTarget as HTMLInputElement).value)}
        placeholder={props.placeholder}
      />
      {props.value && (
        <button type="button" className="collection-search-clear" onClick={() => props.onChange('')}>
          <X size={14} />
        </button>
      )}
    </label>
  );
}

function SortSelect(props: { value: SortBy; onChange: (v: SortBy) => void }) {
  return (
    <div className="collection-sort">
      <ArrowUpDown size={14} />
      <select
        value={props.value}
        onChange={(e) => props.onChange((e.currentTarget as HTMLSelectElement).value as SortBy)}
        className="collection-sort-select"
      >
        <option value="name">{t('txt_sort_name')}</option>
        <option value="date">{t('txt_sort_date')}</option>
        <option value="favorite">{t('txt_sort_favorite')}</option>
      </select>
    </div>
  );
}

function FolderSelect(props: { value: string; folders: Folder[]; onChange: (v: string) => void }) {
  return (
    <div className="collection-folder-filter">
      <FolderOpen size={14} />
      <select
        value={props.value}
        onChange={(e) => props.onChange((e.currentTarget as HTMLSelectElement).value)}
        className="collection-folder-select"
      >
        <option value="">{t('txt_all_folders')}</option>
        {props.folders.map((f) => (
          <option key={f.id} value={f.id}>{f.decName || f.name}</option>
        ))}
      </select>
    </div>
  );
}

/* ── Main Page ── */
export default function HomePage(props: CollectionPageProps) {
  const mode = props.mode || 'home';
  const [cardMode, setCardMode] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [noteQuery, setNoteQuery] = useState('');
  const [bookmarkQuery, setBookmarkQuery] = useState('');
  const [selectedCipher, setSelectedCipher] = useState<Cipher | null>(null);
  const [noteSort, setNoteSort] = useState<SortBy>('date');
  const [bookmarkSort, setBookmarkSort] = useState<SortBy>('date');
  const [noteFolder, setNoteFolder] = useState('');
  const [bookmarkFolder, setBookmarkFolder] = useState('');

  const activeCiphers = useMemo(() => props.ciphers.filter(isActiveCipher), [props.ciphers]);
  const notes = useMemo(() => activeCiphers.filter((cipher) => cipher.type === 2), [activeCiphers]);
  const bookmarks = useMemo(() => activeCiphers.filter((cipher) => cipher.type === 1 && !!firstCipherUri(cipher)), [activeCiphers]);

  const filteredBookmarks = useMemo(() => {
    let list = bookmarks;
    if (showFavorites) list = list.filter((c) => c.favorite);
    if (bookmarkFolder) list = list.filter((c) => c.folderId === bookmarkFolder);
    const q = bookmarkQuery.trim().toLowerCase();
    if (q) list = list.filter((c) => `${cipherName(c)} ${hostFromUri(firstCipherUri(c)) || ''}`.toLowerCase().includes(q));
    return list;
  }, [bookmarks, showFavorites, bookmarkFolder, bookmarkQuery]);

  const sortedBookmarks = useMemo(() => {
    const list = [...filteredBookmarks];
    if (bookmarkSort === 'name') list.sort((a, b) => cipherName(a).localeCompare(cipherName(b)));
    if (bookmarkSort === 'date') list.sort((a, b) => String(b.revisionDate || '').localeCompare(String(a.revisionDate || '')));
    if (bookmarkSort === 'favorite') list.sort((a, b) => Number(b.favorite) - Number(a.favorite) || cipherName(a).localeCompare(cipherName(b)));
    return list;
  }, [filteredBookmarks, bookmarkSort]);

  const filteredNotes = useMemo(() => {
    let list = notes;
    if (noteFolder) list = list.filter((c) => c.folderId === noteFolder);
    const q = noteQuery.trim().toLowerCase();
    if (q) list = list.filter((c) => `${cipherName(c)} ${c.decNotes || c.notes || ''}`.toLowerCase().includes(q));
    return list;
  }, [notes, noteFolder, noteQuery]);

  const sortedNotes = useMemo(() => {
    const list = [...filteredNotes];
    if (noteSort === 'name') list.sort((a, b) => cipherName(a).localeCompare(cipherName(b)));
    if (noteSort === 'date') list.sort((a, b) => String(b.revisionDate || '').localeCompare(String(a.revisionDate || '')));
    if (noteSort === 'favorite') list.sort((a, b) => Number(b.favorite) - Number(a.favorite) || cipherName(a).localeCompare(cipherName(b)));
    return list;
  }, [filteredNotes, noteSort]);

  const recentNotes = useMemo(() => [...notes].sort((a, b) => String(b.revisionDate || '').localeCompare(String(a.revisionDate || ''))).slice(0, 8), [notes]);

  const homeVisibleBookmarks = useMemo(() => showFavorites ? bookmarks.filter((c) => c.favorite) : bookmarks, [bookmarks, showFavorites]);
  const homeVisibleNotes = useMemo(() => {
    const q = noteQuery.trim().toLowerCase();
    return notes.filter((c) => !q || `${cipherName(c)} ${c.decNotes || c.notes || ''}`.toLowerCase().includes(q));
  }, [notes, noteQuery]);

  if (props.loading) return <div className="collection-page"><div className="collection-loading">{t('txt_loading')}</div></div>;

  const openCipher = (cipher: Cipher) => setSelectedCipher(cipher);
  const title = mode === 'notes' ? t('nav_notes') : mode === 'bookmarks' ? t('nav_bookmarks') : t('nav_home');

  /* ── Notes Page ── */
  if (mode === 'notes') {
    return (
      <div className="collection-page collection-single">
        <div className="collection-heading">
          <div><span className="collection-kicker">{t('nav_notes')}</span><h1>{title}</h1></div>
          <button type="button" className="btn btn-primary" onClick={() => props.onNavigate('/vault')}><Plus size={16} /> {t('txt_new_note')}</button>
        </div>
        <div className="collection-toolbar">
          <SearchField value={noteQuery} onChange={setNoteQuery} placeholder={t('txt_search_notes')} />
          <SortSelect value={noteSort} onChange={setNoteSort} />
          <FolderSelect value={noteFolder} folders={props.folders} onChange={setNoteFolder} />
        </div>
        <div className="collection-split-layout">
          <div className="collection-split-list">
            <NoteList notes={sortedNotes} folders={props.folders} selectedId={selectedCipher?.id} onOpen={openCipher} />
          </div>
          <CollectionDetailPanel cipher={selectedCipher} kind="note" folders={props.folders} onBack={() => setSelectedCipher(null)} onNavigate={props.onNavigate} />
        </div>
      </div>
    );
  }

  /* ── Bookmarks Page ── */
  if (mode === 'bookmarks') {
    return (
      <div className="collection-page collection-single">
        <div className="collection-heading">
          <div><span className="collection-kicker">{t('nav_bookmarks')}</span><h1>{title}</h1></div>
          <div className="collection-view-switch">
            <button type="button" className={`btn btn-secondary small ${!cardMode ? 'active' : ''}`} onClick={() => setCardMode(false)}><List size={15} /> {t('txt_list')}</button>
            <button type="button" className={`btn btn-secondary small ${cardMode ? 'active' : ''}`} onClick={() => setCardMode(true)}><Grid2X2 size={15} /> {t('txt_cards')}</button>
          </div>
        </div>
        <div className="collection-toolbar">
          <SearchField value={bookmarkQuery} onChange={setBookmarkQuery} placeholder={t('txt_search_bookmarks')} />
          <SortSelect value={bookmarkSort} onChange={setBookmarkSort} />
          <FolderSelect value={bookmarkFolder} folders={props.folders} onChange={setBookmarkFolder} />
        </div>
        <div className="collection-filter-row">
          <button type="button" className={`collection-filter ${!showFavorites ? 'active' : ''}`} onClick={() => setShowFavorites(false)}>{t('txt_all_items')}</button>
          <button type="button" className={`collection-filter ${showFavorites ? 'active' : ''}`} onClick={() => setShowFavorites(true)}><Star size={14} /> {t('txt_favorites')}</button>
          <span className="collection-count">{sortedBookmarks.length} {t('txt_items')}</span>
        </div>
        <div className="collection-split-layout">
          <div className="collection-split-list">
            <BookmarkList ciphers={sortedBookmarks} folders={props.folders} cardMode={cardMode} selectedId={selectedCipher?.id} onOpen={openCipher} />
          </div>
          <CollectionDetailPanel cipher={selectedCipher} kind="bookmark" folders={props.folders} onBack={() => setSelectedCipher(null)} onNavigate={props.onNavigate} />
        </div>
      </div>
    );
  }

  /* ── Home Page ── */
  return (
    <div className="collection-page collection-home">
      <div className="collection-heading">
        <div><span className="collection-kicker">{t('nav_home')}</span><h1>{t('txt_home_greeting')}</h1></div>
        <button type="button" className="btn btn-primary" onClick={() => props.onNavigate('/vault')}><Plus size={16} /> {t('txt_new_item')}</button>
      </div>
      <div className="collection-home-grid">
        <section className="collection-column collection-bookmarks-column">
          <div className="collection-section-heading">
            <div><h2>{t('nav_bookmarks')}</h2><p>{t('txt_bookmarks_subtitle')}</p></div>
            <div className="collection-section-actions">
              <button type="button" className={`btn btn-secondary small ${!cardMode ? 'active' : ''}`} onClick={() => setCardMode(false)}><List size={15} /></button>
              <button type="button" className={`btn btn-secondary small ${cardMode ? 'active' : ''}`} onClick={() => setCardMode(true)}><Grid2X2 size={15} /></button>
            </div>
          </div>
          <div className="collection-filter-row">
            <button type="button" className={`collection-filter ${!showFavorites ? 'active' : ''}`} onClick={() => setShowFavorites(false)}>{t('txt_all_items')}</button>
            <button type="button" className={`collection-filter ${showFavorites ? 'active' : ''}`} onClick={() => setShowFavorites(true)}><Star size={14} /> {t('txt_favorites')}</button>
            <button type="button" className="collection-more" onClick={() => props.onNavigate('/bookmarks')}>{t('txt_view_all')}</button>
          </div>
          <BookmarkList ciphers={homeVisibleBookmarks.slice(0, 12)} folders={props.folders} cardMode={cardMode} onOpen={openCipher} />
        </section>
        <section className="collection-column collection-notes-column">
          <div className="collection-section-heading">
            <div><h2>{t('nav_notes')}</h2><p>{t('txt_notes_subtitle')}</p></div>
            <button type="button" className="btn btn-primary small" onClick={() => props.onNavigate('/vault')}><Plus size={15} /> {t('txt_new_note')}</button>
          </div>
          <label className="collection-search">
            <Search size={16} />
            <input value={noteQuery} onInput={(event) => setNoteQuery((event.currentTarget as HTMLInputElement).value)} placeholder={t('txt_search_notes')} />
          </label>
          <NoteList notes={(noteQuery ? homeVisibleNotes : recentNotes).slice(0, 8)} folders={props.folders} onOpen={openCipher} compact />
        </section>
      </div>
    </div>
  );
}

export function NotesPage(props: Omit<CollectionPageProps, 'mode'>) { return <HomePage {...props} mode="notes" />; }
export function BookmarksPage(props: Omit<CollectionPageProps, 'mode'>) { return <HomePage {...props} mode="bookmarks" />; }
