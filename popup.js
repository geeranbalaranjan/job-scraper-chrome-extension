(() => {
  let currentHost = '';
  let currentTabId = null;
  let settingsMap = {};

  const defaultConfigs = {
    'mail.google.com': {
      listSelector: 'div.zA',
      loadMoreSelector: '',
      detailSelectors: [
        { name: 'sender',   selector: 'span.yP'    },
        { name: 'subject',  selector: 'span.bog'   },
        { name: 'snippet',  selector: 'span.y2'    },
        { name: 'link',     selector: 'div.y6 a'   }
      ]
    },
    'linkedin.com': {
      listSelector: 'li.jobs-search-results__list-item',
      loadMoreSelector: 'button.infinite-scroller__show-more-button',
      detailSelectors: [
        { name: 'title',    selector: 'h3.base-search-card__title'    },
        { name: 'company',  selector: 'h4.base-search-card__subtitle' },
        { name: 'location', selector: 'span.job-search-card__location'},
        { name: 'link',     selector: 'a.base-card__full-link'       }
      ]
    },
    'indeed.com': {
      listSelector: 'div[data-testid="jobCard"]',
      loadMoreSelector: '',
      detailSelectors: [
        { name: 'title',    selector: 'h2.jobTitle span'       },
        { name: 'company',  selector: 'span.companyName'       },
        { name: 'location', selector: 'div.companyLocation'    },
        { name: 'link',     selector: 'a.tapItem'             }
      ]
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      currentTabId = tab.id;
      try {
        currentHost = new URL(tab.url).hostname;
      } catch {
        currentHost = '';
      }

      chrome.storage.sync.get('settings', data => {
        settingsMap = data.settings || {};
        const hostSettings =
          settingsMap[currentHost] ||
          Object.entries(defaultConfigs).find(([k]) => currentHost.includes(k))?.[1] ||
          { listSelector: '', loadMoreSelector: '', detailSelectors: [] };

        document.getElementById('list-selector-input').value = hostSettings.listSelector;
        document.getElementById('load-more-selector-input').value = hostSettings.loadMoreSelector;
        document.getElementById('detail-selectors-input').value =
          JSON.stringify(hostSettings.detailSelectors, null, 2);
      });

      setupUI();
      injectContent();
    });
  });

  function setupUI() {
    document.getElementById('change-list')
      .addEventListener('click', () => document.getElementById('settings').classList.remove('hidden'));

    document.getElementById('cancel-settings')
      .addEventListener('click', () => document.getElementById('settings').classList.add('hidden'));

    document.getElementById('save-settings')
      .addEventListener('click', saveSettings);

    document.getElementById('export-csv').addEventListener('click', exportCSV);
    document.getElementById('export-json').addEventListener('click', exportJSON);
    document.getElementById('export-copy').addEventListener('click', exportCopy);

    chrome.runtime.onMessage.addListener(msg => {
      if (msg.action === 'scrapeResults') {
        renderResults(msg.results, msg.count, msg.durationMs);
      }
    });
  }

  function saveSettings() {
    const listSel   = document.getElementById('list-selector-input').value.trim();
    const loadMore  = document.getElementById('load-more-selector-input').value.trim();
    let detailArr;
    try {
      detailArr = JSON.parse(document.getElementById('detail-selectors-input').value);
      if (!Array.isArray(detailArr)) throw new Error('Not an array');
      detailArr.forEach(o => {
        if (typeof o.name !== 'string' || typeof o.selector !== 'string') {
          throw new Error('Each entry needs name & selector');
        }
      });
      document.getElementById('json-error').innerText = '';
    } catch (e) {
      document.getElementById('json-error').innerText = 'Error: ' + e.message;
      return;
    }
    settingsMap[currentHost] = {
      listSelector: listSel,
      loadMoreSelector: loadMore,
      detailSelectors: detailArr
    };
    chrome.storage.sync.set({ settings: settingsMap }, () => {
      document.getElementById('settings').classList.add('hidden');
    });
  }

  function injectContent() {
    document.getElementById('items').innerText    = '...';
    document.getElementById('duration').innerText = '...';
    document.getElementById('no-results').classList.add('hidden');
    document.getElementById('results-table').innerHTML = '';
    chrome.runtime.sendMessage({ action: 'inject', tabId: currentTabId });
  }

  function renderResults(results, count, durationMs) {
    document.getElementById('items').innerText    = count;
    document.getElementById('duration').innerText = durationMs + ' ms';

    const table = document.getElementById('results-table');
    table.innerHTML = '';
    if (!count) {
      document.getElementById('no-results').classList.remove('hidden');
      return;
    }

    // Merge company & location into one field
    const merged = results.map(item => ({
      title: item.title || '',
      'company & location': [item.company, item.location].filter(v => v).join(' | '),
      link: item.link || ''
    }));

    const headerKeys = ['title', 'company & location', 'link'];
    const header = document.createElement('tr');
    headerKeys.forEach(key => {
      const th = document.createElement('th');
      th.innerText = key;
      header.appendChild(th);
    });
    table.appendChild(header);

    // Build data rows
    merged.forEach(item => {
      const tr = document.createElement('tr');
      headerKeys.forEach(key => {
        const td = document.createElement('td');
        if (key === 'link') {
          const a = document.createElement('a');
          a.href       = item.link;
          a.target     = '_blank';
          a.innerText  = item.link;
          td.appendChild(a);
        } else {
          td.innerText = item[key];
        }
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
  }

  function exportCSV() {
    const rows = Array.from(document.querySelectorAll('#results-table tr'))
      .map(r => Array.from(r.cells)
        .map(c => `"${c.innerText.replace(/"/g, '""')}"`)
        .join(',')
      );
    download('results.csv', rows.join('\n'));
  }

  function exportJSON() {
    const headers = ['title', 'company & location', 'link'];
    const data = Array.from(document.querySelectorAll('#results-table tr'))
      .slice(1)
      .map(r => {
        const obj = {};
        Array.from(r.cells).forEach((c, i) => {
          obj[headers[i]] = c.innerText;
        });
        return obj;
      });
    download('results.json', JSON.stringify(data, null, 2));
  }

  function exportCopy() {
    const lines = Array.from(document.querySelectorAll('#results-table tr'))
      .map(r => Array.from(r.cells).map(c => c.innerText).join('\t'));
    navigator.clipboard.writeText(lines.join('\n'));
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})();
