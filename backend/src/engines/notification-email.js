// Localized notification emails and push text. Text comes only from the kind,
// numeric params, and the enumerated params in NOTIFICATION_SELECTORS; titles,
// names, and other free text are never interpolated, so an email or push
// message cannot carry message text or private content.
export const EMAIL_LOCALES = ['en', 'nl', 'it'];

// Params whose value picks one of a template's `cases` (first match wins).
// Values outside a template's cases fall back to its generic text.
export const NOTIFICATION_SELECTORS = {
  application_status: ['status'],
  security_alert: ['event'],
  verification_requested: ['subjectType'],
  verification_decided: ['decision'],
  organization_membership: ['response', 'change'],
  organization_update: ['source'],
  organization_relation: ['status'],
  organization_claim: ['outcome'],
  event_communication: ['communicationKind'],
  calendar_invite: ['change'],
};

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
      subscription_started: { subject: 'Your Every.music plan is active', body: 'Thank you for supporting Every.music. Your paid plan is now active.' },
      subscription_ended: { subject: 'Your Every.music plan has ended', body: 'You are back on the free plan. You can subscribe again at any time.' },
      payment_failed: { subject: 'A payment for your Every.music plan failed', body: 'Update your payment method in Manage billing to keep your plan.' },
      application_received: { subject: 'Someone applied to your announcement', body: 'A musician applied to one of your announcements. Open Every.music to review the application.' },
      application_status: {
        subject: 'Your application was updated',
        body: 'The owner of an announcement updated your application. Open Every.music to see it.',
        cases: {
          shortlisted: { subject: 'Your application was shortlisted', body: 'The owner of an announcement shortlisted your application.' },
          accepted: { subject: 'Your application was accepted', body: 'The owner of an announcement accepted your application. Open Every.music to get in touch.' },
          declined: { subject: 'Your application was declined', body: 'The owner of an announcement declined your application. New open calls are posted every day.' },
        },
      },
      listing_expiring: { subject: 'Your marketplace listing expires soon', body: 'One of your marketplace listings expires soon. Open Every.music to renew it if it is still available.' },
      listing_removed: { subject: 'A moderator removed your marketplace listing', body: 'A moderator removed one of your marketplace listings after reviewing a report.' },
      security_alert: {
        subject: 'Security alert for your Every.music account',
        body: 'There was a security change on your account. If this was not you, change your password and sign out of all devices.',
        cases: {
          two_factor_enabled: { subject: 'Two-step verification was turned on', body: 'Two-step verification is now on for your account. If this was not you, change your password right away.' },
          two_factor_disabled: { subject: 'Two-step verification was turned off', body: 'Two-step verification is now off for your account. If this was not you, change your password and turn it back on.' },
          recovery_code_used: { subject: 'A recovery code was used', body: 'A recovery code was used to sign in to your account. If this was not you, change your password and sign out of all devices.' },
          recovery_codes_regenerated: { subject: 'New recovery codes were created', body: 'New recovery codes were created for your account and the old ones no longer work. If this was not you, change your password.' },
          sessions_revoked: { subject: 'You were signed out of all devices', body: 'Your account was signed out of all devices. If this was not you, change your password.' },
        },
      },
      verification_requested: {
        subject: 'A new verification request is waiting',
        body: 'A musician requested profile verification. Open the administration area to review it.',
        cases: { organization: { body: 'A page requested verification. Open the administration area to review it.' } },
      },
      verification_decided: {
        subject: 'Your verification request was reviewed',
        body: 'An administrator reviewed your verification request.',
        cases: {
          approved: { subject: 'Your verification request was approved', body: 'Your verification request was approved. A verified badge now appears next to the name.' },
          rejected: { subject: 'Your verification request was not approved', body: 'Your verification request was not approved. Open Every.music to see what you can do next.' },
        },
      },
      saved_search_match: { subject: 'A new announcement matches your saved search', body: 'A new announcement matches one of your saved searches.' },
      support_reply: { subject: 'The team replied to your support request', body: 'The Every.music team replied to one of your support requests. Open Every.music to read the reply.' },
      organization_invitation: { subject: 'You were invited to join a page', body: 'Someone invited you to join a band or organization page. Open Your pages to accept or decline.' },
      organization_membership: {
        subject: 'Your page membership changed',
        body: 'There is a change to one of your page memberships.',
        cases: {
          accepted: { subject: 'Your invitation was accepted', body: 'A musician accepted your invitation to join a page.' },
          declined: { subject: 'Your invitation was declined', body: 'A musician declined your invitation to join a page.' },
          removed: { subject: 'You are no longer a member of a page', body: 'You were removed from a band or organization page.' },
          leader: { subject: 'You are now the leader of a page', body: 'You are now the leader of a band or organization page.' },
        },
      },
      organization_update: {
        subject: 'A page you follow has news',
        body: 'A band or organization page you follow published an update.',
        cases: {
          announcement: { subject: 'A page you follow published an announcement', body: 'A band or organization page you follow published a new announcement.' },
          release: { subject: 'A page you follow has a new release', body: 'A band or organization page you follow shared a new release.' },
          youtube: { subject: 'A page you follow has a new video', body: 'A band or organization page you follow shared a new video.' },
        },
      },
      organization_relation: {
        subject: 'A roster or label request was updated',
        body: 'There is an update about a roster or label request.',
        cases: {
          pending: { subject: 'A page wants to work with your band', body: 'A booking agency or label wants to add your band. Open Your pages to answer.' },
          accepted: { subject: 'A band accepted your request', body: 'A band accepted your roster or label request.' },
          declined: { subject: 'A band declined your request', body: 'A band declined your roster or label request.' },
        },
      },
      organization_claim: {
        subject: 'Your page claim was reviewed',
        body: 'An administrator reviewed your claim for a page.',
        cases: {
          approved: { subject: 'Your page claim was approved', body: 'Your claim was approved. You now manage the page.' },
          rejected: { subject: 'Your page claim was not approved', body: 'Your claim for a page was not approved.' },
        },
      },
      points_earned: {
        subject: 'You earned points on Every.music',
        body: {
          count: 'points',
          one: 'You earned {points} point. Spend points on Premium days, boosts and pins from your wallet.',
          other: 'You earned {points} points. Spend points on Premium days, boosts and pins from your wallet.',
        },
      },
      event_published: { subject: 'A new event from someone you follow', body: 'A page or artist you follow published a new event.' },
      event_lineup: { subject: 'You were added to an event lineup', body: 'You were added to the lineup of an event.' },
      event_reminder: { subject: 'An event starts soon', body: 'An event you set a reminder for starts soon.' },
      event_communication: {
        subject: 'An official update about an event',
        body: 'The organizer of an event you are going to posted an official update.',
        cases: {
          cancellation: { subject: 'An event you are going to was cancelled', body: 'The organizer cancelled an event you are going to. Open Every.music for details.' },
          postponement: { subject: 'An event you are going to was postponed', body: 'The organizer postponed an event you are going to. Open Every.music for the new date.' },
        },
      },
      calendar_invite: {
        subject: 'Your calendar changed',
        body: 'There is a change in your calendar.',
        cases: {
          invited: { subject: 'You were invited to a calendar entry', body: 'You were invited to a rehearsal, gig, or other calendar entry. Open Every.music to answer.' },
          created: { subject: 'New entry in your band calendar', body: 'A band member added an entry to your band calendar.' },
          updated: { subject: 'A calendar entry was updated', body: 'A calendar entry you can see was updated.' },
          cancelled: { subject: 'A calendar entry was cancelled', body: 'A calendar entry you can see was cancelled.' },
          removed: { subject: 'A calendar entry was removed', body: 'A calendar entry you could see was removed.' },
        },
      },
      calendar_reminder: { subject: 'Calendar reminder', body: 'A calendar entry you set a reminder for starts soon.' },
      band_message: { subject: 'New messages in your band chat', body: 'There are new messages in one of your band chats. Open Every.music to read them.' },
      review_received: { subject: 'You received a review to approve', body: 'Someone reviewed your profile. Reviews appear on your profile only after you approve them.' },
      review_approved: { subject: 'Your review was approved', body: 'A musician approved your review, so it now appears on their profile.' },
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
      subscription_started: { subject: 'Je Every.music-abonnement is actief', body: 'Bedankt dat je Every.music steunt. Je betaalde abonnement is nu actief.' },
      subscription_ended: { subject: 'Je Every.music-abonnement is beëindigd', body: 'Je gebruikt weer het gratis abonnement. Je kunt op elk moment opnieuw een abonnement nemen.' },
      payment_failed: { subject: 'Een betaling voor je Every.music-abonnement is mislukt', body: 'Werk je betaalmethode bij via Facturering beheren om je abonnement te houden.' },
      application_received: { subject: 'Iemand heeft gesolliciteerd op je aankondiging', body: 'Een muzikant heeft gesolliciteerd op een van je aankondigingen. Open Every.music om de sollicitatie te bekijken.' },
      application_status: {
        subject: 'Je sollicitatie is bijgewerkt',
        body: 'De eigenaar van een aankondiging heeft je sollicitatie bijgewerkt. Open Every.music om het te bekijken.',
        cases: {
          shortlisted: { subject: 'Je sollicitatie staat op de shortlist', body: 'De eigenaar van een aankondiging heeft je sollicitatie op de shortlist gezet.' },
          accepted: { subject: 'Je sollicitatie is geaccepteerd', body: 'De eigenaar van een aankondiging heeft je sollicitatie geaccepteerd. Open Every.music om contact op te nemen.' },
          declined: { subject: 'Je sollicitatie is afgewezen', body: 'De eigenaar van een aankondiging heeft je sollicitatie afgewezen. Er verschijnen elke dag nieuwe oproepen.' },
        },
      },
      listing_expiring: { subject: 'Je marktplaatsadvertentie verloopt binnenkort', body: 'Een van je marktplaatsadvertenties verloopt binnenkort. Open Every.music om deze te verlengen als het item nog beschikbaar is.' },
      listing_removed: { subject: 'Een moderator heeft je marktplaatsadvertentie verwijderd', body: 'Een moderator heeft een van je marktplaatsadvertenties verwijderd na het beoordelen van een rapportage.' },
      security_alert: {
        subject: 'Beveiligingsmelding voor je Every.music-account',
        body: 'Er is een beveiligingswijziging op je account. Was jij dit niet? Wijzig dan je wachtwoord en meld je af op alle apparaten.',
        cases: {
          two_factor_enabled: { subject: 'Verificatie in twee stappen is ingeschakeld', body: 'Verificatie in twee stappen staat nu aan voor je account. Was jij dit niet? Wijzig dan meteen je wachtwoord.' },
          two_factor_disabled: { subject: 'Verificatie in twee stappen is uitgeschakeld', body: 'Verificatie in twee stappen staat nu uit voor je account. Was jij dit niet? Wijzig dan je wachtwoord en schakel het weer in.' },
          recovery_code_used: { subject: 'Er is een herstelcode gebruikt', body: 'Er is met een herstelcode ingelogd op je account. Was jij dit niet? Wijzig dan je wachtwoord en meld je af op alle apparaten.' },
          recovery_codes_regenerated: { subject: 'Er zijn nieuwe herstelcodes gemaakt', body: 'Er zijn nieuwe herstelcodes gemaakt voor je account en de oude werken niet meer. Was jij dit niet? Wijzig dan je wachtwoord.' },
          sessions_revoked: { subject: 'Je bent afgemeld op alle apparaten', body: 'Je account is afgemeld op alle apparaten. Was jij dit niet? Wijzig dan je wachtwoord.' },
        },
      },
      verification_requested: {
        subject: 'Er wacht een nieuw verificatieverzoek',
        body: 'Een muzikant heeft profielverificatie aangevraagd. Open het beheergedeelte om het verzoek te beoordelen.',
        cases: { organization: { body: 'Een pagina heeft verificatie aangevraagd. Open het beheergedeelte om het verzoek te beoordelen.' } },
      },
      verification_decided: {
        subject: 'Je verificatieverzoek is beoordeeld',
        body: 'Een beheerder heeft je verificatieverzoek beoordeeld.',
        cases: {
          approved: { subject: 'Je verificatieverzoek is goedgekeurd', body: 'Je verificatieverzoek is goedgekeurd. Naast de naam staat nu een verificatiebadge.' },
          rejected: { subject: 'Je verificatieverzoek is niet goedgekeurd', body: 'Je verificatieverzoek is niet goedgekeurd. Open Every.music om te zien wat je nu kunt doen.' },
        },
      },
      saved_search_match: { subject: 'Een nieuwe aankondiging past bij je opgeslagen zoekopdracht', body: 'Een nieuwe aankondiging past bij een van je opgeslagen zoekopdrachten.' },
      support_reply: { subject: 'Het team heeft je supportverzoek beantwoord', body: 'Het Every.music-team heeft een van je supportverzoeken beantwoord. Open Every.music om het antwoord te lezen.' },
      organization_invitation: { subject: 'Je bent uitgenodigd voor een pagina', body: 'Iemand heeft je uitgenodigd voor de pagina van een band of organisatie. Open Jouw pagina\'s om te accepteren of af te wijzen.' },
      organization_membership: {
        subject: 'Je lidmaatschap van een pagina is gewijzigd',
        body: 'Er is een wijziging in een van je paginalidmaatschappen.',
        cases: {
          accepted: { subject: 'Je uitnodiging is geaccepteerd', body: 'Een muzikant heeft je uitnodiging voor een pagina geaccepteerd.' },
          declined: { subject: 'Je uitnodiging is afgewezen', body: 'Een muzikant heeft je uitnodiging voor een pagina afgewezen.' },
          removed: { subject: 'Je bent geen lid meer van een pagina', body: 'Je bent verwijderd van de pagina van een band of organisatie.' },
          leader: { subject: 'Je bent nu de leider van een pagina', body: 'Je bent nu de leider van de pagina van een band of organisatie.' },
        },
      },
      organization_update: {
        subject: 'Een pagina die je volgt heeft nieuws',
        body: 'De pagina van een band of organisatie die je volgt heeft een update geplaatst.',
        cases: {
          announcement: { subject: 'Een pagina die je volgt heeft een aankondiging geplaatst', body: 'De pagina van een band of organisatie die je volgt heeft een nieuwe aankondiging geplaatst.' },
          release: { subject: 'Een pagina die je volgt heeft een nieuwe release', body: 'De pagina van een band of organisatie die je volgt heeft een nieuwe release gedeeld.' },
          youtube: { subject: 'Een pagina die je volgt heeft een nieuwe video', body: 'De pagina van een band of organisatie die je volgt heeft een nieuwe video gedeeld.' },
        },
      },
      organization_relation: {
        subject: 'Een roster- of labelverzoek is bijgewerkt',
        body: 'Er is een update over een roster- of labelverzoek.',
        cases: {
          pending: { subject: 'Een pagina wil met je band samenwerken', body: 'Een boekingskantoor of label wil je band toevoegen. Open Jouw pagina\'s om te antwoorden.' },
          accepted: { subject: 'Een band heeft je verzoek geaccepteerd', body: 'Een band heeft je roster- of labelverzoek geaccepteerd.' },
          declined: { subject: 'Een band heeft je verzoek afgewezen', body: 'Een band heeft je roster- of labelverzoek afgewezen.' },
        },
      },
      organization_claim: {
        subject: 'Je claim op een pagina is beoordeeld',
        body: 'Een beheerder heeft je claim op een pagina beoordeeld.',
        cases: {
          approved: { subject: 'Je claim op een pagina is goedgekeurd', body: 'Je claim is goedgekeurd. Je beheert nu de pagina.' },
          rejected: { subject: 'Je claim op een pagina is niet goedgekeurd', body: 'Je claim op een pagina is niet goedgekeurd.' },
        },
      },
      points_earned: {
        subject: 'Je hebt punten verdiend op Every.music',
        body: {
          count: 'points',
          one: 'Je hebt {points} punt verdiend. Besteed punten aan Premium-dagen, boosts en vastgezette berichten via je portemonnee.',
          other: 'Je hebt {points} punten verdiend. Besteed punten aan Premium-dagen, boosts en vastgezette berichten via je portemonnee.',
        },
      },
      event_published: { subject: 'Een nieuw evenement van iemand die je volgt', body: 'Een pagina of artiest die je volgt heeft een nieuw evenement geplaatst.' },
      event_lineup: { subject: 'Je staat op de line-up van een evenement', body: 'Je bent toegevoegd aan de line-up van een evenement.' },
      event_reminder: { subject: 'Een evenement begint binnenkort', body: 'Een evenement waarvoor je een herinnering hebt ingesteld begint binnenkort.' },
      event_communication: {
        subject: 'Een officiële update over een evenement',
        body: 'De organisator van een evenement waar je naartoe gaat heeft een officiële update geplaatst.',
        cases: {
          cancellation: { subject: 'Een evenement waar je naartoe gaat is geannuleerd', body: 'De organisator heeft een evenement waar je naartoe gaat geannuleerd. Open Every.music voor details.' },
          postponement: { subject: 'Een evenement waar je naartoe gaat is uitgesteld', body: 'De organisator heeft een evenement waar je naartoe gaat uitgesteld. Open Every.music voor de nieuwe datum.' },
        },
      },
      calendar_invite: {
        subject: 'Je agenda is gewijzigd',
        body: 'Er is een wijziging in je agenda.',
        cases: {
          invited: { subject: 'Je bent uitgenodigd voor een agenda-item', body: 'Je bent uitgenodigd voor een repetitie, optreden of ander agenda-item. Open Every.music om te antwoorden.' },
          created: { subject: 'Nieuw item in je bandagenda', body: 'Een bandlid heeft een item toegevoegd aan je bandagenda.' },
          updated: { subject: 'Een agenda-item is bijgewerkt', body: 'Een agenda-item dat je kunt zien is bijgewerkt.' },
          cancelled: { subject: 'Een agenda-item is geannuleerd', body: 'Een agenda-item dat je kunt zien is geannuleerd.' },
          removed: { subject: 'Een agenda-item is verwijderd', body: 'Een agenda-item dat je kon zien is verwijderd.' },
        },
      },
      calendar_reminder: { subject: 'Agendaherinnering', body: 'Een agenda-item waarvoor je een herinnering hebt ingesteld begint binnenkort.' },
      band_message: { subject: 'Nieuwe berichten in je bandchat', body: 'Er zijn nieuwe berichten in een van je bandchats. Open Every.music om ze te lezen.' },
      review_received: { subject: 'Je hebt een recensie ontvangen om goed te keuren', body: 'Iemand heeft een recensie over je profiel geschreven. Recensies verschijnen pas op je profiel nadat je ze hebt goedgekeurd.' },
      review_approved: { subject: 'Je recensie is goedgekeurd', body: 'Een muzikant heeft je recensie goedgekeurd, dus die staat nu op diens profiel.' },
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
      subscription_started: { subject: 'Il tuo piano Every.music è attivo', body: 'Grazie per sostenere Every.music. Il tuo piano a pagamento è ora attivo.' },
      subscription_ended: { subject: 'Il tuo piano Every.music è terminato', body: 'Sei tornato al piano gratuito. Puoi abbonarti di nuovo in qualsiasi momento.' },
      payment_failed: { subject: 'Un pagamento per il tuo piano Every.music non è riuscito', body: 'Aggiorna il metodo di pagamento in Gestisci fatturazione per mantenere il piano.' },
      application_received: { subject: 'Qualcuno si è candidato al tuo annuncio', body: 'Un musicista si è candidato a uno dei tuoi annunci. Apri Every.music per esaminare la candidatura.' },
      application_status: {
        subject: 'La tua candidatura è stata aggiornata',
        body: 'Chi ha pubblicato un annuncio ha aggiornato la tua candidatura. Apri Every.music per vederla.',
        cases: {
          shortlisted: { subject: 'La tua candidatura è in selezione', body: 'Chi ha pubblicato un annuncio ha messo la tua candidatura in selezione.' },
          accepted: { subject: 'La tua candidatura è stata accettata', body: 'Chi ha pubblicato un annuncio ha accettato la tua candidatura. Apri Every.music per metterti in contatto.' },
          declined: { subject: 'La tua candidatura è stata rifiutata', body: 'Chi ha pubblicato un annuncio ha rifiutato la tua candidatura. Ogni giorno vengono pubblicati nuovi annunci.' },
        },
      },
      listing_expiring: { subject: 'Il tuo annuncio nel mercatino scade presto', body: 'Uno dei tuoi annunci nel mercatino scade presto. Apri Every.music per rinnovarlo se è ancora disponibile.' },
      listing_removed: { subject: 'Un moderatore ha rimosso il tuo annuncio nel mercatino', body: 'Un moderatore ha rimosso uno dei tuoi annunci nel mercatino dopo aver esaminato una segnalazione.' },
      security_alert: {
        subject: 'Avviso di sicurezza per il tuo account Every.music',
        body: "C'è stata una modifica di sicurezza sul tuo account. Se non sei stato tu, cambia la password ed esci da tutti i dispositivi.",
        cases: {
          two_factor_enabled: { subject: 'La verifica in due passaggi è stata attivata', body: 'La verifica in due passaggi ora è attiva sul tuo account. Se non sei stato tu, cambia subito la password.' },
          two_factor_disabled: { subject: 'La verifica in due passaggi è stata disattivata', body: 'La verifica in due passaggi ora è disattivata sul tuo account. Se non sei stato tu, cambia la password e riattivala.' },
          recovery_code_used: { subject: 'È stato usato un codice di recupero', body: 'È stato usato un codice di recupero per accedere al tuo account. Se non sei stato tu, cambia la password ed esci da tutti i dispositivi.' },
          recovery_codes_regenerated: { subject: 'Sono stati creati nuovi codici di recupero', body: 'Sono stati creati nuovi codici di recupero per il tuo account e quelli vecchi non funzionano più. Se non sei stato tu, cambia la password.' },
          sessions_revoked: { subject: 'Sei uscito da tutti i dispositivi', body: 'Il tuo account è stato disconnesso da tutti i dispositivi. Se non sei stato tu, cambia la password.' },
        },
      },
      verification_requested: {
        subject: 'Una nuova richiesta di verifica è in attesa',
        body: "Un musicista ha richiesto la verifica del profilo. Apri l'area di amministrazione per esaminarla.",
        cases: { organization: { body: "Una pagina ha richiesto la verifica. Apri l'area di amministrazione per esaminarla." } },
      },
      verification_decided: {
        subject: 'La tua richiesta di verifica è stata esaminata',
        body: 'Un amministratore ha esaminato la tua richiesta di verifica.',
        cases: {
          approved: { subject: 'La tua richiesta di verifica è stata approvata', body: 'La tua richiesta di verifica è stata approvata. Accanto al nome ora compare il badge di verifica.' },
          rejected: { subject: 'La tua richiesta di verifica non è stata approvata', body: 'La tua richiesta di verifica non è stata approvata. Apri Every.music per vedere cosa puoi fare ora.' },
        },
      },
      saved_search_match: { subject: 'Un nuovo annuncio corrisponde alla tua ricerca salvata', body: 'Un nuovo annuncio corrisponde a una delle tue ricerche salvate.' },
      support_reply: { subject: 'Il team ha risposto alla tua richiesta di assistenza', body: 'Il team di Every.music ha risposto a una delle tue richieste di assistenza. Apri Every.music per leggere la risposta.' },
      organization_invitation: { subject: 'Sei stato invitato a unirti a una pagina', body: 'Qualcuno ti ha invitato a unirti alla pagina di una band o di un\'organizzazione. Apri Le tue pagine per accettare o rifiutare.' },
      organization_membership: {
        subject: 'La tua partecipazione a una pagina è cambiata',
        body: "C'è una modifica a una delle pagine di cui fai parte.",
        cases: {
          accepted: { subject: 'Il tuo invito è stato accettato', body: 'Un musicista ha accettato il tuo invito a unirsi a una pagina.' },
          declined: { subject: 'Il tuo invito è stato rifiutato', body: 'Un musicista ha rifiutato il tuo invito a unirsi a una pagina.' },
          removed: { subject: 'Non fai più parte di una pagina', body: "Sei stato rimosso dalla pagina di una band o di un'organizzazione." },
          leader: { subject: 'Ora sei il leader di una pagina', body: "Ora sei il leader della pagina di una band o di un'organizzazione." },
        },
      },
      organization_update: {
        subject: 'Una pagina che segui ha delle novità',
        body: "La pagina di una band o di un'organizzazione che segui ha pubblicato un aggiornamento.",
        cases: {
          announcement: { subject: 'Una pagina che segui ha pubblicato un annuncio', body: "La pagina di una band o di un'organizzazione che segui ha pubblicato un nuovo annuncio." },
          release: { subject: 'Una pagina che segui ha una nuova uscita', body: "La pagina di una band o di un'organizzazione che segui ha condiviso una nuova uscita." },
          youtube: { subject: 'Una pagina che segui ha un nuovo video', body: "La pagina di una band o di un'organizzazione che segui ha condiviso un nuovo video." },
        },
      },
      organization_relation: {
        subject: 'Una richiesta di roster o etichetta è stata aggiornata',
        body: "C'è un aggiornamento su una richiesta di roster o etichetta.",
        cases: {
          pending: { subject: 'Una pagina vuole lavorare con la tua band', body: 'Un\'agenzia di booking o un\'etichetta vuole aggiungere la tua band. Apri Le tue pagine per rispondere.' },
          accepted: { subject: 'Una band ha accettato la tua richiesta', body: 'Una band ha accettato la tua richiesta di roster o etichetta.' },
          declined: { subject: 'Una band ha rifiutato la tua richiesta', body: 'Una band ha rifiutato la tua richiesta di roster o etichetta.' },
        },
      },
      organization_claim: {
        subject: 'La tua rivendicazione di una pagina è stata esaminata',
        body: 'Un amministratore ha esaminato la tua rivendicazione di una pagina.',
        cases: {
          approved: { subject: 'La tua rivendicazione di una pagina è stata approvata', body: 'La tua rivendicazione è stata approvata. Ora gestisci la pagina.' },
          rejected: { subject: 'La tua rivendicazione di una pagina non è stata approvata', body: 'La tua rivendicazione di una pagina non è stata approvata.' },
        },
      },
      points_earned: {
        subject: 'Hai guadagnato punti su Every.music',
        body: {
          count: 'points',
          one: 'Hai guadagnato {points} punto. Usa i punti per giorni Premium, promozioni e annunci in evidenza dal tuo portafoglio.',
          other: 'Hai guadagnato {points} punti. Usa i punti per giorni Premium, promozioni e annunci in evidenza dal tuo portafoglio.',
        },
      },
      event_published: { subject: 'Un nuovo evento da qualcuno che segui', body: 'Una pagina o un artista che segui ha pubblicato un nuovo evento.' },
      event_lineup: { subject: 'Sei stato aggiunto alla line-up di un evento', body: 'Sei stato aggiunto alla line-up di un evento.' },
      event_reminder: { subject: 'Un evento inizia presto', body: 'Un evento per cui hai impostato un promemoria inizia presto.' },
      event_communication: {
        subject: 'Un aggiornamento ufficiale su un evento',
        body: "L'organizzatore di un evento a cui partecipi ha pubblicato un aggiornamento ufficiale.",
        cases: {
          cancellation: { subject: 'Un evento a cui partecipi è stato annullato', body: "L'organizzatore ha annullato un evento a cui partecipi. Apri Every.music per i dettagli." },
          postponement: { subject: 'Un evento a cui partecipi è stato rinviato', body: "L'organizzatore ha rinviato un evento a cui partecipi. Apri Every.music per la nuova data." },
        },
      },
      calendar_invite: {
        subject: 'Il tuo calendario è cambiato',
        body: "C'è una modifica nel tuo calendario.",
        cases: {
          invited: { subject: 'Sei stato invitato a un appuntamento', body: 'Sei stato invitato a una prova, un concerto o un altro appuntamento. Apri Every.music per rispondere.' },
          created: { subject: 'Nuovo appuntamento nel calendario della band', body: 'Un membro della band ha aggiunto un appuntamento al calendario della band.' },
          updated: { subject: 'Un appuntamento è stato aggiornato', body: 'Un appuntamento che puoi vedere è stato aggiornato.' },
          cancelled: { subject: 'Un appuntamento è stato annullato', body: 'Un appuntamento che puoi vedere è stato annullato.' },
          removed: { subject: 'Un appuntamento è stato rimosso', body: 'Un appuntamento che potevi vedere è stato rimosso.' },
        },
      },
      calendar_reminder: { subject: 'Promemoria del calendario', body: 'Un appuntamento per cui hai impostato un promemoria inizia presto.' },
      band_message: { subject: 'Nuovi messaggi nella chat della band', body: 'Ci sono nuovi messaggi in una delle chat delle tue band. Apri Every.music per leggerli.' },
      review_received: { subject: 'Hai ricevuto una recensione da approvare', body: 'Qualcuno ha recensito il tuo profilo. Le recensioni compaiono sul tuo profilo solo dopo che le hai approvate.' },
      review_approved: { subject: 'La tua recensione è stata approvata', body: 'Un musicista ha approvato la tua recensione, che ora compare sul suo profilo.' },
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

export const notificationTemplates = messages;

function chooseCase(kind, template, params) {
  for (const name of NOTIFICATION_SELECTORS[kind] ?? []) {
    const value = params && typeof params === 'object' ? params[name] : undefined;
    if (typeof value === 'string' && template.cases && Object.hasOwn(template.cases, value)) {
      return { ...template, ...template.cases[value] };
    }
  }
  return template;
}

// Localized subject, body, and detail lines for a notification kind. Unknown
// kinds and incomplete params use the generic fallback text.
export function notificationMessage({ kind, params, locale }) {
  const language = EMAIL_LOCALES.includes(locale) ? locale : 'en';
  const catalog = messages[language];
  const numbers = numericParams(params);
  const known = Object.hasOwn(catalog.kinds, kind) ? catalog.kinds[kind] : null;
  const template = known && chooseCase(kind, known, params);
  const subject = (template && fill(language, template.subject, numbers)) ?? catalog.fallback.subject;
  const body = (template && fill(language, template.body, numbers)) ?? catalog.fallback.body;
  const lines = (template?.lines ?? []).map(line => fill(language, line, numbers));
  const details = lines.every(line => line !== null) ? lines : [];
  return { language, catalog, subject, body, details };
}

// Generic Web Push and native push text in the recipient's language.
export function composeNotificationPush({ kind, params, locale }) {
  const { language, subject, body, details } = notificationMessage({ kind, params, locale });
  return { title: subject, body: details.length ? `${body} ${details.join(', ')}` : body, locale: language };
}

export function composeNotificationEmail({ kind, params, link, locale, origin }) {
  const { language, catalog, subject, body, details } = notificationMessage({ kind, params, locale });
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
