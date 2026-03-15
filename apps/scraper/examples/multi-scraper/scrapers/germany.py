"""Scrape German public holidays."""

import requests
from timescrape import output

response = requests.get("https://date.nager.at/api/v3/PublicHolidays/2026/DE", timeout=30)
response.raise_for_status()

for holiday in response.json():
    output.write_row({
        "title": holiday["localName"],
        "date": holiday["date"],
        "location": "Germany",
    })

output.save("output/germany.csv")
print(f"Scraped {output.row_count} German holidays")
