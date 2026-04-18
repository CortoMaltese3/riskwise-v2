const http = () => window.api.http;

const get = (path) => http().request("GET", path, null);
const post = (path, body) => http().request("POST", path, body ?? {});
const del = (path) => http().request("DELETE", path, null);

export default class APIService {
  static async Run(body) {
    try {
      return await http().runScenario(body);
    } catch (error) {
      console.log(error);
    }
  }

  static async CheckDataType(body) {
    try {
      return await post("/api/v1/data/validate", body);
    } catch (error) {
      console.log(error);
    }
  }

  static async FetchAdaptationMeasures(body) {
    try {
      const country = encodeURIComponent(body?.countryName ?? "");
      const hazard = encodeURIComponent(body?.hazardType ?? "");
      return await get(`/api/v1/measures/${country}/${hazard}`);
    } catch (error) {
      console.log(error);
    }
  }

  static async FetchMacroEconomicChartData(body) {
    try {
      return await post("/api/v1/macro/chart-data", body);
    } catch (error) {
      console.log(error);
    }
  }

  static async FetchCREDOutputData() {
    try {
      return await get("/api/v1/macro/cred-output");
    } catch (error) {
      console.log(error);
    }
  }

  static async FetchReports() {
    try {
      return await get("/api/v1/scenarios");
    } catch (error) {
      console.log(error);
    }
  }

  static async Shutdown() {
    try {
      return await window.electron.send("shutdown");
    } catch (error) {
      console.log(error);
    }
  }

  static async Minimize() {
    try {
      return await window.electron.send("minimize");
    } catch (error) {
      console.log(error);
    }
  }

  static async Refresh() {
    try {
      return await window.electron.send("reload");
    } catch (error) {
      console.log(error);
    }
  }

  static async AddToOutput(scenarioRunCode) {
    try {
      const id = encodeURIComponent(scenarioRunCode ?? "");
      return await post(`/api/v1/scenarios/${id}/save`, {});
    } catch (error) {
      console.log(error);
    }
  }

  static async ExportReport(body) {
    try {
      const id = encodeURIComponent(body?.scenarioRunCode ?? "");
      return await post(`/api/v1/scenarios/${id}/export`, body);
    } catch (error) {
      console.log(error);
    }
  }

  static async RemoveReport(body) {
    try {
      const report = body?.report ?? {};
      const id = encodeURIComponent(report.id ?? "");
      const params = new URLSearchParams();
      if (report.type) params.set("report_type", report.type);
      if (report.image) params.set("image", report.image);
      const qs = params.toString();
      return await del(`/api/v1/scenarios/${id}${qs ? `?${qs}` : ""}`);
    } catch (error) {
      console.log(error);
    }
  }
}
