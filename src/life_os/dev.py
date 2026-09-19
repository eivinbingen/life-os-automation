import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

from dotenv import dotenv_values

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = PROJECT_ROOT / "apps" / "web"
API_URL = "http://127.0.0.1:8000"
WEB_URL = "http://localhost:3000"


def _configuration_errors() -> list[str]:
    errors: list[str] = []
    env_file = PROJECT_ROOT / ".env"

    if not env_file.is_file():
        errors.append("Missing .env. Copy .env.example to .env and add your local values.")
    else:
        values = dotenv_values(env_file)
        for name in ("NOTION_TOKEN", "NOTION_TASKS_DATA_SOURCE_ID"):
            if not values.get(name):
                errors.append(f"Missing {name} in .env.")

    if not (PROJECT_ROOT / "calendar_oauth_client.json").is_file():
        errors.append(
            "Missing calendar_oauth_client.json in the repository root. "
            "Download the Google OAuth desktop client file and place it there."
        )

    if shutil.which("npm") is None:
        errors.append("npm is unavailable. Install Node.js and npm, then try again.")
    elif not (WEB_ROOT / "node_modules" / ".bin" / "next").is_file():
        errors.append("Frontend dependencies are missing. Run: npm --prefix apps/web ci")

    return errors


def _stop_processes(processes: list[subprocess.Popen]) -> None:
    running = [process for process in processes if process.poll() is None]

    for process in running:
        os.killpg(process.pid, signal.SIGTERM)

    deadline = time.monotonic() + 5
    for process in running:
        try:
            process.wait(timeout=max(0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()


def main() -> int:
    errors = _configuration_errors()
    if errors:
        print("Life OS cannot start:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    frontend_env = os.environ.copy()
    web_env = dotenv_values(WEB_ROOT / ".env.local")
    frontend_env.setdefault(
        "LIFE_OS_API_URL",
        web_env.get("LIFE_OS_API_URL") or API_URL,
    )

    print("Starting Life OS")
    print(f"  Dashboard: {WEB_URL}")
    print(f"  API:       {API_URL}")
    print("Press Ctrl+C to stop both services.\n")

    processes: list[subprocess.Popen] = []
    try:
        processes.append(
            subprocess.Popen(
                [sys.executable, "src/life_os/main.py"],
                cwd=PROJECT_ROOT,
                start_new_session=True,
            )
        )
        processes.append(
            subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=WEB_ROOT,
                env=frontend_env,
                start_new_session=True,
            )
        )

        while True:
            for name, process in zip(("API", "frontend"), processes, strict=True):
                return_code = process.poll()
                if return_code is not None:
                    print(
                        f"{name} stopped unexpectedly with exit code {return_code}.",
                        file=sys.stderr,
                    )
                    return return_code or 1
            time.sleep(0.25)
    except KeyboardInterrupt:
        print("\nStopping Life OS...")
        return 0
    finally:
        _stop_processes(processes)


if __name__ == "__main__":
    raise SystemExit(main())
