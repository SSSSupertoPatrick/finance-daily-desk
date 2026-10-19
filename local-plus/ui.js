(async () => {
  const byId = id => document.getElementById(id);
  const panel = document.createElement('section'); panel.className = 'notice'; panel.style.marginBottom = '20px';
  panel.innerHTML = '<div class="eyebrow">本机 PLUS 版</div><h3 style="margin:8px 0">使用你的 ChatGPT 套餐</h3><p id="plusStatus">正在检查登录…</p><div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px"><a id="plusLogin" href="/auth/start" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Continue with ChatGPT</a><label id="plusModelLabel" hidden>使用模型 <select id="plusModel" aria-label="ChatGPT可用模型"></select></label><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">管理 ChatGPT 用量 ↗</a><button type="button" id="plusLogout" hidden>退出账号</button></div><p class="small" style="margin-top:12px">搜索通过本机服务发送给 OpenAI，使用已授权的 ChatGPT 套餐。电脑和本机服务需保持运行。用量以 ChatGPT 设置为准。</p>';
  byId('smartSearch').before(panel);
  byId('searchAccess').hidden = true;
  byId('useAI').disabled = true;
  byId('aiState').textContent = '本机 Plus · 等待登录';
  const post = async path => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await response.json(); if (!response.ok) throw Error(data.error); return data;
  };
  try {
    const status = await (await fetch('/api/status', { cache: 'no-store' })).json();
    if (!status.connected) { byId('plusStatus').textContent = status.error || '先连接你的 Plus 账号，然后就能搜索并补齐金融知识。'; byId('searchStatus').textContent = '站内资料可直接搜索；点击 Continue with ChatGPT 连接 Plus，即可获取联网解读。'; return; }
    byId('plusStatus').textContent = `已连接：${status.email || '你的 ChatGPT 账号'} · 使用 ChatGPT 套餐`;
    byId('plusLogin').textContent = '重新登录 ChatGPT'; byId('plusLogout').hidden = false;
    byId('plusLogout').onclick = async () => { try { const result = await post('/api/logout'); byId('plusStatus').textContent = result.message; byId('useAI').checked = false; byId('useAI').disabled = true; byId('plusModelLabel').hidden = true; byId('plusLogout').hidden = true; byId('aiState').textContent = '本机 Plus · 已退出'; } catch (error) { byId('plusStatus').textContent = error.message; } };
    if (status.needsWelcome) {
      const welcome = document.createElement('dialog');
      welcome.innerHTML = '<h2>你正在使用 ChatGPT 套餐</h2><p>知金台中的 AI 搜索会使用你授权的 ChatGPT 套餐额度。你可以在 ChatGPT 设置中管理用量和应用权限。</p><button type="button" class="primary">知道了，继续</button>';
      document.body.append(welcome); welcome.showModal();
      welcome.addEventListener('cancel', event => event.preventDefault());
      await new Promise(resolve => { welcome.querySelector('button').onclick = async () => { await post('/api/welcome'); welcome.close(); resolve(); }; });
    }
    const response = await fetch('/api/models'); const data = await response.json(); if (!response.ok) throw Error(data.error);
    for (const model of data.models) { const option = document.createElement('option'); option.value = model.slug; option.textContent = model.display_name; byId('plusModel').append(option); }
    byId('plusModel').value = data.selected; byId('plusModelLabel').hidden = false;
    byId('useAI').disabled = false; byId('useAI').checked = true; byId('aiState').textContent = '使用 ChatGPT 套餐 · 已连接';
    byId('searchStatus').textContent = '已连接 Plus。输入金融问题，站内资料先展示，GPT 随后补充带来源的解读。';
  } catch (error) { byId('plusStatus').textContent = error.message || '暂时无法连接，请重新登录。'; }
})();
