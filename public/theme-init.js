(() => {
  const consent = localStorage.getItem('tify_storage_consent_v1');
  const persistentTheme = consent === 'functional' ? localStorage.getItem('tify_ui_theme') : null;
  const sessionTheme = sessionStorage.getItem('tify_ui_theme');
  const savedTheme = persistentTheme || sessionTheme;
  const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : systemTheme;

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
