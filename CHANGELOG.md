# Changelog

All notable changes to this project will be documented in this file.  
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),  
and this project adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

### Removed

- **Excel scenario report export** (#355) — superseded by the enriched PDF
  report (#350–#354, #377–#380). The
  `POST /api/v1/scenarios/{scenario_id}/export` endpoint,
  `backend/run_export_report.py`, `backend/report/report_handler.py`, the
  matching "Export Excel" workspace row action, and the `xlsxwriter` runtime
  dependency are all gone.

### Phase 6 — Engine Migration (CLIMADA → `climate-lama-engine`)

Operationalises [DECISIONS.md D26](docs/DECISIONS.md#d26--adopt-climate-lama-engine-as-the-runtime-compute-layer-post-v20)
(originally drafted as D18 in [phase-6-engine-migration.md](docs/plan/phase-6-engine-migration.md);
renumbered to D26 at landing). Issues #150–#168.

### Changed

- **Compute backend swapped to `climate-lama-engine`** — every backend
  handler (`impact`, `costben`, `hazard`, `exposure`, `entity`,
  `base_handler`, `run_scenario`) now routes through
  `backend/engine/adapter.py`. `climate-lama-engine` is the default and
  only runtime compute backend after #164 (default flip) and #166
  (CLIMADA removal). `climate_lama_engine` may be imported only from
  `backend/engine/`; enforced by `scripts/check_engine_imports.py` in
  CI per [`CONTRIBUTING.md` § Tooling & quality gates](CONTRIBUTING.md).
- **Provenance schema** — scenario rows now persist
  `engine: "climate-lama-engine"` and `engine_version`. The legacy
  `climada_version` column is nullable and `NULL` for all post-#164
  rows; pre-cutover rows keep their original value for traceability.

### Removed

- **`climada==6.1.0` removed from runtime deps** (#166) — gone from
  `pyproject.toml`, `requirements/requirements.txt`, and
  `requirements/environment.yml`. `python -c "import climada"` now
  raises `ModuleNotFoundError` in a clean install.
- **v1 CLIMADA-only handler tests deleted** (#167) —
  `backend/{impact,exposure,hazard}/test_*_handler.py` removed; their
  meaningful assertions are covered by the engine-branch unit tests
  added across Track 3 and the parity suite under `tests/parity/`.

### Bundle delta

Bundle benchmark refreshed in #165 against the post-cutover dependency
tree; numbers recorded in
[`docs/spikes/adr-bundling.md` §4.4](docs/spikes/adr-bundling.md) and
the v2.x section of
[`docs/reference/benchmarks.md`](docs/reference/benchmarks.md).
The Phase 6 ADR §7 target of ≤ 250 MB (re-baselined from the original
"~50 MB Track B daydream" per [DECISIONS.md D26](docs/DECISIONS.md))
is met on at least one Nuitka configuration.

## [2.1.4](https://github.com/CortoMaltese3/riskwise-v2/compare/v2.1.3...v2.1.4) (2026-06-07)


### Bug Fixes

* **ui:** stop update dialog snoozing on dismiss; show download progress ([#546](https://github.com/CortoMaltese3/riskwise-v2/issues/546)) ([8dc1b3d](https://github.com/CortoMaltese3/riskwise-v2/commit/8dc1b3d133a7520324618e6e2629305328005c43))

## [2.1.3](https://github.com/CortoMaltese3/riskwise-v2/compare/v2.1.2...v2.1.3) (2026-06-06)


### Bug Fixes

* **ui:** show splash status during engine startup ([#544](https://github.com/CortoMaltese3/riskwise-v2/issues/544)) ([5560717](https://github.com/CortoMaltese3/riskwise-v2/commit/5560717e704c2682f97fb18ddb00d05bbde2d6a4))

## [2.1.2](https://github.com/CortoMaltese3/riskwise-v2/compare/v2.1.1...v2.1.2) (2026-06-06)


### Bug Fixes

* **ci:** enable asar packaging to cut install time and unblock FUS-2 ([#542](https://github.com/CortoMaltese3/riskwise-v2/issues/542)) ([cba0e6b](https://github.com/CortoMaltese3/riskwise-v2/commit/cba0e6b9c8efdea1dc1a7ba21520f3c87dd8a9e5)), closes [#538](https://github.com/CortoMaltese3/riskwise-v2/issues/538)
* **ci:** place engine-manifest.pub where the runtime looks ([#539](https://github.com/CortoMaltese3/riskwise-v2/issues/539)) ([f2b361a](https://github.com/CortoMaltese3/riskwise-v2/commit/f2b361a3dc656923f94f30f77135cff25f0a501b)), closes [#536](https://github.com/CortoMaltese3/riskwise-v2/issues/536)
* **ui:** map stable channel to latest.yml for the auto-updater ([#540](https://github.com/CortoMaltese3/riskwise-v2/issues/540)) ([7108dba](https://github.com/CortoMaltese3/riskwise-v2/commit/7108dbab1801c0ec99777fee7a3763187a8dbc4a)), closes [#537](https://github.com/CortoMaltese3/riskwise-v2/issues/537)
* **ui:** render packaged splash and stop false engine-update prompt ([ba106d3](https://github.com/CortoMaltese3/riskwise-v2/commit/ba106d3372d05541d357ddab8eb5b26ae5cf8c59))
* **ui:** verify prehashed engine manifests under Electron BoringSSL ([a70bb1d](https://github.com/CortoMaltese3/riskwise-v2/commit/a70bb1dc3a05c8e8e767335e468f66f4203b585f))


### Tests

* **ui:** de-flake snapshot drawer commit-on-blur tests ([58c907c](https://github.com/CortoMaltese3/riskwise-v2/commit/58c907c8ee44bedfe6e27627ff1fd0a734bc993a))

## [2.1.1](https://github.com/CortoMaltese3/riskwise-v2/compare/v2.1.0...v2.1.1) (2026-06-04)


### Bug Fixes

* **ci:** make release SBOM accurate and NOTICES drift advisory ([#534](https://github.com/CortoMaltese3/riskwise-v2/issues/534)) ([40c4cf6](https://github.com/CortoMaltese3/riskwise-v2/commit/40c4cf6416059e1e837f0299a4f070ea4d7239ba)), closes [#533](https://github.com/CortoMaltese3/riskwise-v2/issues/533)

## [2.1.0](https://github.com/CortoMaltese3/riskwise-v2/compare/v2.0.0...v2.1.0) (2026-06-04)


### Features

* **ci:** decouple the engine onto a dedicated engine-stable release ([#530](https://github.com/CortoMaltese3/riskwise-v2/issues/530)) ([e9002ca](https://github.com/CortoMaltese3/riskwise-v2/commit/e9002ca573c0aea4ca24d14ad03d89ac223e74a9)), closes [#529](https://github.com/CortoMaltese3/riskwise-v2/issues/529)


### Bug Fixes

* **ci:** install minisign on PATH for the engine-manifest sign step ([#532](https://github.com/CortoMaltese3/riskwise-v2/issues/532)) ([481da08](https://github.com/CortoMaltese3/riskwise-v2/commit/481da087d5387253b8c8e6ccf76ae90365406c19)), closes [#529](https://github.com/CortoMaltese3/riskwise-v2/issues/529)
* **ui:** provision engine data trees when the engine is downloaded ([#528](https://github.com/CortoMaltese3/riskwise-v2/issues/528)) ([b17779e](https://github.com/CortoMaltese3/riskwise-v2/commit/b17779ec9361c4542f5d4f8814ac3411c3f263b5)), closes [#527](https://github.com/CortoMaltese3/riskwise-v2/issues/527)
* **ui:** replace CSS resize with a visible drag handle on both panels ([#525](https://github.com/CortoMaltese3/riskwise-v2/issues/525)) ([055252d](https://github.com/CortoMaltese3/riskwise-v2/commit/055252d76a6901991035db5584c5db5fcb154f8b))

## [2.0.0](https://github.com/CortoMaltese3/riskwise-v2/compare/v1.1.0...v2.0.0) (2026-06-02)


### ⚠ BREAKING CHANGES

* version namespace transitions from 1.x to 2.x to align with the v2 architecture already referenced across the ADR, channel resolver, and open issues. No runtime API changes; tooling/version alignment only. The next release-please PR will recompute to 2.0.0.

### Features

* align release namespace with v2 architecture ([#467](https://github.com/CortoMaltese3/riskwise-v2/issues/467)) ([355a271](https://github.com/CortoMaltese3/riskwise-v2/commit/355a2715f11f292a1e3feb80376e2366acab3e83)), closes [#415](https://github.com/CortoMaltese3/riskwise-v2/issues/415)
* **api, worker, ui:** interactive adaptation measure selection ([#389](https://github.com/CortoMaltese3/riskwise-v2/issues/389)) ([a118ab8](https://github.com/CortoMaltese3/riskwise-v2/commit/a118ab8f75190a0c24e7f67e3ac4f2f2b6908c5d)), closes [#373](https://github.com/CortoMaltese3/riskwise-v2/issues/373)
* **api,db,ui:** editable impact functions in custom-mode scenarios ([#462](https://github.com/CortoMaltese3/riskwise-v2/issues/462)) ([e1b1e30](https://github.com/CortoMaltese3/riskwise-v2/commit/e1b1e30f3236a7fc96d5f28eb2f26016b44ae637)), closes [#453](https://github.com/CortoMaltese3/riskwise-v2/issues/453)
* **api,ui:** read-only impact-function viewer on Risk inputs ([#459](https://github.com/CortoMaltese3/riskwise-v2/issues/459)) ([ff91dd5](https://github.com/CortoMaltese3/riskwise-v2/commit/ff91dd57993cc22f54202102fc2d48b2b863cb0e)), closes [#452](https://github.com/CortoMaltese3/riskwise-v2/issues/452)
* **api,ui:** surface measure applicability and skipped-measures feedback ([#458](https://github.com/CortoMaltese3/riskwise-v2/issues/458)) ([2a150e4](https://github.com/CortoMaltese3/riskwise-v2/commit/2a150e4a564987849549663d6b5c2969532d0dc7)), closes [#450](https://github.com/CortoMaltese3/riskwise-v2/issues/450)
* **db, ui:** add title field to snapshots for PDF report headings ([#357](https://github.com/CortoMaltese3/riskwise-v2/issues/357)) ([7520bb5](https://github.com/CortoMaltese3/riskwise-v2/commit/7520bb57b0802f76d321178f5a2c18466bc6a765)), closes [#354](https://github.com/CortoMaltese3/riskwise-v2/issues/354)
* **db, ui:** tag snapshots with originating surface for PDF routing ([#377](https://github.com/CortoMaltese3/riskwise-v2/issues/377)) ([295ae45](https://github.com/CortoMaltese3/riskwise-v2/commit/295ae454c95e2a015c4618c933a033eb28fab362)), closes [#362](https://github.com/CortoMaltese3/riskwise-v2/issues/362)
* **electron:** install downloaded engine and stage when locked ([#486](https://github.com/CortoMaltese3/riskwise-v2/issues/486)) ([ce6d74a](https://github.com/CortoMaltese3/riskwise-v2/commit/ce6d74a4f5c1c871cc0781d35d804ae43b5ed6d8)), closes [#421](https://github.com/CortoMaltese3/riskwise-v2/issues/421)
* **security:** verify engine ZIP SHA-256 on first-launch download ([#345](https://github.com/CortoMaltese3/riskwise-v2/issues/345)) ([e59e1a7](https://github.com/CortoMaltese3/riskwise-v2/commit/e59e1a7cac1c32abfaa6f85495fe8ee6dfa62049))
* stage_engine script + dev-mode live-source spawn for fast iteration ([0a73f04](https://github.com/CortoMaltese3/riskwise-v2/commit/0a73f046a5d19b2e2dd36f47404e82dd3a0a9da0))
* **ui:** add Active Scenario card to Adaptation view ([#388](https://github.com/CortoMaltese3/riskwise-v2/issues/388)) ([54748d2](https://github.com/CortoMaltese3/riskwise-v2/commit/54748d2e3ef7d58f2be84530b49a6338fa383c7b)), closes [#372](https://github.com/CortoMaltese3/riskwise-v2/issues/372) [#368](https://github.com/CortoMaltese3/riskwise-v2/issues/368)
* **ui:** add Adaptation results display panel with summary stats ([#390](https://github.com/CortoMaltese3/riskwise-v2/issues/390)) ([db05f31](https://github.com/CortoMaltese3/riskwise-v2/commit/db05f313860f2a1a1ea82ec3f086f259d308225a)), closes [#368](https://github.com/CortoMaltese3/riskwise-v2/issues/368)
* **ui:** add Adaptation top-level sidebar section and view shell ([#387](https://github.com/CortoMaltese3/riskwise-v2/issues/387)) ([ac20b7e](https://github.com/CortoMaltese3/riskwise-v2/commit/ac20b7ebc3a48d2f2557c49f5e778991d3bc1f51)), closes [#368](https://github.com/CortoMaltese3/riskwise-v2/issues/368) [#371](https://github.com/CortoMaltese3/riskwise-v2/issues/371)
* **ui:** add basemap selector, opacity slider, and scale bar to maps ([#482](https://github.com/CortoMaltese3/riskwise-v2/issues/482)) ([727ffb0](https://github.com/CortoMaltese3/riskwise-v2/commit/727ffb08730367d9332e4979cd5d0b74963054ab)), closes [#477](https://github.com/CortoMaltese3/riskwise-v2/issues/477)
* **ui:** add bulk delete action for workspace scenario table ([#397](https://github.com/CortoMaltese3/riskwise-v2/issues/397)) ([29aaab0](https://github.com/CortoMaltese3/riskwise-v2/commit/29aaab0c68c5f453a08ae4fb6b05f1dba8f9bc6c)), closes [#394](https://github.com/CortoMaltese3/riskwise-v2/issues/394)
* **ui:** add empty-state placeholder for map pre-run ([#278](https://github.com/CortoMaltese3/riskwise-v2/issues/278)) ([cc69824](https://github.com/CortoMaltese3/riskwise-v2/commit/cc69824c4c59111cc94586dff11e84b9896d9889)), closes [#268](https://github.com/CortoMaltese3/riskwise-v2/issues/268)
* **ui:** add layout primitives for Phase 8.3 ([#221](https://github.com/CortoMaltese3/riskwise-v2/issues/221)) ([56f0ec8](https://github.com/CortoMaltese3/riskwise-v2/commit/56f0ec8bf823d6944de845c38f7fbcb400834c36)), closes [#209](https://github.com/CortoMaltese3/riskwise-v2/issues/209)
* **ui:** add light/dark theme support with toggle ([#290](https://github.com/CortoMaltese3/riskwise-v2/issues/290)) ([c5a0101](https://github.com/CortoMaltese3/riskwise-v2/commit/c5a0101dd4799bfd932e4b77e9814c0ec6aed122)), closes [#288](https://github.com/CortoMaltese3/riskwise-v2/issues/288)
* **ui:** add motion / focus tokens and enforce 8 px spacing scale ([#262](https://github.com/CortoMaltese3/riskwise-v2/issues/262)) ([fed4786](https://github.com/CortoMaltese3/riskwise-v2/commit/fed47860ac849057991b27a4b9b9f585907643ce)), closes [#217](https://github.com/CortoMaltese3/riskwise-v2/issues/217)
* **ui:** add Save scenario button to analysis tab toolbar ([#311](https://github.com/CortoMaltese3/riskwise-v2/issues/311)) ([f428271](https://github.com/CortoMaltese3/riskwise-v2/commit/f4282713de3260193ef0dade8012b1b728ef7915)), closes [#299](https://github.com/CortoMaltese3/riskwise-v2/issues/299)
* **ui:** add skip-version + release-notes preview to UpdateDialog ([#489](https://github.com/CortoMaltese3/riskwise-v2/issues/489)) ([7bba404](https://github.com/CortoMaltese3/riskwise-v2/commit/7bba40487f6c54a23b213670aa5cd5cbba7ce089)), closes [#424](https://github.com/CortoMaltese3/riskwise-v2/issues/424)
* **ui:** always land on Home after mode-selection dialog ([0c7e09d](https://github.com/CortoMaltese3/riskwise-v2/commit/0c7e09d5d732d4fc089409666b321a929331bdac))
* **ui:** click impact map legend buckets to filter visible markers ([#483](https://github.com/CortoMaltese3/riskwise-v2/issues/483)) ([8c64aca](https://github.com/CortoMaltese3/riskwise-v2/commit/8c64aca8156bad77306d0e2c29823c9a2b15dd55)), closes [#478](https://github.com/CortoMaltese3/riskwise-v2/issues/478)
* **ui:** clickable home rows with restore-confirm, default to Home ([#441](https://github.com/CortoMaltese3/riskwise-v2/issues/441)) ([50a87a0](https://github.com/CortoMaltese3/riskwise-v2/commit/50a87a00f9eee17f4534b590bc582fc3b0bc4247))
* **ui:** curated home highlights, live run card, last activity hint ([#440](https://github.com/CortoMaltese3/riskwise-v2/issues/440)) ([17862a2](https://github.com/CortoMaltese3/riskwise-v2/commit/17862a2d090417a226814081a89071d7c0635b38)), closes [#437](https://github.com/CortoMaltese3/riskwise-v2/issues/437)
* **ui:** deep-link from Risk view to Adaptation view ([#391](https://github.com/CortoMaltese3/riskwise-v2/issues/391)) ([1f8d557](https://github.com/CortoMaltese3/riskwise-v2/commit/1f8d55739dbdf800f678a0511198f43eacc05aea)), closes [#368](https://github.com/CortoMaltese3/riskwise-v2/issues/368) [#375](https://github.com/CortoMaltese3/riskwise-v2/issues/375)
* **ui:** enforce i18n on JSX text via eslint-plugin-i18next ([#470](https://github.com/CortoMaltese3/riskwise-v2/issues/470)) ([7fabc93](https://github.com/CortoMaltese3/riskwise-v2/commit/7fabc9301f19a71ff737d9469809c7877e96a229)), closes [#146](https://github.com/CortoMaltese3/riskwise-v2/issues/146)
* **ui:** forward electron-log + Python logging to Sentry breadcrumbs ([#488](https://github.com/CortoMaltese3/riskwise-v2/issues/488)) ([ce7a4ca](https://github.com/CortoMaltese3/riskwise-v2/commit/ce7a4cac124ba1e0b20d1ee7e24586afdcce5b35)), closes [#308](https://github.com/CortoMaltese3/riskwise-v2/issues/308)
* **ui:** friendly empty state for waterfall chart pre-run ([#306](https://github.com/CortoMaltese3/riskwise-v2/issues/306)) ([67f213c](https://github.com/CortoMaltese3/riskwise-v2/commit/67f213cdf91b1cca597c8829e4928703546b0a58))
* **ui:** in-app Send Diagnostics button uploads bundle to Sentry ([#304](https://github.com/CortoMaltese3/riskwise-v2/issues/304)) ([fa94be0](https://github.com/CortoMaltese3/riskwise-v2/commit/fa94be06b8d70a4e0d1258254085f2e853cf08b3)), closes [#300](https://github.com/CortoMaltese3/riskwise-v2/issues/300)
* **ui:** non-blocking scenario run with bottom-left progress chip ([#403](https://github.com/CortoMaltese3/riskwise-v2/issues/403)) ([31733e1](https://github.com/CortoMaltese3/riskwise-v2/commit/31733e111af7171662a14f9d9b131b8575749bf9)), closes [#401](https://github.com/CortoMaltese3/riskwise-v2/issues/401)
* **ui:** rebuild Home view as analyst landing page ([#281](https://github.com/CortoMaltese3/riskwise-v2/issues/281)) ([79903c9](https://github.com/CortoMaltese3/riskwise-v2/commit/79903c9cf412ba040263efa93c7920d85eb10596)), closes [#271](https://github.com/CortoMaltese3/riskwise-v2/issues/271)
* **ui:** redesign snapshot camera button with loader + chart-surface gating ([#380](https://github.com/CortoMaltese3/riskwise-v2/issues/380)) ([3faef5c](https://github.com/CortoMaltese3/riskwise-v2/commit/3faef5c6c29411b759d1f068ae6faae8926b0eff)), closes [#365](https://github.com/CortoMaltese3/riskwise-v2/issues/365)
* **ui:** refactor splash loader with live boot status and themable design tokens ([#284](https://github.com/CortoMaltese3/riskwise-v2/issues/284)) ([ecb7837](https://github.com/CortoMaltese3/riskwise-v2/commit/ecb7837a7cbe4eaac68cbd946f1a1172ed7249f6)), closes [#283](https://github.com/CortoMaltese3/riskwise-v2/issues/283)
* **ui:** replace auto save-prompt with explicit save + toast feedback ([#400](https://github.com/CortoMaltese3/riskwise-v2/issues/400)) ([3b766f9](https://github.com/CortoMaltese3/riskwise-v2/commit/3b766f900fd02a25c89922bf26789966b98bf0d8)), closes [#398](https://github.com/CortoMaltese3/riskwise-v2/issues/398)
* **ui:** replace welcome modal with header ERA/Custom toggle ([#325](https://github.com/CortoMaltese3/riskwise-v2/issues/325)) ([3f3ffe7](https://github.com/CortoMaltese3/riskwise-v2/commit/3f3ffe71b14c587676fb52d76f778866a50470a4)), closes [#322](https://github.com/CortoMaltese3/riskwise-v2/issues/322)
* **ui:** replace workspace kebab menu with inline action icons ([#395](https://github.com/CortoMaltese3/riskwise-v2/issues/395)) ([6c6d644](https://github.com/CortoMaltese3/riskwise-v2/commit/6c6d6447ffa868c32de40a3aa00cd9b458b2e4c2)), closes [#393](https://github.com/CortoMaltese3/riskwise-v2/issues/393)
* **ui:** restructure PDF report into per-domain sections ([#378](https://github.com/CortoMaltese3/riskwise-v2/issues/378)) ([b122e24](https://github.com/CortoMaltese3/riskwise-v2/commit/b122e247fc90c3013d954ce8b2e1bd4a5c716804)), closes [#363](https://github.com/CortoMaltese3/riskwise-v2/issues/363)
* **ui:** route snapshots into PDF sections by surface and add chart toggles ([#379](https://github.com/CortoMaltese3/riskwise-v2/issues/379)) ([6119d9c](https://github.com/CortoMaltese3/riskwise-v2/commit/6119d9c665a9933ef41c22e5b9f694f0aa379d08)), closes [#364](https://github.com/CortoMaltese3/riskwise-v2/issues/364)
* **ui:** show empty plot on Macro view; populate progressively ([#279](https://github.com/CortoMaltese3/riskwise-v2/issues/279)) ([db4e564](https://github.com/CortoMaltese3/riskwise-v2/commit/db4e564b220180addc6f03d1162441929aa9914d)), closes [#269](https://github.com/CortoMaltese3/riskwise-v2/issues/269)
* **ui:** show scenario ID on PDF report cover page ([#465](https://github.com/CortoMaltese3/riskwise-v2/issues/465)) ([273713d](https://github.com/CortoMaltese3/riskwise-v2/commit/273713d6c3222b6d528bda5828d080ca77525cec)), closes [#463](https://github.com/CortoMaltese3/riskwise-v2/issues/463)
* **ui:** slim TopBar to 56px and recolor onto brand teal ([#292](https://github.com/CortoMaltese3/riskwise-v2/issues/292)) ([5f5c5fa](https://github.com/CortoMaltese3/riskwise-v2/commit/5f5c5fa8df6268c65d34692418bc294dacd7b465)), closes [#287](https://github.com/CortoMaltese3/riskwise-v2/issues/287)
* **ui:** translate Arabic/Thai placeholder keys for settings panels ([#469](https://github.com/CortoMaltese3/riskwise-v2/issues/469)) ([f5d0cfb](https://github.com/CortoMaltese3/riskwise-v2/commit/f5d0cfb199b824de49768c3e7bab7692acaa2cdb)), closes [#146](https://github.com/CortoMaltese3/riskwise-v2/issues/146)
* **ui:** wire update-downloaded toast (ADR §4.3) ([#487](https://github.com/CortoMaltese3/riskwise-v2/issues/487)) ([04457ca](https://github.com/CortoMaltese3/riskwise-v2/commit/04457ca202fe2a8eda67f861acb214b28c858347)), closes [#423](https://github.com/CortoMaltese3/riskwise-v2/issues/423) [#414](https://github.com/CortoMaltese3/riskwise-v2/issues/414)
* **ui:** wrap Workspace empty state in framed Paper container ([#280](https://github.com/CortoMaltese3/riskwise-v2/issues/280)) ([f435760](https://github.com/CortoMaltese3/riskwise-v2/commit/f435760e54d88704f0728455756bb7c90319dd50)), closes [#270](https://github.com/CortoMaltese3/riskwise-v2/issues/270)
* **workspace:** hide unsaved runs from workspace list via 'saved' flag ([#307](https://github.com/CortoMaltese3/riskwise-v2/issues/307)) ([d9472fa](https://github.com/CortoMaltese3/riskwise-v2/commit/d9472faf4852cee62b65d623890e3d3a77f50ad6)), closes [#302](https://github.com/CortoMaltese3/riskwise-v2/issues/302)
* **workspace:** user-driven snapshot capture and gallery for saved scenarios ([#309](https://github.com/CortoMaltese3/riskwise-v2/issues/309)) ([763c7f4](https://github.com/CortoMaltese3/riskwise-v2/commit/763c7f4a862c5056e9c1ebc08aa1f3e541fc89bb)), closes [#303](https://github.com/CortoMaltese3/riskwise-v2/issues/303)


### Bug Fixes

* add the is development check for the application engine ([a48f700](https://github.com/CortoMaltese3/riskwise-v2/commit/a48f70053bfd65f3f39bb07c0deaa4a605694ee4))
* **api,db,ui:** unblock map snapshots in PDF report export ([0ce8b94](https://github.com/CortoMaltese3/riskwise-v2/commit/0ce8b94325ee94edfd5faafba74145a06dc14be8))
* **api,ui:** preserve cost-benefit across restored-scenario re-runs ([#433](https://github.com/CortoMaltese3/riskwise-v2/issues/433)) ([b7f5c58](https://github.com/CortoMaltese3/riskwise-v2/commit/b7f5c5897fac8e0c0ec48ac9faa9d86b8610897c)), closes [#428](https://github.com/CortoMaltese3/riskwise-v2/issues/428)
* **api:** dedupe adaptation-measures catalog by name at SQL source ([#455](https://github.com/CortoMaltese3/riskwise-v2/issues/455)) ([d2c43ce](https://github.com/CortoMaltese3/riskwise-v2/commit/d2c43ce631f8a5558a98fc154ad5cc1d3ca72c43)), closes [#446](https://github.com/CortoMaltese3/riskwise-v2/issues/446)
* **ci:** restore green CI after dependency-version drift ([#518](https://github.com/CortoMaltese3/riskwise-v2/issues/518)) ([43ab20c](https://github.com/CortoMaltese3/riskwise-v2/commit/43ab20cb71675789a65bda4058171bd526057e3e))
* **core:** allow historical scenarios to produce cost-benefit data ([#386](https://github.com/CortoMaltese3/riskwise-v2/issues/386)) ([95754c7](https://github.com/CortoMaltese3/riskwise-v2/commit/95754c74d8f4b9cce17b7e6e2eeada90199fec60)), closes [#368](https://github.com/CortoMaltese3/riskwise-v2/issues/368) [#369](https://github.com/CortoMaltese3/riskwise-v2/issues/369)
* **core:** complete CLIMADA → engine handler migration ([#295](https://github.com/CortoMaltese3/riskwise-v2/issues/295)) ([e4d1493](https://github.com/CortoMaltese3/riskwise-v2/commit/e4d149385c80915b489da1dcd25eaf96e8bea94a)), closes [#293](https://github.com/CortoMaltese3/riskwise-v2/issues/293)
* **data,ui:** render full measure names on cost-benefit chart ([#432](https://github.com/CortoMaltese3/riskwise-v2/issues/432)) ([b9f66dc](https://github.com/CortoMaltese3/riskwise-v2/commit/b9f66dc1dc92d5d7a4a53124163dd1266fa0d224)), closes [#429](https://github.com/CortoMaltese3/riskwise-v2/issues/429)
* **db,ui:** quarantine unreplayable WAL and raise chart height cap ([e6646a1](https://github.com/CortoMaltese3/riskwise-v2/commit/e6646a1d16c3064cadc6ac5b2e67ac41d191eab0))
* **db:** allow migrations to opt out of transaction wrap ([e4fd107](https://github.com/CortoMaltese3/riskwise-v2/commit/e4fd1076f2262ef96f54a356affd8e3a248987e4))
* **db:** narrow fetchone result in create_snapshot for mypy ([1d0821e](https://github.com/CortoMaltese3/riskwise-v2/commit/1d0821edb84fd3c6601e835725c4060e3bf90329))
* minor adjustment to adaptation measures dark theme view ([017b035](https://github.com/CortoMaltese3/riskwise-v2/commit/017b035ce58738e84118c0eb7b5ebfb0f0e68458))
* minor fix on workspace refresh ([6875045](https://github.com/CortoMaltese3/riskwise-v2/commit/68750452b6ce6a6b4f718ab33aa488fd1afa04eb))
* mocify the build_engine script to create a working nuitka build ([01ef5ca](https://github.com/CortoMaltese3/riskwise-v2/commit/01ef5ca8209b6aba5044089d1e70c611a80b26e5))
* Nuitka onefile compat — orphan cleanup + BACKEND_DIR resolver ([#294](https://github.com/CortoMaltese3/riskwise-v2/issues/294)) ([090bada](https://github.com/CortoMaltese3/riskwise-v2/commit/090badad25b38da2b95d3ef8bfc7207a7259de45))
* resolve CI failures on main (npm audit, snapshot drawer, ioctl, structlog) ([#342](https://github.com/CortoMaltese3/riskwise-v2/issues/342)) ([cb842d8](https://github.com/CortoMaltese3/riskwise-v2/commit/cb842d8294b0775b5844f233e4fb040cda2241e1))
* restore scenario-completion UI (impact map, waterfall, tab jump) ([#297](https://github.com/CortoMaltese3/riskwise-v2/issues/297)) ([eb49279](https://github.com/CortoMaltese3/riskwise-v2/commit/eb492794c20e53ff9133f1d4d5bf5ea85fc49c1f))
* **ui, api:** hydrate temp dir on workspace restore and lowercase country ([#404](https://github.com/CortoMaltese3/riskwise-v2/issues/404)) ([474005e](https://github.com/CortoMaltese3/riskwise-v2/commit/474005e80add4874cac6a3d7b3d01309539b2b2c)), closes [#402](https://github.com/CortoMaltese3/riskwise-v2/issues/402)
* **ui:** add missing settings_tab_updates translation key ([fb27dcc](https://github.com/CortoMaltese3/riskwise-v2/commit/fb27dcc4a9e0d177a03133ad366b31aadb033ee3))
* **ui:** align column header bars and tighten input card titles ([8fe88a7](https://github.com/CortoMaltese3/riskwise-v2/commit/8fe88a71fb0ed9e1d4b519c75c7e3e19b6c564a5))
* **ui:** align Home columns by removing GET STARTED overline ([0376c31](https://github.com/CortoMaltese3/riskwise-v2/commit/0376c31a8825ef5f6a6470aa650bcb34e3d42ac3))
* **ui:** apply BiDi isolation to Chart.js dataset labels ([#471](https://github.com/CortoMaltese3/riskwise-v2/issues/471)) ([41a380d](https://github.com/CortoMaltese3/riskwise-v2/commit/41a380d0ee7a665011a995bab0199b4ac8d6c3b5)), closes [#256](https://github.com/CortoMaltese3/riskwise-v2/issues/256)
* **ui:** batch UX fixes on Risk Assessment surface ([#344](https://github.com/CortoMaltese3/riskwise-v2/issues/344)) ([fe9091e](https://github.com/CortoMaltese3/riskwise-v2/commit/fe9091ee43836fd180f89af87fce2f4320a9a579)), closes [#343](https://github.com/CortoMaltese3/riskwise-v2/issues/343)
* **ui:** blank result-details body when no map/chart is visible ([#409](https://github.com/CortoMaltese3/riskwise-v2/issues/409)) ([10b334e](https://github.com/CortoMaltese3/riskwise-v2/commit/10b334edf9c46a2c79bc9e4fc7d33f4b2a877eae)), closes [#407](https://github.com/CortoMaltese3/riskwise-v2/issues/407)
* **ui:** cap macro chart height to stop right-pane scrollbar ([05fe357](https://github.com/CortoMaltese3/riskwise-v2/commit/05fe3576cfa959cea8d1974c7ee42d6a3726b4a3)), closes [#285](https://github.com/CortoMaltese3/riskwise-v2/issues/285)
* **ui:** centre TopBar section title relative to viewport ([#272](https://github.com/CortoMaltese3/riskwise-v2/issues/272)) ([5a688a5](https://github.com/CortoMaltese3/riskwise-v2/commit/5a688a59ef09285148d68f6321525029d2c92fed)), closes [#263](https://github.com/CortoMaltese3/riskwise-v2/issues/263)
* **ui:** conform map overlay button widths and fix Admin label casing ([b523ca8](https://github.com/CortoMaltese3/riskwise-v2/commit/b523ca8efc844fcaf5e2ba429419e5ec8f588ec0))
* **ui:** disable chart animation in PDF print path ([#442](https://github.com/CortoMaltese3/riskwise-v2/issues/442)) ([4c9ebbc](https://github.com/CortoMaltese3/riskwise-v2/commit/4c9ebbc2bc7f65b1a592bf3efa919b6fd0ef362e)), closes [#439](https://github.com/CortoMaltese3/riskwise-v2/issues/439)
* **ui:** force GlossaryDrawer offset via Drawer-root sx selector ([d33ddbb](https://github.com/CortoMaltese3/riskwise-v2/commit/d33ddbb344c0d5cc189a9b268539db232275d4db)), closes [#285](https://github.com/CortoMaltese3/riskwise-v2/issues/285)
* **ui:** init Sentry before app ready so Send to Support reaches Sentry ([b52c1d4](https://github.com/CortoMaltese3/riskwise-v2/commit/b52c1d42603e070e1276e77a2c62864d6fde0f41))
* **ui:** make impact map markers visible at all zoom levels ([#480](https://github.com/CortoMaltese3/riskwise-v2/issues/480)) ([cc17fe3](https://github.com/CortoMaltese3/riskwise-v2/commit/cc17fe3b41098de9e0c48edad18c940d11d96436)), closes [#475](https://github.com/CortoMaltese3/riskwise-v2/issues/475)
* **ui:** make risk and adaptation results panels resizable ([#515](https://github.com/CortoMaltese3/riskwise-v2/issues/515)) ([440996b](https://github.com/CortoMaltese3/riskwise-v2/commit/440996bef3234037909892a0f8ac31d605f3003b)), closes [#225](https://github.com/CortoMaltese3/riskwise-v2/issues/225)
* **ui:** move EngineStatusBanner out of section scroll region ([#277](https://github.com/CortoMaltese3/riskwise-v2/issues/277)) ([01a1e49](https://github.com/CortoMaltese3/riskwise-v2/commit/01a1e49f428b2a811b25c1db5776d53835362771)), closes [#267](https://github.com/CortoMaltese3/riskwise-v2/issues/267)
* **ui:** offset GlossaryDrawer below the AppBar ([c246ae7](https://github.com/CortoMaltese3/riskwise-v2/commit/c246ae78991243f36f339a2c3d65a1fd25232959)), closes [#285](https://github.com/CortoMaltese3/riskwise-v2/issues/285)
* **ui:** prevent map overlay button label clipping in VALUES/IMPACT tabs ([3ab3c3b](https://github.com/CortoMaltese3/riskwise-v2/commit/3ab3c3bdea4baf67d7cead86c51586bcb2d115c1))
* **ui:** remove "million" qualifier from chart-description USD copy ([#431](https://github.com/CortoMaltese3/riskwise-v2/issues/431)) ([bcfcdc5](https://github.com/CortoMaltese3/riskwise-v2/commit/bcfcdc520d5b5429d6c10bea2a66d753728ebce4)), closes [#430](https://github.com/CortoMaltese3/riskwise-v2/issues/430)
* **ui:** remove basemap opacity slider and fix legend dark-mode contrast ([3508fe7](https://github.com/CortoMaltese3/riskwise-v2/commit/3508fe74dd7cbeec0703ec6661affd2a47494cb3))
* **ui:** remove height: 85vh from result cards ([#273](https://github.com/CortoMaltese3/riskwise-v2/issues/273)) ([3e5cabb](https://github.com/CortoMaltese3/riskwise-v2/commit/3e5cabbddd339636e005c8a25e3f2b74c064f26d)), closes [#264](https://github.com/CortoMaltese3/riskwise-v2/issues/264)
* **ui:** remove vertical centering from risk and adaptation chart panels ([#383](https://github.com/CortoMaltese3/riskwise-v2/issues/383)) ([be68f03](https://github.com/CortoMaltese3/riskwise-v2/commit/be68f03a9cf298b11abac8e504a8ece62feae145)), closes [#370](https://github.com/CortoMaltese3/riskwise-v2/issues/370)
* **ui:** render Save scenario + snapshot buttons in live MainView ([#313](https://github.com/CortoMaltese3/riskwise-v2/issues/313)) ([904f79d](https://github.com/CortoMaltese3/riskwise-v2/commit/904f79da7422563a2a1aaa20971556581978b3ff))
* **ui:** repair i18n gaps — placeholders, missing key, TODO debt ([#408](https://github.com/CortoMaltese3/riskwise-v2/issues/408)) ([2cf2082](https://github.com/CortoMaltese3/riskwise-v2/commit/2cf2082cf06c84ff7b1e0c1002470da248df64bf)), closes [#407](https://github.com/CortoMaltese3/riskwise-v2/issues/407)
* **ui:** reset measure-selection state on exposure & app-option change ([#454](https://github.com/CortoMaltese3/riskwise-v2/issues/454)) ([b2f9d53](https://github.com/CortoMaltese3/riskwise-v2/commit/b2f9d5392eb3d57bcb1f416d6f0330fd4f322a09)), closes [#448](https://github.com/CortoMaltese3/riskwise-v2/issues/448)
* **ui:** restore button gap in Country and Hazard editor cards ([#406](https://github.com/CortoMaltese3/riskwise-v2/issues/406)) ([3567948](https://github.com/CortoMaltese3/riskwise-v2/commit/356794825f04870f2e70e548575bf3b6ce428ca0)), closes [#405](https://github.com/CortoMaltese3/riskwise-v2/issues/405)
* **ui:** restore drag-to-resize on risk-view left side panel ([#514](https://github.com/CortoMaltese3/riskwise-v2/issues/514)) ([41bf3a9](https://github.com/CortoMaltese3/riskwise-v2/commit/41bf3a9b1c4fb778bf218959feb84873f9169a71)), closes [#225](https://github.com/CortoMaltese3/riskwise-v2/issues/225)
* **ui:** restore vertical and right-edge button spacing in Country and Hazard editor cards ([e10bac4](https://github.com/CortoMaltese3/riskwise-v2/commit/e10bac480a48d1b09c15789e0ac711a6b468f2e3)), closes [#405](https://github.com/CortoMaltese3/riskwise-v2/issues/405)
* **ui:** right-align workspace header actions and slim empty state ([5579cc5](https://github.com/CortoMaltese3/riskwise-v2/commit/5579cc5ac8b36a148a485e8929450ae36badf551))
* **ui:** RTL locale parity audit and fixes for PDF report ([#466](https://github.com/CortoMaltese3/riskwise-v2/issues/466)) ([50ec728](https://github.com/CortoMaltese3/riskwise-v2/commit/50ec728daf347cb8a3f4cc6bb77578ffc06ad360)), closes [#464](https://github.com/CortoMaltese3/riskwise-v2/issues/464)
* **ui:** standardize button intents and restore title/input chrome ([84c18e6](https://github.com/CortoMaltese3/riskwise-v2/commit/84c18e6c38322870359cfa3d5c05eb558ec61acc))
* **ui:** stop sidebar drawer from covering EngineStatusBanner ([f0f109e](https://github.com/CortoMaltese3/riskwise-v2/commit/f0f109ed0fe1e46699811fb0e70e770d20b5b512)), closes [#285](https://github.com/CortoMaltese3/riskwise-v2/issues/285)
* **ui:** stretch main pane content and dock view controls at bottom ([be7abd1](https://github.com/CortoMaltese3/riskwise-v2/commit/be7abd1ce33231de87b49718b39b4e22c167c1f0))
* **ui:** theme selector persistence and single-click toggle ([00e8ec0](https://github.com/CortoMaltese3/riskwise-v2/commit/00e8ec0c27aec439be608c23ce4131c062d360ae))
* **ui:** tidy waterfall and cost-benefit charts ([#412](https://github.com/CortoMaltese3/riskwise-v2/issues/412)) ([#427](https://github.com/CortoMaltese3/riskwise-v2/issues/427)) ([3e0e13f](https://github.com/CortoMaltese3/riskwise-v2/commit/3e0e13ff2ce89fa32a635000aeb48ffb5730896c))
* **ui:** trigger CRED data fetch when entering Macroeconomic view ([6b8734b](https://github.com/CortoMaltese3/riskwise-v2/commit/6b8734b4e763f55fb0142de68befa82acb8dcd3f))
* **ui:** unify view-control width, left-align title pill, refine TopBar ([68eb8aa](https://github.com/CortoMaltese3/riskwise-v2/commit/68eb8aafe7b0b9acab71ae2d2e8393a5fff2f1d2))
* **ui:** use max-based divisor and add per-bucket counts on impact legend ([#481](https://github.com/CortoMaltese3/riskwise-v2/issues/481)) ([ceb414c](https://github.com/CortoMaltese3/riskwise-v2/commit/ceb414c43bcdcb3cb34e661dad3e57eb85fda99d)), closes [#476](https://github.com/CortoMaltese3/riskwise-v2/issues/476)
* **ui:** wire Workspace Restore action and close restoreScenario state gaps ([#338](https://github.com/CortoMaltese3/riskwise-v2/issues/338)) ([3642493](https://github.com/CortoMaltese3/riskwise-v2/commit/3642493a43251fd0bc0aed213d9c04fd2666ffee)), closes [#329](https://github.com/CortoMaltese3/riskwise-v2/issues/329)
* update the manifest.json ([c6509f1](https://github.com/CortoMaltese3/riskwise-v2/commit/c6509f1333313ad676f4a3c835c6235e8dd8fdb3))


### Refactors

* **api,ui:** make adaptation-measure picker entity-driven ([492cc35](https://github.com/CortoMaltese3/riskwise-v2/commit/492cc3592ada8cac995040abfafebd2b9ed3178d))
* **api,ui:** unify selectedMeasureIds payload as array, never null ([#457](https://github.com/CortoMaltese3/riskwise-v2/issues/457)) ([ddd47d3](https://github.com/CortoMaltese3/riskwise-v2/commit/ddd47d336a3567564512046ae604b654d4e91109)), closes [#449](https://github.com/CortoMaltese3/riskwise-v2/issues/449)
* **api:** kill _dispatch_sync and inline run_*.py fetches into routers ([#507](https://github.com/CortoMaltese3/riskwise-v2/issues/507)) ([de51c74](https://github.com/CortoMaltese3/riskwise-v2/commit/de51c741fcf0e93f1d44bf7ccb2a8ab8c478cc32)), closes [#497](https://github.com/CortoMaltese3/riskwise-v2/issues/497)
* **api:** split app.py into per-domain routers ([#505](https://github.com/CortoMaltese3/riskwise-v2/issues/505)) ([fbb4e02](https://github.com/CortoMaltese3/riskwise-v2/commit/fbb4e027378427c3701cad8d3cb632b36f6915ef)), closes [#495](https://github.com/CortoMaltese3/riskwise-v2/issues/495)
* **api:** unify exposure into exposure_type + asset_type ([#321](https://github.com/CortoMaltese3/riskwise-v2/issues/321)) ([b488249](https://github.com/CortoMaltese3/riskwise-v2/commit/b488249d840e6aa0359b74c2c3dfb0efe67b8d40)), closes [#318](https://github.com/CortoMaltese3/riskwise-v2/issues/318)
* **backend:** decompose RunScenario into backend/scenario/ package ([#506](https://github.com/CortoMaltese3/riskwise-v2/issues/506)) ([56767b4](https://github.com/CortoMaltese3/riskwise-v2/commit/56767b4824f87b3a59d7cf4913a8f749578e5871)), closes [#496](https://github.com/CortoMaltese3/riskwise-v2/issues/496)
* **backend:** introduce status-code enum + shared base for run_*.py scripts ([#333](https://github.com/CortoMaltese3/riskwise-v2/issues/333)) ([115f8a7](https://github.com/CortoMaltese3/riskwise-v2/commit/115f8a7cfff7ead8298944fb03d6d291cb9d7839)), closes [#244](https://github.com/CortoMaltese3/riskwise-v2/issues/244)
* **backend:** migrate logger_config to structlog logging_config ([#336](https://github.com/CortoMaltese3/riskwise-v2/issues/336)) ([ea589a5](https://github.com/CortoMaltese3/riskwise-v2/commit/ea589a5d35d0bc19490f3c45d94ca4bb01a26f0b)), closes [#246](https://github.com/CortoMaltese3/riskwise-v2/issues/246)
* **ci:** replace zip-based first-run engine install with Nuitka onefile flow ([#485](https://github.com/CortoMaltese3/riskwise-v2/issues/485)) ([f3af0d1](https://github.com/CortoMaltese3/riskwise-v2/commit/f3af0d12602c2da6067abbff6b436bb581ade256)), closes [#420](https://github.com/CortoMaltese3/riskwise-v2/issues/420)
* **ui:** collapse exposure cards into a single Exposure card ([#323](https://github.com/CortoMaltese3/riskwise-v2/issues/323)) ([dac2fdf](https://github.com/CortoMaltese3/riskwise-v2/commit/dac2fdfabc0044b33b98596cdf277b4a5aff03be)), closes [#319](https://github.com/CortoMaltese3/riskwise-v2/issues/319)
* **ui:** decompose CREDDataSection into list/upload/delete sub-components ([#330](https://github.com/CortoMaltese3/riskwise-v2/issues/330)) ([a9cac1e](https://github.com/CortoMaltese3/riskwise-v2/commit/a9cac1e42dec7fa786b237e5302e0fbbfaf5c4d0)), closes [#240](https://github.com/CortoMaltese3/riskwise-v2/issues/240)
* **ui:** derive cardState during render in simple input cards ([#411](https://github.com/CortoMaltese3/riskwise-v2/issues/411)) ([1ff808d](https://github.com/CortoMaltese3/riskwise-v2/commit/1ff808d44b2ae797acbead9014554a0fd53d0308)), closes [#275](https://github.com/CortoMaltese3/riskwise-v2/issues/275)
* **ui:** extract ScenarioPrintView data hooks and pure utils ([#501](https://github.com/CortoMaltese3/riskwise-v2/issues/501)) ([3f1e701](https://github.com/CortoMaltese3/riskwise-v2/commit/3f1e7019ac532fb66182bbac1615b337753e658a)), closes [#491](https://github.com/CortoMaltese3/riskwise-v2/issues/491)
* **ui:** extract section components from ScenarioPrintView (A2) ([#502](https://github.com/CortoMaltese3/riskwise-v2/issues/502)) ([3c7ef53](https://github.com/CortoMaltese3/riskwise-v2/commit/3c7ef53be5565ad9745c3e7506314ce2fca17000)), closes [#492](https://github.com/CortoMaltese3/riskwise-v2/issues/492)
* **ui:** extract useListManager hook for settings cards ([#326](https://github.com/CortoMaltese3/riskwise-v2/issues/326)) ([f3cbb6c](https://github.com/CortoMaltese3/riskwise-v2/commit/f3cbb6ceecc16e12ace0b191e2598df8a108b34a)), closes [#235](https://github.com/CortoMaltese3/riskwise-v2/issues/235)
* **ui:** fold measure picker into Risk inputs, remove Apply button ([#460](https://github.com/CortoMaltese3/riskwise-v2/issues/460)) ([2705fad](https://github.com/CortoMaltese3/riskwise-v2/commit/2705fad9f9f9b7f2196e481493029b49fbf543f3)), closes [#451](https://github.com/CortoMaltese3/riskwise-v2/issues/451)
* **ui:** introduce TABS enum + config table for main tabs ([#339](https://github.com/CortoMaltese3/riskwise-v2/issues/339)) ([f2c0a3f](https://github.com/CortoMaltese3/riskwise-v2/commit/f2c0a3ff66c1330ba9ee84d5c2c9c40a87abdb1b)), closes [#249](https://github.com/CortoMaltese3/riskwise-v2/issues/249)
* **ui:** key adaptation-measure card state by row id ([#456](https://github.com/CortoMaltese3/riskwise-v2/issues/456)) ([30ad1e0](https://github.com/CortoMaltese3/riskwise-v2/commit/30ad1e0951e817ce3583fb9fd73fb85126a3e6e5)), closes [#447](https://github.com/CortoMaltese3/riskwise-v2/issues/447)
* **ui:** migrate AppShell to layout primitives ([#222](https://github.com/CortoMaltese3/riskwise-v2/issues/222)) ([508aaaf](https://github.com/CortoMaltese3/riskwise-v2/commit/508aaaf842499bb5b89783479f248138ea924f8e)), closes [#210](https://github.com/CortoMaltese3/riskwise-v2/issues/210)
* **ui:** migrate HomeView to layout primitives ([#231](https://github.com/CortoMaltese3/riskwise-v2/issues/231)) ([c0ba504](https://github.com/CortoMaltese3/riskwise-v2/commit/c0ba504860de0850e52ff51f81d94e657a043faa)), closes [#214](https://github.com/CortoMaltese3/riskwise-v2/issues/214)
* **ui:** migrate MacroeconomicView to layout primitives ([#227](https://github.com/CortoMaltese3/riskwise-v2/issues/227)) ([447617b](https://github.com/CortoMaltese3/riskwise-v2/commit/447617bbebe14ce7b9356119b8feb8f8ce249ead)), closes [#212](https://github.com/CortoMaltese3/riskwise-v2/issues/212)
* **ui:** migrate RiskAssessmentView to layout primitives ([#224](https://github.com/CortoMaltese3/riskwise-v2/issues/224)) ([474b363](https://github.com/CortoMaltese3/riskwise-v2/commit/474b363594e483aa59df0de61c95f98545347de9)), closes [#211](https://github.com/CortoMaltese3/riskwise-v2/issues/211)
* **ui:** migrate SettingsView to layout primitives ([#232](https://github.com/CortoMaltese3/riskwise-v2/issues/232)) ([6a1ded2](https://github.com/CortoMaltese3/riskwise-v2/commit/6a1ded236bd0dcd53b08707828afb453d227aef9)), closes [#215](https://github.com/CortoMaltese3/riskwise-v2/issues/215)
* **ui:** migrate WorkspaceView to layout primitives ([#230](https://github.com/CortoMaltese3/riskwise-v2/issues/230)) ([4df6342](https://github.com/CortoMaltese3/riskwise-v2/commit/4df63425b7019052dcd5e3d0acd0d3d595648cb7)), closes [#213](https://github.com/CortoMaltese3/riskwise-v2/issues/213)
* **ui:** normalise macro input cards on the 8.5 pattern ([#274](https://github.com/CortoMaltese3/riskwise-v2/issues/274)) ([cf1e3f8](https://github.com/CortoMaltese3/riskwise-v2/commit/cf1e3f8f192302576a3b7322eeae8b447344cd08)), closes [#265](https://github.com/CortoMaltese3/riskwise-v2/issues/265)
* **ui:** normalise scenario-input card height and DOM shape ([#234](https://github.com/CortoMaltese3/riskwise-v2/issues/234)) ([10619b5](https://github.com/CortoMaltese3/riskwise-v2/commit/10619b54c4cc24ceb8668d7313a1aadd6b59a00b)), closes [#216](https://github.com/CortoMaltese3/riskwise-v2/issues/216)
* **ui:** pin RUN and PLOT buttons to bottom of input column ([#276](https://github.com/CortoMaltese3/riskwise-v2/issues/276)) ([dc4978e](https://github.com/CortoMaltese3/riskwise-v2/commit/dc4978e9ef3a423c79d95a3ccff81194efa770fc)), closes [#266](https://github.com/CortoMaltese3/riskwise-v2/issues/266)
* **ui:** rationalize color tokens — semantic palette with light/dark parity ([#301](https://github.com/CortoMaltese3/riskwise-v2/issues/301)) ([80bff59](https://github.com/CortoMaltese3/riskwise-v2/commit/80bff593f845191a22e1a9213afe3d29df02bb50))
* **ui:** route map GeoJSON fetches through RiskWiseClient ([#327](https://github.com/CortoMaltese3/riskwise-v2/issues/327)) ([0736c41](https://github.com/CortoMaltese3/riskwise-v2/commit/0736c41f2cbd31d60963f9200b2c0c60914d1509)), closes [#236](https://github.com/CortoMaltese3/riskwise-v2/issues/236)
* **ui:** route ScenarioPrintView through RiskWiseClient ([#500](https://github.com/CortoMaltese3/riskwise-v2/issues/500)) ([ee87625](https://github.com/CortoMaltese3/riskwise-v2/commit/ee876253a2f0a0ab54aae80732245f27c32a5a56)), closes [#490](https://github.com/CortoMaltese3/riskwise-v2/issues/490)
* **ui:** route ScenarioPrintView types through OpenAPI schema ([#504](https://github.com/CortoMaltese3/riskwise-v2/issues/504)) ([3a49355](https://github.com/CortoMaltese3/riskwise-v2/commit/3a49355165205306642bf2b7d9b5b9c006c38489)), closes [#494](https://github.com/CortoMaltese3/riskwise-v2/issues/494)
* **ui:** show impact function and measures in the middle pane ([#461](https://github.com/CortoMaltese3/riskwise-v2/issues/461)) ([6fe6fe9](https://github.com/CortoMaltese3/riskwise-v2/commit/6fe6fe950ba4af48a9187fa2f697e25886a4b2c9))
* **ui:** split src/store.js into domain-focused Zustand stores ([#328](https://github.com/CortoMaltese3/riskwise-v2/issues/328)) ([f3ab0c0](https://github.com/CortoMaltese3/riskwise-v2/commit/f3ab0c0131759a60ed706bcc7d74594625cdaad0)), closes [#237](https://github.com/CortoMaltese3/riskwise-v2/issues/237)
* **ui:** tighten chart card layout and drop show-values toggle ([b417f64](https://github.com/CortoMaltese3/riskwise-v2/commit/b417f64615e38aaace659ff2d5dabf71dd6787d7))
* **ui:** type chart components so FiguresGrid can drop `as any` casts ([#503](https://github.com/CortoMaltese3/riskwise-v2/issues/503)) ([1dff088](https://github.com/CortoMaltese3/riskwise-v2/commit/1dff0882e792d2953831c0f10463ce43794a16b2)), closes [#493](https://github.com/CortoMaltese3/riskwise-v2/issues/493)
* **ui:** unify popup placement on centered Dialog ([#399](https://github.com/CortoMaltese3/riskwise-v2/issues/399)) ([f450e8b](https://github.com/CortoMaltese3/riskwise-v2/commit/f450e8b69670feb307047cbfd32aedbf31c04d14)), closes [#396](https://github.com/CortoMaltese3/riskwise-v2/issues/396)


### Documentation

* add Phase 10 plan — UI & logic enhancements ([22bcc5d](https://github.com/CortoMaltese3/riskwise-v2/commit/22bcc5d7962c345b13140f9a523410632a6b9c94)), closes [#443](https://github.com/CortoMaltese3/riskwise-v2/issues/443)
* align signing.md and DECISIONS.md with restored signing pipeline ([#512](https://github.com/CortoMaltese3/riskwise-v2/issues/512)) ([59b9f01](https://github.com/CortoMaltese3/riskwise-v2/commit/59b9f01bfd41e3666a85d792376bf7d702903255)), closes [#425](https://github.com/CortoMaltese3/riskwise-v2/issues/425)
* audit backend test coverage for six load-bearing modules ([#510](https://github.com/CortoMaltese3/riskwise-v2/issues/510)) ([be0c82f](https://github.com/CortoMaltese3/riskwise-v2/commit/be0c82f056d159b8a4206491d4d6cbd8c15affbe)), closes [#499](https://github.com/CortoMaltese3/riskwise-v2/issues/499)
* close documentation gaps (errors.md, CSP trade-off, D24 TODOs) ([#348](https://github.com/CortoMaltese3/riskwise-v2/issues/348)) ([3563dc9](https://github.com/CortoMaltese3/riskwise-v2/commit/3563dc93cd2c263c38d1703be4143901f67a2ee4)), closes [#260](https://github.com/CortoMaltese3/riskwise-v2/issues/260)
* close out Phase 10.3 (PDF report enhancements umbrella) ([7c31547](https://github.com/CortoMaltese3/riskwise-v2/commit/7c31547f61d5b93cc98f91e6cb23849fc538ea1b))
* **plan:** add Phase 8 UI layout architecture refinement ([12aac55](https://github.com/CortoMaltese3/riskwise-v2/commit/12aac55cb209d76047f40de694f9c15953c9c311))
* scope phase 10.2 impact-function visibility & customization ([78bdf75](https://github.com/CortoMaltese3/riskwise-v2/commit/78bdf75f8897882dec30cbceba23a97b70d29926)), closes [#444](https://github.com/CortoMaltese3/riskwise-v2/issues/444)
* **ui:** add splash loader design mockups for [#283](https://github.com/CortoMaltese3/riskwise-v2/issues/283) ([560db53](https://github.com/CortoMaltese3/riskwise-v2/commit/560db53d722cfc9733772832ccaa7625e129a024))
* warn contributors about phantom local v2.0.x tags ([#472](https://github.com/CortoMaltese3/riskwise-v2/issues/472)) ([3c53021](https://github.com/CortoMaltese3/riskwise-v2/commit/3c530216c78294650226767b9857440470ad8498)), closes [#416](https://github.com/CortoMaltese3/riskwise-v2/issues/416)


### Tests

* **backend:** extract cancellation + progress tests, pin checkpoint contract ([#511](https://github.com/CortoMaltese3/riskwise-v2/issues/511)) ([37ae6e6](https://github.com/CortoMaltese3/riskwise-v2/commit/37ae6e64316b9058478bf2ee4a50866e5766ec22)), closes [#509](https://github.com/CortoMaltese3/riskwise-v2/issues/509)
* **electron:** cover minisign blob parser error paths ([#513](https://github.com/CortoMaltese3/riskwise-v2/issues/513)) ([37f9e00](https://github.com/CortoMaltese3/riskwise-v2/commit/37f9e005df7dc1459523ec6d445d6ab94368a70b)), closes [#422](https://github.com/CortoMaltese3/riskwise-v2/issues/422)
* silence mypy arg-type on intentional None aag ([46e66cf](https://github.com/CortoMaltese3/riskwise-v2/commit/46e66cf45871561b833220c62513d5d2f12bd50e))


### Continuous Integration

* **build:** restore azureSignOptions in electron-builder.cjs ([#484](https://github.com/CortoMaltese3/riskwise-v2/issues/484)) ([898ee86](https://github.com/CortoMaltese3/riskwise-v2/commit/898ee86481fef77b4d0089bf24ea94d10cbd9243)), closes [#419](https://github.com/CortoMaltese3/riskwise-v2/issues/419)
* reduce GitHub Actions minute consumption ([29eada8](https://github.com/CortoMaltese3/riskwise-v2/commit/29eada8c48ba433258a1ee644557cb180da11f4c)), closes [#382](https://github.com/CortoMaltese3/riskwise-v2/issues/382)
* **release:** pass RELEASE_PLEASE_PAT so tag pushes fire release.yml ([#468](https://github.com/CortoMaltese3/riskwise-v2/issues/468)) ([f4f0747](https://github.com/CortoMaltese3/riskwise-v2/commit/f4f074754ab605447068806392c0b016546a5e80)), closes [#417](https://github.com/CortoMaltese3/riskwise-v2/issues/417)

## [1.1.0](https://github.com/CortoMaltese3/riskwise-v2/compare/v1.0.8...v1.1.0) (2026-05-04)


### Highlights

- Shareable scenario exports and provenance reports (`.riskwise-scenario`)
- New auto-update workflow with code-signed Windows installers
- Bundled portable Windows builds for offline distribution
- Typed TypeScript API client generated from OpenAPI
- FastAPI on loopback HTTP replaces stdin/stdout IPC


### Features

* Add CHANGELOG.md ([03ac2cd](https://github.com/CortoMaltese3/riskwise-v2/commit/03ac2cd630d0ea6c4efbd9e6728c1ca6e82b724f))
* Add new Application release workflow ([#21](https://github.com/CortoMaltese3/riskwise-v2/issues/21)) ([6085a20](https://github.com/CortoMaltese3/riskwise-v2/commit/6085a20ad6a248966c5c33b9e7b4a837af97d062))
* Add new CHANGELOG.md supporting versions up to v1.0.8 ([3db2a7f](https://github.com/CortoMaltese3/riskwise-v2/commit/3db2a7fc84e723d4459dc38344b6bdfd47e064f1))
* Add zipped portable editions to win distribution ([c353192](https://github.com/CortoMaltese3/riskwise-v2/commit/c353192c0e0ff14e9b2211011d78afe6b0ceb339))
* **api,ui:** .riskwise-scenario shareable export and provenance reports ([#144](https://github.com/CortoMaltese3/riskwise-v2/issues/144)) ([cca8b90](https://github.com/CortoMaltese3/riskwise-v2/commit/cca8b905a40f38f2fccffb7c9857f56389246cc6)), closes [#122](https://github.com/CortoMaltese3/riskwise-v2/issues/122)
* **api:** add Pydantic models and typed TS client generated from OpenAPI ([#35](https://github.com/CortoMaltese3/riskwise-v2/issues/35)) ([0a135f6](https://github.com/CortoMaltese3/riskwise-v2/commit/0a135f6d59a3bd4991df074c4ac7d52247c31d86)), closes [#13](https://github.com/CortoMaltese3/riskwise-v2/issues/13)
* **api:** replace stdin/stdout IPC with FastAPI on loopback HTTP ([#34](https://github.com/CortoMaltese3/riskwise-v2/issues/34)) ([9426b1a](https://github.com/CortoMaltese3/riskwise-v2/commit/9426b1ad59adb980f975ee0261cee3a4761c8e31)), closes [#11](https://github.com/CortoMaltese3/riskwise-v2/issues/11)
* **backend:** scaffold climate-lama-engine adapter (Phase 6 Track 1.1) ([#179](https://github.com/CortoMaltese3/riskwise-v2/issues/179)) ([b4098ec](https://github.com/CortoMaltese3/riskwise-v2/commit/b4098ec389a9605913710a39e8ff5e398d0d6361)), closes [#151](https://github.com/CortoMaltese3/riskwise-v2/issues/151)
* **ci:** activate Azure Trusted Signing for installer, engine, and updates ([#132](https://github.com/CortoMaltese3/riskwise-v2/issues/132)) ([1344d47](https://github.com/CortoMaltese3/riskwise-v2/commit/1344d47986d7ab9cff9eaf2f44679347313c6855)), closes [#118](https://github.com/CortoMaltese3/riskwise-v2/issues/118)
* **core:** add domain dataclasses for the engine adapter boundary ([#180](https://github.com/CortoMaltese3/riskwise-v2/issues/180)) ([b725235](https://github.com/CortoMaltese3/riskwise-v2/commit/b7252359aae64ccd948bd076eb7179dc1154831e)), closes [#152](https://github.com/CortoMaltese3/riskwise-v2/issues/152)
* **core:** add dual-backend selector to costben_handler ([#186](https://github.com/CortoMaltese3/riskwise-v2/issues/186)) ([781d9dc](https://github.com/CortoMaltese3/riskwise-v2/commit/781d9dcca84e8e7d8bcc93f589e6811279757aa9)), closes [#158](https://github.com/CortoMaltese3/riskwise-v2/issues/158)
* **core:** add dual-backend selector to exposure_handler ([#188](https://github.com/CortoMaltese3/riskwise-v2/issues/188)) ([e928df2](https://github.com/CortoMaltese3/riskwise-v2/commit/e928df20df28860c01a541aabdc4e9b8dadf14fe)), closes [#160](https://github.com/CortoMaltese3/riskwise-v2/issues/160)
* **core:** add dual-backend selector to hazard_handler ([#187](https://github.com/CortoMaltese3/riskwise-v2/issues/187)) ([2d082f1](https://github.com/CortoMaltese3/riskwise-v2/commit/2d082f12d0c01f40be5deaff739855621bc55db2)), closes [#159](https://github.com/CortoMaltese3/riskwise-v2/issues/159)
* **core:** add dual-backend selector to impact_handler ([#185](https://github.com/CortoMaltese3/riskwise-v2/issues/185)) ([4572ced](https://github.com/CortoMaltese3/riskwise-v2/commit/4572ced4f847afa2397ea39476a9960ae30f0651)), closes [#157](https://github.com/CortoMaltese3/riskwise-v2/issues/157)
* **core:** add engine entry point, bundling scripts, and build-engine CI ([#124](https://github.com/CortoMaltese3/riskwise-v2/issues/124)) ([c6e2c61](https://github.com/CortoMaltese3/riskwise-v2/commit/c6e2c618ea8a7ab7d0fdf8d426823a58bdd21d47)), closes [#113](https://github.com/CortoMaltese3/riskwise-v2/issues/113)
* **core:** add GeoTIFF hazard loader for the engine adapter boundary ([#183](https://github.com/CortoMaltese3/riskwise-v2/issues/183)) ([0c57c6b](https://github.com/CortoMaltese3/riskwise-v2/commit/0c57c6b883b3d9f292351ac75e94d566b70bb4cf)), closes [#154](https://github.com/CortoMaltese3/riskwise-v2/issues/154)
* **core:** add HDF5 hazard loader for the engine adapter boundary ([#182](https://github.com/CortoMaltese3/riskwise-v2/issues/182)) ([8316402](https://github.com/CortoMaltese3/riskwise-v2/commit/8316402bd7a035984c853b15bd416a8d34cbb193)), closes [#153](https://github.com/CortoMaltese3/riskwise-v2/issues/153)
* **core:** add LRU object cache, parquet sidecars, and DuckDB computation cache ([#95](https://github.com/CortoMaltese3/riskwise-v2/issues/95)) ([f0017b6](https://github.com/CortoMaltese3/riskwise-v2/commit/f0017b6792948cbb20c8cc88a13603e33ef61258)), closes [#83](https://github.com/CortoMaltese3/riskwise-v2/issues/83)
* **core:** add XLSX entity loader for the engine adapter boundary ([#184](https://github.com/CortoMaltese3/riskwise-v2/issues/184)) ([eba4319](https://github.com/CortoMaltese3/riskwise-v2/commit/eba43194b243420e97eee3b674ddbe52756340db)), closes [#155](https://github.com/CortoMaltese3/riskwise-v2/issues/155)
* **core:** custom country drop-in with namespace isolation and source labeling ([#68](https://github.com/CortoMaltese3/riskwise-v2/issues/68)) ([52247bb](https://github.com/CortoMaltese3/riskwise-v2/commit/52247bb6714c898f5e6cadae99d34f5729c05833)), closes [#56](https://github.com/CortoMaltese3/riskwise-v2/issues/56)
* **core:** dual-backend provenance schema + compute-side cleanups ([#190](https://github.com/CortoMaltese3/riskwise-v2/issues/190)) ([22f8393](https://github.com/CortoMaltese3/riskwise-v2/commit/22f8393c83d3a55b5b63bd9ca1f1e8b66f4fde4f)), closes [#162](https://github.com/CortoMaltese3/riskwise-v2/issues/162)
* **core:** emit EntityBundle from entity_handler under engine backend ([#189](https://github.com/CortoMaltese3/riskwise-v2/issues/189)) ([2142a9f](https://github.com/CortoMaltese3/riskwise-v2/commit/2142a9f38028fec132b5b14f363211ddb2b7448b)), closes [#161](https://github.com/CortoMaltese3/riskwise-v2/issues/161)
* **core:** flip default backend env var to engine ([#192](https://github.com/CortoMaltese3/riskwise-v2/issues/192)) ([d9d927c](https://github.com/CortoMaltese3/riskwise-v2/commit/d9d927c10a5a4062eb28c347f1bf175ec0cc4149)), closes [#164](https://github.com/CortoMaltese3/riskwise-v2/issues/164)
* **core:** migrate built-in adaptation measures into DuckDB ([#58](https://github.com/CortoMaltese3/riskwise-v2/issues/58)) ([#70](https://github.com/CortoMaltese3/riskwise-v2/issues/70)) ([6a3b701](https://github.com/CortoMaltese3/riskwise-v2/commit/6a3b701d72bb5023c51c3ef29affca786230bb6c))
* **core:** migrate built-in CRED dataset into DuckDB and serve macro chart from DB ([#69](https://github.com/CortoMaltese3/riskwise-v2/issues/69)) ([08a1fe0](https://github.com/CortoMaltese3/riskwise-v2/commit/08a1fe034ca3381032e929dc1ad96f434e6ed56f)), closes [#57](https://github.com/CortoMaltese3/riskwise-v2/issues/57)
* **core:** parallel GeoJSON generation and SSE partial-result streaming ([#96](https://github.com/CortoMaltese3/riskwise-v2/issues/96)) ([70df910](https://github.com/CortoMaltese3/riskwise-v2/commit/70df910c8fc3d39dc6e62b18e75c65410984bf97)), closes [#84](https://github.com/CortoMaltese3/riskwise-v2/issues/84)
* **core:** record scenario provenance and verify shipped data on startup ([#67](https://github.com/CortoMaltese3/riskwise-v2/issues/67)) ([98eb92c](https://github.com/CortoMaltese3/riskwise-v2/commit/98eb92c60d55958bfc67c3fb8c6cc4dc9bf51129)), closes [#55](https://github.com/CortoMaltese3/riskwise-v2/issues/55)
* **core:** swap impact registry to climate-lama-engine ([#181](https://github.com/CortoMaltese3/riskwise-v2/issues/181)) ([6ab57b2](https://github.com/CortoMaltese3/riskwise-v2/commit/6ab57b24535e77892b12acd5eb6677e21a7744fa)), closes [#156](https://github.com/CortoMaltese3/riskwise-v2/issues/156)
* **db:** add DuckDB data layer with startup migration runner ([#59](https://github.com/CortoMaltese3/riskwise-v2/issues/59)) ([162f220](https://github.com/CortoMaltese3/riskwise-v2/commit/162f22094957f9a78575de4b01759d2b4b8055a9)), closes [#48](https://github.com/CortoMaltese3/riskwise-v2/issues/48)
* Enhance application loading and engine setup ([f47824c](https://github.com/CortoMaltese3/riskwise-v2/commit/f47824cbd0c1dd28c12153a789fbb310a638c0b5))
* Enhance application loading and engine setup ([d94b3e8](https://github.com/CortoMaltese3/riskwise-v2/commit/d94b3e8d61f8a55d537a60ba8b0ee7d4498b6ad8))
* Enhance application loading and engine setup ([f335e66](https://github.com/CortoMaltese3/riskwise-v2/commit/f335e6632e85cc15bc9343903aa1eb3a093dc58c))
* full auto-update flow — release channels, consent UX, signed engine manifest ([#126](https://github.com/CortoMaltese3/riskwise-v2/issues/126)) ([a2b8ecd](https://github.com/CortoMaltese3/riskwise-v2/commit/a2b8ecd57ce6702cd1cf7f6d58cc5cb75f8750a4)), closes [#115](https://github.com/CortoMaltese3/riskwise-v2/issues/115)
* Improve installation and update process ([c564e1d](https://github.com/CortoMaltese3/riskwise-v2/commit/c564e1d78f552736c72c51508fc378b0c4e229f0))
* Make auto-update optional ([4a45c5f](https://github.com/CortoMaltese3/riskwise-v2/commit/4a45c5f19f8c3de7d052460e367d770f93338979))
* offline mode — toggle, MBTiles tile server, signed packs, installer variants ([#128](https://github.com/CortoMaltese3/riskwise-v2/issues/128)) ([cad2eb0](https://github.com/CortoMaltese3/riskwise-v2/commit/cad2eb0816008e7f28c8a3bcb973a09243f87abc)), closes [#116](https://github.com/CortoMaltese3/riskwise-v2/issues/116)
* process supervision, job isolation, and structured errors ([#36](https://github.com/CortoMaltese3/riskwise-v2/issues/36)) ([91a88c0](https://github.com/CortoMaltese3/riskwise-v2/commit/91a88c013ff5779bbb64301f3eac28173787eafb)), closes [#12](https://github.com/CortoMaltese3/riskwise-v2/issues/12)
* structured JSON logging with end-to-end request-ID correlation ([#37](https://github.com/CortoMaltese3/riskwise-v2/issues/37)) ([f59ff4c](https://github.com/CortoMaltese3/riskwise-v2/commit/f59ff4c0117fe19f8dc63018f10fc4c55df96f11)), closes [#17](https://github.com/CortoMaltese3/riskwise-v2/issues/17)
* **test:** add FastAPI integration + Playwright E2E suites ([#125](https://github.com/CortoMaltese3/riskwise-v2/issues/125)) ([03edc83](https://github.com/CortoMaltese3/riskwise-v2/commit/03edc8316469bffc9b392c65e55957ca3f922bf0)), closes [#114](https://github.com/CortoMaltese3/riskwise-v2/issues/114)
* **ui,api:** adaptation measures management panel ([#108](https://github.com/CortoMaltese3/riskwise-v2/issues/108)) ([a42c224](https://github.com/CortoMaltese3/riskwise-v2/commit/a42c224ee94fd2f0d80382920f9d6cd34f4a15ce)), closes [#92](https://github.com/CortoMaltese3/riskwise-v2/issues/92)
* **ui,api:** CRED dataset management panel ([#107](https://github.com/CortoMaltese3/riskwise-v2/issues/107)) ([55dbed0](https://github.com/CortoMaltese3/riskwise-v2/commit/55dbed049fcc286dba19d9b5b8ec133346d661fb)), closes [#91](https://github.com/CortoMaltese3/riskwise-v2/issues/91)
* **ui:** add first-run walkthrough and four guided scenario tours ([#104](https://github.com/CortoMaltese3/riskwise-v2/issues/104)) ([4b00c0c](https://github.com/CortoMaltese3/riskwise-v2/commit/4b00c0c32ee20e8dbf982705dd1cb5833dbc9b06)), closes [#88](https://github.com/CortoMaltese3/riskwise-v2/issues/88)
* **ui:** add skeleton states, progress overlay, and toast system ([#98](https://github.com/CortoMaltese3/riskwise-v2/issues/98)) ([cbacc5f](https://github.com/CortoMaltese3/riskwise-v2/commit/cbacc5f2e1419978ff33cd6b1c9dea2ea9d73d2d)), closes [#79](https://github.com/CortoMaltese3/riskwise-v2/issues/79)
* **ui:** ARIA landmarks, keyboard nav baseline, axe-core CI gate ([#102](https://github.com/CortoMaltese3/riskwise-v2/issues/102)) ([9c7f20f](https://github.com/CortoMaltese3/riskwise-v2/commit/9c7f20f2f7330a7be1e4048cfc6fe94755a86729)), closes [#85](https://github.com/CortoMaltese3/riskwise-v2/issues/85)
* **ui:** export diagnostics ZIP and opt-in Sentry crash reporting ([#138](https://github.com/CortoMaltese3/riskwise-v2/issues/138)) ([843cecd](https://github.com/CortoMaltese3/riskwise-v2/commit/843cecdd08a34885e6bc72a85fe7ba53f5b736e7)), closes [#119](https://github.com/CortoMaltese3/riskwise-v2/issues/119)
* **ui:** introduce ThemeProvider-driven design tokens ([#41](https://github.com/CortoMaltese3/riskwise-v2/issues/41)) ([59845d7](https://github.com/CortoMaltese3/riskwise-v2/commit/59845d707c0e6dba813b9d58aa7ad57e7c4c8161)), closes [#15](https://github.com/CortoMaltese3/riskwise-v2/issues/15)
* **ui:** locale-aware number/date formatters, plurals, RTL layout audit ([#103](https://github.com/CortoMaltese3/riskwise-v2/issues/103)) ([2b8112d](https://github.com/CortoMaltese3/riskwise-v2/commit/2b8112d8bc0af2549638328fab8593ae6949fc2c)), closes [#86](https://github.com/CortoMaltese3/riskwise-v2/issues/86)
* **ui:** non-color chart alternatives with pattern fills and data tables ([#97](https://github.com/CortoMaltese3/riskwise-v2/issues/97)) ([3112b6b](https://github.com/CortoMaltese3/riskwise-v2/commit/3112b6b777979a22250740c67fd6184c20cd834e)), closes [#87](https://github.com/CortoMaltese3/riskwise-v2/issues/87)
* **ui:** PDF export via webContents.printToPDF, remove Word dependencies ([#100](https://github.com/CortoMaltese3/riskwise-v2/issues/100)) ([ef5d6a2](https://github.com/CortoMaltese3/riskwise-v2/commit/ef5d6a2e75edb561085040961b00c7b037145a8f)), closes [#81](https://github.com/CortoMaltese3/riskwise-v2/issues/81)
* **ui:** render cost-benefit chart in Chart.js, drop matplotlib ([#64](https://github.com/CortoMaltese3/riskwise-v2/issues/64)) ([0e30aa1](https://github.com/CortoMaltese3/riskwise-v2/commit/0e30aa1ba1b78cdee888ea3c20e30a6169054d10)), closes [#53](https://github.com/CortoMaltese3/riskwise-v2/issues/53)
* **ui:** render waterfall chart in Chart.js, backend serves JSON ([#63](https://github.com/CortoMaltese3/riskwise-v2/issues/63)) ([ba5f07d](https://github.com/CortoMaltese3/riskwise-v2/commit/ba5f07d66d721c62cd24260b79733a3fdeb8b1a6)), closes [#52](https://github.com/CortoMaltese3/riskwise-v2/issues/52)
* **ui:** replace fixed tabs with sidebar navigation and top app bar ([#93](https://github.com/CortoMaltese3/riskwise-v2/issues/93)) ([aa45148](https://github.com/CortoMaltese3/riskwise-v2/commit/aa451480455f2b2bd3c0a56e9cd93a919b19a283)), closes [#77](https://github.com/CortoMaltese3/riskwise-v2/issues/77)
* **ui:** searchable in-app glossary and contextual parameter tooltips ([#105](https://github.com/CortoMaltese3/riskwise-v2/issues/105)) ([1cbd9e8](https://github.com/CortoMaltese3/riskwise-v2/commit/1cbd9e8d17d88a995094a849fa9d435262c51cbb)), closes [#89](https://github.com/CortoMaltese3/riskwise-v2/issues/89)
* **ui:** settings custom data panel with drag-and-drop country import ([#106](https://github.com/CortoMaltese3/riskwise-v2/issues/106)) ([635a5ec](https://github.com/CortoMaltese3/riskwise-v2/commit/635a5ec86832b60195c101a1cb5e52f1757e0aa9)), closes [#90](https://github.com/CortoMaltese3/riskwise-v2/issues/90)
* **ui:** workspace scenario list with search, filter, sort, inline rename ([#99](https://github.com/CortoMaltese3/riskwise-v2/issues/99)) ([b7ed3eb](https://github.com/CortoMaltese3/riskwise-v2/commit/b7ed3eb9190b9fce6544559285b22812446db373)), closes [#80](https://github.com/CortoMaltese3/riskwise-v2/issues/80)
* **ui:** workspace ZIP export/import for air-gapped migration ([#101](https://github.com/CortoMaltese3/riskwise-v2/issues/101)) ([93b5a7a](https://github.com/CortoMaltese3/riskwise-v2/commit/93b5a7a5c1c16f4e32efe193c505c2aeb6581bd3)), closes [#82](https://github.com/CortoMaltese3/riskwise-v2/issues/82)
* **workspace:** DuckDB-backed scenario save/restore with dialog ([#66](https://github.com/CortoMaltese3/riskwise-v2/issues/66)) ([6c639c4](https://github.com/CortoMaltese3/riskwise-v2/commit/6c639c40086595cd0f6bacba40b472bad8e2fe9b)), closes [#54](https://github.com/CortoMaltese3/riskwise-v2/issues/54)


### Bug Fixes

* Add explicit instruction to show detail pane ([2f017fd](https://github.com/CortoMaltese3/riskwise-v2/commit/2f017fdd6b015349a4e3a9a08d8ce8affd5b0625))
* Add support for bidirectional text ([#17](https://github.com/CortoMaltese3/riskwise-v2/issues/17)) ([d7cca31](https://github.com/CortoMaltese3/riskwise-v2/commit/d7cca318139938cee9b5208c99fb1d699e69c588))
* Add temporary workaround to electron-updater signature verification ([fd2f41a](https://github.com/CortoMaltese3/riskwise-v2/commit/fd2f41a3902f3ecee255b36ea6146f09bc39660f))
* Adjust the auto-update and download process ([9af57c9](https://github.com/CortoMaltese3/riskwise-v2/commit/9af57c92447d2081b79113b3dcc48c50d6f2ec8b))
* **ci:** declare @types/react as explicit devDependency ([4a98e57](https://github.com/CortoMaltese3/riskwise-v2/commit/4a98e57c61d9efafa44be37e0e8a741a5d063b59))
* **ci:** fix packaged build — rename builder config, include data/, fix null-origin CORS ([d1f206d](https://github.com/CortoMaltese3/riskwise-v2/commit/d1f206d0fa65559d4813d60bb2b8c141eef21922))
* **ci:** remove unused pywin dep and fix stale type: ignore comments for mypy ([c65b4bf](https://github.com/CortoMaltese3/riskwise-v2/commit/c65b4bfc733abcec10a1ff7da45dffc304bd0b73))
* **core:** guard None before float() in measures_seeder to satisfy mypy ([b2f8b17](https://github.com/CortoMaltese3/riskwise-v2/commit/b2f8b17df65effd9d4cb0f3cbed6323ab80c325d))
* **core:** preserve directory case when loading custom country configs ([ba694b5](https://github.com/CortoMaltese3/riskwise-v2/commit/ba694b5afec7ed712bb035570c24c23daca19487))
* **core:** resolve shipped-data root via sys.executable in bundles ([#199](https://github.com/CortoMaltese3/riskwise-v2/issues/199)) ([5af538a](https://github.com/CortoMaltese3/riskwise-v2/commit/5af538a99298287325511a677c8a2a7e9ad84d04)), closes [#196](https://github.com/CortoMaltese3/riskwise-v2/issues/196)
* **core:** root all backend imports at backend.X for python -m backend ([#198](https://github.com/CortoMaltese3/riskwise-v2/issues/198)) ([7038879](https://github.com/CortoMaltese3/riskwise-v2/commit/7038879f48339796da28c8443ba87cf03abfb6be)), closes [#195](https://github.com/CortoMaltese3/riskwise-v2/issues/195)
* **db:** rename cred_data.adpatation → adaptation via migration 0005 ([#109](https://github.com/CortoMaltese3/riskwise-v2/issues/109)) ([8758355](https://github.com/CortoMaltese3/riskwise-v2/commit/8758355f090139e846901af66e7dedf2e6d9a46b)), closes [#72](https://github.com/CortoMaltese3/riskwise-v2/issues/72)
* minor improvements ([67dc874](https://github.com/CortoMaltese3/riskwise-v2/commit/67dc874c3328dc7d5bb9d5ea4113e9fb1a81b9ce))
* regenerate the manifest to avoid errors ([8fd1ace](https://github.com/CortoMaltese3/riskwise-v2/commit/8fd1aced598870c05371479b49f84552301368d2))
* Remove autoUpdater feed URL ([82c19ed](https://github.com/CortoMaltese3/riskwise-v2/commit/82c19ed44cad978241c056c4fd582f5b3b18f402))
* Remove duplicate MUI_INSTFILESPAGE_COLORS definition ([93bfc8e](https://github.com/CortoMaltese3/riskwise-v2/commit/93bfc8e0a4c1afb9839ae153b7ce75c7f6bca295))
* Remove unnecessary include in installer script ([0803b45](https://github.com/CortoMaltese3/riskwise-v2/commit/0803b457ebfd36f9ddfdbdb224f1eaf8f3696a09))
* resolve CI issues ([e89c791](https://github.com/CortoMaltese3/riskwise-v2/commit/e89c791cb424773c0ede8daa330b605c79c44b38))
* resolve CI issues ([d0ffb91](https://github.com/CortoMaltese3/riskwise-v2/commit/d0ffb9158c7fa66958272cfd99e3b074ca63957f))
* resolve startup issues ([a312327](https://github.com/CortoMaltese3/riskwise-v2/commit/a3123271e3d77fd9e1450794699c25fcc0fd2684))
* resolve startup issues ([60e7ecc](https://github.com/CortoMaltese3/riskwise-v2/commit/60e7ecc7c60cf8c81bcf1e52c05cdfb985b7708b))
* **ui:** finish walkthrough on TARGET_NOT_FOUND and allow file: in connect-src ([3cde4be](https://github.com/CortoMaltese3/riskwise-v2/commit/3cde4be337ce8fcc10afaa8cf775fea30c4e09f3))
* **ui:** fix map tile 403 and GeoJSON fetch failure ([a192da6](https://github.com/CortoMaltese3/riskwise-v2/commit/a192da6ef20b327aa71f3b945c9832a9a2b4b867))
* **ui:** fix two CI frontend failures and npm audit vulns ([ae2f672](https://github.com/CortoMaltese3/riskwise-v2/commit/ae2f672a4c953bd79aad8a28f50b7a01e2fcca2f))
* **ui:** use named Joyride import for react-joyride v3 ([935408e](https://github.com/CortoMaltese3/riskwise-v2/commit/935408e3b563679ec60beeac6d8e8099ab9b43d9))


### Refactors

* **backend:** extract ERA constants to country configs and fix hazard_intensity_unit ([#60](https://github.com/CortoMaltese3/riskwise-v2/issues/60)) ([a27d272](https://github.com/CortoMaltese3/riskwise-v2/commit/a27d272576aa37ede6e1f8041c4c9e399b5a940d)), closes [#49](https://github.com/CortoMaltese3/riskwise-v2/issues/49)
* **core:** replace impact-function if/elif with config-driven registry ([#62](https://github.com/CortoMaltese3/riskwise-v2/issues/62)) ([a879265](https://github.com/CortoMaltese3/riskwise-v2/commit/a879265c0a07106d4efcb1a44ea04d308b411978)), closes [#51](https://github.com/CortoMaltese3/riskwise-v2/issues/51)
* **core:** unify ERA/custom scenario paths via strategy pattern ([#61](https://github.com/CortoMaltese3/riskwise-v2/issues/61)) ([26c670d](https://github.com/CortoMaltese3/riskwise-v2/commit/26c670db7a35f77cb3b82c3dbf81f63843db130b)), closes [#50](https://github.com/CortoMaltese3/riskwise-v2/issues/50)


### Documentation

* add D26 (climate-lama-engine adoption) and re-baseline bundling ADR §6 ([#176](https://github.com/CortoMaltese3/riskwise-v2/issues/176)) ([f0ff2c0](https://github.com/CortoMaltese3/riskwise-v2/commit/f0ff2c06c4596731717dcc1fb559a2fdf894f932))
* Add PLAN.md with Phase 0 readiness review and execution plan ([05428d3](https://github.com/CortoMaltese3/riskwise-v2/commit/05428d3fb0178c0c9fee678804e1582da6b88095))
* close Phase 6 documentation loop ([#205](https://github.com/CortoMaltese3/riskwise-v2/issues/205)) ([0dd35c4](https://github.com/CortoMaltese3/riskwise-v2/commit/0dd35c48c4374f4561c2cc7ff8877ce0b6b14e7b)), closes [#168](https://github.com/CortoMaltese3/riskwise-v2/issues/168)
* Expand ARCHITECTURE and DECISIONS with CRED pipeline, adaptation measures, determinism, cancellation, benchmarks, and session-start context ([4eaf1e4](https://github.com/CortoMaltese3/riskwise-v2/commit/4eaf1e469fd0877b26bc7a91d16ee13706b93678))
* **phase-0:** housekeeping — ADR for spike [#5](https://github.com/CortoMaltese3/riskwise-v2/issues/5), plan status, D12 amendment ([ab28e4b](https://github.com/CortoMaltese3/riskwise-v2/commit/ab28e4b0865a4596a9a6433ee815975092f1273e))
* **plan:** insert Phase 6 engine migration and renumber Phase 5 to 7 ([e484f59](https://github.com/CortoMaltese3/riskwise-v2/commit/e484f592bd746384c7ab89ed8f205bfa687c3b1b))
* **plan:** retire two-variant installer split for v2.0 (D25) ([#174](https://github.com/CortoMaltese3/riskwise-v2/issues/174)) ([71a6c42](https://github.com/CortoMaltese3/riskwise-v2/commit/71a6c4264da3298fa6fda7ae4547bcf3e416a63d))
* **reference:** record v2.0.0 online installer size; defer offline row ([#173](https://github.com/CortoMaltese3/riskwise-v2/issues/173)) ([1b58a09](https://github.com/CortoMaltese3/riskwise-v2/commit/1b58a094c93a33a436391c38d48c91a3fdd6472b))
* **spikes:** finalize [#150](https://github.com/CortoMaltese3/riskwise-v2/issues/150) — adopt notebook-08 as parity baseline ([#177](https://github.com/CortoMaltese3/riskwise-v2/issues/177)) ([2581062](https://github.com/CortoMaltese3/riskwise-v2/commit/2581062b7994764af6d15a45c09050eaa4145c85))


### Tests

* **core:** add integration parity suite for engine vs CLIMADA backends ([#191](https://github.com/CortoMaltese3/riskwise-v2/issues/191)) ([0a15f1e](https://github.com/CortoMaltese3/riskwise-v2/commit/0a15f1e2119ba3ad27637cbf810731952d2ffaab)), closes [#163](https://github.com/CortoMaltese3/riskwise-v2/issues/163)
* delete v1 CLIMADA-only handler tests ([#202](https://github.com/CortoMaltese3/riskwise-v2/issues/202)) ([a4db00d](https://github.com/CortoMaltese3/riskwise-v2/commit/a4db00d32e80aedb52204b627f9d365555d44bde)), closes [#167](https://github.com/CortoMaltese3/riskwise-v2/issues/167)


### Continuous Integration

* add duckdb+openpyxl to CI install and patch CVE deps ([5071cef](https://github.com/CortoMaltese3/riskwise-v2/commit/5071cef313d57875fafafec821aad8ac658624d9))
* add h5py + rasterio to pytest deps; disable flaky Electron E2E ([#200](https://github.com/CortoMaltese3/riskwise-v2/issues/200)) ([8c0bf76](https://github.com/CortoMaltese3/riskwise-v2/commit/8c0bf76b7027df58f4a12b189a4b4d1a82acda03))
* install libgdal-dev in pip-audit job for climada 6.x support ([012fe50](https://github.com/CortoMaltese3/riskwise-v2/commit/012fe505b331480518c2e6a3ca8ced8b5c500784))
* restore tests.yml with pull_request branch filter and e2e Dependabot skip ([2ce7afc](https://github.com/CortoMaltese3/riskwise-v2/commit/2ce7afcffc61b0ebe95d09630ed0696d9ca013ea))
* restrict pull_request trigger to main; skip e2e on Dependabot PRs ([1532ee2](https://github.com/CortoMaltese3/riskwise-v2/commit/1532ee2ab7b5a0b95aa2fe5fbfd7231278cb2eb6))

## [2.0.0-rc.1] - 2026-04-28

First release candidate for v2.0.0. Code-complete for Phases 0–4; the
remaining Phase 4 verifications (#146 Group B / C — VM installs for
SmartScreen + airplane mode + auto-update, NVDA smoke test, and
reference-hardware benchmarks) are deferred against this RC. The
final `[2.0.0]` section in this CHANGELOG will be generated by
`release-please` from the accumulated Conventional Commits when
v2.0.0 is cut, and will replace this RC entry.

Headline content of v2.0:

- **Phase 1** — FastAPI backbone, structured errors, MUI v7 theme tokens.
- **Phase 2** — DuckDB scenario store, frontend-only chart pipeline, scenario provenance.
- **Phase 3** — workspace UI, full i18n + RTL, accessibility baseline, help and onboarding.
- **Phase 4** — Nuitka-bundled Python engine, signed installer + auto-update with release channels, offline-mode runtime toggle, CycloneDX SBOM, NOTICES.txt generator, signed `.riskwise-pack` verification, Export Diagnostics + opt-in Sentry, WCAG 2.1 AA conformance, `.riskwise-scenario` shareable export, and the en/ar/th locale completeness CI gate.

Architectural decisions made on the way to RC.1 (full rationale in
[`docs/DECISIONS.md`](docs/DECISIONS.md)):

- **D24** — air-gapped deployment / offline installer variant deferred until a named customer; runtime offline toggle + signed-pack flow ship as planned.
- **D25** — single bundled installer for v2.0; the original two-variant `Online ≤ 150 MB` / `Offline ≤ 900 MB` split is retired. Measured installer size: 293.1 MB; ERA-data compression for v2.1+ tracked in #175.
- **D26** — `climate-lama-engine` adopted as the post-v2.0 runtime compute layer; cutover happens in Phase 6 against parity baseline `notebooks/08_climada_comparison.ipynb` in the engine repo.

What is **not** in RC.1 (deferred to a later RC or v2.0.x):

- Code signing activation (no cert yet, tracked in #130 — installer is unsigned for now).
- MBTiles tile pack publishing (#129).
- WCAG 2.1 AA follow-up verification (#143).
- First-run walkthrough re-appears bug (#137).
- VM verifications for SmartScreen, airplane-mode, and auto-update flow (#146 Group B / C).

## 1.0.8 - 2025-12-17

### Added

- Informative loader messages during application startup
- Progress indicators for engine download and installation
- Status updates for engine initialization and temporary file cleanup
- Automatic engine download and installation for portable version users
- Support for ZIP and 7Z portable distribution formats

### Changed

- Enhanced loading screen with real-time status updates
- Improved user feedback during engine setup process

### Fixed

- Loader window overflow and scrollbar issues
- Engine detection and installation flow for portable versions

## 1.0.7 - 2025-12-15

### Added

- Split application and engine installation process
- Separate engine installation to preserve user data across updates
- Reuse of downloaded engine archive to save bandwidth
- New Windows installation process with modular engine setup

### Changed

- Split application data into immutable and persistent paths
- Updated security and application dependencies

### Fixed

- Removed Windows code-sign disable flags to fix Electron icon fallback issue

## 1.0.6 - 2025-12-14

### Changed

- Split application and engine installation architecture

## 1.0.5 - 2025-12-13

### Added

- Centralized logging system with unified log directory
- Safer startup flow with comprehensive error handling
- Process-level safeguards for application lifecycle
- New application release workflow for GitHub Actions
- Updated `.gitignore` with environment and development exclusions

### Changed

- Redefined `electron.js` with improved backend lifecycle management
- Backend now uses `LOG_DIR` environment variable for unified logging
- Disabled code signing in `package.json` configuration
- Updated NSIS configuration to x64 architecture only

### Fixed

- Application startup reliability and error recovery
