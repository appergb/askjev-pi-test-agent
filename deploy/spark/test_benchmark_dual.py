"""Dual-service benchmark tests against local mock SGLang and Open JEV servers."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import benchmark_dual as dual
import pytest
from benchmark_sglang import MODEL

CONTEXT = 262_144


class SglangHandler(BaseHTTPRequestHandler):
    def log_message(self, *_: object) -> None:
        pass

    def _send(self, code: int, body: bytes | dict[str, Any], content_type: str) -> None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path == "/get_load":
            self._send(200, [], "application/json")
        elif self.path == "/get_server_info":
            self._send(
                200,
                {
                    "context_length": CONTEXT,
                    "internal_states": [{"memory_usage": {"token_capacity": CONTEXT}}],
                },
                "application/json",
            )
        elif self.path == "/v1/models":
            self._send(
                200,
                {"data": [{"id": MODEL, "max_model_len": CONTEXT}]},
                "application/json",
            )
        else:
            self._send(404, {"error": self.path}, "application/json")

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        body: dict[str, Any] = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/v1/tokenize":
            chars = len(json.dumps(body.get("messages", [])))
            count = min(CONTEXT - 2_000, chars // 3)
            self._send(200, {"count": count}, "application/json")
        elif self.path.startswith("/flush_cache"):
            self._send(200, b"flushed", "text/plain")
        elif self.path == "/v1/chat/completions":
            events = [
                {"choices": [{"delta": {"role": "assistant"}}]},
                {
                    "choices": [{"delta": {"reasoning_content": "think"}}],
                    "usage": {"completion_tokens": 4},
                },
                {
                    "choices": [
                        {"delta": {"content": "answer"}, "finish_reason": "stop"}
                    ],
                    "usage": {"completion_tokens": 8},
                },
                {
                    "choices": [],
                    "usage": {
                        "prompt_tokens": 4_096,
                        "completion_tokens": 9,
                        "prompt_tokens_details": {"cached_tokens": 4_000},
                        "completion_tokens_details": {"reasoning_tokens": 5},
                    },
                    "sglext": {"spec_tokens_details": {"spec_accept_length": 3.5}},
                },
                "[DONE]",
            ]
            lines = [": keepalive\n"]
            lines.extend(
                "data: "
                + (event if isinstance(event, str) else json.dumps(event))
                + "\n\n"
                for event in events
            )
            self._send(200, "".join(lines).encode("utf-8"), "text/event-stream")
        else:
            self._send(404, {"error": self.path}, "application/json")


class JevHandler(BaseHTTPRequestHandler):
    def log_message(self, *_: object) -> None:
        pass

    def _send(self, code: int, body: dict[str, Any]) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path == "/status":
            self._send(200, {"status": "ok"})
        else:
            self._send(404, {"error": self.path})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        body: dict[str, Any] = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/decide":
            question = body["questions"][0]
            self._send(
                200,
                {
                    "results": [
                        {
                            "id": question["id"],
                            "choice": "supported",
                            "probabilities": {
                                "supported": 0.7,
                                "violated": 0.2,
                                "unknown": 0.1,
                            },
                        }
                    ]
                },
            )
        else:
            self._send(404, {"error": self.path})


class BrokenJevHandler(JevHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        body: dict[str, Any] = json.loads(self.rfile.read(length) or b"{}")
        question = body["questions"][0]
        self._send(
            200,
            {
                "results": [
                    {
                        "id": question["id"],
                        "choice": "supported",
                        "probabilities": {"supported": 0.5},
                    }
                ]
            },
        )


@pytest.fixture
def sglang_url() -> Any:
    server = ThreadingHTTPServer(("127.0.0.1", 0), SglangHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


@pytest.fixture
def jev_url() -> Any:
    server = ThreadingHTTPServer(("127.0.0.1", 0), JevHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


@pytest.fixture
def broken_jev_url() -> Any:
    server = ThreadingHTTPServer(("127.0.0.1", 0), BrokenJevHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def test_jev_decide_measures_latency_and_validates(jev_url: str) -> None:
    state = dual._jev_state(dual.JEV_STATE_SIZES["small"])
    result = dual._jev_decide(jev_url, state, dual._jev_question(0, len(state)))
    assert result["choice"] == "supported"
    assert result["latency_s"] > 0
    assert abs(sum(result["probabilities"].values()) - 1.0) < 0.001


def test_jev_decide_rejects_unnormalized_probabilities(broken_jev_url: str) -> None:
    state = dual._jev_state(dual.JEV_STATE_SIZES["small"])
    with pytest.raises(RuntimeError, match="probabilities sum"):
        dual._jev_decide(broken_jev_url, state, dual._jev_question(0, len(state)))


def test_require_jev_ready_accepts_status(jev_url: str) -> None:
    dual.require_jev_ready(jev_url)


def test_run_jev_scaling_records_choices_and_throughput(jev_url: str) -> None:
    phase = dual.run_jev_scaling(jev_url, "small", 2)
    assert phase["phase"] == "jev-small-c2"
    assert phase["completed"] == 2
    assert phase["errors"] == []
    assert phase["choices"]["supported"] == 2
    assert phase["throughput_req_s"] is not None and phase["throughput_req_s"] > 0
    assert "min_mem" in phase["telemetry_summary"]


def test_run_sglang_context_covers_two_lengths(sglang_url: str) -> None:
    short = dual.run_sglang_context(sglang_url, "4k", 2, drain_seconds=1)
    assert short["phase"] == "sglang-4k-c2"
    assert abs(short["prompt_tokens_each"] - 4_096) <= 128
    assert short["aggregate_output_tok_s"] > 0
    assert short["median_ttft_s"] is not None
    long = dual.run_sglang_context(sglang_url, "32k", 1, drain_seconds=1)
    assert abs(long["prompt_tokens_each"] - 32_768) <= 131


def test_run_joint_drives_both_services(sglang_url: str, jev_url: str) -> None:
    phase = dual.run_joint(
        sglang_url, jev_url, "4k", 2, 2, jev_size="small", drain_seconds=1
    )
    assert phase["phase"] == "joint-4k-sg2-jev2"
    assert phase["sglang"]["aggregate_output_tok_s"] > 0
    assert phase["openjev"]["completed"] == 2
    assert phase["openjev"]["errors"] == []
    assert phase["openjev"]["throughput_req_s"] > 0
