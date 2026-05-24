"""Tests for ``backend.cli`` shared CLI infrastructure.

Covers two contracts the ``run_*.py`` scripts historically depended on:

1. The :class:`StatusCode` enum compares equal to the legacy integer
   literals ``2000``/``3000``/``4000`` so the FastAPI tests, the
   frontend, and any persisted payload that round-trips through JSON
   (where the enum collapses to a plain int) all keep working.
2. The :class:`Command` base class translates an unhandled exception
   in :py:meth:`Command.execute` into the standard error envelope and
   logs it instead of letting it propagate — preserving the historical
   subprocess contract where ``run_*.py`` always prints valid JSON.
"""

from __future__ import annotations

import json

from backend.cli import Command, StatusCode


class TestStatusCode:
    def test_values_match_legacy_literals(self):
        assert StatusCode.SUCCESS == 2000
        assert StatusCode.VALIDATION_ERROR == 3000
        assert StatusCode.ERROR == 4000

    def test_serializes_as_int_in_json(self):
        # ``json.dumps`` collapses IntEnum to its int value, so the
        # over-the-wire envelope still looks like ``{"code": 2000}``.
        payload = json.dumps({"code": StatusCode.SUCCESS})
        assert payload == '{"code": 2000}'


class _OkCommand(Command):
    requires_request = False

    def execute(self):
        return {
            "data": {"value": 42},
            "status": {"code": StatusCode.SUCCESS, "message": "ok"},
        }


class _BoomCommand(Command):
    requires_request = False

    def execute(self):
        raise RuntimeError("kaboom")


class _CustomErrorEnvelope(Command):
    requires_request = False

    def execute(self):
        raise ValueError("nope")

    def error_envelope(self, exc):
        return {
            "data": [],
            "status": {"code": StatusCode.ERROR, "message": f"oops: {exc}"},
        }


class TestCommand:
    def test_run_returns_execute_result_on_success(self):
        result = _OkCommand().run()
        assert result["status"]["code"] == StatusCode.SUCCESS
        assert result["data"] == {"value": 42}

    def test_run_translates_unhandled_exception_to_error_envelope(self):
        result = _BoomCommand().run()
        assert result["status"]["code"] == StatusCode.ERROR
        assert "kaboom" in result["status"]["message"]
        assert result["data"] == {}

    def test_subclass_can_override_error_envelope_shape(self):
        result = _CustomErrorEnvelope().run()
        assert result["data"] == []
        assert result["status"]["message"] == "oops: nope"

    def test_main_returns_envelope_without_writing_stdout(self, capsys):
        # The stdout JSON contract is owned by each ``run_*.py``'s
        # ``__main__`` block (issue #244); the base classmethod stays
        # silent so in-process callers don't have to capture stdout.
        result = _OkCommand.main([])
        captured = capsys.readouterr()
        assert result["status"]["code"] == StatusCode.SUCCESS
        assert result["data"] == {"value": 42}
        assert captured.out == ""
