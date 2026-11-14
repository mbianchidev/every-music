export default {
  plans: { free: 'Gratis', premium: 'Premium', partner: 'Partner' },
  upgrade: {
    eyebrow: 'Premium-functie',
    how: 'Je huidige abonnement: {plan}. Upgrade naar Premium om dit te ontgrendelen.',
  },
  analytics: {
    upgradeTitle: 'Statistieken van oproepen zijn een Premium-functie',
    upgradeBody: 'Premium toont dagelijkse weergaven, likes, bewaringen en berichten voor je oproepen en profiel. Je toestemming voor statistieken blijft hetzelfde.',
  },
  expiry: {
    label: 'Vervaldatum',
    hintLimited: { one: 'Met je abonnement blijft een oproep maximaal {count} dag online.', other: 'Met je abonnement blijft een oproep maximaal {count} dagen online.' },
    hintUnlimited: 'Optioneel. Laat leeg om de oproep online te houden tot je hem offline haalt.',
    until: 'Online tot {date}',
    open: 'Geen vervaldatum',
  },
  stats: {
    heading: 'Statistieken van de oproep',
    ownerOnly: 'Alleen jij ziet deze cijfers',
    likes: 'Likes',
    dislikes: 'Dislikes',
    views: 'Weergaven',
    saves: 'Bewaard',
    locked: 'Weergaven en bewaringen zijn beschikbaar met Premium.',
  },
  publish: {
    publish: 'Publiceren',
    unpublish: 'Offline halen',
    publishNamed: '{title} publiceren',
    unpublishNamed: '{title} offline halen',
    published: '{title} is gepubliceerd.',
    unpublished: '{title} is nu een privé concept.',
  },
  quota: {
    failed: 'Limieten van je abonnement konden niet worden geladen.',
    activeAnnouncements: {
      limited: { one: '{used} van {limit} actieve oproep gebruikt.', other: '{used} van {limit} actieve oproepen gebruikt.' },
      unlimited: { one: '{count} actieve oproep. Je abonnement heeft geen limiet.', other: '{count} actieve oproepen. Je abonnement heeft geen limiet.' },
      full: 'Haal er een offline of wacht tot er een verloopt voordat je een nieuwe publiceert.',
    },
    savedAnnouncements: {
      limited: { one: '{used} van {limit} bewaarde oproep gebruikt.', other: '{used} van {limit} bewaarde oproepen gebruikt.' },
      unlimited: { one: '{count} bewaarde oproep.', other: '{count} bewaarde oproepen.' },
      full: 'Verwijder er een om een nieuwe te bewaren.',
    },
    savedSearches: {
      limited: { one: '{used} van {limit} opgeslagen zoekopdracht gebruikt.', other: '{used} van {limit} opgeslagen zoekopdrachten gebruikt.' },
      unlimited: { one: '{count} opgeslagen zoekopdracht.', other: '{count} opgeslagen zoekopdrachten.' },
      full: 'Verwijder er een om een nieuwe op te slaan.',
    },
  },
};
