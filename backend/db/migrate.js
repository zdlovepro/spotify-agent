import db from './index.js'

function getExistingColumns(tableName) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((column) => column.name)
}

function addColumnIfMissing(tableName, columnName, definition) {
  const existingColumns = getExistingColumns(tableName)

  if (!existingColumns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

const schemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      username TEXT UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT,
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      preferences_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS provider_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      provider_user_id TEXT,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      display_name TEXT,
      access_token TEXT,
      refresh_token TEXT,
      scopes_json TEXT NOT NULL DEFAULT '[]',
      token_expires_at TEXT,
      profile_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, provider_name),
      UNIQUE (source_type, source_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS oauth_pending_states (
      state TEXT PRIMARY KEY,
      provider_name TEXT NOT NULL,
      local_user_id TEXT NOT NULL,
      return_to TEXT NOT NULL DEFAULT '/',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (local_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS audio_assets (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      storage_type TEXT NOT NULL DEFAULT 'local',
      storage_path TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_extension TEXT,
      title TEXT,
      artist_name TEXT,
      album_name TEXT,
      duration_ms INTEGER,
      track_number INTEGER,
      disc_number INTEGER,
      file_size_bytes INTEGER,
      checksum_sha256 TEXT,
      is_playable INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (source_type, source_id),
      UNIQUE (storage_path)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS library_playlists (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_image_url TEXT,
      visibility TEXT NOT NULL DEFAULT 'private',
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      provider_link_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_link_id) REFERENCES provider_links(id) ON DELETE SET NULL,
      UNIQUE (source_type, source_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS library_playlist_items (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL,
      audio_asset_id TEXT,
      added_by_user_id TEXT,
      item_type TEXT NOT NULL DEFAULT 'track',
      position INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES library_playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (audio_asset_id) REFERENCES audio_assets(id) ON DELETE SET NULL,
      FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (playlist_id, position)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS library_favorites (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      audio_asset_id TEXT,
      favorite_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (audio_asset_id) REFERENCES audio_assets(id) ON DELETE SET NULL,
      UNIQUE (owner_user_id, favorite_type, source_type, source_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New conversation',
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      mode TEXT NOT NULL DEFAULT 'agent',
      context_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (source_type, source_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      intent TEXT,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      actions_json TEXT NOT NULL DEFAULT '[]',
      artifacts_json TEXT NOT NULL DEFAULT '[]',
      tool_calls_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      UNIQUE (source_type, source_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS recommendation_runs (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      conversation_id TEXT,
      title TEXT,
      prompt TEXT,
      description TEXT,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      seed_summary_json TEXT NOT NULL DEFAULT '{}',
      constraints_json TEXT NOT NULL DEFAULT '{}',
      result_summary_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
      UNIQUE (source_type, source_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS recommendation_items (
      id TEXT PRIMARY KEY,
      recommendation_run_id TEXT NOT NULL,
      audio_asset_id TEXT,
      position INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT,
      artist_name TEXT,
      album_name TEXT,
      preview_url TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recommendation_run_id) REFERENCES recommendation_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (audio_asset_id) REFERENCES audio_assets(id) ON DELETE SET NULL,
      UNIQUE (recommendation_run_id, position)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS feedback_events (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      conversation_id TEXT,
      message_id TEXT,
      recommendation_run_id TEXT,
      event_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      note TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL,
      FOREIGN KEY (recommendation_run_id) REFERENCES recommendation_runs(id) ON DELETE SET NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS listening_events (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT,
      session_id TEXT,
      provider_link_id TEXT,
      audio_asset_id TEXT,
      event_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      play_mode TEXT,
      position_ms INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      context_type TEXT,
      context_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (provider_link_id) REFERENCES provider_links(id) ON DELETE SET NULL,
      FOREIGN KEY (audio_asset_id) REFERENCES audio_assets(id) ON DELETE SET NULL
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions(user_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_provider_links_user_id
    ON provider_links(user_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_oauth_pending_states_provider_name
    ON oauth_pending_states(provider_name)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_library_playlists_owner_user_id
    ON library_playlists(owner_user_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_library_playlist_items_playlist_id
    ON library_playlist_items(playlist_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_library_favorites_owner_user_id
    ON library_favorites(owner_user_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_audio_assets_owner_user_id
    ON audio_assets(owner_user_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_conversations_owner_user_id
    ON conversations(owner_user_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON messages(conversation_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_recommendation_runs_owner_user_id
    ON recommendation_runs(owner_user_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_recommendation_items_run_id
    ON recommendation_items(recommendation_run_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_feedback_events_owner_user_id
    ON feedback_events(owner_user_id)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_listening_events_owner_user_id
    ON listening_events(owner_user_id)
  `,
]

const runMigrationTransaction = db.transaction(() => {
  for (const statement of schemaStatements) {
    db.exec(statement)
  }

  addColumnIfMissing('library_playlist_items', 'title', 'TEXT')
  addColumnIfMissing('library_playlist_items', 'artists_json', "TEXT NOT NULL DEFAULT '[]'")
  addColumnIfMissing('library_playlist_items', 'album_json', "TEXT NOT NULL DEFAULT '{}'")
  addColumnIfMissing('library_playlist_items', 'image_url', 'TEXT')
  addColumnIfMissing('library_playlist_items', 'preview_url', 'TEXT')
  addColumnIfMissing('library_playlist_items', 'duration_ms', 'INTEGER')

  addColumnIfMissing('library_favorites', 'title', 'TEXT')
  addColumnIfMissing('library_favorites', 'artists_json', "TEXT NOT NULL DEFAULT '[]'")
  addColumnIfMissing('library_favorites', 'album_json', "TEXT NOT NULL DEFAULT '{}'")
  addColumnIfMissing('library_favorites', 'image_url', 'TEXT')
  addColumnIfMissing('library_favorites', 'preview_url', 'TEXT')
  addColumnIfMissing('library_favorites', 'duration_ms', 'INTEGER')

  addColumnIfMissing('audio_assets', 'user_id', 'TEXT')
  addColumnIfMissing('audio_assets', 'artists_json', "TEXT NOT NULL DEFAULT '[]'")
  addColumnIfMissing('audio_assets', 'size_bytes', 'INTEGER')
  addColumnIfMissing('listening_events', 'play_mode', 'TEXT')

  db.pragma('user_version = 1')
})

export function migrateDatabase() {
  runMigrationTransaction()
  return db
}

export default migrateDatabase
