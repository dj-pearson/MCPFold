/**
 * Client-side docs search (S13.4). Reads the build-time index (window.__DOCS_INDEX__, an array of
 * { title, url, text }) — no fetch, so it works from the static deployment and from file://. Ranks
 * by title vs body match and shows a small results dropdown. DOM is built with textContent so docs
 * content can never inject markup.
 */
(function () {
  var idx = window.__DOCS_INDEX__ || [];
  var input = document.getElementById('docs-search');
  var results = document.getElementById('docs-search-results');
  if (!input || !results) return;

  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    return idx
      .map(function (d) {
        var title = d.title.toLowerCase();
        var body = d.text.toLowerCase();
        var score = 0;
        if (title.indexOf(q) !== -1) score += 10;
        var at = body.indexOf(q);
        if (at !== -1) score += 1;
        var snippet = at !== -1 ? d.text.slice(Math.max(0, at - 30), at + 50) : '';
        return { title: d.title, url: d.url, snippet: snippet, score: score };
      })
      .filter(function (d) {
        return d.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 8);
  }

  function render(list) {
    results.textContent = '';
    if (!input.value.trim()) {
      results.style.display = 'none';
      return;
    }
    if (list.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'sr-empty';
      empty.textContent = 'No matches';
      results.appendChild(empty);
    }
    list.forEach(function (r) {
      var a = document.createElement('a');
      a.className = 'sr';
      a.href = r.url;
      a.setAttribute('data-testid', 'search-result');
      var t = document.createElement('strong');
      t.textContent = r.title;
      var s = document.createElement('span');
      s.textContent = r.snippet;
      a.appendChild(t);
      a.appendChild(s);
      results.appendChild(a);
    });
    results.style.display = 'block';
  }

  input.addEventListener('input', function () {
    render(search(input.value));
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      results.style.display = 'none';
      input.blur();
    }
  });
  document.addEventListener('click', function (e) {
    if (e.target !== input && !results.contains(e.target)) results.style.display = 'none';
  });
})();
