document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const badge = document.getElementById('platformBadge');
  const btn = document.getElementById('harvestBtn');
  const statusEl = document.getElementById('status');

  if (tab.url.includes('play.google.com')) {
    badge.innerText = "Google Play Detected";
    badge.style.background = "#dcfce7";
    badge.style.color = "#15803d";
  } else if (tab.url.includes('apps.apple.com')) {
    badge.innerText = "App Store Detected";
    badge.style.background = "#dbeafe";
    badge.style.color = "#1d4ed8";
  } else {
    badge.innerText = "Unsupported Site";
    btn.disabled = true;
  }

  btn.addEventListener('click', async () => {
    statusEl.innerText = "Harvesting data...";
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeData,
    }, (results) => {
      if (results && results[0].result && results[0].result.length > 0) {
        exportToCSV(results[0].result);
        statusEl.innerText = `Successfully exported ${results[0].result.length} items!`;
        statusEl.style.color = "#10b981";
      } else {
        statusEl.innerText = "No reviews found. Try scrolling down.";
        statusEl.style.color = "#ef4444";
      }
    });
  });
});

function scrapeData() {
  const isGoogle = window.location.href.includes('google.com');
  let data = [];

  if (isGoogle) {
    // Google Play Selectors
    const reviews = document.querySelectorAll('div[ some-selector-for-review-container ]') || document.querySelectorAll('.R9z9p');
    reviews.forEach((el, index) => {
      const text = el.querySelector('.h3YV2d')?.innerText || el.innerText;
      const date = el.querySelector('.bp9Aid')?.innerText || new Date().toLocaleDateString();
      if (text.length > 5) {
        data.push({ id: `gp_${index}_${Date.now()}`, text: text.replace(/,/g, ' '), timestamp: date });
      }
    });
  } else {
    // App Store Selectors
    const reviews = document.querySelectorAll('.we-customer-review');
    reviews.forEach((el, index) => {
      const text = el.querySelector('.we-customer-review__body')?.innerText || "";
      const date = el.querySelector('time')?.getAttribute('datetime') || el.querySelector('.we-customer-review__date')?.innerText;
      if (text.length > 5) {
        data.push({ id: `as_${index}_${Date.now()}`, text: text.replace(/,/g, ' '), timestamp: date });
      }
    });
  }

  // Fallback for dynamic content
  if (data.length === 0) {
     document.querySelectorAll('p').forEach((p, i) => {
        if (p.innerText.length > 50) {
           data.push({ id: `gen_${i}`, text: p.innerText.replace(/,/g, ' '), timestamp: new Date().toISOString() });
        }
     });
  }

  return data.slice(0, 50); // Limit to 50 for demo
}

function exportToCSV(data) {
  const headers = ['id', 'text', 'timestamp'];
  const csvRows = [headers.join(',')];

  for (const row of data) {
    csvRows.push(`${row.id},"${row.text}",${row.timestamp}`);
  }

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `sentiment_harvest_${Date.now()}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
