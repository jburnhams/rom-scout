const BUILD_PLACEHOLDER = '__BUILD_TIME__';

function formatBuildTime(rawTimestamp) {
  try {
    const parsedDate = new Date(rawTimestamp);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    const formatter = new Intl.DateTimeFormat(navigator.language, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    return formatter.format(parsedDate);
  } catch (error) {
    console.warn('Unable to format build timestamp:', error);
    return null;
  }
}

function applyBuildBadges() {
  const buildElements = document.querySelectorAll('[data-build-time]');

  for (const element of buildElements) {
    const rawValue = element.dataset.buildTime;
    if (!rawValue || rawValue === BUILD_PLACEHOLDER) {
      element.textContent = 'Build time unavailable';
      continue;
    }

    const formatted = formatBuildTime(rawValue);
    if (!formatted) {
      element.textContent = 'Build time unavailable';
      continue;
    }

    element.textContent = `Built ${formatted}`;
    element.setAttribute('title', new Date(rawValue).toLocaleString());
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyBuildBadges, {
    once: true
  });
} else {
  applyBuildBadges();
}
