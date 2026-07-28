CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS local_orgs (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS local_users (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES local_orgs(id),
  display_name text NOT NULL
);

CREATE TABLE IF NOT EXISTS local_containers (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES local_orgs(id),
  source_container_id text NOT NULL,
  label text NOT NULL,
  UNIQUE (org_id, source_container_id)
);

CREATE TABLE IF NOT EXISTS local_facts (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES local_orgs(id),
  source_fact_id text NOT NULL,
  kind text NOT NULL,
  occurred_at timestamptz NOT NULL,
  body text NOT NULL,
  sensitivity_level text NOT NULL DEFAULT 'team_scoped',
  source_id text NOT NULL DEFAULT 'local',
  UNIQUE (org_id, source_fact_id)
);

CREATE TABLE IF NOT EXISTS local_fact_containers (
  fact_id uuid NOT NULL REFERENCES local_facts(id) ON DELETE CASCADE,
  container_id uuid NOT NULL REFERENCES local_containers(id) ON DELETE CASCADE,
  PRIMARY KEY (fact_id, container_id)
);

CREATE TABLE IF NOT EXISTS local_themes (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES local_orgs(id),
  name text NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS local_theme_facts (
  theme_id uuid NOT NULL REFERENCES local_themes(id) ON DELETE CASCADE,
  fact_id uuid NOT NULL REFERENCES local_facts(id) ON DELETE CASCADE,
  PRIMARY KEY (theme_id, fact_id)
);

CREATE TABLE IF NOT EXISTS local_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
