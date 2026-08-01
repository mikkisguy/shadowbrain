/** Maximum UTF-8 request body accepted by the JSON import endpoint. */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

/** Maximum number of records accepted in each export collection. */
export const IMPORT_MAX_ITEMS = 50_000;
export const IMPORT_MAX_TAGS = 50_000;
export const IMPORT_MAX_ITEM_TAGS = 50_000;
export const IMPORT_MAX_LINKS = 50_000;
export const IMPORT_MAX_JOURNAL_PERIODS = 50_000;

/** Maximum number of validation issues collected or returned. */
export const IMPORT_MAX_ISSUES = 50;

/** Maximum characters kept for each validation issue path/message fragment. */
export const IMPORT_MAX_ISSUE_MESSAGE_LENGTH = 200;

export const IMPORT_MAX_ID_LENGTH = 256;
export const IMPORT_MAX_TYPE_LENGTH = 256;
export const IMPORT_MAX_NAME_LENGTH = 256;
export const IMPORT_MAX_SOURCE_LENGTH = 256;
export const IMPORT_MAX_LINK_TYPE_LENGTH = 256;
export const IMPORT_MAX_CONTENT_LENGTH = 1_000_000;
export const IMPORT_MAX_LONG_STRING_LENGTH = 8_192;

/**
 * Metadata is intentionally flat so the downloadable JSON Schema and the
 * runtime Zod validator enforce the same machine-readable contract.
 */
export const IMPORT_MAX_METADATA_PROPERTIES = 64;
export const IMPORT_MAX_METADATA_KEY_LENGTH = 256;
export const IMPORT_MAX_METADATA_BYTES = 64 * 1024;
export const IMPORT_MAX_METADATA_DEPTH = 8;
