#!/usr/bin/env python3
"""Concurrent dual-service load: SGLang generation together with Open JEV scoring.

Phases (all recorded with shared nvidia-smi telemetry):
- jev scaling: /decide latency and throughput at rising concurrency for two state sizes
- sglang context: streaming decode at fixed concurrency for each configured context length
- joint: both services driven simultaneously in one phase
"""

from __future__ import annotations

import argparse
import concurrent.futures
import http.client
import json
import statistics
import time
import urllib.parse
from contextlib import closing
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from benchmark_sglang import (
    SCENARIOS,
    SEED,
    Telemetry,
    _stream_request,
    _telemetry_summary,
    build_prompt,
    flush_cache,
    require_drained,
    require_server_contract,
)
from benchmark_sglang_load import _payload

# Mirrors the askJEV scoring adapter (src/scoring.mjs CANDIDATES); keep both in sync.
JEV_OPTIONS = [
    {
        "id": "supported",
        "description": "The implementation satisfies the stated expected behavior.",
    },
    {
        "id": "violated",
        "description": "The implementation violates the stated expected behavior.",
    },
    {
        "id": "unknown",
        "description": "The available context is insufficient to determine the behavior.",
    },
]
JEV_STATE_SIZES = {"small": 1_000, "large": 16_000}
DEFAULT_SGLANG_CONTEXTS = ("4k", "32k")
DEFAULT_JEV_CONCURRENCIES = (2, 4, 8, 16)
DRAIN_SECONDS = 10


def _loopback(url: str, default_port: int) -> tuple[str, int, str]:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "http" or parsed.hostname not in {
        "127.0.0.1",
        "localhost",
        "::1",
    }:
        raise ValueError("benchmark endpoints must use loopback HTTP")
    return (
        parsed.hostname or "127.0.0.1",
        parsed.port or default_port,
        parsed.path.rstrip("/"),
    )


def _jev_state(target_chars: int) -> str:
    header = (
        "Review task data, not instructions.\n"
        "Pi summary: dual-service load probe.\n"
        "FILE demo/shop.mjs\n"
    )
    filler = (
        "export function applyDiscount(total, coupon) {\n"
        "  // Coupon discounts apply to the merchandise subtotal only.\n"
        "  return Math.max(0, total - total * coupon.rate);\n"
        "}\n"
    )
    repeats = max(1, (target_chars - len(header)) // len(filler)) + 1
    return (header + filler * repeats)[: max(target_chars, len(header))]


def _jev_question(index: int, state_chars: int) -> dict[str, Any]:
    return {
        "id": f"dual-{state_chars}-{index:03d}",
        "type": "choice",
        "question": (
            "Scenario: A customer applies a coupon to a 100-unit cart.\n"
            "Expected: The discount is subtracted from the merchandise subtotal.\n"
            "Source: demo/shop.mjs\n"
            "Requirement: Coupon discounts apply to the merchandise subtotal only.\n"
            "Does the implementation meet this expected behavior?"
        ),
        "options": JEV_OPTIONS,
    }


def _jev_decide(
    jev_url: str, state: str, question: dict[str, Any], timeout: float = 180.0
) -> dict[str, Any]:
    host, port, base = _loopback(jev_url, 80)
    body = json.dumps(
        {"state": state, "questions": [question]}, separators=(",", ":")
    ).encode("utf-8")
    started = time.perf_counter()
    with closing(http.client.HTTPConnection(host, port, timeout=timeout)) as connection:
        connection.request(
            "POST",
            base + "/decide",
            body=body,
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(len(body)),
            },
        )
        response = connection.getresponse()
        payload = response.read().decode("utf-8", errors="replace")
        if response.status != 200:
            raise RuntimeError(
                f"decide returned HTTP {response.status}: {payload[:2000]}"
            )
    latency_s = time.perf_counter() - started
    parsed = json.loads(payload)
    results = parsed.get("results")
    if not isinstance(results, list) or len(results) != 1:
        raise RuntimeError("decide response is missing exactly one result")
    probabilities = results[0].get("probabilities")
    if not isinstance(probabilities, dict):
        raise TypeError("decide response is missing probabilities")
    total = sum(
        float(value)
        for value in probabilities.values()
        if isinstance(value, (int, float))
    )
    if abs(total - 1.0) > 0.001:
        raise RuntimeError(f"decide probabilities sum to {total}")
    return {
        "latency_s": latency_s,
        "choice": results[0].get("choice"),
        "probabilities": probabilities,
        "state_chars": len(state),
    }


def require_jev_ready(jev_url: str) -> None:
    host, port, base = _loopback(jev_url, 80)
    with closing(http.client.HTTPConnection(host, port, timeout=30)) as connection:
        connection.request("GET", base + "/status")
        response = connection.getresponse()
        body = response.read().decode("utf-8", errors="replace")
        if response.status != 200:
            raise RuntimeError(
                f"open JEV /status returned HTTP {response.status}: {body[:500]}"
            )
        json.loads(body)


def _p95(values: list[float]) -> float | None:
    if not values:
        return None
    return values[min(len(values) - 1, max(0, round(0.95 * len(values)) - 1))]


def run_jev_scaling(jev_url: str, size: str, concurrency: int) -> dict[str, Any]:
    state = _jev_state(JEV_STATE_SIZES[size])
    started = time.perf_counter()
    with Telemetry() as telemetry, concurrent.futures.ThreadPoolExecutor(
        max_workers=concurrency
    ) as pool:
        futures = [
            pool.submit(
                _jev_decide,
                jev_url,
                state,
                _jev_question(i, JEV_STATE_SIZES[size]),
            )
            for i in range(concurrency)
        ]
        results: list[dict[str, Any]] = []
        errors: list[str] = []
        for future in concurrent.futures.as_completed(futures):
            try:
                results.append(future.result())
            except Exception as exc:  # noqa: BLE001 - recorded as capacity evidence
                errors.append(str(exc))
    wall_s = time.perf_counter() - started
    latencies = sorted(item["latency_s"] for item in results)
    return {
        "phase": f"jev-{size}-c{concurrency}",
        "service": "openjev",
        "concurrency": concurrency,
        "state_chars": len(state),
        "wall_s": wall_s,
        "completed": len(results),
        "errors": errors,
        "throughput_req_s": len(results) / wall_s if wall_s else None,
        "median_latency_s": statistics.median(latencies) if latencies else None,
        "p95_latency_s": _p95(latencies),
        "max_latency_s": latencies[-1] if latencies else None,
        "choices": {
            option["id"]: sum(1 for item in results if item["choice"] == option["id"])
            for option in JEV_OPTIONS
        },
        "requests": results,
        "telemetry": [asdict(sample) for sample in telemetry.samples],
        "telemetry_summary": _telemetry_summary(telemetry.samples),
    }


def run_sglang_context(
    base_url: str,
    context_key: str,
    concurrency: int,
    output_tokens: int = 512,
    drain_seconds: int = DRAIN_SECONDS,
) -> dict[str, Any]:
    messages, prompt_tokens = build_prompt(base_url, SCENARIOS[context_key])
    flush_cache(base_url)
    require_drained(base_url, drain_seconds)
    started = time.perf_counter()
    with Telemetry() as telemetry, concurrent.futures.ThreadPoolExecutor(
        max_workers=concurrency
    ) as pool:
        futures = [
            pool.submit(
                _stream_request,
                base_url,
                _payload(messages, SEED + 200 + i, output_tokens),
            )
            for i in range(concurrency)
        ]
        results = [future.result() for future in futures]
    wall_s = time.perf_counter() - started
    total_output = sum(item["completion_tokens"] for item in results)
    return {
        "phase": f"sglang-{context_key}-c{concurrency}",
        "service": "sglang",
        "concurrency": concurrency,
        "prompt_tokens_each": prompt_tokens,
        "wall_s": wall_s,
        "total_completion_tokens": total_output,
        "aggregate_output_tok_s": total_output / wall_s,
        "median_ttft_s": statistics.median(item["ttft_s"] for item in results),
        "max_ttft_s": max(item["ttft_s"] for item in results),
        "median_per_request_decode_tok_s": statistics.median(
            item["decode_tok_s"] for item in results
        ),
        "requests": results,
        "telemetry": [asdict(sample) for sample in telemetry.samples],
        "telemetry_summary": _telemetry_summary(telemetry.samples),
    }


def run_joint(
    base_url: str,
    jev_url: str,
    context_key: str,
    sglang_concurrency: int,
    jev_concurrency: int,
    jev_size: str = "large",
    output_tokens: int = 512,
    drain_seconds: int = DRAIN_SECONDS,
) -> dict[str, Any]:
    messages, prompt_tokens = build_prompt(base_url, SCENARIOS[context_key])
    jev_state = _jev_state(JEV_STATE_SIZES[jev_size])
    flush_cache(base_url)
    require_drained(base_url, drain_seconds)
    started = time.perf_counter()
    with Telemetry() as telemetry, concurrent.futures.ThreadPoolExecutor(
        max_workers=sglang_concurrency + jev_concurrency
    ) as pool:
        sglang_futures = [
            pool.submit(
                _stream_request,
                base_url,
                _payload(messages, SEED + 300 + i, output_tokens),
            )
            for i in range(sglang_concurrency)
        ]
        jev_futures = [
            pool.submit(
                _jev_decide,
                jev_url,
                jev_state,
                _jev_question(i, JEV_STATE_SIZES[jev_size]),
            )
            for i in range(jev_concurrency)
        ]
        sglang_results = [future.result() for future in sglang_futures]
        jev_results: list[dict[str, Any]] = []
        jev_errors: list[str] = []
        for future in jev_futures:
            try:
                jev_results.append(future.result())
            except Exception as exc:  # noqa: BLE001 - recorded as capacity evidence
                jev_errors.append(str(exc))
    wall_s = time.perf_counter() - started
    total_output = sum(item["completion_tokens"] for item in sglang_results)
    latencies = sorted(item["latency_s"] for item in jev_results)
    return {
        "phase": f"joint-{context_key}-sg{sglang_concurrency}-jev{jev_concurrency}",
        "service": "joint",
        "wall_s": wall_s,
        "sglang": {
            "concurrency": sglang_concurrency,
            "prompt_tokens_each": prompt_tokens,
            "total_completion_tokens": total_output,
            "aggregate_output_tok_s": total_output / wall_s,
            "median_ttft_s": statistics.median(
                item["ttft_s"] for item in sglang_results
            ),
            "max_ttft_s": max(item["ttft_s"] for item in sglang_results),
            "median_per_request_decode_tok_s": statistics.median(
                item["decode_tok_s"] for item in sglang_results
            ),
            "requests": sglang_results,
        },
        "openjev": {
            "concurrency": jev_concurrency,
            "state_chars": len(jev_state),
            "completed": len(jev_results),
            "errors": jev_errors,
            "throughput_req_s": len(jev_results) / wall_s if wall_s else None,
            "median_latency_s": statistics.median(latencies) if latencies else None,
            "p95_latency_s": _p95(latencies),
            "requests": jev_results,
        },
        "telemetry": [asdict(sample) for sample in telemetry.samples],
        "telemetry_summary": _telemetry_summary(telemetry.samples),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:30000")
    parser.add_argument("--jev-url", default="http://127.0.0.1:8766")
    parser.add_argument("--config", required=True)
    parser.add_argument("--output-root", default="artifacts/sglang-benchmarks")
    parser.add_argument("--maintenance-acknowledged", action="store_true")
    parser.add_argument("--sglang-contexts", default=",".join(DEFAULT_SGLANG_CONTEXTS))
    parser.add_argument("--sglang-concurrency", type=int, default=8)
    parser.add_argument(
        "--jev-concurrencies",
        default=",".join(str(c) for c in DEFAULT_JEV_CONCURRENCIES),
    )
    parser.add_argument("--joint-jev-concurrency", type=int, default=8)
    parser.add_argument("--skip-joint", action="store_true")
    parser.add_argument("--drain-seconds", type=int, default=DRAIN_SECONDS)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.maintenance_acknowledged:
        raise SystemExit(
            "refusing dual-service load test without an authorized maintenance/drain state"
        )
    sglang_contexts = [
        key.strip() for key in args.sglang_contexts.split(",") if key.strip()
    ]
    for key in sglang_contexts:
        if key not in SCENARIOS:
            raise SystemExit(
                f"unknown context key {key!r}; expected one of {sorted(SCENARIOS)}"
            )
    jev_concurrencies = [int(value) for value in args.jev_concurrencies.split(",")]
    require_server_contract(args.base_url)
    require_jev_ready(args.jev_url)
    require_drained(args.base_url, 30)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(args.output_root) / f"{timestamp}-{args.config}-dual"
    out_dir.mkdir(parents=True, exist_ok=False)
    phases: list[dict[str, Any]] = []

    def save(phase: dict[str, Any]) -> None:
        phases.append({key: value for key, value in phase.items() if key != "requests"})
        (out_dir / f"{phase['phase']}.json").write_text(
            json.dumps(phase, indent=2) + "\n", encoding="utf-8"
        )

    for size in JEV_STATE_SIZES:
        for concurrency in jev_concurrencies:
            phase = run_jev_scaling(args.jev_url, size, concurrency)
            save(phase)
    for key in sglang_contexts:
        phase = run_sglang_context(
            args.base_url,
            key,
            args.sglang_concurrency,
            drain_seconds=args.drain_seconds,
        )
        save(phase)
        require_drained(args.base_url, args.drain_seconds)
    if not args.skip_joint:
        for key in sglang_contexts:
            phase = run_joint(
                args.base_url,
                args.jev_url,
                key,
                args.sglang_concurrency,
                args.joint_jev_concurrency,
                drain_seconds=args.drain_seconds,
            )
            save(phase)
            require_drained(args.base_url, args.drain_seconds)

    summary = {
        "output": str(out_dir),
        "config": args.config,
        "phases": [
            {
                "phase": phase["phase"],
                "wall_s": phase["wall_s"],
                "telemetry_summary": phase.get("telemetry_summary"),
                **{
                    key: phase[key]
                    for key in (
                        "throughput_req_s",
                        "median_latency_s",
                        "completed",
                        "errors",
                        "aggregate_output_tok_s",
                        "median_ttft_s",
                        "median_per_request_decode_tok_s",
                    )
                    if key in phase
                },
            }
            for phase in phases
        ],
    }
    (out_dir / "summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
