import { elements } from '../dom.js';
import { QUESTION_STYLE } from '../constants.js';
import * as state from '../state.js';
import { translations } from '../translations.js';
import { showToast } from './components.js';

function t(key) {
    const lang = localStorage.getItem('quizGenLanguage_v1') || 'zh-TW';
    return (translations[lang] && translations[lang][key]) ? translations[lang][key] : key;
}

/**
 * 渲染題目編輯列表 (Event Delegation 版)
 * 這裡只負責產生 HTML，不再進行 addEventListener
 */
export function renderQuestionsForEditing(questions) {
    const questionsContainer = document.getElementById('questions-container');
    const placeholder = document.getElementById('preview-placeholder');
    
    if (!questionsContainer) return;
    questionsContainer.innerHTML = '';

    if (placeholder) {
        if (questions && questions.length > 0) {
            placeholder.classList.add('hidden');
        } else {
            placeholder.classList.remove('hidden');
        }
    }
    
    questions.forEach((q, index) => {
        const card = document.createElement('div');
        card.className = 'question-card bg-gray-50 p-4 rounded-lg shadow-sm border flex gap-x-3 transition-transform duration-300 hover:border-l-indigo-300 hover:-translate-y-0.5';
        card.dataset.index = index;

        let optionsHtml = (q.options || []).map((opt, optIndex) => `
            <div class="flex items-center">
                <label class="option-label w-full flex items-center">
                    <input type="radio" name="correct-option-${index}" class="option-radio" value="${optIndex}" data-action="update-correct" ${(Array.isArray(q.correct) ? q.correct : [q.correct]).includes(optIndex) ? 'checked' : ''}>
                    <input type="text" value="${String(opt).replace(/"/g, '&quot;')}" class="ml-2 flex-grow border border-gray-300 rounded-md p-2 w-full transition focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" data-action="update-option" data-opt-index="${optIndex}">
                </label>
            </div>
        `).join('');

        let aiInsightHtml = '';
        if (elements.questionStyleSelect && elements.questionStyleSelect.value === QUESTION_STYLE.COMPETENCY_BASED && q.design_concept) {
            aiInsightHtml = `
                <div class="relative flex items-center group">
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm-.707 10.607a1 1 0 011.414 0l.707-.707a1 1 0 111.414 1.414l-.707.707a1 1 0 01-1.414 0zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" /></svg>
                    <div class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-gray-800 text-white text-sm rounded-lg shadow-lg z-10 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200">
                        <h5 class="font-bold mb-1 border-b border-gray-600 pb-1">${t('ai_insight_title')}</h5>
                        <p class="text-xs">${q.design_concept}</p>
                    </div>
                </div>`;
        }

        const bloomNames = { remember: '記憶', understand: '理解', apply: '應用', analyze: '分析', evaluate: '評鑑', create: '創造' };
        const levelKey = q.bloomLevel ? q.bloomLevel.toLowerCase().split(' ')[0] : '';
        const bloomBadgeHtml = q.bloomLevel ? `<span class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200 shadow-sm">${bloomNames[levelKey] || q.bloomLevel}</span>` : '';

        card.innerHTML = `
            <div class="drag-handle text-gray-400 hover:text-indigo-600 p-2 flex items-center cursor-grab active:cursor-grabbing">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </div>
            <div class="flex-grow">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center space-x-2">
                         <p class="text-sm font-bold themed-accent-text">${t('question_prefix')} ${index + 1} ${t('question_suffix')}</p>
                         ${bloomBadgeHtml}
                         ${aiInsightHtml}
                    </div>
                    <div class="flex items-center space-x-2">
                       <button class="copy-question-btn text-gray-400 hover:text-indigo-500 transition-colors" title="${t('toast_copy_success')}" data-action="copy">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                       </button>
                       <button class="delete-question-btn text-gray-400 hover:text-red-500 transition-colors" title="刪除題目" data-action="delete">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       </button>
                    </div>
                </div>
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">${t('question_label')}</label>
                        <textarea rows="2" class="question-text border border-gray-300 rounded-md p-2 w-full transition focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" data-action="update-text">${q.text}</textarea>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">${t('options_label')}</label>
                        <div class="space-y-2 options-container">${optionsHtml}</div>
                    </div>
                </div>
            </div>`;
        questionsContainer.appendChild(card);
    });
}

export function renderQuizSummary(summaryData) {
    if (!summaryData) return;
    const existingCard = document.getElementById('quiz-summary-card');
    if (existingCard) existingCard.remove();

    const { questionStyle, difficulty, totalQuestions, distribution, isAutoGenerated } = summaryData;
    const bloomColors = { remember: '#a7f3d0', understand: '#93c5fd', apply: '#818cf8', analyze: '#f9a8d4', evaluate: '#fca5a5', create: '#fde047' };
    const bloomNames = { remember: '記憶', understand: '理解', apply: '應用', analyze: '分析', evaluate: '評鑑', create: '創造' };

    let barHtml = '';
    let legendHtml = '';
    const sortedDistribution = Object.entries(distribution).sort(([keyA], [keyB]) => Object.keys(bloomNames).indexOf(keyA) - Object.keys(bloomNames).indexOf(keyB));

    for (const [level, count] of sortedDistribution) {
        if (count > 0) {
            const percentage = (count / totalQuestions) * 100;
            barHtml += `<div title="${bloomNames[level]} (${count}題)" style="width: ${percentage}%; background-color: ${bloomColors[level]};"></div>`;
            legendHtml += `<div style="display: flex; align-items: center;"><span style="height: 10px; width: 10px; background-color: ${bloomColors[level]}; border-radius: 50%; margin-right: 4px;"></span>${bloomNames[level]} (${count})</div>`;
        }
    }

    const summaryCard = document.createElement('div');
    summaryCard.id = 'quiz-summary-card';
    summaryCard.className = 'mt-6 bg-gray-50 border border-gray-200 border-l-4 border-indigo-500 rounded-lg p-4';
    summaryCard.innerHTML = `
        <div class="flex items-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-600 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fill-rule="evenodd" d="M4 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2H10zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2H10z" clip-rule="evenodd" /></svg>
            <h4 class="text-lg font-bold text-gray-800">本次出題摘要</h4>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div class="bg-white p-2 rounded-md"><p class="text-gray-500">出題風格</p><p class="font-semibold">${questionStyle === QUESTION_STYLE.COMPETENCY_BASED ? '素養導向型' : '知識記憶型'}</p></div>
            <div class="bg-white p-2 rounded-md"><p class="text-gray-500">題目難度</p><p class="font-semibold">${difficulty}</p></div>
            <div class="bg-white p-2 rounded-md"><p class="text-gray-500">總題數</p><p class="font-semibold">${totalQuestions} 題</p></div>
            <div class="bg-white p-2 rounded-md"><p class="text-gray-500">認知層次</p><p class="font-semibold">${isAutoGenerated ? '系統自動配置' : '使用者 指定'}</p></div>
        </div>
        <div class="mt-4">
            <p class="text-gray-500 text-sm mb-2">層次分佈圖：</p>
            <div class="flex h-2.5 rounded-full overflow-hidden bg-gray-200">${barHtml}</div>
            <div class="flex justify-center flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">${legendHtml}</div>
        </div>
    `;
    if (elements.previewActions) elements.previewActions.parentNode.insertBefore(summaryCard, elements.previewActions);
    else if (elements.questionsContainer) elements.questionsContainer.appendChild(summaryCard);
}

export function renderLibraryQuizzes(quizzes, onImport, onDelete) {
    if (!elements.libQuizList) return;
    elements.libQuizList.className = "max-h-[600px] overflow-y-auto overflow-x-auto border border-gray-200 rounded-lg custom-scrollbar bg-white shadow-sm";

    if (quizzes.length === 0) {
        elements.libQuizList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p class="text-lg font-medium">沒有找到符合條件的測驗卷</p>
                <p class="text-sm">試著調整篩選條件看看？</p>
            </div>`;
        return;
    }

    const rowsHtml = quizzes.map((quiz, index) => {
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
        const domainColor = domainColors[quiz.domain] || { bg: 'bg-gray-100', text: 'text-gray-800' };
        const issueBadge = (quiz.issue && quiz.issue !== '無') ? `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">#${quiz.issue}</span></div>` : '';
        const deleteButtonHtml = state.isAdminMode() ? `<button class="delete-quiz-btn ml-2 inline-flex items-center justify-center p-2 border border-transparent text-sm font-medium rounded-full text-gray-400 hover:text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all" data-id="${quiz.id}" title="刪除此題庫"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.995L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>` : '';

        return `
            <tr class="group hover:bg-indigo-50/50 transition-colors border-b last:border-b-0 border-gray-100">
                <td class="px-4 py-3 align-middle">
                    <div class="flex flex-col">
                        <span class="font-bold text-gray-800 text-sm md:text-base line-clamp-1" title="${quiz.unit || quiz.title}">${quiz.unit || quiz.title}</span>
                        <div class="md:hidden text-xs text-gray-500 mt-1 flex flex-wrap gap-1 items-center">
                            <span class="${domainColor.text}">${quiz.domain}</span><span>•</span><span>${quiz.grade}年級</span><span>•</span><span>${quiz.author}</span>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-3 align-middle hidden md:table-cell"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${domainColor.bg} ${domainColor.text}">${quiz.domain || '未分類'}</span>${issueBadge}</td>
                <td class="px-4 py-3 align-middle text-sm text-gray-600 text-center hidden md:table-cell whitespace-nowrap">${quiz.grade} 年級</td>
                <td class="px-4 py-3 align-middle text-sm text-gray-600 hidden md:table-cell"><div class="flex items-center max-w-[120px]" title="${quiz.author}"><span class="truncate">${quiz.author || '匿名'}</span></div></td>
                <td class="px-4 py-3 align-middle text-xs text-gray-500 whitespace-nowrap hidden sm:table-cell text-right"><div>${date}</div><div class="text-gray-400 mt-0.5" title="下載次數">${quiz.downloadCount || 0}次 | ${qCount}題</div></td>
                <td class="px-4 py-3 align-middle text-right whitespace-nowrap">
                    <div class="flex items-center justify-end">
                        <button class="import-quiz-btn inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-all active:scale-95" data-index="${index}">匯入</button>
                        ${deleteButtonHtml}
                    </div>
                </td>
            </tr>`;
    }).join('');

    elements.libQuizList.innerHTML = `<table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50 sticky top-0 z-10 shadow-sm ring-1 ring-gray-200/50"><tr><th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-full md:w-auto">單元名稱</th><th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell w-32">領域</th><th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell w-20">年級</th><th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell w-32">作者</th><th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell w-28">資訊</th><th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-20 md:w-24">操作</th></tr></thead><tbody class="bg-white divide-y divide-gray-100">${rowsHtml}</tbody></table>`;

    elements.libQuizList.querySelectorAll('.import-quiz-btn').forEach(btn => {
        btn.addEventListener('click', () => onImport(quizzes[btn.dataset.index]));
    });
    elements.libQuizList.querySelectorAll('.delete-quiz-btn').forEach(btn => {
        btn.addEventListener('click', (e) => onDelete(e.currentTarget.dataset.id));
    });
}
