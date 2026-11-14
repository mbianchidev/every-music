import { placeRepository } from '../repositories/place-repository.js';
import { ok } from '../conductors/response-helpers.js';
import { requestError } from '../engines/request-error.js';
import { object, text } from '../validators/http-schemas.js';

const coordinate = { type: 'string', pattern: '^-?\\d{1,3}(\\.\\d{1,10})?$' };
const country = { type: 'string', pattern: '^[A-Za-z]{2}$' };
const lookupLimit = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

// Public GeoNames place catalog used by pickers and discovery filters.
export async function placeOrchestrator(fastify) {
  fastify.get('/places', {
    ...lookupLimit,
    schema: { querystring: object({ q: text(100, 0), limit: { type: 'string', pattern: '^([1-9]|1\\d|20)$' }, country }, ['q']) },
  }, async (request, reply) => ok(reply, {
    places: await placeRepository.search(request.query.q, {
      limit: Number(request.query.limit || 8), country: request.query.country?.toUpperCase(),
    }),
  }));

  fastify.get('/places/nearest', {
    ...lookupLimit,
    schema: { querystring: object({ latitude: coordinate, longitude: coordinate }, ['latitude', 'longitude']) },
  }, async (request, reply) => {
    const latitude = Number(request.query.latitude);
    const longitude = Number(request.query.longitude);
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw requestError(400, 'VALIDATION_ERROR', 'Latitude must be between -90 and 90 and longitude between -180 and 180');
    }
    const place = await placeRepository.nearest({ latitude, longitude });
    if (!place) throw requestError(404, 'PLACE_NOT_FOUND', 'No known city is close to this location');
    return ok(reply, { place });
  });

  fastify.get('/places/:placeId', {
    schema: { params: object({ placeId: { type: 'string', pattern: '^\\d{1,10}$' } }, ['placeId']) },
  }, async (request, reply) => {
    const place = await placeRepository.find(Number(request.params.placeId));
    if (!place) throw requestError(404, 'PLACE_NOT_FOUND', 'Place not found');
    return ok(reply, { place });
  });

  fastify.get('/countries', async (request, reply) => ok(reply, { countries: await placeRepository.countries() }));

  fastify.get('/regions', {
    schema: { querystring: object({ country }, ['country']) },
  }, async (request, reply) => ok(reply, { regions: await placeRepository.regions(request.query.country.toUpperCase()) }));
}
