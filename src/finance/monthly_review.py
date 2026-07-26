from dotenv import load_dotenv
import os
from category_mappings import CATEGORY_MAPPINGS, EXCLUDED_CATEGORIES
from ynab import get_plans, select_plan, get_accounts, get_month_categories
from datetime import date, timedelta

load_dotenv()

def validate_category_mapping(
    categories: dict[str, dict],
    category_mapping: dict[str, list[str]],
    excluded_categories: dict[str, str],
) -> bool:
    mapped_locations: dict[str, list[str]] = {}

    for forecast_column, category_ids in category_mapping.items():
        for category_id in category_ids:
            mapped_locations.setdefault(category_id, []).append(forecast_column)

    mapped_ids = set(mapped_locations)
    excluded_ids = set(excluded_categories)
    ynab_ids = set(categories)

    duplicate_ids = {
        category_id: columns
        for category_id, columns in mapped_locations.items()
        if len(columns) > 1
    }

    mapped_and_excluded = mapped_ids & excluded_ids
    unknown_mapped_ids = mapped_ids - ynab_ids
    unknown_excluded_ids = excluded_ids - ynab_ids

    unmapped_active_ids = {
        category_id
        for category_id, category in categories.items()
        if category_id not in mapped_ids
        and category_id not in excluded_ids
        and category["activity"] != 0
        and not category["deleted"]
    }

    def describe(category_id: str) -> str:
        category = categories.get(category_id)

        if category is None:
            return category_id

        return (
            f'{category["category_group_name"]} → '
            f'{category["name"]} ({category_id})'
        )

    if duplicate_ids:
        print("\nMapped more than once:")
        for category_id, columns in duplicate_ids.items():
            print(f"  {describe(category_id)}: {columns}")

    if mapped_and_excluded:
        print("\nBoth mapped and excluded:")
        for category_id in mapped_and_excluded:
            print(f"  {describe(category_id)}")

    if unknown_mapped_ids:
        print("\nMapped IDs not found in YNAB:")
        for category_id in unknown_mapped_ids:
            print(f"  {category_id}")

    if unknown_excluded_ids:
        print("\nExcluded IDs not found in YNAB:")
        for category_id in unknown_excluded_ids:
            print(f"  {category_id}")

    if unmapped_active_ids:
        print("\nActive categories without a decision:")
        for category_id in unmapped_active_ids:
            category = categories[category_id]
            print(
                f"  {describe(category_id)}: "
                f'{category["activity"]:.2f} NOK'
            )

    is_valid = not any(
        [
            duplicate_ids,
            mapped_and_excluded,
            unknown_mapped_ids,
            unknown_excluded_ids,
            unmapped_active_ids,
        ]
    )

    if is_valid:
        print("\nCategory mapping is valid.")
    else:
        print("\nCategory mapping needs attention.")

    return is_valid  

def build_monthly_actuals(
        categories: dict[str, str],
        category_mapping: dict[str, list[str]], 
        ) -> dict[str, float]:
    
    actuals = {}
    tot_spend = 0
    for column in category_mapping:
        cat_spend = 0
        for cat_id in category_mapping[column]:
            activity = categories[cat_id]["activity"]
            cat_spend += -activity
        actuals[column] = cat_spend
        tot_spend += cat_spend
    
    actuals["Total spent"] = tot_spend
    return actuals

def get_month() -> str:
    first_day_of_month = date.today().replace(day=1)
    return str(first_day_of_month)

def run_monthly_review(month: str, token: str) -> None:
    plans = get_plans(token)
    plan = select_plan(plans, planname="Schmoney")
    accounts = get_accounts(plan_id=plan, token=token)
    categories = get_month_categories(token, plan, month)
    if not validate_category_mapping(categories=categories, category_mapping=CATEGORY_MAPPINGS, excluded_categories=EXCLUDED_CATEGORIES):
        raise ("Cannot calculate actuals with an invalid mapping")
    monthly_actuals = build_monthly_actuals(categories=categories, category_mapping=CATEGORY_MAPPINGS)

    print("Account status: ")
    print("---------------------------------------")
    for id, acc in accounts.items():
        print(f"{acc["name"]} - Balance: {acc["balance"]}")

    
    print("\n\n")
    print("Monthly Actuals: ")
    print("--------------------------------------")
    for col, spend in monthly_actuals.items():
        print(f"{col} - Actual aggregated spending: {spend}")
    

def main(month: str | None = None) -> None:
    token = os.getenv("YNAB_TOKEN")
    if token is None:
        raise ValueError("YNAB token is not set")
    
    month = month or get_month()
    
    run_monthly_review(month=month, token=token)

if __name__ == "__main__":
    main()