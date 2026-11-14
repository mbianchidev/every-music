import { InputValidator } from '../validators/input-validator.js';
import { requestError } from '../engines/request-error.js';

export function pagination(request) {
  const result = InputValidator.parsePagination(request.query?.page, request.query?.pageSize);
  if (!result.valid) throw requestError(400, 'VALIDATION_ERROR', result.message);
  return result.pagination;
}

export function pageOf(rows, key, page) {
  return { [key]: rows.slice(0, page.pageSize), pagination: { ...page, hasMore: rows.length > page.pageSize } };
}

export const ok = (reply, data, status = 200) => reply.code(status).send({ success: true, data });
