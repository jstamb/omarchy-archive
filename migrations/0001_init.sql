-- omarchyarchive.com read model. Derived from data/*.json; git stays canonical.
-- Every secondary index costs +1 row written per changed row, so there are few.
-- `doc` is the full record JSON exactly as rendered; `hash` is sha256 of the
-- canonical record (volatile catalog fields excluded, see bot/lib/d1-model.mjs);
-- `thash` is the hash of the searchable text so FTS is only rewritten when it
-- changes; `ord` is the record's position in its file (byNewest tie-break).

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author TEXT,
  kind TEXT,
  source_platform TEXT,
  created_at TEXT,
  added_at TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL,
  hash TEXT NOT NULL,
  thash TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX posts_author_added ON posts(author, added_at);
CREATE INDEX posts_added ON posts(added_at, ord);

CREATE TABLE plugins (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  author TEXT,
  category TEXT,
  added_at TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL,
  hash TEXT NOT NULL,
  thash TEXT NOT NULL
) WITHOUT ROWID;
CREATE UNIQUE INDEX plugins_slug ON plugins(slug);
CREATE INDEX plugins_author ON plugins(author);
CREATE INDEX plugins_category ON plugins(category);

CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  author TEXT,
  added_at TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL,
  hash TEXT NOT NULL,
  thash TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE timeline (
  id TEXT PRIMARY KEY,
  date TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL,
  hash TEXT NOT NULL,
  thash TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL,
  hash TEXT NOT NULL,
  thash TEXT NOT NULL
) WITHOUT ROWID;

-- Reverse lookups: theme/plugin page -> posts that name it. PK only.
CREATE TABLE post_refs (
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  PRIMARY KEY (target_kind, target_id, post_id)
) WITHOUT ROWID;

-- Full-text search. `type` is the UI facet (setup/guide/post/theme/plugin/release).
CREATE VIRTUAL TABLE search USING fts5(
  kind UNINDEXED, ref_id UNINDEXED, type UNINDEXED, url UNINDEXED,
  title, body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- k: commit (last fully synced sha), seed (JSON cursor), ledger (JSON day+used),
--    cost_model (JSON measured rows/op), r2_commit.
CREATE TABLE sync_state (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID;
