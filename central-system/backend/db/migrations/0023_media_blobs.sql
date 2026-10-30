-- Up Migration

-- Durable mirror of case media (services/mediaStore.js). Hosts with an
-- ephemeral disk lose every file under MEDIA_ROOT on restart; the case rows
-- survive, so the media must too. Bytes are stored exactly as on disk --
-- already AES-256-GCM encrypted when MEDIA_ENCRYPTION_KEY is set.
CREATE TABLE IF NOT EXISTS media_blobs (
  media_key  TEXT PRIMARY KEY,          -- MEDIA_ROOT-relative path, e.g. cases/<uuid>/original.jpg
  data       BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS media_blobs;
