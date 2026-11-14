export const uuid = { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' };
export const text = (maxLength, minLength = 1) => ({ type: 'string', minLength, maxLength });
export const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
export const params = (...names) => object(Object.fromEntries(names.map(name => [name, uuid])), names);
export const paging = { page: text(16), pageSize: text(3) };
