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
