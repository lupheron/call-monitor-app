import { sql } from '@vercel/postgres';

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

export const db = {
  query: async (text: string, values: any[] = []) => {
    return sql.query(text, values);
  },
  
  execute: async (text: string, values: any[] = []) => {
    const result = await sql.query(text, values);
    return result;
  },

  prepare: (text: string) => {
    return {
      run: async (...values: any[]) => {
        return sql.query(text, values);
      },
      all: async (...values: any[]) => {
        const result = await sql.query(text, values);
        return result.rows || [];
      },
      get: async (...values: any[]) => {
        const result = await sql.query(text, values);
        return result.rows?.[0] || null;
      }
    };
  },

  transaction: (fn: (db: any) => Promise<void> | void) => {
    return async (data: any) => {
      // Vercel Postgres doesn't support transactions in the same way,
      // so we'll execute the function and let errors propagate
      return fn(db);
    };
  }
};

export default db;
