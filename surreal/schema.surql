-- Production-safe schema migration (non-destructive)
BEGIN TRANSACTION;

-- Better Auth tables
DEFINE TABLE IF NOT EXISTS user SCHEMALESS;
DEFINE TABLE IF NOT EXISTS session SCHEMALESS;
DEFINE TABLE IF NOT EXISTS account SCHEMALESS;
DEFINE TABLE IF NOT EXISTS verification SCHEMALESS;
DEFINE TABLE IF NOT EXISTS rateLimit SCHEMALESS;

DEFINE INDEX IF NOT EXISTS user_email_idx ON user COLUMNS email UNIQUE;
DEFINE INDEX IF NOT EXISTS session_token_idx ON session COLUMNS token UNIQUE;
DEFINE INDEX IF NOT EXISTS account_provider_idx ON account COLUMNS providerId, accountId UNIQUE;
DEFINE INDEX IF NOT EXISTS rate_limit_key_idx ON rateLimit COLUMNS key UNIQUE;

-- Core product nodes
DEFINE TABLE IF NOT EXISTS process SCHEMALESS;
DEFINE TABLE IF NOT EXISTS task SCHEMALESS;
DEFINE TABLE IF NOT EXISTS tip SCHEMALESS;
DEFINE TABLE IF NOT EXISTS feedback SCHEMALESS;

-- Graph relations
DEFINE TABLE IF NOT EXISTS requires TYPE RELATION IN process | task OUT task SCHEMALESS;
DEFINE TABLE IF NOT EXISTS posted TYPE RELATION IN user OUT tip SCHEMALESS;
DEFINE TABLE IF NOT EXISTS voted TYPE RELATION IN user OUT tip SCHEMALESS;
DEFINE TABLE IF NOT EXISTS started TYPE RELATION IN user OUT process SCHEMALESS;

DEFINE INDEX IF NOT EXISTS voted_user_tip_idx ON voted COLUMNS in, out UNIQUE;
DEFINE INDEX IF NOT EXISTS voted_tip_direction_idx ON voted COLUMNS out, direction;
DEFINE INDEX IF NOT EXISTS started_user_process_idx ON started COLUMNS in, out UNIQUE;
DEFINE INDEX IF NOT EXISTS posted_task_idx ON posted COLUMNS task_id;
DEFINE INDEX IF NOT EXISTS requires_in_sort_order_idx ON requires COLUMNS in, sort_order;

-- Process fields
DEFINE FIELD IF NOT EXISTS title ON process TYPE string;
DEFINE FIELD IF NOT EXISTS summary ON process TYPE string;
DEFINE FIELD IF NOT EXISTS explanation ON process TYPE option<string>;
DEFINE FIELD IF NOT EXISTS output ON process TYPE option<string>;
DEFINE FIELD IF NOT EXISTS category ON process TYPE option<string>;
DEFINE FIELD IF NOT EXISTS location ON process TYPE option<string>;
DEFINE FIELD IF NOT EXISTS links ON process TYPE option<array<object>>;
DEFINE FIELD IF NOT EXISTS attendance_modes ON process TYPE option<array<string>>;

-- Task fields
DEFINE FIELD IF NOT EXISTS title ON task TYPE string;
DEFINE FIELD IF NOT EXISTS description ON task TYPE string;
DEFINE FIELD IF NOT EXISTS output ON task TYPE option<string>;
DEFINE FIELD IF NOT EXISTS location ON task TYPE option<string>;
DEFINE FIELD IF NOT EXISTS links ON task TYPE option<array<object>>;
DEFINE FIELD IF NOT EXISTS required_documents ON task TYPE option<array<object>>;
DEFINE FIELD IF NOT EXISTS required_documents_mode ON task TYPE option<string>;

-- Tip fields
DEFINE FIELD IF NOT EXISTS content ON tip TYPE string;
DEFINE FIELD IF NOT EXISTS upvotes ON tip TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS downvotes ON tip TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS created_at ON tip TYPE datetime DEFAULT time::now();

-- Feedback fields
DEFINE FIELD IF NOT EXISTS message ON feedback TYPE string;
DEFINE FIELD IF NOT EXISTS user_id ON feedback TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS created_at ON feedback TYPE datetime DEFAULT time::now();

-- Relation fields
DEFINE FIELD IF NOT EXISTS task_id ON posted TYPE option<record<task>>;
DEFINE FIELD IF NOT EXISTS created_at ON posted TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS direction ON voted TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON voted TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON voted TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS created_at ON started TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS active ON started TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS manual_task_state ON started TYPE object;
DEFINE FIELD IF NOT EXISTS progress_percent ON started TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS resolved_count ON started TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS completed_count ON started TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_count ON started TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS completion_points ON started TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS completed ON started TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS completed_at ON started TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS updated_at ON started TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS sort_order ON requires TYPE option<int>;

-- Better Auth rate limit fields
DEFINE FIELD IF NOT EXISTS key ON rateLimit TYPE string;
DEFINE FIELD IF NOT EXISTS count ON rateLimit TYPE number;
DEFINE FIELD IF NOT EXISTS lastRequest ON rateLimit TYPE number;

COMMIT TRANSACTION;
