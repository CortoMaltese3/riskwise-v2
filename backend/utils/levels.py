"""Bucketing helper that turns per-return-period values into ordinal levels.

Hazard layers use ascending thresholds (higher value → higher level);
impact layers use descending thresholds (lower residual → higher level).
The single function below handles both via the threshold ordering it
receives.
"""

from __future__ import annotations

import pandas as pd


def assign_levels(gdf: pd.DataFrame, percentile_values: dict[str, list]) -> pd.DataFrame:
    """Append a ``<rp>_level`` column for each return-period column.

    :param gdf: DataFrame containing per-return-period numeric columns.
    :param percentile_values: Mapping of return-period column name to the
        ordered list of thresholds. The first/last entries determine the
        ascending vs. descending semantics.
    :return: ``gdf`` with the new ``<rp>_level`` columns added in place.
    """
    for rp, levels in percentile_values.items():
        is_ascending = levels[0] < levels[-1]
        level_column: list[int] = []
        for _, row in gdf.iterrows():
            value = row[rp]
            if is_ascending:
                if value < levels[0]:
                    level_column.append(1)
                elif value >= levels[-1]:
                    level_column.append(len(levels))
                else:
                    for i in range(1, len(levels)):
                        if levels[i - 1] <= value < levels[i]:
                            level_column.append(i)
                            break
            else:
                if value > levels[0]:
                    level_column.append(1)
                elif value <= levels[-1]:
                    level_column.append(len(levels))
                else:
                    for i in range(1, len(levels)):
                        if levels[i - 1] >= value > levels[i]:
                            level_column.append(i)
                            break
        gdf[rp + "_level"] = level_column
    return gdf
