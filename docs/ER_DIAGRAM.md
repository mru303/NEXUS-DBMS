# ER Diagram

```mermaid
 erDiagram
    USERS ||--o{ CLIENTS : manages
    USERS ||--o{ PROJECTS : manages
    CLIENTS ||--o{ PROJECTS : owns
    PROJECTS ||--o{ TASKS : contains
    USERS ||--o{ TASKS : assigns
    TASKS ||--o{ WORK_SESSIONS : records
    USERS ||--o{ WORK_SESSIONS : logs
    CLIENTS ||--o{ INVOICES : receives
    PROJECTS ||--o{ INVOICES : bills_for
    INVOICES ||--o{ INVOICE_ITEMS : includes
    INVOICES ||--o{ PAYMENTS : paid_through

    USERS {
      varchar user_id PK
      varchar full_name
      varchar email UK
      varchar phone_number
      varchar account_type
      varchar department
      varchar status
      date joined_at
      varchar client_id FK
    }

    CLIENTS {
      varchar client_id PK
      varchar company_name UK
      varchar client_name
      varchar email
      varchar phone_number
      varchar street
      varchar city
      varchar state
      char pincode
      varchar country
      char gstin
      varchar status
      date created_at
      varchar account_manager_id FK
    }

    PROJECTS {
      varchar project_id PK
      varchar project_name
      text description
      date start_date
      date deadline
      varchar status
      varchar priority
      numeric budget
      numeric billing_rate
      date created_at
      varchar user_id FK
      varchar client_id FK
    }

    TASKS {
      varchar task_id PK
      varchar project_id FK
      varchar title
      text description
      varchar assignee_id FK
      varchar priority
      varchar status
      date start_date
      date due_date
      numeric estimated_hours
    }

    WORK_SESSIONS {
      varchar session_id PK
      varchar task_id FK
      varchar user_id FK
      timestamptz start_time
      timestamptz end_time
      numeric duration
      numeric hourly_rate
      boolean billable_status
      text notes
    }

    INVOICES {
      varchar invoice_id PK
      varchar invoice_number UK
      date invoice_date
      date due_date
      numeric discount_pct
      numeric tax_rate
      varchar invoice_status
      text notes
      varchar client_id FK
      varchar project_id FK
    }

    INVOICE_ITEMS {
      varchar item_id PK
      varchar invoice_id FK
      varchar description
      numeric quantity
      numeric unit_price
    }

    PAYMENTS {
      varchar payment_id PK
      varchar invoice_id FK
      date payment_date
      numeric amount
      varchar payment_method
      varchar transaction_id
      varchar payment_status
      text notes
    }
```

## Cardinality summary

- One client can own many projects.
- One project can have many tasks and invoices.
- One task can have many work sessions.
- One invoice can have many invoice items and many payments.
- Many-to-many project participation is represented through project_members.
