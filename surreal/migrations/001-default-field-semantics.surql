-- Ensure mutable fields use DEFAULT semantics (not VALUE).
-- VALUE re-computes on every write and can pin mutable counters/flags.
BEGIN TRANSACTION;

DEFINE FIELD created_at ON tip TYPE datetime DEFAULT time::now();
DEFINE FIELD created_at ON feedback TYPE datetime DEFAULT time::now();
DEFINE FIELD created_at ON posted TYPE datetime DEFAULT time::now();
DEFINE FIELD created_at ON voted TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON voted TYPE datetime DEFAULT time::now();

DEFINE FIELD created_at ON started TYPE datetime DEFAULT time::now();
DEFINE FIELD active ON started TYPE bool DEFAULT true;
DEFINE FIELD manual_task_state ON started TYPE object;
DEFINE FIELD progress_percent ON started TYPE number DEFAULT 0;
DEFINE FIELD resolved_count ON started TYPE number DEFAULT 0;
DEFINE FIELD completed_count ON started TYPE number DEFAULT 0;
DEFINE FIELD total_count ON started TYPE number DEFAULT 0;
DEFINE FIELD completion_points ON started TYPE number DEFAULT 0;
DEFINE FIELD completed ON started TYPE bool DEFAULT false;
DEFINE FIELD completed_at ON started TYPE option<datetime>;
DEFINE FIELD updated_at ON started TYPE datetime DEFAULT time::now();

COMMIT TRANSACTION;
