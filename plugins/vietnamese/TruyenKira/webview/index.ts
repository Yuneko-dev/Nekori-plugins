void (async () => {
  const reader = window.nekori;
  if (!reader) throw new Error('Reader is unavailable');
  await reader.ready;

  if (document.querySelector('.truyenkira-pages')) {
    document.documentElement.classList.add('truyenkira-manga');
  }
})().catch(error => window.nekori?.error(String(error)));
