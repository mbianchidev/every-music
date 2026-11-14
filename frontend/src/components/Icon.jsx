const paths = {
  wave: ['M3 9v6M7.5 5v14M12 2v20M16.5 6v12M21 10v4'],
  feed: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
  people: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  message: ['M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'],
  bookmark: ['M6 3h12v18l-6-4-6 4z'],
  post: ['M4 4h10M4 4v16h16V10M14 4l4-2 4 4-2 4-9 9-5 1 1-5z'],
  user: ['M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2', 'M16 5a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  chart: ['M4 3v18h17M9 16v-5M14 16V7M19 16v-9'],
  settings: ['M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  plus: ['M12 5v14M5 12h14'],
  close: ['M6 6l12 12M18 6 6 18'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  search: ['M21 21l-5-5', 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
  location: ['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  globe: ['M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  chevron: ['m9 5 7 7-7 7'],
  filter: ['M4 7h16M7 12h10M10 17h4'],
  arrow: ['M5 12h14m-5-5 5 5-5 5'],
  theme: ['M12 3v18', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
};

export default function Icon({ name, size = 20, className = '' }) {
  if (!paths[name]) throw new Error(`Unknown icon: ${name}`);
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name].map(path => <path key={path} d={path} />)}
    </svg>
  );
}
