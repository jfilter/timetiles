"""Scrape Austrian public holidays."""

import requests
from timetiles.scraper import output

response = requests.get("https://date.nager.at/api/v3/PublicHolidays/2026/AT", timeout=30)
response.raise_for_status()

for holiday in response.json():
    output.write_row({
        "title": holiday["localName"],
        "date": holiday["date"],
        "location": "Austria",
    })

output.save("output/austria.csv")
print(f"Scraped {output.row_count} Austrian holidays")
