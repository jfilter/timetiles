FROM node:24-slim

# Pre-install common scraping libraries and the TimeTiles scraper SDK globally
RUN npm install -g \
    cheerio@1.0.0 \
    axios@1.7.9 \
    @timetiles/scraper@latest

# Create non-root user
RUN useradd -m -u 1000 -s /bin/false scraper || true

# Create working directories
RUN mkdir -p /scraper /output && chown 1000:1000 /output

USER scraper
WORKDIR /scraper

# Allow importing global modules
ENV NODE_PATH=/usr/local/lib/node_modules

HEALTHCHECK --interval=60s --timeout=5s --retries=1 CMD node -e "console.log('ok')" || exit 1
