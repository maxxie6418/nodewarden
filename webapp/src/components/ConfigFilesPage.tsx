import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import VaultPage from '@/components/VaultPage';
import {
  CONFIG_FILE_CIPHER_TYPE,
  CONFIG_FILE_FOLDER_NAME,
  isConfigFileFolder,
  isConfigFileCipher,
  withConfigFileNamePrefix,
  stripConfigFileNamePrefix,
} from '@/components/vault/vault-page-helpers';
import type { Cipher, Folder, VaultDraft } from '@/lib/types';

export interface ConfigFilesPageProps {
  ciphers: Cipher[];
  folders: Folder[];
  loading: boolean;
  error: string;
  emailForReprompt: string;
  onRefresh: () => Promise<void>;
  onCreate: (draft: VaultDraft, attachments?: File[]) => Promise<void>;
  onUpdate: (cipher: Cipher, draft: VaultDraft, options?: { addFiles?: File[]; removeAttachmentIds?: string[] }) => Promise<void>;
  onDelete: (cipher: Cipher) => Promise<void>;
  onArchive: (cipher: Cipher) => Promise<void>;
  onUnarchive: (cipher: Cipher) => Promise<void>;
  onRestore: (ids: string[]) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onBulkPermanentDelete: (ids: string[]) => Promise<void>;
  onBulkRestore: (ids: string[]) => Promise<void>;
  onBulkArchive: (ids: string[]) => Promise<void>;
  onBulkUnarchive: (ids: string[]) => Promise<void>;
  onBulkMove: (ids: string[], folderId: string | null) => Promise<void>;
  onVerifyMasterPassword: (email: string, password: string) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'warning', text: string) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onBulkDeleteFolders: (folderIds: string[]) => Promise<void>;
  onDownloadAttachment: (cipher: Cipher, attachmentId: string) => Promise<void>;
  downloadingAttachmentKey: string;
  attachmentDownloadPercent: number | null;
  uploadingAttachmentName: string;
  attachmentUploadPercent: number | null;
  mobileSidebarToggleKey: number;
}

export default function ConfigFilesPage(props: ConfigFilesPageProps) {
  const configFolder = useMemo(
    () => props.folders.find((folder) => isConfigFileFolder(folder)) || null,
    [props.folders]
  );
  const configFolderId = configFolder?.id || '';
  const createFolderAttemptedRef = useRef(false);

  useEffect(() => {
    if (createFolderAttemptedRef.current) return;
    if (props.loading || props.error) return;
    if (configFolder) return;
    createFolderAttemptedRef.current = true;
    props.onCreateFolder(CONFIG_FILE_FOLDER_NAME).catch(() => {
      createFolderAttemptedRef.current = false;
    });
  }, [props.loading, props.error, configFolder, props.onCreateFolder]);

  const configFolderIds = useMemo(
    () => (configFolderId ? new Set<string>([configFolderId]) : null),
    [configFolderId]
  );

  const configCiphers = useMemo(
    () => props.ciphers.filter((cipher) => isConfigFileCipher(cipher, configFolderIds)),
    [props.ciphers, configFolderIds]
  );

  const normalizeDraft = useCallback(
    (draft: VaultDraft): VaultDraft => {
      const name = stripConfigFileNamePrefix(draft.name);
      return {
        ...draft,
        type: CONFIG_FILE_CIPHER_TYPE,
        folderId: configFolderId || draft.folderId || '',
        name: name ? withConfigFileNamePrefix(name) : '',
      };
    },
    [configFolderId]
  );

  const handleCreate = useCallback(
    async (draft: VaultDraft, attachments?: File[]) => {
      await props.onCreate(normalizeDraft(draft), attachments);
    },
    [props.onCreate, normalizeDraft]
  );

  const handleUpdate = useCallback(
    async (cipher: Cipher, draft: VaultDraft, options?: { addFiles?: File[]; removeAttachmentIds?: string[] }) => {
      await props.onUpdate(cipher, normalizeDraft(draft), options);
    },
    [props.onUpdate, normalizeDraft]
  );

  return (
    <VaultPage
      ciphers={configCiphers}
      folders={props.folders}
      loading={props.loading}
      error={props.error}
      emailForReprompt={props.emailForReprompt}
      onRefresh={props.onRefresh}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={props.onDelete}
      onArchive={props.onArchive}
      onUnarchive={props.onUnarchive}
      onRestore={props.onRestore}
      onBulkDelete={props.onBulkDelete}
      onBulkPermanentDelete={props.onBulkPermanentDelete}
      onBulkRestore={props.onBulkRestore}
      onBulkArchive={props.onBulkArchive}
      onBulkUnarchive={props.onBulkUnarchive}
      onBulkMove={props.onBulkMove}
      onVerifyMasterPassword={props.onVerifyMasterPassword}
      onNotify={props.onNotify}
      onCreateFolder={props.onCreateFolder}
      onRenameFolder={props.onRenameFolder}
      onDeleteFolder={props.onDeleteFolder}
      onBulkDeleteFolders={props.onBulkDeleteFolders}
      onDownloadAttachment={props.onDownloadAttachment}
      downloadingAttachmentKey={props.downloadingAttachmentKey}
      attachmentDownloadPercent={props.attachmentDownloadPercent}
      uploadingAttachmentName={props.uploadingAttachmentName}
      attachmentUploadPercent={props.attachmentUploadPercent}
      mobileSidebarToggleKey={props.mobileSidebarToggleKey}
      defaultCreateType={CONFIG_FILE_CIPHER_TYPE}
      lockedSidebarFilter={{ kind: 'all' }}
      createTypeOptions={[{ type: CONFIG_FILE_CIPHER_TYPE, label: '配置文件' }]}
      hideTypeSection
      defaultFolderId={configFolderId}
    />
  );
}
