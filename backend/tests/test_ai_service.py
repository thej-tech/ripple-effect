import asyncio
import json

import httpx
import pytest

from app.ai_service import (
    OllamaResponseError,
    OllamaUnavailableError,
    assess_with_ollama,
    explain_with_ollama,
)


def mock_transport(handler):
    original = httpx.AsyncClient

    class PatchedAsyncClient(original):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, transport=httpx.MockTransport(handler), **kwargs)

    return PatchedAsyncClient


def test_commentary_request_is_concise_and_preserves_review_guards(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        prompt = payload["messages"][1]["content"]
        assert "at most 90 words" in prompt
        assert "selected entity" in prompt
        assert "other components" in prompt
        assert "trigger_entities" in prompt
        assert payload["options"]["num_predict"] <= 224
        assert "Actual Impact" in prompt
        assert "Propagation Reason" in prompt
        assert "Possible Improvements" in prompt
        assert "human review" in prompt
        assert "not probabilities" in prompt
        return httpx.Response(200, json={"message": {"content": "Actual Impact\nStored facts."}})

    monkeypatch.setattr("app.ai_service.httpx.AsyncClient", mock_transport(handler))
    explanation, _ = asyncio.run(explain_with_ollama({"selected_entity": {"score": 72.0}}))
    assert "Stored facts" in explanation


def test_successful_ollama_response(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == httpx.URL("http://localhost:11434/api/chat")
        body = {
            "message": {
                "role": "assistant",
                "content": "Actual Impact\nThis is a heuristic explanation.",
            }
        }
        return httpx.Response(200, json=body)

    monkeypatch.setattr(
        "app.ai_service.httpx.AsyncClient",
        mock_transport(handler),
    )

    explanation, model = asyncio.run(explain_with_ollama({"event": {"title": "Test"}}))

    assert model == "qwen2.5:3b"
    assert "Actual Impact" in explanation


@pytest.mark.parametrize("operation", [explain_with_ollama, assess_with_ollama])
def test_missing_model(monkeypatch, operation) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "model not found"})

    monkeypatch.setattr(
        "app.ai_service.httpx.AsyncClient",
        mock_transport(handler),
    )

    with pytest.raises(OllamaResponseError, match="model"):
        asyncio.run(operation({"event": {"title": "Test"}}))


@pytest.mark.parametrize("operation", [explain_with_ollama, assess_with_ollama])
def test_unavailable_ollama(monkeypatch, operation) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    monkeypatch.setattr(
        "app.ai_service.httpx.AsyncClient",
        mock_transport(handler),
    )

    with pytest.raises(OllamaUnavailableError, match="unavailable"):
        asyncio.run(operation({"event": {"title": "Test"}}))


@pytest.mark.parametrize("operation", [explain_with_ollama, assess_with_ollama])
def test_timeout(monkeypatch, operation) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    monkeypatch.setattr(
        "app.ai_service.httpx.AsyncClient",
        mock_transport(handler),
    )

    with pytest.raises(OllamaUnavailableError, match="timeout"):
        asyncio.run(operation({"event": {"title": "Test"}}))


@pytest.mark.parametrize("operation", [explain_with_ollama, assess_with_ollama])
def test_malformed_response(monkeypatch, operation) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": "shape"})

    monkeypatch.setattr(
        "app.ai_service.httpx.AsyncClient",
        mock_transport(handler),
    )

    with pytest.raises(OllamaResponseError, match="malformed"):
        asyncio.run(operation({"event": {"title": "Test"}}))


def test_assessment_uses_json_context_and_requires_a_human_decision(monkeypatch) -> None:
    context = {"workspace": {"name": "User system"}, "source": {"name": "Source"}}

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["model"] == "qwen2.5:3b"
        assert json.loads(payload["messages"][1]["content"]) == context
        assert "recommended_weight" in payload["format"]["properties"]
        return httpx.Response(
            200,
            json={
                "message": {
                    "content": json.dumps(
                        {
                            "recommended_weight": 0.65,
                            "reasoning": "The target has a partial fallback.",
                            "confidence": "medium",
                            "uncertainty": "Fallback capacity has not been measured.",
                            "assumptions": ["Fallback is available"],
                            "missing_information": ["Capacity"],
                        }
                    )
                }
            },
        )

    monkeypatch.setattr("app.ai_service.httpx.AsyncClient", mock_transport(handler))
    result = asyncio.run(assess_with_ollama(context))
    assert result["recommended_weight"] == 0.65
    assert result["decision"] == "pending"
    assert result["model"] == "qwen2.5:3b"


@pytest.mark.parametrize(
    "invalid_fields",
    [
        {"recommended_weight": -0.1},
        {"recommended_weight": 1.1},
        {"recommended_weight": "0.5"},
        {"recommended_weight": True},
        {"recommended_weight": float("nan")},
        {"reasoning": "   "},
        {"uncertainty": "\n\t"},
        {"confidence": "certain"},
    ],
)
def test_invalid_assessment_output_is_not_accepted(monkeypatch, invalid_fields) -> None:
    output = {
        "recommended_weight": 0.5,
        "reasoning": "A meaningful explanation.",
        "confidence": "medium",
        "uncertainty": "Operational context is incomplete.",
        "assumptions": [],
        "missing_information": [],
        **invalid_fields,
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": json.dumps(output)}})

    monkeypatch.setattr("app.ai_service.httpx.AsyncClient", mock_transport(handler))
    with pytest.raises(OllamaResponseError, match="invalid dependency assessment"):
        asyncio.run(assess_with_ollama({"source": {"name": "Source"}}))
