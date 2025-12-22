const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");

admin.initializeApp();

const db = admin.firestore();

// 重要：請務必將此金鑰替換成您在 config.js 中設定的同一個複雜金鑰！
const ADMIN_SECRET_KEY = "AIzaSyAItStwfaWVIrOXRk5CfufUxLT20cy8E-g";

// 全域設定：統一設定區域為 asia-east1
setGlobalOptions({ region: "asia-east1" });

/**
 * 1. 擷取網頁內容
 */
exports.extractContentFromUrl = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    const { url } = req.body;
    if (!url) return res.status(400).send("Missing URL");

    try {
      const response = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" },
        timeout: 10000 
      });
      const $ = cheerio.load(response.data);
      $("script, style, nav, footer, header").remove();
      const title = $("title").text() || "無標題";
      const content = $("body").text().replace(/\s+/g, " ").trim();
      return res.status(200).json({ title, content });
    } catch (error) {
      console.error("Extraction error:", error);
      return res.status(500).json({ error: "無法擷取內容，請檢查網址是否有效。" });
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
 * 4. 管理員刪除功能
 */
exports.deleteQuizAsAdmin = onRequest({ cors: true }, async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const secret = req.get("x-admin-secret");
    if (secret !== ADMIN_SECRET_KEY) {
      return res.status(403).send({ error: "Forbidden: Invalid credentials." });
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