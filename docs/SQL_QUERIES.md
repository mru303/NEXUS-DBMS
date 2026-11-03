# SQL Queries

## INSERT
```sql
INSERT INTO clients (
  client_id, company_name, client_name, email, phone_number, street, city, state, pincode, country, gstin, status, created_at, account_manager_id
) VALUES (
  'CLT-004', 'Nova Retail', 'Aditi Shah', 'aditi@novaretail.in', '9988776655', '9 Market Street', 'Delhi', 'Delhi', '110001', 'India', '07ABCDE1234F1Z6', 'Active', CURRENT_DATE, 'USR-001'
);
```

## SELECT
```sql
SELECT * FROM projects WHERE status = 'In Progress';
```

## UPDATE
```sql
UPDATE tasks
SET status = 'Completed', due_date = CURRENT_DATE
WHERE task_id = 'TSK-003';
```

## DELETE
```sql
DELETE FROM payments WHERE payment_id = 'PMT-001';
```

## JOIN
```sql
SELECT p.project_name, c.company_name
FROM projects p
JOIN clients c ON c.client_id = p.client_id;
```

## GROUP BY + HAVING
```sql
SELECT client_id, COUNT(*) AS project_count
FROM projects
GROUP BY client_id
HAVING COUNT(*) > 1;
```

## Aggregate functions
```sql
SELECT COALESCE(SUM(amount), 0) AS total_collected
FROM payments
WHERE payment_status = 'Completed';
```

## Subquery
```sql
SELECT *
FROM invoices
WHERE client_id IN (
  SELECT client_id FROM clients WHERE status = 'Active'
);
```

## View
```sql
SELECT * FROM invoice_summary;
```

## Transaction
```sql
BEGIN;
INSERT INTO payments (...) VALUES (...);
UPDATE invoices SET invoice_status = 'Sent' WHERE invoice_id = 'INV-001';
COMMIT;
```

## Example reporting query
```sql
SELECT p.project_name,
       COALESCE(SUM(ws.duration), 0) AS total_hours
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.project_id
LEFT JOIN work_sessions ws ON ws.task_id = t.task_id
GROUP BY p.project_id, p.project_name
ORDER BY total_hours DESC;
```
