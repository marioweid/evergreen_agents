"""Google Drive integration — reads customer folders and documents."""

import asyncio
import io
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

_SCOPES_READ = ["https://www.googleapis.com/auth/drive.readonly"]
_SCOPES_WRITE = ["https://www.googleapis.com/auth/drive"]
_MIME_FOLDER = "application/vnd.google-apps.folder"
_MIME_DOC = "application/vnd.google-apps.document"


@dataclass
class DriveDoc:
    file_id: str
    title: str
    content: str
    modified_at: str  # raw RFC3339 string from Drive, used for delta detection


@dataclass
class CustomerFolder:
    folder_id: str
    name: str
    battle_card: DriveDoc | None = None
    documents: list[DriveDoc] = field(default_factory=list)


def _build_service(sa_key_path: str):
    creds = service_account.Credentials.from_service_account_file(sa_key_path, scopes=_SCOPES_READ)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _load_user_credentials(token_path: str) -> Credentials:
    """Load OAuth user credentials from a token.json file."""
    data = json.loads(Path(token_path).read_text())
    return Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=data.get("client_id"),
        client_secret=data.get("client_secret"),
        scopes=data.get("scopes"),
    )


def _list_children_sync(service, folder_id: str, mime_type: str) -> list[dict]:
    result = (
        service.files()
        .list(
            q=f"'{folder_id}' in parents and mimeType='{mime_type}' and trashed=false",
            fields="files(id, name, modifiedTime)",
            pageSize=100,
        )
        .execute()
    )
    return result.get("files", [])


def _export_text_sync(service, file_id: str) -> str:
    request = service.files().export_media(fileId=file_id, mimeType="text/plain")
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue().decode("utf-8")


@dataclass
class BattleCard:
    products_used: list[str]
    priority: str
    description: str
    notes: str | None


def _is_battle_card(title: str) -> bool:
    normalized = title.lower().replace(" ", "_").replace("-", "_")
    return "battle_card" in normalized or normalized.startswith("battle")


def parse_battle_card(text: str) -> BattleCard:
    """Parse a battle card doc into structured fields.

    Expects sections: Products Used, Priority, Description, Notes.
    Returns dict with keys: products_used, priority, description, notes.
    """

    def extract_section(name: str) -> str:
        pattern = rf"##\s+{re.escape(name)}\s*\n(.*?)(?=\n##\s|\Z)"
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        return match.group(1).strip() if match else ""

    products_raw = extract_section("Products Used")
    products = [p.strip().lstrip("-•* ") for p in products_raw.splitlines() if p.strip()]

    priority_raw = extract_section("Priority").strip().lower()
    priority = priority_raw if priority_raw in {"low", "medium", "high"} else "medium"

    description = extract_section("Description")
    notes = extract_section("Notes") or None

    return BattleCard(
        products_used=products,
        priority=priority,
        description=description or "Customer imported from Google Drive.",
        notes=notes,
    )


async def fetch_customer_folders(sa_key_path: str, root_folder_id: str) -> list[CustomerFolder]:
    """Fetch all customer subfolders and their documents from Drive."""
    service = await asyncio.to_thread(_build_service, sa_key_path)
    raw_folders = await asyncio.to_thread(
        _list_children_sync, service, root_folder_id, _MIME_FOLDER
    )

    folders: list[CustomerFolder] = []
    for f in raw_folders:
        folder = CustomerFolder(folder_id=f["id"], name=f["name"])
        raw_docs = await asyncio.to_thread(_list_children_sync, service, f["id"], _MIME_DOC)
        for doc in raw_docs:
            content = await asyncio.to_thread(_export_text_sync, service, doc["id"])
            drive_doc = DriveDoc(
                file_id=doc["id"],
                title=doc["name"],
                content=content,
                modified_at=doc["modifiedTime"],
            )
            if _is_battle_card(doc["name"]):
                folder.battle_card = drive_doc
            else:
                folder.documents.append(drive_doc)
        folders.append(folder)

    return folders


def _write_report_sync(token_path: str, folder_id: str, title: str, content: str) -> str:
    """Create a Google Doc in folder_id using OAuth user credentials. Returns the file id."""
    creds = _load_user_credentials(token_path)
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    media = MediaIoBaseUpload(
        io.BytesIO(content.encode("utf-8")),
        mimetype="text/plain",
        resumable=False,
    )
    file = (
        drive.files()
        .create(
            body={"name": title, "mimeType": _MIME_DOC, "parents": [folder_id]},
            media_body=media,
            fields="id",
        )
        .execute()
    )
    return file["id"]


async def write_report_to_drive(token_path: str, folder_id: str, title: str, content: str) -> str:
    """Create a Google Doc report in Drive using OAuth user credentials.

    Args:
        token_path: Path to token.json produced by scripts/setup_drive_auth.py.
        folder_id: Drive folder where the doc will be created.
        title: Document title.
        content: Report text content.

    Returns:
        The Drive file id of the created document.
    """
    return await asyncio.to_thread(_write_report_sync, token_path, folder_id, title, content)
