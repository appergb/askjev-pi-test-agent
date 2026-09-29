"""Regression tests for token accounting, drain handling, and evidence persistence."""

from __future__ import annotations

import io
import json
import subprocess
import sys
import time
import urllib.error
from pathlib import Path
from typing import Any, cast

import benchmark_sglang as bench
import pytest


def _stream(events: list[Any]) -> Any:
    lines = [": keepalive\n"]
    lines.extend(
        "data: " + (event if isinstance(event, str) else json.dumps(event)) + "\n"
        for event in events
    )
    return io.BytesIO("".join(lines).encode())


def _events(*, breakdown: bool = True) -> list[Any]:
    usage: dict[str, Any] = {
        "prompt_tokens": 4095,
        "completion_tokens": 9,
        "prompt_tokens_details": {"cached_tokens": 4000},
    }
    if breakdown:
        usage["completion_tokens_details"] = {"reasoning_tokens": 5}
    return [
        {"choices": [{"delta": {"role": "assistant"}}]},
        {
            "choices": [{"delta": {"reasoning_content": "think"}}],
            "usage": {"completion_tokens": 4},
        },
        {
            "choices": [{"delta": {"content": "answer"}, "finish_reason": "stop"}],
            "usage": {"completion_tokens": 8},
        },
        {
            "choices": [],
            "usage": usage,
            "sglext": {"spec_tokens_details": {"spec_accept_length": 3.5}},
        },
        "[DONE]",
    ]


def _measure(
    monkeypatch: pytest.MonkeyPatch, events: list[Any] | None = None
) -> dict[str, Any]:
    ticks = iter(range(1, 100))
    monkeypatch.setattr(bench.time, "perf_counter", lambda: next(ticks))
    return bench._measure_stream(
        _stream(events if events is not None else _events()), 0
    )


def test_accepted_tokens_not_sse_event_count(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _measure(monkeypatch)
    assert result["first_chunk_tokens"] == 4
    assert result["decode_measured_tokens"] == 5
    assert result["decode_tok_s"] == pytest.approx(5 / 3)
    assert result["ttft_s"] == 2
    assert result["first_answer_ttft_s"] == 3
    assert result["reasoning_tokens"] == 5
    assert result["answer_tokens"] == 4
    assert result["cached_tokens"] == 4000
    assert result["reasoning_chars"] == 5
    assert result["output_text"] == "think\n<FINAL>\nanswer"
    assert result["spec_tokens_details"]["spec_accept_length"] == 3.5


def test_absent_reasoning_usage_is_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _measure(monkeypatch, _events(breakdown=False))
    assert result["reasoning_tokens"] is None
    assert result["answer_tokens"] is None
    assert result["completion_tokens"] == 9


def test_sglang_top_level_reasoning_usage(monkeypatch: pytest.MonkeyPatch) -> None:
    events = _events(breakdown=False)
    events[3]["usage"]["reasoning_tokens"] = 5
    assert _measure(monkeypatch, events)["answer_tokens"] == 4
    events[3]["usage"]["reasoning_tokens"] = 20
    result = _measure(monkeypatch, events)
    assert result["reasoning_tokens"] is None
    assert result["server_usage"]["reasoning_tokens"] == 20
    assert result["decode_tok_s"] == pytest.approx(5 / 3)


@pytest.mark.parametrize(
    "events,error",
    [
        ([{"error": "failed"}], "streaming error"),
        (_events()[:-1], "complete measurable output"),
        ([{"choices": [{"delta": {"content": "x"}}]}, "[DONE]"], "counts were absent"),
        (
            [
                {
                    "choices": [{"delta": {"content": "x"}}],
                    "usage": {"completion_tokens": 4},
                },
                {
                    "choices": [{"delta": {"content": "y"}}],
                    "usage": {"completion_tokens": 3},
                },
            ],
            "counts decreased",
        ),
        (
            [
                {
                    "choices": [{"delta": {"content": "x"}}],
                    "usage": {"completion_tokens": 4},
                },
                "[DONE]",
            ],
            "insufficient",
        ),
    ],
)
def test_invalid_streams_do_not_become_performance_results(
    monkeypatch: pytest.MonkeyPatch, events: list[Any], error: str
) -> None:
    with pytest.raises(RuntimeError, match=error):
        _measure(monkeypatch, events)


def test_stream_without_final_answer_and_without_trailing_extra_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events = [
        {"choices": [{"delta": {"reasoning": "a"}}], "usage": {"completion_tokens": 1}},
        {
            "choices": [{"delta": {"reasoning": "b"}}],
            "usage": {"completion_tokens": 2, "prompt_tokens": 4},
        },
        "[DONE]",
    ]
    result = _measure(monkeypatch, events)
    assert result["first_answer_ttft_s"] is None
    assert result["answer_chars"] == 0
    assert result["decode_tok_s"] == 1


@pytest.mark.parametrize("url", ["https://localhost", "http://example.com"])
def test_stream_rejects_non_loopback(url: str) -> None:
    with pytest.raises(ValueError, match="loopback"):
        bench._stream_request(url, {})


@pytest.mark.parametrize("status", [200, 503])
def test_connection_closes_on_success_and_http_error(
    monkeypatch: pytest.MonkeyPatch, status: int
) -> None:
    class Connection:
        closed = False

        def request(self, *_: Any, **__: Any) -> None:
            pass

        def getresponse(self) -> Any:
            response = _stream(_events())
            response.status = status
            return response

        def close(self) -> None:
            self.closed = True

    connection = Connection()
    monkeypatch.setattr(bench.http.client, "HTTPConnection", lambda *a, **k: connection)
    if status == 503:
        with pytest.raises(RuntimeError, match="HTTP 503"):
            bench._stream_request("http://127.0.0.1:30000", {})
    else:
        assert bench._stream_request("http://localhost", {})["completion_tokens"] == 9
    assert connection.closed


def test_clear_cache_accepts_plain_text_and_json_is_still_validated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        bench.urllib.request, "urlopen", lambda *a, **k: io.BytesIO(b"Cache flushed")
    )
    bench.flush_cache("http://localhost")
    with pytest.raises(json.JSONDecodeError):
        bench._json_request("http://localhost", "/status")
    monkeypatch.setattr(
        bench.urllib.request, "urlopen", lambda *a, **k: io.BytesIO(b"")
    )
    assert bench._json_request("http://localhost", "/empty") is None


def test_json_request_http_error_and_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    def success(request: Any, **_: Any) -> Any:
        assert json.loads(request.data) == {"x": 1}
        return io.BytesIO(b'{"ok": true}')

    monkeypatch.setattr(bench.urllib.request, "urlopen", success)
    assert bench._json_request("http://localhost", "/json", {"x": 1}) == {"ok": True}

    def failure(*_: Any, **__: Any) -> Any:
        raise urllib.error.HTTPError(
            "http://localhost", 500, "failure", cast(Any, {}), io.BytesIO(b"failed")
        )

    monkeypatch.setattr(bench.urllib.request, "urlopen", failure)
    with pytest.raises(RuntimeError, match="HTTP 500"):
        bench._json_request("http://localhost", "/json")


@pytest.mark.parametrize("busy_forever", [False, True])
def test_drain_waits_for_cleanup_but_has_a_deadline(
    monkeypatch: pytest.MonkeyPatch, busy_forever: bool
) -> None:
    clock = [0.0]
    monkeypatch.setattr(bench.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(
        bench.time, "sleep", lambda duration: clock.__setitem__(0, clock[0] + duration)
    )
    monkeypatch.setattr(
        bench,
        "_scheduler_load",
        lambda _: (1 if busy_forever or clock[0] < 2 else 0, 0, 0),
    )
    if busy_forever:
        with pytest.raises(RuntimeError, match="deadline"):
            bench.require_drained("http://localhost", 2)
        assert clock[0] == 120
    else:
        bench.require_drained("http://localhost", 2)
        assert clock[0] == 4
    with pytest.raises(ValueError):
        bench.require_drained("http://localhost", 0)


def test_scheduler_and_context_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    responses: dict[str, Any] = {
        "/get_load": [{"num_reqs": 1, "num_waiting_reqs": 2, "num_pending_tokens": 3}],
        "/get_server_info": {"context_length": bench.CONTEXT_LENGTH},
        "/v1/models": {
            "data": [{"id": bench.MODEL, "max_model_len": bench.CONTEXT_LENGTH}]
        },
    }
    monkeypatch.setattr(bench, "_json_request", lambda _, path: responses[path])
    assert bench._scheduler_load("http://localhost") == (1, 2, 3)
    assert bench.require_server_contract("http://localhost")["context_length"] == 262144
    responses["/get_server_info"]["internal_states"] = [
        {"memory_usage": {"token_capacity": 100000}}
    ]
    with pytest.raises(RuntimeError, match="KV token capacity"):
        bench.require_server_contract("http://localhost")
    responses["/get_server_info"].pop("internal_states")
    responses["/v1/models"]["data"][0]["max_model_len"] = 100
    with pytest.raises(RuntimeError, match="contract"):
        bench.require_server_contract("http://localhost")
    responses["/v1/models"]["data"] = []
    with pytest.raises(RuntimeError, match="unavailable"):
        bench.require_server_contract("http://localhost")
    responses["/get_server_info"]["context_length"] = 100
    with pytest.raises(RuntimeError, match="context_length"):
        bench.require_server_contract("http://localhost")


def test_prompt_generation_is_deterministic_and_bounded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        bench,
        "_token_count",
        lambda _, messages: messages[-1]["content"].count("Observation:") * 100,
    )
    first = bench.build_prompt("http://localhost", 4096)
    assert first == bench.build_prompt("http://localhost", 4096)
    assert abs(first[1] - 4096) <= 128
    with pytest.raises(RuntimeError, match="exceeds context"):
        bench.build_prompt("http://localhost", 262100)
    monkeypatch.setattr(bench, "_token_count", lambda *a: 1)
    with pytest.raises(RuntimeError, match="could not construct"):
        bench.build_prompt("http://localhost", 4096)


def test_telemetry_absent_values_and_swap_rates() -> None:
    assert bench._telemetry_summary([])["min_mem"] is None
    samples = [
        bench.TelemetrySample(0, 12, 100, 200, 50, 40, 2000, 99),
        bench.TelemetrySample(2, 10, 104, 206, 55, 60, 2200, 100),
    ]
    summary = bench._telemetry_summary(samples)
    assert summary["min_mem"] == 10
    assert summary["swap_in"] == 2
    assert summary["swap_out"] == 3
    assert summary["median_clock"] == 2100
    assert bench._median([None]) is None


def test_telemetry_reads_and_cleans_up_thread(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bench, "_read_meminfo", lambda: 12.0)
    monkeypatch.setattr(bench, "_read_vmstat", lambda: (0, 0))
    monkeypatch.setattr(bench, "_read_gpu", lambda: (40.0, 60.0, 2000.0, 100.0))
    with bench.Telemetry(0.01) as telemetry:
        time.sleep(0.02)
    assert telemetry.samples
    assert not telemetry._thread.is_alive()


@pytest.mark.parametrize(
    "content,expected", [("MemAvailable: 1048576 kB", 1.0), ("Other: 1", None)]
)
def test_memory_reading(
    monkeypatch: pytest.MonkeyPatch, content: str, expected: float | None
) -> None:
    monkeypatch.setattr(Path, "read_text", lambda *a, **k: content)
    assert bench._read_meminfo() == expected


def test_swap_and_gpu_probes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        Path, "read_text", lambda *a, **k: "pswpin 100\npswpout 200\npgfault 42\n"
    )
    assert bench._read_vmstat() == (100, 200)
    monkeypatch.setattr(
        bench.subprocess,
        "run",
        lambda *a, **k: subprocess.CompletedProcess([], 0, "40, 50, 2000, [N/A]\n"),
    )
    assert bench._read_gpu() == (40, 50, 2000, None)

    def failure(*_: Any, **__: Any) -> Any:
        raise OSError("unavailable")

    monkeypatch.setattr(Path, "read_text", failure)
    monkeypatch.setattr(bench.subprocess, "run", failure)
    assert bench._read_meminfo() is None
    assert bench._read_vmstat() == (None, None)
    assert bench._read_gpu() == (None, None, None, None)


def test_tokenizer_uses_the_chat_template(monkeypatch: pytest.MonkeyPatch) -> None:
    def response(_: str, path: str, payload: dict[str, Any], **__: Any) -> Any:
        assert path == "/v1/tokenize"
        assert payload["chat_template_kwargs"]["enable_thinking"] is True
        return {"count": 100}

    monkeypatch.setattr(bench, "_json_request", response)
    assert (
        bench._token_count("http://localhost", [{"role": "user", "content": "text"}])
        == 100
    )


def _fake_measurement(monkeypatch: pytest.MonkeyPatch) -> None:
    with monkeypatch.context() as patch:
        measured = _measure(patch)
    measured.update(completion_tokens=1152, decode_measured_tokens=1148)
    monkeypatch.setattr(bench, "_stream_request", lambda *a: dict(measured))
    monkeypatch.setattr(bench.Telemetry, "_run", lambda _: None)


def test_run_once_flags_token_mismatch_and_insufficient_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _fake_measurement(monkeypatch)
    args = ("http://localhost", "test", "4k", 1, "cold", [])
    good, _ = bench.run_once(*args, 4095)
    assert good.failure is None
    bad, _ = bench.run_once(*args, 1)
    assert bad.failure and "tokenizer count changed" in bad.failure
    monkeypatch.setattr(bench, "OUTPUT_MIN_TOKENS", 2000)
    short, _ = bench.run_once(*args, 4095)
    assert short.failure and "only" in short.failure


def test_main_persists_each_request_and_reports_invalid_runs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _fake_measurement(monkeypatch)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "benchmark",
            "--config",
            "test",
            "--scenario",
            "4k",
            "--repetitions",
            "1",
            "--maintenance-acknowledged",
            "--output-root",
            str(tmp_path),
        ],
    )
    monkeypatch.setattr(bench, "require_server_contract", lambda _: {})
    monkeypatch.setattr(bench, "require_drained", lambda *a: None)
    monkeypatch.setattr(bench, "build_prompt", lambda *a: ([], 4095))
    monkeypatch.setattr(bench, "flush_cache", lambda *a: None)
    assert bench.main() == 0
    directory = next(tmp_path.iterdir())
    rows = json.loads((directory / "results.json").read_text())
    assert [row["cache_state"] for row in rows] == ["cold", "hot"]
    assert "output_text" not in (directory / "results.csv").read_text().splitlines()[0]
    result, _ = bench.run_once("http://localhost", "test", "4k", 1, "cold", [], 1)
    bench._write_summary(tmp_path / "failed.md", [result])
    assert "—" in (tmp_path / "failed.md").read_text()


@pytest.mark.parametrize(
    "arguments",
    [
        [],
        ["--maintenance-acknowledged", "--repetitions", "0"],
        ["--maintenance-acknowledged", "--base-url", "http://example.com"],
    ],
)
def test_main_rejects_unbounded_or_unacknowledged_execution(
    monkeypatch: pytest.MonkeyPatch, arguments: list[str]
) -> None:
    monkeypatch.setattr(sys, "argv", ["benchmark", "--config", "test", *arguments])
    with pytest.raises(SystemExit):
        bench.main()
