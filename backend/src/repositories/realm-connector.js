import pg from 'pg';
import { realmConfig } from '../../config/realm.js';

const { Pool } = pg;

class RealmConnector {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.logger = console;
  }

  async establish(logger = console) {
    if (this.isConnected) {
      return this.pool;
    }

    this.logger = logger;
    this.pool = new Pool({
      connectionString: realmConfig.realm.connectionString,
      min: realmConfig.realm.pooling.minimum,
      max: realmConfig.realm.pooling.maximum,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      this.logger.error({ err }, 'Realm pool error');
    });

    try {
      const connection = await this.pool.connect();
      await connection.query('SELECT NOW()');
      connection.release();
      this.isConnected = true;
      this.logger.info('Realm connection established');
      return this.pool;
    } catch (err) {
      this.logger.error({ err }, 'Failed to establish realm connection');
      await this.pool.end();
      this.pool = null;
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
    if (!this.pool) {
      throw new Error('Realm not connected');
    }

    const connection = await this.pool.connect();
    let released = false;
    const executor = {
      execute: (queryText, parameters = []) => connection.query(queryText, parameters),
    };

    try {
      await connection.query('BEGIN');
      const outcome = await operationsCallback(executor);
      await connection.query('COMMIT');
      return outcome;
    } catch (err) {
      await connection.query('ROLLBACK');
      connection.release(err);
      released = true;
      throw err;
    } finally {
      if (!released) {
        connection.release();
      }
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      this.logger.info('Realm disconnected');
    }
  }

  async listen(channel, onEvent, onFailure) {
    if (channel !== 'everymusic_events') throw new Error('Unknown event channel');
    const client = new pg.Client({ connectionString: realmConfig.realm.connectionString });
    let closed = false;
    const fail = (error) => {
      if (closed) return;
      closed = true;
      this.logger.error({ err: error }, 'Realtime database listener disconnected');
      onFailure(error);
      client.end().catch(err => this.logger.error({ err }, 'Realtime listener cleanup failed'));
    };
    client.on('error', fail);
    client.on('end', () => { if (!closed) fail(new Error('Realtime database connection ended')); });
    client.on('notification', ({ payload }) => {
      try {
        onEvent(JSON.parse(payload));
      } catch (error) {
        this.logger.error({ err: error }, 'Invalid realtime event');
      }
    });
    try {
      await client.connect();
      await client.query('LISTEN everymusic_events');
    } catch (error) {
      closed = true;
      await client.end();
      throw error;
    }
    return async () => {
      closed = true;
      await client.end();
    };
  }
}

export const realmConnector = new RealmConnector();
