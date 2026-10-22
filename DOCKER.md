# Run Pocket Finance in Docker

The image builds the app and runs its compiled Cloudflare Worker locally using
Wrangler. No Cloudflare account is required. D1 database records and R2 receipt
files share one persistent volume. The server listens on port 8787 inside the
container; Compose exposes it at http://localhost:8787.

## Build and start

```sh
docker compose up --build -d
docker compose logs -f pocket-finance
```

Startup applies pending local database migrations before starting the server.
On a fresh installation, open http://localhost:8787 and create the first admin in the setup screen. Once setup completes, admins use Users to create users and other admins, change roles, reset passwords, disable access and delete accounts. Everyone can change their own password in Settings.

For offline provisioning, `docker compose exec pocket-finance npm run admin:create -- --username admin --name Admin` remains available before setup. It prints a generated password and refuses to bootstrap another administrator once one exists.

## Build and run without Compose

```sh
docker build -t pocket-finance:local .
docker volume create pocket-finance-data
docker run -d --name pocket-finance --init \
  -p 127.0.0.1:8787:8787 \
  -v pocket-finance-data:/app/.wrangler/state \
  pocket-finance:local
```

## Stop, update, and export

`docker compose down` stops the app and retains the data volume.
`docker compose up --build -d` rebuilds and recreates it with the same data.
Back up finances through Settings before applying upgrades. Using
`docker compose down -v` deletes the database and receipt volume.

To export the built image for another machine of the same architecture:

```sh
docker save pocket-finance:local -o pocket-finance-image.tar
# On the destination:
docker load -i pocket-finance-image.tar
```

The image contains no account credentials or local finance data. Transfer data
separately using the app's backup/restore controls.

## Source and validation

Source snapshot: KayVlad/pocket-finance commit
`f5639a510621e3df77a76f59f3c61f8af16521e0`.
Retrieved through the GitHub connector because shell network access was
unavailable; this directory does not contain the repository's Git history.

The Docker configuration has been statically checked. Image building and runtime
testing must be performed on a Docker-capable machine; the authoring sandbox
has no Docker or Node and blocks Podman user namespaces.
