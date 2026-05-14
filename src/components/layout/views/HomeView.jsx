import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Stack } from "@mui/material";

import useUIStore from "../../../store/useUIStore";
import useWorkspaceStore from "../../../store/useWorkspaceStore";
import { parseChangelog } from "../../../utils/changelog";
import { useReportTools } from "../../../utils/reportTools";
import { enqueueToast } from "../../../hooks/useToast";
import ScrollableRegion from "../primitives/ScrollableRegion";
import ActiveRunCard from "../../home/ActiveRunCard";
import GetStartedCards from "../../home/GetStartedCards";
import RecentProjectsCard from "../../home/RecentProjectsCard";
import PinnedCard from "../../home/PinnedCard";
import RestoreScenarioConfirmDialog from "../../home/RestoreScenarioConfirmDialog";
import SystemStatusCard from "../../home/SystemStatusCard";
import WhatsNewCard from "../../home/WhatsNewCard";
import ResourcesCard from "../../home/ResourcesCard";
import NeedHelpCard from "../../home/NeedHelpCard";
import FirstRunCard from "../../home/FirstRunCard";

import changelogSource from "../../../../CHANGELOG.md?raw";

const CHANGELOG = parseChangelog(changelogSource);

const PAGE_SX = { p: { xs: 2, md: 3 }, height: "100%" };

const GRID_SX = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 3fr) minmax(0, 2fr)" },
  gap: 3,
  alignItems: "start",
};

const COLUMN_SX = { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 };

const HomeView = () => {
  const { t, i18n } = useTranslation();
  const lastSyncAt = useWorkspaceStore((s) => s.lastSyncAt);
  const scenarios = useWorkspaceStore((s) => s.scenarios);
  const loading = useWorkspaceStore((s) => s.loading);
  const error = useWorkspaceStore((s) => s.error);
  const pinnedIds = useWorkspaceStore((s) => s.pinnedIds);
  const togglePinned = useWorkspaceStore((s) => s.togglePinned);
  const loadScenarios = useWorkspaceStore((s) => s.loadScenarios);
  const setActiveSection = useUIStore((s) => s.setActiveSection);
  const { restoreScenario } = useReportTools();

  const [pendingRestore, setPendingRestore] = useState(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);
  const apiStatus = {
    status: error ? "error" : loading ? "loading" : "ok",
    message: error || null,
  };
  const isFirstRun = !loading && !error && scenarios.length === 0;

  const handleConfirmRestore = async (row) => {
    setRestoring(true);
    const ok = await restoreScenario(row.id);
    setRestoring(false);
    setPendingRestore(null);
    if (ok) {
      setActiveSection("risk");
      enqueueToast({
        severity: "success",
        message: t("alert_message_report_card_successful_restore"),
      });
    }
  };

  return (
    <ScrollableRegion>
      <Box sx={PAGE_SX} data-testid="home-view">
        <Box sx={GRID_SX}>
          <Box sx={COLUMN_SX}>
            <ActiveRunCard />
            <GetStartedCards />
            {isFirstRun ? (
              <FirstRunCard />
            ) : (
              <Stack spacing={3}>
                <RecentProjectsCard
                  scenarios={scenarios}
                  loading={loading}
                  error={error}
                  onActivate={setPendingRestore}
                />
                <PinnedCard
                  scenarios={scenarios}
                  pinnedIds={pinnedIds}
                  loading={loading}
                  error={error}
                  onUnpin={togglePinned}
                  onActivate={setPendingRestore}
                />
              </Stack>
            )}
          </Box>
          <Box sx={COLUMN_SX}>
            <SystemStatusCard api={apiStatus} lastSyncAt={lastSyncAt} locale={i18n.language} />
            <WhatsNewCard
              version={CHANGELOG.version}
              releaseDate={CHANGELOG.releaseDate}
              bullets={CHANGELOG.bullets}
              error={!CHANGELOG.version}
              locale={i18n.language}
            />
            <ResourcesCard />
            <NeedHelpCard />
          </Box>
        </Box>
      </Box>
      <RestoreScenarioConfirmDialog
        row={pendingRestore}
        busy={restoring}
        onCancel={() => setPendingRestore(null)}
        onConfirm={handleConfirmRestore}
      />
    </ScrollableRegion>
  );
};

export default HomeView;
