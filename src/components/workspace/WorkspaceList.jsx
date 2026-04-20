import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

import RiskWiseClient from "../../lib/RiskWiseClient";

const formatCreatedAt = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const WorkspaceList = ({ onOpen, items: itemsProp }) => {
  const [items, setItems] = useState(itemsProp || []);
  const [loading, setLoading] = useState(itemsProp === undefined);
  const [error, setError] = useState("");

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

  if (loading) return <Typography>Loading...</Typography>;
  if (error)
    return (
      <Typography role="alert" color="error">
        {error}
      </Typography>
    );
  if (!items.length) return <Typography>No saved scenarios yet.</Typography>;

  return (
    <List aria-label="workspace-scenarios">
      {items.map((row) => (
        <ListItem
          key={row.id}
          disablePadding
          secondaryAction={
            <IconButton
              aria-label={`delete-${row.id}`}
              onClick={(e) => handleDelete(e, row.id)}
              edge="end"
            >
              <DeleteIcon />
            </IconButton>
          }
        >
          <ListItemButton onClick={() => onOpen?.(row)}>
            <ListItemText
              primary={row.name || row.id}
              secondary={[row.country, row.hazard_type, formatCreatedAt(row.created_at)]
                .filter(Boolean)
                .join(" • ")}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
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
