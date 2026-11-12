-- D1 migration tracking guards this one-time upgrade. Preserve all legacy IDs/times.
ALTER TABLE users ADD COLUMN selected_season_id TEXT;
ALTER TABLE users ADD COLUMN selection_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN profile_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE seasons (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
 education_json TEXT NOT NULL DEFAULT '{}', details_json TEXT NOT NULL DEFAULT '{}',
 version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX idx_seasons_owner ON seasons(user_id);
INSERT INTO seasons(id,user_id,name,education_json,created_at)
 SELECT 'legacy-' || id,id,'ฤดูฝึกงานเดิม',json_object('university',json_extract(profile_json,'$.university'),'faculty',json_extract(profile_json,'$.faculty'),'major',json_extract(profile_json,'$.major'),'study_year',json_extract(profile_json,'$.study_year')),created_at FROM users;
UPDATE users SET selected_season_id='legacy-' || id;
ALTER TABLE applications ADD COLUMN season_id TEXT;
ALTER TABLE tasks ADD COLUMN season_id TEXT;
ALTER TABLE documents ADD COLUMN season_id TEXT;
ALTER TABLE reminders ADD COLUMN season_id TEXT;
ALTER TABLE messages ADD COLUMN season_id TEXT;
ALTER TABLE extractions ADD COLUMN season_id TEXT;
ALTER TABLE audit_log ADD COLUMN season_id TEXT;
UPDATE applications SET season_id='legacy-' || user_id;
UPDATE tasks SET season_id='legacy-' || user_id;
UPDATE documents SET season_id='legacy-' || user_id;
UPDATE reminders SET season_id='legacy-' || user_id;
UPDATE messages SET season_id='legacy-' || user_id;
UPDATE extractions SET season_id='legacy-' || user_id;
UPDATE audit_log SET season_id='legacy-' || user_id;
CREATE INDEX idx_applications_season ON applications(user_id,season_id);
CREATE INDEX idx_tasks_season ON tasks(user_id,season_id);
CREATE INDEX idx_documents_season ON documents(user_id,season_id);
CREATE INDEX idx_messages_season ON messages(user_id,season_id,created_at);
CREATE INDEX idx_extractions_season ON extractions(user_id,season_id,status);
CREATE TABLE milestones (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,season_id TEXT NOT NULL,title TEXT NOT NULL,
 date TEXT,end_date TEXT,source TEXT,truth_level TEXT NOT NULL DEFAULT 'USER_REPORTED',
 version INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL
);
CREATE INDEX idx_milestones_season ON milestones(user_id,season_id);
ALTER TABLE reminders ADD COLUMN milestone_id TEXT;
ALTER TABLE reminders ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE pending_actions (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,season_id TEXT NOT NULL,kind TEXT NOT NULL,
 payload_json TEXT NOT NULL,expected_version INTEGER,status TEXT NOT NULL DEFAULT 'pending',
 claim_token TEXT,result_json TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL
);
CREATE INDEX idx_pending_owner ON pending_actions(user_id,season_id,status);
