import { useI18n } from '../lib/i18n.js';

export default function ApplicantsLink({ post }) {
  const { t } = useI18n();
  return (
    <a className="btn btn-secondary" href={`#applications?announcement=${post.id}`}
      aria-label={t('applications.myCalls.applicantsFor', { title: post.title })}>
      {t('applications.myCalls.applicants')}
    </a>
  );
}
