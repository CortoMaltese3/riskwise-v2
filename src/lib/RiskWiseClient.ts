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
export type MeasuresResponse = Schema<"MeasuresResponse">;
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
export type DeleteScenarioResponse = Schema<"DeleteScenarioResponse">;
export type MacroChartDataRequest = Schema<"MacroChartDataRequest">;
export type MacroChartDataResponse = Schema<"MacroChartDataResponse">;
export type MacroCredOutputResponse = Schema<"MacroCredOutputResponse">;
export type TempClearResponse = Schema<"TempClearResponse">;
export type WaterfallResponse = Schema<"WaterfallResponse">;
export type WaterfallPayload = Schema<"WaterfallPayload">;
export type WaterfallCategory = Schema<"WaterfallCategory">;
export type CostBenefitResponse = Schema<"CostBenefitResponse">;
export type CostBenefitPayload = Schema<"CostBenefitPayload">;
export type CostBenefitMeasure = Schema<"CostBenefitMeasure">;

const http = () => window.api.http;

// Every call mints a fresh UUID and passes it through preload → main →
// HTTP ``X-Request-ID`` so the backend logs and the main-process log share
// one correlation ID with the renderer-side log record for this call.
const get = <T>(path: string): Promise<IpcResult<T>> =>
  http().request<T>("GET", path, null, newRequestId());

const post = <T>(path: string, body: unknown): Promise<IpcResult<T>> =>
  http().request<T>("POST", path, body ?? {}, newRequestId());

const del = <T>(path: string): Promise<IpcResult<T>> =>
  http().request<T>("DELETE", path, null, newRequestId());

const RiskWiseClient = {
  health: () => get<HealthResponse>("/api/v1/health"),

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

  saveScenario: (id: string, body: SaveScenarioRequest) =>
    post<SaveScenarioResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}/save`, body),

  deleteScenario: (id: string) =>
    del<DeleteScenarioResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}`),

  fetchCREDOutput: () => get<MacroCredOutputResponse>("/api/v1/macro/cred-output"),

  fetchMacroChartData: (body: MacroChartDataRequest) =>
    post<MacroChartDataResponse>("/api/v1/macro/chart-data", body),

  fetchCountries: () => get<CountriesResponse>("/api/v1/countries"),

  fetchWaterfallData: () => get<WaterfallResponse>("/api/v1/scenario/waterfall"),

  fetchCostBenefitData: () => get<CostBenefitResponse>("/api/v1/scenario/cost-benefit"),

  clearTempDir: () => post<TempClearResponse>("/api/v1/temp/clear", {}),

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
