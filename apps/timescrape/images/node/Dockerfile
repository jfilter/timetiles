FROM node:24-slim

# Pre-install common scraping libraries and the TimeTiles scraper SDK globally
RUN npm install -g \
    cheerio@1.0.0 \
    axios@1.7.9 \
    @timetiles/scraper@latest

# Create non-root user.
#
# node:24-slim already ships a `node` account at uid 1000, so adding a second
# account at that uid fails with "UID is not unique". That failure used to be
# swallowed by `|| true`, leaving the image with `USER scraper` pointing at an
# account that does not exist -- every Node scraper died with "unable to find
# user scraper: no matching entries in passwd file". Rename the existing
# account instead of adding one, so the image keeps uid 1000 and stays
# symmetric with the Python image. No `|| true`: this must fail the build.
RUN usermod -l scraper -d /home/scraper -m -s /bin/false node \
 && groupmod -n scraper node

# Create working directories
RUN mkdir -p /scraper /output && chown scraper:scraper /output

USER scraper
WORKDIR /scraper

# Allow importing global modules
ENV NODE_PATH=/usr/local/lib/node_modules

HEALTHCHECK --interval=60s --timeout=5s --retries=1 CMD node -e "console.log('ok')" || exit 1
