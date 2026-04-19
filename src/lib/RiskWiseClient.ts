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
export type ReportListResponse = Schema<"ReportListResponse">;
export type ReportResponse = Schema<"ReportResponse">;
export type ReportItem = Schema<"ReportItem">;
export type ExportReportRequest = Schema<"ExportReportRequest">;
export type ExportReportResponse = Schema<"ExportReportResponse">;
export type SaveScenarioResponse = Schema<"SaveScenarioResponse">;
export type DeleteReportResponse = Schema<"DeleteReportResponse">;
export type MacroChartDataRequest = Schema<"MacroChartDataRequest">;
export type MacroChartDataResponse = Schema<"MacroChartDataResponse">;
export type MacroCredOutputResponse = Schema<"MacroCredOutputResponse">;
export type TempClearResponse = Schema<"TempClearResponse">;

export type DeleteReportQuery = {
  reportType?: string;
  image?: string | null;
};

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

const buildDeleteScenarioPath = (id: string, query: DeleteReportQuery = {}): string => {
  const params = new URLSearchParams();
  if (query.reportType) params.set("report_type", query.reportType);
  if (query.image) params.set("image", query.image);
  const qs = params.toString();
  return `/api/v1/scenarios/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
};

const RiskWiseClient = {
  health: () => get<HealthResponse>("/api/v1/health"),

  runScenario: (body: ScenarioRunRequest) => http().runScenario<unknown>(body, newRequestId()),

  cancelScenario: (jobId: string) => http().cancelScenario<unknown>(jobId, newRequestId()),

  validateData: (body: DataValidateRequest) =>
    post<DataValidateResponse>("/api/v1/data/validate", body),

  fetchAdaptationMeasures: (countryName: string, hazardType: string) =>
    get<MeasuresResponse>(
      `/api/v1/measures/${encodeURIComponent(countryName)}/${encodeURIComponent(hazardType)}`,
    ),

  fetchReports: () => get<ReportListResponse>("/api/v1/scenarios"),

  getReport: (id: string) => get<ReportResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}`),

  exportReport: (id: string, body: ExportReportRequest) =>
    post<ExportReportResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}/export`, body),

  saveScenario: (id: string) =>
    post<SaveScenarioResponse>(`/api/v1/scenarios/${encodeURIComponent(id)}/save`, {}),

  removeReport: (id: string, query: DeleteReportQuery = {}) =>
    del<DeleteReportResponse>(buildDeleteScenarioPath(id, query)),

  fetchCREDOutput: () => get<MacroCredOutputResponse>("/api/v1/macro/cred-output"),

  fetchMacroChartData: (body: MacroChartDataRequest) =>
    post<MacroChartDataResponse>("/api/v1/macro/chart-data", body),

  fetchCountries: () => get<CountriesResponse>("/api/v1/countries"),

  clearTempDir: () => post<TempClearResponse>("/api/v1/temp/clear", {}),

  shutdown: () => {
    window.electron.send("shutdown");
  },

  minimize: () => {
    window.electron.send("minimize");
  },

  reload: () => {
    window.electron.send("reload");
  },
};

export default RiskWiseClient;
