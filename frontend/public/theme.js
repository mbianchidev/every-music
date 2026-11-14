(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('everymusic.theme');
    if (['light', 'dark', 'system'].includes(saved)) preference = saved;
  } catch (error) {
    console.warn('Theme preference is unavailable', error);
  }
  const theme = preference === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = theme === 'dark' ? '#090a0d' : '#f6f5f0';
})();
