import os

import requests
from dotenv import load_dotenv

BASE_URL = "https://api.ynab.com/v1"


def ynab_get(endpoint: str, token: str) -> dict:
    response = requests.get(
        f"{BASE_URL}/{endpoint}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["data"]


def get_budgets(token: str) -> list[dict]:
    data = ynab_get("budgets", token)
    return data["budgets"]


def get_category_groups(token: str, budget_id: str) -> list[dict]:
    data = ynab_get(f"budgets/{budget_id}/categories", token)
    return data["category_groups"]


def main() -> None:
    load_dotenv()

    token = os.environ["YNAB_TOKEN"]
    budgets = get_budgets(token)

    print("YNAB budgets:\n")

    for number, budget in enumerate(budgets, start=1):
        print(f"{number}. {budget['name']}")
        print(f"   ID: {budget['id']}")

    if len(budgets) == 1:
        budget = budgets[0]
    else:
        selection = int(input("\nSelect budget number: "))
        budget = budgets[selection - 1]

    print(f"\nCategories in: {budget['name']}")
    print(f"Budget ID: {budget['id']}")

    category_groups = get_category_groups(token, budget["id"])

    for group in category_groups:
        if group.get("deleted"):
            continue

        print(f"\n## {group['name']}")

        for category in group["categories"]:
            if category.get("deleted"):
                continue

            flags = []

            if category.get("hidden"):
                flags.append("hidden")

            flag_text = f" [{', '.join(flags)}]" if flags else ""

            print(f"- {category['name']}{flag_text}")
            print(f"  {category['id']}")


if __name__ == "__main__":
    main()
