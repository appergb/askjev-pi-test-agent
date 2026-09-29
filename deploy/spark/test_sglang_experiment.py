"""Verify experiment failure recovery without touching Docker or a live service."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).with_name("run-sglang-experiment.sh")


@pytest.mark.parametrize("baseline_profile", ["3-1-4", "dspark"])
@pytest.mark.parametrize(
    "failure,expected",
    [
        ("start", 4),
        ("readiness", 5),
        ("benchmark", 9),
        ("none", 0),
        ("script_update", 0),
    ],
)
def test_experiment_restores_and_checks_baseline(
    tmp_path: Path, failure: str, expected: int, baseline_profile: str
) -> None:
    fake_bin = tmp_path / "fake-bin"
    fake_bin.mkdir()
    runtime = tmp_path / "runtime"
    (runtime / "bin").mkdir(parents=True)
    record = tmp_path / "start-record"
    current = tmp_path / "current"
    mutable_script = tmp_path / "experiment.sh"
    mutable_script.write_text(SCRIPT.read_text())
    commands = {
        "sleep": "#!/bin/sh\nexit 0\n",
        "docker": "#!/bin/sh\necho '{}'\n",
        "python3": '#!/bin/sh\nif [ "$1" = "-" ]; then cat >/dev/null; exit 0; fi\n[ "$FAILURE_MODE" = "benchmark" ] && exit 9\nexit 0\n',
        "curl": '#!/bin/sh\ncase "$*" in\n*/health*) if [ "$FAILURE_MODE" = "readiness" ] && [ "$(cat "$CURRENT_PROFILE")" != auto ]; then exit 1; fi;;\nesac\necho "[]"\n',
    }
    for name, source in commands.items():
        path = fake_bin / name
        path.write_text(source)
        path.chmod(0o700)
    starter = runtime / "bin/start-sglang-agent.sh"
    starter.write_text(
        '#!/bin/sh\nprintf "%s %s %s\\n" "$SGLANG_FP4_GEMM_BACKEND" "$SGLANG_SPECULATIVE_PROFILE" "$SGLANG_CHUNKED_PREFILL_SIZE" >> "$START_RECORD"\nprintf "%s" "$SGLANG_FP4_GEMM_BACKEND" > "$CURRENT_PROFILE"\nif [ "$FAILURE_MODE" = start ] && [ "$SGLANG_FP4_GEMM_BACKEND" != auto ]; then exit 1; fi\n'
    )
    starter.chmod(0o700)
    with starter.open("a") as handle:
        handle.write(
            'if [ "$FAILURE_MODE" = script_update ]; then printf "exit 31\\n" > "$MUTABLE_SCRIPT"; fi\n'
        )
    environment = dict(
        os.environ,
        PATH=str(fake_bin) + os.pathsep + os.environ["PATH"],
        SPARK_RUNTIME_ROOT=str(runtime),
        SPARK_MAINTENANCE_ACKNOWLEDGED="yes",
        SPARK_KEEP_CANDIDATE="no",
        SGLANG_SPECULATIVE_PROFILE=baseline_profile,
        FAILURE_MODE=failure,
        START_RECORD=str(record),
        CURRENT_PROFILE=str(current),
        MUTABLE_SCRIPT=str(mutable_script),
    )
    result = subprocess.run(
        ["bash", str(mutable_script), "gemm-cudnn", "screen"],
        env=environment,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    assert result.returncode == expected, result.stdout + result.stderr
    assert record.read_text().splitlines() == [
        "flashinfer_cudnn 3-1-4 8192",
        f"auto {baseline_profile} 8192",
    ]


def test_restart_requires_explicit_maintenance_state(tmp_path: Path) -> None:
    environment = dict(
        os.environ, SPARK_RUNTIME_ROOT=str(tmp_path), SPARK_MAINTENANCE_ACKNOWLEDGED=""
    )
    result = subprocess.run(
        ["bash", str(SCRIPT), "gemm-cudnn"],
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 2
    assert not list(tmp_path.iterdir())
