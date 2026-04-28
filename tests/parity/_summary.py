"""Parity-summary writer for ``tests/parity``.

Each scenario test records its CLIMADA-vs-engine deltas via
:func:`record_scenario`. At session end the conftest writes
``tests/parity/_summary.md`` with one table per scenario, listing
metric / CLIMADA / engine / delta / gate / pass-fail.

Kept as a separate module so the writer can be imported by the conftest
hook without dragging the runner fixtures into the import graph.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

_SUMMARY_FILENAME = "_summary.md"


@dataclass
class MetricRow:
    """One row in the per-scenario delta table."""

    metric: str
    climada: float | int | str
    engine: float | int | str
    gate: str
    delta: float | None = None
    passed: bool = True


@dataclass
class ScenarioRecord:
    """All metric rows for a single scenario."""

    name: str
    rows: list[MetricRow] = field(default_factory=list)
    skipped_reason: str | None = None


_records: dict[str, ScenarioRecord] = {}


def record_scenario(name: str, rows: list[MetricRow]) -> None:
    """Register a scenario's metric rows for the session summary."""
    _records[name] = ScenarioRecord(name=name, rows=list(rows))


def record_skip(name: str, reason: str) -> None:
    """Register a scenario that was skipped, with the reason."""
    _records[name] = ScenarioRecord(name=name, rows=[], skipped_reason=reason)


def _format_value(value: float | int | str) -> str:
    if isinstance(value, float):
        return f"{value:.6g}"
    return str(value)


def _format_delta(delta: float | None) -> str:
    if delta is None:
        return "—"
    return f"{delta * 100:.3f} %"


def _scenario_table(record: ScenarioRecord) -> str:
    if record.skipped_reason is not None:
        return f"### {record.name}\n\n_Skipped: {record.skipped_reason}_\n"

    lines = [
        f"### {record.name}",
        "",
        "| metric | CLIMADA | engine | delta | gate | pass/fail |",
        "| --- | ---: | ---: | ---: | --- | :---: |",
    ]
    for row in record.rows:
        status = "✅" if row.passed else "❌"
        lines.append(
            f"| {row.metric} | {_format_value(row.climada)} | "
            f"{_format_value(row.engine)} | {_format_delta(row.delta)} | "
            f"{row.gate} | {status} |"
        )
    return "\n".join(lines) + "\n"


def write_summary(target_dir: Path) -> Path:
    """Write the markdown summary; returns the file path."""
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / _SUMMARY_FILENAME
    if not _records:
        path.write_text(
            "# Parity results\n\n_No scenarios were recorded._\n",
            encoding="utf-8",
        )
        return path

    sections = ["# Parity results", ""]
    for name in sorted(_records):
        sections.append(_scenario_table(_records[name]))
    path.write_text("\n".join(sections), encoding="utf-8")
    return path


def reset() -> None:
    """Clear recorded scenarios. Used between in-process test sessions."""
    _records.clear()


def has_records() -> bool:
    """True iff at least one scenario (recorded or skipped) is in the registry."""
    return bool(_records)
