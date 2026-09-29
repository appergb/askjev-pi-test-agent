#!/usr/bin/env python3
"""Run the 8-way and mixed-prefill SGLang load scenarios."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import statistics
import time
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from benchmark_sglang import (
    MODEL,
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


def _payload(
    messages: list[dict[str, str]], seed: int, output_tokens: int
) -> dict[str, Any]:
    return {
        "model": MODEL,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True, "continuous_usage_stats": True},
        "max_completion_tokens": output_tokens,
        "min_tokens": min(384, output_tokens),
        "temperature": 0.6,
        "top_p": 0.95,
        "top_k": 20,
        "seed": seed,
        "chat_template_kwargs": {"enable_thinking": True},
        "separate_reasoning": True,
        "stream_reasoning": True,
        "return_spec_tokens_details": True,
        "tool_choice": "none",
    }


def run_concurrency(base_url: str) -> dict[str, Any]:
    messages, prompt_tokens = build_prompt(base_url, SCENARIOS["4k"])
    flush_cache(base_url)
    require_drained(base_url, 5)
    started = time.perf_counter()
    with Telemetry() as telemetry, concurrent.futures.ThreadPoolExecutor(
        max_workers=8
    ) as pool:
        futures = [
            pool.submit(_stream_request, base_url, _payload(messages, SEED + i, 512))
            for i in range(8)
        ]
        results = [future.result() for future in futures]
    wall_s = time.perf_counter() - started
    total_output = sum(item["completion_tokens"] for item in results)
    return {
        "scenario": "8-concurrent",
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


def run_mixed(base_url: str) -> dict[str, Any]:
    long_messages, long_tokens = build_prompt(base_url, SCENARIOS["128k"])
    short_messages, short_tokens = build_prompt(base_url, SCENARIOS["4k"])
    flush_cache(base_url)
    require_drained(base_url, 5)
    started = time.perf_counter()
    with Telemetry() as telemetry, concurrent.futures.ThreadPoolExecutor(
        max_workers=2
    ) as pool:
        long_future = pool.submit(
            _stream_request, base_url, _payload(long_messages, SEED + 100, 1_152)
        )
        time.sleep(2)
        short_started = time.perf_counter()
        short_future = pool.submit(
            _stream_request, base_url, _payload(short_messages, SEED + 101, 512)
        )
        short_result = short_future.result()
        long_result = long_future.result()
    return {
        "scenario": "mixed-128k-prefill-plus-4k",
        "wall_s": time.perf_counter() - started,
        "launch_gap_s": short_started - started,
        "long_prompt_tokens": long_tokens,
        "short_prompt_tokens": short_tokens,
        "long_request": long_result,
        "short_request": short_result,
        "telemetry": [asdict(sample) for sample in telemetry.samples],
        "telemetry_summary": _telemetry_summary(telemetry.samples),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:30000")
    parser.add_argument("--config", required=True)
    parser.add_argument("--output-root", default="artifacts/sglang-benchmarks")
    parser.add_argument("--maintenance-acknowledged", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.maintenance_acknowledged:
        raise SystemExit(
            "refusing load test without an authorized maintenance/drain state"
        )
    require_server_contract(args.base_url)
    require_drained(args.base_url, 30)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(args.output_root) / f"{timestamp}-{args.config}-load"
    out_dir.mkdir(parents=True, exist_ok=False)
    concurrency = run_concurrency(args.base_url)
    (out_dir / "8-concurrent.json").write_text(
        json.dumps(concurrency, indent=2) + "\n", encoding="utf-8"
    )
    require_drained(args.base_url, 10)
    mixed = run_mixed(args.base_url)
    (out_dir / "mixed-load.json").write_text(
        json.dumps(mixed, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "output": str(out_dir),
                "aggregate_output_tok_s": concurrency["aggregate_output_tok_s"],
                "mixed_short_ttft_s": mixed["short_request"]["ttft_s"],
                "mixed_short_decode_tok_s": mixed["short_request"]["decode_tok_s"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
