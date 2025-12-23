const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const FILES_TO_CHECK = [
    'constants.js',
    'state.js',
    'ui.js',
    'utils/normalizer.js',
    'utils/errorHandler.js',
    'view/renderers.js',
    'view/components.js',
    'view/index.js',
    'handlers/generator.js',
    'handlers/session.js',
    'handlers/content.js',
    'prompts/index.js'
];

const MAGIC_STRINGS = [
    'knowledge-recall',
    'competency-based'
];

console.log('🚀 開始執行釋出前自動驗收...');
let hasError = false;

// 1. 語法檢查
console.log('\n--- [1/3] 語法檢查 ---');
FILES_TO_CHECK.forEach(file => {
    const filePath = path.join(PROJECT_ROOT, file);
    try {
        execSync(`node -c "${filePath}"`);
        console.log(`✅ ${file}: 語法正確`);
    } catch (e) {
        console.error(`❌ ${file}: 語法錯誤！`);
        hasError = true;
    }
});

// 2. 依賴完整性檢查 (Static Import Analysis)
console.log('\n--- [2/3] 依賴完整性檢查 ---');
const exportMap = {};

// 先蒐集所有 Export
FILES_TO_CHECK.forEach(file => {
    const filePath = path.join(PROJECT_ROOT, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const exports = [];
    const exportRegex = /export\s+(function|const|class|let)\s+([a-zA-Z0-9_]+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[2]);
    }
    // 處理 export { a, b } 格式
    const bracketExportRegex = /export\s+\{([^}]+)\}/g;
    while ((match = bracketExportRegex.exec(content)) !== null) {
        match[1].split(',').forEach(s => exports.push(s.trim().split(' as ')[0]));
    }
    exportMap[file] = exports;
});

// 檢查 Import
FILES_TO_CHECK.forEach(file => {
    const filePath = path.join(PROJECT_ROOT, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        const importedSymbols = match[1].split(',').map(s => s.trim().split(' as ')[0]);
        let importPath = match[2];
        
        // 轉換路徑
        if (!importPath.endsWith('.js')) importPath += '.js';
        const absoluteImportPath = path.resolve(path.dirname(filePath), importPath);
        const relativeToRoot = path.relative(PROJECT_ROOT, absoluteImportPath);

        if (!fs.existsSync(absoluteImportPath)) {
            console.error(`❌ ${file}: 找不到檔案 ${importPath} (路徑: ${relativeToRoot})`);
            hasError = true;
            continue;
        }

        const availableExports = exportMap[relativeToRoot] || [];
        importedSymbols.forEach(sym => {
            if (availableExports.length > 0 && !availableExports.includes(sym)) {
                console.error(`❌ ${file}: 試圖從 ${relativeToRoot} 匯入不存在的符號 [${sym}]`);
                hasError = true;
            }
        });
    }
});
if (!hasError) console.log('✅ 所有 Import 路徑與符號比對正確');

// 3. 常數殘留檢查
console.log('\n--- [3/3] 常數殘留檢查 ---');
FILES_TO_CHECK.forEach(file => {
    if (file === 'constants.js') return;
    const filePath = path.join(PROJECT_ROOT, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    MAGIC_STRINGS.forEach(str => {
        // 排除註解與 Import 字串
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (line.includes(`'${str}'`) || line.includes(`"${str}"`)) {
                if (!line.trim().startsWith('import') && !line.trim().startsWith('//') && !line.includes('from')) {
                    console.warn(`⚠️  ${file} 第 ${i+1} 行: 發現殘留 Magic String [${str}]`);
                    // hasError = true; // 警告等級，不一定算 Error
                }
            }
        });
    });
});

console.log('\n--- 驗收結果 ---');
if (hasError) {
    console.log('🛑 驗收失敗！請修正上述錯誤再釋出。');
    process.exit(1);
} else {
    console.log('🎉 驗收通過！程式碼結構穩健，可以安心釋出。');
}
