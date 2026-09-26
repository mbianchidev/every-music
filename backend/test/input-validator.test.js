import test from 'node:test';
import assert from 'node:assert/strict';
import { InputValidator } from '../src/validators/input-validator.js';

test('parses bounded pagination', () => {
  assert.deepEqual(InputValidator.parsePagination('2', '25'), {
    valid: true,
    pagination: { page: 2, pageSize: 25 },
  });
});

test('rejects invalid pagination instead of passing NaN to PostgreSQL', () => {
  assert.equal(InputValidator.parsePagination('nope', '20').valid, false);
  assert.equal(InputValidator.parsePagination('1', '101').valid, false);
});

test('validates empty strings when a minimum length is specified', () => {
  assert.deepEqual(
    InputValidator.validateLength('', 5, 255, 'Title'),
    { valid: false, message: 'Title must be between 5 and 255 characters' },
  );
});

test('allows only web URLs', () => {
  assert.equal(InputValidator.validateUrl('https://example.com').valid, true);
  assert.deepEqual(
    InputValidator.validateUrl('javascript:alert(1)'),
    { valid: false, message: 'URL must use HTTP or HTTPS' },
  );
});

test('requires a complete, numeric coordinate pair', () => {
  assert.equal(InputValidator.validateCoordinates(45, 9).valid, true);
  assert.equal(InputValidator.validateCoordinates(45, undefined).valid, false);
  assert.equal(InputValidator.validateCoordinates('45', '9').valid, false);
});

test('validates relation payloads before they reach PostgreSQL', () => {
  assert.equal(InputValidator.validateUuidArray([], 'Genre IDs').valid, true);
  assert.equal(InputValidator.validateUuidArray(['not-a-uuid'], 'Genre IDs').valid, false);
  assert.equal(InputValidator.validateLinks([
    { linkType: 'website', url: 'https://example.com' },
  ]).valid, true);
  assert.equal(InputValidator.validateLinks([
    { linkType: 'website', url: 'javascript:alert(1)' },
  ]).valid, false);
});
