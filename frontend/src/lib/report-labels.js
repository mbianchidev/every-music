import { hasTranslation, t } from './i18n.js';

// Report statuses and categories come from the server; unknown future values
// stay visible as sent instead of disappearing.
const label = (group, value) => (hasTranslation(`reports.${group}.${value}`) ? t(`reports.${group}.${value}`) : value);
export const reportStatus = status => label('status', status);
export const reportCategory = category => label('category', category);
