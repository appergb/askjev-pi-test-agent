#!/usr/bin/env python3
"""Measure SGLang chat performance with server-reported token counts.

Run this only after the existing ingress has entered maintenance mode and all
in-flight work has drained. The script verifies an idle scheduler, but it does
not block new external traffic by itself.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import http.client
import json
import random
import statistics
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import closing
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Self, cast

MODEL = "TRIPFZ-Alpha-27b"
CONTEXT_LENGTH = 262_144
OUTPUT_MIN_TOKENS = 1_024
OUTPUT_MAX_TOKENS = 1_152
SCENARIOS = {
    "4k": 4_096,
    "32k": 32_768,
    "128k": 131_072,
    "237k": 237_000,
}
SEED = 20_260_922


@dataclass(slots=True)
class TelemetrySample:
    elapsed_s: float
    mem_available_gib: float | None
    swap_in_pages: int | None
    swap_out_pages: int | None
    gpu_temp_c: float | None
    gpu_power_w: float | None
    gpu_sm_clock_mhz: float | None
    gpu_util_percent: float | None


@dataclass(slots=True)
class RunResult:
    config: str
    scenario: str
    repetition: int
    cache_state: str
    concurrency: int
    requested_input_tokens: int
    prompt_tokens: int
    cached_tokens: int
    completion_tokens: int
    reasoning_tokens: int | None
    answer_tokens: int | None
    first_chunk_tokens: int
    decode_measured_tokens: int
    ttft_s: float
    decode_s: float
    decode_tok_s: float
    e2e_s: float
    finish_reason: str | None
    output_sha256: str
    output_chars: int
    spec_tokens_details: dict[str, Any] | list[Any] | None
    min_mem_available_gib: float | None
    swap_in_pages_s: float | None
    swap_out_pages_s: float | None
    max_gpu_temp_c: float | None
    median_gpu_power_w: float | None
    median_gpu_sm_clock_mhz: float | None
    failure: str | None = None
    token_points: list[tuple[float, int]] = field(default_factory=list)
    first_answer_ttft_s: float | None = None
    reasoning_chars: int = 0
    answer_chars: int = 0
    output_text: str = ""
    server_usage: dict[str, Any] = field(default_factory=dict)


def _json_request(
    base_url: str,
    path: str,
    payload: dict[str, Any] | None = None,
    *,
    method: str | None = None,
    timeout: float = 120.0,
    expect_json: bool = True,
) -> Any:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base_url.rstrip("/") + path,
        data=data,
        method=method or ("POST" if data is not None else "GET"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{path} returned HTTP {exc.code}: {body[:1000]}") from exc
    if not body:
        return None
    return json.loads(body) if expect_json else body.decode("utf-8")


def _scheduler_load(base_url: str) -> tuple[int, int, int]:
    loads = _json_request(base_url, "/get_load")
    running = sum(int(item.get("num_reqs", 0)) for item in loads)
    waiting = sum(int(item.get("num_waiting_reqs", 0)) for item in loads)
    pending = sum(int(item.get("num_pending_tokens", 0)) for item in loads)
    return running, waiting, pending


def require_drained(base_url: str, seconds: int) -> None:
    """Wait for a continuous idle window, allowing asynchronous load-stat updates."""
    if seconds < 1:
        raise ValueError("drain observation must be positive")
    deadline = time.monotonic() + max(120, seconds * 3)
    idle_since: float | None = None
    while time.monotonic() < deadline:
        running, waiting, pending = _scheduler_load(base_url)
        if running or waiting or pending:
            idle_since = None
        elif idle_since is None:
            idle_since = time.monotonic()
        elif time.monotonic() - idle_since >= seconds:
            return
        time.sleep(1)
    raise RuntimeError("scheduler did not remain idle before the drain deadline")


def require_server_contract(base_url: str) -> dict[str, Any]:
    info = _json_request(base_url, "/get_server_info")
    if int(info.get("context_length", 0)) != CONTEXT_LENGTH:
        raise RuntimeError(
            f"context_length is {info.get('context_length')}, expected {CONTEXT_LENGTH}"
        )
    for state in info.get("internal_states", []):
        capacity = state.get("memory_usage", {}).get("token_capacity")
        if capacity is not None and int(capacity) < CONTEXT_LENGTH:
            raise RuntimeError(
                "allocated KV token capacity cannot hold the advertised context"
            )
    models = _json_request(base_url, "/v1/models")
    entries = {item.get("id"): item for item in models.get("data", [])}
    if MODEL not in entries:
        raise RuntimeError(f"served model {MODEL!r} is unavailable")
    if int(entries[MODEL].get("max_model_len", 0)) != CONTEXT_LENGTH:
        raise RuntimeError("model endpoint does not report the 262144-token contract")
    return cast(dict[str, Any], info)


def _record(index: int, rng: random.Random) -> str:
    components = (
        "scheduler",
        "tokenizer",
        "radix-cache",
        "tool-parser",
        "worker",
        "stream-proxy",
        "artifact-store",
        "test-runner",
        "queue",
        "api-gateway",
        "code-index",
        "sandbox",
        "schema-validator",
        "session-manager",
    )
    symptoms = (
        "latency rose after a cache eviction",
        "a retry preserved an old request id",
        "a structured field disappeared during streaming",
        "the queue briefly reordered work",
        "a generated patch failed only on the ARM runner",
        "a long prefill delayed a short reply",
        "the sampled output ended before the requested evidence table",
        "the fallback path used a different serialization order",
        "the regression appeared only after the third tool call",
        "the trace contained a cold prefix followed by a warm branch",
    )
    actions = (
        "compare target and draft timings",
        "retain the original schema contract",
        "isolate the first failing commit",
        "measure accepted output tokens only",
        "verify evidence at the beginning, middle, and end",
        "replay the saved test unchanged",
        "separate prefill from decode time",
        "preserve the 262144-token limit",
        "check the executable result rather than the prose claim",
        "correlate swap counters with request-level timestamps",
    )
    component = components[
        (index * 7 + rng.randrange(len(components))) % len(components)
    ]
    symptom = symptoms[(index * 11 + rng.randrange(len(symptoms))) % len(symptoms)]
    action = actions[(index * 13 + rng.randrange(len(actions))) % len(actions)]
    minute = (index * 37) % 1_440
    stamp = f"2026-09-{1 + index % 21:02d}T{minute // 60:02d}:{minute % 60:02d}:00Z"
    commit = hashlib.sha256(f"commit:{SEED}:{index}".encode()).hexdigest()[:12]
    request_id = hashlib.sha256(f"request:{SEED}:{index}".encode()).hexdigest()[:16]
    p50 = 90 + (index * 17) % 1_800
    p95 = p50 + 40 + (index * 29) % 2_400
    return (
        f"Record {index:05d} | {stamp} | component={component} | commit={commit} | "
        f"request={request_id}. Observation: {symptom}. The sampled p50 was {p50} ms "
        f"and p95 was {p95} ms across {8 + index % 91} requests. Required follow-up: "
        f"{action}. Confidence tag={['low', 'medium', 'high'][index % 3]}; "
        f"owner=team-{index % 17:02d}; shard={index % 23:02d}.\n"
    )


def _messages_for_records(records: list[str]) -> list[dict[str, str]]:
    front = "FRONT-EVIDENCE: release r17 retained tool schemas and passed executable checks."
    middle = "MIDDLE-EVIDENCE: trace m42 linked a long prefill to three short-request stalls."
    end = "END-EVIDENCE: rollback r18 restored JSON ordering but did not change decode speed."
    split = len(records) // 2
    dossier = front + "\n" + "".join(records[:split]) + middle + "\n"
    dossier += "".join(records[split:]) + end + "\n"
    task = (
        "Analyze this engineering dossier as a coding-agent incident review. Produce a detailed "
        "report with: an evidence timeline; at least eight distinct causal hypotheses; competing "
        "explanations; a prioritized experiment plan; rollback criteria; interface and quality "
        "risks; and a final decision table. Cite record numbers from different parts of the "
        "dossier and explicitly combine the FRONT, MIDDLE, and END evidence. Do not copy long "
        "passages. Keep reasoning enabled and develop the analysis fully.\n\nDOSSIER\n"
        + dossier
    )
    return [
        {
            "role": "system",
            "content": (
                "You are evaluating a real inference service. Preserve tool and schema semantics, "
                "distinguish measurements from hypotheses, and reason from the supplied evidence."
            ),
        },
        {"role": "user", "content": task},
    ]


def _token_count(
    base_url: str, messages: list[dict[str, str]], *, thinking: bool = True
) -> int:
    response = _json_request(
        base_url,
        "/v1/tokenize",
        {
            "model": MODEL,
            "messages": messages,
            "chat_template_kwargs": {"enable_thinking": thinking},
        },
        timeout=600,
    )
    return int(response["count"])


def build_prompt(base_url: str, target_tokens: int) -> tuple[list[dict[str, str]], int]:
    rng = random.Random(SEED)
    records = [_record(i, rng) for i in range(1, 14_001)]
    lo, hi = 1, len(records)
    best: tuple[int, int] | None = None
    while lo <= hi:
        mid = (lo + hi) // 2
        messages = _messages_for_records(records[:mid])
        count = _token_count(base_url, messages)
        distance = abs(count - target_tokens)
        if best is None or distance < best[0]:
            best = (distance, mid)
        if count < target_tokens:
            lo = mid + 1
        else:
            hi = mid - 1
    assert best is not None
    messages = _messages_for_records(records[: best[1]])
    count = _token_count(base_url, messages)
    if abs(count - target_tokens) > max(128, target_tokens // 250):
        raise RuntimeError(
            f"could not construct prompt near {target_tokens}: got {count}"
        )
    if count + OUTPUT_MAX_TOKENS > CONTEXT_LENGTH:
        raise RuntimeError(f"prompt {count} plus output exceeds context contract")
    return messages, count


def flush_cache(base_url: str) -> None:
    _json_request(
        base_url,
        "/flush_cache?timeout=120",
        method="POST",
        timeout=130,
        expect_json=False,
    )


def _read_meminfo() -> float | None:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) / 1024 / 1024
    except OSError:
        pass
    return None


def _read_vmstat() -> tuple[int | None, int | None]:
    try:
        values = {}
        for line in Path("/proc/vmstat").read_text().splitlines():
            key, value = line.split()
            if key in {"pswpin", "pswpout"}:
                values[key] = int(value)
        return values.get("pswpin"), values.get("pswpout")
    except (OSError, ValueError):
        return None, None


def _read_gpu() -> tuple[float | None, float | None, float | None, float | None]:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=temperature.gpu,power.draw,clocks.current.sm,utilization.gpu",
                "--format=csv,noheader,nounits",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        )
        cells = [cell.strip() for cell in result.stdout.splitlines()[0].split(",")]
        return tuple(None if cell in {"N/A", "[N/A]"} else float(cell) for cell in cells)  # type: ignore[return-value]
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return None, None, None, None


class Telemetry:
    def __init__(self, interval_s: float = 2.0) -> None:
        self.interval_s = interval_s
        self.samples: list[TelemetrySample] = []
        self._stop = threading.Event()
        self._started = 0.0
        self._thread = threading.Thread(target=self._run, daemon=True)

    def __enter__(self) -> Self:
        self._started = time.monotonic()
        self._thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self._stop.set()
        self._thread.join(timeout=self.interval_s + 3)

    def _run(self) -> None:
        while not self._stop.is_set():
            pin, pout = _read_vmstat()
            temp, power, clock, util = _read_gpu()
            self.samples.append(
                TelemetrySample(
                    elapsed_s=time.monotonic() - self._started,
                    mem_available_gib=_read_meminfo(),
                    swap_in_pages=pin,
                    swap_out_pages=pout,
                    gpu_temp_c=temp,
                    gpu_power_w=power,
                    gpu_sm_clock_mhz=clock,
                    gpu_util_percent=util,
                )
            )
            self._stop.wait(self.interval_s)


def _median(values: list[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    return statistics.median(present) if present else None


def _telemetry_summary(samples: list[TelemetrySample]) -> dict[str, float | None]:
    if not samples:
        return {
            "min_mem": None,
            "swap_in": None,
            "swap_out": None,
            "max_temp": None,
            "median_power": None,
            "median_clock": None,
        }
    duration = max(samples[-1].elapsed_s - samples[0].elapsed_s, 0.001)
    pins = [s.swap_in_pages for s in samples if s.swap_in_pages is not None]
    pouts = [s.swap_out_pages for s in samples if s.swap_out_pages is not None]
    memories = [s.mem_available_gib for s in samples if s.mem_available_gib is not None]
    temperatures = [s.gpu_temp_c for s in samples if s.gpu_temp_c is not None]
    return {
        "min_mem": min(memories) if memories else None,
        "swap_in": (pins[-1] - pins[0]) / duration if len(pins) > 1 else None,
        "swap_out": (pouts[-1] - pouts[0]) / duration if len(pouts) > 1 else None,
        "max_temp": max(temperatures) if temperatures else None,
        "median_power": _median([s.gpu_power_w for s in samples]),
        "median_clock": _median([s.gpu_sm_clock_mhz for s in samples]),
    }


def _stream_request(base_url: str, payload: dict[str, Any]) -> dict[str, Any]:
    parsed = urllib.parse.urlsplit(base_url)
    if parsed.scheme != "http" or parsed.hostname not in {
        "127.0.0.1",
        "localhost",
        "::1",
    }:
        raise ValueError("benchmark endpoint must use loopback HTTP")
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 80
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    with closing(http.client.HTTPConnection(host, port, timeout=1_800)) as connection:
        started = time.perf_counter()
        connection.request(
            "POST",
            (parsed.path.rstrip("/") if parsed.path else "") + "/v1/chat/completions",
            body=body,
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(len(body)),
            },
        )
        response = connection.getresponse()
        if response.status != 200:
            error = response.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"chat request returned HTTP {response.status}: {error[:2000]}"
            )
        return _measure_stream(response, started)


def _measure_stream(
    response: http.client.HTTPResponse, started: float
) -> dict[str, Any]:
    """Measure accepted server tokens, retaining missing breakdowns as unknown."""

    points: list[tuple[float, int]] = []
    first_output_at: float | None = None
    first_answer_at: float | None = None
    final_token_at: float | None = None
    first_chunk_tokens = 0
    usage: dict[str, Any] = {}
    reasoning: list[str] = []
    answer: list[str] = []
    spec_details: dict[str, Any] | list[Any] | None = None
    finish_reason: str | None = None
    done_at: float | None = None

    while True:
        raw = response.readline()
        if not raw:
            break
        line = raw.decode("utf-8", errors="replace").strip()
        if not line.startswith("data:"):
            continue
        now = time.perf_counter()
        value = line.removeprefix("data:").strip()
        if value == "[DONE]":
            done_at = now
            break
        event = json.loads(value)
        if event.get("error"):
            raise RuntimeError(f"streaming error: {event['error']}")
        if event.get("usage"):
            usage = event["usage"]
        sglext = event.get("sglext") or {}
        if sglext.get("spec_tokens_details") is not None:
            spec_details = sglext["spec_tokens_details"]
        choices = event.get("choices") or []
        if not choices:
            continue
        choice = choices[0]
        if choice.get("finish_reason"):
            finish_reason = choice["finish_reason"]
        delta = choice.get("delta") or {}
        reasoning_text = delta.get("reasoning_content") or delta.get("reasoning") or ""
        answer_text = delta.get("content") or ""
        if reasoning_text:
            reasoning.append(reasoning_text)
        if answer_text:
            answer.append(answer_text)
            if first_answer_at is None:
                first_answer_at = now
        if not (reasoning_text or answer_text):
            continue
        cumulative = int((event.get("usage") or {}).get("completion_tokens", 0))
        if cumulative <= 0:
            raise RuntimeError(
                "continuous server token counts were absent from an output chunk"
            )
        if points and cumulative < points[-1][1]:
            raise RuntimeError("server token counts decreased during streaming")
        elapsed = now - started
        if first_output_at is None:
            first_output_at = now
            first_chunk_tokens = cumulative
        if not points or cumulative > points[-1][1]:
            points.append((elapsed, cumulative))
            final_token_at = now

    if first_output_at is None or final_token_at is None or done_at is None:
        raise RuntimeError("stream ended without a complete measurable output")
    completion_tokens = int(usage.get("completion_tokens", 0))
    if completion_tokens > points[-1][1]:
        points.append((done_at - started, completion_tokens))
        final_token_at = done_at
    measured_tokens = completion_tokens - first_chunk_tokens
    decode_s = final_token_at - first_output_at
    if measured_tokens <= 0 or decode_s <= 0:
        raise RuntimeError(
            "insufficient post-first-chunk output for decode measurement"
        )
    details = usage.get("completion_tokens_details") or {}
    raw_reasoning_tokens = details.get(
        "reasoning_tokens", usage.get("reasoning_tokens")
    )
    reasoning_tokens = (
        int(raw_reasoning_tokens) if raw_reasoning_tokens is not None else None
    )
    if reasoning_tokens is not None and not 0 <= reasoning_tokens <= completion_tokens:
        # Some streaming implementations use sentinel/unsupported breakdowns.
        # Preserve the raw value without invalidating the accepted-token metric.
        reasoning_tokens = None
    prompt_details = usage.get("prompt_tokens_details") or {}
    output = "".join(reasoning) + "\n<FINAL>\n" + "".join(answer)
    return {
        "prompt_tokens": int(usage.get("prompt_tokens", 0)),
        "cached_tokens": int(prompt_details.get("cached_tokens", 0) or 0),
        "completion_tokens": completion_tokens,
        "reasoning_tokens": reasoning_tokens,
        "server_usage": usage,
        "answer_tokens": (
            completion_tokens - reasoning_tokens
            if reasoning_tokens is not None
            else None
        ),
        "first_answer_ttft_s": (
            first_answer_at - started if first_answer_at is not None else None
        ),
        "reasoning_chars": sum(map(len, reasoning)),
        "answer_chars": sum(map(len, answer)),
        "output_text": output,
        "first_chunk_tokens": first_chunk_tokens,
        "decode_measured_tokens": measured_tokens,
        "ttft_s": first_output_at - started,
        "decode_s": decode_s,
        "decode_tok_s": measured_tokens / decode_s,
        "e2e_s": done_at - started,
        "finish_reason": finish_reason,
        "output_sha256": hashlib.sha256(output.encode()).hexdigest(),
        "output_chars": len(output),
        "spec_tokens_details": spec_details,
        "token_points": points,
    }


def run_once(
    base_url: str,
    config: str,
    scenario: str,
    repetition: int,
    cache_state: str,
    messages: list[dict[str, str]],
    expected_prompt_tokens: int,
) -> tuple[RunResult, list[TelemetrySample]]:
    payload = {
        "model": MODEL,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True, "continuous_usage_stats": True},
        "max_completion_tokens": OUTPUT_MAX_TOKENS,
        "min_tokens": OUTPUT_MIN_TOKENS,
        "temperature": 0.6,
        "top_p": 0.95,
        "top_k": 20,
        "seed": SEED + repetition,
        "chat_template_kwargs": {"enable_thinking": True},
        "separate_reasoning": True,
        "stream_reasoning": True,
        "return_spec_tokens_details": True,
        "tool_choice": "none",
    }
    with Telemetry() as telemetry:
        measured = _stream_request(base_url, payload)
    summary = _telemetry_summary(telemetry.samples)
    result = RunResult(
        config=config,
        scenario=scenario,
        repetition=repetition,
        cache_state=cache_state,
        concurrency=1,
        requested_input_tokens=SCENARIOS[scenario],
        prompt_tokens=measured["prompt_tokens"],
        cached_tokens=measured["cached_tokens"],
        completion_tokens=measured["completion_tokens"],
        reasoning_tokens=measured["reasoning_tokens"],
        answer_tokens=measured["answer_tokens"],
        first_chunk_tokens=measured["first_chunk_tokens"],
        decode_measured_tokens=measured["decode_measured_tokens"],
        ttft_s=measured["ttft_s"],
        decode_s=measured["decode_s"],
        decode_tok_s=measured["decode_tok_s"],
        e2e_s=measured["e2e_s"],
        finish_reason=measured["finish_reason"],
        output_sha256=measured["output_sha256"],
        output_chars=measured["output_chars"],
        spec_tokens_details=measured["spec_tokens_details"],
        min_mem_available_gib=summary["min_mem"],
        swap_in_pages_s=summary["swap_in"],
        swap_out_pages_s=summary["swap_out"],
        max_gpu_temp_c=summary["max_temp"],
        median_gpu_power_w=summary["median_power"],
        median_gpu_sm_clock_mhz=summary["median_clock"],
        token_points=measured["token_points"],
        first_answer_ttft_s=measured["first_answer_ttft_s"],
        reasoning_chars=measured["reasoning_chars"],
        answer_chars=measured["answer_chars"],
        output_text=measured["output_text"],
        server_usage=measured["server_usage"],
    )
    if result.prompt_tokens != expected_prompt_tokens:
        result.failure = (
            f"tokenizer count changed: prepared={expected_prompt_tokens} "
            f"response={result.prompt_tokens}"
        )
    elif result.completion_tokens < OUTPUT_MIN_TOKENS:
        result.failure = f"only {result.completion_tokens} completion tokens"
    return result, telemetry.samples


def _write_csv(path: Path, results: list[RunResult]) -> None:
    excluded = {"token_points", "spec_tokens_details", "output_text", "server_usage"}
    fields = [name for name in RunResult.__dataclass_fields__ if name not in excluded]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for result in results:
            row = asdict(result)
            writer.writerow({key: row[key] for key in fields})


def _write_summary(path: Path, results: list[RunResult]) -> None:
    lines = [
        "# SGLang benchmark summary",
        "",
        (
            "Decode tok/s counts server-reported accepted completion tokens after the first output "
            "chunk, divided by the time from the first output chunk to the final accepted token. "
            "This excludes all tokens in the first potentially multi-token chunk."
        ),
        "",
        "Cold input tok/s is prompt_tokens / TTFT, including client/server overhead; it is not a GPU-only prefill measurement.",
        "",
        "| scenario | cache | runs | median decode tok/s | minimum decode tok/s | median TTFT s | cold input tok/s | failures |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for scenario in SCENARIOS:
        for cache_state in ("cold", "hot"):
            selected = [
                result
                for result in results
                if result.scenario == scenario and result.cache_state == cache_state
            ]
            if not selected:
                continue
            speeds = [r.decode_tok_s for r in selected if r.failure is None]
            ttfts = [r.ttft_s for r in selected if r.failure is None]
            failures = sum(r.failure is not None for r in selected)
            input_rates = [
                r.prompt_tokens / r.ttft_s
                for r in selected
                if r.failure is None and cache_state == "cold" and r.cached_tokens == 0
            ]
            input_rate = f"{statistics.median(input_rates):.2f}" if input_rates else "—"
            lines.append(
                f"| {scenario} | {cache_state} | {len(selected)} | "
                f"{statistics.median(speeds):.2f} | {min(speeds):.2f} | "
                f"{statistics.median(ttfts):.2f} | {input_rate} | {failures} |"
                if speeds
                else f"| {scenario} | {cache_state} | {len(selected)} | — | — | — | — | {failures} |"
            )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:30000")
    parser.add_argument(
        "--config", required=True, help="exact candidate configuration label"
    )
    parser.add_argument(
        "--scenario",
        action="append",
        choices=tuple(SCENARIOS),
        help="repeat to select scenarios; defaults to all",
    )
    parser.add_argument("--repetitions", type=int, default=3)
    parser.add_argument("--drain-observation-seconds", type=int, default=30)
    parser.add_argument("--output-root", default="artifacts/sglang-benchmarks")
    parser.add_argument(
        "--maintenance-acknowledged",
        action="store_true",
        help="confirm that an authorized external maintenance/drain mechanism blocks new traffic",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.maintenance_acknowledged:
        raise SystemExit(
            "refusing live benchmark: use the authorized ingress maintenance/drain mechanism, "
            "then pass --maintenance-acknowledged"
        )
    if args.repetitions < 1:
        raise SystemExit("--repetitions must be positive")
    parsed = urllib.parse.urlsplit(args.base_url)
    if parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("benchmark must run on the node against the loopback service")

    server_info = require_server_contract(args.base_url)
    require_drained(args.base_url, args.drain_observation_seconds)
    selected = args.scenario or list(SCENARIOS)
    prompts: dict[str, tuple[list[dict[str, str]], int]] = {}
    for scenario in selected:
        prompts[scenario] = build_prompt(args.base_url, SCENARIOS[scenario])
        print(
            f"prepared {scenario}: {prompts[scenario][1]} actual input tokens",
            flush=True,
        )

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(args.output_root) / f"{timestamp}-{args.config}"
    out_dir.mkdir(parents=True, exist_ok=False)
    manifest = {
        "timestamp": timestamp,
        "config": args.config,
        "model": MODEL,
        "seed": SEED,
        "context_length": CONTEXT_LENGTH,
        "output_min_tokens": OUTPUT_MIN_TOKENS,
        "output_max_tokens": OUTPUT_MAX_TOKENS,
        "sampling": {"temperature": 0.6, "top_p": 0.95, "top_k": 20},
        "thinking": True,
        "server_info": server_info,
        "prompts": {name: count for name, (_, count) in prompts.items()},
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    results: list[RunResult] = []

    def save_result(result: RunResult, samples: list[TelemetrySample]) -> None:
        """Preserve each completed request even if the following request fails."""
        results.append(result)
        run_name = f"{result.scenario}-r{result.repetition}-{result.cache_state}"
        (out_dir / f"{run_name}-telemetry.json").write_text(
            json.dumps([asdict(s) for s in samples], indent=2) + "\n", encoding="utf-8"
        )
        (out_dir / "results.json").write_text(
            json.dumps([asdict(item) for item in results], indent=2) + "\n",
            encoding="utf-8",
        )
        _write_csv(out_dir / "results.csv", results)
        _write_summary(out_dir / "summary.md", results)
        print(
            f"{run_name}: {result.decode_tok_s:.2f} tok/s, TTFT {result.ttft_s:.3f}s",
            flush=True,
        )

    for scenario in selected:
        messages, token_count = prompts[scenario]
        for repetition in range(1, args.repetitions + 1):
            require_drained(args.base_url, 5)
            flush_cache(args.base_url)
            cold, cold_samples = run_once(
                args.base_url,
                args.config,
                scenario,
                repetition,
                "cold",
                messages,
                token_count,
            )
            save_result(cold, cold_samples)
            require_drained(args.base_url, 5)
            hot, hot_samples = run_once(
                args.base_url,
                args.config,
                scenario,
                repetition,
                "hot",
                messages,
                token_count,
            )
            save_result(hot, hot_samples)

    return 0 if all(result.failure is None for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
