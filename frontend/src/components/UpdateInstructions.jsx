import { useI18n } from '../lib/i18n.js';
import { detectPlatform } from '../lib/app-version.js';

const PLATFORMS = ['web', 'pwa', 'desktop', 'android', 'ios'];
const DOWNLOADS = new Set(['desktop', 'android']);

export default function UpdateInstructions({ updateUrl, headingLevel = 2 }) {
  const { t } = useI18n();
  const platform = detectPlatform();
  const Heading = `h${headingLevel}`;
  const steps = key => <>
    <p>{t(`onboarding.version.instructions.${key}`)}</p>
    {DOWNLOADS.has(key) && (updateUrl
      ? <p><a href={updateUrl} target="_blank" rel="noopener noreferrer">{t('onboarding.version.download')}</a></p>
      : <p className="field-hint">{t('onboarding.version.downloadFallback')}</p>)}
  </>;
  return (
    <div className="update-instructions">
      <Heading className="heading-md">{t('onboarding.version.yourPlatform', { platform: t(`onboarding.version.platforms.${platform}`) })}</Heading>
      {steps(platform)}
      <details className="selection-panel">
        <summary>{t('onboarding.version.otherPlatforms')}</summary>
        <dl className="update-platforms">
          {PLATFORMS.filter(key => key !== platform).map(key => <div key={key}>
            <dt>{t(`onboarding.version.platforms.${key}`)}</dt><dd>{steps(key)}</dd>
          </div>)}
        </dl>
      </details>
    </div>
  );
}
