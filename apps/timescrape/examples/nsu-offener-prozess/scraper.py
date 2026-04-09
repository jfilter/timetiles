"""
Scrape NSU-Komplex locations and events from the Offener Prozess interactive map.

Source: https://map.offener-prozess.de/
Data: 118 locations covering murders, bombings, robberies, hideouts, supporter
      networks, authorities, fanzines, and memorial demonstrations related to
      the National Socialist Underground (NSU) terror complex.

The site uses WordPress + WP Job Manager with a Leaflet map. Data is fetched
via the /jm-ajax/get_listings/ AJAX endpoint (paginated HTML-in-JSON), then
each listing's detail page is fetched for dates and full descriptions.
"""

import re
import time

import requests
from bs4 import BeautifulSoup
from timetiles.scraper import output

BASE_URL = "https://map.offener-prozess.de"
AJAX_URL = f"{BASE_URL}/jm-ajax/get_listings/"
PER_PAGE = 30
MAX_PAGES = 10
REQUEST_DELAY = 0.5  # seconds between detail page requests
TIMEOUT = 30

HEADERS = {
    "User-Agent": "TimeTiles-Scraper/1.0 (https://timetiles.org)",
    "Accept": "application/json, text/html",
}


def fetch_listing_pages():
    """Fetch all listing pages from the AJAX endpoint."""
    listings = []

    for page in range(1, MAX_PAGES + 1):
        print(f"Fetching listing page {page}...")
        resp = requests.get(
            AJAX_URL,
            params={"per_page": PER_PAGE, "page": page},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

        if not data.get("found_jobs"):
            break

        html = data.get("html", "")
        page_listings = parse_listing_html(html)
        listings.extend(page_listings)

        print(f"  Found {len(page_listings)} listings on page {page}")

        max_pages = data.get("max_num_pages", 1)
        if page >= max_pages:
            break

        time.sleep(REQUEST_DELAY)

    return listings


def parse_listing_html(html):
    """Parse listing cards from the AJAX HTML response."""
    soup = BeautifulSoup(html, "lxml")
    listings = []

    for card in soup.select("article.card"):
        lat = card.get("data-latitude", "").strip()
        lng = card.get("data-longitude", "").strip()
        categories = card.get("data-categories", "").strip()
        permalink = card.get("data-permalink", "").strip()

        post_id = ""
        if permalink:
            match = re.search(r"[?&]p=(\d+)", permalink)
            if match:
                post_id = match.group(1)

        title_el = card.select_one("h2.card__title")
        title = title_el.get_text(strip=True) if title_el else ""

        # Persons from card tagline (e.g. "Uwe Böhnhardt, Beate Zschäpe")
        tagline_el = card.select_one(".card__tagline")
        persons = tagline_el.get_text(strip=True) if tagline_el else ""

        # Build address from structured spans
        addr_el = card.select_one(".card__address")
        address = ""
        city = ""
        if addr_el:
            street = addr_el.select_one(".address__street")
            street_no = addr_el.select_one(".address__street-no")
            city_el = addr_el.select_one(".address__city")
            postcode = addr_el.select_one(".address__postcode")
            state = addr_el.select_one(".address__state-short")

            street_str = ""
            if street:
                street_str = street.get_text(strip=True)
                if street_no:
                    street_str += " " + street_no.get_text(strip=True)

            city = city_el.get_text(strip=True) if city_el else ""
            pc = postcode.get_text(strip=True) if postcode else ""
            st = state.get_text(strip=True) if state else ""

            parts = [p for p in [street_str, f"{pc} {city}".strip(), st] if p]
            address = ", ".join(parts)

        listings.append({
            "post_id": post_id,
            "title": title,
            "latitude": lat,
            "longitude": lng,
            "categories": categories,
            "address": address,
            "city": city,
            "persons": persons,
            "permalink": permalink,
        })

    return listings


def fetch_detail(listing):
    """Fetch the detail page for a single listing to get date and description."""
    url = listing.get("permalink", "")
    if not url:
        post_id = listing.get("post_id", "")
        if post_id:
            url = f"{BASE_URL}/?post_type=job_listing&p={post_id}"
        else:
            return None, None

    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  Error fetching detail for '{listing.get('title', '?')}': {e}")
        return None, None

    soup = BeautifulSoup(resp.text, "lxml")
    date_str = extract_date(soup)
    description = extract_description(soup)

    return date_str, description


def extract_date(soup):
    """Extract event date from the detail page."""
    # Look for date patterns in the page content (DD. Month YYYY or similar)
    content = soup.get_text()

    # German date patterns: "9. September 2000", "25. April 2007", etc.
    date_pattern = re.compile(
        r"(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|"
        r"September|Oktober|November|Dezember)\s*(\d{4})"
    )
    match = date_pattern.search(content)
    if match:
        day, month_de, year = match.groups()
        month_map = {
            "Januar": "01", "Februar": "02", "März": "03", "April": "04",
            "Mai": "05", "Juni": "06", "Juli": "07", "August": "08",
            "September": "09", "Oktober": "10", "November": "11", "Dezember": "12",
        }
        month = month_map.get(month_de, "01")
        return f"{year}-{month}-{day.zfill(2)}"

    # English date patterns: "April 25, 2007" etc.
    date_pattern_en = re.compile(
        r"(January|February|March|April|May|June|July|August|"
        r"September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})"
    )
    match = date_pattern_en.search(content)
    if match:
        month_en, day, year = match.groups()
        month_map_en = {
            "January": "01", "February": "02", "March": "03", "April": "04",
            "May": "05", "June": "06", "July": "07", "August": "08",
            "September": "09", "October": "10", "November": "11", "December": "12",
        }
        month = month_map_en.get(month_en, "01")
        return f"{year}-{month}-{day.zfill(2)}"

    # ISO date: 2000-09-09
    iso_pattern = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
    match = iso_pattern.search(content)
    if match:
        return match.group(0)

    return ""


def extract_description(soup):
    """Extract the main description text from the detail page."""
    # Content lives in .widget_listing_content inside .listing-sidebar--main
    el = soup.select_one(".widget_listing_content")
    if el:
        text = el.get_text(separator=" ", strip=True)
        return clean_text(text) if len(text) > 20 else ""

    # Fallback: entry-content paragraphs
    el = soup.select_one(".entry-content")
    if el:
        for remove_sel in ["form", ".comment-respond", "script", "header"]:
            for tag in el.select(remove_sel):
                tag.decompose()
        text = el.get_text(separator=" ", strip=True)
        return clean_text(text) if len(text) > 20 else ""

    return ""


def clean_text(text):
    """Clean extracted text: collapse whitespace, remove navigation artifacts."""
    text = re.sub(r"\s+", " ", text)
    text = text.strip()
    # Truncate very long descriptions
    if len(text) > 2000:
        text = text[:1997] + "..."
    return text


def main():
    print("Fetching NSU-Komplex listings from Offener Prozess...")
    listings = fetch_listing_pages()
    print(f"Found {len(listings)} listings total")

    for i, listing in enumerate(listings, 1):
        title = listing.get("title", "Unknown")
        print(f"[{i}/{len(listings)}] Fetching detail: {title}")

        date_str, description = fetch_detail(listing)
        time.sleep(REQUEST_DELAY)

        output.write_row({
            "title": title,
            "date": date_str or "",
            "description": description or "",
            "latitude": listing.get("latitude", ""),
            "longitude": listing.get("longitude", ""),
            "address": listing.get("address", ""),
            "city": listing.get("city", ""),
            "category": listing.get("categories", ""),
            "persons": listing.get("persons", ""),
            "source_url": listing.get("permalink", ""),
        })

    output.save()
    print(f"Done. Scraped {output.row_count} events from Offener Prozess.")


main()
