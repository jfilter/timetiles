/**
 * Example TimeScrape scraper — fetches events from a public API.
 */

import axios from "axios";
import { output } from "@timescrape/helper";

const response = await axios.get("https://date.nager.at/api/v3/PublicHolidays/2026/AT", { timeout: 30_000 });

for (const holiday of response.data) {
  output.writeRow({
    title: holiday.localName,
    date: holiday.date,
    location: "Austria",
    description: holiday.name ?? "",
    url: `https://date.nager.at/publicholiday/${holiday.date}/AT`,
  });
}

output.save();
console.log(`Scraped ${output.rowCount} events`);
