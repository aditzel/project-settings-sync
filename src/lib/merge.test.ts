import { describe, it, expect } from "vitest";
import {
  threeWayMergeEnvFile,
  applyResolutions,
  resolveAllConflicts,
  getAutoMergeSummary,
} from "./merge.ts";

describe("threeWayMergeEnvFile", () => {
  describe("auto-mergeable scenarios", () => {
    it("should handle disjoint additions (no base)", () => {
      const base = null;
      const local = new Map([["KEY1", "value1"]]);
      const remote = new Map([["KEY2", "value2"]]);

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("auto_merged");
      expect(result.conflicts).toHaveLength(0);
      expect(result.merged.get("KEY1")).toBe("value1");
      expect(result.merged.get("KEY2")).toBe("value2");
      expect(result.autoMerged).toHaveLength(2);
    });

    it("should handle same change (no base)", () => {
      const base = null;
      const local = new Map([["KEY", "sameValue"]]);
      const remote = new Map([["KEY", "sameValue"]]);

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("clean");
      expect(result.conflicts).toHaveLength(0);
      expect(result.merged.get("KEY")).toBe("sameValue");
    });

    it("should handle same deletion", () => {
      const base = new Map([["KEY", "value"]]);
      const local = new Map();
      const remote = new Map();

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("auto_merged");
      expect(result.conflicts).toHaveLength(0);
      expect(result.merged.has("KEY")).toBe(false);
    });

    it("should use local when only local changed", () => {
      const base = new Map([["KEY", "original"]]);
      const local = new Map([["KEY", "localChange"]]);
      const remote = new Map([["KEY", "original"]]);

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("auto_merged");
      expect(result.conflicts).toHaveLength(0);
      expect(result.merged.get("KEY")).toBe("localChange");
    });

    it("should use remote when only remote changed", () => {
      const base = new Map([["KEY", "original"]]);
      const local = new Map([["KEY", "original"]]);
      const remote = new Map([["KEY", "remoteChange"]]);

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("auto_merged");
      expect(result.conflicts).toHaveLength(0);
      expect(result.merged.get("KEY")).toBe("remoteChange");
    });

    it("should handle both changed to same value", () => {
      const base = new Map([["KEY", "original"]]);
      const local = new Map([["KEY", "newValue"]]);
      const remote = new Map([["KEY", "newValue"]]);

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("clean");
      expect(result.conflicts).toHaveLength(0);
      expect(result.merged.get("KEY")).toBe("newValue");
    });

    it("should handle local deletion when remote unchanged", () => {
      const base = new Map([["KEY", "value"]]);
      const local = new Map();
      const remote = new Map([["KEY", "value"]]);

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("auto_merged");
      expect(result.conflicts).toHaveLength(0);
      expect(result.merged.has("KEY")).toBe(false);
    });

    it("should handle remote deletion when local unchanged", () => {
      const base = new Map([["KEY", "value"]]);
      const local = new Map([["KEY", "value"]]);
      const remote = new Map();

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("auto_merged");
      expect(result.conflicts).toHaveLength(0);
      expect(result.merged.has("KEY")).toBe(false);
    });
  });

  describe("conflict scenarios", () => {
    it("should detect divergent edit conflict", () => {
      const base = new Map([["KEY", "original"]]);
      const local = new Map([["KEY", "localValue"]]);
      const remote = new Map([["KEY", "remoteValue"]]);

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("conflicted");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].key).toBe("KEY");
      expect(result.conflicts[0].conflictType).toBe("divergent_edit");
      expect(result.conflicts[0].baseValue).toBe("original");
      expect(result.conflicts[0].localValue).toBe("localValue");
      expect(result.conflicts[0].remoteValue).toBe("remoteValue");
    });

    it("should detect edit vs delete conflict (local deleted)", () => {
      const base = new Map([["KEY", "original"]]);
      const local = new Map();
      const remote = new Map([["KEY", "remoteChange"]]);

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("conflicted");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].key).toBe("KEY");
      expect(result.conflicts[0].conflictType).toBe("edit_vs_delete");
      expect(result.conflicts[0].localValue).toBeUndefined();
      expect(result.conflicts[0].remoteValue).toBe("remoteChange");
    });

    it("should detect edit vs delete conflict (remote deleted)", () => {
      const base = new Map([["KEY", "original"]]);
      const local = new Map([["KEY", "localChange"]]);
      const remote = new Map();

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("conflicted");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].key).toBe("KEY");
      expect(result.conflicts[0].conflictType).toBe("edit_vs_delete");
      expect(result.conflicts[0].localValue).toBe("localChange");
      expect(result.conflicts[0].remoteValue).toBeUndefined();
    });

    it("should detect new key collision (no base)", () => {
      const base = null;
      const local = new Map([["NEW_KEY", "localValue"]]);
      const remote = new Map([["NEW_KEY", "remoteValue"]]);

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("conflicted");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].key).toBe("NEW_KEY");
      expect(result.conflicts[0].conflictType).toBe("new_key_collision");
    });
  });

  describe("complex scenarios", () => {
    it("should handle multiple keys with mixed outcomes", () => {
      const base = new Map([
        ["UNCHANGED", "same"],
        ["LOCAL_CHANGE", "original"],
        ["REMOTE_CHANGE", "original"],
        ["CONFLICT", "original"],
        ["DELETED", "toDelete"],
      ]);
      const local = new Map([
        ["UNCHANGED", "same"],
        ["LOCAL_CHANGE", "newLocal"],
        ["REMOTE_CHANGE", "original"],
        ["CONFLICT", "localConflict"],
        ["NEW_LOCAL", "addedLocal"],
      ]);
      const remote = new Map([
        ["UNCHANGED", "same"],
        ["LOCAL_CHANGE", "original"],
        ["REMOTE_CHANGE", "newRemote"],
        ["CONFLICT", "remoteConflict"],
        ["NEW_REMOTE", "addedRemote"],
      ]);

      const result = threeWayMergeEnvFile("test.env", base, local, remote);

      expect(result.status).toBe("conflicted");
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].key).toBe("CONFLICT");

      expect(result.merged.get("UNCHANGED")).toBe("same");
      expect(result.merged.get("LOCAL_CHANGE")).toBe("newLocal");
      expect(result.merged.get("REMOTE_CHANGE")).toBe("newRemote");
      expect(result.merged.get("NEW_LOCAL")).toBe("addedLocal");
      expect(result.merged.get("NEW_REMOTE")).toBe("addedRemote");
      expect(result.merged.has("DELETED")).toBe(false);
    });
  });
});

describe("applyResolutions", () => {
  it("should apply local resolution", () => {
    const mergeResult = threeWayMergeEnvFile(
      "test.env",
      new Map([["KEY", "base"]]),
      new Map([["KEY", "local"]]),
      new Map([["KEY", "remote"]])
    );

    const resolved = applyResolutions(mergeResult, [
      { key: "KEY", choice: "local" },
    ]);

    expect(resolved.get("KEY")).toBe("local");
  });

  it("should apply remote resolution", () => {
    const mergeResult = threeWayMergeEnvFile(
      "test.env",
      new Map([["KEY", "base"]]),
      new Map([["KEY", "local"]]),
      new Map([["KEY", "remote"]])
    );

    const resolved = applyResolutions(mergeResult, [
      { key: "KEY", choice: "remote" },
    ]);

    expect(resolved.get("KEY")).toBe("remote");
  });

  it("should apply base resolution", () => {
    const mergeResult = threeWayMergeEnvFile(
      "test.env",
      new Map([["KEY", "base"]]),
      new Map([["KEY", "local"]]),
      new Map([["KEY", "remote"]])
    );

    const resolved = applyResolutions(mergeResult, [
      { key: "KEY", choice: "base" },
    ]);

    expect(resolved.get("KEY")).toBe("base");
  });

  it("should apply manual resolution", () => {
    const mergeResult = threeWayMergeEnvFile(
      "test.env",
      new Map([["KEY", "base"]]),
      new Map([["KEY", "local"]]),
      new Map([["KEY", "remote"]])
    );

    const resolved = applyResolutions(mergeResult, [
      { key: "KEY", choice: "manual", manualValue: "custom" },
    ]);

    expect(resolved.get("KEY")).toBe("custom");
  });

  it("should handle deletion via resolution", () => {
    const mergeResult = threeWayMergeEnvFile(
      "test.env",
      new Map([["KEY", "base"]]),
      new Map(), // local deleted
      new Map([["KEY", "remote"]])
    );

    const resolved = applyResolutions(mergeResult, [
      { key: "KEY", choice: "local" }, // choose deletion
    ]);

    expect(resolved.has("KEY")).toBe(false);
  });
});

describe("resolveAllConflicts", () => {
  it("should resolve all conflicts with local strategy", () => {
    const mergeResult = threeWayMergeEnvFile(
      "test.env",
      new Map([
        ["KEY1", "base1"],
        ["KEY2", "base2"],
      ]),
      new Map([
        ["KEY1", "local1"],
        ["KEY2", "local2"],
      ]),
      new Map([
        ["KEY1", "remote1"],
        ["KEY2", "remote2"],
      ])
    );

    const resolutions = resolveAllConflicts(mergeResult, "local");
    const resolved = applyResolutions(mergeResult, resolutions);

    expect(resolved.get("KEY1")).toBe("local1");
    expect(resolved.get("KEY2")).toBe("local2");
  });

  it("should resolve all conflicts with remote strategy", () => {
    const mergeResult = threeWayMergeEnvFile(
      "test.env",
      new Map([
        ["KEY1", "base1"],
        ["KEY2", "base2"],
      ]),
      new Map([
        ["KEY1", "local1"],
        ["KEY2", "local2"],
      ]),
      new Map([
        ["KEY1", "remote1"],
        ["KEY2", "remote2"],
      ])
    );

    const resolutions = resolveAllConflicts(mergeResult, "remote");
    const resolved = applyResolutions(mergeResult, resolutions);

    expect(resolved.get("KEY1")).toBe("remote1");
    expect(resolved.get("KEY2")).toBe("remote2");
  });
});

describe("getAutoMergeSummary", () => {
  it("should generate summary for auto-merged changes", () => {
    const base = new Map([
      ["UPDATED", "old"],
      ["DELETED", "toDelete"],
    ]);
    const local = new Map([
      ["UPDATED", "new"],
      ["ADDED", "newKey"],
    ]);
    const remote = new Map([
      ["UPDATED", "old"],
      ["DELETED", "toDelete"],
    ]);

    const result = threeWayMergeEnvFile("test.env", base, local, remote);
    const summary = getAutoMergeSummary(result);

    expect(summary).toContain("+ ADDED (from local)");
    expect(summary).toContain("- DELETED (deleted)");
    expect(summary).toContain("~ UPDATED (updated from local)");
  });
});
