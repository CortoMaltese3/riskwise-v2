import React, { useEffect } from "react";
import PropTypes from "prop-types";

import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import useUIStore from "../../store/useUIStore";

const LinearProgressWithLabel = (props) => {
  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Box sx={{ width: "100%", m: 2 }}>
        <LinearProgress
          variant="determinate"
          sx={{
            backgroundColor: "primary.main",
            "& .MuiLinearProgress-bar": {
              backgroundColor: "primary.dark",
            },
          }}
          {...props}
        />
      </Box>
      <Box sx={{ minWidth: 35, mr: 2 }}>
        <Typography variant="body2" color="text.secondary">{`${Math.round(
          props.value
        )}%`}</Typography>
      </Box>
    </Box>
  );
};

LinearProgressWithLabel.propTypes = {
  value: PropTypes.number.isRequired,
};

const Loader = () => {
  const progress = useUIStore((s) => s.progress);
  const setProgress = useUIStore((s) => s.setProgress);

  useEffect(() => {
    if (!window.electron?.onProgress) {
      return undefined;
    }
    const unsubscribe = window.electron.onProgress((json) => {
      setProgress(json.progress);
    });
    return unsubscribe;
  }, [setProgress]);

  return (
    progress > 0 &&
    progress < 100 && (
      <Box sx={{ width: "100%" }}>
        <LinearProgressWithLabel value={progress} />
      </Box>
    )
  );
};

export default Loader;
