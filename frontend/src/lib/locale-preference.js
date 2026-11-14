import conduit from './conduit.js';
import nucleus from './nucleus.js';
import { detectLocale, getLocale, isSupportedLocale, setLocale } from './i18n.js';

export const ACCOUNT_LOCALE_STORAGE_ID = 'everymusic.account-locale.v1';

// The device language (localStorage) is what signed-out screens use. A signed-in
// account's language lives on the server and, for this tab only, in
// sessionStorage tagged with the account ID, so it never outlives the session
// or carries over to a different account.
export function createLocalePreference({
  session = nucleus,
  transport = conduit,
  storage = globalThis.sessionStorage,
  deviceLocale = () => detectLocale(),
  apply = setLocale,
  current = getLocale,
} = {}) {
  let account = null;
  let revision = 0;
  let pending = Promise.resolve();

  const signedInUser = () => (session.authorized ? session.payload.persona?.userId ?? null : null);
  const read = userId => {
    try {
      const saved = JSON.parse(storage?.getItem(ACCOUNT_LOCALE_STORAGE_ID) || 'null');
      return saved?.userId === userId && isSupportedLocale(saved.locale) ? saved.locale : null;
    } catch (error) {
      console.warn('The saved account language could not be read', error);
      return null;
    }
  };
  const write = (userId, locale) => {
    try { storage?.setItem(ACCOUNT_LOCALE_STORAGE_ID, JSON.stringify({ userId, locale })); }
    catch (error) { console.warn('The account language could not be kept for this tab', error); }
  };
  const clear = () => {
    try { storage?.removeItem(ACCOUNT_LOCALE_STORAGE_ID); }
    catch (error) { console.warn('The account language could not be cleared', error); }
  };

  async function synchronize(userId) {
    const started = revision;
    const cached = read(userId);
    apply(cached || deviceLocale(), { remember: false });
    const unchanged = () => signedInUser() === userId && revision === started;
    try {
      const preferences = await transport.transmit('/preferences', { auth: true });
      if (!unchanged()) return;
      if (isSupportedLocale(preferences?.locale)) {
        write(userId, preferences.locale);
        apply(preferences.locale, { remember: false });
        return;
      }
      const locale = cached || current();
      await transport.transmit('/preferences', { method: 'PUT', auth: true, body: { locale } });
      if (unchanged()) write(userId, locale);
    } catch (error) {
      console.warn('The account language could not be synchronized', error);
    }
  }

  function handle(snapshot) {
    const userId = snapshot.authorized ? snapshot.persona?.userId ?? null : null;
    if (userId === account) return;
    account = userId;
    revision += 1;
    if (!userId) {
      clear();
      apply(deviceLocale(), { remember: false });
      pending = Promise.resolve();
      return;
    }
    pending = synchronize(userId);
  }

  // Applies the language at once. Signed out it becomes this device's choice;
  // signed in it is saved to the account and rejects if the server refuses it.
  async function choose(code) {
    if (!isSupportedLocale(code)) throw new Error(`Unsupported locale: ${code}`);
    const userId = signedInUser();
    revision += 1;
    if (!userId) {
      apply(code);
      return;
    }
    apply(code, { remember: false });
    write(userId, code);
    await transport.transmit('/preferences', { method: 'PUT', auth: true, body: { locale: code } });
  }

  return {
    start: () => session.subscribe(handle),
    choose,
    settled: () => pending,
  };
}

const localePreference = createLocalePreference();
export default localePreference;
