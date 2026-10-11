const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");

admin.initializeApp();

const db = admin.firestore();
const VISITOR_COUNT_BASE = 15000;

// 全域設定：統一設定區域為 asia-east1
setGlobalOptions({ region: "asia-east1" });

/**
 * 1. 擷取網頁內容 (雙重保險版：Jina -> Local Readability)
 */
exports.extractContentFromUrl = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const { url } = req.body;
    if (!url) return res.status(400).send("Missing URL");

    // 共用的 User-Agent，模擬真實瀏覽器，避免被擋
    const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    console.log(`Attempting to extract content for: ${url}`);

    // --- 策略 A: 嘗試使用 r.jina.ai ---
    try {
        const jinaUrl = `https://r.jina.ai/${url}`;
        console.log(`Strategy A: Calling Jina (${jinaUrl})...`);
        
        const response = await axios.get(jinaUrl, {
            headers: { "User-Agent": USER_AGENT },
            timeout: 10000 // 10秒超時
        });

        const markdownContent = response.data;
        
        // 簡單抓取標題 (Jina 格式通常第一行是 Title: ...)
        let title = "匯入的文章";
        const titleMatch = markdownContent.match(/^Title:\s*(.+)$/m) || markdownContent.match(/^#\s+(.+)$/m);
        if (titleMatch) {
            title = titleMatch[1].trim();
        }

        console.log("Strategy A (Jina) success.");
        return res.status(200).json({ 
            title: title, 
            content: markdownContent,
            source: 'jina'
        });

    } catch (jinaError) {
        console.warn("Strategy A (Jina) failed:", jinaError.message);
        // 繼續執行策略 B
    }

    // --- 策略 B: Fallback 使用本地 JSDOM + Readability ---
    try {
        console.log("Strategy B: Fallback to local Readability...");
        
        const response = await axios.get(url, {
            headers: { "User-Agent": USER_AGENT },
            timeout: 10000 
        });

        const dom = new JSDOM(response.data, { url: url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (article) {
            console.log("Strategy B (Readability) success.");
            return res.status(200).json({ 
                title: article.title || "無標題", 
                content: article.textContent.trim(),
                source: 'readability'
            });
        } else {
            console.warn("Strategy B (Readability) returned null article.");
            // 最後手段：直接抓 body text
            const fallbackContent = dom.window.document.body.textContent.replace(/\s+/g, " ").trim();
            return res.status(200).json({ 
                title: dom.window.document.title || "無標題", 
                content: fallbackContent,
                source: 'raw_text'
            });
        }

    } catch (localError) {
        console.error("All strategies failed.", localError);
        // 回傳詳細錯誤訊息以便除錯
        return res.status(500).json({ 
            error: `擷取失敗。Jina 錯誤: ${localError.message || 'Unknown'}` 
        });
    }
});

/**
 * 2. 儲存分享內容
 */
exports.addContent = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const { text } = req.body;
    if (!text) return res.status(400).send("Missing text");

    try {
      const docRef = await db.collection("shared_contents").add({
        text,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.status(200).json({ id: docRef.id });
    } catch (error) {
      console.error("AddContent error:", error);
      return res.status(500).send("Internal Server Error");
    }
});

/**
 * 3. 取得分享內容 (此函式在 view.html 會用到)
 */
exports.getContent = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
    const { id } = req.query;
    if (!id) return res.status(400).send("Missing ID");

    try {
      const doc = await db.collection("shared_contents").doc(id).get();
      if (!doc.exists) return res.status(404).send("Content not found");
      return res.status(200).json(doc.data());
    } catch (error) {
      console.error("GetContent error:", error);
      return res.status(500).send("Internal Server Error");
    }
});

/**
 * 4. 記錄網站瀏覽次數
 */
exports.trackVisitorCount = onRequest({ cors: true }, async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

    const counterRef = db.collection("site_metrics").doc("visitor_count");
    try {
      const count = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(counterRef);
        const previousCount = Number(snapshot.get("count"));
        const nextCount = snapshot.exists && Number.isFinite(previousCount) && previousCount >= VISITOR_COUNT_BASE
          ? previousCount + 1
          : VISITOR_COUNT_BASE;
        transaction.set(counterRef, {
          count: nextCount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return nextCount;
      });
      return res.status(200).json({ count });
    } catch (error) {
      console.error("TrackVisitorCount error:", error);
      return res.status(500).json({ error: "Unable to update visitor count." });
    }
});

/**
 * 5. 管理員刪除功能
 */
exports.deleteQuizAsAdmin = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const token = (req.get("authorization") || "").match(/^Bearer (.+)$/i)?.[1];
    if (!token) return res.status(401).send({ error: "請先以管理員 Google 帳號登入。" });
    try {
      const identity = await admin.auth().verifyIdToken(token);
      if (identity.email !== "hsuliang@gmail.com" || !identity.email_verified ||
          identity.firebase?.sign_in_provider !== "google.com") {
        return res.status(403).send({ error: "沒有刪除權限。" });
      }
    } catch (error) {
      return res.status(401).send({ error: "登入已失效，請重新登入。" });
    }

    const { id } = req.body;
    if (!id) return res.status(400).send({ error: "Bad Request: Missing document ID." });

    try {
      await db.collection("public_quizzes").doc(id).delete();
      return res.status(200).send({ success: true, message: `Document ${id} deleted.` });
    } catch (error) {
      console.error(`Admin failed to delete document ${id}:`, error);
      return res.status(500).send({ error: "Internal Server Error" });
    }
});
