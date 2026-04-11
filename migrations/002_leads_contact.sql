-- Migration 002: Add contact fields to leads table
-- Run this in Supabase SQL Editor

ALTER TABLE leads ADD COLUMN IF NOT EXISTS navn text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS telefon text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email text;
