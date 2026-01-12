import type {
  FileMergeResult,
  ConflictEntry,
  AutoMergeEntry,
  ConflictType,
  AutoMergeAction,
  ConflictResolution,
  SyncResult,
} from "../types/index.ts";

/**
 * Result of merging a single key
 */
type KeyMergeResult =
  | { type: "unchanged"; value?: string }
  | { type: "auto_merged"; action: AutoMergeAction; value?: string }
  | { type: "conflict"; conflictType: ConflictType };

/**
 * Merge a single key using three-way merge logic.
 *
 * Decision table:
 * | Base | Local | Remote | Result |
 * |------|-------|--------|--------|
 * | - | A | A | unchanged (both same) |
 * | - | A | B | conflict (new_key_collision) |
 * | - | A | - | auto-merge from local |
 * | - | - | A | auto-merge from remote |
 * | A | A | A | unchanged |
 * | A | B | A | use local (only local changed) |
 * | A | A | B | use remote (only remote changed) |
 * | A | B | B | unchanged (both changed to same) |
 * | A | B | C | conflict (divergent_edit) |
 * | A | - | A | deleted by local |
 * | A | A | - | deleted by remote |
 * | A | - | - | deleted by both |
 * | A | - | B | conflict (edit_vs_delete - local deleted) |
 * | A | B | - | conflict (edit_vs_delete - remote deleted) |
 */
function mergeKey(
  key: string,
  baseVal: string | undefined,
  localVal: string | undefined,
  remoteVal: string | undefined
): KeyMergeResult {
  const localExists = localVal !== undefined;
  const remoteExists = remoteVal !== undefined;
  const baseExists = baseVal !== undefined;

  // Case 1: No base (first sync or new key scenarios)
  if (!baseExists) {
    if (localExists && remoteExists) {
      if (localVal === remoteVal) {
        // Both added same value - no conflict
        return { type: "unchanged", value: localVal };
      }
      // Both added different values - conflict
      return { type: "conflict", conflictType: "new_key_collision" };
    }
    if (localExists && !remoteExists) {
      // Only local has it - auto-merge from local
      return { type: "auto_merged", action: "added_from_local", value: localVal };
    }
    if (!localExists && remoteExists) {
      // Only remote has it - auto-merge from remote
      return { type: "auto_merged", action: "added_from_remote", value: remoteVal };
    }
    // Neither has it (shouldn't happen since we iterate over all keys)
    return { type: "unchanged" };
  }

  // Case 2: Have base - standard three-way merge
  const localChanged = localVal !== baseVal;
  const remoteChanged = remoteVal !== baseVal;
  const localDeleted = !localExists;
  const remoteDeleted = !remoteExists;

  // Neither changed from base
  if (!localChanged && !remoteChanged && !localDeleted && !remoteDeleted) {
    return { type: "unchanged", value: baseVal };
  }

  // Both deleted
  if (localDeleted && remoteDeleted) {
    return { type: "auto_merged", action: "deleted", value: undefined };
  }

  // Only local deleted, remote unchanged
  if (localDeleted && !remoteChanged) {
    return { type: "auto_merged", action: "deleted", value: undefined };
  }

  // Only remote deleted, local unchanged
  if (remoteDeleted && !localChanged) {
    return { type: "auto_merged", action: "deleted", value: undefined };
  }

  // Local deleted but remote edited - CONFLICT
  if (localDeleted && remoteChanged) {
    return { type: "conflict", conflictType: "edit_vs_delete" };
  }

  // Remote deleted but local edited - CONFLICT
  if (remoteDeleted && localChanged) {
    return { type: "conflict", conflictType: "edit_vs_delete" };
  }

  // Only local changed (including edits)
  if (localChanged && !remoteChanged) {
    return { type: "auto_merged", action: "updated_from_local", value: localVal };
  }

  // Only remote changed (including edits)
  if (!localChanged && remoteChanged) {
    return { type: "auto_merged", action: "updated_from_remote", value: remoteVal };
  }

  // Both changed - check if they're the same
  if (localVal === remoteVal) {
    // Both changed to same value - no conflict
    return { type: "unchanged", value: localVal };
  }

  // Both changed to different values - CONFLICT
  return { type: "conflict", conflictType: "divergent_edit" };
}

/**
 * Perform a three-way merge of env file contents.
 *
 * @param base - The base version (last synced state), or null if first sync
 * @param local - The local version
 * @param remote - The remote version
 * @returns FileMergeResult with merged content and any conflicts
 */
export function threeWayMergeEnvFile(
  fileName: string,
  base: Map<string, string> | null,
  local: Map<string, string>,
  remote: Map<string, string>
): FileMergeResult {
  const merged = new Map<string, string>();
  const conflicts: ConflictEntry[] = [];
  const autoMerged: AutoMergeEntry[] = [];

  // Collect all keys from all three versions
  const allKeys = new Set([...(base?.keys() ?? []), ...local.keys(), ...remote.keys()]);

  for (const key of allKeys) {
    const baseVal = base?.get(key);
    const localVal = local.get(key);
    const remoteVal = remote.get(key);

    const result = mergeKey(key, baseVal, localVal, remoteVal);

    if (result.type === "conflict") {
      conflicts.push({
        key,
        conflictType: result.conflictType,
        baseValue: baseVal,
        localValue: localVal,
        remoteValue: remoteVal,
      });
      // For conflicts, we temporarily keep the local value in merged
      // until user resolves it
      if (localVal !== undefined) {
        merged.set(key, localVal);
      }
    } else if (result.type === "auto_merged") {
      if (result.value !== undefined) {
        merged.set(key, result.value);
      }
      // Value is undefined means it was deleted
      autoMerged.push({
        key,
        action: result.action,
        value: result.value,
      });
    } else if (result.type === "unchanged") {
      if (result.value !== undefined) {
        merged.set(key, result.value);
      }
    }
  }

  return {
    fileName,
    status: conflicts.length > 0 ? "conflicted" : autoMerged.length > 0 ? "auto_merged" : "clean",
    merged,
    conflicts,
    autoMerged,
  };
}

/**
 * Apply conflict resolutions to a merge result.
 * Returns the final merged content with all conflicts resolved.
 */
export function applyResolutions(
  mergeResult: FileMergeResult,
  resolutions: ConflictResolution[]
): Map<string, string> {
  const result = new Map(mergeResult.merged);

  for (const resolution of resolutions) {
    const conflict = mergeResult.conflicts.find((c) => c.key === resolution.key);
    if (!conflict) continue;

    switch (resolution.choice) {
      case "local":
        if (conflict.localValue !== undefined) {
          result.set(resolution.key, conflict.localValue);
        } else {
          result.delete(resolution.key);
        }
        break;
      case "remote":
        if (conflict.remoteValue !== undefined) {
          result.set(resolution.key, conflict.remoteValue);
        } else {
          result.delete(resolution.key);
        }
        break;
      case "base":
        if (conflict.baseValue !== undefined) {
          result.set(resolution.key, conflict.baseValue);
        } else {
          result.delete(resolution.key);
        }
        break;
      case "manual":
        if (resolution.manualValue !== undefined) {
          result.set(resolution.key, resolution.manualValue);
        } else {
          result.delete(resolution.key);
        }
        break;
      case "skip":
        // Keep whatever was in merged (local by default)
        break;
    }
  }

  return result;
}

/**
 * Check if all conflicts in a merge result have been resolved.
 */
export function allConflictsResolved(
  mergeResult: FileMergeResult,
  resolutions: ConflictResolution[]
): boolean {
  const resolvedKeys = new Set(resolutions.map((r) => r.key));
  return mergeResult.conflicts.every(
    (conflict) =>
      resolvedKeys.has(conflict.key) &&
      resolutions.find((r) => r.key === conflict.key)?.choice !== "skip"
  );
}

/**
 * Generate a summary of what was auto-merged.
 */
export function getAutoMergeSummary(mergeResult: FileMergeResult): string[] {
  const lines: string[] = [];

  for (const entry of mergeResult.autoMerged) {
    switch (entry.action) {
      case "added_from_local":
        lines.push(`+ ${entry.key} (from local)`);
        break;
      case "added_from_remote":
        lines.push(`+ ${entry.key} (from remote)`);
        break;
      case "deleted":
        lines.push(`- ${entry.key} (deleted)`);
        break;
      case "updated_from_local":
        lines.push(`~ ${entry.key} (updated from local)`);
        break;
      case "updated_from_remote":
        lines.push(`~ ${entry.key} (updated from remote)`);
        break;
    }
  }

  return lines;
}

/**
 * Create a SyncResult from multiple file merge results.
 */
export function createSyncResult(fileMergeResults: FileMergeResult[]): SyncResult {
  const hasConflicts = fileMergeResults.some((r) => r.conflicts.length > 0);
  const requiresUserAction = hasConflicts;

  return {
    files: fileMergeResults,
    hasConflicts,
    requiresUserAction,
  };
}

/**
 * Resolve all conflicts using a single strategy (for --ours/--theirs flags).
 */
export function resolveAllConflicts(
  mergeResult: FileMergeResult,
  strategy: "local" | "remote"
): ConflictResolution[] {
  return mergeResult.conflicts.map((conflict) => ({
    key: conflict.key,
    choice: strategy === "local" ? "local" : "remote",
  }));
}
