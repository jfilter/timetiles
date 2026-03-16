FROM python:3.12-slim

# Pre-install common scraping libraries
RUN pip install --no-cache-dir \
    requests==2.32.3 \
    beautifulsoup4==4.13.3 \
    lxml==5.3.1 \
    pandas==2.2.3 \
    cssselect==1.2.0

# Install the timescrape helper library
COPY timescrape /usr/local/lib/python3.12/site-packages/timescrape

# Create non-root user
RUN useradd -m -u 1000 -s /bin/false scraper

# Create working directories
RUN mkdir -p /scraper /output && chown scraper:scraper /output

USER scraper
WORKDIR /scraper

HEALTHCHECK --interval=60s --timeout=5s --retries=1 CMD python -c "print('ok')" || exit 1
