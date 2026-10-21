# Shadow Janus Linux CI

`project-settings-sync-shadow-ci` prepares Linux checks and builds for Janus.
Automatic GitHub Actions remains authoritative: its Linux build still requires
the complete Linux/macOS test matrix. Native macOS execution stays on GitHub.
This preparation does not change required checks or authorize publishing.

The protected Janus controller runs `janus-ci bootstrap` and uploads its
image-owned pipeline. This repository's `pipeline.yml` is a review reference.
The intended events are pushes to `main` and same-repository PRs targeting `main`.
Fork PRs keep the existing read-only hosted checks and never enter the trusted
Janus pool.

## Runtime and commands

The hosted workflow requests Bun `latest`, uses plain `bun install`, and has no
Node pin. The package supports Node `>=18`. The reviewed Janus preparation
selects Node `24` (24.22.0) and Bun `1.3.14`; these are explicit shadow runtime
choices. Package metadata and the lockfile are unchanged.

Each fresh job runs `bash scripts/buildkite/check.sh JOB` with `CI=true`:

- `test-linux`: install, typecheck, lint, format check, then the workflow's exact
  `bun test` command.
- `build-linux`: install, then `bun run build`, producing `dist/run.js`.

The wrapper preserves plain `bun install`. It does not run the sync CLI or read
its credentials under `~/.config/pss/`. No repository secrets, storage service,
extra tools or exported artifacts are required. The separate package test suite
is Vitest, checked with `CI=true bun run test --run`.

Both Linux commands retain the 360-minute Actions default. The generated build
step allows 361 minutes to include the bounded 45-second native-proof recheck.
The native block has no command, agent selector or execution timeout. Queue time
therefore consumes no Janus agent and is not shortened to a 20-minute command
wait. Effective provider limits still require live verification.

## Protected native dependency

The current integration is [Devops PR #74](https://github.com/MiraiForge/devops/pull/74),
commit `b3f2c11c76a8676b70433473c4136e1d1db157d7`. Its
[manifest](https://github.com/MiraiForge/devops/blob/b3f2c11c76a8676b70433473c4136e1d1db157d7/infrastructure/buildkite-janus/projects.native-wait.example.json)
and [runbook](https://github.com/MiraiForge/devops/blob/b3f2c11c76a8676b70433473c4136e1d1db157d7/runbooks/buildkite-janus-native-wait.md)
define the inactive commissioning candidate. This repository does not install
or activate that service.

1. `test-linux` runs the Linux validation commands.
2. `native-macos` is a Buildkite block depending on `test-linux`, with
   `blocked_state: running`. A separate verifier performs bounded observations
   and preserves the selected native run/attempt across invocations. It binds
   evidence to the frozen repository, source, tested commit and PR merge parents.
3. `build-linux` depends on both steps. Its protected manifest also sets
   `requiresNativeGate: native-macos`. The root controller requires successful
   Linux tests and independently re-verifies the same-source native evidence
   before any repository command executes.

The block's `janus-native-macos-block-v1` field is untrusted evidence. Manually
unblocking or editing it cannot replace the controller's independent proof.
Missing, failed, canceled, replaced, expired or mismatched native evidence does
not authorize a build. The protected example selects `waitMode: external`,
Node `24`, Bun `1.3.14` and 360-minute Linux command budgets; the generated graph
matches this reference apart from display labels.

Native evidence now has 36-day retention, delivered in
[PR #6](https://github.com/aditzel/project-settings-sync/pull/6). The verifier pins
workflow blob `ddbfee59741a156b3f4abc8eecd582f1650d6ed9` and the source-evidence
producer. Expired evidence is rejected even if a queue or service outage caused
the delay.

## Commissioning and cutover

Keep automatic hosted CI until all of these are verified:

1. Provision the separate repository-scoped Actions-read credential
   `github-project-settings-sync-actions-token`, a pipeline-scoped Buildkite
   verifier credential, and the dedicated service account/private state. These
   credentials stay outside repository processes; checkout authentication is
   separate. Review the immutable runner image, manifest, pipeline and external
   service together. Register only `janus-ci bootstrap` with the provider.
2. Validate the service in dry-run mode against real same-repository PR and main
   builds before enabling its unblock operation. Verify live block/metadata
   contracts, no agent assignment while waiting, a long native queue/execution
   alongside unrelated Linux work, and same-source fresh admission.
3. Prove failed/skipped native jobs, reruns, expiry, cancellation, service outages
   and lost unblock responses cannot authorize the Linux build. Verify provider
   limits, monitoring, and required-status routing. Local passes and fixture
   tests do not establish these live contracts.
4. After commissioning, remove duplicate automatic Actions Linux jobs, retain
   native macOS and hosted fork checks, and change required checks only once
   equivalent results report. That workflow edit also changes its producer blob:
   review a matching verifier pin and collect fresh native evidence. Keep a
   hosted manual rollback.

CI and Junie workflows, active Janus admission and provider configuration remain
unchanged by this preparation.
