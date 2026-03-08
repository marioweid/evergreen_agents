"""Create two dummy customer folders in Google Drive for testing.

Usage:
    GOOGLE_SA_KEY_PATH=sa_drive_agent.json \
    GOOGLE_DRIVE_CUSTOMER_FOLDER_ID=<folder_id> \
    uv run python scripts/create_test_data.py

The service account needs write access to the target folder.
Share the folder with: driveagent@marioprivategcp.iam.gserviceaccount.com
"""

import os
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build

# drive.file: create/manage files created by this app
# documents: insert text into Docs via batchUpdate
# Native Google Docs created via the Docs API don't count against storage quota.
_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
]
_MIME_FOLDER = "application/vnd.google-apps.folder"
_MIME_DOC = "application/vnd.google-apps.document"

CONTOSO_BATTLE_CARD = """\
# Battle Card: Contoso Ltd

## Products Used
Microsoft Teams
SharePoint Online
Exchange Online
Microsoft Viva

## Priority
high

## Description
Contoso Ltd is a 1,200-person financial services firm headquartered in Frankfurt. They completed
their migration from on-premise Exchange to Exchange Online in Q1 2024 and are now focused on
driving Teams adoption across all departments. Compliance and data residency (EU) are critical
constraints for any new feature rollout.

## Notes
Primary contact: Sarah Fischer (IT Director). Contract renewal Q3 2025.
Key concern: Copilot readiness and data governance before any AI features go live.
"""

CONTOSO_MEETING_NOTES = """\
# Meeting Notes — Contoso Ltd — 2025-02-14

## Attendees
- Mario (Account Manager)
- Sarah Fischer (IT Director, Contoso)
- Klaus Berger (M365 Admin, Contoso)

## Topics Discussed

### Teams Adoption
Teams penetration is at 68% across the company. The legal department is the main holdout —
they rely on a legacy document management system that hasn't been integrated yet.
Sarah wants to resolve this by Q2 2025.

### SharePoint Migration
They have ~4 TB of data still on-premise in SharePoint 2016. Migration planning is underway,
target completion is Q4 2025. They are evaluating SharePoint Premium for content AI features.

### Compliance Requirements
Contoso must comply with BaFin (German financial regulator) requirements. All data must stay
within EU data centers. They need assurance that any new M365 feature defaults to EU regions.

### Next Steps
- Mario to send overview of Teams Phone adoption roadmap
- Klaus to test SharePoint Embedded for the legal DMS use case
- Follow-up call scheduled for March 2025
"""

FABRIKAM_BATTLE_CARD = """\
# Battle Card: Fabrikam Inc

## Products Used
Microsoft Teams
OneDrive for Business
Microsoft Intune

## Priority
medium

## Description
Fabrikam Inc is a mid-size manufacturing company with 350 employees across 3 plants in Austria.
They adopted Teams during COVID and have been using it as their primary communication tool.
Their IT team is small (2 people) so simplicity and low admin overhead are top priorities.
They are currently evaluating Intune for device management across plant floor tablets.

## Notes
Primary contact: Thomas Huber (IT Manager). No active contract renewal pressure.
Interest in frontline worker features (Teams Shifts, Walkie Talkie).
"""

FABRIKAM_MEETING_NOTES = """\
# Meeting Notes — Fabrikam Inc — 2025-01-22

## Attendees
- Mario (Account Manager)
- Thomas Huber (IT Manager, Fabrikam)

## Topics Discussed

### Frontline Workers
Fabrikam has ~150 plant floor workers who currently don't use any M365 tools.
Thomas is interested in Teams Shifts for scheduling and the Walkie Talkie feature for
real-time communication between floor supervisors. Wants a pilot with 20 users first.

### OneDrive Sync Issues
Some users on older Windows 10 machines are experiencing OneDrive sync failures.
Thomas suspects it's related to the Known Folder Move policy. Agreed to share a
troubleshooting guide and schedule a remote session.

### Intune Evaluation
They have 40 shared tablets on the plant floor running Android. Thomas wants to manage
them centrally with Intune. No MDM solution currently in place.

### Next Steps
- Mario to arrange Teams Frontline Worker trial licenses
- Send Intune for Android setup guide
- Remote session for OneDrive sync troubleshooting in February
"""

_CUSTOMERS = [
    ("Contoso Ltd", CONTOSO_BATTLE_CARD, CONTOSO_MEETING_NOTES),
    ("Fabrikam Inc", FABRIKAM_BATTLE_CARD, FABRIKAM_MEETING_NOTES),
]


def _build_services(sa_key_path: str) -> tuple:
    creds = service_account.Credentials.from_service_account_file(sa_key_path, scopes=_SCOPES)
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    docs = build("docs", "v1", credentials=creds, cache_discovery=False)
    return drive, docs


def create_folder(drive, parent_id: str, name: str) -> str:
    file = (
        drive.files()
        .create(
            body={"name": name, "mimeType": _MIME_FOLDER, "parents": [parent_id]},
            fields="id",
        )
        .execute()
    )
    return file["id"]


def create_google_doc(drive, docs, parent_id: str, title: str, content: str) -> str:
    """Create a native Google Doc (no upload = no storage quota used) and insert content."""
    # Create empty native Google Doc in Drive
    file = (
        drive.files()
        .create(
            body={"name": title, "mimeType": _MIME_DOC, "parents": [parent_id]},
            fields="id",
        )
        .execute()
    )
    doc_id = file["id"]

    # Insert content via Docs API batchUpdate — native Docs don't count against quota
    docs.documents().batchUpdate(
        documentId=doc_id,
        body={"requests": [{"insertText": {"location": {"index": 1}, "text": content}}]},
    ).execute()

    return doc_id


def main() -> None:
    sa_key_path = os.environ.get("GOOGLE_SA_KEY_PATH", "sa_drive_agent.json")
    root_folder_id = os.environ.get("GOOGLE_DRIVE_CUSTOMER_FOLDER_ID", "")

    if not root_folder_id:
        print("Error: set GOOGLE_DRIVE_CUSTOMER_FOLDER_ID to the ID of your Customers folder.")
        sys.exit(1)

    drive, docs = _build_services(sa_key_path)

    for customer_name, battle_card, meeting_notes in _CUSTOMERS:
        print(f"Creating folder: {customer_name}")
        folder_id = create_folder(drive, root_folder_id, customer_name)

        print("  Creating Battle Card")
        create_google_doc(drive, docs, folder_id, "Battle Card", battle_card)

        print("  Creating Meeting Notes")
        create_google_doc(drive, docs, folder_id, "Meeting Notes", meeting_notes)

        print(f"  Done — folder id: {folder_id}")

    print("\nAll test customers created successfully.")
    print("Now set GOOGLE_DRIVE_CUSTOMERS_FOLDER_ID in your .env and run the pipeline.")


if __name__ == "__main__":
    main()
