// === 配置 ===
// 使用本地代理服务器（server.py）转发请求，避免 CORS 跨域限制
// 直接请求远程 API 会被浏览器拦截，改为走本地 /api 前缀代理
const BASE_URL = '/api/v1';

// === 状态管理 ===
let state = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    assignments: [],
    grades: [],
    summary: null,
};

// === 初始化 ===
document.addEventListener('DOMContentLoaded', () => {
    if (state.token && state.user) {
        showMainPage();
    }
    bindEvents();
});

function bindEvents() {
    // 登录表单
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Tab 切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

// === API 请求封装 ===
async function apiRequest(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    const headers = { ...options.headers };

    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    // 如果不是 FormData，默认 JSON
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 204) return null;

        const data = await response.json();

        // 登录态过期或失效：自动清除并返回登录页
        if (response.status === 401 && state.token) {
            handleSessionExpired(data.error?.message);
            throw new Error(data.error?.message || '登录已过期，请重新登录');
        }

        if (!response.ok) {
            const errorMsg = data.error?.message || '请求失败';
            throw new Error(errorMsg);
        }

        return data;
    } catch (err) {
        if (err.message.includes('Failed to fetch')) {
            throw new Error('网络连接失败，请检查网络');
        }
        throw err;
    }
}

// === 登录 ===
async function handleLogin(e) {
    e.preventDefault();
    const identifier = document.getElementById('student-id').value.trim();
    const secret = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    const btn = e.target.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.textContent = '登录中...';
    errorEl.classList.add('hidden');

    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier, secret }),
        });

        state.token = data.access_token;
        state.user = data.user;

        // 持久化
        localStorage.setItem('token', state.token);
        localStorage.setItem('user', JSON.stringify(state.user));

        showMainPage();
    } catch (err) {
        errorEl.textContent = err.message || '登录失败，请检查学号和密钥';
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = '登 录';
    }
}

function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    document.getElementById('login-page').classList.add('active');
    document.getElementById('main-page').classList.remove('active');
    document.getElementById('login-form').reset();
}

// 登录态过期：清除凭据并提示重新登录
function handleSessionExpired(message) {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    document.getElementById('main-page').classList.remove('active');
    document.getElementById('login-page').classList.add('active');
    document.getElementById('login-form').reset();

    const errorEl = document.getElementById('login-error');
    errorEl.textContent = message || '登录已过期，请重新登录';
    errorEl.classList.remove('hidden');
}

// === 页面切换 ===
function showMainPage() {
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('main-page').classList.add('active');

    // 显示用户信息
    document.getElementById('user-info').textContent =
        `${state.user.name}（${state.user.identifier}）`;

    // 加载数据
    loadAssignments();
}

function switchTab(tabName) {
    // 更新按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // 切换内容
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.toggle('active', section.id === `${tabName}-tab`);
    });

    // 加载对应数据
    if (tabName === 'assignments') loadAssignments();
    else if (tabName === 'grades') loadGrades();
    else if (tabName === 'summary') loadSummary();
}

// === 加载作业列表 ===
async function loadAssignments() {
    const container = document.getElementById('assignments-list');
    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
        state.assignments = await apiRequest('/assignments');
        renderAssignments();
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><p>${err.message}</p></div>`;
    }
}

function renderAssignments() {
    const container = document.getElementById('assignments-list');

    if (state.assignments.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>暂无作业</p></div>';
        return;
    }

    container.innerHTML = state.assignments.map(a => {
        const deadline = formatDateTime(a.deadline);
        const isClosed = a.status === 'closed';
        const submitted = a.submission_status?.submitted;
        const isLate = a.submission_status?.is_late;
        const graded = a.grade_status?.published && a.grade_status?.score !== null;

        let statusBadge = '';
        if (isClosed) {
            statusBadge = '<span class="badge badge-closed">已关闭</span>';
        } else {
            statusBadge = '<span class="badge badge-published">进行中</span>';
        }

        let submitBadge = '';
        if (submitted) {
            submitBadge = isLate
                ? '<span class="badge badge-late">迟交</span>'
                : '<span class="badge badge-submitted">已提交</span>';
        } else {
            submitBadge = '<span class="badge badge-unsubmitted">未提交</span>';
        }

        let gradeBadge = '';
        if (graded) {
            gradeBadge = `<span class="badge badge-graded">${a.grade_status.score}/${a.max_score}分</span>`;
        }

        return `
            <div class="assignment-card" onclick="showAssignmentDetail(${a.id})">
                <div class="card-title">${escapeHtml(a.title)}</div>
                <div class="card-meta">
                    <span>⏰ 截止：${deadline}</span>
                    <span>📊 满分：${a.max_score}分</span>
                    ${a.allow_late ? '<span>✅ 允许迟交</span>' : '<span>❌ 不允许迟交</span>'}
                </div>
                <div class="card-footer">
                    <div>${statusBadge} ${submitBadge}</div>
                    <div>${gradeBadge}</div>
                </div>
            </div>
        `;
    }).join('');
}

// === 作业详情 ===
async function showAssignmentDetail(assignmentId) {
    const modal = document.getElementById('assignment-modal');
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');

    modal.classList.remove('hidden');
    modalBody.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const assignment = await apiRequest(`/assignments/${assignmentId}`);
        modalTitle.textContent = assignment.title;

        const isClosed = assignment.status === 'closed';
        const submitted = assignment.submission_status?.submitted;
        const canSubmit = !isClosed;

        let html = `
            <div class="detail-info">
                <div class="detail-info-item">
                    <div class="label">截止时间</div>
                    <div class="value">${formatDateTime(assignment.deadline)}</div>
                </div>
                <div class="detail-info-item">
                    <div class="label">满分</div>
                    <div class="value">${assignment.max_score} 分</div>
                </div>
                <div class="detail-info-item">
                    <div class="label">状态</div>
                    <div class="value">${isClosed ? '已关闭' : '进行中'}</div>
                </div>
                <div class="detail-info-item">
                    <div class="label">迟交</div>
                    <div class="value">${assignment.allow_late ? '允许' : '不允许'}</div>
                </div>
            </div>
        `;

        // 作业描述
        if (assignment.description) {
            html += `
                <div class="detail-section">
                    <h4>作业说明</h4>
                    <p>${escapeHtml(assignment.description).replace(/\n/g, '<br>')}</p>
                </div>
            `;
        }

        // 成绩信息
        if (assignment.grade?.published && assignment.grade?.score !== null) {
            html += `
                <div class="detail-section">
                    <h4>我的成绩</h4>
                    <div class="score-bar">
                        <div class="bar">
                            <div class="bar-fill" style="width: ${(assignment.grade.score / assignment.max_score) * 100}%"></div>
                        </div>
                        <div class="score-text">${assignment.grade.score}/${assignment.max_score}</div>
                    </div>
                    ${assignment.grade.feedback ? `<p style="margin-top:10px;color:#555;">${escapeHtml(assignment.grade.feedback)}</p>` : ''}
                </div>
            `;
        }

        // 提交状态
        if (submitted) {
            html += `
                <div class="detail-section">
                    <h4>提交状态</h4>
                    <p>已提交（版本 ${assignment.submission_status.latest_version}）- ${formatDateTime(assignment.submission_status.submitted_at)}
                    ${assignment.submission_status.is_late ? ' <span class="badge badge-late">迟交</span>' : ''}</p>
                </div>
            `;

            // 加载提交历史
            try {
                const submissions = await apiRequest(`/assignments/${assignmentId}/submissions`);
                if (submissions.length > 0) {
                    html += `
                        <div class="detail-section">
                            <h4>提交历史</h4>
                            <div class="submission-list">
                                ${submissions.map(s => `
                                    <div class="submission-item">
                                        <div class="info">
                                            <span class="version">版本 ${s.version}</span>
                                            <span class="time">${formatDateTime(s.submitted_at)}${s.is_late ? ' (迟交)' : ''}</span>
                                        </div>
                                        <div>
                                            ${s.file ? `<span class="badge badge-published">${s.file.original_name}</span>` : ''}
                                            ${s.text ? `<span class="badge badge-submitted">含文本</span>` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            } catch (e) { /* 忽略 */ }
        }

        // 提交表单
        if (canSubmit) {
            html += `
                <div class="submit-form">
                    <h4>📝 提交作业</h4>
                    <form id="submit-form-${assignmentId}" onsubmit="handleSubmit(event, ${assignmentId})">
                        <div class="form-field">
                            <label>作业文本 / 代码</label>
                            <textarea name="text" placeholder="在此输入作业文本内容或代码（可选，与文件至少填一个）"></textarea>
                        </div>
                        <div class="form-field">
                            <label>作业文件</label>
                            <input type="file" name="file" accept=".txt,.py,.ipynb,.pdf,.zip">
                            <div class="hint">支持格式：.txt、.py、.ipynb、.pdf、.zip（最大 100MB）</div>
                        </div>
                        <div class="form-field">
                            <label>AI 聊天记录（可选）</label>
                            <input type="file" name="LLM_chat_log" accept=".md">
                            <div class="hint">仅支持 .md 格式</div>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn-success">提交作业</button>
                        </div>
                    </form>
                </div>
            `;
        }

        modalBody.innerHTML = html;
    } catch (err) {
        modalBody.innerHTML = `<div class="empty-state"><div class="icon">❌</div><p>${err.message}</p></div>`;
    }
}

// === 提交作业 ===
async function handleSubmit(e, assignmentId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData();

    const text = form.querySelector('[name="text"]').value.trim();
    const fileInput = form.querySelector('[name="file"]');
    const llmInput = form.querySelector('[name="LLM_chat_log"]');

    // 至少需要一个提交内容
    if (!text && (!fileInput.files || fileInput.files.length === 0)) {
        showToast('请至少填写文本或选择文件', 'error');
        return;
    }

    if (text) formData.append('text', text);
    if (fileInput.files.length > 0) formData.append('file', fileInput.files[0]);
    if (llmInput.files.length > 0) formData.append('LLM_chat_log', llmInput.files[0]);

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';

    try {
        const result = await apiRequest(`/assignments/${assignmentId}/submissions`, {
            method: 'POST',
            body: formData,
        });

        showToast(`提交成功！版本 ${result.version}`, 'success');

        // 刷新详情
        showAssignmentDetail(assignmentId);
        loadAssignments();
    } catch (err) {
        showToast(err.message || '提交失败', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '提交作业';
    }
}

// === 加载成绩 ===
async function loadGrades() {
    const container = document.getElementById('grades-list');
    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
        state.grades = await apiRequest('/grades');
        renderGrades();
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><p>${err.message}</p></div>`;
    }
}

function renderGrades() {
    const container = document.getElementById('grades-list');

    if (state.grades.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📊</div><p>暂无已发布成绩</p></div>';
        return;
    }

    const totalScore = state.grades.reduce((sum, g) => sum + g.score, 0);
    const totalMax = state.grades.reduce((sum, g) => sum + g.max_score, 0);
    const avgPercent = ((totalScore / totalMax) * 100).toFixed(1);

    let html = `
        <div class="summary-grid" style="margin-bottom:24px;">
            <div class="summary-card">
                <div class="value">${totalScore}/${totalMax}</div>
                <div class="label">总分</div>
            </div>
            <div class="summary-card">
                <div class="value">${avgPercent}%</div>
                <div class="label">平均得分率</div>
            </div>
            <div class="summary-card">
                <div class="value">${state.grades.length}</div>
                <div class="label">已评分作业数</div>
            </div>
        </div>
        <table class="grade-table">
            <thead>
                <tr>
                    <th>作业</th>
                    <th>得分</th>
                    <th>得分率</th>
                    <th>评语</th>
                    <th>发布时间</th>
                </tr>
            </thead>
            <tbody>
    `;

    state.grades.forEach(g => {
        const percent = ((g.score / g.max_score) * 100).toFixed(1);
        html += `
            <tr>
                <td><strong>${escapeHtml(g.title)}</strong></td>
                <td>${g.score}/${g.max_score}</td>
                <td>
                    <div class="score-bar">
                        <div class="bar"><div class="bar-fill" style="width:${percent}%"></div></div>
                        <span class="score-text">${percent}%</span>
                    </div>
                </td>
                <td style="max-width:200px;font-size:13px;color:#666;">${escapeHtml(g.feedback || '无')}</td>
                <td style="font-size:13px;color:#888;">${formatDateTime(g.published_at)}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// === 加载统计 ===
async function loadSummary() {
    const container = document.getElementById('summary-content');
    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
        state.summary = await apiRequest('/students/me/summary');
        renderSummary();
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><p>${err.message}</p></div>`;
    }
}

function renderSummary() {
    const container = document.getElementById('summary-content');
    const s = state.summary;

    let html = `
        <div class="summary-grid">
            <div class="summary-card">
                <div class="value">${s.assignment_count}</div>
                <div class="label">作业总数</div>
            </div>
            <div class="summary-card">
                <div class="value">${s.submitted_count}</div>
                <div class="label">已提交</div>
            </div>
            <div class="summary-card">
                <div class="value">${s.on_time_count}</div>
                <div class="label">按时提交</div>
            </div>
            <div class="summary-card">
                <div class="value">${s.late_count}</div>
                <div class="label">迟交</div>
            </div>
            <div class="summary-card">
                <div class="value">${s.unsubmitted_count}</div>
                <div class="label">未提交</div>
            </div>
            <div class="summary-card">
                <div class="value">${s.graded_count}</div>
                <div class="label">已评分</div>
            </div>
            <div class="summary-card">
                <div class="value">${s.total_score}/${s.total_max_score}</div>
                <div class="label">总分</div>
            </div>
            <div class="summary-card">
                <div class="value">${s.average_percentage}%</div>
                <div class="label">平均得分率</div>
            </div>
        </div>
    `;

    // 作业明细表
    if (s.assignments && s.assignments.length > 0) {
        html += `
            <h3 style="margin:24px 0 12px;font-size:16px;color:#1a1a2e;">作业明细</h3>
            <table class="grade-table">
                <thead>
                    <tr>
                        <th>作业</th>
                        <th>截止</th>
                        <th>提交状态</th>
                        <th>成绩</th>
                    </tr>
                </thead>
                <tbody>
        `;

        s.assignments.forEach(a => {
            const submitStatus = a.submitted
                ? (a.is_late ? '<span class="badge badge-late">迟交</span>' : '<span class="badge badge-submitted">已提交</span>')
                : '<span class="badge badge-unsubmitted">未提交</span>';
            const score = a.score !== null ? `${a.score}/${a.max_score}` : '-';

            html += `
                <tr>
                    <td><strong>${escapeHtml(a.title)}</strong></td>
                    <td style="font-size:13px;color:#888;">${formatDateTime(a.deadline)}</td>
                    <td>${submitStatus}</td>
                    <td>${score}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
    }

    container.innerHTML = html;
}

// === 模态框 ===
function closeModal() {
    document.getElementById('assignment-modal').classList.add('hidden');
}

// ESC 关闭模态框
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
});

// === 工具函数 ===
function formatDateTime(isoStr) {
    if (!isoStr) return '-';
    const date = new Date(isoStr);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}`;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = '') {
    // 移除已有 toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
