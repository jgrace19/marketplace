import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(autouse=True)
def _stripe_offline(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep checkout tests offline even if a developer env has a secret key."""
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.setattr(main.stripe, "api_key", None, raising=False)


@pytest.fixture
def client() -> TestClient:
    with TestClient(main.app) as test_client:
        yield test_client
