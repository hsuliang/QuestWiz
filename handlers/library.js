import * as ui from '../ui.js';
import * as state from '../state.js';
import { elements } from '../dom.js';
import { uploadQuizToLibrary, fetchQuizzes, incrementDownloadCount, deleteQuiz } from '../db.js';
import { handleError } from '../utils/errorHandler.js'; // [Fix] Correct path

export async function refreshLibrary() {
    try {
        ui.showLibraryLoader();
        console.log('[Library] Start fetching quizzes...'); // [Debug]

        const filters = {
            domain: elements.libDomainSelect ? elements.libDomainSelect.value : '全部',
            grade: elements.libGradeSelect ? elements.libGradeSelect.value : '全部',
            issue: elements.libIssueSelect ? elements.libIssueSelect.value : '全部',
            publisher: elements.libPublisherSelect ? elements.libPublisherSelect.value : '全部'
        };

        const result = await fetchQuizzes(filters);
        console.log('[Library] Fetched result:', result); // [Debug]

        ui.renderLibraryQuizzes(result.quizzes, handleImportQuiz, handleDeleteQuiz);
    } catch (error) {
        console.error('[Library] Fetch error:', error);
        handleError(error, 'RefreshLibrary');
        if (elements.libQuizList) {
            elements.libQuizList.innerHTML = `<p class="text-center text-red-500 py-10">載入失敗：${error.message}</p>`;
        }
    }
}

export async function handleUploadModalOpen() {
    const questions = state.getGeneratedQuestions();
    if (!questions || questions.length === 0) {
        ui.showToast('沒有可上傳的題目', 'error');
        return;
    }
    ui.toggleUploadModal(true);
}

export async function handleUploadSubmit(event) {
    event.preventDefault();
    const author = document.getElementById('upload-author').value;
    const domain = document.getElementById('upload-domain').value;
    const grade = document.getElementById('upload-grade').value;
    const unit = document.getElementById('upload-unit').value;
    const publisher = document.getElementById('upload-publisher').value;
    const issue = document.getElementById('upload-issue').value;

    // Determine source type based on active tab
    let currentType = 'text';
    let contentToUpload = elements.textInput?.value || '';

    if (document.getElementById('tab-image')?.classList.contains('active')) {
        currentType = 'image';
        // 圖片模式下，不將內容上傳至 sourceContent (避免 Base64 塞爆資料庫)
        contentToUpload = '[圖片來源]'; 
    } else if (document.getElementById('tab-url')?.classList.contains('active')) {
        currentType = 'url';
    } else if (document.getElementById('tab-ai')?.classList.contains('active')) {
        currentType = 'ai';
    }

    const quizData = {
        author, domain, grade, unit, publisher, issue,
        questions: state.getGeneratedQuestions(),
        sourceContent: contentToUpload,
        sourceUrl: elements.urlInput?.value || '',
        sourceType: currentType,
        settings: { 
            questionStyle: elements.questionStyleSelect?.value,
            difficulty: elements.difficultySelect?.value
        }
    };

    try {
        await uploadQuizToLibrary(quizData);
        ui.toggleUploadModal(false);
        ui.showToast('上傳成功！正在前往題庫大廳...', 'success');
        
        // 1. 自動切換到題庫分頁
        ui.switchWorkTab('library');
        
        // 2. 重新整理列表 (加入微小延遲以確保 Firestore 索引更新)
        setTimeout(() => refreshLibrary(), 500);
        
        // 注意：這裡絕對不呼叫 clearAllInputs()，保留編輯區內容給使用者看
    } catch (error) {
        handleError(error, 'UploadQuiz');
    }
}

export function handleImportQuiz(quiz) {
    if (!confirm(`確定要匯入「${quiz.unit}」嗎？目前的內容將被覆蓋。`)) return;
    
    // 1. 還原題目
    state.setGeneratedQuestions(quiz.questions);
    ui.renderQuestionsForEditing(quiz.questions);
    ui.applyImportedData(quiz);
    
    // 2. 還原原始內容 (如果有)
    if (quiz.sourceType === 'image') {
        ui.showToast('來源為圖片，無法還原原始圖檔', 'info');
        // 切換到圖片分頁讓使用者知道
        ui.switchTab('input', 1); // 假設 index 1 是圖片
    } else if (quiz.sourceType === 'url' && quiz.sourceUrl) {
        if (elements.urlInput) elements.urlInput.value = quiz.sourceUrl;
        ui.switchTab('input', 2); // 假設 index 2 是網址
        ui.showToast('已還原原始網址', 'success');
    } else if (quiz.sourceContent) {
        if (elements.textInput) elements.textInput.value = quiz.sourceContent;
        ui.switchTab('input', 0); // 預設文字分頁
        ui.showToast('已還原原始文章', 'success');
    }

    incrementDownloadCount(quiz.id);
    ui.switchWorkTab('edit');
}

export async function handleDeleteQuiz(quizId) {
    if (!confirm('確定要刪除此題庫嗎？此動作無法復原。')) return;
    try {
        await deleteQuiz(quizId);
        ui.showToast('刪除成功', 'success');
        refreshLibrary();
    } catch (error) {
        handleError(error, 'DeleteQuiz');
    }
}

export function handleLibraryFilterChange() {
    refreshLibrary();
}
