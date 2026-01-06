# API Endpoints

This document describes the HTTP API surface. Fill in each endpoint using the template below and keep it up to date as the API changes.

## Error Format

All error responses should use a consistent shape:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

## Endpoint Index

| Name | Method | Path | Auth | Description |
| --- | --- | --- | --- | --- |
| Health Check (Server) | GET | /health | No | Node server health check |
| Admin Metrics Summary | GET | /admin/metrics/summary | Admin token (if set) | Aggregated usage and retention metrics |
| Admin Users | GET | /admin/users | Admin token (if set) | User list with assignment and session stats |
| Health Check (Python) | GET | /health | No | Python sidecar health check (port 8000) |
| Infer Mood (Python) | POST | /infer | No | Classify mood and intensity (port 8000) |
