"""Create two dummy customers with documents via the API for testing.

Usage:
    uv run python scripts/create_test_data.py [--api http://localhost:8000]
"""

import argparse
import json
import urllib.error
import urllib.parse
import urllib.request

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
    {
        "customer": {
            "name": "Contoso Ltd",
            "description": (
                "1,200-person financial services firm in Frankfurt. Focused on Teams adoption "
                "and Copilot readiness. Strict EU data residency requirements."
            ),
            "products_used": [
                "Microsoft Teams",
                "SharePoint Online",
                "Exchange Online",
                "Microsoft Viva",
            ],
            "priority": "high",
            "notes": "Primary contact: Sarah Fischer (IT Director). Contract renewal Q3 2025.",
        },
        "documents": [
            {"title": "Battle Card", "content": CONTOSO_BATTLE_CARD},
            {"title": "Meeting Notes 2025-02-14", "content": CONTOSO_MEETING_NOTES},
        ],
    },
    {
        "customer": {
            "name": "Fabrikam Inc",
            "description": (
                "350-person manufacturing company across 3 plants in Austria. Small IT team, "
                "needs low-admin solutions. Evaluating Intune for plant floor devices."
            ),
            "products_used": ["Microsoft Teams", "OneDrive for Business", "Microsoft Intune"],
            "priority": "medium",
            "notes": "Primary contact: Thomas Huber (IT Manager).",
        },
        "documents": [
            {"title": "Battle Card", "content": FABRIKAM_BATTLE_CARD},
            {"title": "Meeting Notes 2025-01-22", "content": FABRIKAM_MEETING_NOTES},
        ],
    },
]


def _post(base: str, path: str, body: dict) -> dict:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{base}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode()
        raise SystemExit(f"HTTP {exc.code} on {path}: {body_text}") from exc


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000", help="API base URL")
    args = parser.parse_args()
    base: str = args.api.rstrip("/")

    for entry in _CUSTOMERS:
        name = entry["customer"]["name"]
        print(f"Creating customer: {name}")
        try:
            customer = _post(base, "/customers", entry["customer"])
            print(f"  Created (id={customer['id']})")
        except SystemExit as exc:
            if "409" in str(exc) or "already" in str(exc).lower():
                print("  Already exists, skipping")
            else:
                raise

        for doc in entry["documents"]:
            print(f"  Adding document: {doc['title']}")
            _post(base, f"/customers/{urllib.parse.quote(name)}/documents", doc)

    print("\nAll test customers created successfully.")


if __name__ == "__main__":
    main()
