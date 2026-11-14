export default {
  plans: { free: 'Gratuito', premium: 'Premium', partner: 'Partner' },
  upgrade: {
    eyebrow: 'Funzione Premium',
    how: 'Il tuo piano attuale: {plan}. Passa a Premium per sbloccarla.',
  },
  analytics: {
    upgradeTitle: 'Le statistiche degli annunci sono una funzione Premium',
    upgradeBody: 'Premium mostra ogni giorno visualizzazioni, like, salvataggi e messaggi per i tuoi annunci e il tuo profilo. Le impostazioni di consenso alle statistiche restano invariate.',
  },
  expiry: {
    label: 'Data di scadenza',
    hintLimited: { one: 'Con il tuo piano un annuncio resta online per al massimo {count} giorno.', other: 'Con il tuo piano un annuncio resta online per al massimo {count} giorni.' },
    hintUnlimited: 'Facoltativa. Lascia vuoto per tenere l\'annuncio online finché non lo ritiri.',
    until: 'Online fino al {date}',
    open: 'Nessuna data di scadenza',
  },
  stats: {
    heading: 'Statistiche dell\'annuncio',
    ownerOnly: 'Solo tu vedi questi numeri',
    likes: 'Mi piace',
    dislikes: 'Non mi piace',
    views: 'Visualizzazioni',
    saves: 'Salvataggi',
    locked: 'Visualizzazioni e salvataggi sono disponibili con Premium.',
  },
  publish: {
    publish: 'Pubblica',
    unpublish: 'Ritira',
    publishNamed: 'Pubblica {title}',
    unpublishNamed: 'Ritira {title}',
    published: '{title} è pubblicato.',
    unpublished: '{title} ora è una bozza privata.',
  },
  quota: {
    failed: 'Non è stato possibile caricare i limiti del piano.',
    activeAnnouncements: {
      limited: { one: '{used} di {limit} annuncio attivo usato.', other: '{used} di {limit} annunci attivi usati.' },
      unlimited: { one: '{count} annuncio attivo. Il tuo piano non ha limiti.', other: '{count} annunci attivi. Il tuo piano non ha limiti.' },
      full: 'Ritirane uno o aspetta che uno scada prima di pubblicarne un altro.',
    },
    savedAnnouncements: {
      limited: { one: '{used} di {limit} annuncio salvato usato.', other: '{used} di {limit} annunci salvati usati.' },
      unlimited: { one: '{count} annuncio salvato.', other: '{count} annunci salvati.' },
      full: 'Rimuovine uno per salvarne un altro.',
    },
    savedSearches: {
      limited: { one: '{used} di {limit} ricerca salvata usata.', other: '{used} di {limit} ricerche salvate usate.' },
      unlimited: { one: '{count} ricerca salvata.', other: '{count} ricerche salvate.' },
      full: 'Eliminane una per salvarne un\'altra.',
    },
  },
};
