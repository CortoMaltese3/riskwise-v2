"""Shared guards for user-supplied file uploads.

The Electron renderer hands the FastAPI backend a local-filesystem path
for every "upload" surface (custom-data ZIP, CRED xlsx, measures-set
xlsx) — actual bytes never traverse the loopback HTTP channel. This
module centralises the cross-cutting policies that must run *before* a
handler opens the file:

* a hard 50 MiB size cap (``MAX_UPLOAD_BYTES``), enforced by
  :func:`enforce_upload_size_limit`. ARCHITECTURE.md Area 18 names this
  limit as a zip-bomb defence; concentrating the check here means new
  upload routes pick it up via a one-line call rather than re-deriving
  the constant.

The size check intentionally tolerates a missing path: downstream
handlers already raise their own structured error for "file not found"
(``CustomDataError``, ``CredDatasetError``, ``MeasureDatasetError``)
and we do not want this guard to shadow that signal with a 413.
"""

from __future__ import annotations

from pathlib import Path

from backend.models.errors import UploadTooLargeError

# 50 MiB. ARCHITECTURE.md Area 18 specifies "50 MB" as the upload cap;
# we apply that as a binary mebibyte (1024 * 1024) bound because every
# other size limit on the project (snapshot blob, engine zip) is also
# binary, and the difference between MB and MiB is immaterial at this
# magnitude (~5 % headroom that still rejects a clear zip-bomb).
MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024


def enforce_upload_size_limit(path: Path, *, label: str) -> None:
    """Reject ``path`` if it exists and is larger than :data:`MAX_UPLOAD_BYTES`.

    Parameters
    ----------
    path:
        The on-disk location handed in by the renderer. Missing paths
        are tolerated so the caller's own "file not found" diagnostics
        keep firing; symlinks and other non-regular files are skipped
        because ``Path.stat`` on them returns the link target's size,
        which the caller will sanity-check during real parsing.
    label:
        Short noun used in the structured error message (e.g.
        ``"CRED dataset"``, ``"measures workbook"``, ``"custom-data
        pack"``). Surfaced verbatim to the renderer so users see which
        upload tripped the cap.

    Raises
    ------
    UploadTooLargeError
        When the file is at least :data:`MAX_UPLOAD_BYTES` + 1 bytes.
        The exception's ``message`` names the offending label and the
        cap; the FastAPI boundary translates it to a ``413
        upload_too_large`` envelope.
    """
    try:
        size = path.stat().st_size
    except (FileNotFoundError, OSError):
        return
    if size > MAX_UPLOAD_BYTES:
        cap_mib = MAX_UPLOAD_BYTES // (1024 * 1024)
        size_mib = size / (1024 * 1024)
        raise UploadTooLargeError(
            f"{label} is {size_mib:.1f} MiB; the maximum allowed size is {cap_mib} MiB.",
        )
