import { useMemo, useState } from 'preact/hooks';
import { ArrowLeft, ExternalLink, Grid2X2, List, Plus, Search, Star, StickyNote } from 'lucide-preact';
import WebsiteIcon from '@/components/vault/WebsiteIcon';
import type { Cipher, Folder } from '@/lib/types';
import { firstCipherUri, hostFromUri } from '@/lib/website-utils';
import { t } from '@/lib/i18n';

export type CollectionPageMode = 'home' | 'notes' | 'bookmarks';

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

function CipherDetail(props: { cipher: Cipher; kind: 'note' | 'bookmark'; onBack: () => void }) {
  const isNote = props.kind === 'note';
  const uri = firstCipherUri(props.cipher);
  return (
    <div className="collection-detail">
      <button type="button" className="btn btn-secondary small collection-back" onClick={props.onBack}><ArrowLeft size={15} /> {t('txt_back')}</button>
      <div className="collection-detail-heading">
        <span className="collection-detail-icon">{isNote ? <StickyNote size={22} /> : <ExternalLink size={22} />}</span>
        <div><span className="collection-kicker">{isNote ? t('nav_notes') : t('nav_bookmarks')}</span><h1>{cipherName(props.cipher)}</h1></div>
      </div>
      {isNote ? <div className="collection-detail-note">{props.cipher.decNotes || props.cipher.notes || t('txt_no_notes')}</div> : <a className="collection-detail-link" href={uri} target="_blank" rel="noreferrer"><ExternalLink size={16} /> {uri}</a>}
      {props.cipher.favorite && <div className="collection-detail-favorite"><Star size={15} fill="currentColor" /> {t('txt_favorites')}</div>}
    </div>
  );
}

function CollectionDetailPanel(props: { cipher: Cipher | null; kind: 'note' | 'bookmark'; onBack: () => void }) {
  return (
    <div className="collection-detail-panel">
      {props.cipher ? (
        <CipherDetail cipher={props.cipher} kind={props.kind} onBack={props.onBack} />
      ) : (
        <div className="collection-detail-empty">{t('txt_select_item')}</div>
      )}
    </div>
  );
}

function NoteList(props: { notes: Cipher[]; selectedId?: string; onOpen: (cipher: Cipher) => void; compact?: boolean }) {
  if (!props.notes.length) return <div className="collection-empty">{t('txt_no_items')}</div>;
  return (
    <div className={`collection-note-list${props.compact ? ' compact' : ''}`}>
      {props.notes.map((cipher) => (
        <button type="button" className={`collection-note-row ${props.selectedId === cipher.id ? 'active' : ''}`} key={cipher.id} onClick={() => props.onOpen(cipher)}>
          <span className="collection-note-icon"><StickyNote size={16} /></span>
          <span className="collection-note-copy">
            <strong>{cipherName(cipher)}</strong>
            <span>{cipher.decNotes || cipher.notes || t('txt_no_notes')}</span>
          </span>
          {cipher.favorite && <Star size={14} className="collection-favorite" fill="currentColor" />}
        </button>
      ))}
    </div>
  );
}

function BookmarkList(props: { ciphers: Cipher[]; cardMode: boolean; selectedId?: string; onOpen: (cipher: Cipher) => void }) {
  if (!props.ciphers.length) return <div className="collection-empty">{t('txt_no_items')}</div>;
  return (
    <div className={`collection-bookmark-list${props.cardMode ? ' cards' : ''}`}>
      {props.ciphers.map((cipher) => {
        const uri = firstCipherUri(cipher);
        const host = hostFromUri(uri);
        return (
          <button type="button" className={`collection-bookmark ${props.selectedId === cipher.id ? 'active' : ''}`} key={cipher.id} onClick={() => props.onOpen(cipher)}>
            <span className="collection-site-icon"><WebsiteIcon cipher={cipher} /></span>
            <span className="collection-bookmark-copy">
              <strong>{cipherName(cipher)}</strong>
              <span>{host || uri || t('txt_no_uri')}</span>
            </span>
            {cipher.favorite && <Star size={14} className="collection-favorite" fill="currentColor" />}
          </button>
        );
      })}
    </div>
  );
}

export default function HomePage(props: CollectionPageProps) {
  const mode = props.mode || 'home';
  const [cardMode, setCardMode] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [noteQuery, setNoteQuery] = useState('');
  const [selectedCipher, setSelectedCipher] = useState<Cipher | null>(null);
  const activeCiphers = useMemo(() => props.ciphers.filter(isActiveCipher), [props.ciphers]);
  const notes = useMemo(() => activeCiphers.filter((cipher) => cipher.type === 2), [activeCiphers]);
  const bookmarks = useMemo(() => activeCiphers.filter((cipher) => cipher.type === 1 && !!firstCipherUri(cipher)), [activeCiphers]);
  const visibleBookmarks = useMemo(() => showFavorites ? bookmarks.filter((cipher) => cipher.favorite) : bookmarks, [bookmarks, showFavorites]);
  const visibleNotes = useMemo(() => {
    const query = noteQuery.trim().toLowerCase();
    return notes.filter((cipher) => !query || `${cipherName(cipher)} ${cipher.decNotes || cipher.notes || ''}`.toLowerCase().includes(query));
  }, [notes, noteQuery]);
  const recentNotes = useMemo(() => [...notes].sort((a, b) => String(b.revisionDate || '').localeCompare(String(a.revisionDate || ''))).slice(0, 8), [notes]);

  if (props.loading) return <div className="collection-page"><div className="collection-loading">{t('txt_loading')}</div></div>;

  const openCipher = (cipher: Cipher) => setSelectedCipher(cipher);
  const title = mode === 'notes' ? t('nav_notes') : mode === 'bookmarks' ? t('nav_bookmarks') : t('nav_home');

  if (mode === 'notes') {
    return <div className="collection-page collection-single"><div className="collection-heading"><div><span className="collection-kicker">{t('nav_notes')}</span><h1>{title}</h1></div><button type="button" className="btn btn-primary" onClick={() => props.onNavigate('/vault')}><Plus size={16} /> {t('txt_new_note')}</button></div><div className="collection-split-layout"><div className="collection-split-list"><label className="collection-search"><Search size={16} /><input value={noteQuery} onInput={(event) => setNoteQuery((event.currentTarget as HTMLInputElement).value)} placeholder={t('txt_search_notes')} /></label><NoteList notes={visibleNotes} selectedId={selectedCipher?.id} onOpen={openCipher} /></div><CollectionDetailPanel cipher={selectedCipher} kind="note" onBack={() => setSelectedCipher(null)} /></div></div>;
  }

  if (mode === 'bookmarks') {
    return <div className="collection-page collection-single"><div className="collection-heading"><div><span className="collection-kicker">{t('nav_bookmarks')}</span><h1>{title}</h1></div><div className="collection-view-switch"><button type="button" className={`btn btn-secondary small ${!cardMode ? 'active' : ''}`} onClick={() => setCardMode(false)}><List size={15} /> {t('txt_list')}</button><button type="button" className={`btn btn-secondary small ${cardMode ? 'active' : ''}`} onClick={() => setCardMode(true)}><Grid2X2 size={15} /> {t('txt_cards')}</button></div></div><div className="collection-filter-row"><button type="button" className={`collection-filter ${!showFavorites ? 'active' : ''}`} onClick={() => setShowFavorites(false)}>{t('txt_all_items')}</button><button type="button" className={`collection-filter ${showFavorites ? 'active' : ''}`} onClick={() => setShowFavorites(true)}><Star size={14} /> {t('txt_favorites')}</button></div><div className="collection-split-layout"><div className="collection-split-list"><BookmarkList ciphers={visibleBookmarks} cardMode={cardMode} selectedId={selectedCipher?.id} onOpen={openCipher} /></div><CollectionDetailPanel cipher={selectedCipher} kind="bookmark" onBack={() => setSelectedCipher(null)} /></div></div>;
  }

  return (
    <div className="collection-page collection-home">
      <div className="collection-heading"><div><span className="collection-kicker">{t('nav_home')}</span><h1>{t('txt_home_greeting')}</h1></div><button type="button" className="btn btn-primary" onClick={() => props.onNavigate('/vault')}><Plus size={16} /> {t('txt_new_item')}</button></div>
      <div className="collection-home-grid">
        <section className="collection-column collection-bookmarks-column"><div className="collection-section-heading"><div><h2>{t('nav_bookmarks')}</h2><p>{t('txt_bookmarks_subtitle')}</p></div><div className="collection-section-actions"><button type="button" className={`btn btn-secondary small ${!cardMode ? 'active' : ''}`} onClick={() => setCardMode(false)}><List size={15} /></button><button type="button" className={`btn btn-secondary small ${cardMode ? 'active' : ''}`} onClick={() => setCardMode(true)}><Grid2X2 size={15} /></button></div></div><div className="collection-filter-row"><button type="button" className={`collection-filter ${!showFavorites ? 'active' : ''}`} onClick={() => setShowFavorites(false)}>{t('txt_all_items')}</button><button type="button" className={`collection-filter ${showFavorites ? 'active' : ''}`} onClick={() => setShowFavorites(true)}><Star size={14} /> {t('txt_favorites')}</button><button type="button" className="collection-more" onClick={() => props.onNavigate('/bookmarks')}>{t('txt_view_all')}</button></div><BookmarkList ciphers={visibleBookmarks.slice(0, 12)} cardMode={cardMode} onOpen={openCipher} /></section>
        <section className="collection-column collection-notes-column"><div className="collection-section-heading"><div><h2>{t('nav_notes')}</h2><p>{t('txt_notes_subtitle')}</p></div><button type="button" className="btn btn-primary small" onClick={() => props.onNavigate('/vault')}><Plus size={15} /> {t('txt_new_note')}</button></div><label className="collection-search"><Search size={16} /><input value={noteQuery} onInput={(event) => setNoteQuery((event.currentTarget as HTMLInputElement).value)} placeholder={t('txt_search_notes')} /></label><NoteList notes={(noteQuery ? visibleNotes : recentNotes).slice(0, 8)} onOpen={openCipher} compact /></section>
      </div>
    </div>
  );
}

export function NotesPage(props: Omit<CollectionPageProps, 'mode'>) { return <HomePage {...props} mode="notes" />; }
export function BookmarksPage(props: Omit<CollectionPageProps, 'mode'>) { return <HomePage {...props} mode="bookmarks" />; }
