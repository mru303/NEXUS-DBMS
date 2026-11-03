# Normalization

## 1NF
All table attributes are atomic. For example, a project has one row in `projects`, and each project member is stored separately in `project_members` rather than as a comma-separated list.

## 2NF
The schema addresses partial dependency by separating repeated or dependent data into distinct tables:
- `users` holds person data
- `clients` holds company data
- `projects` stores project facts
- `tasks` stores task facts
- `invoices` stores invoice facts
- `payments` stores payment facts

The attributes that depend on the whole key are kept in their own entity tables.

## 3NF
There are no transitive dependencies among non-key attributes. For example:
- `project_name` depends only on `project_id`
- `company_name` depends only on `client_id`
- `task_title` depends only on `task_id`
- `client_id` and `project_id` determine invoice rows, while line items are their own child table

## Functional dependencies

Examples:
- `user_id -> full_name, email, department, role`
- `client_id -> company_name, contact_person, gstin, account_manager_id`
- `project_id -> project_name, client_id, manager_id, status, budget`
- `invoice_id -> invoice_number, client_id, project_id, tax_rate, discount_pct`
- `(project_id, user_id) -> project_id, user_id` in `project_members`

## Decomposition

The database decomposes the initial conceptual model into normalized tables so that each fact is stored exactly once. This avoids duplication and keeps updates consistent.
