"""Example TimeScrape scraper — fetches events from a public API."""

import requests
from timetiles.scraper import output

# Fetch sample data from a public API
response = requests.get("https://date.nager.at/api/v3/PublicHolidays/2026/DE", timeout=30)
response.raise_for_status()

holidays = response.json()

for holiday in holidays:
    output.write_row({
        "title": holiday["localName"],
        "date": holiday["date"],
        "location": "Germany",
        "description": holiday.get("name", ""),
        "url": f"https://date.nager.at/publicholiday/{holiday['date']}/DE",
    })

output.save()
print(f"Scraped {output.row_count} events")
