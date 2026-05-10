"""Unit tests for the upload-size guard (issue #251).

These pin the contract the FastAPI handlers rely on: oversize files
raise :class:`UploadTooLargeError`, missing files are tolerated so the
caller's own "not found" diagnostics still fire, and the on-the-cap
boundary (exactly 50 MiB) is accepted.

The 51 MiB and 49 MiB files are written as sparse zero-filled regular
files via ``Path.write_bytes`` over a chunked loop — small enough on
modern filesystems that the unit suite stays under a second per case.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.models.errors import UploadTooLargeError
from backend.uploads import MAX_UPLOAD_BYTES, enforce_upload_size_limit


def _write_sparse(path: Path, size_bytes: int) -> None:
    """Create ``path`` with the requested logical size using a sparse seek+write.

    A single ``\\x00`` written at ``size_bytes - 1`` produces a file
    whose ``stat().st_size`` is exactly ``size_bytes`` while consuming
    only one block on disk — the size guard reads ``stat`` so the cheap
    representation is sufficient.
    """
    with path.open("wb") as fh:
        if size_bytes > 0:
            fh.seek(size_bytes - 1)
            fh.write(b"\x00")


def test_max_upload_bytes_is_50_mib() -> None:
    # ARCHITECTURE.md Area 18 names "50 MB" — the constant pins the
    # binary-mebibyte interpretation the guard documents.
    assert MAX_UPLOAD_BYTES == 50 * 1024 * 1024


def test_file_at_cap_is_accepted(tmp_path: Path) -> None:
    path = tmp_path / "ok.bin"
    _write_sparse(path, MAX_UPLOAD_BYTES)
    enforce_upload_size_limit(path, label="test")


def test_file_one_byte_over_cap_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "too_big.bin"
    _write_sparse(path, MAX_UPLOAD_BYTES + 1)
    with pytest.raises(UploadTooLargeError) as excinfo:
        enforce_upload_size_limit(path, label="measures workbook")
    # The label and the cap are surfaced verbatim so the renderer can
    # show a precise toast.
    assert "measures workbook" in excinfo.value.message
    assert "50" in excinfo.value.message


def test_missing_path_is_tolerated(tmp_path: Path) -> None:
    # ``CustomDataError`` / ``CredDatasetError`` raise the canonical
    # "file not found" envelope — the size guard must not shadow it
    # with a 413.
    enforce_upload_size_limit(tmp_path / "does-not-exist", label="x")


def test_directory_path_is_tolerated(tmp_path: Path) -> None:
    # Directories have a non-meaningful ``st_size``; the downstream
    # parser will reject the path with its own structured error.
    enforce_upload_size_limit(tmp_path, label="x")
