# Build context: repository root, narrowed by Dockerfile.dockerignore next to this file.
FROM node:24-slim AS sdk-builder

# Build tool versions must match the packages/scraper importer in pnpm-lock.yaml.
WORKDIR /build
RUN npm install --no-save --no-fund --no-audit tsup@8.5.1 typescript@5.9.3 @types/node@26.1.1
COPY packages/typescript-config/base.json node_modules/@timetiles/typescript-config/base.json
COPY packages/scraper packages/scraper
WORKDIR /build/packages/scraper
# devDependencies carry pnpm-only workspace:/catalog: specifiers that npm cannot parse.
RUN /build/node_modules/.bin/tsup \
 && npm pkg delete devDependencies \
 && npm pack --pack-destination /build \
 && mv /build/timetiles-scraper-*.tgz /build/timetiles-scraper.tgz

FROM node:24-slim

# Pre-install common scraping libraries and the TimeTiles scraper SDK globally
RUN --mount=type=bind,from=sdk-builder,source=/build/timetiles-scraper.tgz,target=/tmp/timetiles-scraper.tgz \
    npm install -g \
    cheerio@1.0.0 \
    axios@1.7.9 \
    /tmp/timetiles-scraper.tgz

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

# Make the globally installed packages resolvable as bare specifiers.
#
# NODE_PATH alone is NOT enough: Node's ESM resolver ignores it entirely, and
# every scraper the SDK scaffolds uses `import` syntax (Node 24 auto-detects
# ESM in a bare .js file, so the import runs as ESM even without a
# package.json). The result was that no node-runtime scraper could load
# @timetiles/scraper -- it died with ERR_MODULE_NOT_FOUND before scraping
# anything.
#
# The ESM resolver DOES walk the node_modules chain up to the filesystem root,
# so a /node_modules symlink puts the global store on that path. The scraper's
# own /scraper/node_modules, if the repo ships one, still wins -- it is checked
# first. NODE_PATH stays for CJS `require()` of the pre-installed helpers.
RUN ln -s /usr/local/lib/node_modules /node_modules

# uid of the scraper account renamed from node above
USER 1000
WORKDIR /scraper

# Allow importing global modules
ENV NODE_PATH=/usr/local/lib/node_modules

HEALTHCHECK --interval=60s --timeout=5s --retries=1 CMD ["node", "-e", "console.log('ok')"]
