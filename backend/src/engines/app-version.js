const PATTERN = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[-+][0-9A-Za-z.-]{1,40})?$/;

// Parses MAJOR.MINOR.PATCH with an optional pre-release/build suffix. The
// suffix is kept in `version` but ignored when comparing releases.
export function parseVersion(value) {
  const match = typeof value === 'string' ? PATTERN.exec(value.trim()) : null;
  if (!match) return null;
  const [major, minor, patch] = match.slice(1, 4).map(Number);
  return { version: value.trim(), core: `${major}.${minor}.${patch}`, major, minor, patch };
}

export function compareVersions(left, right) {
  const a = typeof left === 'string' ? parseVersion(left) : left;
  const b = typeof right === 'string' ? parseVersion(right) : right;
  if (!a || !b) throw new Error('Cannot compare invalid versions');
  for (const part of ['major', 'minor', 'patch']) {
    if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1;
  }
  return 0;
}

// Only increases of the major or minor component announce an update.
export function updateKind(previous, current) {
  if (!previous || !current || compareVersions(current, previous) <= 0) return null;
  if (current.major > previous.major) return 'app_update_major';
  if (current.minor > previous.minor) return 'app_update_minor';
  return null;
}

// Ratings may name a released client version: not older than the supported
// minimum and not newer than the newest version the server knows about.
export function ratableVersion(value, { minimum = null, latest = null, server = null } = {}) {
  const version = parseVersion(value);
  if (!version || version.version !== version.core) return null;
  const ceiling = [latest, server].map(item => parseVersion(item)).filter(Boolean)
    .sort((a, b) => compareVersions(b, a))[0];
  if (minimum && compareVersions(version, minimum) < 0) return null;
  if (ceiling && compareVersions(version, ceiling) > 0) return null;
  return version.core;
}
