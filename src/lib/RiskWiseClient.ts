// Typed wrapper around the Electron-mediated FastAPI loopback channel.
//
// Every method maps 1:1 to a backend endpoint, with request and response
// types pulled from the OpenAPI schema (`api-types.ts`). The shape returned
// to callers always matches the legacy `APIService` envelope —
// `{ success: true, result: <body> }` on 2xx, `{ success: false, error }` on
// failure — so call sites can be migrated piecemeal without rewriting the
// downstream consumers. ``error`` is the structured :class:`IpcError`
// envelope (``code``, ``message``, ``detail``, ``error_id``) coming from
// the backend's :class:`ErrorResponse` via the IPC bridge.

import type { components } from "./api-types";
import type { IpcResult } from "./electron";
import { newRequestId } from "./logger";

type Schema<K extends keyof components["schemas"]> = components["schemas"][K];

export type Status = Schema<"Status">;
export type HealthResponse = Schema<"HealthResponse">;
export type CountriesResponse = Schema<"CountriesResponse">;
export type DataValidateRequest = Schema<"DataValidateRequest">;
export type DataValidateResponse = Schema<"DataValidateResponse">;
export type Measure = Schema<"Measure">;
export type MeasuresResponse = Schema<"MeasuresResponse">;
export type MeasureSet = Schema<"MeasureSet">;
export type MeasureSetsResponse = Schema<"MeasureSetsResponse">;
export type MeasureSetUploadRequest = Schema<"MeasureSetUploadRequest">;
export type MeasureSetUploadResponse = Schema<"MeasureSetUploadResponse">;
export type MeasureSetDeleteResponse = Schema<"MeasureSetDeleteResponse">;
export type ScenarioRunRequest = Schema<"ScenarioRunRequest">;
export type JobAcceptedResponse = Schema<"JobAcceptedResponse">;
export type ScenarioWorkspaceItem = Schema<"ScenarioWorkspaceItem">;
export type ScenarioListResponse = Schema<"ScenarioListResponse">;
export type ScenarioDetailResponse = Schema<"ScenarioDetailResponse">;
export type ScenarioDetailPayload = Schema<"ScenarioDetailPayload">;
export type ExportReportRequest = Schema<"ExportReportRequest">;
export type ExportReportResponse = Schema<"ExportReportResponse">;
export type SaveScenarioRequest = Schema<"SaveScenarioRequest">;
export type SaveScenarioResponse = Schema<"SaveScenarioResponse">;
export type PatchScenarioRequest = Schema<"PatchScenarioRequest">;
export type DeleteScenarioResponse = Schema<"DeleteScenarioResponse">;
export type SnapshotItem = Schema<"SnapshotItem">;
export type SnapshotListResponse = Schema<"SnapshotListResponse">;
export type DeleteSnapshotResponse = Schema<"DeleteSnapshotResponse">;
export type CreateSnapshotRequest = Schema<"CreateSnapshotRequest">;
export type CreateSnapshotResponse = Schema<"CreateSnapshotResponse">;
export type UpdateSnapshotRequest = Schema<"UpdateSnapshotRequest">;
export type UpdateSnapshotResponse = Schema<"UpdateSnapshotResponse">;
export type MacroChartDataRequest = Schema<"MacroChartDataRequest">;
export type MacroChartDataResponse = Schema<"MacroChartDataResponse">;
export type MacroCredOutputResponse = Schema<"MacroCredOutputResponse">;
export type CredDataset = Schema<"CredDataset">;
export type CredDatasetsResponse = Schema<"CredDatasetsResponse">;
export type CredDatasetUploadRequest = Schema<"CredDatasetUploadRequest">;
export type CredDatasetUploadResponse = Schema<"CredDatasetUploadResponse">;
export type CredDatasetDeleteResponse = Schema<"CredDatasetDeleteResponse">;
export type TempClearResponse = Schema<"TempClearResponse">;
export type WaterfallResponse = Schema<"WaterfallResponse">;
export type WaterfallPayload = Schema<"WaterfallPayload">;
export type WaterfallCategory = Schema<"WaterfallCategory">;
export type CostBenefitResponse = Schema<"CostBenefitResponse">;
export type CostBenefitPayload = Schema<"CostBenefitPayload">;
export type CostBenefitMeasure = Schema<"CostBenefitMeasure">;
export type CustomDataValidateRequest = Schema<"CustomDataValidateRequest">;
export type CustomDataValidateResponse = Schema<"CustomDataValidateResponse">;
export type CustomDataImportRequest = Schema<"CustomDataImportRequest">;
export type CustomDataImportResponse = Schema<"CustomDataImportResponse">;
export type CustomDataListResponse = Schema<"CustomDataListResponse">;
export type CustomDataDeleteResponse = Schema<"CustomDataDeleteResponse">;
export type CustomCountryEntry = Schema<"CustomCountryEntry">;

const http = () => window.api.http;

// Every call mints a fresh UUID and passes it through preload → main →
// HTTP ``X-Request-ID`` so the backend logs and the main-process log share
// one correlation ID with the renderer-side log record for this call.
const get = <T>(path: string): Promise<IpcResult<T>> =>
  http().request<T>("GET", path, null, newRequestId());

const post = <T>(path: string, body: unknown): Promise<IpcResult<T>> =>
  http().request<T>("POST", path, body ?? {}, newRequestId());

const patch = <T>(path: string, body: unknown): Promise<IpcResult<T>> =>
  http().request<T>("PATCH", path, body ?? {}, newRequestId());

const del = <T>(path: string): Promise<IpcResult<T>> =>
  http().request<T>("DELETE", path, null, newRequestId());

// Fetch a GeoJSON document served by the main-process `app://` handler.
// Returned in the same `IpcResult` envelope as the rest of the client so
// callers don't need a parallel error-handling path for the map layers
// (architecture rule #3 — all backend access flows through the adapter).
const fetchGeoJson = async <T = unknown>(fileUrl: string): Promise<IpcResult<T>> => {
  const requestId = newRequestId();
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return {
        success: false,
        error: {
          code: "geojson_http_error",
          message: `HTTP error! status: ${response.status}`,
          detail: null,
          error_id: requestId,
          request_id: requestId,
        },
      };
    }
    const data = (await response.json()) as T;
    return { success: true, result: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: {
        code: "geojson_fetch_error",
        message,
        detail: message,
        error_id: requestId,
        request_id: requestId,
      },
    };
  }
};

const RiskWiseClient = {
  health: () => get<HealthResponse>("/api/v1/health"),

  fetchGeoJson,

  runScenario: (body: ScenarioRunRequest) => http().runScenario<unknown>(body, newRequestId()),

  cancelScenario: (jobId: string) => http().cancelScenario<unknown>(jobId, newRequestId()),

  validateData: (body: DataValidateRequest) =>
    post<DataValidateResponse>("/api/v1/data/validate", body),

  fetchAdaptationMeasures: (countryName: string, hazardType: string) =>
    get<MeasuresResponse>(
      `/api/v1/measures/${encodeURIComponent(countryName)}/${encodeURIComponent(hazardType)}`
    ),

  listScenarios: () => get<ScenarioListResponse>("/api/v1/scenarios"),

  getScenario: (id: string) =>
    get<ScenarioDetailResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}`),

  exportReport: (id: string, body: ExportReportRequest) =>
    post<ExportReportResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}/export`, body),

  // .riskwise-scenario shareable export/import (issue #122). The renderer
  // never touches the binary — Electron's main process opens the
  // save/open dialog and brokers the path-based handoff with the backend.
  exportScenarioBundle: (id: string) =>
    window.electron.exportScenario(id) as Promise<{
      success: boolean;
      filePath?: string;
      scenarioId?: string;
      reason?: string;
    }>,

  importScenarioBundle: () =>
    window.electron.importScenario() as Promise<{
      success: boolean;
      scenarioId?: string;
      name?: string;
      reason?: string;
    }>,

  saveScenario: (id: string, body: SaveScenarioRequest) =>
    post<SaveScenarioResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}/save`, body),

  patchScenario: (id: string, body: PatchScenarioRequest) =>
    patch<SaveScenarioResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}`, body),

  deleteScenario: (id: string) =>
    del<DeleteScenarioResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}`),

  listSnapshots: (scenarioId: string) =>
    get<SnapshotListResponse>(`/api/v1/scenarios/${encodeURIComponent(scenarioId)}/snapshots`),

  createSnapshot: (scenarioId: string, body: CreateSnapshotRequest) =>
    post<CreateSnapshotResponse>(
      `/api/v1/scenarios/${encodeURIComponent(scenarioId)}/snapshots`,
      body
    ),

  updateSnapshot: (snapshotId: string, body: UpdateSnapshotRequest) =>
    patch<UpdateSnapshotResponse>(`/api/v1/snapshots/${encodeURIComponent(snapshotId)}`, body),

  // Exposed as a string-builder rather than a fetcher because the drawer
  // consumes it via ``<img src>``: the browser then handles caching,
  // lazy-loading, and progressive decode for free.
  snapshotImageUrl: (snapshotId: string) =>
    `/api/v1/snapshots/${encodeURIComponent(snapshotId)}/image`,

  deleteSnapshot: (id: string) =>
    del<DeleteSnapshotResponse>(`/api/v1/snapshots/${encodeURIComponent(id)}`),

  fetchCREDOutput: (datasetId?: string | null) => {
    const qs = datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : "";
    return get<MacroCredOutputResponse>(`/api/v1/macro/cred-output${qs}`);
  },

  fetchMacroChartData: (body: MacroChartDataRequest) =>
    post<MacroChartDataResponse>("/api/v1/macro/chart-data", body),

  listCREDDatasets: () => get<CredDatasetsResponse>("/api/v1/macro/datasets"),

  uploadCREDDataset: (body: CredDatasetUploadRequest) =>
    post<CredDatasetUploadResponse>("/api/v1/macro/datasets", body),

  deleteCREDDataset: (id: string) =>
    del<CredDatasetDeleteResponse>(`/api/v1/macro/datasets/${encodeURIComponent(id)}`),

  listMeasureDatasets: () => get<MeasureSetsResponse>("/api/v1/measures/datasets"),

  uploadMeasureDataset: (body: MeasureSetUploadRequest) =>
    post<MeasureSetUploadResponse>("/api/v1/measures/datasets", body),

  deleteMeasureDataset: (id: string) =>
    del<MeasureSetDeleteResponse>(`/api/v1/measures/datasets/${encodeURIComponent(id)}`),

  fetchCountries: () => get<CountriesResponse>("/api/v1/countries"),

  fetchWaterfallData: () => get<WaterfallResponse>("/api/v1/scenario/waterfall"),

  fetchCostBenefitData: () => get<CostBenefitResponse>("/api/v1/scenario/cost-benefit"),

  clearTempDir: () => post<TempClearResponse>("/api/v1/temp/clear", {}),

  validateCustomDataPack: (body: CustomDataValidateRequest) =>
    post<CustomDataValidateResponse>("/api/v1/custom-data/validate", body),

  importCustomDataPack: (body: CustomDataImportRequest) =>
    post<CustomDataImportResponse>("/api/v1/custom-data/import", body),

  listCustomDataPacks: () => get<CustomDataListResponse>("/api/v1/custom-data"),

  deleteCustomDataPack: (iso3: string) =>
    del<CustomDataDeleteResponse>(`/api/v1/custom-data/${encodeURIComponent(iso3)}`),

  shutdown: () => {
    window.electron.shutdown();
  },

  minimize: () => {
    window.electron.minimize();
  },

  reload: () => {
    window.electron.reload();
  },
};

export default RiskWiseClient;
