from dotenv import load_dotenv
import os
from category_mappings import CATEGORY_MAPPINGS, EXCLUDED_CATEGORIES
from ynab import get_plans, select_plan, get_accounts, get_month_categories
from datetime import date, timedelta
from sheets import generate_column_mapping, create_sheets_service, get_range_values, find_header_row, parse_number, CREDENTIALS_FILE, format_sheet_month
from googleapiclient.discovery import build

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
    
    actuals["total"] = tot_spend
    return actuals

def build_monthly_forecast(service: build, spreadsheet_id: str, range_name: str, month: str) -> dict[str, float]:
    forecast = {}
    range_values = get_range_values(service, spreadsheet_id, range_name)

    mapping = generate_column_mapping(rows = range_values)
    row_index, header_row = find_header_row(rows=range_values, header_start=month)
    tot_estimate = 0
    for cat, col in mapping.items():
        if cat.lower() not in ["month", "total income"]:
            val = (
                header_row[col]
                if col < len(header_row)
                else ""
            )

            val_num = parse_number(val)
            forecast[cat] = val_num
            tot_estimate += val_num
    forecast["Total"] = tot_estimate
    return forecast

def compare_forecast_actuals(forecast: dict[str, float], actuals: dict[str, float]) -> dict[str, float]:
    comparison = {}

    for cat, estimate in forecast.items():

        actual = actuals[cat.lower()]
        comparison[cat] = estimate - actual

    return comparison



def get_month() -> str:
    first_day_of_month = date.today().replace(day=1)
    return str(first_day_of_month)

def run_monthly_review(month: str, token: str) -> None:
    plans = get_plans(token)
    plan = select_plan(plans, planname="Eivin - Personal")
    accounts = get_accounts(plan_id=plan, token=token)
    categories = get_month_categories(token, plan, month)
    service = create_sheets_service(CREDENTIALS_FILE)
    if not validate_category_mapping(categories=categories, category_mapping=CATEGORY_MAPPINGS, excluded_categories=EXCLUDED_CATEGORIES):
        raise ValueError(
            "Cannot calculate actuals with an invalid mapping"
            )
    monthly_actuals = build_monthly_actuals(categories=categories, category_mapping=CATEGORY_MAPPINGS)
    monthly_forecast = build_monthly_forecast(service, spreadsheet_id=os.getenv("GOOGLE_SPREADSHEET_ID"), range_name="'Personal forecast'!A1:W20", month=format_sheet_month(month))

    comparison = compare_forecast_actuals(monthly_forecast, monthly_actuals)

    print("Account status: ")
    print("---------------------------------------")
    for id, acc in accounts.items():
        print(f"{acc["name"]} - Balance: {acc["balance"]}")

    
    print("\n\n")
    print("Monthly Actuals: ")
    print("--------------------------------------")
    for col, spend in monthly_actuals.items():
        print(f"{col} - Actual aggregated spending: {spend}")
    
    print("\n\n")
    print("Monthly Forecast: ")
    print("--------------------------------------")
    for col, estimate in monthly_forecast.items():
        print(f"{col} - Estimated spending: {estimate}")

    print("\n\n")
    print("Monthly Comparison: ")
    print("--------------------------------------")
    for col, val in comparison.items():
        print(f"{col} - +/-: {val}")

def main(month: str | None = None) -> None:
    token = os.getenv("YNAB_TOKEN")
    if token is None:
        raise ValueError("YNAB token is not set")
    
    month = month or get_month()
    
    run_monthly_review(month=month, token=token)

if __name__ == "__main__":
    main()