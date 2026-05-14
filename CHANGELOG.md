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

## [1.1.0](https://github.com/CortoMaltese3/riskwise-v2/compare/v1.0.8...v1.1.0) (2026-05-04)


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
