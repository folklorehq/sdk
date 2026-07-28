# Local Postgres + Redis for connector development

Minimal dependencies for running connector tests and local SDK work against Postgres (with Apache
AGE) and Redis. This is not a full Folklore deployment.

```bash
docker compose -f deploy/docker/docker-compose.yml up -d
```

Ports:

| Service  | Port |
| -------- | ---- |
| Postgres | 5432 |
| Redis    | 6379 |

Stop:

```bash
docker compose -f deploy/docker/docker-compose.yml down
```
