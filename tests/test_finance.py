import pytest

from life_os.category_mappings import CATEGORY_MAPPINGS, EXCLUDED_CATEGORIES
from life_os.integrations.finance import create_sheets_service
from life_os.models.finance import (
    InvalidCategoryMappingError,
    SheetsError,
    YnabError,
)
from life_os.services.finance import (
    build_finance_review,
    build_monthly_actuals,
    build_monthly_forecast,
    compare_forecast_actuals,
    format_mapping_problems,
    format_sheet_month,
    get_finance_review,
    validate_category_mapping,
)


def ynab_category(name, group, activity, deleted=False):
    return {
        "name": name,
        "category_group_name": group,
        "activity": activity,
        "budgeted": 100.0,
        "balance": 50.0,
        "deleted": deleted,
    }


def make_categories():
    """Fake YNAB categories keyed by the real mapped category IDs."""
    return {
        "90a5bd12-b3d2-4fd0-bde3-893a62d97c6d": ynab_category("Shared", "Fixed", -500.0),
        "f1de2c9a-9ca2-448b-98e4-5d483e90658b": ynab_category("Rent", "Fixed", -2000.0),
        "aac82d8d-89e8-4b8b-9057-22240fa3539b": ynab_category("Insurance", "Fixed", -300.0),
        "34e1f78c-b323-424f-ac8e-43a13fc43748": ynab_category("Gym", "Fixed", -100.0),
        "4b54d55d-e8c7-4442-92a8-e723f6928463": ynab_category("Groceries", "Everyday", -1500.0),
        "7adb6c00-5db3-4364-af4d-eeafcd1e7608": ynab_category("Cafe", "Everyday", -250.0),
        "4c0925b4-987c-4808-b0a5-f28c4cda25d8": ynab_category("Transport", "Everyday", -300.0),
        "04ebb144-bcc9-41bb-8ce2-f89b680a6154": ynab_category("Phone", "Everyday", -100.0),
        "d400eb1f-12ac-4b0d-9fcb-96ecb15f15ee": ynab_category("Fun", "Everyday", -200.0),
        "3f644c83-dad6-45f8-ac09-80c408fa0b08": ynab_category("Flights", "Travel", -800.0),
        "9b86b840-d4dd-4b33-971a-7b06b2ce6942": ynab_category("Hotels", "Travel", -400.0),
        "83659eec-e08e-4550-9a60-22d560fce803": ynab_category("Gifts", "Travel", -150.0),
        "9bb0b250-2853-48de-ab57-3123eca5cc45": ynab_category(
            "Eivin kredittkort", "Credit Card Payments", -250.0
        ),
        # Excluded categories, present in YNAB but not part of the review.
        "7af38ec2-d0a6-4369-82a7-000851be9a73": ynab_category("Uncategorized", "Other", 0.0),
        "495715b7-6666-4877-b908-02d44bbcb8cb": ynab_category("Inflow", "Other", 0.0),
        "b2932953-2d80-4a9e-93a6-9175f4d5d45b": ynab_category("Emergency fund", "Savings", 0.0),
        "df280687-f1ff-4be4-889e-e71976a142c6": ynab_category(
            "Long term investement", "Savings", 0.0
        ),
    }


def make_sheet_rows():
    return [
        [
            "Month",
            "Shared fixed contribution",
            "Share everyday contribution",
            "Personal fixed spending",
            "Zürich housing",
            "Personal everyday spending",
            "Travel & one-offs",
            "Total income",
        ],
        ["Aug 2026", "500 kr", "0", "2 000", "0", "1 000 kr", "300", "45 000"],
        ["Sep 2026", "500", "0", "2 100", "0", "1 500", "0", "45 000"],
    ]


class TestValidateCategoryMapping:
    def test_valid_mapping_has_no_problems(self):
        problems = validate_category_mapping(
            make_categories(), CATEGORY_MAPPINGS, EXCLUDED_CATEGORIES
        )

        assert not problems.has_problems()

    def test_duplicate_mapping_is_reported(self):
        mapping = {**CATEGORY_MAPPINGS, "personal fixed spending": [
            "f1de2c9a-9ca2-448b-98e4-5d483e90658b",
            "f1de2c9a-9ca2-448b-98e4-5d483e90658b",
        ]}
        categories = make_categories()
        # Keep every active YNAB category mapped so only duplicates are flagged.
        mapping["personal everyday spending"] = categories and [
            "4b54d55d-e8c7-4442-92a8-e723f6928463",
        ]

        problems = validate_category_mapping(categories, mapping, EXCLUDED_CATEGORIES)

        assert problems.duplicated
        assert "f1de2c9a" in problems.duplicated[0]

    def test_unknown_mapped_id_is_reported(self):
        mapping = {"personal fixed spending": ["does-not-exist"]}
        categories = {
            "everyday-1": ynab_category("Groceries", "Everyday", 0.0),
        }

        problems = validate_category_mapping(categories, mapping, {})

        assert problems.unknown_mapped == ["does-not-exist"]

    def test_unmapped_active_category_is_reported(self):
        categories = {
            "active-1": ynab_category("Groceries", "Everyday", -100.0),
            "inactive-1": ynab_category("Old", "Everyday", 0.0),
        }

        problems = validate_category_mapping(categories, {}, {})

        assert len(problems.unmapped_active) == 1
        assert "Groceries" in problems.unmapped_active[0]

    def test_deleted_and_zero_activity_categories_are_ignored(self):
        categories = {
            "deleted-1": ynab_category("Old", "Everyday", -100.0, deleted=True),
            "zero-1": ynab_category("Quiet", "Everyday", 0.0),
        }

        problems = validate_category_mapping(categories, {}, {})

        assert not problems.has_problems()

    def test_mapped_and_excluded_is_reported(self):
        shared_id = "f1de2c9a-9ca2-448b-98e4-5d483e90658b"
        categories = {shared_id: ynab_category("Rent", "Fixed", 0.0)}

        problems = validate_category_mapping(
            categories,
            {"personal fixed spending": [shared_id]},
            {shared_id: "Rent"},
        )

        assert problems.mapped_and_excluded

    def test_format_groups_sections(self):
        problems = validate_category_mapping(
            {"unknown-1": ynab_category("Groceries", "Everyday", -100.0)}, {}, {}
        )

        text = format_mapping_problems(problems)

        assert "Active categories without a decision:" in text
        assert "Groceries" in text


class TestBuildMonthlyActuals:
    def test_aggregates_activity_by_column_with_flipped_sign(self):
        categories = {
            "cat-1": ynab_category("Groceries", "Everyday", -1500.0),
            "cat-2": ynab_category("Cafe", "Everyday", -250.0),
        }
        mapping = {"personal everyday spending": ["cat-1", "cat-2"]}

        actuals = build_monthly_actuals(categories, mapping)

        assert actuals["personal everyday spending"] == 1750.0
        assert actuals["total"] == 1750.0

    def test_keys_are_lowercased(self):
        categories = {"cat-1": ynab_category("Rent", "Fixed", -2000.0)}
        mapping = {"Zürich Housing": ["cat-1"]}

        actuals = build_monthly_actuals(categories, mapping)

        assert "zürich housing" in actuals


class TestBuildMonthlyForecast:
    def test_reads_month_column_and_parses_numbers(self):
        rows = make_sheet_rows()

        forecast = build_monthly_forecast(rows, "Sep 2026", CATEGORY_MAPPINGS)

        assert forecast["personal everyday spending"] == 1500.0
        assert forecast["personal fixed spending"] == 2100.0

    def test_totals_sum_categories(self):
        rows = make_sheet_rows()

        forecast = build_monthly_forecast(rows, "Sep 2026", CATEGORY_MAPPINGS)

        assert forecast["total"] == 500.0 + 0.0 + 2100.0 + 0.0 + 1500.0 + 0.0

    def test_missing_month_row_raises(self):
        rows = make_sheet_rows()

        with pytest.raises(ValueError, match="Sep 2025"):
            build_monthly_forecast(rows, "Sep 2025", CATEGORY_MAPPINGS)

    def test_missing_mapped_column_raises(self):
        rows = [
            ["Month", "Personal fixed spending"],
            ["Sep 2026", "2 100"],
        ]

        with pytest.raises(ValueError, match="missing mapped columns"):
            build_monthly_forecast(rows, "Sep 2026", CATEGORY_MAPPINGS)

    def test_honors_the_supplied_category_mapping(self):
        rows = [
            ["Month", "Shared fixed contribution", "Custom Column"],
            ["Sep 2026", "500", "1 200"],
        ]
        mapping = {"Custom Column": ["cat-1"]}

        forecast = build_monthly_forecast(rows, "Sep 2026", mapping)

        assert forecast["custom column"] == 1200.0
        assert forecast["total"] == 1200.0

    def test_empty_cells_become_zero(self):
        rows = [
            ["Month", "Shared fixed contribution", "Personal fixed spending",
             "Personal everyday spending", "Travel & one-offs"],
            ["Sep 2026", "", "2100", "1500", ""],
        ]

        forecast = build_monthly_forecast(rows, "Sep 2026", CATEGORY_MAPPINGS)

        assert forecast["travel & one-offs"] == 0.0

    def test_currency_and_thousand_separators_parse(self):
        rows = [
            ["Month", "Shared fixed contribution", "Personal fixed spending",
             "Personal everyday spending", "Travel & one-offs"],
            ["Sep 2026", "500", "2 100", "1\xa0500 kr", "300"],
        ]

        forecast = build_monthly_forecast(rows, "Sep 2026", CATEGORY_MAPPINGS)

        assert forecast["personal everyday spending"] == 1500.0
        assert forecast["personal fixed spending"] == 2100.0


class TestCompareForecastActuals:
    def test_positive_difference_is_under_budget(self):
        forecast = {"personal fixed spending": 2100.0}
        actuals = {"personal fixed spending": 2400.0}

        comparison = compare_forecast_actuals(forecast, actuals)

        assert comparison["personal fixed spending"] == -300.0


class TestCreateSheetsService:
    def test_wraps_credential_failures_in_sheets_error(self, tmp_path):
        with pytest.raises(SheetsError, match="credentials"):
            create_sheets_service(tmp_path / "missing.json")


class TestFormatSheetMonth:
    def test_formats_iso_date_as_sheet_header(self):
        assert format_sheet_month("2026-09-01") == "Sep 2026"


class TestBuildFinanceReview:
    def test_composes_full_review(self):
        accounts = {
            "acc-1": {
                "name": "Checking",
                "balance": 12345.0,
                "type": "checking",
                "closed": False,
                "deleted": False,
            },
            "acc-2": {
                "name": "Old",
                "balance": 1.0,
                "type": "checking",
                "closed": True,
                "deleted": False,
            },
        }
        categories = make_categories()

        review = build_finance_review(
            month="2026-09-01",
            accounts=accounts,
            categories=categories,
            sheet_rows=make_sheet_rows(),
            category_mapping=CATEGORY_MAPPINGS,
        )

        assert review.month == "2026-09-01"
        assert [account.name for account in review.accounts] == ["Checking"]
        assert review.total_actual == 6850.0
        assert review.total_forecast == 4100.0
        assert review.total_difference == 4100.0 - 6850.0
        assert [c.label for c in review.categories] == list(CATEGORY_MAPPINGS)

    def test_total_difference_matches_sum_of_categories(self):
        categories = make_categories()

        review = build_finance_review(
            month="2026-09-01",
            accounts={},
            categories=categories,
            sheet_rows=make_sheet_rows(),
            category_mapping=CATEGORY_MAPPINGS,
        )

        summed = sum(c.difference for c in review.categories)
        assert review.total_difference == pytest.approx(summed)


class TestGetFinanceReview:
    def test_composes_review_from_fetched_data(self):
        def fetch_data(month):
            assert month == "2026-09-01"
            return {}, make_categories(), make_sheet_rows()

        review = get_finance_review(
            "2026-09-01", fetch_data, CATEGORY_MAPPINGS, EXCLUDED_CATEGORIES
        )

        assert review.month == "2026-09-01"
        assert review.total_actual == 6850.0

    def test_raises_on_mapping_problems(self):
        def fetch_data(month):
            return {}, {"active-1": ynab_category("Groceries", "Everyday", -100.0)}, []

        with pytest.raises(InvalidCategoryMappingError) as excinfo:
            get_finance_review("2026-09-01", fetch_data, {}, {})

        assert excinfo.value.problems.unmapped_active

    def test_propagates_source_errors(self):
        def fetch_data(month):
            raise YnabError("YNAB request failed")

        with pytest.raises(YnabError):
            get_finance_review("2026-09-01", fetch_data, CATEGORY_MAPPINGS, EXCLUDED_CATEGORIES)
