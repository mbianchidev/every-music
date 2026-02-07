import pg from 'pg';
import { realmConfig } from '../../config/realm.js';

const { Pool } = pg;

class RealmConnector {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async establish() {
    if (this.isConnected) {
      return this.pool;
    }

    this.pool = new Pool({
      connectionString: realmConfig.realm.connectionString,
      min: realmConfig.realm.pooling.minimum,
      max: realmConfig.realm.pooling.maximum,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      console.error('Realm pool error:', err);
    });

    try {
      const connection = await this.pool.connect();
      await connection.query('SELECT NOW()');
      connection.release();
      this.isConnected = true;
      console.log('✓ Realm connection established');
      return this.pool;
    } catch (err) {
      console.error('✗ Failed to establish realm connection:', err);
      throw err;
    }
  }

  async execute(queryText, parameters = []) {
    if (!this.pool) {
      throw new Error('Realm not connected');
    }
    return this.pool.query(queryText, parameters);
  }

  async transaction(operationsCallback) {
    const connection = await this.pool.connect();
    try {
      await connection.query('BEGIN');
      const outcome = await operationsCallback(connection);
      await connection.query('COMMIT');
      return outcome;
    } catch (err) {
      await connection.query('ROLLBACK');
      throw err;
    } finally {
      connection.release();
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('✓ Realm disconnected');
    }
  }
}

export const realmConnector = new RealmConnector();
