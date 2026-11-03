# Setup and Run Instructions (macOS)

## 1. Install Node.js
Use Node.js 18+.

```bash
node -v
npm -v
```

## 2. Install project dependencies
```bash
cd /Users/mrudulajadhav/Desktop/nexus
npm install
```

## 3. Install PostgreSQL locally
If PostgreSQL is not installed on your Mac, install it using Homebrew:

```bash
brew update
brew install postgresql
brew services start postgresql
```

Then create a database:

```bash
createdb nexus
psql -d nexus -c "SELECT version();"
```

Or connect as postgres to create the database:

```bash
createuser postgres --superuser
createdb nexus
```

## 4. Configure environment
Copy the example env file and set real values:

```bash
cp .env.example .env
```

Then update the values in `.env`:

```env
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=nexus
PORT=3001
JWT_SECRET=change-me-in-production
CLIENT_URL=http://localhost:5173
```

## 5. Run database migration
```bash
npm run db:migrate
```

## 6. Seed sample data
```bash
npm run db:seed
```

## 7. Start the app
Frontend:
```bash
npm run dev
```

Backend:
```bash
npm run server
```

Full-stack:
```bash
npm run dev:full
```

## 8. URLs
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## 9. Reset database for local testing
```bash
npm run db:reset
npm run db:migrate
npm run db:seed
```
