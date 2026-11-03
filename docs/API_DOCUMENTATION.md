# API Documentation

Base URL: `http://localhost:3001/api`

## Health
- GET /health
- Response: `{ ok: true, status: 'healthy', service: 'nexus-api' }`

## Dashboard
- GET /dashboard/stats
- Returns summary values for dashboard cards.

## Clients
- GET /clients
- POST /clients
- GET /clients/:id
- PATCH /clients/:id
- DELETE /clients/:id

Example body for POST:
```json
{
  "companyName": "Nova Retail",
  "contactPerson": "Aditi Shah",
  "email": "aditi@novaretail.in",
  "phone": "9988776655",
  "street": "9 Market Street",
  "city": "Delhi",
  "state": "Delhi",
  "pincode": "110001",
  "country": "India",
  "gstin": "07ABCDE1234F1Z6",
  "status": "Active",
  "accountManagerId": "USR-001"
}
```

## Projects
- GET /projects
- POST /projects
- GET /projects/:id
- PATCH /projects/:id
- DELETE /projects/:id

## Tasks
- GET /tasks
- POST /tasks
- GET /tasks/:id
- PATCH /tasks/:id
- DELETE /tasks/:id

## Work sessions
- GET /work-sessions
- POST /work-sessions
- GET /work-sessions/:id
- DELETE /work-sessions/:id

## Invoices
- GET /invoices
- POST /invoices
- GET /invoices/:id

## Payments
- GET /payments
- POST /payments

## Reports
- GET /reports/overview

## Settings
- GET /settings/db-overview

## Status codes
- 200 OK: successful fetch/update
- 201 Created: resource created
- 400 Bad Request: validation errors
- 404 Not Found: missing record
- 503 Service Unavailable: PostgreSQL not configured
- 500 Internal Server Error: unexpected backend issue
