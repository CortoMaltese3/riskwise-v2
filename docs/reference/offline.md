# Offline mode

> **Status: deferred.** See [DECISIONS.md D24](../DECISIONS.md#d24--air-gapped-deployment-support-deferred-until-named-customer);
> tracked in [issue #134](https://github.com/CortoMaltese3/riskwise-v2/issues/134).
> The runtime offline toggle, IPC route blocking, MBTiles tile-server
> scaffold, and `.riskwise-pack` import flow still exist in the codebase,
> but the **offline installer variant** (`npm run dist:offline`, MBTiles
> tile pack bundled via `extraResources`, optional pre-extracted engine)
> has been removed from the build pipeline pending a real deployment
> need. The `OFFLINE_INSTALLER` branching was deleted from
> `electron-builder.js`. Restore it when the trigger conditions in D24
> are met. The sections below describe the design as originally
> implemented.
>
> A separate cleanup issue ([#135](https://github.com/CortoMaltese3/riskwise-v2/issues/135))
> addresses the dead IPC guard and orphan CLIMADA fetcher methods that
> the audit in D24 surfaced.

RISK WISE supports air-gapped operation through three independent
mechanisms: a runtime offline toggle, a bundled MBTiles tile pack, and
signed `.riskwise-pack` data imports. This document covers how each one
is configured and what guarantees it provides. See `ARCHITECTURE.md
§ Area 14` for the higher-level design notes.

## The offline toggle

The toggle lives under **Settings → Offline**. The setting is persisted
in `electron-store` (writes JSON under `userData`, separate from
`riskwise.db`) so it survives even if the database is unavailable. When
the toggle is on:

- `electron-updater` update checks are skipped (`isOfflineMode()` gate
  in `public/electron.js`).
- The CLIMADA Client API is unreachable. The IPC layer rejects any
  request matching `CLIMADA_CLIENT_ROUTE_PREFIXES` with a structured
  `offline_mode_active` envelope, so a renderer XSS cannot exfiltrate
  via these routes even if the UI guard is bypassed.
- Leaflet swaps to the local MBTiles tile server (see below). If no tile
  pack is installed the app falls back to the OpenStreetMap CDN and the
  Settings panel shows a warning.
- Sentry / telemetry are disabled. None are wired in this repo today;
  any future telemetry MUST also gate on `isOfflineMode()` before it
  emits.

A persistent **Offline mode active** chip appears in the bottom-right
corner of the app whenever the toggle is on, mirroring the indicator
that release-engineering tools show in similar contexts.

## Map tiles (MBTiles)

The local tile server reads from
`data/tiles/egy_tha_zoom_0_12.mbtiles`. The file is intentionally **not
committed** to the repository — it weighs ~600 MB and would dwarf the
rest of the source tree. Instead:

- **Tile pack URL**: `https://github.com/gkalomalos/ERA-Project_RISK-WISE/releases/download/tile-pack-v1/egy_tha_zoom_0_12.mbtiles`
- **Expected SHA-256**: `<TBD — fill in once the pack is published>`
- **Coverage**: Egypt and Thailand bounding boxes, zoom 0–12
- **Tile format**: PNG, derived from OpenStreetMap

Drop the file at the path above before running `npm run dist:offline`.
The offline installer's `electron-builder.js` adds it to
`extraResources`; the online installer omits it.

The runtime tile server uses [`@mapbox/mbtiles`](https://www.npmjs.com/package/@mapbox/mbtiles),
listed in `optionalDependencies`. If the install couldn't compile the
native module, offline tiles silently degrade to the remote CDN — every
other offline-mode feature still works. To force the dependency on a
fresh install: `npm install --include=optional @mapbox/mbtiles`.

## Signed data packs (`.riskwise-pack`)

Power users can sideload data into the `user-data/` tree by dropping a
**signed** `.riskwise-pack` file (a ZIP) plus its `.minisig` sidecar
into:

```
%APPDATA%\RISK WISE\packs\
```

On startup, the main process scans this directory and:

1. Reads each `.riskwise-pack` file's bytes.
2. Verifies the matching `.minisig` against the engine-manifest public
   key bundled at `resources/engine-manifest.pub` (Area 13).
3. If the signature verifies, extracts the ZIP into
   `userData/user-data/<pack-stem>/`. Existing extracted contents are
   wiped first, so re-importing a pack is a clean operation.
4. If the signature does **not** verify (unknown key, bad signature,
   missing sidecar), the pack is rejected with a structured error and
   surfaced in the Settings → Offline panel.

To sign a new pack:

```bash
# Pack the directory:
zip -r my-data.riskwise-pack ./my-data/

# Sign with the same Ed25519 key used for the engine manifest:
minisign -Sm my-data.riskwise-pack -s engine-manifest.key
```

The resulting `my-data.riskwise-pack.minisig` must live next to the
pack file in the user's packs directory. Do **not** ship the private key
inside the installer — only `engine-manifest.pub` is bundled.

> Out of scope for Area 14: `.riskwise-country-pack` signing (Area 22)
> reuses the same minisign machinery but is layered on top of the
> custom-data import flow, not the startup scanner.

## Installer variants

| Variant | Command                | Approx. size | Engine source             | Tile source        |
| ------- | ---------------------- | ------------ | ------------------------- | ------------------ |
| Online  | `npm run dist`         | ≤ 150 MB     | First-launch download     | OpenStreetMap CDN  |
| Offline | `npm run dist:offline` | ≤ 900 MB     | Bundled if `RISKWISE_ENGINE_DIR` is set | Local MBTiles |

The split is driven by the `OFFLINE_INSTALLER=1` environment variable
read inside `electron-builder.js`. When set:

- `extraResources` adds `data/tiles/<pack>.mbtiles`.
- `extraResources` also adds the engine tree pointed to by
  `RISKWISE_ENGINE_DIR` (if defined) under `resources/engine/`.
- `artifactName` gains an `-Offline` suffix so the two artifacts can
  ship side-by-side without overwriting each other.

Both variants share the same `appId` and update channel, so an offline
installer can be upgraded to the online one (or vice versa) without
losing user data.

## Verification checklist (airplane-mode VM)

Per the issue acceptance criteria, the offline installer must be
verified on a Windows VM with **Wi-Fi disabled and the loopback adapter
the only active network**:

1. Install the `-Offline` artifact.
2. Launch — the loader window should appear within 5 s and reach
   "Engine ready" without making any outbound HTTP request (verify
   with Wireshark or an OS firewall log).
3. Toggle Settings → Offline → on. Confirm the bottom-right chip appears
   and that map tiles render from `127.0.0.1`.
4. Run the Egypt flood scenario. The hazard, exposure, and risk maps
   must all render without external requests.
5. Click any "Fetch from CLIMADA Client" action: a non-blocking warning
   banner must appear, and no network traffic should be observed.

## Uninstall UX

The NSIS uninstaller removes the application binaries and the bundled
engine tree from `Program Files\RISK WISE\`. By default, it leaves
`%APPDATA%\RISK WISE\` (scenarios, packs, custom data) untouched so
users can reinstall without losing work. The uninstaller's optional
"Remove all user data" checkbox wipes `%APPDATA%\RISK WISE\` and the
`%LOCALAPPDATA%\RiskWiseEngine\` cache when ticked.
