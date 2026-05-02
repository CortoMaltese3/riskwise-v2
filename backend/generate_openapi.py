"""Dump the FastAPI OpenAPI schema to ``backend/openapi.json``.

Run ``python backend/generate_openapi.py`` after editing any endpoint or
Pydantic model, and re-run ``npm run gen:api-types`` to refresh the
TypeScript client. The generated JSON is committed so the npm build path can
regenerate types without needing a Python interpreter.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from backend.app import app  # noqa: E402

OUT_PATH = HERE / "openapi.json"


def main() -> None:
    schema = app.openapi()
    OUT_PATH.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
