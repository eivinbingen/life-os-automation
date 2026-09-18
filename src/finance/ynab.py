import requests


def get_plans(token: str) -> list:
    response = requests.get(
        url="https://api.ynab.com/v1/plans",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["data"]["plans"]


def select_plan(plans: list[dict], planname: str | None = None, planid: str | None = None) -> str:
    plan_id = None
    if not plans:
        raise ValueError(f"No plans found in {plans}")
    if planname is None and planid is None:
        # Default to first plan
        plan_id = plans[0]["id"]
    else:
        for plan in plans:
            if planname and plan["name"].lower() == planname.lower():
                plan_id = plan["id"]
                break
            if planid and plan["id"] == planid:
                plan_id = plan["id"]
                break
    if plan_id is not None:
        return plan_id
    raise ValueError(
        f"Found no matching plan in plans for planname: {planname} and planid: {planid}"
    )


def get_accounts(plan_id: str, token: str) -> dict:
    resp = requests.get(
        url=f"https://api.ynab.com/v1/plans/{plan_id}/accounts",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()
    accounts = resp.json()["data"]["accounts"]

    output = {}
    for acc in accounts:
        id, name, balance, account_type, closed, deleted = (
            acc["id"],
            acc["name"],
            acc["balance"],
            acc["type"],
            acc["closed"],
            acc["deleted"],
        )
        output[id] = {
            "name": name,
            "balance": balance / 1000,
            "type": account_type,
            "closed": closed,
            "deleted": deleted,
        }

    return output


def get_month_categories(token: str, plan_id: str, month: str) -> dict:

    resp = requests.get(
        url=f"https://api.ynab.com/v1/plans/{plan_id}/months/{month}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()
    all_categories = resp.json()["data"]["month"]["categories"]

    categories_resolved = {}
    for cat in all_categories:
        cat_id, name, category_group_name = cat["id"], cat["name"], cat["category_group_name"]
        activity, budgeted_amount, balance, deleted = (
            cat["activity"],
            cat["budgeted"],
            cat["balance"],
            cat["deleted"],
        )
        categories_resolved[cat_id] = {
            "name": name,
            "category_group_name": category_group_name,
            "activity": activity / 1000,
            "budgeted": budgeted_amount / 1000,
            "balance": balance / 1000,
            "deleted": deleted,
        }
    return categories_resolved
