"""TimeTiles scraper SDK — CSV output helper for building scrapers.

Usage:
    from timetiles.scraper import output

    output.write_row({"title": "Event", "date": "2026-01-01", "location": "Berlin"})
    output.save()
"""

from timetiles.scraper.output import OutputWriter, output

__all__ = ["OutputWriter", "output"]
