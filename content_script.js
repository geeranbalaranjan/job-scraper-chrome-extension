(async function() {
  if (window.top !== window.self) return;  // only run in top frame

  const hostname = window.location.hostname;
  const defaultConfigs = {
    'mail.google.com': {
      listSelector: 'div.zA',
      loadMoreSelector: '',
      detailSelectors: [
        { name: 'sender',  selector: 'span.yP' },
        { name: 'subject', selector: 'span.bog' },
        { name: 'snippet', selector: 'span.y2' },
        { name: 'link',    selector: 'div.y6 a' }
      ]
    },
    'linkedin.com': {
      listSelector: 'li.jobs-search-results__list-item',
      loadMoreSelector: 'button.infinite-scroller__show-more-button',
      detailSelectors: [
        { name: 'title',    selector: 'h3.base-search-card__title' },
        { name: 'company',  selector: 'h4.base-search-card__subtitle' },
        { name: 'location', selector: 'span.job-search-card__location' },
        { name: 'link',     selector: 'a.base-card__full-link' }
      ]
    },
    'indeed.com': {
      listSelector: 'a.tapItem',
      loadMoreSelector: '',
      detailSelectors: [
        { name: 'title',    selector: 'h2.jobTitle span'   },
        { name: 'company',  selector: 'span.companyName'   },
        { name: 'location', selector: 'div.companyLocation'},
        { name: 'link',     selector: 'a.tapItem'         }
      ]
    }


  };

  // fetch saved overrides
  const { settings = {} } = await chrome.storage.sync.get('settings');
  let hostSettings = settings[hostname];
  if (!hostSettings) {
    for (const key in defaultConfigs) {
      if (hostname.includes(key)) {
        hostSettings = defaultConfigs[key];
        break;
      }
    }
    if (!hostSettings) {
      hostSettings = { listSelector: '', loadMoreSelector: '', detailSelectors: [] };
    }
  }

  const { listSelector, loadMoreSelector, detailSelectors } = hostSettings;

  if (loadMoreSelector) {
    let prev = -1;
    for (let i = 0; i < 10; i++) {
      const els = listSelector
        ? document.querySelectorAll(listSelector)
        : detailSelectors[0]
          ? document.querySelectorAll(detailSelectors[0].selector)
          : [];
      if (els.length === prev) break;
      prev = els.length;
      const btn = document.querySelector(loadMoreSelector);
      if (!btn) break;
      btn.click();
      await new Promise(r => setTimeout(r, 800));
    }
  }

  // scrape
  const t0 = performance.now();
  const containers = listSelector
    ? Array.from(document.querySelectorAll(listSelector))
    : detailSelectors[0]
      ? Array.from(document.querySelectorAll(detailSelectors[0].selector))
      : [];
  const results = [];
  const seen = new Set();

  containers.forEach(container => {
    const item = {};
    detailSelectors.forEach(({ name, selector }) => {
      let val = '';
      try {
        const el = container.querySelector(selector);
        if (el) {
          if (name.toLowerCase() === 'link' && el.href) {
            val = el.href;
          } else {
            val = el.innerText.trim();
          }
        }
      } catch {}
      item[name] = val;
    });
    // drop empty
    if (!Object.values(item).some(v => v)) return;
    // dedupe
    const key = item.link || JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      results.push(item);
    }
  });

  chrome.runtime.sendMessage({
    action: 'scrapeResults',
    results,
    count: results.length,
    durationMs: Math.round(performance.now() - t0)
  });
})();
