# Backup and restore

JETT exports documents, records, reading positions, arrived moments, organization spaces, space feeds and user-facing settings as one JSON file. Settings now offers a staged restore: choosing a file validates it and shows its document, record and arrival counts without changing device data; a separate **restore this backup** action replaces the five application IndexedDB collections in one transaction, restores settings and organization data, then reloads from persistence.

The validator rejects malformed JSON, foreign formats, missing collections, duplicate document IDs, records without their documents, reading positions without their documents, invalid settings and organization records that fail the existing organization schemas. A database failure restores the previous local settings and organization blob rather than leaving those surfaces changed.

`test/backup.test.mjs` covers the file boundary. The desktop production-browser journey exports populated data, stages the resulting file, restores it, waits through reload and compares restored document, record and arrival IDs with the source export.

## Current boundary

The export does not contain pairing credentials, the outbound moment queue or the transport delivery log. The product copy names this limit. A queued send may carry device-bound transport identity, so cross-device restoration needs an explicit identity and replay policy before those stores can safely enter the backup. This slice proves saved application-data recovery on the same browser profile; it is not yet a complete device migration or physical-device restore.
