# Understanding CI checks

Pull requests into `main` run the hosted Linux and macOS test jobs. The hosted
build waits for both test jobs. Keep these checks enabled while verifying the
protected Janus pipeline.

The `project-settings-sync-shadow-ci` pipeline has a separate dependency chain:

1. `test-linux` runs type checking, lint, formatting checks and tests on Janus.
2. `native-macos` waits for successful hosted macOS tests for the same source and
   tested commit, using the current workflow attempt.
3. `build-linux` starts only after both preceding gates pass.

A waiting native gate does not mean the Linux runner is stuck. Check the macOS job
and its attempt first. The uploaded `source.json` identifies the checkout; the
artifact alone does not establish that the macOS tests passed. The protected
consumer verifies the artifact and completed job before admitting the build.

If macOS fails, fix the reported check. If a rerun is needed, rerun all hosted jobs
so the new attempt includes fresh macOS evidence. Reusing an artifact from an
earlier attempt or manually bypassing the native gate does not establish the
required Linux/macOS result. See [native source evidence](ci-native-source.md)
for the full identity and artifact contract.

Before opening a PR, run the repository checks locally:

```sh
bun run test --run
bun run lint
bun run typecheck
bun run format:check
```

These local results help diagnose failures. Passing hosted checks and a completed
Janus pipeline remain separate CI results; source publication alone establishes
neither one.
