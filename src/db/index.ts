// Barrel re-exports.

export type { NodeEnv } from "./client";
export {
  getDbPath,
  getDb,
  closeDb,
  getDevelopmentDb,
  getTestDb,
  getProductionDb,
} from "./client";
export type { DbConfig, CloseDbConfig } from "./client";

export type { AuditLog, AuditLogCreateInput } from "./repositories/audit-logs";
export { auditLogs } from "./repositories/audit-logs";

export type { ContentItem } from "./repositories/content-items";
export { contentItems } from "./repositories/content-items";

export type { ContentLink } from "./repositories/content-links";
export { contentLinks } from "./repositories/content-links";

export type { Tag, TagWithCount } from "./repositories/tags";
export { tags } from "./repositories/tags";

export { contentTags } from "./repositories/content-tags";

export { settings } from "./repositories/settings";

export type { JournalPeriod } from "./repositories/journal-periods";
export { journalPeriods } from "./repositories/journal-periods";

export type { SearchResult } from "./search";
export { sanitizeFts5Query, search } from "./search";

export type { VectorSearchResult } from "./vectors";
export {
  upsertEmbedding,
  getEmbedding,
  vectorSearch,
  deleteEmbedding,
  isVecExtensionLoaded,
  getVectorCount,
} from "./vectors";
