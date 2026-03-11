// @ts-nocheck
import { sql } from '@vercel/postgres';

// log connection info for debugging
console.log('db.ts loading, POSTGRES_URL length=', (process.env.POSTGRES_URL||'').length, 'DATABASE_URL length=', (process.env.DATABASE_URL||'').length);

// Initialize database schema on startup
async function initializeDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        call_id TEXT UNIQUE NOT NULL,
        from_number TEXT,
        to_number TEXT,
        direction TEXT,
        result TEXT,
        user_extension TEXT,
        start_time TEXT,
        duration INTEGER,
        recording_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_start_time ON calls (start_time);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_extension ON calls (user_extension);`;
  } catch (error: any) {
    // Table might already exist, which is fine
    if (!error.message?.includes('already exists')) {
      console.error('Failed to initialize database:', error);
    }
  }
}

// Initialize on module load
initializeDatabase().catch(console.error);

// Helper to convert ? placeholders to PostgreSQL $1, $2, etc
function buildQuery(query: string, values: any[]) {
  let paramIndex = 1;
  let result = query;
  
  for (const value of values) {
    result = result.replace('?', `$${paramIndex}`);
    paramIndex++;
  }
  
  return { query: result, values };
}

export const db = {
  prepare: (text: string) => {
    return {
      run: async (...values: any[]) => {
        try {
          const { query, values: pgValues } = buildQuery(text, values);
          return await sql.unsafe(query, pgValues);
        } catch (error) {
          console.error('[db.run] SQL Error:', error);
          throw error;
        }
      },
      all: async (...values: any[]) => {
        try {
          const { query, values: pgValues } = buildQuery(text, values);
          const result = await sql.unsafe(query, pgValues);
          return result.rows || [];
        } catch (error) {
          console.error('[db.all] SQL Error:', error);
          throw error;
        }
      },
      get: async (...values: any[]) => {
        try {
          const { query, values: pgValues } = buildQuery(text, values);
          const result = await sql.unsafe(query, pgValues);
          return result.rows?.[0] || null;
        } catch (error) {
          console.error('[db.get] SQL Error:', error);
          throw error;
        }
      }
    };
  },

  transaction: (fn: (db: any) => Promise<void> | void) => {
    return async (data: any) => {
      return fn(db);
    };
  }
};

export default db;
