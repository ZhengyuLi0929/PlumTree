import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let pool: mysql.Pool | undefined;
let instance: ReturnType<typeof drizzle<typeof fullSchema>>;
let tableReady: Promise<void> | null = null;

export function hasDatabase() {
  return Boolean(env.databaseUrl.trim());
}

export function getPool() {
  if (!hasDatabase()) {
    throw new Error("DATABASE_URL 为空");
  }
  if (!pool) {
    pool = mysql.createPool({
      uri: env.databaseUrl,
      connectTimeout: 10_000,
      waitForConnections: true,
      connectionLimit: 5,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30_000,
    });
  }
  return pool;
}

export function getDb() {
  if (!instance) {
    instance = drizzle({
      client: getPool(),
      schema: fullSchema,
      mode: "default",
    });
  }
  return instance;
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS responses (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id varchar(64) NOT NULL,
    type_code varchar(8) NOT NULL,
    answers text NOT NULL,
    rankings text NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS responses_v2 (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id varchar(64) NOT NULL,
    type_code varchar(8) NOT NULL,
    gender varchar(8) NOT NULL,
    answers text NOT NULL,
    rankings text NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS responses_v3 (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id varchar(64) NOT NULL,
    type_code varchar(8) NOT NULL,
    gender varchar(8) NOT NULL,
    answers text NOT NULL,
    rankings text NOT NULL,
    timings text NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id varchar(64) NOT NULL,
    name varchar(64) NOT NULL,
    wechat varchar(64) NOT NULL,
    phone varchar(20) NOT NULL DEFAULT '',
    gender varchar(8) NOT NULL,
    birth_year int NOT NULL,
    city varchar(64) NOT NULL,
    grad_class varchar(64) NOT NULL,
    mbti varchar(8),
    height int,
    job varchar(64),
    pref_min_height int,
    pref_birth_from int,
    pref_birth_to int,
    accept_distance varchar(8),
    intro text,
    expectation text,
    \`value\` text,
    consent_at timestamp NULL,
    chat_facts text,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS otp_codes (
    phone varchar(20) NOT NULL PRIMARY KEY,
    code_hash varchar(64) NOT NULL,
    expires_at bigint NOT NULL,
    sent_at bigint NOT NULL,
    hour_started bigint NOT NULL,
    hour_count int NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS match_pairs (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    week_key varchar(16) NOT NULL,
    left_session varchar(64) NOT NULL,
    right_session varchar(64) NOT NULL,
    note text,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS visits (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    day_key varchar(10) NOT NULL,
    source varchar(128) NOT NULL,
    referrer varchar(512) NOT NULL DEFAULT '',
    path varchar(255) NOT NULL DEFAULT '/',
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_visits_day (day_key)
  )`,
  `CREATE TABLE IF NOT EXISTS kf_messages (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    external_userid varchar(64) NOT NULL,
    msgid varchar(64),
    origin varchar(8) NOT NULL,
    content text,
    raw text,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_kf_user (external_userid)
  )`,
  `CREATE TABLE IF NOT EXISTS bot_users (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    external_userid varchar(64) NOT NULL,
    profile_id bigint,
    name varchar(64),
    state varchar(16) NOT NULL DEFAULT 'idle',
    requirements text,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_external_userid (external_userid)
  )`,
  `CREATE TABLE IF NOT EXISTS weekly_cycles (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    week_key varchar(16) NOT NULL,
    state varchar(16) NOT NULL DEFAULT 'idle',
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_week_key (week_key)
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    week_key varchar(16) NOT NULL,
    man_profile_id bigint NOT NULL,
    woman_profile_id bigint NOT NULL,
    reason text,
    state varchar(16) NOT NULL DEFAULT 'pending_send',
    man_reply varchar(8),
    woman_reply varchar(8),
    man_note_days text,
    woman_note_days text,
    friday_sms_sent int NOT NULL DEFAULT 0,
    met int,
    score int,
    willing varchar(8),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_matches_week (week_key)
  )`,
  `CREATE TABLE IF NOT EXISTS match_pool (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    profile_id bigint NOT NULL,
    org_tag varchar(64) NOT NULL DEFAULT 'default',
    gender varchar(8) NOT NULL,
    state varchar(16) NOT NULL DEFAULT 'in',
    priority int NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_pool_profile (profile_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cron_logs (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    action varchar(64) NOT NULL,
    detail text,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS merchants (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name varchar(64) NOT NULL,
    address varchar(255),
    rebate_cents int NOT NULL DEFAULT 0,
    status varchar(16) NOT NULL DEFAULT 'active',
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS redemptions (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    match_id bigint NOT NULL,
    merchant_id bigint NOT NULL,
    confirmed_at timestamp NULL,
    settle_status varchar(16) NOT NULL DEFAULT 'pending',
    note varchar(255),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    actor varchar(64) NOT NULL,
    action varchar(64) NOT NULL,
    target varchar(128),
    detail text,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    match_id bigint,
    amount_cents int NOT NULL DEFAULT 0,
    currency varchar(8) NOT NULL DEFAULT 'CNY',
    status varchar(16) NOT NULL DEFAULT 'pending',
    reason varchar(128),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS photos (
    id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    profile_id bigint NOT NULL,
    file varchar(128) NOT NULL,
    mime varchar(32) NOT NULL,
    size int NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_photos_profile (profile_id)
  )`,
];

export async function ensureTable() {
  tableReady ??= (async () => {
    const p = getPool();
    for (const sql of DDL) {
      // 用 query 而不是预编译 execute：MySQL 不允许 CREATE TABLE 走 prepared statement
      await p.query(sql);
    }
    const alters = [
      `ALTER TABLE profiles ADD COLUMN phone varchar(20) NOT NULL DEFAULT ''`,
      `ALTER TABLE profiles ADD COLUMN job varchar(64)`,
      `ALTER TABLE profiles ADD COLUMN pref_min_height int`,
      `ALTER TABLE profiles ADD COLUMN pref_birth_from int`,
      `ALTER TABLE profiles ADD COLUMN pref_birth_to int`,
      `ALTER TABLE profiles ADD COLUMN accept_distance varchar(8)`,
      `ALTER TABLE profiles ADD COLUMN consent_at timestamp NULL`,
      `ALTER TABLE profiles ADD COLUMN chat_facts text`,
      `ALTER TABLE matches ADD COLUMN man_reply varchar(8)`,
      `ALTER TABLE matches ADD COLUMN woman_reply varchar(8)`,
      `ALTER TABLE matches ADD COLUMN man_note_days text`,
      `ALTER TABLE matches ADD COLUMN woman_note_days text`,
      `ALTER TABLE matches ADD COLUMN friday_sms_sent int NOT NULL DEFAULT 0`,
    ];
    for (const sql of alters) {
      try {
        await p.query(sql);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/Duplicate column|1060/i.test(msg)) throw err;
      }
    }
  })();
  tableReady.catch(() => {
    tableReady = null;
  });
  return tableReady;
}
