# ADR — Auto-Update UX and Release Channel Design (Spike, Phase 0)

**Status:** Accepted (design only — no code shipped in this spike)
**Date:** 2026-04-18
**Issue:** #8
**Depends on:** #7 (code-signing spike), DECISIONS.md D07, D09, D17
**Informs:** Phase 1 `src/components/UpdateDialog.jsx`, `src/components/Settings/UpdatesPanel.jsx`, `.github/workflows/release.yml`
**Related architecture:** ARCHITECTURE.md § Area 13 (Auto-Update), § Area 14 (Offline Mode), § Area 15 (Signing)

---

## 1. Scope

This ADR finalises three pieces of Area 13 design so Phase 1 can implement without re-litigating:

1. Release channel naming and tag conventions.
2. `engine-manifest.json` schema (see [engine-manifest-schema.json](engine-manifest-schema.json)).
3. User-facing consent UX for app and engine updates, including behaviour under offline mode.

No production code is added. The output is this document plus the JSON Schema file next to it.

---

## 2. Release Channels

### 2.1 Channels

| Channel | Audience | Tag format | GitHub Release flags | electron-updater feed |
|---|---|---|---|---|
| `stable` | All end users (default) | `v2.0.1` | published, not prerelease, `latest` | `provider: github`, channel unset (defaults to `latest`) |
| `beta` | Opt-in testers (pilot ministries, QA) | `v2.0.1-beta.1` | published, prerelease | `provider: github`, `channel: beta` |
| `internal` | GIZ / maintainer dry runs | `v2.0.1-internal.1` | published, prerelease, draft allowed | `provider: github`, `channel: internal` |

Rules:

- **SemVer with dotted suffix.** `v<MAJOR>.<MINOR>.<PATCH>` for stable; `-beta.N` or `-internal.N` appended for pre-releases. `N` starts at `1` and increments per rebuild against the same base version.
- **One channel per release.** A given tag belongs to exactly one channel; promoting beta → stable means cutting a new stable tag from the same commit, not re-tagging.
- **Engine tags are separate.** App tags (`v2.0.1`) and engine tags (`engine-v2.0.1`) live in the same repo but in disjoint namespaces. Their versions are decoupled; compatibility is expressed through `min_app_version` / `max_app_version` in the manifest.
- **`allowDowngrade` stays off.** Downgrades go through the explicit Settings action (§4.4), never through channel switching.
- **`allowPrerelease` is derived from the channel subscription**, not a global flag. A user on `stable` never receives `-beta.N` even if they happen to have a newer internal tag cached.

### 2.2 Channel subscription

The channel lives in user settings (`store.js` → `settings.updateChannel`, default `"stable"`). Changing it:

- Writes the new value, sets electron-updater's feed channel, triggers an immediate check.
- Does **not** auto-downgrade if the currently installed build is on a higher channel (the installed version simply shows as "ahead of channel"; user can choose to reinstall from the channel's latest).

### 2.3 Release-please mapping

D08 adopts `release-please`. The channel the PR/commit lands on is derived from the branch:

- `main` → `stable` (release-please creates `v2.0.1` release PRs).
- `beta` → `beta` (release-please configured with `prerelease: true`, suffix `beta`).
- `internal` → `internal` (same, suffix `internal`).

Engine releases are cut manually by the maintainer against `engine-*` tags until a release-please config for the engine artifact is added in a later phase.

---

## 3. Engine Manifest

The schema is canonical in [engine-manifest-schema.json](engine-manifest-schema.json). Highlights, with rationale for anything beyond the bare four fields in the issue:

| Field | Required | Why |
|---|---|---|
| `schema_version` | yes | Lets older clients reject future layout changes instead of misparsing. |
| `channel` | yes | Defence-in-depth: a client on `stable` rejects a manifest that declares itself `beta` even if served from the wrong URL. |
| `version` | yes | Engine SemVer, independent of app version. |
| `released_at` | yes | Display-only; trust comes from the signature. |
| `sha256` | yes | Integrity check after download. |
| `size_bytes` | yes | Drives progress bar and pre-allocates disk. |
| `download_url` | yes | HTTPS; must support Range (corporate TLS-inspection proxies corrupt large downloads — resume from byte offset 0 on hash failure, per Area 13). |
| `min_app_version` | yes | Floor compatibility. Older apps refuse the engine and prompt to update the app first. |
| `max_app_version` | optional | Inverse binding per Area 13. Absent means no upper bound; present means a newer app that needs features beyond this engine refuses to use the cache and re-downloads. |
| `notes_url` | optional | Link to engine release notes, rendered inside the What's New dialog under the app notes. |

### 3.1 Signing

Per Area 13, the manifest is signed **with an offline key**, distinct from the Authenticode cert used for installers (D07, D17). The decision:

- **Tool:** `minisign` (Ed25519). Small dependency, single binary, trivial Node wrapper. Age is rejected for this use case because age targets encryption-at-rest, not detached signatures.
- **Layout:** `engine-manifest.json` + `engine-manifest.json.minisig` published side-by-side as GitHub Release assets.
- **Public key distribution:** bundled in the app at `resources/app/keys/engine-manifest.pub`. Never fetched at runtime. Key rotation ships in an app update, not an engine update, so a compromised release account cannot rotate to an attacker-controlled key.
- **Verification order (client-side, in `public/electron.js` engine update path):**
  1. Fetch `engine-manifest.json` and `.minisig`.
  2. Verify signature against the bundled public key. **Fail closed**: any verification error aborts the check and surfaces as "Engine update check failed — signature invalid." No hash is trusted from an unverified manifest.
  3. Validate JSON against the schema; reject unknown `schema_version`.
  4. Check `channel`, `min_app_version`, `max_app_version` against the running app.
  5. Only then download; verify `sha256` of the downloaded archive before extraction.

### 3.2 Resumable download

HTTP `Range` resume is required (ARCHITECTURE.md Area 13). On hash mismatch after download, delete the partial and retry from byte 0; do **not** resume a corrupted byte range, because the corruption point is unknown.

---

## 4. Consent Dialog UX

Two surfaces exist in Phase 1:

- **`UpdateDialog.jsx`** — modal prompts triggered by the updater lifecycle.
- **`Settings → UpdatesPanel.jsx`** — manual controls and channel selection.

### 4.1 Check cadence

| Trigger | Behaviour |
|---|---|
| App startup | One silent check 30 s after the main window is ready, provided offline mode is off and the user has not opted out. |
| Every 4 h while running | Silent background check. No toast unless an update is found. |
| Manual "Check for updates" in Settings | Always runs, bypasses the opt-out flag but still honours offline mode (disabled button + tooltip). |

"Silent check" means no UI until an update is actually found. Cadence and the 30 s startup delay live in a single `UPDATE_POLICY` constant in `public/electron.js` so Phase 1 can tune without hunting.

### 4.2 Update-available dialog (app)

Non-blocking modal. Title: **"Update available — RISKWISE {version}"**. Body:

- Current version → new version.
- Release notes rendered from the GitHub Release body (Markdown, sanitised; anchor tags follow the `## en` / `## ar` / `## th` section for the user's current language, fall back to `## en`).
- "What's changed" summary is trimmed to the first 6 bullets; "Show full notes" expands inline.

Buttons (left-to-right, per WCAG reading order):

- **Download in background** (primary, focus on open). Starts the download; progress is shown in the status bar, not the modal.
- **Remind me later** (secondary). Snoozes for 24 h. No modal for this version again within that window unless the user opens Settings and checks manually.
- **Skip this version** (tertiary, link-style). Suppresses dialogs for exactly this version. A newer version overrides the skip.

Never-force rule: there is **no "Restart now" button on this dialog**. Restart is only offered after download completes (§4.3).

### 4.3 Update-downloaded dialog

After a background download completes, a non-modal toast appears: **"Update {version} ready. Install on next restart."** Tapping the toast opens a small modal:

- **Install on next restart** (primary, selected by default). Marks the update to install when the user naturally closes the app. This is the never-force behaviour.
- **Restart and install now** (secondary). User-initiated only.
- **Remind me later** (tertiary). Defers the install prompt 4 h.

If the user dismisses without choosing, the default behaviour is "Install on next restart" — we never discard a downloaded update silently.

### 4.4 Engine-update dialog

Engine updates are shown as a distinct modal because they run before the Python backend starts and can take minutes on slow links. Title: **"Engine update available — Engine {version}"**. Body:

- App version + current engine version → new engine version.
- Download size (from `size_bytes`) in MB.
- Signed-manifest indicator: green check "Publisher verified" when signature validates; if the signature check fails the dialog is not shown at all — the error surfaces through the diagnostics channel instead.

Buttons:

- **Download now** (primary). Shows a progress bar with resume-on-retry behaviour; on failure, user sees "Retrying — resumed at N%".
- **Continue with cached engine** (secondary). Only enabled when the cached engine still satisfies `min_app_version` / `max_app_version`. Disabled with a tooltip otherwise: "Cached engine is not compatible with this app version — update required."
- **Cancel** (tertiary). Equivalent to Remind-me-later for engine updates; re-prompts on next startup.

### 4.5 What's New dialog (post-install)

On first launch after an app update, a non-blocking **"What's new in {version}"** dialog opens. It renders:

1. The app release notes (language-scoped section from the GitHub Release body).
2. Engine release notes from `notes_url` if an engine update is bundled, under a collapsed "Engine changes" section.

Dismissal is remembered per version; reopening is via Settings → "Show release notes."

### 4.6 Settings → Updates panel

One tab in the existing Settings dialog. Controls:

- **Automatic update checks** — toggle (default on). Turning off disables background checks but leaves manual check available.
- **Release channel** — radio group: Stable / Beta / Internal. Non-stable channels show a warning icon and short description.
- **Check for updates now** — button. Disabled with tooltip when offline mode is on.
- **Current versions** — read-only: App `v2.0.1`, Engine `2.0.1`.
- **Downgrade to previous version** — button. Opens a confirmation modal listing the previous installed app version (read from `userData/update-history.json`, written on each successful install). Confirming runs `autoUpdater.quitAndInstall` against the cached prior NSIS installer; if no prior installer is cached, the button is disabled with tooltip "No previous version available on this machine." Downgrade **does not** cross channels — a stable user can only downgrade to a prior stable build.

### 4.7 Offline-mode interaction (Area 14)

When `settings.offlineMode === true`:

- Startup and 4-h checks are **skipped entirely** — no network call, no silent failure log noise.
- The Settings → "Check for updates now" button is disabled with tooltip: "Offline mode is on. Turn off offline mode to check for updates."
- The Updates panel shows a banner at the top: **"Offline mode is on — update checks are paused."**
- Any previously downloaded but not-yet-installed update is preserved; the "Install on next restart" behaviour still fires at app quit, because that is a local action and requires no network.
- Engine updates follow the same rules: no check, no prompt. If the cached engine is incompatible with the installed app (`min_app_version` mismatch), the app surfaces a clear "Version mismatch — turn off offline mode to fetch a compatible engine" error rather than silently misbehaving (Area 13 requirement).

### 4.8 Accessibility and i18n

- All dialogs are keyboard-reachable; focus lands on the primary button, `Esc` closes to the safe default (Remind later / Install on next restart).
- Buttons have distinct labels, not just icons; colour is never the sole signifier.
- Dialog strings are in the i18n bundle (`src/i18n/...`); release notes use the `## en` / `## ar` / `## th` sectioning rule in §4.2.
- RTL: dialog layout and progress bars mirror; the primary button stays in the locale-natural position (trailing edge in LTR, leading edge in RTL), consistent with the rest of the app.

---

## 5. Non-goals (explicitly deferred)

- **Delta/blockmap implementation details.** electron-updater handles blockmap generation; no custom work needed here.
- **Rollout gating / staged percentage rollouts.** Not in scope for v2.0; revisit if we hit install-failure spikes.
- **Telemetry for update success rate.** Covered by the telemetry work under D09/Area 14; this ADR only specifies that consent dialogs do not send telemetry while offline mode is on.
- **Engine auto-rollback on startup failure.** The engine-versioning decision is to fail fast with a clear version-mismatch error and let the user re-download, not to silently fall back.

---

## 6. Open questions for Phase 1

1. Should the 30 s startup delay be configurable per tenant, or is a single constant enough? Default answer: single constant.
2. Where does `update-history.json` live exactly — `app.getPath("userData")` root, or a `updates/` subfolder? Propose `updates/history.json` to keep userData tidy.
3. Minisign public-key rotation policy — if/when we rotate, do we ship dual-keys for one release? Propose yes (both keys accepted for exactly one app version, then the old key is removed) — confirm with security review before first rotation.

---

## 7. Acceptance trace (issue #8)

- Channel naming and tag conventions → §2.1.
- `engine-manifest.json` schema at `docs/architecture-decisions/engine-manifest-schema.json` → [engine-manifest-schema.json](engine-manifest-schema.json); all four issue-required fields present (`version`, `sha256`, `download_url`, `min_app_version`), plus the Area 13 extensions (`schema_version`, `channel`, `released_at`, `size_bytes`, `max_app_version`, `notes_url`) and signing design in §3.1.
- Consent dialog UX covering startup + 4 h cadence, install-on-next-restart / remind-me-later, Markdown release notes with `## en` / `## ar` / `## th` sections, Settings downgrade option, offline-mode skip → §4.1–§4.7.
- ADR saved at `docs/architecture-decisions/adr-autoupdate-ux.md` → this file.
