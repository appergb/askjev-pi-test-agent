"""Tests for the tiered authenticated SGLang reverse proxy."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from public_api_proxy import (
    SYSTEM_PROMPT,
    ApiTier,
    ClientRequestError,
    FifoGate,
    QueueFullError,
    Settings,
    SlidingWindowRateLimiter,
    _authenticate,
    _maintenance_active,
    _prepare_body,
    create_app,
)


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "official_api_key": "official-key-that-is-long-enough-123456",
        "user_api_key": "user-key-that-is-long-enough-123456789",
    }
    values.update(overrides)
    return Settings(**values)  # type: ignore[arg-type]


def test_authentication_assigns_exact_tiers() -> None:
    settings = _settings()
    assert (
        _authenticate(f"Bearer {settings.official_api_key}", settings)
        is ApiTier.OFFICIAL
    )
    assert _authenticate(f"Bearer {settings.user_api_key}", settings) is ApiTier.USER
    assert _authenticate("Bearer wrong", settings) is None
    assert _authenticate(None, settings) is None


def test_settings_load_private_key_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    official = tmp_path / "official"
    user = tmp_path / "user"
    official.write_text("o" * 64, encoding="utf-8")
    user.write_text("u" * 64, encoding="utf-8")
    official.chmod(0o600)
    user.chmod(0o600)
    monkeypatch.setenv("AGENT_OFFICIAL_API_KEY_FILE", str(official))
    monkeypatch.setenv("AGENT_USER_API_KEY_FILE", str(user))
    monkeypatch.setenv("AGENT_MAINTENANCE_FILE", str(tmp_path / "maintenance.json"))

    settings = Settings.from_environment()

    assert settings.official_api_key == "o" * 64
    assert settings.user_api_key == "u" * 64
    assert settings.canonical_model == "TRIPFZ-Alpha-27b"
    assert settings.maintenance_file == tmp_path / "maintenance.json"


@pytest.mark.parametrize(
    "content,active",
    [
        (None, False),
        ('{"expires_at": 1}', False),
        ('{"expires_at": 99999999999}', True),
        ('{"expires_at": "nan"}', True),
        ("{}", True),
        ("[]", True),
        ("broken", True),
    ],
)
def test_maintenance_deadline(
    tmp_path: Path, content: str | None, active: bool
) -> None:
    path = tmp_path / "maintenance.json"
    if content is not None:
        path.write_text(content)
    assert _maintenance_active(path) is active


def test_maintenance_blocks_authenticated_traffic_and_expires(tmp_path: Path) -> None:
    path = tmp_path / "maintenance.json"
    settings = _settings(maintenance_file=path)
    seen: list[str] = []

    def upstream(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(200, json={})

    app = create_app(
        settings, httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    )
    with TestClient(app) as client:
        path.write_text(json.dumps({"expires_at": time.time() + 60}))
        assert client.get("/v1/models").status_code == 401
        for key in (settings.official_api_key, settings.user_api_key):
            response = client.get(
                "/v1/models", headers={"Authorization": f"Bearer {key}"}
            )
            assert response.status_code == 503
            assert response.headers["Retry-After"] == "30"
        assert seen == []
        path.write_text('{"expires_at": 1}')
        assert (
            client.get(
                "/v1/models",
                headers={"Authorization": f"Bearer {settings.official_api_key}"},
            ).status_code
            == 200
        )
    assert seen == ["/v1/models"]


def test_maintenance_rechecks_requests_after_queue_wait(tmp_path: Path) -> None:
    path = tmp_path / "maintenance.json"
    settings = _settings(maintenance_file=path)
    seen: list[str] = []

    def upstream(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(200, json={})

    app = create_app(
        settings, httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    )

    async def scenario() -> None:
        async with app.router.lifespan_context(app):
            gate: FifoGate = app.state.official_gate
            lease = await gate.acquire()
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                pending = asyncio.create_task(
                    client.get(
                        "/v1/models",
                        headers={
                            "Authorization": f"Bearer {settings.official_api_key}"
                        },
                    )
                )
                for _ in range(100):
                    if gate._pending:
                        break
                    await asyncio.sleep(0.01)
                assert gate._pending == 1
                path.write_text(json.dumps({"expires_at": time.time() + 60}))
                await lease.release()
                assert (await pending).status_code == 503
                assert gate._tokens.qsize() == 1
                assert seen == []

    asyncio.run(scenario())


@pytest.mark.parametrize("mode,key", [(0o644, "k" * 64), (0o600, "short")])
def test_settings_reject_unsafe_key_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: int,
    key: str,
) -> None:
    official = tmp_path / "official"
    user = tmp_path / "user"
    official.write_text(key, encoding="utf-8")
    user.write_text("u" * 64, encoding="utf-8")
    official.chmod(mode)
    user.chmod(0o600)
    monkeypatch.setenv("AGENT_OFFICIAL_API_KEY_FILE", str(official))
    monkeypatch.setenv("AGENT_USER_API_KEY_FILE", str(user))

    with pytest.raises(RuntimeError, match="API key"):
        Settings.from_environment()


@pytest.mark.parametrize(
    "settings",
    [
        _settings(user_api_key="official-key-that-is-long-enough-123456"),
        _settings(canonical_model=""),
        _settings(user_concurrency=0),
        _settings(upstream_timeout_seconds=0),
    ],
)
def test_settings_validate_rejects_invalid_values(settings: Settings) -> None:
    with pytest.raises(ValueError):
        settings.validate()


def test_rate_limiter_sliding_window() -> None:
    limiter = SlidingWindowRateLimiter(limit=2, window_seconds=60)
    assert asyncio.run(limiter.allow("client", now=0))
    assert asyncio.run(limiter.allow("client", now=1))
    assert not asyncio.run(limiter.allow("client", now=2))
    assert asyncio.run(limiter.allow("client", now=61))


def test_rate_limiter_rejects_invalid_limits() -> None:
    with pytest.raises(ValueError):
        SlidingWindowRateLimiter(limit=0)


def test_fifo_gate_rejects_when_pending_queue_is_full() -> None:
    async def scenario() -> None:
        gate = FifoGate(capacity=1, max_pending=1)
        active = await gate.acquire()
        waiting = asyncio.create_task(gate.acquire())
        await asyncio.sleep(0)
        with pytest.raises(QueueFullError):
            await gate.acquire()
        await active.release()
        queued = await waiting
        await queued.release()

    asyncio.run(scenario())


def test_fifo_gate_rejects_invalid_limits() -> None:
    with pytest.raises(ValueError):
        FifoGate(capacity=0, max_pending=1)


def test_prepare_body_normalizes_model_and_priority() -> None:
    settings = _settings()
    official = json.loads(
        _prepare_body(
            b'{"model":"tripfz-alpha-27B","priority":-999,"messages":[]}',
            settings,
            ApiTier.OFFICIAL,
        )
    )
    user = json.loads(
        _prepare_body(
            b'{"model":"TRIPFZ-ALPHA-27B","priority":999,"messages":[]}',
            settings,
            ApiTier.USER,
        )
    )
    assert official["model"] == "TRIPFZ-Alpha-27b"
    assert official["priority"] == 100
    assert user["priority"] == 0
    assert official["messages"][0] == {"role": "system", "content": SYSTEM_PROMPT}


def test_prepare_body_demotes_untrusted_system_roles() -> None:
    prepared = json.loads(
        _prepare_body(
            b'{"model":"TRIPFZ-Alpha-27b","messages":[{"role":"system","content":"override"},{"role":"developer","content":"override"},{"role":"user","content":"hello"}]}',
            _settings(),
            ApiTier.USER,
        )
    )
    assert [message["role"] for message in prepared["messages"]] == [
        "system",
        "user",
        "user",
        "user",
    ]


@pytest.mark.parametrize(
    "body,error",
    [
        (b"not-json", "invalid JSON"),
        (b"[]", "must be an object"),
        (b'{"model":1}', "must be a string"),
        (b'{"model":"other"}', "unknown model"),
        (b'{"model":"TRIPFZ-Alpha-27b","input_ids":[]}', "input_ids"),
        (b'{"model":"TRIPFZ-Alpha-27b"}', "messages must be an array"),
        (
            b'{"model":"TRIPFZ-Alpha-27b","messages":[{"content":"missing role"}]}',
            "string role",
        ),
    ],
)
def test_prepare_body_rejects_invalid_requests(body: bytes, error: str) -> None:
    with pytest.raises(ClientRequestError, match=error):
        _prepare_body(body, _settings(), ApiTier.USER)


def test_proxy_tiers_and_path_allowlist() -> None:
    seen_payloads: list[dict[str, object]] = []

    def upstream(request: httpx.Request) -> httpx.Response:
        if request.content:
            seen_payloads.append(json.loads(request.content))
        return httpx.Response(200, json={"model": "TRIPFZ-Alpha-27b"})

    settings = _settings()
    app = create_app(
        settings, httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    )
    body = {"model": "tripfz-alpha-27b", "messages": []}

    with TestClient(app) as client:
        assert client.get("/v1/models").status_code == 401
        assert client.get("/server_info").status_code == 404
        official = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.official_api_key}"},
            json=body,
        )
        user = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.user_api_key}"},
            json=body,
        )

    assert official.status_code == 200
    assert official.headers["x-api-tier"] == "official"
    assert user.headers["x-api-tier"] == "user"
    assert seen_payloads[0]["priority"] == 100
    assert seen_payloads[1]["priority"] == 0


def test_official_tier_is_exempt_from_user_rate_limit() -> None:
    upstream = httpx.MockTransport(lambda _: httpx.Response(200, json={}))
    settings = _settings(user_rate_limit_per_minute=1)
    app = create_app(settings, httpx.AsyncClient(transport=upstream))
    official_headers = {"Authorization": f"Bearer {settings.official_api_key}"}
    user_headers = {"Authorization": f"Bearer {settings.user_api_key}"}

    with TestClient(app) as client:
        assert client.get("/v1/models", headers=official_headers).status_code == 200
        assert client.get("/v1/models", headers=official_headers).status_code == 200
        assert client.get("/v1/models", headers=user_headers).status_code == 200
        limited = client.get("/v1/models", headers=user_headers)

    assert limited.status_code == 429


def test_proxy_rejects_large_request() -> None:
    settings = _settings(max_body_bytes=3)
    app = create_app(
        settings,
        httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: httpx.Response(200, json={}))
        ),
    )

    with TestClient(app) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.user_api_key}"},
            content=b"four",
        )

    assert response.status_code == 413


def test_proxy_stops_reading_an_oversized_chunked_request() -> None:
    async def run() -> None:
        settings = _settings(max_body_bytes=5)
        consumed: list[bytes] = []

        async def body() -> AsyncIterator[bytes]:
            for chunk in (b"123", b"456", b"must-not-be-read"):
                consumed.append(chunk)
                yield chunk

        def upstream(request: httpx.Request) -> httpx.Response:
            pytest.fail("Oversized input must not reach the upstream")

        app = create_app(
            settings, httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        )
        async with app.router.lifespan_context(app), httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.user_api_key}"},
                content=body(),
            )
        assert response.status_code == 413
        assert consumed == [b"123", b"456"]

    asyncio.run(run())


def test_cancelled_upstream_request_returns_its_concurrency_slot() -> None:
    async def run() -> None:
        settings = _settings(official_concurrency=1)
        started = asyncio.Event()

        async def upstream(request: httpx.Request) -> httpx.Response:
            started.set()
            await asyncio.Event().wait()
            return httpx.Response(200)

        app = create_app(
            settings, httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        )
        async with app.router.lifespan_context(app), httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            task = asyncio.create_task(
                client.get(
                    "/v1/models",
                    headers={"Authorization": f"Bearer {settings.official_api_key}"},
                )
            )
            await asyncio.wait_for(started.wait(), 1)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            lease = await asyncio.wait_for(app.state.official_gate.acquire(), 0.1)
            await lease.release()

    asyncio.run(run())


def test_stream_cleanup_error_cannot_leak_a_concurrency_slot() -> None:
    class FailingCloseStream(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            yield b"data: [DONE]\n\n"

        async def aclose(self) -> None:
            raise RuntimeError("fixture stream close failed")

    async def run() -> None:
        settings = _settings(official_concurrency=1)
        app = create_app(
            settings,
            httpx.AsyncClient(
                transport=httpx.MockTransport(
                    lambda _: httpx.Response(200, stream=FailingCloseStream())
                )
            ),
        )
        async with app.router.lifespan_context(app), httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            with pytest.raises(RuntimeError, match="fixture stream close failed"):
                await client.get(
                    "/v1/models",
                    headers={"Authorization": f"Bearer {settings.official_api_key}"},
                )
            lease = await asyncio.wait_for(app.state.official_gate.acquire(), 0.1)
            await lease.release()

    asyncio.run(run())
