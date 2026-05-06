import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import {
  Box,
  Collapse,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";

import useStore from "../../store";
import enGlossary from "../../content/glossary/en.md?raw";
import arGlossary from "../../content/glossary/ar.md?raw";
import thGlossary from "../../content/glossary/th.md?raw";

// Mirrors TOP_BAR_HEIGHT in components/layout/Sidebar.jsx. Inlined rather
// than imported because pulling Sidebar into this module breaks the
// glossary_drawer test setup (Sidebar's MUI-icon imports trigger a module
// load failure in the test runner).
const TOP_BAR_HEIGHT = 80;

const GLOSSARIES = { en: enGlossary, ar: arGlossary, th: thGlossary };

const parseGlossary = (source) => {
  // Split on lines beginning with "# ". Each block is `term\n\nbody`.
  const chunks = source.split(/^#\s+/m).filter((c) => c.trim().length > 0);
  return chunks.map((chunk) => {
    const newline = chunk.indexOf("\n");
    const term = (newline === -1 ? chunk : chunk.slice(0, newline)).trim();
    const body = newline === -1 ? "" : chunk.slice(newline + 1).trim();
    return { term, body };
  });
};

const normalize = (s) => s.toLocaleLowerCase();

const GlossaryDrawer = () => {
  const { t, i18n } = useTranslation();
  const open = useStore((s) => s.glossaryOpen);
  const setOpen = useStore((s) => s.setGlossaryOpen);

  const [query, setQuery] = useState("");
  const [expandedIndex, setExpandedIndex] = useState(-1);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef([]);

  const locale = (i18n.language || "en").split("-")[0].toLowerCase();
  const source = GLOSSARIES[locale] || GLOSSARIES.en;

  const allTerms = useMemo(() => parseGlossary(source), [source]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return allTerms;
    return allTerms.filter(
      ({ term, body }) => normalize(term).includes(q) || normalize(body).includes(q)
    );
  }, [allTerms, query]);

  useEffect(() => {
    if (!open) return;
    setExpandedIndex(-1);
    setFocusedIndex(0);
  }, [open, locale]);

  useEffect(() => {
    // Clamp the focus index when the filtered list shrinks so keyboard
    // navigation never lands on a now-missing row.
    if (focusedIndex >= filtered.length) {
      setFocusedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, focusedIndex]);

  const focusItem = (index) => {
    const node = itemRefs.current[index];
    if (node && typeof node.focus === "function") node.focus();
  };

  const handleKeyDown = (e) => {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(filtered.length - 1, focusedIndex + 1);
      setFocusedIndex(next);
      focusItem(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, focusedIndex - 1);
      setFocusedIndex(next);
      focusItem(next);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setExpandedIndex((prev) => (prev === focusedIndex ? -1 : focusedIndex));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => setOpen(false)}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 400 },
          // TopBar is `position: fixed` with zIndex `drawer + 1`, so without
          // this offset the AppBar paints over the drawer's top 80px (search
          // field gets clipped). Sit the drawer paper below the AppBar.
          top: TOP_BAR_HEIGHT,
          height: `calc(100% - ${TOP_BAR_HEIGHT}px)`,
        },
      }}
    >
      <Box role="presentation" sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, pt: 2 }}
        >
          <Typography variant="h6" component="h2">
            {t("glossary_title")}
          </Typography>
          <IconButton aria-label={t("glossary_close")} onClick={() => setOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
        <Box sx={{ px: 2, pt: 1 }}>
          <TextField
            fullWidth
            size="small"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFocusedIndex(0);
              setExpandedIndex(-1);
            }}
            placeholder={t("glossary_search_placeholder")}
            inputProps={{ "aria-label": t("glossary_search_aria") }}
            autoFocus
          />
        </Box>
        <Box sx={{ flex: 1, overflowY: "auto", px: 1, py: 1 }} onKeyDown={handleKeyDown}>
          {filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
              {t("glossary_no_results")}
            </Typography>
          ) : (
            <List
              role="listbox"
              aria-label={t("glossary_list_aria")}
              aria-activedescendant={`glossary-term-${focusedIndex}`}
              dense
            >
              {filtered.map((entry, index) => {
                const expanded = expandedIndex === index;
                return (
                  <React.Fragment key={entry.term}>
                    <ListItem disablePadding>
                      <ListItemButton
                        id={`glossary-term-${index}`}
                        role="option"
                        aria-selected={focusedIndex === index}
                        aria-expanded={expanded}
                        ref={(node) => {
                          itemRefs.current[index] = node;
                        }}
                        tabIndex={focusedIndex === index ? 0 : -1}
                        onFocus={() => setFocusedIndex(index)}
                        onClick={() => setExpandedIndex(expanded ? -1 : index)}
                      >
                        <ListItemText primary={entry.term} />
                        {expanded ? <ExpandLess /> : <ExpandMore />}
                      </ListItemButton>
                    </ListItem>
                    <Collapse in={expanded} unmountOnExit>
                      <Box
                        sx={{
                          px: 3,
                          pb: 2,
                          color: "text.secondary",
                          "& p": { m: 0, mb: 1 },
                        }}
                      >
                        <ReactMarkdown>{entry.body}</ReactMarkdown>
                      </Box>
                    </Collapse>
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
};

export default GlossaryDrawer;
