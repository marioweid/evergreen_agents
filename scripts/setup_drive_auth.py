"""One-time OAuth setup — opens a browser to authorize Drive access and saves token.json.

Prerequisites:
  1. In Google Cloud Console → APIs & Services → Credentials:
     - Create an OAuth 2.0 Client ID (type: Desktop app)
     - Download the JSON and save it as oauth_client.json in the repo root
  2. Make sure the Google Drive API and Google Docs API are enabled for your project.

Usage:
    uv run python scripts/setup_drive_auth.py

This opens a browser tab asking you to sign in and grant access.
On success it writes token.json to the repo root — keep this secret (it's gitignored).
"""

import json
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
]
_CLIENT_SECRETS = Path("oauth_client.json")
_TOKEN_OUT = Path("token.json")


def main() -> None:
    if not _CLIENT_SECRETS.exists():
        print(
            "Error: oauth_client.json not found.\n"
            "Download it from Google Cloud Console → APIs & Services → Credentials\n"
            "(Create an OAuth 2.0 Client ID of type Desktop app, then download the JSON)."
        )
        sys.exit(1)

    flow = InstalledAppFlow.from_client_secrets_file(str(_CLIENT_SECRETS), scopes=_SCOPES)
    creds = flow.run_local_server(port=0)

    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or _SCOPES),
    }
    _TOKEN_OUT.write_text(json.dumps(token_data, indent=2))
    print(f"Saved credentials to {_TOKEN_OUT}")
    print("Add GOOGLE_OAUTH_TOKEN_PATH=token.json to your .env and you're ready.")


if __name__ == "__main__":
    main()
