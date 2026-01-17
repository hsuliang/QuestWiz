import { elements } from '../dom.js';
import { QUESTION_STYLE } from '../constants.js';
import * as state from '../state.js';
import { translations } from '../translations.js';
import { showToast } from './components.js';

function t(key) {
    const lang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    return (translations[lang] && translations[lang][key]) ? translations[lang][key] : key;
}

const BLOOM_COLORS = {
    remember: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
    understand: { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-200' },
    apply: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
    analyze: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-200' },
    evaluate: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
    create: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' }
};

// [Helper] 強大的布魯姆層級轉譯器
function getBloomLabel(rawLevel) {
    if (!rawLevel) return '綜合';
    const lower = String(rawLevel).toLowerCase().trim();
    
    const map = {
        'remember': '記憶', 'remembering': '記憶',
        'understand': '理解', 'understanding': '理解',
        'apply': '應用', 'applying': '應用',
        'analyze': '分析', 'analyzing': '分析',
        'evaluate': '評鑑', 'evaluating': '評鑑',
        'create': '創造', 'creating': '創造',
    };
    if (map[lower]) return map[lower];

    if (lower.includes('knowledge') || lower.includes('recall')) return '記憶';
    if (lower.includes('comprehen')) return '理解';
    if (lower.includes('application')) return '應用';
    if (lower.includes('analysis')) return '分析';
    if (lower.includes('evaluation')) return '評鑑';
    if (lower.includes('synthesis') || lower.includes('creative')) return '創造';

    // 如果已經是中文，直接回傳
    if (/[\u4e00-\u9fa5]/.test(rawLevel)) return rawLevel;
    
    return '綜合';
}

/**
 * 建立單一題目卡片 DOM 元素 (組件化核心)
 */
function createQuestionElement(q, index, callbacks = {}) {
    const template = document.getElementById('question-card-template');
    if (!template) return null;

    const fragment = template.content.cloneNode(true);
    const card = fragment.firstElementChild;
    card.dataset.index = index;

    // 1. 填入標題與題號
    const indexDisplay = card.querySelector('.question-index-display');
    if (indexDisplay) indexDisplay.textContent = `${t('question_prefix')} ${index + 1} ${t('question_suffix')}`;

    // 2. 填入布魯姆徽章
    const bloomBadge = card.querySelector('.bloom-badge');
    if (bloomBadge && q.bloomLevel) {
        // [Fixed] 使用強大的轉譯函式確保顯示中文
        const localizedLabel = getBloomLabel(q.bloomLevel);
        const levelKey = q.bloomLevel.toLowerCase().trim().split(' ')[0];
        const color = BLOOM_COLORS[levelKey] || BLOOM_COLORS.understand;
        
        bloomBadge.textContent = localizedLabel;
        bloomBadge.className = `bloom-badge ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-sm ${color.bg} ${color.text} ${color.border}`;
    }

    // 3. 填入題目文字與綁定事件
    const textarea = card.querySelector('.question-text-area');
    if (textarea) {
        textarea.value = q.text || '';
        if (callbacks.onUpdateField) {
            textarea.oninput = (e) => callbacks.onUpdateField(index, 'text', e.target.value);
        }
    }

    // 4. 填入選項
    const optionsContainer = card.querySelector('.options-list');
    const optTemplate = document.getElementById('question-option-template');
    if (optionsContainer && optTemplate) {
        (q.options || []).forEach((opt, optIndex) => {
            const optFragment = optTemplate.content.cloneNode(true);
            const optEl = optFragment.firstElementChild;
            
            const radio = optEl.querySelector('.option-radio');
            if (radio) {
                radio.name = `correct-option-${index}`;
                radio.value = optIndex;
                radio.checked = (Array.isArray(q.correct) ? q.correct : [q.correct]).includes(optIndex);
                if (callbacks.onUpdateCorrect) {
                    radio.onchange = () => callbacks.onUpdateCorrect(index, [optIndex]);
                }
            }

            const optInput = optEl.querySelector('.option-text-input');
            if (optInput) {
                optInput.value = opt;
                optInput.dataset.optIndex = optIndex;
                if (callbacks.onUpdateOption) {
                    optInput.oninput = (e) => callbacks.onUpdateOption(index, optIndex, e.target.value);
                }
            }
            optionsContainer.appendChild(optEl);
        });
    }

    // 5. 綁定按鈕事件
    const copyBtn = card.querySelector('.copy-question-btn');
    if (copyBtn) {
        copyBtn.title = t('toast_copy_success');
        if (callbacks.onCopy) copyBtn.onclick = () => callbacks.onCopy(index);
    }

    const deleteBtn = card.querySelector('.delete-question-btn');
    if (deleteBtn && callbacks.onDelete) {
        deleteBtn.onclick = () => callbacks.onDelete(index);
    }

    return card;
}

export function renderQuestionsForEditing(questions, callbacks = {}) {
    const container = document.getElementById('questions-container');
    if (!container) return;
    
    const placeholder = document.getElementById('preview-placeholder');
    if (placeholder) placeholder.classList.toggle('hidden', questions && questions.length > 0);

    const actions = document.getElementById('preview-actions');
    if (actions) actions.classList.toggle('hidden', !(questions && questions.length > 0));

    // [New] 判定渲染策略
    const currentCards = container.querySelectorAll('.question-card');
    const isGenerating = state.isBusy('generate');

    // 1. 如果是在生成中且數量增加了 -> 使用追加渲染以減少閃爍與卡頓
    if (isGenerating && questions.length > currentCards.length) {
        // 只針對多出來的題目進行追加
        const startIndex = currentCards.length;
        for (let i = startIndex; i < questions.length; i++) {
            const questionEl = createQuestionElement(questions[i], i, callbacks);
            if (questionEl) container.appendChild(questionEl);
        }
        console.log(`[Renderer] Appended ${questions.length - startIndex} new questions.`);
        return;
    }

    // 2. 如果數量沒變（例如編輯中或排序後）且非生成中
    if (!isGenerating && questions.length > 0 && currentCards.length === questions.length) {
        questions.forEach((q, index) => {
            const card = currentCards[index];
            
            // [Fix] 更新題號顯示
            const indexDisplay = card.querySelector('.question-index-display');
            if (indexDisplay) {
                indexDisplay.textContent = `${t('question_prefix')} ${index + 1} ${t('question_suffix')}`;
            }

            const textarea = card.querySelector('.question-text-area');
            if (textarea && textarea.value !== q.text) textarea.value = q.text || '';
            
            const optInputs = card.querySelectorAll('.option-text-input');
            (q.options || []).forEach((opt, optIndex) => {
                if (optInputs[optIndex] && optInputs[optIndex].value !== opt) optInputs[optIndex].value = opt;
            });
        });
        return;
    }
    
    // 3. 數量減少、順序改變或初始渲染 -> 執行完整重繪
    container.innerHTML = '';
    if (!questions) return;
    
    questions.forEach((q, index) => {
        const questionEl = createQuestionElement(q, index, callbacks);
        if (questionEl) container.appendChild(questionEl);
    });
}

export function renderQuizSummary(summaryData) {
    const summaryContainer = document.getElementById('quiz-summary-container');
    if (!summaryContainer) return;
    summaryContainer.innerHTML = '';

    if (!summaryData) return;

    const { questionStyle, difficulty, totalQuestions, distribution, isAutoGenerated } = summaryData;
    const bloomColors = { remember: '#10b981', understand: '#0ea5e9', apply: '#6366f1', analyze: '#ec4899', evaluate: '#f43f5e', create: '#f59e0b' };
    const bloomNames = { remember: '記憶', understand: '理解', apply: '應用', analyze: '分析', evaluate: '評鑑', create: '創造' };

    let barHtml = '';
    let legendHtml = '';
    const sorted = Object.entries(distribution).sort(([a],[b]) => Object.keys(bloomNames).indexOf(a) - Object.keys(bloomNames).indexOf(b));

    for (const [level, count] of sorted) {
        if (count > 0) {
            const pct = (count / totalQuestions) * 100;
            barHtml += `<div title="${bloomNames[level]}" style="width: ${pct}%; background-color: ${bloomColors[level]};"></div>`;
            legendHtml += `<div class="flex items-center"><span class="h-2 w-2 rounded-full mr-1" style="background-color: ${bloomColors[level]}"></span>${bloomNames[level]} (${count})</div>`;
        }
    }

    summaryContainer.innerHTML = `
        <div class="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 shadow-sm mb-6">
            <div class="flex items-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-600 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
                <h4 class="text-sm font-bold text-indigo-900">本次出題摘要分析</h4>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                <div class="bg-white p-2 rounded-md shadow-sm border text-center"><p class="text-gray-500">風格</p><p class="font-semibold">${questionStyle === QUESTION_STYLE.COMPETENCY_BASED ? '素養' : '知識'}</p></div>
                <div class="bg-white p-2 rounded-md shadow-sm border text-center"><p class="text-gray-500">難度</p><p class="font-semibold">${difficulty}</p></div>
                <div class="bg-white p-2 rounded-md shadow-sm border text-center"><p class="text-gray-500">總數</p><p class="font-semibold">${totalQuestions} 題</p></div>
                <div class="bg-white p-2 rounded-md shadow-sm border text-center"><p class="text-gray-500">配置</p><p class="font-semibold">${isAutoGenerated ? '自動' : '手動'}</p></div>
            </div>
            <div class="flex h-3 rounded-full overflow-hidden bg-gray-200 shadow-inner mb-3">${barHtml}</div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-indigo-700 font-medium justify-center">${legendHtml}</div>
        </div>
    `;
}

export function renderLibraryQuizzes(quizzes, onImport, onDelete) {
    const container = elements.libQuizList;
    if (!container) return;
    
    // 強制重置容器樣式與內容
    container.innerHTML = '';
    container.classList.remove('hidden');
    container.style.display = 'block';

    // 建立捲動區域 Wrapper
    const wrapper = document.createElement('div');
    wrapper.className = "flex-grow overflow-y-auto overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm custom-scrollbar";

    if (quizzes.length === 0) {
        wrapper.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p class="text-lg font-medium">沒有找到符合條件的測驗卷</p>
            <p class="text-sm">試著調整篩選條件看看？</p>
        </div>`;
        container.appendChild(wrapper);
        return;
    }

    const table = document.createElement('table');
    table.className = "min-w-full divide-y divide-gray-200";
    
    table.innerHTML = `
        <thead class="bg-gray-50 sticky top-0 z-10 shadow-sm ring-1 ring-gray-200/50">
            <tr>
                <th scope="col" class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-full md:w-auto">單元名稱</th>
                <th scope="col" class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell w-32">領域</th>
                <th scope="col" class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell w-20">年級</th>
                <th scope="col" class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell w-32">作者</th>
                <th scope="col" class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell w-28">資訊</th>
                <th scope="col" class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-20 md:w-24">操作</th>
            </tr>
        </thead>
    `;
    
    const tbody = document.createElement('tbody');
    tbody.className = "bg-white divide-y divide-gray-100";
    
    quizzes.forEach((quiz, index) => {
        const tr = document.createElement('tr');
        tr.className = "group hover:bg-[var(--theme-light)]/20 transition-colors border-b last:border-b-0 border-gray-100 lib-card";
        
        const date = quiz.createdAt ? new Date(quiz.createdAt.seconds * 1000).toLocaleDateString('zh-TW') : '-';
        const qCount = quiz.questions ? quiz.questions.length : 0;
        
        const domainColors = {
            '語文': { bg: 'bg-red-100', text: 'text-red-800' },
            '數學': { bg: 'bg-blue-100', text: 'text-blue-800' },
            '社會': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
            '自然科學': { bg: 'bg-green-100', text: 'text-green-800' },
            '藝術': { bg: 'bg-purple-100', text: 'text-purple-800' },
            '綜合活動': { bg: 'bg-orange-100', text: 'text-orange-800' },
            '科技': { bg: 'bg-cyan-100', text: 'text-cyan-800' },
            '健康與體育': { bg: 'bg-teal-100', text: 'text-teal-800' }
        };
        const dc = domainColors[quiz.domain] || { bg: 'bg-gray-100', text: 'text-gray-800' };
        const issueBadge = (quiz.issue && quiz.issue !== '無') ? `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">#${quiz.issue}</span></div>` : '';

        tr.innerHTML = `
            <td class="px-4 py-3 align-middle">
                <div class="flex flex-col">
                    <span class="font-bold text-gray-800 text-sm md:text-base line-clamp-1 group-hover:themed-accent-text" title="${quiz.unit || quiz.title}">
                        ${quiz.unit || quiz.title}
                    </span>
                    <div class="md:hidden text-xs text-gray-500 mt-1 flex flex-wrap gap-1 items-center">
                        <span class="${dc.text}">${quiz.domain}</span>
                        <span>•</span>
                        <span>${quiz.grade}年級</span>
                        <span>•</span>
                        <span>${quiz.author}</span>
                    </div>
                </div>
            </td>
            <td class="px-4 py-3 align-middle hidden md:table-cell">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${dc.bg} ${dc.text}">${quiz.domain || '未分類'}</span>
                ${issueBadge}
            </td>
            <td class="px-4 py-3 align-middle text-sm text-gray-600 text-center hidden md:table-cell whitespace-nowrap">
                <span class="lib-badge">${quiz.grade} 年級</span>
            </td>
            <td class="px-4 py-3 align-middle text-sm text-gray-600 hidden md:table-cell">
                <div class="flex items-center max-w-[120px]" title="${quiz.author}">
                    <svg class="w-3.5 h-3.5 mr-1.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    <span class="truncate">${quiz.author || '匿名'}</span>
                </div>
            </td>
            <td class="px-4 py-3 align-middle text-xs text-gray-500 whitespace-nowrap hidden sm:table-cell text-right">
                <div>${date}</div>
                <div class="text-gray-400 mt-0.5" title="下載次數">
                    <span class="inline-flex items-center"><svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>${quiz.downloadCount || 0}</span>
                    <span class="mx-1">|</span>
                    <span>${qCount}題</span>
                </div>
            </td>
            <td class="px-4 py-3 align-middle text-right whitespace-nowrap"></td>
        `;
        
        const actionTd = tr.querySelector('td:last-child');
        const btnDiv = document.createElement('div');
        btnDiv.className = "flex items-center justify-end gap-2";
        
        const importBtn = document.createElement('button');
        // 使用 themed-button-primary 確保繼承主題背景與白色文字
        importBtn.className = "themed-button-primary inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-sm font-bold rounded-md text-white shadow-sm transition-all active:scale-95";
        importBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5 md:mr-0 lg:mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg><span class="inline md:hidden lg:inline">匯入</span>';
        importBtn.onclick = () => onImport(quiz);
        btnDiv.appendChild(importBtn);
        importBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5 md:mr-0 lg:mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg><span class="inline md:hidden lg:inline">匯入</span>';
        importBtn.onclick = () => onImport(quiz);
        btnDiv.appendChild(importBtn);

        if (state.isAdminMode()) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = "ml-2 inline-flex items-center justify-center p-2 border border-transparent text-sm font-medium rounded-full text-gray-400 hover:text-white hover:bg-red-500 transition-all";
            deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.995L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>';
            deleteBtn.onclick = () => onDelete(quiz.id);
            btnDiv.appendChild(deleteBtn);
        }
        actionTd.appendChild(btnDiv);
        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);
}
