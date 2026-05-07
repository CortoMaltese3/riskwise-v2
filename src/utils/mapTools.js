import { useTranslation } from "react-i18next";

import L from "leaflet";
import "leaflet-simple-map-screenshoter";

import RiskWiseClient from "../lib/RiskWiseClient";
import useStore from "../store";
import useWorkspaceStore from "../store/workspaceSlice";

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

const captureToScenario = async ({ scenarioId, snapshotType, base64 }) => {
  const response = await RiskWiseClient.createSnapshot(scenarioId, {
    snapshot_type: snapshotType,
    image_base64: base64,
  });
  if (!(response?.success && response.result?.status?.code === 2000)) {
    throw new Error(response?.error?.message || "Snapshot save failed");
  }
  return response.result.data;
};

export { captureMapBase64, captureChartBase64, captureToScenario };

export const useMapTools = () => {
  const { t } = useTranslation();
  const {
    activeMap,
    activeMapRef,
    activeViewControl,
    addReport,
    isScenarioRunCompleted,
    reports,
    scenarioRunCode,
    setAlertMessage,
    setAlertSeverity,
    setAlertShowMessage,
    selectedAnnualGrowth,
    selectedCountry,
    selectedExposureEconomic,
    selectedExposureNonEconomic,
    selectedHazard,
    selectedReport,
    selectedScenario,
    selectedSubTab,
    selectedTimeHorizon,
    waterfallChartRef,
    costBenefitChartRef,
  } = useStore();

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
      )} ${t("map_legend_legacy_title_of_suffix")} ${
        selectedExposureEconomic
          ? t(`results_report_card_exposure_${selectedExposureEconomic}`)
          : t(`results_report_card_exposure_${selectedExposureNonEconomic}`)
      } ${t("map_legend_legacy_title_in_suffix")} ${t(
        `results_report_card_country_${selectedCountry}`
      )}`;
    } else {
      title = `${t(`results_report_card_hazard_type_${activeMap}`)} ${t(
        "map_legend_legacy_title_map_suffix"
      )} ${t("map_legend_legacy_title_of_suffix")} ${t(
        `results_report_card_hazard_${selectedHazard}`
      )} ${t("map_legend_legacy_title_on_suffix")} ${
        selectedExposureEconomic
          ? t(`results_report_card_exposure_${selectedExposureEconomic}`)
          : t(`results_report_card_exposure_${selectedExposureNonEconomic}`)
      } ${t("map_legend_legacy_title_in_suffix")} ${t(
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
            data: `${selectedCountry} - ${selectedHazard} - ${selectedScenario} - ${
              selectedExposureEconomic ? selectedExposureEconomic : selectedExposureNonEconomic
            } - ${selectedTimeHorizon} - ${selectedAnnualGrowth}`,
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

    // Checks if the scenario has finished running, the selected sub tab is Risk
    // and the selected view control is the display chart
    if (
      (isScenarioRunCompleted || selectedReport) &&
      activeViewControl === "display_chart" &&
      selectedSubTab === 0
    ) {
      const id = new Date().getTime().toString();
      const destinationFile = `${reportPath}\\${scenarioRunCode}\\snapshot_risk_plot_data_${id}.png`;

      takeChartScreenshot(waterfallChartRef, destinationFile)
        .then(() => {
          const outputData = {
            id: id,
            scenarioId: `${scenarioRunCode}`,
            data: `${selectedCountry} - ${selectedHazard} - ${selectedScenario} - ${
              selectedExposureEconomic ? selectedExposureEconomic : selectedExposureNonEconomic
            } - ${selectedTimeHorizon} - ${selectedAnnualGrowth}`,
            image: destinationFile,
            title: `${t("results_report_card_risk_plot_title")} ${t(
              `results_report_card_hazard_${selectedHazard}`
            )}${t("map_legend_legacy_title_on_suffix")} ${
              selectedExposureEconomic
                ? t(`results_report_card_exposure_${selectedExposureEconomic}`)
                : t(`results_report_card_exposure_${selectedExposureNonEconomic}`)
            } - ${t(`results_report_card_country_${selectedCountry}`)}`,
            type: "risk_plot_data",
          };
          addReport(outputData);
        })
        .catch((error) => {
          console.error("Error while trying to save the Risk plot. More info:", error);
        });
    }

    // Checks if the scenario has finished running, the selected sub tab is Adaptation
    // and the selected view control is the display chart
    if (
      (isScenarioRunCompleted || selectedReport) &&
      activeViewControl === "display_chart" &&
      selectedSubTab === 1
    ) {
      const id = new Date().getTime().toString();
      const destinationFile = `${reportPath}\\${scenarioRunCode}\\snapshot_adaptation_plot_data_${id}.png`;

      takeChartScreenshot(costBenefitChartRef, destinationFile)
        .then(() => {
          const outputData = {
            id: id,
            scenarioId: `${scenarioRunCode}`,
            data: `${selectedCountry} - ${selectedHazard} - ${selectedScenario} - ${
              selectedExposureEconomic ? selectedExposureEconomic : selectedExposureNonEconomic
            } - ${selectedTimeHorizon} - ${selectedAnnualGrowth}`,
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
      if (activeViewControl === "display_map") {
        base64 = await captureMapBase64(activeMapRef);
        snapshotType = "map";
      } else if (activeViewControl === "display_chart" && selectedSubTab === 0) {
        base64 = await captureChartBase64(waterfallChartRef);
        snapshotType = "waterfall";
      } else if (activeViewControl === "display_chart" && selectedSubTab === 1) {
        base64 = await captureChartBase64(costBenefitChartRef);
        snapshotType = "cost_benefit";
      } else {
        return null;
      }
      const data = await captureToScenario({
        scenarioId: scenarioRunCode,
        snapshotType,
        base64,
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
