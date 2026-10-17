# Shadow Janus Linux CI

`project-settings-sync-shadow-ci` duplicates the Linux checks and build for
validation. The automatic GitHub Actions workflow remains unchanged and
authoritative: its Linux build waits for the complete Linux/macOS test matrix.
Native macOS execution must remain in Actions. Do not replace required checks or
use shadow build results to authorize publishing.

The protected Janus controller uses `janus-ci bootstrap` and its image-owned
manifest. This repository's `pipeline.yml` is a reference, not trusted policy.
The prepared pipeline targets the `janus-linux` queue for pushes to `main` and
same-repository pull requests targeting `main`. Fork PRs stay on the unchanged
read-only hosted Actions workflow and must never enter the trusted Janus pool.

## Runtime and commands

The original workflow requests Bun `latest`, uses plain `bun install`, and has no
Node pin. The package supports Node `>=18`. This shadow implementation explicitly
selects the reviewed image's Node `22` alias (22.23.3) and Bun 1.3.14; this is a
shadow runtime choice, not an existing repository pin. It preserves plain
`bun install` and does not update package metadata or the lockfile.

Each fresh job runs `bash scripts/buildkite/check.sh JOB` with `CI=true`:

- `test-linux`: install, typecheck, lint, format check, then the workflow's exact
  `bun test` command.
- `build-linux`: install, then `bun run build`, producing `dist/run.js`.

Both Linux commands retain the 360-minute Actions default; the original workflow
has no explicit timeout. The generated build step allows 361 minutes so its
bounded 45-second native-result recheck does not consume the command budget.
The native control gate has a separate 20-minute provider-wait budget.

The repository commands need no credentials, storage configuration, service
containers, extra tools, or exported artifacts. The existing tests use in-memory
merge fixtures. The commands do not execute the sync CLI or access its local
credentials under `~/.config/pss/`. The separate package test command is Vitest and
can be checked with `CI=true bun run test --run`.

## Protected native dependency

The [merged controller implementation](https://github.com/MiraiForge/devops/pull/13)
provides the `project-settings-sync-macos-v1` policy. Its
[runbook](https://github.com/MiraiForge/devops/blob/a22e55c12b0159e45ac6f977d78d6c6480ca834d/runbooks/buildkite-janus-native-macos.md)
and inactive manifest example define the commissioning contract. This repository
does not implement or enable that policy.

The reference pipeline has three steps:

1. `test-linux` runs the original Linux validation commands.
2. `native-macos` waits for `test-linux`, then verifies the hosted macOS result.
   This is a protected controller command, not a repository script or macOS
   execution on Linux. The controller pins the GitHub workflow and source-evidence
   producer blobs and binds the run attempt, job and artifact to the frozen
   repository, source, tested commit and PR base/merge parents.
3. `build-linux` depends on both steps. Its protected manifest must also set
   `requiresNativeGate: native-macos`; before admitting repository commands, the
   controller validates the protected receipt and rechecks provider freshness.
   Dependency declarations alone are insufficient.

The protected manifest must select Node `22`, Bun `1.3.14`, and 360-minute command
timeouts for both Linux jobs to match this preparation. The inactive example's
Node `24` and 30-minute command budgets are examples, not this repository's
configuration. Its `native-macos` policy and dependency fields must be retained.
The generated pipeline must match this reference apart from display labels.

The controller requires the separate repository-scoped Actions-read secret
`github-project-settings-sync-actions-token`. It stays outside repository
processes and is distinct from checkout authentication. The native gate accepts
only current successful evidence; missing, failed, canceled, superseded, expired
or mismatched results block the build.

## Required cutover design

The protected capability and native evidence producer are merged, but this shadow
pipeline has not been commissioned. Removing automatic Actions Linux jobs remains
blocked until the complete cross-provider path is verified:

1. Keep an automatic native macOS Actions test job with the existing validation
   stages. Bind its checkout and result to the same frozen source/tested commit
   as Janus. For PRs, also bind the base SHA and exact merge parents; matching only
   a branch name or PR head is insufficient.
2. Provision the scoped Actions-read credential and review the opt-in protected
   manifest, immutable image and generated pipeline together. Register the
   provider pipeline with `janus-ci bootstrap`, not repository pipeline upload.
3. Verify live PR and main builds, plus failed/skipped native jobs, newer attempts,
   expiry, cancellation and build blocking. Check the 20-minute control deadline
   against slow native runs; it is a new orchestration deadline, not the original
   macOS job's timeout. Local Linux passes and fixture tests cannot prove this.
4. After successful commissioning, remove the duplicate automatic Actions Linux
   matrix entry and Linux build, retain macOS and hosted fork checks, and update
   required checks only after equivalent results report. That workflow edit also
   requires a reviewed producer-pin update in the controller and renewed live
   evidence. Keep an explicit rollback path.

This preparation changes neither provider configuration nor the CI and Junie
Actions workflows. It does not activate the native gate or authorize publishing.
