"""Assert the installed CLIMADA version matches the project pin declared in pyproject.toml.

Skipped automatically in CI because CLIMADA is not installed there (stubbed by the unit
conftest). Run locally against a real environment to catch drift between the installed
package and the pin.
"""

import pytest

climada = pytest.importorskip("climada")


def test_climada_version_matches_pin() -> None:
    version = getattr(climada, "__version__", None)
    if version is None:
        pytest.skip("climada is stubbed — real package not installed")
    assert version == "6.1.0", (
        f"Installed climada {version!r} != pinned '6.1.0'. "
        "Update pyproject.toml, requirements/requirements.txt, and "
        "requirements/environment.yml if the pin was intentionally bumped."
    )
