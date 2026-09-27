from life_os.category_mappings import CATEGORY_MAPPINGS
from life_os.models.finance import (
    AccountBalance,
    CategoryComparison,
    FinanceReview,
    MappingProblems,
)

# Forecast columns that are not spending categories.
NON_SPENDING_HEADERS = ["month", "total income"]


def validate_category_mapping(
    categories: dict[str, dict],
    category_mapping: dict[str, list[str]],
    excluded_categories: dict[str, str],
) -> MappingProblems:
    """Check the YNAB-to-forecast mapping without any I/O.

    Descriptions are built here because this is the only place that has both
    the YNAB categories and the mapping decisions; the CLI prints them and
    the API surfaces them as error detail.
    """
    mapped_locations: dict[str, list[str]] = {}

    for forecast_column, category_ids in category_mapping.items():
        for category_id in category_ids:
            mapped_locations.setdefault(category_id, []).append(forecast_column)

    mapped_ids = set(mapped_locations)
    excluded_ids = set(excluded_categories)
    ynab_ids = set(categories)

    problems = MappingProblems()

    def describe(category_id: str) -> str:
        category = categories.get(category_id)

        if category is None:
            return category_id

        return f"{category['category_group_name']} → {category['name']} ({category_id})"

    for category_id, columns in mapped_locations.items():
        if len(columns) > 1:
            problems.duplicated.append(
                f"{describe(category_id)}: {', '.join(sorted(columns))}"
            )

    for category_id in sorted(mapped_ids & excluded_ids):
        problems.mapped_and_excluded.append(describe(category_id))

    for category_id in sorted(mapped_ids - ynab_ids):
        problems.unknown_mapped.append(category_id)

    for category_id in sorted(excluded_ids - ynab_ids):
        problems.unknown_excluded.append(category_id)

    unmapped_active = [
        category_id
        for category_id, category in categories.items()
        if category_id not in mapped_ids
        and category_id not in excluded_ids
        and category["activity"] != 0
        and not category["deleted"]
    ]
    for category_id in sorted(unmapped_active):
        activity = categories[category_id]["activity"]
        problems.unmapped_active.append(f"{describe(category_id)}: {activity:.2f} NOK")

    return problems


def format_mapping_problems(problems: MappingProblems) -> str:
    """Render mapping problems as grouped, human-readable text."""
    sections = [
        ("Mapped more than once:", problems.duplicated),
        ("Both mapped and excluded:", problems.mapped_and_excluded),
        ("Mapped IDs not found in YNAB:", problems.unknown_mapped),
        ("Excluded IDs not found in YNAB:", problems.unknown_excluded),
        ("Active categories without a decision:", problems.unmapped_active),
    ]

    lines = []
    for heading, entries in sections:
        if entries:
            lines.append(heading)
            lines.extend(f"  {entry}" for entry in entries)
            lines.append("")

    return "\n".join(lines).strip()


def build_monthly_actuals(
    categories: dict[str, dict],
    category_mapping: dict[str, list[str]],
) -> dict[str, float]:
    """Aggregate YNAB category activity into forecast-column actuals.

    YNAB activity is negative for spending, so actuals flip the sign; keys
    are lowercased to match the spreadsheet headers.
    """
    actuals: dict[str, float] = {}
    total = 0.0

    for column in category_mapping:
        column_spend = 0.0
        for category_id in category_mapping[column]:
            column_spend += -categories[category_id]["activity"]
        actuals[column.lower()] = column_spend
        total += column_spend

    actuals["total"] = total
    return actuals


def build_monthly_forecast(rows: list[list], month_header: str) -> dict[str, float]:
    """Read one month column from forecast sheet rows into values per column.

    Rows come from the Sheets adapter as-is. The month header uses the
    spreadsheet's "Sep 2026" format. A mapped column missing from the sheet
    raises rather than silently counting as zero, which would understate the
    forecast and distort every difference.
    """
    mapping = _column_mapping(rows)
    _, header_row = _header_row(rows, month_header)

    expected_columns = {
        column.lower()
        for column, category_ids in CATEGORY_MAPPINGS.items()
        if category_ids
    }
    missing_columns = sorted(expected_columns - set(mapping))
    if missing_columns:
        raise ValueError(
            "Forecast sheet is missing mapped columns: " + ", ".join(missing_columns)
        )

    forecast: dict[str, float] = {}
    total = 0.0
    for column, column_index in mapping.items():
        if column.lower() in NON_SPENDING_HEADERS:
            continue
        value = header_row[column_index] if column_index < len(header_row) else ""
        amount = parse_number(value)
        forecast[column.lower()] = amount
        total += amount

    forecast["total"] = total
    return forecast


def compare_forecast_actuals(
    forecast: dict[str, float], actuals: dict[str, float]
) -> dict[str, float]:
    """Positive difference means under budget, negative means overspent."""
    return {column: forecast[column] - actuals[column] for column in forecast}


def build_finance_review(
    month: str,
    accounts: dict[str, dict],
    categories: dict[str, dict],
    sheet_rows: list[list],
    category_mapping: dict[str, list[str]],
) -> FinanceReview:
    """Compose the full monthly review from already-fetched data.

    Callers must validate the category mapping first and fail before here;
    this function assumes every mapped category exists in categories.
    """
    actuals = build_monthly_actuals(categories, category_mapping)
    forecast = build_monthly_forecast(sheet_rows, format_sheet_month(month))
    comparison = compare_forecast_actuals(forecast, actuals)

    category_comparisons = [
        CategoryComparison(
            label=column,
            forecast=forecast.get(column.lower(), 0.0),
            actual=actuals[column.lower()],
            difference=comparison.get(column.lower(), 0.0),
        )
        for column in category_mapping
    ]

    account_balances = [
        AccountBalance(
            name=account["name"],
            balance=account["balance"],
            type=account["type"],
        )
        for account in accounts.values()
        if not account["closed"] and not account["deleted"]
    ]

    return FinanceReview(
        month=month,
        accounts=account_balances,
        categories=category_comparisons,
        total_forecast=forecast["total"],
        total_actual=actuals["total"],
        total_difference=comparison["total"],
    )


def format_sheet_month(month: str) -> str:
    """Convert an ISO first-of-month date into the sheet's "Sep 2026" format."""
    from datetime import date

    parsed_month = date.fromisoformat(month)
    return f"{parsed_month:%b} {parsed_month:%Y}"


def parse_number(value: str | int | float | None) -> float:
    if value in ("", None):
        return 0.0

    if isinstance(value, (int, float)):
        return float(value)

    normalized = (
        value.replace("\xa0", "").replace(" ", "").replace("kr", "").replace(",", "").strip()
    )
    return float(normalized) if normalized else 0.0


def _column_mapping(rows: list[list]) -> dict[str, int]:
    row = _header_row(rows, "month")[1]
    return {
        header.lower(): index
        for index, header in enumerate(row)
        if header.lower() in CATEGORY_MAPPINGS or header.lower() in NON_SPENDING_HEADERS
    }


def _header_row(rows: list[list], header_start: str) -> tuple[int, list]:
    for row_index, row in enumerate(rows):
        if row == []:
            continue
        if row[0].lower() == header_start.lower():
            return (row_index, row)
    raise ValueError(f"Could not find a header row containing {header_start}")
