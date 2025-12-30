import { CONFIG } from '../config.js';
import * as state from '../state.js';
import * as ui from '../ui.js';
import { elements } from '../dom.js';
import { compressImage } from '../utils.js';
import { saveInputDraft, triggerOrUpdate } from './session.js';

// Helper for dynamic script loading
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`無法載入 script: ${src}`));
        document.body.appendChild(script);
    });
}

export function handleFile(file) {
    if (elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = ''; 
    if (elements.fileNameDisplay) elements.fileNameDisplay.textContent = ''; 
    if (elements.fileInput) elements.fileInput.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && file.type !== 'text/plain') { const errorMsg = ui.t('error_file_format'); ui.showToast(errorMsg, 'error'); if(elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = errorMsg; return; }
    if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) { const errorMsg = `${ui.t('error_file_size')} (${(CONFIG.MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB).`; ui.showToast(errorMsg, 'error'); if(elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = errorMsg; return; }
    if (elements.fileNameDisplay) elements.fileNameDisplay.textContent = `已選：${file.name}`;
    
    const reader = new FileReader();
    if (file.type === 'application/pdf') {
        reader.onload = async (e) => {
            try {
                ui.showLoader('正在讀取 PDF 檔案...');
                await loadScript(`https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js`);
                const pdfjsLib = window.pdfjsLib;
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
                
                const loadingTask = pdfjsLib.getDocument({
                    data: new Uint8Array(e.target.result),
                    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
                    cMapPacked: true,
                });
                
                const pdf = await loadingTask.promise;
                let text = '';
                for (let i = 1; i <= pdf.numPages; i++) { 
                    const page = await pdf.getPage(i); 
                    const content = await page.getTextContent(); 
                    text += content.items.map(item => item.str).join(' '); 
                }
                if (!text.trim()) {
                    throw new Error('此 PDF 為掃描檔或純圖片，無法提取文字內容。');
                }
                if(elements.textInput) {
                    elements.textInput.value = text;
                    elements.textInput.dispatchEvent(new Event('input')); 
                }
                saveInputDraft(); 
                ui.showToast(ui.t('toast_pdf_success'), 'success'); 
                if(elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click();
                triggerOrUpdate();
            } catch (error) { 
                console.error("PDF 讀取失敗:", error); 
                const errorMsg = error.message || "無法讀取此PDF檔案。"; 
                ui.showToast(errorMsg, "error"); 
                if(elements.fileErrorDisplay) elements.fileErrorDisplay.textContent = errorMsg;
                if(elements.fileNameDisplay) elements.fileNameDisplay.textContent = ''; 
            } finally {
                ui.hideLoader();
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = (e) => { 
            if(elements.textInput) {
                elements.textInput.value = e.target.result; 
                elements.textInput.dispatchEvent(new Event('input')); 
            }
            saveInputDraft(); 
            ui.showToast(ui.t('toast_txt_success'), 'success'); 
            if(elements.tabs.input.buttons[0]) elements.tabs.input.buttons[0].click();
            triggerOrUpdate(); 
        };
        reader.readAsText(file);
    }
}

export function handleImageFiles(newFiles) {
    if (!newFiles || newFiles.length === 0) return;
    if(elements.imageErrorDisplay) elements.imageErrorDisplay.innerHTML = ''; 
    const { MAX_IMAGE_SIZE_BYTES, MAX_TOTAL_IMAGE_SIZE_BYTES } = CONFIG;
    let currentTotalSize = state.getUploadedImages().reduce((sum, img) => sum + img.size, 0);
    let errorMessages = [], sizeLimitReached = false;
    const validFiles = Array.from(newFiles).filter(file => {
        if (!file.type.startsWith('image/')) { errorMessages.push(`"${file.name}" 格式不符。`); return false; }
        if (file.size > MAX_IMAGE_SIZE_BYTES) { errorMessages.push(`"${file.name}" 過大。`); return false; }
        if (currentTotalSize + file.size > MAX_TOTAL_IMAGE_SIZE_BYTES) { if (!sizeLimitReached) { errorMessages.push(`圖片總量超過上限。`); sizeLimitReached = true; } return false; }
        currentTotalSize += file.size; return true;
    });
    if (errorMessages.length > 0) { if(elements.imageErrorDisplay) elements.imageErrorDisplay.innerHTML = errorMessages.join('<br>'); ui.showToast(ui.t('toast_img_fail_partial'), 'error'); }
    if (validFiles.length === 0) { if(elements.imageInput) elements.imageInput.value = ''; return; }
    
    const fragment = document.createDocumentFragment();
    let filesToProcess = validFiles.length;

    validFiles.forEach((file) => {
        compressImage(file).then(compressedFile => { 
             const reader = new FileReader();
             reader.onload = (e) => {
                const fullBase64 = e.target.result, base64Data = fullBase64.split(',')[1];
                const fileSize = compressedFile instanceof Blob ? compressedFile.size : file.size;
                
                const imageObject = { id: Date.now() + Math.random(), type: file.type, data: base64Data, size: fileSize };
                let currentImages = state.getUploadedImages();
                currentImages.push(imageObject);
                state.setUploadedImages(currentImages);
                const previewWrapper = document.createElement('div');
                previewWrapper.className = 'relative group';
                const imgElement = document.createElement('img');
                imgElement.src = fullBase64; imgElement.alt = `圖片預覽`; imgElement.className = 'w-full h-32 object-cover rounded-lg shadow-md';
                const removeBtn = document.createElement('div');
                removeBtn.className = 'absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer font-bold leading-none transition-all hover:bg-red-500/90 scale-0 group-hover:scale-100';
                removeBtn.innerHTML = '&times;';
                removeBtn.onclick = () => { 
                    state.setUploadedImages(state.getUploadedImages().filter(img => img.id !== imageObject.id)); 
                    previewWrapper.remove();
                    triggerOrUpdate();
                };
                previewWrapper.appendChild(imgElement); previewWrapper.appendChild(removeBtn);
                fragment.appendChild(previewWrapper);
                if (--filesToProcess === 0) { 
                    if (elements.imagePreviewContainer) elements.imagePreviewContainer.appendChild(fragment); 
                    triggerOrUpdate();
                }
            };
            reader.readAsDataURL(compressedFile); 
        }).catch(err => {
            console.error("Image compression failed, falling back to original", err);
             const reader = new FileReader();
             reader.onload = (e) => {
                const fullBase64 = e.target.result, base64Data = fullBase64.split(',')[1];
                const imageObject = { id: Date.now() + Math.random(), type: file.type, data: base64Data, size: file.size };
                let currentImages = state.getUploadedImages();
                currentImages.push(imageObject);
                state.setUploadedImages(currentImages);
                const previewWrapper = document.createElement('div');
                previewWrapper.className = 'relative group';
                const imgElement = document.createElement('img');
                imgElement.src = fullBase64; imgElement.alt = `圖片預覽`; imgElement.className = 'w-full h-32 object-cover rounded-lg shadow-md';
                const removeBtn = document.createElement('div');
                removeBtn.className = 'absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer font-bold leading-none transition-all hover:bg-red-500/90 scale-0 group-hover:scale-100';
                removeBtn.innerHTML = '&times;';
                removeBtn.onclick = () => { 
                    state.setUploadedImages(state.getUploadedImages().filter(img => img.id !== imageObject.id)); 
                    previewWrapper.remove();
                    triggerOrUpdate();
                };
                previewWrapper.appendChild(imgElement); previewWrapper.appendChild(removeBtn);
                fragment.appendChild(previewWrapper);
                if (--filesToProcess === 0) { 
                    if (elements.imagePreviewContainer) elements.imagePreviewContainer.appendChild(fragment); 
                    triggerOrUpdate();
                }
            };
            reader.readAsDataURL(file);
        });
    });
    if(elements.imageInput) elements.imageInput.value = '';
}

export async function exportFile() {
    const questions = state.getGeneratedQuestions();
    const format = elements.formatSelect ? elements.formatSelect.value : '';
    if (!format) return ui.showToast(ui.t('toast_select_format'), 'error');
    if (!questions || questions.length === 0) return ui.showToast(ui.t('toast_no_questions'), 'error');
    
    // --- [清理] 此處原本有冗長的資料正規化邏輯，現已統一由生成後直接處理完畢 ---

    const titleInput = elements.quizTitleInput ? elements.quizTitleInput.value.trim() : '';
    const title = titleInput || '測驗卷';
    const safeTitle = titleInput ? titleInput.replace(/[\\/:*?"<>|]/g, '_') : 'Quiz_Paper'; 

    let data, filename, success = false;
    try {
        ui.showLoader('正在準備匯出檔案...');
        
        if (format === 'pdf') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
            
            if (!window.html2canvas || !window.jspdf) {
                throw new Error('PDF 匯出函式庫載入失敗。');
            }

            let pdfContainer = document.getElementById('pdf-export-container');
            if (!pdfContainer) {
                pdfContainer = document.createElement('div');
                pdfContainer.id = 'pdf-export-container';
                pdfContainer.style.position = 'fixed';
                pdfContainer.style.left = '-9999px';
                pdfContainer.style.top = '0';
                pdfContainer.style.width = '210mm';
                pdfContainer.style.minHeight = '297mm';
                pdfContainer.style.padding = '20mm';
                pdfContainer.style.backgroundColor = 'white';
                pdfContainer.style.fontFamily = '"Noto Sans TC", sans-serif';
                pdfContainer.style.color = '#000';
                pdfContainer.style.boxSizing = 'border-box';
                document.body.appendChild(pdfContainer);
            }

            const date = new Date().toLocaleDateString('zh-TW');
            let htmlContent = `
                <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
                    <h1 style="font-size: 24px; margin: 0; font-weight: bold;">${title}</h1>
                    <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 14px;">
                        <span>日期：${date}</span>
                        <span>班級：__________  姓名：__________  座號：_____</span>
                        <span>得分：__________</span>
                    </div>
                </div>
                <div style="font-size: 14px; line-height: 1.6;">
            `;

            questions.forEach((q, index) => {
                const isTF = q.options && q.options.length === 2 && q.options[0] === '是' && q.options[1] === '否';
                htmlContent += `
                    <div style="margin-bottom: 15px; page-break-inside: avoid;">
                        <div style="display: flex; align-items: baseline;">
                            <span style="font-weight: bold; margin-right: 5px;">${index + 1}.</span>
                            <div>${q.text}</div>
                        </div>
                `;

                if (!isTF && q.options) {
                    htmlContent += `<div style="margin-left: 25px; margin-top: 5px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">`;
                    q.options.forEach((opt, i) => {
                        const label = String.fromCharCode(65 + i); 
                        htmlContent += `<div>(${label}) ${opt}</div>`;
                    });
                    htmlContent += `</div>`;
                } else if (isTF) {
                    htmlContent += `<div style="margin-left: 25px; margin-top: 5px;">(  ) 是   (  ) 否</div>`;
                }
                
                htmlContent += `</div>`;
            });

            htmlContent += `</div>`;
            
            pdfContainer.innerHTML = htmlContent;

            const canvas = await window.html2canvas(pdfContainer, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            
            if (pdfHeight > pdf.internal.pageSize.getHeight()) {
                 let heightLeft = pdfHeight;
                 let position = 0;
                 const pageHeight = pdf.internal.pageSize.getHeight();

                 pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
                 heightLeft -= pageHeight;

                 while (heightLeft >= 0) {
                   position = heightLeft - pdfHeight;
                   pdf.addPage();
                   pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
                   heightLeft -= pageHeight;
                 }
            } else {
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }

            pdf.save(`${safeTitle}.pdf`);
            document.body.removeChild(pdfContainer);
            success = true;

        } else if (format === 'txt') {
            const date = new Date().toLocaleDateString('zh-TW');
            let txtContent = `${title}\n日期：${date}\n班級：__________  姓名：__________  座號：_____\n得分：__________\n\n`;
            
            questions.forEach((q, index) => {
                txtContent += `${index + 1}. ${q.text}\n`;
                const isTF = q.options && q.options.length === 2 && q.options[0] === '是' && q.options[1] === '否';
                if (isTF) { 
                    txtContent += `(  ) 是   (  ) 否\n`;
                } else if (q.options) {
                    q.options.forEach((opt, i) => {
                        const label = String.fromCharCode(65 + i);
                        txtContent += `(${label}) ${opt}  `;
                    });
                    txtContent += `\n`;
                }
                txtContent += `\n`;
            });
            
            txtContent += `\n\n--- 解答 ---\n`;
            questions.forEach((q, index) => {
                let answer = '';
                const isTF = q.options && q.options.length === 2 && q.options[0] === '是' && q.options[1] === '否';
                if (isTF && q.correct && q.correct.length > 0) {
                    answer = q.correct[0] === 0 ? '是' : '否';
                } else if (q.correct && q.correct.length > 0) {
                    answer = q.correct.map(i => String.fromCharCode(65 + i)).join(', ');
                }
                txtContent += `${index + 1}. ${answer}\n`;
            });

            const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeTitle}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            success = true;

        } else {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
            const XLSX = window.XLSX;
            if (!XLSX) {
                throw new Error('XLSX library failed to load on window object.');
            }
            // Trusting that all questions are already MCQ formatted by normalizer
            switch (format) {
                case 'wordwall': {
                    data = questions.map(q => ({ '問題': q.text, '選項1': q.options[0] || '', '選項2': q.options[1] || '', '選項3': q.options[2] || '', '選項4': q.options[3] || '', '正確選項': q.correct.length > 0 ? (q.correct[0] + 1) : '' }));
                    filename = `${safeTitle}_Wordwall.xlsx`; 
                    break;
                }
                case 'kahoot': {
                    const kahootData = [ ['Kahoot Quiz Template'], [], [], [], ['Question', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Time limit (sec)', 'Correct answer(s)'] ];
                    questions.forEach(q => { kahootData.push([ q.text, q.options[0] || '', q.options[1] || '', q.options[2] || '', q.options[3] || '', q.time || 30, q.correct.map(i => i + 1).join(',') ]); });
                    const ws = XLSX.utils.aoa_to_sheet(kahootData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                    XLSX.writeFile(wb, `${safeTitle}_Kahoot.xlsx`);
                    success = true;
                    break;
                }
                case 'blooket': {
                    let csvContentBlooket = '"Blooket\nImport Template",,,,,,,';
                    csvContentBlooket += '\nQuestion #,Question Text,Answer 1,Answer 2,"Answer 3\n(Optional)","Answer 4\n(Optional)","Time Limit (sec)\n(Max: 300 seconds)","Correct Answer(s)\n(Only include Answer #)"';
                    questions.forEach((q, index) => {
                        const opts = [...(q.options || [])];
                        while(opts.length < 4) opts.push('');
                        const correctIndices = (q.correct || []).map(i => i + 1).join(','); 
                        const escapeCsv = (str) => {
                            if (typeof str !== 'string') return '';
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return `"${str.replace(/"/g, '""')}"`;
                            }
                            return str;
                        };
                        const row = [
                            index + 1, escapeCsv(q.text), escapeCsv(opts[0]), escapeCsv(opts[1]), escapeCsv(opts[2]), escapeCsv(opts[3]), q.time || 20, `"${correctIndices}"`
                        ];
                        csvContentBlooket += '\n' + row.join(',');
                    });
                    const blobBlooket = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContentBlooket], { type: 'text/csv;charset=utf-8;' });
                    const urlBlooket = URL.createObjectURL(blobBlooket);
                    const aBlooket = document.createElement('a');
                    aBlooket.href = urlBlooket;
                    aBlooket.download = `${safeTitle}_Blooket.csv`;
                    document.body.appendChild(aBlooket);
                    aBlooket.click();
                    document.body.removeChild(aBlooket);
                    success = true;
                    break;
                }
                case 'gimkit': {
                    let csvContentGimkit = 'Gimkit Spreadsheet Import Template,,,,';
                    csvContentGimkit += '\nQuestion,Correct Answer,Incorrect Answer 1,Incorrect Answer 2 (Optional),Incorrect Answer 3 (Optional)';
                    questions.forEach(q => {
                        const correctIndex = (q.correct && q.correct.length > 0) ? q.correct[0] : -1;
                        let correctAnswerText = '';
                        let incorrectAnswers = [];
                        if (correctIndex !== -1 && q.options && q.options[correctIndex]) {
                            correctAnswerText = q.options[correctIndex];
                            incorrectAnswers = q.options.filter((_, idx) => idx !== correctIndex);
                        } else {
                            incorrectAnswers = q.options || [];
                        }
                        const escapeCsv = (str) => {
                            if (typeof str !== 'string') return '';
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return `"${str.replace(/"/g, '""')}"`;
                            }
                            return str;
                        };
                        const row = [
                            escapeCsv(q.text), escapeCsv(correctAnswerText), escapeCsv(incorrectAnswers[0] || ''), escapeCsv(incorrectAnswers[1] || ''), escapeCsv(incorrectAnswers[2] || '')
                        ];
                        csvContentGimkit += '\n' + row.join(',');
                    });
                    const blobGimkit = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContentGimkit], { type: 'text/csv;charset=utf-8;' });
                    const urlGimkit = URL.createObjectURL(blobGimkit);
                    const aGimkit = document.createElement('a');
                    aGimkit.href = urlGimkit;
                    aGimkit.download = `${safeTitle}_Gimkit.csv`;
                    document.body.appendChild(aGimkit);
                    aGimkit.click();
                    document.body.removeChild(aGimkit);
                    success = true;
                    break;
                }
                case 'wayground': {
                    data = questions.map(q => ({
                        'Question Text': q.text, 'Question Type': (q.correct || []).length > 1 ? 'Checkbox' : 'Multiple Choice', 'Option 1': q.options[0] || '', 'Option 2': q.options[1] || '', 'Option 3': q.options[2] || '', 'Option 4': q.options[3] || '', 'Option 5': '', 'Correct Answer': (q.correct || []).map(i => i + 1).join(','), 'Time in seconds': q.time || 30, 'Image Link': '', 'Answer explanation': q.explanation || ''
                    }));
                    filename = `${safeTitle}_Wayground.xlsx`;
                    break;
                }
                case 'loilonote': {
                    data = questions.map(q => ({
                        '問題（請勿編輯標題）': q.text, '務必作答（若此問題需要回答，請輸入1）': 1, '每題得分（未填入的部分將被自動設為1）': 1, '正確答案的選項（若有複數正確答案選項，請用「、」或「 , 」來分隔選項編號）': (q.correct || []).map(i => i + 1).join(','), '說明': q.explanation || '', '選項1': q.options[0] || '', '選項2': q.options[1] || '', '選項3': q.options[2] || '', '選項4': q.options[3] || '',
                    }));
                    filename = `${safeTitle}_LoiLoNote.xlsx`;
                    break;
                }
                default: throw new Error('未知的格式');
            }
            if(data) {
                const worksheet = XLSX.utils.json_to_sheet(data); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
                XLSX.writeFile(workbook, filename);
                success = true;
            }
        }

        if (success) {
            ui.showPostDownloadModal();
        }
    } catch (error) { 
        console.error('匯出失敗:', error); 
        ui.showToast(ui.t('toast_export_fail'), 'error'); 
    } finally {
        ui.hideLoader();
    }
}
