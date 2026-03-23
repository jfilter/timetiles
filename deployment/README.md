# Production Deployment

Full documentation at **[docs.timetiles.io/self-hosting](https://docs.timetiles.io/self-hosting/)**.

## Bootstrap (Fresh Ubuntu 24.04)

```bash
curl -fsSL https://raw.githubusercontent.com/jfilter/timetiles/main/deployment/bootstrap/install.sh | sudo bash
```

## Manual Setup

```bash
cp .env.production.example .env.production   # configure
./timetiles pull                              # pull images
./timetiles up                                # start
./timetiles ssl                               # SSL via Let's Encrypt
```

## CLI

```bash
timetiles status     # service health
timetiles logs       # view logs
timetiles backup     # create backup
timetiles update     # pull + redeploy
timetiles check      # full verification
```

See `timetiles --help` for all commands.
