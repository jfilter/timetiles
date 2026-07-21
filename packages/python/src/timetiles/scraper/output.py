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
        filename: Output filename. Defaults to the TIMESCRAPE_OUTPUT_FILE env
            var (set by the runner from the manifest's ``output:``) or data.csv.
    """

    def __init__(self, output_dir: str | None = None, filename: str | None = None):
        self._rows: list[dict] = []
        self._output_dir = output_dir or os.environ.get("TIMESCRAPE_OUTPUT_DIR", "/output")
        # The runner looks for the filename the manifest declared. Without
        # reading it here the SDK always wrote data.csv, so every manifest
        # declaring another name failed with "no output file produced".
        self._filename = filename or os.environ.get("TIMESCRAPE_OUTPUT_FILE", "data.csv")

    def write_row(self, row: dict) -> None:
        """Append a single row."""
        self._rows.append(row)

    def write_rows(self, rows: list[dict]) -> None:
        """Append multiple rows at once."""
        for row in rows:
            self.write_row(row)

    @property
    def row_count(self) -> int:
        """Number of rows written so far."""
        return len(self._rows)

    def _columns(self) -> list[str]:
        """Union of every row's keys, in first-seen order.

        Taking headers from the FIRST row only silently dropped every field
        that appears solely in later rows — with ``extrasaction="ignore"``
        discarding the values without so much as a warning. A listing where
        only some entries carry a ``price`` lost that column entirely.
        """
        columns: list[str] = []
        seen: set[str] = set()
        for row in self._rows:
            for key in row:
                if key not in seen:
                    seen.add(key)
                    columns.append(key)
        return columns

    def save(self, filename: str | None = None) -> str:
        """Write all collected rows to CSV and return the output path.

        Writing zero rows is a legitimate result — a listing page with no
        entries today — and produces an empty file rather than an error. The
        runner reads "file present, zero records" as a successful run of zero
        rows; only a MISSING file counts as a failure.

        Args:
            filename: Override the configured output filename.

        Returns:
            Absolute path to the written CSV file.
        """
        if filename:
            self._filename = filename

        output_path = os.path.join(self._output_dir, self._filename)

        with open(output_path, "w", newline="", encoding="utf-8") as f:
            f.write(self.to_csv_string())

        return output_path

    def to_csv_string(self) -> str:
        """Return collected rows as a CSV string (identical to what save() writes)."""
        headers = self._columns()
        if not headers:
            return ""

        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=headers, restval="")
        writer.writeheader()
        writer.writerows(self._rows)
        return buf.getvalue()


# Module-level singleton — scrapers import and use this directly
output = OutputWriter()
