# DBMS Concepts

## Keys
- Primary keys uniquely identify rows in a table.
- Foreign keys maintain relationships among tables.
- Candidate keys and alternate keys are conceptually important in normalized database design.

## Referential integrity
Referential integrity ensures that relationships between tables remain valid. If a project belongs to a client, the client must exist in `clients` before the project can be inserted.

## Constraints
The schema uses:
- NOT NULL
- UNIQUE
- CHECK
- PRIMARY KEY
- FOREIGN KEY

These constraints reduce invalid or inconsistent data.

## Indexing
Indices accelerate lookups on columns like `email`, `client_id`, `project_id`, and `invoice_number`, especially in reporting and filtered queries.

## ACID properties
- Atomicity: a transaction either fully succeeds or fully rolls back.
- Consistency: the database remains valid after each transaction.
- Isolation: concurrent transactions do not interfere with each other.
- Durability: committed data is preserved.

## Transactions
Transactions are used when several related statements must be applied together. For example, when recording a payment, the application validates the invoice balance and writes the payment atomically.

## Concurrency
PostgreSQL uses MVCC and row-level locking to protect concurrent reads and writes. The schema keeps write operations simple and consistent, and transaction boundaries preserve correctness.
