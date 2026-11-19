import argparse
import json
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


class SmokeTestError(RuntimeError):
    pass


def fetch(url: str) -> tuple[int, bytes]:
    try:
        with urlopen(url, timeout=5) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()
    except (TimeoutError, URLError) as error:
        raise SmokeTestError(f"Could not reach {url}: {error}") from error


def require_ready(url: str) -> None:
    status_code, body = fetch(url)
    if status_code != 200:
        raise SmokeTestError(f"{url} returned HTTP {status_code}.")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise SmokeTestError(f"{url} did not return JSON.") from error
    if payload.get("status") != "ready":
        raise SmokeTestError(f"{url} did not report ready.")


def require_workspace_access(url: str) -> None:
    # The browser sends no identity; the web proxy must supply the development user.
    status_code, body = fetch(url)
    if status_code != 200:
        raise SmokeTestError(
            f"{url} returned HTTP {status_code}; check RIPPLE_LOCAL_USER_ID on the web service."
        )
    try:
        workspaces = json.loads(body)
    except json.JSONDecodeError as error:
        raise SmokeTestError(f"{url} did not return JSON.") from error
    if not isinstance(workspaces, list) or not workspaces:
        raise SmokeTestError(f"{url} returned no workspaces for the development user.")


def run(api_url: str, web_url: str) -> None:
    api_health_url = f"{api_url.rstrip('/')}/api/v1/health/ready"
    web_root_url = web_url.rstrip("/")
    require_ready(api_health_url)
    print("PASS API readiness")

    status_code, body = fetch(web_root_url)
    if status_code != 200 or b'id="root"' not in body:
        raise SmokeTestError(f"{web_root_url} did not serve the Ripple Effect app.")
    print("PASS web application")

    require_ready(f"{web_root_url}/api/v1/health/ready")
    print("PASS web-to-API proxy")

    require_workspace_access(f"{web_root_url}/api/v1/workspaces")
    print("PASS web-to-API development identity")


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke-test the local Compose stack.")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    parser.add_argument("--web-url", default="http://127.0.0.1:5173")
    args = parser.parse_args()

    try:
        run(args.api_url, args.web_url)
    except SmokeTestError as error:
        parser.exit(1, f"FAIL {error}\n")


if __name__ == "__main__":
    main()
