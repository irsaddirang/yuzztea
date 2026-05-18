-- =============================================================================
-- Migration: 0001_init.sql
-- Description: Initial schema for organization, outlet, user_profile, and
--              outlet_assignment tables with indexes, constraints, and triggers.
-- Requirements: 2.1, 3.2, 3.6, 3.7, 4.1
-- =============================================================================

-- Enable uuid generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Enum Types
-- =============================================================================

CREATE TYPE user_role AS ENUM ('owner', 'outlet_manager', 'cashier');

-- =============================================================================
-- Trigger function: auto-update updated_at column
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Table: organization
-- =============================================================================

CREATE TABLE organization (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  created_at timestamptz NOT NULL    DEFAULT now()
);

-- =============================================================================
-- Table: outlet
-- Constraints:
--   - name: 1-100 characters (Req 3.2)
--   - code: 3-20 alphanumeric characters, unique within org (Req 3.2, 3.7)
--   - address: 1-255 characters (Req 3.2)
--   - city: 1-50 characters (Req 3.2)
--   - close_time must be greater than open_time (Req 3.2)
--   - UNIQUE (organization_id, code) gives separate duplicate error (Req 3.7)
-- =============================================================================

CREATE TABLE outlet (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  code            text        NOT NULL CHECK (char_length(code) BETWEEN 3 AND 20),
  address         text        NOT NULL CHECK (char_length(address) BETWEEN 1 AND 255),
  city            text        NOT NULL CHECK (char_length(city) BETWEEN 1 AND 50),
  open_time       time        NOT NULL,
  close_time      time        NOT NULL,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Req 3.2: code must be alphanumeric only
  CONSTRAINT chk_outlet_code_alphanumeric CHECK (code ~ '^[A-Za-z0-9]+$'),

  -- Req 3.2: close_time must be greater than open_time
  CONSTRAINT chk_outlet_hours CHECK (close_time > open_time),

  -- Req 3.7: outlet code must be unique within the same organization
  -- This gives a separate duplicate-code error distinct from field validation errors
  CONSTRAINT uq_outlet_org_code UNIQUE (organization_id, code)
);

-- Trigger: auto-update updated_at on outlet
CREATE TRIGGER trg_outlet_updated_at
  BEFORE UPDATE ON outlet
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Index for querying outlets by organization
CREATE INDEX idx_outlet_organization_id ON outlet(organization_id);

-- =============================================================================
-- Table: user_profile
-- References auth.users for Supabase Auth integration (Req 4.1)
-- Constraints:
--   - username: 3-64 characters, unique within organization (Req 4.1)
--   - email: 5-254 characters, unique within organization (Req 4.1)
--   - role: enum user_role (Req 2.1)
-- =============================================================================

CREATE TABLE user_profile (
  user_id         uuid      PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid      NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  username        text      NOT NULL CHECK (char_length(username) BETWEEN 3 AND 64),
  email           text      NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254),
  role            user_role NOT NULL,
  active          boolean   NOT NULL DEFAULT true,
  display_name    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Username and email unique within organization (Req 4.1)
  CONSTRAINT uq_user_profile_username UNIQUE (username),
  CONSTRAINT uq_user_profile_email UNIQUE (email)
);

-- Trigger: auto-update updated_at on user_profile
CREATE TRIGGER trg_user_profile_updated_at
  BEFORE UPDATE ON user_profile
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Index for querying user profiles by organization
CREATE INDEX idx_user_profile_organization_id ON user_profile(organization_id);

-- =============================================================================
-- Table: outlet_assignment
-- Maps users to outlets they can access (Req 2.1, 4.1)
-- =============================================================================

CREATE TABLE outlet_assignment (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES user_profile(user_id) ON DELETE CASCADE,
  outlet_id  uuid        NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  active     boolean     NOT NULL DEFAULT true,
  created_by uuid        REFERENCES user_profile(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate assignment of same user to same outlet
  CONSTRAINT uq_outlet_assignment_user_outlet UNIQUE (user_id, outlet_id)
);

-- Indexes on outlet_assignment for efficient lookups
CREATE INDEX idx_outlet_assignment_user_id ON outlet_assignment(user_id);
CREATE INDEX idx_outlet_assignment_outlet_id ON outlet_assignment(outlet_id);
