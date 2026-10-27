(() => {
  const node = id => document.getElementById(id);
  const article = node('latest-brief');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  function validDate(value) {
    if (!datePattern.test(value || '')) return false;
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  function freshness(date, now = new Date()) {
    const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const today = beijing.toISOString().slice(0, 10);
    if (!validDate(date) || date > today) return { state: 'unknown', text: '暂时无法确认内容日期，请检查更新。' };
    if (date === today) return { state: 'current', text: `今日内容已更新 · 最近成功更新：${date}` };
    if (beijing.getUTCHours() >= 9) return { state: 'overdue', text: `今日内容尚未更新 · 最近成功更新：${date} · 每天北京时间 09:00 开始核验` };
    return { state: 'scheduled', text: `最近成功更新：${date} · 今天北京时间 09:00 开始核验新内容` };
  }
  function briefInfo(element) {
    if (!element) return { date: '', href: '' };
    const link = [...element.querySelectorAll('a')].find(a => /^briefs\/\d{4}-\d{2}-\d{2}\.html$/.test(a.getAttribute('href') || ''));
    const href = link?.getAttribute('href') || '';
    const date = href.match(/\d{4}-\d{2}-\d{2}/)?.[0] || element.querySelector('h1')?.textContent.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
    return { date, href };
  }
  function headlines(element) {
    if (!element) return [];
    return [...element.querySelectorAll('h2')].filter(h => !/降维卡|知识卡/.test(h.textContent)).slice(0, 3).map(h => {
      let sibling = h.nextElementSibling, firstParagraph = '', fact = '';
      while (sibling && !/^H[23]$/.test(sibling.tagName)) {
        if (sibling.tagName === 'P') {
          const text = sibling.textContent.trim();
          if (!firstParagraph) firstParagraph = text;
          if (/^事实|^发生日期|^发布日期/.test(text)) { fact = text; break; }
        }
        sibling = sibling.nextElementSibling;
      }
      const text = fact || firstParagraph;
      return { title: h.textContent.replace(/^\s*\d+[\s、.．]+/, '').trim(), fact: text.length > 180 ? text.slice(0, 180) + '…' : text, anchor: h.id };
    });
  }
  function textElement(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function showHeadlines(target, items, info) {
    if (!target) return;
    target.replaceChildren();
    for (const [index, item] of items.entries()) {
      const card = textElement('article', '', 'news');
      card.append(textElement('span', String(index + 1).padStart(2, '0'), 'num'), textElement('span', `本期简报 · ${info.date || '日期待核验'}`, 'tag'), textElement('h3', item.title), textElement('p', item.fact));
      if (info.href) {
        const link = textElement('a', '查看事实、解释与来源 →');
        link.href = info.href + (item.anchor ? '#' + encodeURIComponent(item.anchor) : '');
        card.append(link);
      }
      target.append(card);
    }
    if (!items.length) target.append(textElement('p', '本期热点尚待更新，可先阅读知识库。', 'small'));
  }
  const info = briefInfo(article);
  const items = headlines(article);
  showHeadlines(node('briefNews'), items, info);
  showHeadlines(node('allNews'), items, info);
  if (node('briefOverviewDate')) node('briefOverviewDate').textContent = `${info.date || '日期待核验'} · 已收录`;
  if (node('hotOverviewDate')) node('hotOverviewDate').textContent = `本期更新：${info.date || '日期待核验'}。把已核验事实与影响解读分开阅读，统计期不等于发布日期。`;
  const latest = (window.dailyKnowledge || []).filter(c => validDate(c.date)).slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latest) {
    const texts = {
      latestLessonDate: `最新知识 · ${latest.date}`,
      latestLessonTitle: latest.title,
      latestLessonSummary: latest.short,
      latestLessonSideTitle: latest.title,
      latestLessonSideSummary: latest.short,
      latestLessonQuestion: `读完“${latest.title}”，你能用自己的生活例子解释它，并说出一个容易误解的地方吗？`
    };
    for (const [id, text] of Object.entries(texts)) if (node(id)) node(id).textContent = text;
  }
  function updateStatus() {
    const status = freshness(info.date);
    const banner = node('contentFreshness');
    if (node('contentFreshnessText')) node('contentFreshnessText').textContent = status.text;
    if (banner) {
      banner.dataset.state = status.state;
      banner.style.background = ['overdue', 'unknown'].includes(status.state) ? '#fff1ce' : '#eaf1e7';
      banner.style.border = ['overdue', 'unknown'].includes(status.state) ? '1px solid #d6a13e' : '1px solid #dce7d8';
    }
  }
  if (node('refreshContent')) node('refreshContent').onclick = () => location.reload();
  updateStatus();
  setInterval(updateStatus, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateStatus(); });
  // Small pure helpers allow date-boundary and content-extraction checks without browser storage or network.
  window.financeContentStatus = { freshness, briefInfo, headlines };
})();
