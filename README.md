# DSH Codex Bridge

Run a batch of DeepSeek Harness tasks on the same Windows computer as Codex and receive the answers with DSH session IDs. The Codex plugin supplies the batch workflow. The DSH Cordis plugin owns the authenticated loopback listener and runs tasks through the installed DSH headless CLI.

## Install

Requires Windows, Node.js 22 or newer, and DeepSeek Harness 0.2.0-rc.2. The default CLI path is the one bundled with DSH NEXT under Program Files.

1. Add the DSH package to a web-derived profile. For a dedicated profile, first run `dsh --profile codex-bridge --from-default-profile web --help`.
2. Run `dsh plugin --profile codex-bridge add github:Making-acid/dsh-codex-bridge#v0.1.0`.
3. Start the profile with `dsh --profile codex-bridge --host 127.0.0.1 --port 0 --no-open`. Keep the profile running while submitting batches. Run only one bridge worker.
4. Run `codex plugin marketplace add Making-acid/dsh-codex-bridge --ref v0.1.0` and `codex plugin add dsh-batch@dsh-bridge`. Reopen the client to load the skill and ask Codex to run a batch through DSH.

If dsh is not on PATH, invoke the bundled CLI via Node.js at `C:\Program Files\DSH NEXT\resources\app\node_modules\@deepseek-ai\dsh\lib\bin.js`.

## Configure

An optional startup patch sets the worker's workspace and selects the headless model route. Credentials are resolved by DSH. Use the headless profile's normal credentials setup.

```yaml
- id: dsh-codex-bridge
  config:
    workspace: 'C:\path\to\workspace'
    modelPatch: 'C:\path\to\your-model-route.yml'
```

Pass the file with `--patch` when starting the profile. The workspace defaults to the bridge workspace under LocalAppData. Advanced settings `cliPath` and `nodePath` accept absolute paths.

## Local protocol

The bridge listens on 127.0.0.1 port 43771. It creates a random client key under the current Windows user's LocalAppData and records accepted batches in audit.jsonl in that same directory. The audit source identifies possession of the shared client key. Programs running under the same Windows account with access to the key can submit tasks. DSH runs tasks with the permissions of its headless profile.

The client takes a JSON file containing a tasks array. Each batch accepts one to eight prompts and runs up to two tasks at once. A task has a 120-second timeout. Responses preserve input order. Batches and results are held in memory. If the client disconnects, accepted tasks may continue until completion or timeout.
