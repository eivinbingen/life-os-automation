import requests
from dotenv import load_dotenv
import os

load_dotenv()

def get_plans(token: str) -> list:
    response = requests.get(
        url="https://api.ynab.com/v1/plans",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10
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
    raise ValueError(f"Found no matching plan in plans for planname: {planname} and planid: {planid}")

def get_accounts(plan_id: str, token: str):
    resp = requests.get(
        url = f"https://api.ynab.com/v1/plans/{plan_id}/accounts",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()
    accounts = resp.json()["data"]["accounts"]

    output = {}
    for acc in accounts:
        id, name, balance, account_type, closed, deleted = acc["id"], acc["name"], acc["balance"], acc["type"], acc["closed"], acc["deleted"]
        output[id] = {"name": name, "balance": balance / 1000, "type": account_type, "closed": closed, "deleted": deleted}
    
    return output

        

token = os.getenv("YNAB_TOKEN")
if token is None:
    print("token is None")

# plans = get_plans(token)
# selected = select_plan(plans, planid="1")
# print(selected)

accs = get_accounts(plan_id="fe067808-aabc-4d5a-a6f2-9ae61c6213cc", token=token)
print(accs)