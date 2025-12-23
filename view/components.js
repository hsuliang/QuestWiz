import { elements } from '../dom.js';
import * as state from '../state.js';

/**
 * 顯示提示訊息 (Toast)
 */
export function showToast(message, type = 'success') {
    if (document.getElementById('toast') && document.getElementById('toast-message')) {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        toastMessage.textContent = message;
        toast.className = `fixed bottom-5 right-5 text-white py-2 px-5 rounded-lg shadow-xl opacity-0 transition-opacity duration-300 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
        toast.classList.remove('opacity-0');
        setTimeout(() => { toast.classList.add('opacity-0'); }, 4000);
    }
}

export function showLoader(text = '處理中...') {
    const previewLoader = document.getElementById('preview-loader');
    const loadingText = document.getElementById('loading-text');
    if (previewLoader && loadingText) {
        loadingText.textContent = text;
        previewLoader.classList.remove('hidden');
    }
}

export function hideLoader() {
    const previewLoader = document.getElementById('preview-loader');
    if (previewLoader) {
        previewLoader.classList.add('hidden');
    }
}

export function toggleUploadModal(show) {
    if (!elements.uploadModal) return;
    if (show) {
        elements.uploadModal.classList.remove('hidden');
        if (elements.uploadUnit && elements.quizTitleInput) {
             if (!elements.uploadUnit.value) {
                 elements.uploadUnit.value = elements.quizTitleInput.value;
             }
        }
    } else {
        elements.uploadModal.classList.add('hidden');
    }
}

export function switchWorkTab(tabId) {
    if (!elements.workTabs) return;
    const isLibrary = tabId === 'library';
    const targetIndex = isLibrary ? 1 : 0;

    elements.workTabs.buttons.forEach((btn, idx) => {
        if (idx === targetIndex) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        }
    });

    elements.workTabs.contents.forEach((content, idx) => {
        if (idx === targetIndex) {
            content.classList.remove('hidden');
            content.classList.add('active');
        } else {
            content.classList.add('hidden');
            content.classList.remove('active');
        }
    });
}

export function switchTab(tabGroup, index) {
    const group = elements.tabs[tabGroup];
    if(group) {
        group.buttons.forEach((btn, i) => {
            if(btn) {
                btn.classList.toggle('active', i === index);
                if(tabGroup === 'input') btn.setAttribute('aria-selected', i === index);
            }
        });
        group.contents.forEach((content, i) => {
            if(content) {
                content.classList.toggle('active', i === index);
            }
        });
    }
}

export function showLibraryLoader() {
    if (elements.libQuizList) {
        elements.libQuizList.className = "h-64 flex flex-col items-center justify-center text-gray-500 border rounded-lg bg-gray-50";
        elements.libQuizList.innerHTML = `
            <svg class="animate-spin h-8 w-8 mb-3 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p>正在從雲端載入題庫...</p>`;
    }
}

export function showPromptModal() {
    if (elements.promptModal) elements.promptModal.classList.remove('hidden');
}
export function hidePromptModal() {
    if (elements.promptModal) elements.promptModal.classList.add('hidden');
}

export function showShareModal() {
    if (elements.shareModal) elements.shareModal.classList.remove('hidden');
}
export function hideShareModal() {
    if (elements.shareModal) elements.shareModal.classList.add('hidden');
}

export function showPostDownloadModal() {
    if (elements.postDownloadModal) elements.postDownloadModal.classList.remove('hidden');
    const content = document.getElementById('post-download-modal-content');
    if (content) setTimeout(() => { content.classList.remove('scale-95', 'opacity-0'); }, 10);
}
export function hidePostDownloadModal() {
    const content = document.getElementById('post-download-modal-content');
    if (content) content.classList.add('scale-95', 'opacity-0');
    if (elements.postDownloadModal) setTimeout(() => { elements.postDownloadModal.classList.add('hidden'); }, 200);
}

export function showErrorState(message, retryCallback) {
    if (!elements.previewPlaceholder || !elements.questionsContainer) return;
    elements.previewPlaceholder.classList.add('hidden');
    if (elements.previewPlaceholder.parentElement) elements.previewPlaceholder.parentElement.classList.add('hidden');
    elements.questionsContainer.innerHTML = '';
    const existingError = document.getElementById('error-state-card');
    if (existingError) existingError.remove();

    const errorCard = document.createElement('div');
    errorCard.id = 'error-state-card';
    errorCard.className = 'flex flex-col items-center justify-center p-8 text-center bg-red-50 border border-red-200 rounded-xl max-w-md mx-auto mt-10';
    errorCard.innerHTML = `
        <div class="bg-red-100 p-3 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </div>
        <h3 class="text-lg font-bold text-red-800 mb-2">生成發生錯誤</h3>
        <p class="text-red-600 mb-6 text-sm leading-relaxed">${message}</p>
        <button id="retry-generation-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            重新嘗試
        </button>
    `;
    elements.questionsContainer.appendChild(errorCard);
    const retryBtn = errorCard.querySelector('#retry-generation-btn');
    retryBtn.addEventListener('click', () => {
        errorCard.remove();
        retryCallback();
    });
}
