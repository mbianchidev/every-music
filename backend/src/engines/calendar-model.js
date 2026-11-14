export const CALENDAR_KINDS = ['rehearsal', 'gig', 'recording', 'meeting', 'other'];
export const CALENDAR_RESPONSES = ['yes', 'no', 'maybe'];
export const CALENDAR_STATUSES = ['scheduled', 'cancelled'];
// Reminder offsets in minutes before the start: at start, 15/30 minutes,
// 1/2 hours, 1/2 days, and one week.
export const REMINDER_OFFSETS = [0, 15, 30, 60, 120, 1440, 2880, 10080];
export const CALENDAR_LIMITS = {
  title: 200, address: 500, notes: 4000, invitees: 50, reminders: 3, maxDurationDays: 14,
};
export const LOCAL_TIME_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$';
