"""Module to handle cleaning up the temporary directory.

This module clears all files within the configured temporary directory,
handling errors gracefully and logging progress.
"""

import json
import sys

from backend.cli import Command
from backend.constants import DATA_TEMP_DIR


class RunClearTempDir(Command):
    """Delete every file in :data:`backend.constants.DATA_TEMP_DIR`."""

    requires_request = False

    def execute(self) -> dict:
        try:
            for file in DATA_TEMP_DIR.glob("*"):
                file.unlink(missing_ok=True)
            self.logger.log("info", "Successfully cleared all files in the temporary directory.")
            return {
                "success": True,
                "message": "Successfully cleared all files in the temporary directory.",
            }
        except Exception as exc:
            error_message = f"Error while trying to clear temp directory. More info: {exc}"
            self.logger.log("error", error_message)
            return {"success": False, "error": error_message}

    def error_envelope(self, exc):
        return {
            "success": False,
            "error": f"Error while trying to clear temp directory. More info: {exc}",
        }

    def run_clear_temp_dir(self) -> dict:
        return self.run()


if __name__ == "__main__":
    # Historically this script ignored ``sys.argv[1]`` but accepted it for
    # parity with the others. Preserve that — decode if present, discard
    # the value, and fall through to the zero-arg constructor.
    if len(sys.argv) > 1:
        json.loads(sys.argv[1])
    RunClearTempDir.main([sys.argv[0]])
