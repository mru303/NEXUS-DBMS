# Testing and Verification

## Automated checks executed

The following commands were run in this environment:

```bash
cd /Users/mrudulajadhav/Desktop/nexus
npm test
npm run build
```

### Results
- Backend tests: passed (5/5)
- Frontend production build: passed

## Test cases covered
- API health check
- Dashboard stats endpoint returning service unavailable when PostgreSQL is missing
- Time-duration calculation
- Invoice summary calculations
- Payment validation preventing overpayment

## Database verification status
PostgreSQL is not installed in the current execution environment, so the migration and seed scripts could not be executed here. The project includes:
- [server/migrations/001_init.sql](../server/migrations/001_init.sql)
- [server/seeds/seed.js](../server/seeds/seed.js)
- [server/scripts/run-migrations.js](../server/scripts/run-migrations.js)
- [server/scripts/reset-db.js](../server/scripts/reset-db.js)

## Missing dependency note
To complete live database verification, install PostgreSQL locally and run:

```bash
npm run db:migrate
npm run db:seed
```

If PostgreSQL is still unavailable, the implementation and documentation remain complete, and the exact commands for running the app locally are documented in [docs/SETUP.md](SETUP.md).
