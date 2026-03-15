FROM node:24-slim

# Pre-install common scraping libraries globally
RUN npm install -g \
    cheerio@1.0.0 \
    axios@1.7.9

# Install the timescrape helper library
COPY timescrape-helper /usr/local/lib/node_modules/@timescrape/helper

# Create non-root user
RUN useradd -m -u 1000 -s /bin/false scraper || true

# Create working directories
RUN mkdir -p /scraper /output && chown 1000:1000 /output

USER scraper
WORKDIR /scraper

# Allow importing global modules
ENV NODE_PATH=/usr/local/lib/node_modules
