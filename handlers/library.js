import * as ui from '../ui.js';
import * as state from '../state.js';
import { elements } from '../dom.js';
import { uploadQuizToLibrary, fetchQuizzes, incrementDownloadCount, deleteQuiz } from '../db.js';
import { handleError } from '../utils.js';

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

    const quizData = {
        author, domain, grade, unit, publisher, issue,
        questions: state.getGeneratedQuestions(),
        settings: { 
            questionStyle: elements.questionStyleSelect?.value,
            difficulty: elements.difficultySelect?.value
        }
    };

    try {
        await uploadQuizToLibrary(quizData);
        ui.toggleUploadModal(false);
        ui.showToast('上傳成功！', 'success');
        refreshLibrary();
    } catch (error) {
        handleError(error, 'UploadQuiz');
    }
}

export function handleImportQuiz(quiz) {
    if (!confirm(`確定要匯入「${quiz.unit}」嗎？目前的內容將被覆蓋。`)) return;
    
    state.setGeneratedQuestions(quiz.questions);
    ui.renderQuestionsForEditing(quiz.questions);
    ui.applyImportedData(quiz);
    
    incrementDownloadCount(quiz.id);
    ui.switchWorkTab('edit');
    ui.showToast('匯入成功', 'success');
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
