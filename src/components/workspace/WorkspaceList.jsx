import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import FileDownloadIcon from "@mui/icons-material/FileDownload";

import RiskWiseClient from "../../lib/RiskWiseClient";
import { formatDateTime } from "../../lib/formatDate";
import { enqueueToast } from "../../hooks/useToast";

const formatCreatedAt = (value, locale) => {
  if (!value) return "";
  try {
    return formatDateTime(value, locale);
  } catch {
    return String(value);
  }
};

const WorkspaceList = ({ onOpen, items: itemsProp }) => {
  const { i18n, t } = useTranslation();
  const locale = i18n.language;
  const [items, setItems] = useState(itemsProp || []);
  const [loading, setLoading] = useState(itemsProp === undefined);
  const [error, setError] = useState("");
  const [menuState, setMenuState] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (itemsProp !== undefined) {
      setItems(itemsProp);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const response = await RiskWiseClient.listScenarios();
        if (cancelled) return;
        if (response?.success && response.result?.status?.code === 2000) {
          setItems(response.result.data || []);
          setError("");
        } else {
          setError(response?.error?.message || "Failed to load workspace");
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load workspace");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemsProp]);

  const handleDelete = async (event, id) => {
    event.stopPropagation();
    const response = await RiskWiseClient.deleteScenario(id);
    if (response?.success && response.result?.status?.code === 2000) {
      setItems((current) => current.filter((row) => row.id !== id));
    }
  };

  const openMenu = (event, id) => {
    event.stopPropagation();
    setMenuState({ anchor: event.currentTarget, rowId: id });
  };

  const closeMenu = () => setMenuState(null);

  const handleExport = async () => {
    const id = menuState?.rowId;
    closeMenu();
    if (!id) return;
    setBusyId(id);
    try {
      const result = await RiskWiseClient.exportScenarioBundle(id);
      if (result?.success) {
        enqueueToast({
          severity: "success",
          message: t("workspace_export_scenario_success", {
            defaultValue: "Scenario exported.",
          }),
        });
      } else if (result?.reason && result.reason !== "cancelled") {
        enqueueToast({
          severity: "error",
          message: t("workspace_export_scenario_failed", {
            defaultValue: "Export failed: {{reason}}",
            reason: result.reason,
          }),
        });
      }
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Typography>Loading...</Typography>;
  if (error)
    return (
      <Typography role="alert" color="error">
        {error}
      </Typography>
    );
  if (!items.length) return <Typography>No saved scenarios yet.</Typography>;

  return (
    <>
      <List aria-label="workspace-scenarios">
        {items.map((row) => (
          <ListItem
            key={row.id}
            disablePadding
            secondaryAction={
              <Stack direction="row" spacing={0.5}>
                <Tooltip
                  title={t("workspace_scenario_actions_aria", { defaultValue: "Scenario actions" })}
                >
                  <span>
                    <IconButton
                      aria-label={`scenario-actions-${row.id}`}
                      onClick={(e) => openMenu(e, row.id)}
                      edge="end"
                      disabled={busyId === row.id}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <IconButton
                  aria-label={`delete-${row.id}`}
                  onClick={(e) => handleDelete(e, row.id)}
                  edge="end"
                >
                  <DeleteIcon />
                </IconButton>
              </Stack>
            }
          >
            <ListItemButton onClick={() => onOpen?.(row)}>
              <ListItemText
                primary={row.name || row.id}
                secondary={[row.country, row.hazard_type, formatCreatedAt(row.created_at, locale)]
                  .filter(Boolean)
                  .join(" • ")}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Menu
        anchorEl={menuState?.anchor ?? null}
        open={Boolean(menuState)}
        onClose={closeMenu}
        slotProps={{ paper: { "aria-label": "scenario-context-menu" } }}
      >
        <MenuItem onClick={handleExport} aria-label="export-scenario">
          <FileDownloadIcon fontSize="small" sx={{ mr: 1 }} />
          {t("workspace_export_scenario", { defaultValue: "Export Scenario" })}
        </MenuItem>
      </Menu>
    </>
  );
};

WorkspaceList.propTypes = {
  onOpen: PropTypes.func,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string,
      country: PropTypes.string,
      hazard_type: PropTypes.string,
      created_at: PropTypes.string,
    })
  ),
};

export default WorkspaceList;
