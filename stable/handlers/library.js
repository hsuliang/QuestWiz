import * as ui from '../ui.js';
import * as state from '../state.js';
import { elements } from '../dom.js';
import { uploadQuizToLibrary, fetchQuizzes, incrementDownloadCount, deleteQuiz } from '../db.js';

export async function handleCommunityTabClick() {
    ui.switchWorkTab('library');
    if (elements.libQuizList && elements.libQuizList.children.length <= 1) { 
        await refreshLibrary();
    }
}

export function handleUploadModalOpen() {
    const questions = state.getGeneratedQuestions();
    if (!questions || questions.length === 0) {
        return ui.showToast("請先生成題目後再上傳！", "error");
    }
    ui.toggleUploadModal(true);
}

export async function handleUploadSubmit(e) {
    e.preventDefault();
    const author = elements.uploadAuthor.value.trim();
    const domain = elements.uploadDomain.value;
    const grade = elements.uploadGrade.value;
    const publisher = elements.uploadPublisher.value;
    const unit = elements.uploadUnit.value.trim();
    
    if (!author || !domain || !grade || !unit || !publisher) {
        return ui.showToast("請填寫所有必填欄位", "error");
    }

    const questions = state.getGeneratedQuestions();
    if (!questions || questions.length === 0) return;

    const quizData = {
        title: elements.quizTitleInput ? elements.quizTitleInput.value : unit,
        unit, author, domain, publisher,
        grade: isNaN(Number(grade)) ? grade : Number(grade), // 容錯處理：若是"其他"則存字串
        issue: elements.uploadIssue ? elements.uploadIssue.value : '無',
        questions,
        settings: {
            format: elements.formatSelect.value,
            studentLevel: elements.studentLevelSelect.value,
            difficulty: elements.difficultySelect.value,
            questionType: elements.questionTypeSelect.value,
            questionStyle: elements.questionStyleSelect.value,
            numQuestions: elements.numQuestionsInput.value
        },
        sourceContext: {
            sourceType: state.getUploadedImages().length > 0 ? 'image' : (elements.urlInput.value ? 'url' : 'text'),
            content: state.getUploadedImages().length > 0 ? '圖片生成題目無法還原原始圖片' : (elements.urlInput.value || elements.textInput.value)
        }
    };

    ui.showLoader("正在上傳到題庫...");
    try {
        await uploadQuizToLibrary(quizData);
        ui.showToast("上傳成功！感謝您的分享 ❤️", "success");
        ui.toggleUploadModal(false);
        elements.uploadForm.reset();
        refreshLibrary();
    } catch (error) {
        console.error("上傳失敗:", error);
        ui.showToast("上傳失敗，請稍後再試", "error");
    } finally {
        ui.hideLoader();
    }
}

export async function handleLibraryFilterChange() {
    await refreshLibrary();
}

export async function refreshLibrary() {
    ui.showLibraryLoader();
    const filters = {
        domain: elements.libDomainSelect.value,
        grade: elements.libGradeSelect.value,
        issue: elements.libIssueSelect.value,
        publisher: elements.libPublisherSelect.value
    };

    try {
        const result = await fetchQuizzes(filters);
        ui.renderLibraryQuizzes(result.quizzes, handleImportQuiz, handleDeleteQuiz);
    } catch (error) {
        console.error("載入題庫失敗:", error);
        ui.showToast("無法載入題庫，請檢查網路連線", "error");
    }
}

export function handleImportQuiz(quiz) {
    if (!quiz || !quiz.questions) return;
    
    if (confirm(`確定要匯入「${quiz.unit}」嗎？\n這將會覆蓋您目前編輯區的題目與設定。`)) {
        state.setGeneratedQuestions(quiz.questions);
        ui.renderQuestionsForEditing(quiz.questions);
        ui.initializeSortable();
        
        if (quiz.settings && quiz.sourceContext) {
            ui.applyImportedData(quiz);
        } else {
            if (elements.quizTitleInput) {
                elements.quizTitleInput.value = quiz.unit || quiz.title;
            }
        }
        
        if (quiz.id) {
            incrementDownloadCount(quiz.id);
        }

        ui.showToast("匯入成功！", "success");
        ui.updateRegenerateButtonState(); 
        ui.switchWorkTab('edit');
    }
}

export async function handleDeleteQuiz(quizId) {
    if (!quizId) return;
    if (confirm("您確定要以管理員身分刪除這份題庫嗎？此操作無法復原！")) {
        ui.showLoader("正在刪除題庫...");
        try {
            await deleteQuiz(quizId); 
            ui.showToast("刪除成功！", "success");
            await refreshLibrary(); 
        } catch (error) {
            console.error("刪除失敗:", error);
            ui.showToast(error.message || "刪除失敗，請稍後再試。", "error");
        } finally {
            ui.hideLoader();
        }
    }
}
