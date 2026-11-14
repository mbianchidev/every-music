// Band collaboration settings: how often due calendar reminders are sent.
export function createBandCollabConfig(env = process.env) {
  const raw = env.CALENDAR_REMINDER_INTERVAL_SECONDS;
  const value = raw === undefined || raw === '' ? 60 : Number(raw);
  if (!Number.isInteger(value) || value < 10 || value > 3600) {
    throw new Error('CALENDAR_REMINDER_INTERVAL_SECONDS must be an integer between 10 and 3600');
  }
  return { calendar: { reminderIntervalSeconds: value } };
}
