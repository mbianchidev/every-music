import { realmConnector } from '../repositories/realm-connector.js';

export async function catalogOrchestrator(fastify, options) {
  fastify.get('/instruments', async (request, reply) => {
    try {
      const result = await realmConnector.execute(`
        SELECT id, name, category, created_at
        FROM instruments
        ORDER BY category, name
      `);

      return reply.code(200).send({
        success: true,
        data: {
          instruments: result.rows.map(r => ({
            id: r.id,
            name: r.name,
            category: r.category,
          })),
        },
      });
    } catch (err) {
      request.log.error('Failed to fetch instruments:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch instruments',
        },
      });
    }
  });

  fastify.get('/genres', async (request, reply) => {
    try {
      const result = await realmConnector.execute(`
        SELECT g.id, g.name, g.parent_genre_id,
               pg.name as parent_genre_name
        FROM genres g
        LEFT JOIN genres pg ON g.parent_genre_id = pg.id
        ORDER BY COALESCE(pg.name, g.name), g.name
      `);

      return reply.code(200).send({
        success: true,
        data: {
          genres: result.rows.map(r => ({
            id: r.id,
            name: r.name,
            parentGenreId: r.parent_genre_id,
            parentGenreName: r.parent_genre_name,
          })),
        },
      });
    } catch (err) {
      request.log.error('Failed to fetch genres:', err);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch genres',
        },
      });
    }
  });
}
