document.getElementById('scrapeBtn').addEventListener('click', async () => {
  const projectKey = document.getElementById('projectKey').value;
  const statusEl = document.getElementById('status');
  
  if (!projectKey) {
    statusEl.innerText = "Error: Project ID required";
    statusEl.style.color = "#ef4444";
    return;
  }

  statusEl.innerText = "Searching for comments...";
  statusEl.style.color = "#94a3b8";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrapeComments,
  }, (results) => {
    if (results && results[0].result && results[0].result.length > 0) {
      sendToSentimentAI(projectKey, results[0].result);
    } else {
      statusEl.innerText = "No comments found on this page.";
      statusEl.style.color = "#f59e0b";
    }
  });
});

function scrapeComments() {
  const selectors = [
    '.shopee-product-rating__content', 
    '.comment-text', 
    'span[data-comment-text]',
    '.Review-text',
    '.user-review-content'
  ];
  
  let comments = [];
  selectors.forEach(s => {
    document.querySelectorAll(s).forEach(el => {
      const text = el.innerText.trim();
      if (text.length > 5) comments.push(text);
    });
  });
  
  if (comments.length === 0) {
    document.querySelectorAll('p, div').forEach(el => {
      const text = el.innerText.trim();
      if (text.length > 40 && text.length < 300 && el.children.length === 0) {
        comments.push(text);
      }
    });
  }
  
  return [...new Set(comments)].slice(0, 20);
}

async function sendToSentimentAI(key, comments) {
  const statusEl = document.getElementById('status');
  statusEl.innerText = `Syncing ${comments.length} insights...`;
  
  // Update with your actual production backend URL
  const API_URL = `http://localhost:8000/api/collect/${key}`;
  
  let successCount = 0;
  for (const text of comments) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_text: text })
      });
      if (res.ok) successCount++;
    } catch (e) {
      console.error("Sync error:", e);
    }
  }
  
  statusEl.innerText = `Success! ${successCount} items analyzed.`;
  statusEl.style.color = "#10b981";
}
