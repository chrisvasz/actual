---
category: Maintenance
authors: [chrisvasz]
---

Make the server's database helpers and sync write path synchronous; scripts using the API's `internal.db` helpers now get values instead of promises, and `firstSync` and `asyncTransaction` are removed
