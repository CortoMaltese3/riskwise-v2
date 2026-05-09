import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useReportTools } from "../../utils/reportTools";
import ReportCard from "./ReportCard";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";

import RiskWiseClient from "../../lib/RiskWiseClient";
import logger from "../../lib/logger.ts";

// Module-scoped in-flight guard. Component-local refs would reset when the
// view unmounts on rapid tab switching, allowing a second fetch to fire
// while the first is still pending. The flag is cleared in `finally` so a
// genuine refetch (e.g., after returning to the tab once the first request
// has completed) still works.
let reportsFetchInFlight = false;

const ReportsView = () => {
  const reports = useUIStore((s) => s.reports);
  const removeReport = useUIStore((s) => s.removeReport);
  const selectedReport = useUIStore((s) => s.selectedReport);
  const setAlertMessage = useUIStore((s) => s.setAlertMessage);
  const setAlertSeverity = useUIStore((s) => s.setAlertSeverity);
  const setAlertShowMessage = useUIStore((s) => s.setAlertShowMessage);
  const setSelectedReport = useUIStore((s) => s.setSelectedReport);
  const updateReports = useUIStore((s) => s.updateReports);
  const setSelectedScenarioRunCode = useWorkspaceStore((s) => s.setSelectedScenarioRunCode);
  const { fetchReports, restoreScenario, getReport } = useReportTools();
  const { t } = useTranslation();

  // Lazy-fetch the scenario list when the Reports tab becomes active. Owning
  // the fetch here (rather than in MainTabs.handleTabChange) keeps caching
  // policy with the consumer. The module-scoped flag suppresses duplicate
  // requests when the user toggles tabs rapidly — a remount during a pending
  // fetch won't trigger a second one. See #248.
  useEffect(() => {
    if (reportsFetchInFlight) return;
    reportsFetchInFlight = true;
    Promise.resolve(fetchReports()).finally(() => {
      reportsFetchInFlight = false;
    });
    // fetchReports is recreated on every render of useReportTools (it closes
    // over store getters); intentionally fire once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCardClickHandler = (id) => {
    const report = getReport(id);
    setSelectedReport(report);
    setSelectedScenarioRunCode(report.scenarioId);
    // if (report) {
    //   if (selectedReport?.id === id) {
    //     setSelectedReport(null); // Deselect if it's already selected
    //   } else {
    //     setSelectedReport(report); // Select new report
    //   }
    //   setSelectedScenarioRunCode(report.scenarioId);
    // }
  };

  const onRemoveReportHandler = async (report) => {
    try {
      const response = await RiskWiseClient.deleteScenario(report.id);

      // Ensure that the response and status exist
      const message = response?.result?.status?.message || "Failed to remove report";
      const code = response?.result?.status?.code || 5000;

      setAlertMessage(message);
      setAlertSeverity(code === 2000 ? "success" : "error");
      setAlertShowMessage(true);

      // Remove the report from the store only if the response was successful
      if (code === 2000) {
        await removeReport(report.id); // Update store after success
      }
    } catch (error) {
      logger.error("ReportsView: removeReport failed", {
        error: error?.message ?? String(error),
      });
      setAlertMessage(t("alert_message_report_view_error_delete"));
      setAlertSeverity("error");
      setAlertShowMessage(true);
    }
  };

  const onActionReportHandler = (id, action) => {
    const index = reports.findIndex((report) => report.id === id);
    if (action === "delete") {
      const filteredReport = reports.filter((report) => report.id === id)[0];

      // Filter out all reports with the same scenarioId
      const updatedReports = reports.filter(
        (report) => report.scenarioId !== filteredReport.scenarioId
      );

      updateReports(updatedReports); // Update the frontend reports

      onRemoveReportHandler(filteredReport);
    } else if (action === "restore") {
      restoreScenario(id);
    } else {
      const lastIndex = reports.length - 1;
      const [movedReport] = reports.splice(index, 1);
      let newIndex;
      if (action === "up") {
        newIndex = index === 0 ? lastIndex : index - 1;
      } else if (action === "down") {
        newIndex = index === lastIndex ? 0 : index + 1;
      }
      const newReportData = [...reports];
      newReportData.splice(newIndex, 0, movedReport);
      updateReports(newReportData);
    }
  };

  return (
    <>
      {reports.map((report) => (
        <ReportCard
          key={report.id}
          data={report.data}
          id={report.id}
          image={report.image}
          isSelected={selectedReport?.id === report.id}
          onCardClick={onCardClickHandler}
          onReportAction={onActionReportHandler}
          title={report.title}
          type={report.type}
        />
      ))}
    </>
  );
};

export default ReportsView;
