import { sqliteTable, text, real, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
export const honeycombCells = sqliteTable("honeycomb_cells", {
  cellId: text("cell_id").primaryKey(),
  gridVersion: text("grid_version").notNull(),
  q: integer("q").notNull(),
  r: integer("r").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  polygonJson: text("polygon_json").notNull(),
  constructedAt: text("constructed_at").notNull()
});
export const intersectionCatalogPages = sqliteTable("intersection_catalog_pages", {
  pageId: text("page_id").primaryKey(),
  catalogVersion: text("catalog_version").notNull(),
  centerLatitude: real("center_latitude").notNull(),
  centerLongitude: real("center_longitude").notNull(),
  radiusM: real("radius_m").notNull(),
  catalogJson: text("catalog_json").notNull(),
  acquiredAt: text("acquired_at").notNull()
});
export const avmCache = sqliteTable("avm_cache", {
  cacheKey: text("cache_key").primaryKey(),
  cellId: text("cell_id").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  subjectProfile: text("subject_profile").notNull(),
  provider: text("provider").notNull(),
  estimatePpsqft: real("estimate_ppsqft").notNull(),
  sourceKind: text("source_kind").notNull(),
  sourceArtifact: text("source_artifact").notNull(),
  acquiredAt: text("acquired_at"),
  cachedAt: text("cached_at").notNull(),
  schemaVersion: text("schema_version").notNull()
});
// Request identities prevent double clicks and replay from spending again.
// Keys and raw property responses are never stored in this ledger.
export const providerRounds = sqliteTable("provider_rounds", {
  roundId: text("round_id").primaryKey(),
  provider: text("provider").notNull(),
  settings: text("settings").notNull(),
  maximumAttempts: integer("maximum_attempts").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull()
});
export const providerAttempts = sqliteTable("provider_attempts", {
  attemptId: text("attempt_id").primaryKey(),
  roundId: text("round_id").notNull(),
  attemptIndex: integer("attempt_index").notNull(),
  roundIndex: integer("round_index"),
  routeId: text("route_id"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull()
}, table => [uniqueIndex("provider_attempt_round_index").on(table.roundId, table.attemptIndex)]);
// One shared key serves all sessions; reserve at most 18 starts per second below RentCast's 20/s cap.
export const rentcastRateSeconds = sqliteTable("rentcast_rate_seconds", {
  second: integer("second").primaryKey(),
  usedCount: integer("used_count").notNull()
});
