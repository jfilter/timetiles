"""CSV output writer for TimeTiles scrapers.

Usage:
    from timetiles.scraper import output

    output.write_row({"title": "Event", "date": "2026-01-01", "location": "Berlin"})
    output.write_row({"title": "Concert", "date": "2026-02-01", "location": "Munich"})
    output.save()
"""

import csv
import io
import os


class OutputWriter:
    """Collects rows and writes them as CSV to the output directory.

    Args:
        output_dir: Directory to write CSV files to.
            Defaults to TIMESCRAPE_OUTPUT_DIR env var or /output.
    """

    def __init__(self, output_dir: str | None = None):
        self._rows: list[dict] = []
        self._headers: list[str] | None = None
        self._output_dir = output_dir or os.environ.get("TIMESCRAPE_OUTPUT_DIR", "/output")
        self._filename = "data.csv"

    def write_row(self, row: dict) -> None:
        """Append a single row. Headers are auto-detected from the first row."""
        if self._headers is None:
            self._headers = list(row.keys())
        self._rows.append(row)

    def write_rows(self, rows: list[dict]) -> None:
        """Append multiple rows at once."""
        for row in rows:
            self.write_row(row)

    @property
    def row_count(self) -> int:
        """Number of rows written so far."""
        return len(self._rows)

    def save(self, filename: str | None = None) -> str:
        """Write all collected rows to CSV and return the output path.

        Args:
            filename: Override the default output filename ("data.csv").

        Returns:
            Absolute path to the written CSV file.
        """
        if filename:
            self._filename = filename

        output_path = os.path.join(self._output_dir, self._filename)

        if not self._rows:
            with open(output_path, "w", newline="", encoding="utf-8") as f:
                if self._headers:
                    writer = csv.DictWriter(f, fieldnames=self._headers)
                    writer.writeheader()
            return output_path

        if self._headers is None:
            self._headers = list(self._rows[0].keys())

        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=self._headers, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(self._rows)

        return output_path

    def to_csv_string(self) -> str:
        """Return collected rows as a CSV string (for debugging/testing)."""
        if not self._rows or not self._headers:
            return ""

        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=self._headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(self._rows)
        return buf.getvalue()


# Module-level singleton — scrapers import and use this directly
output = OutputWriter()
