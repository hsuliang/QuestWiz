import { CONFIG } from './config.js';

let db = null;
let isInitialized = false;

/**
 * 初始化 Firebase (Lazy load)
 * 只有在真正需要用到資料庫時才執行，避免影響首頁載入速度
 */
async function ensureFirebaseInitialized() {
    if (isInitialized) return db;

    // 動態載入 Firebase SDK
    if (!window.firebase) {
        // 這裡我們依賴 index.html 中透過 CDN 引入的 Firebase SDK
        // 如果 index.html 還沒改，這裡會報錯，所以待會要記得去改 index.html
        throw new Error("Firebase SDK 未載入");
    }

    try {
        const app = window.firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
        db = window.firebase.firestore(app);
        isInitialized = true;
        console.log("Firebase Firestore initialized");
        return db;
    } catch (error) {
        console.error("Firebase initialization error:", error);
        throw error;
    }
}

/**
 * 上傳測驗卷到公開題庫
 * @param {Object} quizData - 包含題目、作者、分類等資訊的物件
 */
export async function uploadQuizToLibrary(quizData) {
    const database = await ensureFirebaseInitialized();
    
    // 加上伺服器時間戳記
    const dataToSave = {
        ...quizData,
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        downloadCount: 0
    };

    try {
        const docRef = await database.collection("public_quizzes").add(dataToSave);
        console.log("Document written with ID: ", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("Error adding document: ", error);
        throw error;
    }
}

/**
 * 從題庫查詢測驗卷
 * @param {Object} filters - 篩選條件 { domain, grade, issue, publisher }
 * @param {number} limit - 抓取數量
 * @param {Object} lastVisible - 用於分頁 (上一頁的最後一筆)
 */
export async function fetchQuizzes(filters = {}, limit = 20, lastVisible = null) {
    const database = await ensureFirebaseInitialized();
    let query = database.collection("public_quizzes");

    // 篩選條件
    if (filters.domain && filters.domain !== '全部') {
        query = query.where("domain", "==", filters.domain);
    }
    
    if (filters.grade && filters.grade !== '全部') {
        query = query.where("grade", "==", Number(filters.grade));
    }

    if (filters.issue && filters.issue !== '無' && filters.issue !== '全部') {
        query = query.where("issue", "==", filters.issue);
    }

    if (filters.publisher && filters.publisher !== '全部') {
        query = query.where("publisher", "==", filters.publisher);
    }

    // 排序：預設依時間倒序
    query = query.orderBy("createdAt", "desc");

    if (lastVisible) {
        query = query.startAfter(lastVisible);
    }

    query = query.limit(limit);

    const snapshot = await query.get();
    const quizzes = [];
    snapshot.forEach(doc => {
        quizzes.push({
            id: doc.id,
            ...doc.data()
        });
    });

    return { quizzes, lastVisible: snapshot.docs[snapshot.docs.length - 1] };
}

/**
 * 增加下載次數計數
 * @param {string} quizId 
 */
export async function incrementDownloadCount(quizId) {
    const database = await ensureFirebaseInitialized();
    const quizRef = database.collection("public_quizzes").doc(quizId);

    try {
        await quizRef.update({
            downloadCount: window.firebase.firestore.FieldValue.increment(1)
        });
    } catch (error) {
        console.error("Error updating download count: ", error);
    }
}

/**
 * [新增] 呼叫雲端函式以刪除指定的題庫
 * @param {string} quizId - 要刪除的文件 ID
 */
export async function deleteQuiz(quizId) {
    const response = await fetch(CONFIG.DELETE_QUIZ_FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': CONFIG.ADMIN_SECRET_KEY
        },
        body: JSON.stringify({ id: quizId })
    });

    if (!response.ok) {
        const errorResult = await response.json();
        throw new Error(errorResult.error || '刪除失敗');
    }

    return await response.json();
}
