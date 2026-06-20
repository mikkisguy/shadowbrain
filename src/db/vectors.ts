import Database from "better-sqlite3";

export interface VectorSearchResult {
  id: string;
  type: string;
  title: string | null;
  content: string;
  image_path: string | null;
  source: string;
  source_url: string | null;
  metadata: string | null;
  is_private: number;
  created_at: string;
  updated_at: string;
  distance: number;
}

/**
 * Insert or update an embedding for a content item.
 * @param db - Database connection
 * @param contentId - Content item ID
 * @param embedding - Array of float32 values (typically 384 dimensions)
 */
export function upsertEmbedding(
  db: Database.Database,
  contentId: string,
  embedding: number[]
): void {
  // Use a transaction to delete existing then insert new
  const embeddingJson = JSON.stringify(embedding);
  const transaction = db.transaction(() => {
    // First, check if the content item exists
    const contentCheck = db
      .prepare("SELECT rowid FROM content_items WHERE id = ?")
      .get(contentId) as { rowid: number } | undefined;

    if (!contentCheck) {
      return; // Content item doesn't exist, do nothing
    }

    const rowid = contentCheck.rowid;

    // Delete existing embedding if it exists
    db.prepare("DELETE FROM content_vectors WHERE rowid = ?").run(rowid);

    // Insert new embedding with explicit rowid
    // For vec0, we can insert rowid as a parameter
    db.prepare(
      "INSERT INTO content_vectors(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)"
    ).run(rowid, embeddingJson);
  });

  transaction();
}

/**
 * Get the embedding for a content item.
 * @param db - Database connection
 * @param contentId - Content item ID
 * @returns Array of float32 values or null if not found
 */
export function getEmbedding(
  db: Database.Database,
  contentId: string
): number[] | null {
  const stmt = db.prepare(`
    SELECT vec_to_json(cv.embedding) as embedding_json
    FROM content_vectors cv
    JOIN content_items ci ON cv.rowid = ci.rowid
    WHERE ci.id = ?
  `);
  const result = stmt.get(contentId) as { embedding_json: string } | undefined;
  if (!result) return null;
  return JSON.parse(result.embedding_json);
}

/**
 * Perform vector similarity search using L2 (Euclidean) distance.
 * @param db - Database connection
 * @param queryEmbedding - Query embedding array
 * @param options - Search options
 * @returns Array of matching content items with distances
 */
export function vectorSearch(
  db: Database.Database,
  queryEmbedding: number[],
  options?: {
    limit?: number;
    type?: string;
  }
): VectorSearchResult[] {
  const k = options?.limit ?? 10;
  const embeddingJson = JSON.stringify(queryEmbedding);

  let sql = `
    SELECT ci.*, v.distance
    FROM content_items ci
    JOIN content_vectors v ON ci.rowid = v.rowid
    WHERE v.embedding MATCH ? AND k = ?
    ORDER BY v.distance
  `;

  let params: (string | number)[] = [embeddingJson, k];

  if (options?.type) {
    sql = `
      SELECT ci.*, v.distance
      FROM content_items ci
      JOIN content_vectors v ON ci.rowid = v.rowid
      WHERE v.embedding MATCH ? AND k = ? AND ci.type = ?
      ORDER BY v.distance
    `;
    params = [embeddingJson, k, options.type];
  }

  const stmt = db.prepare(sql);
  return stmt.all(...params) as VectorSearchResult[];
}

/**
 * Delete an embedding for a content item.
 * @param db - Database connection
 * @param contentId - Content item ID
 */
export function deleteEmbedding(
  db: Database.Database,
  contentId: string
): void {
  const stmt = db.prepare(`
    DELETE FROM content_vectors
    WHERE rowid = (SELECT rowid FROM content_items WHERE id = ?)
  `);
  stmt.run(contentId);
}

/**
 * Check if the vec0 extension is loaded and available.
 * @param db - Database connection
 * @returns true if the extension is loaded
 */
export function isVecExtensionLoaded(db: Database.Database): boolean {
  try {
    const result = db
      .prepare("SELECT name FROM pragma_module_list WHERE name = 'vec0'")
      .get() as { name: string } | undefined;
    return result?.name === "vec0";
  } catch {
    return false;
  }
}

/**
 * Get the number of vectors stored in the database.
 * @param db - Database connection
 * @returns Count of vectors
 */
export function getVectorCount(db: Database.Database): number {
  const result = db
    .prepare("SELECT COUNT(*) as count FROM content_vectors")
    .get() as { count: number };
  return result.count;
}
