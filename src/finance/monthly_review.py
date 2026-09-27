import argparse
import os
from datetime import date

from dotenv import load_dotenv

from life_os.category_mappings import CATEGORY_MAPPINGS, EXCLUDED_CATEGORIES
from life_os.integrations.finance import (
    FINANCE_CREDENTIALS_FILE,
    create_sheets_service,
    get_accounts,
    get_forecast_rows,
    get_month_categories,
    get_plans,
    select_plan,
)
from life_os.services.finance import (
    build_monthly_actuals,
    build_monthly_forecast,
    compare_forecast_actuals,
    format_mapping_problems,
    format_sheet_month,
    validate_category_mapping,
)

load_dotenv()


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Review YNAB actuals against the monthly forecast."
    )

    parser.add_argument(
        "month",
        nargs="?",
        help="Month to review in YYYY-MM-01 format.",
    )

    return parser.parse_args()


def get_month() -> str:
    first_day_of_month = date.today().replace(day=1)
    return str(first_day_of_month)


def run_monthly_review(month: str, token: str) -> None:
    plans = get_plans(token)
    plan = select_plan(plans, planname="Eivin - Personal")
    accounts = get_accounts(plan_id=plan, token=token)
    categories = get_month_categories(token, plan, month)

    problems = validate_category_mapping(
        categories=categories,
        category_mapping=CATEGORY_MAPPINGS,
        excluded_categories=EXCLUDED_CATEGORIES,
    )
    if problems.has_problems():
        print("Category mapping needs attention:\n")
        print(format_mapping_problems(problems))
        raise ValueError("Cannot calculate actuals with an invalid mapping")

    service = create_sheets_service(FINANCE_CREDENTIALS_FILE)
    spreadsheet_id = os.getenv("GOOGLE_SPREADSHEET_ID")
    range_name = "'Personal forecast'!A1:W20"
    forecast_rows = get_forecast_rows(service, spreadsheet_id, range_name)

    monthly_actuals = build_monthly_actuals(
        categories=categories, category_mapping=CATEGORY_MAPPINGS
    )
    monthly_forecast = build_monthly_forecast(
        rows=forecast_rows,
        month_header=format_sheet_month(month),
        category_mapping=CATEGORY_MAPPINGS,
    )

    comparison = compare_forecast_actuals(monthly_forecast, monthly_actuals)

    print("Account status: ")
    print("---------------------------------------")
    for _id, acc in accounts.items():
        print(f"{acc['name']} - Balance: {acc['balance']}")

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
    args = parse_arguments()
    main(month=args.month)
