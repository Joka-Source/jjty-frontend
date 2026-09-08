# Name documents without changing their source

Open a document and choose **Rename**. Enter its library name and save. Names
must contain 1–200 characters after surrounding whitespace is removed. Cancel
leaves the current name intact. Saving finishes before the dialog becomes
editable again; switching documents cannot apply the response to a different one.

The change updates only the library title and its independent `titleRevision`.
Source bytes, provenance (including an original filename when recorded), content
revision, form answers, local records and reading positions remain unchanged.
The header, searchable library and reload read the saved name. Rename does not
reopen the reader or create a new action/reading-position record by itself.

## Concurrent work

`renameDocument` reads and patches the latest document in one IndexedDB
transaction. Ordinary whole-document writes preserve an existing renamed title
and its revision; a delayed form or server save cannot revert it. Generic writes
cannot mint a new title revision. A queued open refreshes newer naming metadata
without replacing the operation's content snapshot. Backups preserve naming
revisions so the same protection holds after local restoration.

Spoken math notebooks use stable source kind rather than a mutable display name
for identification. Appending an expression preserves a renamed notebook's title
and naming revision while legitimately advancing its content revision.

Tests cover transaction ordering and rollback, source/saved-work preservation,
backup roundtrips, actual UI rename/search/reload/download, stale opens, and
switching documents while a save is pending. This is a local naming feature,
not a rename operation on an external server or the original source file.
