"""Check quality verdicts and the isolation used for generated code."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
import verify_sglang_quality as quality


def _response(content: str = "", **message_fields: Any) -> dict[str, Any]:
    return {"choices": [{"message": {"content": content, **message_fields}}]}


@pytest.mark.parametrize(
    "content,passed",
    [
        (json.dumps({"passed": 18, "failed": 2, "rollback": True}), True),
        ("{}", False),
        ("broken", False),
    ],
)
def test_schema_values_are_checked(
    monkeypatch: pytest.MonkeyPatch, content: str, passed: bool
) -> None:
    monkeypatch.setattr(quality, "chat", lambda *a, **k: _response(content))
    assert quality.schema_check("http://localhost")[0] is passed


@pytest.mark.parametrize(
    "calls,passed",
    [
        (
            [
                {
                    "function": {
                        "name": "schedule_regression",
                        "arguments": json.dumps(
                            {"suite": "core-api", "revision": "482ca0f", "priority": 7}
                        ),
                    }
                }
            ],
            True,
        ),
        ([{"function": {"name": "wrong", "arguments": "{}"}}], False),
        ([], False),
    ],
)
def test_tool_name_and_arguments_are_checked(
    monkeypatch: pytest.MonkeyPatch, calls: list[Any], passed: bool
) -> None:
    monkeypatch.setattr(quality, "chat", lambda *a, **k: _response(tool_calls=calls))
    assert quality.tool_check("http://localhost")[0] is passed


@pytest.mark.parametrize("outcome", ["pass", "failure", "timeout"])
def test_generated_code_is_isolated_and_container_always_removed(
    monkeypatch: pytest.MonkeyPatch, outcome: str
) -> None:
    monkeypatch.setattr(
        quality,
        "chat",
        lambda *a, **k: _response(
            "```python\ndef normalize_ranges(items):\n    return []\n```"
        ),
    )
    calls: list[list[str]] = []

    def run(command: list[str], **kwargs: Any) -> Any:
        calls.append(command)
        if command[1] == "run":
            for flag in [
                "--pull=never",
                "--network=none",
                "--read-only",
                "--cap-drop=ALL",
                "--security-opt=no-new-privileges",
                "--pids-limit=32",
                "--memory=256m",
                "--user=65534:65534",
                "-I",
                "-S",
            ]:
                assert flag in command
            assert "-v" not in command and "--gpus" not in command
            assert "assert normalize_ranges" in kwargs["input"]
            if outcome == "timeout":
                raise subprocess.TimeoutExpired(command, 20)
            return subprocess.CompletedProcess(
                command, 0 if outcome == "pass" else 1, "", "assertion failed"
            )
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(quality.subprocess, "run", run)
    assert quality.code_check("http://localhost")[0] is (outcome == "pass")
    assert calls[-1][:3] == ["docker", "rm", "-f"]
    assert quality._extract_python("plain code") == "plain code"


@pytest.mark.parametrize("thinking", [True, False])
def test_chat_records_latency_without_changing_request_contract(
    monkeypatch: pytest.MonkeyPatch,
    thinking: bool,
) -> None:
    def request(
        _: str, path: str, payload: dict[str, Any], **__: Any
    ) -> dict[str, Any]:
        assert path == "/v1/chat/completions"
        assert payload["chat_template_kwargs"]["enable_thinking"] is thinking
        return _response("answer")

    monkeypatch.setattr(quality, "_json_request", request)
    token = quality.THINKING.set(thinking)
    try:
        assert quality.chat("http://localhost")["benchmark_client_e2e_s"] >= 0
    finally:
        quality.THINKING.reset(token)


def test_long_context_prompt_spans_three_positions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        quality,
        "_token_count",
        lambda _, messages, **kwargs: messages[0]["content"].count("Observation:")
        * 100,
    )
    messages, count = quality._long_messages("http://localhost")
    assert abs(count - 131072) < 100
    assert all(
        code in messages[0]["content"]
        for code in ["ALPHA-173", "BETA-284", "GAMMA-395"]
    )


@pytest.mark.parametrize(
    "content,passed",
    [
        (
            json.dumps(
                {
                    "front": "ALPHA-173",
                    "middle": "BETA-284",
                    "end": "GAMMA-395",
                    "composite": "r17/queue/rollback",
                }
            ),
            True,
        ),
        ("{}", False),
        ("broken", False),
    ],
)
def test_long_context_requires_the_exact_join_and_length(
    monkeypatch: pytest.MonkeyPatch, content: str, passed: bool
) -> None:
    monkeypatch.setattr(quality, "_long_messages", lambda _: ([], 131072))
    monkeypatch.setattr(
        quality,
        "chat",
        lambda *a, **k: {**_response(content), "usage": {"prompt_tokens": 131072}},
    )
    assert quality.long_context_check("http://localhost")[0] is passed


@pytest.mark.parametrize(
    "ready,device,passed",
    [(True, "cuda", True), (False, "cuda", False), (True, "cpu", False)],
)
def test_scorer_must_remain_ready_on_cuda(
    monkeypatch: pytest.MonkeyPatch, ready: bool, device: str, passed: bool
) -> None:
    monkeypatch.setattr(
        quality, "_json_request", lambda *a: {"ready": ready, "device": device}
    )
    assert quality.openjev_check()[0] is passed


@pytest.mark.parametrize("failed", [False, True])
def test_selected_checks_and_exceptions_are_persisted(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failed: bool
) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "quality",
            "--config",
            "test",
            "--check",
            "openjev",
            "--check",
            "schema",
            "--repetitions",
            "1",
            "--maintenance-acknowledged",
            "--output-root",
            str(tmp_path),
        ],
    )
    monkeypatch.setattr(quality, "require_server_contract", lambda _: {})
    monkeypatch.setattr(quality, "require_drained", lambda *a: None)
    monkeypatch.setattr(quality, "openjev_check", lambda: (True, "ready", {}))

    def schema(_: str) -> tuple[bool, str, dict[str, Any]]:
        if failed:
            raise RuntimeError("fixture failure")
        return True, "valid", {}

    monkeypatch.setattr(quality, "schema_check", schema)
    assert quality.main() == int(failed)
    summary = json.loads(next(tmp_path.glob("*/quality-summary.json")).read_text())
    assert set(summary) == {"openjev", "schema"}
    assert summary["schema"]["passed"] == int(not failed)


@pytest.mark.parametrize(
    "arguments", [[], ["--maintenance-acknowledged", "--repetitions", "0"]]
)
def test_quality_refuses_empty_or_unacknowledged_run(
    monkeypatch: pytest.MonkeyPatch, arguments: list[str]
) -> None:
    monkeypatch.setattr(sys, "argv", ["quality", "--config", "test", *arguments])
    with pytest.raises(SystemExit):
        quality.main()
