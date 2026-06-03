# Engine Distribution — the `engine-stable` release

The Python engine (`riskwise-engine.exe`, built with Nuitka) is **decoupled
from app releases** (issue #529). It ships on its own dedicated, rolling
GitHub release instead of being re-attached and re-signed on every app tag.

Why: the engine changes far less often than the app. Coupling it to app tags
meant every `v*` release re-ran the expensive Nuitka build and pinned the
manifest to exactly that app version — so cutting a patch release without
re-publishing the engine would break the first-launch engine download. The
engine now has a stable home and a fixed download URL; app releases never
touch it.

---

## The shape

| | Before (coupled) | After (decoupled) |
|---|---|---|
| Engine published to | the app tag (`v*`) | the `engine-stable` release |
| Client manifest URL | `releases/latest/download/…` | `releases/download/engine-stable/…` (fixed) |
| `min`/`max_app_version` | pinned to the engine build version | a configurable **range** |
| Nuitka build runs | every app release | only on an `engine-v*` tag (or manual dispatch) |
| App release (`release.yml`) | re-attached + re-signed the engine | does not touch the engine |

## The fixed manifest URL

The client resolves the manifest URL from a single named constant in
[`public/electron.js`](../../public/electron.js):

```js
const ENGINE_RELEASE_TAG = resolveEngineReleaseTag(process.env); // "engine-stable"
const ENGINE_MANIFEST_URL = engineManifestUrl(RELEASE_OWNER, RELEASE_REPO, ENGINE_RELEASE_TAG);
// → https://github.com/CortoMaltese3/riskwise-v2/releases/download/engine-stable/engine-manifest.json
```

The tag (and therefore the URL) is **pinned** — never `releases/latest`, which
would move whenever any app tag is cut. The helpers
(`resolveEngineReleaseTag`, `engineManifestUrl`, `DEFAULT_ENGINE_RELEASE_TAG`)
live in [`public/engineManifest.js`](../../public/engineManifest.js) so they
are unit-tested without an Electron harness — see
[`src/__tests__/engineManifestUrl.test.js`](../../src/__tests__/engineManifestUrl.test.js).

### Overriding the tag for testing

Set `RISKWISE_ENGINE_RELEASE_TAG` in the environment to point a build at an
alternate engine release (e.g. `engine-staging`) without code changes. Blank
or whitespace-only values fall back to `engine-stable`.

## Publishing the engine — the `engine-v*` tag trigger

The dedicated pipeline is
[`.github/workflows/engine-release.yml`](../../.github/workflows/engine-release.yml).
It runs on:

- **`engine-v*` tags** — e.g. `git tag engine-v2.0.0 && git push origin engine-v2.0.0`.
  The engine version embedded in the manifest is the tag with the `engine-`
  prefix stripped (`engine-v2.0.0` → `v2.0.0`).
- **`workflow_dispatch`** — manual runs accept optional `engine_version`,
  `min_app_version`, and `max_app_version` inputs.

The workflow:

1. Builds the engine with Nuitka (`scripts/build_engine.ps1`, same
   Azure-guarded signing path as before — unchanged).
2. Creates the `engine-stable` release if it does not yet exist, then uploads
   `riskwise-engine.exe` to it with `--clobber`. The release is published with
   `--latest=false` — it must **never** become the repo's "latest" release, or
   it would hijack the app's electron-updater feed and the v2.0.0 demo's
   `releases/latest/download` path.
3. Generates `engine-manifest.json` whose `download_url` points at the fixed
   `engine-stable` release, with `min_app_version` / `max_app_version` taken
   from the dispatch inputs or the documented defaults below.
4. Signs the manifest with minisign (`scripts/sign_manifest.ps1`, unchanged)
   using the `ENGINE_MANIFEST_KEY` secret, and uploads the signed manifest to
   `engine-stable`.

### Compatibility range defaults

`min_app_version` / `max_app_version` express a **range**, not a single pinned
version. The workflow defaults are:

| Input | Default | Meaning |
|---|---|---|
| `min_app_version` | `2.0.0` | Oldest app version that may run this engine. |
| `max_app_version` | `99.0.0` | Effectively open-ended; widen/narrow deliberately when a future app version needs a different engine. |

The client gates on this range via `isEngineVersionCompatible` — unchanged by
this work.

## Client trust model — unchanged

This change only retargets where the engine and manifest are published. It does
**not** touch the trust model:

- `verifyEngineManifest` (in `public/engineManifest.js`) verifies the minisign
  signature against the bundled `resources/engine-manifest.pub` **before** the
  `sha256` or `download_url` are trusted.
- The downloaded binary's SHA-256 must match the verified manifest.
- `isEngineVersionCompatible` gates the engine against the app version range.

## One-time secret / key setup

Signing reuses the existing minisign machinery (see
[`signing.md`](signing.md)). The maintainer must ensure:

- `secrets.ENGINE_MANIFEST_KEY` (base64 of the minisign private key) and
  `secrets.ENGINE_MANIFEST_KEY_PASSWORD` are set in the
  `CortoMaltese3/riskwise-v2` repo. The key's **public** half must match the
  bundled `resources/engine-manifest.pub` (demo key `643EA13D1F970857`). A
  different, non-matching key exists in some dev environments — do not use it.
  If the matching key is lost, **rotate**: new keypair → replace
  `resources/engine-manifest.pub` → rebuild and reship the app (the bundled
  pub key must match the signer).
- The `engine-stable` release exists with a good engine + signed manifest.
  The first `engine-v*` run creates it automatically.

## Compatibility with already-installed apps

The v2.0.0 demo shipped the engine on the app release and read the manifest via
`releases/latest/download`. Those installs keep working — this change is
forward-looking for future app builds, which read from the fixed
`engine-stable` URL.

## Not in scope

- Moving the engine to a **separate repository** for cross-project reuse.
- Azure Trusted Signing of the engine **binary** (the `AZURE_*`-guarded path
  in `build_engine.ps1` stays as-is).
