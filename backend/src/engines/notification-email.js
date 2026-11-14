// Localized notification emails. Text comes only from the kind and numeric
// params; titles, names, and other free text are never interpolated, so an
// email cannot carry message text or private content.
export const EMAIL_LOCALES = ['en', 'nl', 'it'];

const messages = {
  en: {
    open: 'Open Every.music',
    settings: 'Manage notification settings',
    privacy: 'For your privacy, notification emails never contain message text or other private content.',
    footer: 'You receive this email because email notifications for this type are on for your Every.music account. You can change this at any time in your notification settings.',
    fallback: { subject: 'You have a new notification', body: 'Open Every.music to see it.' },
    kinds: {
      message: { subject: 'You have a new message', body: 'A musician sent you a new message. Open Every.music to read it.' },
      message_request: { subject: 'A musician wants to start an encrypted conversation', body: 'Open Every.music to see the request and reply.' },
      comment: { subject: 'Your announcement has a new comment', body: 'Someone commented on one of your announcements.' },
      reaction: { subject: 'Someone liked your announcement', body: 'One of your announcements received a new like.' },
      profile_view: { subject: 'Your profile was viewed today', body: 'A musician viewed your profile today.' },
      report_reviewed: { subject: 'An administrator reviewed your report', body: 'Open Every.music to see the outcome of your report.' },
      announcement: { subject: 'A musician you follow published an announcement', body: 'Open Every.music to read the new announcement.' },
      new_follower: { subject: 'You have a new follower', body: 'A musician started following you.' },
      announcement_stats: {
        subject: 'Your weekly announcement statistics',
        body: 'Here is how your announcements did in the last 7 days.',
        lines: ['Views: {views}', 'Likes: {likes}', 'Saves: {saves}'],
      },
      profile_stats: {
        subject: 'Your weekly profile statistics',
        body: 'Here is how your profile did in the last 7 days.',
        lines: ['Profile views: {views}'],
      },
      events: { subject: 'New events on Every.music', body: 'There are new music events you may like.' },
      offers: { subject: 'A new offer on Every.music', body: 'There is a new offer for you.' },
      invite_friends: { subject: 'Invite musician friends to Every.music', body: 'Know musicians who would enjoy Every.music? Invite them to join you.' },
      come_back: {
        subject: 'We miss you on Every.music',
        body: {
          count: 'days',
          one: 'You have not visited Every.music for more than {days} day. New open calls and musicians may be waiting for you.',
          other: 'You have not visited Every.music for more than {days} days. New open calls and musicians may be waiting for you.',
        },
      },
      app_update_minor: { subject: 'An Every.music update is available', body: 'A new version of Every.music is available.' },
      app_update_major: { subject: 'A major Every.music update is available', body: 'A new major version of Every.music is available. Update to keep using the latest features.' },
    },
  },
  nl: {
    open: 'Open Every.music',
    settings: 'Meldingsinstellingen beheren',
    privacy: 'Voor je privacy bevatten meldingsmails nooit berichttekst of andere privé-inhoud.',
    footer: 'Je ontvangt deze e-mail omdat e-mailmeldingen voor dit type aanstaan voor je Every.music-account. Je kunt dit altijd wijzigen in je meldingsinstellingen.',
    fallback: { subject: 'Je hebt een nieuwe melding', body: 'Open Every.music om deze te bekijken.' },
    kinds: {
      message: { subject: 'Je hebt een nieuw bericht', body: 'Een muzikant heeft je een nieuw bericht gestuurd. Open Every.music om het te lezen.' },
      message_request: { subject: 'Een muzikant wil een versleuteld gesprek beginnen', body: 'Open Every.music om het verzoek te bekijken en te antwoorden.' },
      comment: { subject: 'Er is een nieuwe reactie op je aankondiging', body: 'Iemand heeft gereageerd op een van je aankondigingen.' },
      reaction: { subject: 'Iemand vindt je aankondiging leuk', body: 'Een van je aankondigingen heeft een nieuwe like gekregen.' },
      profile_view: { subject: 'Je profiel is vandaag bekeken', body: 'Een muzikant heeft vandaag je profiel bekeken.' },
      report_reviewed: { subject: 'Een beheerder heeft je rapportage beoordeeld', body: 'Open Every.music om de uitkomst van je rapportage te bekijken.' },
      announcement: { subject: 'Een muzikant die je volgt heeft een aankondiging geplaatst', body: 'Open Every.music om de nieuwe aankondiging te lezen.' },
      new_follower: { subject: 'Je hebt een nieuwe volger', body: 'Een muzikant volgt je nu.' },
      announcement_stats: {
        subject: 'Je wekelijkse statistieken voor aankondigingen',
        body: 'Zo deden je aankondigingen het de afgelopen 7 dagen.',
        lines: ['Weergaven: {views}', 'Likes: {likes}', 'Keer opgeslagen: {saves}'],
      },
      profile_stats: {
        subject: 'Je wekelijkse profielstatistieken',
        body: 'Zo deed je profiel het de afgelopen 7 dagen.',
        lines: ['Profielweergaven: {views}'],
      },
      events: { subject: 'Nieuwe evenementen op Every.music', body: 'Er zijn nieuwe muziekevenementen die je misschien leuk vindt.' },
      offers: { subject: 'Een nieuwe aanbieding op Every.music', body: 'Er is een nieuwe aanbieding voor je.' },
      invite_friends: { subject: 'Nodig muzikantenvrienden uit voor Every.music', body: 'Ken je muzikanten die Every.music leuk zouden vinden? Nodig ze uit.' },
      come_back: {
        subject: 'We missen je op Every.music',
        body: {
          count: 'days',
          one: 'Je hebt Every.music al meer dan {days} dag niet bezocht. Er wachten misschien nieuwe oproepen en muzikanten op je.',
          other: 'Je hebt Every.music al meer dan {days} dagen niet bezocht. Er wachten misschien nieuwe oproepen en muzikanten op je.',
        },
      },
      app_update_minor: { subject: 'Er is een update van Every.music beschikbaar', body: 'Er is een nieuwe versie van Every.music beschikbaar.' },
      app_update_major: { subject: 'Er is een grote update van Every.music beschikbaar', body: 'Er is een nieuwe hoofdversie van Every.music beschikbaar. Werk bij om de nieuwste functies te blijven gebruiken.' },
    },
  },
  it: {
    open: 'Apri Every.music',
    settings: 'Gestisci le impostazioni delle notifiche',
    privacy: 'Per la tua privacy, le email di notifica non contengono mai il testo dei messaggi o altri contenuti privati.',
    footer: 'Ricevi questa email perché le notifiche email per questo tipo sono attive per il tuo account Every.music. Puoi cambiarlo in qualsiasi momento nelle impostazioni delle notifiche.',
    fallback: { subject: 'Hai una nuova notifica', body: 'Apri Every.music per vederla.' },
    kinds: {
      message: { subject: 'Hai un nuovo messaggio', body: 'Un musicista ti ha inviato un nuovo messaggio. Apri Every.music per leggerlo.' },
      message_request: { subject: 'Un musicista vuole iniziare una conversazione cifrata', body: 'Apri Every.music per vedere la richiesta e rispondere.' },
      comment: { subject: 'Il tuo annuncio ha un nuovo commento', body: 'Qualcuno ha commentato uno dei tuoi annunci.' },
      reaction: { subject: 'A qualcuno piace il tuo annuncio', body: 'Uno dei tuoi annunci ha ricevuto un nuovo mi piace.' },
      profile_view: { subject: 'Il tuo profilo è stato visto oggi', body: 'Un musicista ha visto il tuo profilo oggi.' },
      report_reviewed: { subject: 'Un amministratore ha esaminato la tua segnalazione', body: "Apri Every.music per vedere l'esito della tua segnalazione." },
      announcement: { subject: 'Un musicista che segui ha pubblicato un annuncio', body: 'Apri Every.music per leggere il nuovo annuncio.' },
      new_follower: { subject: 'Hai un nuovo follower', body: 'Un musicista ha iniziato a seguirti.' },
      announcement_stats: {
        subject: 'Le statistiche settimanali dei tuoi annunci',
        body: 'Ecco come sono andati i tuoi annunci negli ultimi 7 giorni.',
        lines: ['Visualizzazioni: {views}', 'Mi piace: {likes}', 'Salvataggi: {saves}'],
      },
      profile_stats: {
        subject: 'Le statistiche settimanali del tuo profilo',
        body: 'Ecco come è andato il tuo profilo negli ultimi 7 giorni.',
        lines: ['Visite al profilo: {views}'],
      },
      events: { subject: 'Nuovi eventi su Every.music', body: 'Ci sono nuovi eventi musicali che potrebbero piacerti.' },
      offers: { subject: 'Una nuova offerta su Every.music', body: "C'è una nuova offerta per te." },
      invite_friends: { subject: 'Invita i tuoi amici musicisti su Every.music', body: 'Conosci musicisti a cui piacerebbe Every.music? Invitali.' },
      come_back: {
        subject: 'Ci manchi su Every.music',
        body: {
          count: 'days',
          one: 'Non visiti Every.music da più di {days} giorno. Nuovi annunci e musicisti potrebbero aspettarti.',
          other: 'Non visiti Every.music da più di {days} giorni. Nuovi annunci e musicisti potrebbero aspettarti.',
        },
      },
      app_update_minor: { subject: 'È disponibile un aggiornamento di Every.music', body: 'È disponibile una nuova versione di Every.music.' },
      app_update_major: { subject: 'È disponibile un aggiornamento importante di Every.music', body: 'È disponibile una nuova versione principale di Every.music. Aggiorna per continuare a usare le funzioni più recenti.' },
    },
  },
};

const SAFE_LINK = /^#[a-z][a-z0-9-]*(?:\?[A-Za-z0-9=&%._:-]{0,512})?$/;

export function notificationLink(origin, link) {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/${typeof link === 'string' && SAFE_LINK.test(link) ? link : '#notifications'}`;
}

export const settingsLink = origin => notificationLink(origin, '#settings?section=notifications');

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function numericParams(params) {
  return Object.fromEntries(Object.entries(params && typeof params === 'object' ? params : {})
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value)));
}

function fill(locale, template, numbers) {
  let message = template;
  if (message && typeof message === 'object') {
    const count = numbers[message.count];
    if (count === undefined) return null;
    message = message[new Intl.PluralRules(locale).select(count)] ?? message.other;
  }
  if (typeof message !== 'string') return null;
  const formatter = new Intl.NumberFormat(locale);
  let missing = false;
  const filled = message.replace(/\{(\w+)\}/g, (_placeholder, name) => {
    if (!Object.hasOwn(numbers, name)) { missing = true; return ''; }
    return formatter.format(numbers[name]);
  });
  return missing ? null : filled;
}

export function composeNotificationEmail({ kind, params, link, locale, origin }) {
  const language = EMAIL_LOCALES.includes(locale) ? locale : 'en';
  const catalog = messages[language];
  const numbers = numericParams(params);
  const template = Object.hasOwn(catalog.kinds, kind) ? catalog.kinds[kind] : null;
  const subject = template?.subject ?? catalog.fallback.subject;
  const body = (template && fill(language, template.body, numbers)) ?? catalog.fallback.body;
  const lines = (template?.lines ?? []).map(line => fill(language, line, numbers));
  const details = lines.every(line => line !== null) ? lines : [];
  const openUrl = notificationLink(origin, link);
  const manageUrl = settingsLink(origin);
  const text = [
    body, ...details, '', `${catalog.open}: ${openUrl}`, '', catalog.privacy, catalog.footer, `${catalog.settings}: ${manageUrl}`,
  ].join('\n');
  const html = `<!doctype html>
<html lang="${language}"><body style="margin:0;padding:24px;background:#f6f7fb;color:#202533;font-family:system-ui,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:10px;">
<h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(subject)}</h1>
<p style="font-size:15px;line-height:1.5;">${escapeHtml(body)}</p>
${details.length ? `<ul style="font-size:15px;line-height:1.5;">${details.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
<p style="margin:24px 0;"><a href="${escapeHtml(openUrl)}" style="display:inline-block;padding:12px 24px;background:#5542ae;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(catalog.open)}</a></p>
<p style="color:#60687b;font-size:13px;line-height:1.5;">${escapeHtml(catalog.privacy)}</p>
<p style="color:#60687b;font-size:13px;line-height:1.5;">${escapeHtml(catalog.footer)} <a href="${escapeHtml(manageUrl)}">${escapeHtml(catalog.settings)}</a></p>
</div></body></html>`;
  return { subject: `${subject} | Every.music`, text, html, locale: language };
}
