/* theme.js — nebigr-aurora
 * Theme switcher, search modal, code-copy, TOC highlight, lightbox, back-top, mobile nav
 */
(function () {
  'use strict';

  // -------- Force dark mode --------
  document.documentElement.dataset.theme = 'dark';

  // -------- Mobile nav --------
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-nav-toggle]');
    if (btn) {
      var menu = document.getElementById('nav-menu');
      if (menu) menu.classList.toggle('is-open');
      return;
    }
    if (e.target.closest('.nav__menu .nav__link')) {
      var menu2 = document.getElementById('nav-menu');
      if (menu2) menu2.classList.remove('is-open');
    }
  });

  // -------- Search modal --------
  var searchEl = document.getElementById('search');
  var searchInput = document.getElementById('search-input');
  var searchResults = document.getElementById('search-results');
  var searchData = null;
  var searchLoading = false;

  function openSearch() {
    if (!searchEl) return;
    searchEl.classList.add('is-open');
    if (searchInput) setTimeout(function () { searchInput.focus(); }, 150);
    loadSearchData();
  }
  function closeSearch() {
    if (!searchEl) return;
    searchEl.classList.remove('is-open');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-search-open]')) { openSearch(); return; }
    if (e.target === searchEl || e.target.closest('[data-search-close]')) { closeSearch(); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape' && searchEl && searchEl.classList.contains('is-open')) closeSearch();
  });

  function loadSearchData() {
    if (searchData || searchLoading) return;
    var path = searchEl && searchEl.getAttribute('data-search-path');
    if (!path) return;
    searchLoading = true;
    fetch(path).then(function (r) { return r.text(); }).then(function (xml) {
      var doc = new DOMParser().parseFromString(xml, 'text/xml');
      var items = Array.prototype.slice.call(doc.getElementsByTagName('entry'));
      searchData = items.map(function (e) {
        return {
          title:   getText(e, 'title'),
          url:     getText(e, 'url'),
          content: getText(e, 'content').replace(/<[^>]+>/g, '').slice(0, 600)
        };
      });
      searchLoading = false;
      if (searchInput && searchInput.value) doSearch(searchInput.value);
    }).catch(function () { searchLoading = false; });
  }
  function getText(parent, tag) {
    var el = parent.getElementsByTagName(tag)[0];
    return el ? el.textContent : '';
  }
  function doSearch(q) {
    if (!searchResults) return;
    if (!q || q.length < 1) {
      searchResults.innerHTML = '<div class="search__empty">输入关键词开始搜索</div>';
      return;
    }
    if (!searchData) {
      searchResults.innerHTML = '<div class="search__empty">加载中…</div>';
      return;
    }
    var ql = q.toLowerCase();
    var matches = searchData.filter(function (it) {
      return it.title.toLowerCase().includes(ql) || it.content.toLowerCase().includes(ql);
    }).slice(0, 30);
    if (!matches.length) {
      searchResults.innerHTML = '<div class="search__empty">没有找到匹配的内容</div>';
      return;
    }
    searchResults.innerHTML = matches.map(function (it) {
      var snippet = makeSnippet(it.content, q);
      return '<a class="search__result" href="' + it.url + '">'
           +   '<div class="search__result-title">' + highlight(it.title, q) + '</div>'
           +   '<div class="search__result-snippet">' + snippet + '</div>'
           + '</a>';
    }).join('');
  }
  function highlight(s, q) {
    var re = new RegExp('(' + escapeReg(q) + ')', 'ig');
    return escapeHtml(s).replace(re, '<mark>$1</mark>');
  }
  function makeSnippet(content, q) {
    var i = content.toLowerCase().indexOf(q.toLowerCase());
    var start = Math.max(0, i - 40), end = Math.min(content.length, i + q.length + 80);
    var pre = start > 0 ? '…' : '';
    var post = end < content.length ? '…' : '';
    return pre + highlight(content.slice(start, end), q) + post;
  }
  function escapeHtml(s) { return s.replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  if (searchInput) searchInput.addEventListener('input', function (e) { doSearch(e.target.value); });

  // -------- Code copy --------
  function injectCopy() {
    document.querySelectorAll('.post-body pre').forEach(function (pre) {
      if (pre.querySelector('.copy-btn')) return;
      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.textContent = '复制';
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code') || pre;
        var text = code.innerText;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text);
        } else {
          var ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); } catch (_) {}
          ta.remove();
        }
        btn.textContent = '已复制';
        btn.classList.add('is-copied');
        setTimeout(function () { btn.textContent = '复制'; btn.classList.remove('is-copied'); }, 1500);
      });
      pre.appendChild(btn);
    });
  }

  // -------- TOC highlight --------
  function initToc() {
    var toc = document.querySelector('.toc');
    if (!toc) return;
    var links = toc.querySelectorAll('a[href^="#"]');
    if (!links.length) return;
    var byId = {};
    links.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute('href').slice(1));
      byId[id] = a;
    });
    var headings = Array.prototype.slice.call(document.querySelectorAll('.post-body h1[id], .post-body h2[id], .post-body h3[id], .post-body h4[id]'));
    if (!headings.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var a = byId[en.target.id];
        if (!a) return;
        if (en.isIntersecting) {
          links.forEach(function (l) { l.classList.remove('is-active'); });
          a.classList.add('is-active');
        }
      });
    }, { rootMargin: '-30% 0px -55% 0px' });
    headings.forEach(function (h) { io.observe(h); });
  }

  // -------- Lightbox --------
  function initLightbox() {
    var box = document.getElementById('lightbox');
    if (!box) return;
    var img = box.querySelector('img');
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t.tagName === 'IMG' && (t.closest('.post-body') || t.closest('.essay-item__images'))) {
        img.src = t.currentSrc || t.src;
        box.classList.add('is-open');
      } else if (t.closest('#lightbox')) {
        box.classList.remove('is-open');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && box.classList.contains('is-open')) box.classList.remove('is-open');
    });
  }

  // -------- Back-top --------
  function initBackTop() {
    var btn = document.getElementById('back-top');
    if (!btn) return;
    var raf = null;
    function check() {
      if (window.scrollY > 400) btn.classList.add('is-visible');
      else btn.classList.remove('is-visible');
      raf = null;
    }
    window.addEventListener('scroll', function () {
      if (!raf) raf = requestAnimationFrame(check);
    }, { passive: true });
    btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  // -------- Archive infinite scroll --------
  function initArchiveStream() {
    var stream = document.querySelector('.archive-stream');
    if (!stream) return;
    var batch = parseInt(stream.getAttribute('data-batch'), 10) || 12;
    var sentinel = document.getElementById('archive-sentinel');
    var items = Array.prototype.slice.call(stream.querySelectorAll('.archive-reveal'));
    if (!items.length) return;

    // Group by data-idx so the year heading + its first post reveal together.
    var groups = {};
    items.forEach(function (el) {
      var idx = el.getAttribute('data-idx');
      (groups[idx] = groups[idx] || []).push(el);
    });
    var orderedIdx = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; });
    var revealed = 0;

    function revealNext(count) {
      var end = Math.min(orderedIdx.length, revealed + count);
      for (var i = revealed; i < end; i++) {
        groups[orderedIdx[i]].forEach(function (el, j) {
          setTimeout(function () { el.classList.add('is-visible'); }, j * 30 + (i - revealed) * 40);
        });
      }
      revealed = end;
      if (revealed >= orderedIdx.length && sentinel) {
        sentinel.classList.remove('is-active');
        sentinel.style.display = 'none';
      }
    }

    // Initial reveal
    revealNext(batch);
    if (sentinel) sentinel.classList.add('is-active');

    if (revealed < orderedIdx.length && sentinel && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            revealNext(batch);
            if (revealed >= orderedIdx.length) io.disconnect();
          }
        });
      }, { rootMargin: '200px 0px' });
      io.observe(sentinel);
    } else {
      // Reveal all if no IntersectionObserver
      revealNext(orderedIdx.length);
    }
  }

  // -------- Collection inline expand (categories / tags) --------
  function initCollections() {
    document.querySelectorAll('[data-collection]').forEach(function (group) {
      var triggers = group.querySelectorAll('[data-target]');
      if (!triggers.length) return;
      var detail = group.parentElement.querySelector('.collection-detail') || document.querySelector('.collection-detail');

      triggers.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-target');
          var alreadyActive = btn.classList.contains('is-active');

          triggers.forEach(function (b) { b.classList.remove('is-active'); });
          if (detail) detail.querySelectorAll('.collection-panel').forEach(function (p) { p.hidden = true; });

          if (alreadyActive) return; // toggle off

          btn.classList.add('is-active');
          var panel = document.getElementById(id);
          if (panel) {
            panel.hidden = false;
            // re-trigger entrance animation
            panel.style.animation = 'none'; panel.offsetWidth; panel.style.animation = '';
            // smooth scroll into view
            var top = panel.getBoundingClientRect().top + window.scrollY - 80;
            window.scrollTo({ top: top, behavior: 'smooth' });
          }
        });
      });
    });
  }

  // -------- Project repos (GitHub pinned) --------
  function initProjects() {
    var grid = document.getElementById('projects-grid');
    if (!grid) return;
    var user = grid.getAttribute('data-username');
    if (!user) return;
    var exclude = (grid.getAttribute('data-exclude') || '')
      .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);

    var ENDPOINTS = [
      'https://gh-pinned-repos.egoist.dev/?username=' + encodeURIComponent(user),
      'https://pinned.berrysauce.dev/get/' + encodeURIComponent(user)
    ];

    function tryFetch(idx) {
      if (idx >= ENDPOINTS.length) return Promise.reject(new Error('all endpoints failed'));
      return fetch(ENDPOINTS[idx])
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (data) {
          var list = normalize(data, user);
          if (!list.length) throw new Error('empty');
          return list;
        })
        .catch(function () { return tryFetch(idx + 1); });
    }

    tryFetch(0).then(render).catch(showError);

    function normalize(data, user) {
      // egoist: [{ owner, repo, link, description, image, language, languageColor, stars, forks }]
      // berrysauce: [{ owner, name, description, link, language }]
      if (!Array.isArray(data)) return [];
      return data.map(function (r) {
        return {
          owner: r.owner || user,
          name: r.repo || r.name || '',
          desc: r.description || '',
          link: r.link || ('https://github.com/' + (r.owner || user) + '/' + (r.repo || r.name || '')),
          lang: r.language || '',
          color: r.languageColor || '',
          stars: parseInt(r.stars, 10) || 0,
          forks: parseInt(r.forks, 10) || 0
        };
      }).filter(function (r) {
        if (!r.name) return false;
        return exclude.indexOf(r.name.toLowerCase()) === -1;
      });
    }

    function render(repos) {
      grid.innerHTML = repos.map(card).join('');
      if (window.VanillaTilt) {
        VanillaTilt.init(grid.querySelectorAll('.poker-card'), {
          max: 14, glare: true, 'max-glare': 0.32, scale: 1.04,
          speed: 500, perspective: 1400, gyroscope: false
        });
      }
    }

    function showError() {
      grid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:48px;">' +
          '加载 pinned 仓库失败 · ' +
          '<a href="https://github.com/' + escapeHtml(user) + '?tab=repositories" target="_blank" rel="noopener">前往 GitHub →</a>' +
          '<div style="margin-top:8px;font-size:0.82rem;opacity:0.7;">请确保 GitHub 个人主页 pin 了仓库，或检查网络访问 gh-pinned-repos / pinned 服务</div>' +
        '</div>';
    }

    function langSymbol(lang) {
      var map = {
        'JavaScript': '◆', 'TypeScript': '◇', 'Python': '♠', 'HTML': '♥', 'CSS': '♦',
        'Go': '♣', 'Rust': '⚙', 'Java': '☕', 'C': '⚛', 'C++': '⚛', 'C#': '♢',
        'Vue': '△', 'Svelte': '▲', 'Shell': '$', 'PHP': '§', 'Ruby': '♢',
        'Kotlin': 'K', 'Swift': '♤', 'R': '𝐑', 'Jupyter Notebook': '∑',
        'Dart': '◍', 'Lua': '☾', 'Markdown': 'M', 'TeX': 'τ'
      };
      return map[lang] || '◉';
    }

    function langSuit(lang) {
      if (!lang) return 'GH';
      var s = lang.replace(/[^A-Za-z0-9]/g, '');
      if (s.length <= 2) return s.toUpperCase();
      return (s[0] + s[s.length - 1]).toUpperCase();
    }

    function card(r) {
      var color = r.color || 'var(--accent)';
      var stars = '★ ' + (r.stars || 0);
      var suit = langSuit(r.lang);
      var sym = langSymbol(r.lang);
      return '<a class="poker-card" href="' + escapeAttr(r.link) + '" target="_blank" rel="noopener" style="--lang-color: ' + escapeAttr(color) + '">' +
        '<div class="poker-card__corner poker-card__corner--top">' +
          '<span class="poker-card__rank">' + stars + '</span>' +
          '<span class="poker-card__suit">' + escapeHtml(suit) + '</span>' +
        '</div>' +
        '<div class="poker-card__center"><span class="poker-card__symbol">' + sym + '</span></div>' +
        '<div class="poker-card__body">' +
          '<h3 class="poker-card__name">' + escapeHtml(r.name) + '</h3>' +
          '<p class="poker-card__desc">' + escapeHtml(r.desc || '— ' + (r.lang || 'repository')) + '</p>' +
          (r.lang ? '<div class="poker-card__meta">' + escapeHtml(r.lang) + (r.forks ? ' · ⑂ ' + r.forks : '') + '</div>' : '') +
        '</div>' +
        '<div class="poker-card__corner poker-card__corner--bot">' +
          '<span class="poker-card__rank">' + stars + '</span>' +
          '<span class="poker-card__suit">' + escapeHtml(suit) + '</span>' +
        '</div>' +
      '</a>';
    }
    function escapeAttr(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  }

  // -------- Active nav link --------
  function markActiveNav() {
    var path = location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav__link').forEach(function (a) {
      var href = a.getAttribute('href').replace(/\/$/, '') || '/';
      if (href === '/' ? path === '/' : path.indexOf(href) === 0) a.classList.add('is-active');
    });
  }

  // -------- Boot --------
  function boot() {
    injectCopy();
    initToc();
    initLightbox();
    initBackTop();
    markActiveNav();
    initArchiveStream();
    initCollections();
    initProjects();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
