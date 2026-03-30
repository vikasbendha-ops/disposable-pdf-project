# Storage Migration

This document describes how file storage works and how storage migrations should be operated.

## 1. Supported Storage Providers

The platform currently supports:

- `supabase_db`
- `wasabi_s3`

### Provider Intent

- `supabase_db`
  - primary simple storage mode backed by `app_files`
- `wasabi_s3`
  - external object storage for production storage scaling

## 2. Data Model

Metadata is stored in application documents.  
Actual file payloads are stored based on the selected provider.

Key concepts:

- PDF records reference storage provider and storage key
- migration should preserve PDF identity and link continuity
- link access must not break during storage moves

## 3. Storage Migration Goal

A migration moves file payloads from one provider to another while preserving:

- PDF identity
- link continuity
- access permissions
- workspace ownership

## 4. Migration Mechanism

The platform includes:

- admin storage settings
- background jobs / queue
- storage migration job creation
- operations health visibility

Recommended model:

1. queue migration
2. process files in background
3. update metadata only after copy succeeds
4. verify access after migration

## 5. Typical Migration Use Cases

- moving from Supabase-backed storage to Wasabi
- moving back from Wasabi to Supabase
- standardizing storage provider across the platform

## 6. Pre-Migration Checklist

Before running a migration:

1. confirm destination credentials
2. confirm bucket/container exists
3. confirm destination provider is reachable
4. confirm current provider is healthy
5. understand current volume of PDFs
6. perform a small sample migration first if possible

## 7. Operator Procedure

Recommended sequence:

1. open admin storage settings
2. confirm current active provider
3. enter and save destination configuration
4. queue storage migration
5. monitor jobs and failures
6. verify a sample of PDFs and secure links
7. only then make the destination provider the default for future uploads if needed

## 8. Validation After Migration

After migration, test:

- PDF list loads
- secure link viewer loads
- direct access still works if enabled
- admin stats still reflect PDFs correctly
- no unexpected 404 or file fetch errors occur

## 9. Rollback Thinking

Rollback depends on migration design and what has already been switched.

At minimum, have a plan for:

- stopping new migration jobs
- identifying failed items
- restoring provider metadata if needed
- keeping current links valid while investigating

Do not treat “job completed” as the only success signal. Always validate real file access.

## 10. Failure Cases

### Destination Write Failure

Possible causes:

- invalid credentials
- wrong endpoint
- wrong bucket
- permission issues

### Source Read Failure

Possible causes:

- missing file payload
- storage key mismatch
- old metadata drift

### Access Break After Migration

Check:

- stored provider value
- storage key/path
- file-serving logic
- link and PDF metadata consistency

## 11. Wasabi Notes

For Wasabi, confirm:

- endpoint
- region
- bucket name
- access key ID
- secret access key
- force path style setting

## 12. Operational Best Practices

- migrate in manageable batches when possible
- monitor failed jobs instead of retrying blindly
- validate secure viewer after migration, not only direct file fetch
- keep audit and job history for review

## 13. Future Enhancements

The storage migration system would become stronger with:

1. dry-run preview
2. explicit retry failed items
3. progress by file and by batch
4. post-migration verification report
5. downloadable migration report

