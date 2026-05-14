import { useTranslation } from "react-i18next";

import L from "leaflet";
import "leaflet-simple-map-screenshoter";

import RiskWiseClient from "../lib/RiskWiseClient";
import useResultsStore from "../store/useResultsStore";
import useUIStore from "../store/useUIStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import { TABS } from "../components/main/tabs";

const captureMapBase64 = (map) =>
  new Promise((resolve, reject) => {
    const screenshoter = L.simpleMapScreenshoter().addTo(map);
    screenshoter
      .takeScreen("blob")
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
      .catch(reject);
  });

const captureChartBase64 = (chartInstance) => {
  if (!chartInstance || typeof chartInstance.toBase64Image !== "function") {
    return Promise.reject(new Error("Chart instance not ready for snapshot."));
  }
  return Promise.resolve(chartInstance.toBase64Image("image/png", 1).split(",")[1]);
};

const captureToScenario = async ({ scenarioId, snapshotType, base64, surface }) => {
  // ``surface`` is the originating UI domain (#362). The backend accepts it
  // as optional so legacy callers stay valid, but every code path in this
  // module now passes it so the snapshot can be routed into the correct
  // PDF section later. Undefined surfaces are dropped from the body to keep
  // the JSON minimal and avoid sending ``surface: undefined``.
  const body = {
    snapshot_type: snapshotType,
    image_base64: base64,
  };
  if (surface) {
    body.surface = surface;
  }
  const response = await RiskWiseClient.createSnapshot(scenarioId, body);
  if (!(response?.success && response.result?.status?.code === 2000)) {
    throw new Error(response?.error?.message || "Snapshot save failed");
  }
  return response.result.data;
};

export { captureMapBase64, captureChartBase64, captureToScenario };

export const useMapTools = () => {
  const { t } = useTranslation();
  const activeMap = useUIStore((s) => s.activeMap);
  const activeMapRef = useUIStore((s) => s.activeMapRef);
  const activeViewControl = useUIStore((s) => s.activeViewControl);
  const addReport = useUIStore((s) => s.addReport);
  const reports = useUIStore((s) => s.reports);
  const selectedReport = useUIStore((s) => s.selectedReport);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const setAlertMessage = useUIStore((s) => s.setAlertMessage);
  const setAlertSeverity = useUIStore((s) => s.setAlertSeverity);
  const setAlertShowMessage = useUIStore((s) => s.setAlertShowMessage);
  const waterfallChartRef = useUIStore((s) => s.waterfallChartRef);
  const costBenefitChartRef = useUIStore((s) => s.costBenefitChartRef);
  const isScenarioRunCompleted = useResultsStore((s) => s.isScenarioRunCompleted);
  const scenarioRunCode = useWorkspaceStore((s) => s.scenarioRunCode);
  const selectedAnnualGrowth = useWorkspaceStore((s) => s.selectedAnnualGrowth);
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedExposure = useWorkspaceStore((s) => s.selectedExposure);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedScenario = useWorkspaceStore((s) => s.selectedScenario);
  const selectedTimeHorizon = useWorkspaceStore((s) => s.selectedTimeHorizon);

  const saveBase64Screenshot = (base64data, filePath) => {
    return new Promise((resolve, reject) => {
      window.electron.saveScreenshot(base64data, filePath);
      // Listen for the save screenshot response
      window.electron.onSaveScreenshotReply((event, { success, error, filePath }) => {
        if (success) {
          setAlertMessage(`${t("alert_message_successful_screenshot")}::${filePath}`);
          setAlertSeverity("success");
          setAlertShowMessage(true);
          resolve(filePath); // Resolve the promise with the file path on success
        } else {
          setAlertMessage(`${t("alert_message_error_screenshot")}: ${error}`);
          setAlertSeverity("error");
          setAlertShowMessage(true);
          reject(new Error(error)); // Reject the promise on error
        }
      });
    });
  };

  const takeScreenshot = (map, filePath) => {
    return new Promise((resolve, reject) => {
      const screenshoter = L.simpleMapScreenshoter().addTo(map);
      screenshoter
        .takeScreen("blob")
        .then((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result.split(",")[1];
            saveBase64Screenshot(base64data, filePath).then(resolve).catch(reject);
          };
          reader.readAsDataURL(blob);
        })
        .catch((e) => {
          console.error(e);
          reject(e); // Reject the promise if an error occurs
        });
    });
  };

  const takeChartScreenshot = (chartInstance, filePath) => {
    if (!chartInstance || typeof chartInstance.toBase64Image !== "function") {
      return Promise.reject(new Error("Chart instance not ready for snapshot."));
    }
    const dataUrl = chartInstance.toBase64Image("image/png", 1);
    const base64data = dataUrl.split(",")[1];
    return saveBase64Screenshot(base64data, filePath);
  };

  const handleAddToOutput = () => {
    const isReportExisting = reportExists(selectedReport?.id);
    // Restored scenario (already exists)
    if (selectedReport && isReportExisting) {
      setAlertMessage(t("alert_message_report_available"));
      setAlertSeverity("info");
      setAlertShowMessage(true);
    }
    // Not selected restored scenario and no new scenario run
    if (!selectedReport && !isScenarioRunCompleted) {
      setAlertMessage(t("alert_message_select_report"));
      setAlertSeverity("error");
      setAlertShowMessage(true);
    }
  };

  const getSaveMapTitle = () => {
    let title = "";
    if (activeMap === "hazard") {
      title = `${t(`results_report_card_hazard_type_${activeMap}`)} ${t(
        "map_legend_legacy_title_map_suffix"
      )} ${t("map_legend_legacy_title_of_suffix")} ${t(
        `results_report_card_hazard_${selectedHazard}`
      )} ${t("map_legend_legacy_title_in_suffix")} ${t(
        `results_report_card_country_${selectedCountry}`
      )}`;
    } else if (activeMap === "exposure") {
      title = `${t(`results_report_card_hazard_type_${activeMap}`)} ${t(
        "map_legend_legacy_title_map_suffix"
      )} ${t("map_legend_legacy_title_of_suffix")} ${t(
        `results_report_card_exposure_${selectedExposure}`
      )} ${t("map_legend_legacy_title_in_suffix")} ${t(
        `results_report_card_country_${selectedCountry}`
      )}`;
    } else {
      title = `${t(`results_report_card_hazard_type_${activeMap}`)} ${t(
        "map_legend_legacy_title_map_suffix"
      )} ${t("map_legend_legacy_title_of_suffix")} ${t(
        `results_report_card_hazard_${selectedHazard}`
      )} ${t("map_legend_legacy_title_on_suffix")} ${t(
        `results_report_card_exposure_${selectedExposure}`
      )} ${t("map_legend_legacy_title_in_suffix")} ${t(
        `results_report_card_country_${selectedCountry}`
      )}`;
    }

    return title;
  };

  const handleSaveMap = async () => {
    const reportPath = await window.electron.fetchReportDir();

    if (!selectedReport) {
      setAlertMessage(t("alert_message_select_report"));
      setAlertSeverity("error");
      setAlertShowMessage(true);
    }
    if (isScenarioRunCompleted || selectedReport) {
      const id = new Date().getTime().toString();
      const filepath = `${reportPath}\\${scenarioRunCode}\\snapshot_${activeMap}_map_data_${id}.png`;
      takeScreenshot(activeMapRef, filepath)
        .then(() => {
          const outputData = {
            id: id,
            scenarioId: `${scenarioRunCode}`,
            data: `${selectedCountry} - ${selectedHazard} - ${selectedScenario} - ${selectedExposure} - ${selectedTimeHorizon} - ${selectedAnnualGrowth}`,
            image: filepath,
            title: getSaveMapTitle(),
            type: `${activeMap}_map_data`,
          };
          addReport(outputData);
        })
        .catch((error) => {
          console.error("Error in taking screenshot or saving it:", error);
        });
    }
  };

  const copyFolderToTemp = (sourceFolder) => {
    return new Promise((resolve, reject) => {
      // Get the temp folder path first
      window.electron.fetchTempDir().then((tempFolder) => {
        const destinationFolder = `${tempFolder}`;

        // Invoke folder copy
        window.electron.copyFolder(sourceFolder, destinationFolder);

        // Listen for the response
        window.electron.onCopyFolderReply((event, { success, error, destinationFolder }) => {
          if (success) {
            resolve(destinationFolder); // Resolve the promise on success
          } else {
            reject(new Error(error)); // Reject the promise on error
          }
        });
      });
    });
  };

  const reportExists = (reportId) => {
    return reports.some((r) => r && r.id === reportId);
  };

  const handleSaveImage = async () => {
    const reportPath = await window.electron.fetchReportDir();

    if (!selectedReport) {
      setAlertMessage(t("alert_message_select_report"));
      setAlertSeverity("error");
      setAlertShowMessage(true);
    }

    const onChart = activeViewControl === "display_chart";
    const isWaterfall = onChart && selectedTab === TABS.RISK;
    const isCostBenefit = onChart && selectedTab === TABS.ADAPTATION;

    if ((isScenarioRunCompleted || selectedReport) && isWaterfall) {
      const id = new Date().getTime().toString();
      const destinationFile = `${reportPath}\\${scenarioRunCode}\\snapshot_risk_plot_data_${id}.png`;

      takeChartScreenshot(waterfallChartRef, destinationFile)
        .then(() => {
          const outputData = {
            id: id,
            scenarioId: `${scenarioRunCode}`,
            data: `${selectedCountry} - ${selectedHazard} - ${selectedScenario} - ${selectedExposure} - ${selectedTimeHorizon} - ${selectedAnnualGrowth}`,
            image: destinationFile,
            title: `${t("results_report_card_risk_plot_title")} ${t(
              `results_report_card_hazard_${selectedHazard}`
            )}${t("map_legend_legacy_title_on_suffix")} ${t(
              `results_report_card_exposure_${selectedExposure}`
            )} - ${t(`results_report_card_country_${selectedCountry}`)}`,
            type: "risk_plot_data",
          };
          addReport(outputData);
        })
        .catch((error) => {
          console.error("Error while trying to save the Risk plot. More info:", error);
        });
    }

    if ((isScenarioRunCompleted || selectedReport) && isCostBenefit) {
      const id = new Date().getTime().toString();
      const destinationFile = `${reportPath}\\${scenarioRunCode}\\snapshot_adaptation_plot_data_${id}.png`;

      takeChartScreenshot(costBenefitChartRef, destinationFile)
        .then(() => {
          const outputData = {
            id: id,
            scenarioId: `${scenarioRunCode}`,
            data: `${selectedCountry} - ${selectedHazard} - ${selectedScenario} - ${selectedExposure} - ${selectedTimeHorizon} - ${selectedAnnualGrowth}`,
            image: destinationFile,
            title: `${t("results_report_card_adaptation_plot_title")} ${t(
              `results_report_card_hazard_${selectedHazard}`
            )} - ${t(`results_report_card_country_${selectedCountry}`)}`,
            type: "adaptation_plot_data",
          };
          addReport(outputData);
        })
        .catch((error) => {
          console.error(
            "Error while trying to save the Adaptation measures plot. More info:",
            error
          );
        });
    }
  };

  // Capture the active surface (map / waterfall / cost-benefit chart) and
  // POST the bytes to ``/scenarios/{id}/snapshots``. The backend flips the
  // parent scenario's ``saved`` flag (#302) so captured snapshots cannot be
  // GC'd with the unsaved row. Caller surfaces success/failure via the
  // existing alert pipeline; on success it triggers a workspace refresh
  // so the expand-row picks up the new entry.
  const handleCaptureSnapshot = async () => {
    if (!scenarioRunCode || !isScenarioRunCompleted) return null;
    try {
      let base64;
      let snapshotType;
      // ``surface`` records the originating UI domain (#362) so the PDF
      // report can route each snapshot into the right section. For maps we
      // read ``activeMap`` (hazard / exposure / impact); the two chart
      // surfaces map to fixed domains (waterfall -> impact, cost-benefit ->
      // adaptation) so we do not need a UI state lookup for them.
      let surface;
      const onChart = activeViewControl === "display_chart";
      const isWaterfall = onChart && selectedTab === TABS.RISK;
      const isCostBenefit = onChart && selectedTab === TABS.ADAPTATION;
      if (activeViewControl === "display_map") {
        base64 = await captureMapBase64(activeMapRef);
        snapshotType = "map";
        surface = activeMap;
      } else if (isWaterfall) {
        base64 = await captureChartBase64(waterfallChartRef);
        snapshotType = "waterfall";
        surface = "impact";
      } else if (isCostBenefit) {
        base64 = await captureChartBase64(costBenefitChartRef);
        snapshotType = "cost_benefit";
        surface = "adaptation";
      } else {
        return null;
      }
      const data = await captureToScenario({
        scenarioId: scenarioRunCode,
        snapshotType,
        base64,
        surface,
      });
      setAlertMessage(t("alert_message_snapshot_saved"));
      setAlertSeverity("success");
      setAlertShowMessage(true);
      // Refresh the workspace so the (possibly newly-saved) scenario row and
      // its snapshot drawer pick up the new entry without a manual reload.
      useWorkspaceStore.getState().loadScenarios({ force: true });
      return data;
    } catch (err) {
      setAlertMessage(`${t("alert_message_snapshot_failed")}: ${err?.message || err}`);
      setAlertSeverity("error");
      setAlertShowMessage(true);
      return null;
    }
  };

  return {
    copyFolderToTemp,
    handleAddToOutput,
    handleCaptureSnapshot,
    handleSaveImage,
    handleSaveMap,
  };
};
