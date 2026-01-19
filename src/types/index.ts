export interface GlobalConfig {
  version: number;
  google?: {
    clientId: string;
    clientSecret?: string;
  };
  b2: {
    keyId: string;
    appKey: string;
    endpoint: string;
    bucket: string;
    region: string;
  };
}

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
}

export interface ProjectConfig {
  version: number;
  projectName: string;
  pattern: string;
  ignore: string[];
  lastSync?: string;
}

export type FileKind = "env" | "text";

export interface ManifestSource {
  machineName: string;
  os: string;
  projectPath: string;
}

export interface FileSource extends ManifestSource {
  filePath: string;
}

export interface ProjectManifest {
  version: number;
  projectName: string;
  files: FileEntry[];
  source?: ManifestSource;
}

export interface FileEntry {
  name: string;
  hash: string;
  size: number;
  updatedAt: string;
  source?: FileSource;
}

export interface EncryptedData {
  version: number;
  algorithm: string;
  nonce: string;
  ciphertext: string;
}

export const DEFAULT_B2_CONFIG = {
  endpoint: "s3.us-east-005.backblazeb2.com",
  bucket: "project-settings-sync",
  region: "us-east-005",
} as const;

// ============================================
// Base Snapshot Types (for three-way merge)
// ============================================

/**
 * Stores the "base" state of files after the last successful sync.
 * Used for three-way merge to detect true conflicts vs auto-mergeable changes.
 */
export interface BaseSnapshot {
  version: number;
  files: BaseFileEntry[];
  syncedAt: string;
  remoteManifestHash: string;
}

export interface BaseFileEntry {
  name: string;
  hash: string;
  content: string;
}

// ============================================
// Merge Result Types
// ============================================

export type ConflictType = "divergent_edit" | "edit_vs_delete" | "new_key_collision";

export type AutoMergeAction =
  | "added_from_local"
  | "added_from_remote"
  | "deleted"
  | "updated_from_local"
  | "updated_from_remote";

export interface ConflictEntry {
  key: string;
  conflictType: ConflictType;
  baseValue?: string;
  localValue?: string;
  remoteValue?: string;
}

export interface AutoMergeEntry {
  key: string;
  action: AutoMergeAction;
  value?: string;
}

export interface FileMergeResult {
  fileName: string;
  kind: FileKind;
  status: "clean" | "auto_merged" | "conflicted";
  merged: Map<string, string>;
  mergedContent?: string | null;
  conflicts: ConflictEntry[];
  autoMerged: AutoMergeEntry[];
}

export interface SyncResult {
  files: FileMergeResult[];
  hasConflicts: boolean;
  requiresUserAction: boolean;
}

// ============================================
// Conflict Resolution Types
// ============================================

export type ResolutionChoice = "local" | "remote" | "base" | "manual" | "skip";

export interface ConflictResolution {
  key: string;
  choice: ResolutionChoice;
  manualValue?: string;
}
