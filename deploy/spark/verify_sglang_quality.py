#!/usr/bin/env python3
"""Run fixed schema, tool, code, and long-context quality checks."""

from __future__ import annotations

import argparse
import json
import random
import re
import subprocess
import time
import uuid
from collections.abc import Callable
from contextvars import ContextVar
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from benchmark_sglang import (
    MODEL,
    SEED,
    _json_request,
    _record,
    _token_count,
    require_drained,
    require_server_contract,
)

THINKING: ContextVar[bool] = ContextVar("quality_thinking", default=True)


def chat(base_url: str, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": MODEL,
        "temperature": 0.0,
        "seed": SEED,
        "max_completion_tokens": 768,
        "chat_template_kwargs": {"enable_thinking": THINKING.get()},
        "separate_reasoning": True,
    }
    payload.update(overrides)
    started = time.perf_counter()
    response = cast(
        dict[str, Any],
        _json_request(base_url, "/v1/chat/completions", payload, timeout=1_800),
    )
    response["benchmark_client_e2e_s"] = time.perf_counter() - started
    return response


def message(response: dict[str, Any]) -> dict[str, Any]:
    return cast(dict[str, Any], response["choices"][0]["message"])


def schema_check(base_url: str) -> tuple[bool, str, dict[str, Any]]:
    response = chat(
        base_url,
        messages=[
            {
                "role": "user",
                "content": (
                    "Return a structured release decision. The observed tests are 18 passed, "
                    "2 failed, and the rollback is required."
                ),
            }
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "release_decision",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "passed": {"type": "integer"},
                        "failed": {"type": "integer"},
                        "rollback": {"type": "boolean"},
                    },
                    "required": ["passed", "failed", "rollback"],
                    "additionalProperties": False,
                },
            },
        },
    )
    try:
        parsed = json.loads(message(response).get("content") or "")
        ok = parsed == {"passed": 18, "failed": 2, "rollback": True}
        return (
            ok,
            "exact schema values" if ok else f"unexpected value: {parsed}",
            response,
        )
    except (json.JSONDecodeError, TypeError) as exc:
        return False, f"invalid JSON: {exc}", response


def tool_check(base_url: str) -> tuple[bool, str, dict[str, Any]]:
    response = chat(
        base_url,
        messages=[
            {
                "role": "user",
                "content": "Schedule regression suite core-api for revision 482ca0f at priority 7.",
            }
        ],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "schedule_regression",
                    "description": "Schedule a named regression suite.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "suite": {"type": "string"},
                            "revision": {"type": "string"},
                            "priority": {"type": "integer"},
                        },
                        "required": ["suite", "revision", "priority"],
                        "additionalProperties": False,
                    },
                },
            }
        ],
        tool_choice="required",
    )
    calls = message(response).get("tool_calls") or []
    try:
        function = calls[0]["function"]
        arguments = json.loads(function["arguments"])
        expected = {"suite": "core-api", "revision": "482ca0f", "priority": 7}
        ok = function["name"] == "schedule_regression" and arguments == expected
        return (
            ok,
            "exact tool call" if ok else f"unexpected tool call: {calls}",
            response,
        )
    except (IndexError, KeyError, TypeError, json.JSONDecodeError) as exc:
        return False, f"invalid tool call: {exc}", response


def _extract_python(text: str) -> str:
    match = re.search(r"```(?:python)?\s*\n(.*?)```", text, re.DOTALL | re.IGNORECASE)
    return match.group(1) if match else text


def code_check(base_url: str) -> tuple[bool, str, dict[str, Any]]:
    response = chat(
        base_url,
        temperature=0.2,
        max_completion_tokens=3_072,
        messages=[
            {
                "role": "user",
                "content": (
                    "Write Python 3.11 code for normalize_ranges(items). Each item is a pair of "
                    "integers [start, end]. Reject start > end with ValueError, merge overlapping "
                    "or directly adjacent ranges, do not mutate the input, and return list[tuple[int, int]]. "
                    "Return one executable code block defining only the function."
                ),
            }
        ],
    )
    source = _extract_python(message(response).get("content") or "")
    tests = """
assert normalize_ranges([]) == []
assert normalize_ranges([[5, 7], [1, 2], [3, 4], [10, 10]]) == [(1, 7), (10, 10)]
items = [[1, 3], [2, 6], [8, 9]]
copy = [row[:] for row in items]
assert normalize_ranges(items) == [(1, 6), (8, 9)]
assert items == copy
try:
    normalize_ranges([[4, 3]])
except ValueError:
    pass
else:
    raise AssertionError("expected ValueError")
"""
    container = "sglang-quality-" + uuid.uuid4().hex
    try:
        completed = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "--pull=never",
                "--name",
                container,
                "--network=none",
                "--read-only",
                "--cap-drop=ALL",
                "--security-opt=no-new-privileges",
                "--pids-limit=32",
                "--memory=256m",
                "--cpus=1",
                "--user=65534:65534",
                "-i",
                "--entrypoint=python",
                "lmsysorg/sglang:v0.5.19-cu130-runtime",
                "-I",
                "-S",
                "-",
            ],
            input=source + "\n" + tests,
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        ok = completed.returncode == 0
        detail = (
            "executable tests passed"
            if ok
            else (completed.stderr or completed.stdout)[-1000:]
        )
        return ok, detail, response
    except (OSError, subprocess.SubprocessError) as exc:
        return False, f"execution failed: {exc}", response
    finally:
        subprocess.run(
            ["docker", "rm", "-f", container],
            capture_output=True,
            timeout=10,
            check=False,
        )


def _long_messages(
    base_url: str, target: int = 131_072
) -> tuple[list[dict[str, str]], int]:
    rng = random.Random(SEED + 700)
    records = [_record(i, rng) for i in range(1, 10_001)]

    def build(count: int) -> list[dict[str, str]]:
        split1 = count // 2
        content = (
            "FRONT FACT: code ALPHA-173 identifies release r17.\n"
            + "".join(records[:split1])
            + "MIDDLE FACT: code BETA-284 identifies component queue.\n"
            + "".join(records[split1:count])
            + "END FACT: code GAMMA-395 identifies action rollback.\n"
            + (
                "Return JSON with front, middle, end, and composite. The first three values are "
                "the exact codes. composite must join release, component, and action with slashes."
            )
        )
        return [{"role": "user", "content": content}]

    lo, hi = 1, len(records)
    best: tuple[int, int] | None = None
    while lo <= hi:
        mid = (lo + hi) // 2
        count = _token_count(base_url, build(mid), thinking=THINKING.get())
        distance = abs(count - target)
        if best is None or distance < best[0]:
            best = (distance, mid)
        if count < target:
            lo = mid + 1
        else:
            hi = mid - 1
    assert best is not None
    messages = build(best[1])
    return messages, _token_count(base_url, messages, thinking=THINKING.get())


def long_context_check(base_url: str) -> tuple[bool, str, dict[str, Any]]:
    messages, prompt_tokens = _long_messages(base_url)
    response = chat(
        base_url,
        messages=messages,
        max_completion_tokens=768,
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "evidence_join",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "front": {"type": "string"},
                        "middle": {"type": "string"},
                        "end": {"type": "string"},
                        "composite": {"type": "string"},
                    },
                    "required": ["front", "middle", "end", "composite"],
                    "additionalProperties": False,
                },
            },
        },
    )
    expected = {
        "front": "ALPHA-173",
        "middle": "BETA-284",
        "end": "GAMMA-395",
        "composite": "r17/queue/rollback",
    }
    try:
        parsed = json.loads(message(response).get("content") or "")
        actual_tokens = int(response.get("usage", {}).get("prompt_tokens", 0))
        ok = parsed == expected and actual_tokens == prompt_tokens
        detail = (
            f"exact three-position join at {actual_tokens} tokens"
            if ok
            else f"value={parsed}, prepared={prompt_tokens}, actual={actual_tokens}"
        )
        return ok, detail, response
    except (json.JSONDecodeError, TypeError) as exc:
        return False, f"invalid long-context JSON: {exc}", response


def openjev_check() -> tuple[bool, str, dict[str, Any]]:
    response = _json_request("http://127.0.0.1:8766", "/status")
    ok = bool(response.get("ready")) and response.get("device") == "cuda"
    return (
        ok,
        "Open JEV ready on CUDA" if ok else f"unexpected status: {response}",
        response,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:30000")
    parser.add_argument("--config", required=True)
    parser.add_argument("--repetitions", type=int, default=3)
    parser.add_argument("--output-root", default="artifacts/sglang-benchmarks")
    parser.add_argument("--maintenance-acknowledged", action="store_true")
    parser.add_argument("--thinking", choices=["on", "off"], default="on")
    parser.add_argument(
        "--check",
        action="append",
        choices=["openjev", "schema", "tool", "code", "long-context"],
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.maintenance_acknowledged:
        raise SystemExit(
            "refusing quality load without an authorized maintenance/drain state"
        )
    if args.repetitions < 1:
        raise SystemExit("--repetitions must be positive")
    token = THINKING.set(args.thinking == "on")
    try:
        return _run_checks(args)
    finally:
        THINKING.reset(token)


def _run_checks(args: argparse.Namespace) -> int:
    """Execute the selected quality contracts under one explicit thinking mode."""
    require_server_contract(args.base_url)
    require_drained(args.base_url, 30)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(args.output_root) / f"{timestamp}-{args.config}-quality"
    out_dir.mkdir(parents=True, exist_ok=False)
    checks: list[tuple[str, Callable[[], tuple[bool, str, dict[str, Any]]]]] = [
        ("openjev", lambda: openjev_check()),
        ("schema", lambda: schema_check(args.base_url)),
        ("tool", lambda: tool_check(args.base_url)),
        ("code", lambda: code_check(args.base_url)),
        ("long-context", lambda: long_context_check(args.base_url)),
    ]
    if args.check:
        checks = [item for item in checks if item[0] in args.check]
    results: list[dict[str, Any]] = []
    for repetition in range(1, args.repetitions + 1):
        for name, check in checks:
            require_drained(args.base_url, 2)
            try:
                passed, detail, raw = check()
            except (
                OSError,
                ValueError,
                RuntimeError,
                KeyError,
                TypeError,
                IndexError,
                subprocess.SubprocessError,
            ) as exc:
                passed, detail, raw = False, f"{type(exc).__name__}: {exc}", None
            results.append(
                {
                    "repetition": repetition,
                    "thinking": THINKING.get(),
                    "check": name,
                    "passed": passed,
                    "detail": detail,
                    "raw": raw,
                }
            )
            print(f"r{repetition} {name}: {'PASS' if passed else 'FAIL'} - {detail}")
            (out_dir / "quality-results.json").write_text(
                json.dumps(results, indent=2) + "\n", encoding="utf-8"
            )
    summary = {
        name: {
            "passed": sum(item["passed"] for item in results if item["check"] == name),
            "total": sum(item["check"] == name for item in results),
        }
        for name, _ in checks
    }
    (out_dir / "quality-summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    return 0 if all(item["passed"] for item in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
