from dataclasses import dataclass, field


@dataclass
class AccountBalance:
    name: str
    balance: float
    type: str


@dataclass
class CategoryComparison:
    label: str
    forecast: float
    actual: float
    difference: float


@dataclass
class FinanceReview:
    month: str
    accounts: list[AccountBalance]
    categories: list[CategoryComparison]
    total_forecast: float
    total_actual: float
    total_difference: float


@dataclass
class MappingProblems:
    """Category mapping issues that block calculation, with display strings.

    The service builds human-readable descriptions because it is the only
    place that has both the YNAB categories and the mapping decisions; the
    CLI prints them and the API surfaces them as error detail.
    """

    duplicated: list[str] = field(default_factory=list)
    mapped_and_excluded: list[str] = field(default_factory=list)
    unknown_mapped: list[str] = field(default_factory=list)
    unknown_excluded: list[str] = field(default_factory=list)
    unmapped_active: list[str] = field(default_factory=list)

    def has_problems(self) -> bool:
        return bool(
            self.duplicated
            or self.mapped_and_excluded
            or self.unknown_mapped
            or self.unknown_excluded
            or self.unmapped_active
        )
