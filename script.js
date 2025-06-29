// Firebase 引入
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, doc, setDoc, deleteDoc, collection, query, onSnapshot, writeBatch, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// 全域變數
let angelNumbers = {}; // 載入 Firestore 資料
let searchHistory = []; // 載入 Firestore 資料

// Firebase 服務實例
let app;
let db;
let auth;
let userId = null; // 用戶 ID
let isAuthReady = false; // 追蹤 Firebase Auth 是否已準備好

// PWA: 註冊 Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker 註冊成功，範圍:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker 註冊失敗:', error);
            });
    });
}

// 標記是否已初始化，防止重複執行
let hasInitialized = false;

// 初始化應用程式
// 將 initializeApp 函數定義為一個內部函數或匿名函數，
// 僅在 DOMContentLoaded 事件中被呼叫一次
const initApp = async () => {
    if (hasInitialized) {
        console.warn("initializeApp 已經執行過，跳過重複執行。");
        return;
    }
    hasInitialized = true; // 設定標記

    showLoadingMessage(); // 顯示載入中訊息

    // 從 Firebase 控制台複製的 firebaseConfig 內容已整合於此
    const firebaseConfig = {
      apiKey: "AIzaSyBYjCiWrPiiE-I3uUWy_rlNb6AQqvqk1G0",
      authDomain: "angel-numbers-web.firebaseapp.com",
      projectId: "angel-numbers-web",
      storageBucket: "angel-numbers-web.firebasestorage.app",
      messagingSenderId: "663638896587",
      appId: "1:663638896587:web:9d50b06e350b826875104e",
      measurementId: "G-D6J5D0FR23"
    };

    // 定義應用程式 ID（用於 Firestore 路徑，本地測試時設為固定值）
    const appId = firebaseConfig.projectId; // 從初始化後的 app 實例獲取 projectId 作為 appId

    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // 監聽身份驗證狀態變化
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                console.log('Firebase: 已登入，用戶 ID:', userId);
                isAuthReady = true;
                // 身份驗證準備就緒後，開始載入資料和綁定事件
                await loadAngelNumbersFromFirestore(appId, userId); // 從 Firestore 載入天使數字
                loadHistoryFromFirestore(appId, userId); // 從 Firestore 載入歷史記錄
                bindEventListeners(); // 綁定事件監聽器
                showWelcomeMessage(); // 顯示歡迎訊息
            } else {
                console.log('Firebase: 未登入，嘗試匿名登入...');
                try {
                    await signInAnonymously(auth); 
                } catch (anonError) {
                    console.error("匿名登入失敗:", anonError);
                    showDatabaseError(); // 顯示資料庫連接錯誤
                }
            }
        });

    } catch (error) {
        console.error('Firebase 初始化失敗:', error);
        showDatabaseError(); // 顯示錯誤訊息
    }
};

// DOM 載入完成後執行一次初始化
document.addEventListener('DOMContentLoaded', initApp);


// 從 Firestore 載入天使數字 (即時監聽)
async function loadAngelNumbersFromFirestore(appId, currentUserId) {
    if (!isAuthReady || !currentUserId) {
        console.warn('Firebase Auth 未準備好或用戶ID不存在，無法載入天使數字。');
        return;
    }

    const angelNumbersCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/angelNumbers`);
    
    onSnapshot(angelNumbersCollectionRef, (snapshot) => {
        const newAngelNumbers = {};
        snapshot.forEach(doc => {
            newAngelNumbers[doc.id] = doc.data().meaning;
        });
        angelNumbers = newAngelNumbers;
        console.log('Firestore: 天使數字資料庫已更新，共', Object.keys(angelNumbers).length, '筆資料');
        
        if (document.getElementById('manage-tab').classList.contains('active')) {
            updateManageDashboard();
            displayManageNumbers(); // 重新渲染列表
        }
        showWelcomeMessage(); // 更新歡迎訊息中的數字數量
    }, (error) => {
        console.error('Firestore: 監聽天使數字資料失敗:', error);
        showDatabaseError(); // 顯示錯誤訊息
    });
}

// 載入預設資料庫（備用方案 - 僅在 Firestore 初始化失敗時顯示，不寫入 Firestore）
function loadDefaultDatabase() { // 這個函數現在沒有被直接使用，因為我們預期 Firebase 會正常工作
    // ... (內容不變)
}


// 顯示載入中訊息 (操作現有元素)
function showLoadingMessage() {
    const angelNumberEl = document.getElementById('angelNumber');
    const angelMeaningEl = document.getElementById('angelMeaning');
    
    if (angelNumberEl && angelMeaningEl) {
        angelNumberEl.innerHTML = '⏳';
        angelNumberEl.style.fontSize = '3rem';
        angelNumberEl.style.color = '#6366f1';
        angelNumberEl.style.marginBottom = '20px';
        angelMeaningEl.innerHTML = `<h3 style="color: #6366f1; margin-bottom: 15px;">載入中...</h3><p style="color: #64748b;">正在載入資料庫</p>`;
        angelMeaningEl.style.backgroundColor = 'transparent';
        angelMeaningEl.style.boxShadow = 'none';
        angelMeaningEl.style.padding = '0';
        
        const resultContainer = document.getElementById('resultContainer');
        resultContainer.style.textAlign = 'center';
        resultContainer.style.padding = '40px 20px';
        resultContainer.style.flexDirection = 'column';
        resultContainer.style.justifyContent = 'center';
        resultContainer.style.alignItems = 'center';
    }
}

// 顯示資料庫錯誤 (操作現有元素)
function showDatabaseError() {
    const angelNumberEl = document.getElementById('angelNumber');
    const angelMeaningEl = document.getElementById('angelMeaning');

    if (angelNumberEl && angelMeaningEl) {
        angelNumberEl.innerHTML = '⚠️';
        angelNumberEl.style.fontSize = '3rem';
        angelNumberEl.style.color = '#ef4444';
        angelNumberEl.style.marginBottom = '20px';
        angelMeaningEl.innerHTML = `
            <h3 style="color: #ef4444; margin-bottom: 15px;">資料庫連接失敗</h3>
            <p style="color: #64748b; line-height: 1.6;">
                無法連接到資料庫。<br>
                請檢查網路連線或重新整理頁面。
            </p>
        `;
        angelMeaningEl.style.backgroundColor = 'transparent';
        angelMeaningEl.style.boxShadow = 'none';
        angelMeaningEl.style.padding = '0';

        const resultContainer = document.getElementById('resultContainer');
        resultContainer.style.textAlign = 'center';
        resultContainer.style.padding = '40px 20px';
        resultContainer.style.flexDirection = 'column';
        resultContainer.style.justifyContent = 'center';
        resultContainer.style.alignItems = 'center';
    }
}

// 綁定所有事件監聽器
function bindEventListeners() {
    // 搜尋框事件
    const searchBox = document.getElementById('searchBox');
    searchBox.addEventListener('input', handleSearch);
    searchBox.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // 分頁導航事件
    document.getElementById('search-nav').addEventListener('click', () => switchTab('search'));
    document.getElementById('history-nav').addEventListener('click', () => switchTab('history'));
    document.getElementById('manage-nav').addEventListener('click', () => switchTab('manage')); // 新增管理分頁導航
    
    // 控制按鈕事件
    document.getElementById('clearBtn').addEventListener('click', clearHistory);
    
    // 管理分頁按鈕事件
    document.getElementById('uploadDbBtn').addEventListener('click', showUploadCsvDialog); // 匯入 CSV 按鈕
    document.getElementById('angelNumberForm').addEventListener('submit', handleSaveAngelNumber); // 儲存數字表單
    document.getElementById('cancelEditBtn').addEventListener('click', clearManageForm); // 取消編輯按鈕

    // 模態對話框關閉按鈕
    document.getElementById('modalCloseBtn').addEventListener('click', hideModal);
}

// 顯示匯入 CSV 對話框 (取代舊的 showUploadDialog)
function showUploadCsvDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            importCsvToFirestore(file); // 呼叫新的匯入函數
        }
    };
    input.click();
}

// 匯入 CSV 資料到 Firestore
async function importCsvToFirestore(file) {
    if (!isAuthReady || !userId) {
        showCustomAlert('用戶未登入，無法更新資料。');
        return;
    }
    
    showCustomAlert('正在匯入資料...', '匯入進度', false); // 顯示不自動關閉的提示
    
    try {
        const text = await file.text();
        const newDatabase = parseCSV(text); // 使用現有的 CSV 解析函數

        if (Object.keys(newDatabase).length === 0) {
            showCustomAlert('檔案格式錯誤或沒有有效資料');
            return;
        }

        const currentAppId = app.options.projectId; 
        const angelNumbersCollectionRef = collection(db, `artifacts/${currentAppId}/users/${userId}/angelNumbers`);
        const batch = writeBatch(db);
        let importCount = 0;

        for (const number in newDatabase) {
            if (Object.prototype.hasOwnProperty.call(newDatabase, number)) {
                const meaning = newDatabase[number];
                const docRef = doc(angelNumbersCollectionRef, number); // 使用數字作為文檔 ID
                batch.set(docRef, { meaning: meaning });
                importCount++;
            }
        }
        
        await batch.commit();
        showCustomAlert(`成功匯入 ${importCount} 筆天使數字資料到您的個人資料庫！`);
    } catch (error) {
        console.error('匯入檔案到 Firestore 失敗:', error);
        showCustomAlert('匯入檔案失敗：' + error.message);
    }
}

// 顯示歡迎訊息 (操作現有元素並恢復樣式)
function showWelcomeMessage() {
    const searchBox = document.getElementById('searchBox');
    searchBox.value = ''; 
    const angelNumberEl = document.getElementById('angelNumber');
    const angelMeaningEl = document.getElementById('angelMeaning');
    const databaseCount = Object.keys(angelNumbers).length;
    
    // 恢復 angelNumberEl 的預設樣式
    angelNumberEl.style.fontSize = ''; 
    angelNumberEl.style.color = ''; 
    angelNumberEl.style.marginBottom = ''; 
    
    // 恢復 angelMeaningEl 的預設樣式
    angelMeaningEl.style.backgroundColor = ''; 
    angelMeaningEl.style.boxShadow = ''; 
    angelMeaningEl.style.padding = ''; 

    // 恢復 resultContainer 的預設樣式
    const resultContainer = document.getElementById('resultContainer');
    resultContainer.style.padding = ''; 
    resultContainer.style.textAlign = ''; 
    resultContainer.style.flexDirection = ''; 
    resultContainer.style.justifyContent = ''; 
    resultContainer.style.alignItems = ''; 

    angelNumberEl.innerHTML = '✨';
    angelMeaningEl.innerHTML = `
        <h2 style="color: #6366f1; margin-bottom: 15px;">歡迎來到天使數字查詢</h2>
        <p style="color: #64748b; font-size: 1.1rem; line-height: 1.6;">
            在上方輸入你看到的數字組合，<br>
            探索天使想要傳達給你的神聖訊息。
        </p>
        <div style="margin-top: 25px; color: #94a3b8; font-size: 0.95rem;">
            資料庫已載入 ${databaseCount} 筆天使數字
        </div>
    `;
}

// 處理搜尋
function handleSearch() {
    const searchBox = document.getElementById('searchBox');
    const query = searchBox.value;
    
    if (!query.trim()) {
        showWelcomeMessage();
        return;
    }
    
    const cleanQuery = query.replace(/\D/g, ''); 
    
    if (!cleanQuery) {
        showError('請輸入有效的數字');
        return;
    }
    
    const meaning = findAngelNumber(cleanQuery);
    
    if (meaning) {
        displayResult(cleanQuery, meaning);
        saveToHistory(cleanQuery, meaning);
    } else {
        showNotFound(cleanQuery);
    }
}

// 查找天使數字意義
function findAngelNumber(number) {
    if (angelNumbers[number]) {
        return angelNumbers[number];
    }
    
    if (number.length > 3) {
        const repeatedPattern = number.charAt(0).repeat(number.length);
        if (angelNumbers[repeatedPattern]) {
            return angelNumbers[repeatedPattern] + "\n\n註：此為近似模式的意義。";
        }
        
        const firstThree = number.substring(0, 3);
        if (angelNumbers[firstThree]) {
            return angelNumbers[firstThree] + "\n\n註：顯示前三位數字的意義。";
        }
    }
    
    return null;
}

// 顯示搜尋結果
function displayResult(number, meaning) {
    const angelNumberEl = document.getElementById('angelNumber');
    const angelMeaningEl = document.getElementById('angelMeaning');
    
    angelNumberEl.textContent = number;
    angelMeaningEl.textContent = meaning;
    
    // 恢復 angelNumberEl 的預設樣式
    angelNumberEl.style.fontSize = ''; 
    angelNumberEl.style.color = ''; 
    angelNumberEl.style.marginBottom = ''; 
    
    // 恢復 angelMeaningEl 的預設樣式
    angelMeaningEl.style.backgroundColor = ''; 
    angelMeaningEl.style.boxShadow = ''; 
    angelMeaningEl.style.padding = ''; 

    // 恢復 resultContainer 的預設樣式 (如果之前被修改過)
    const resultContainer = document.getElementById('resultContainer');
    resultContainer.style.padding = ''; 
    resultContainer.style.textAlign = ''; 
    resultContainer.style.flexDirection = ''; 
    resultContainer.style.justifyContent = ''; 
    resultContainer.style.alignItems = ''; 
    
    angelNumberEl.style.animation = 'none';
    angelMeaningEl.style.animation = 'none';
    
    void angelNumberEl.offsetWidth; 
    void angelMeaningEl.offsetWidth;
    
    angelNumberEl.style.animation = 'fadeInUp 0.6s ease-out';
    angelMeaningEl.style.animation = 'fadeInUp 0.6s ease-out 0.2s both';
}

// 顯示錯誤訊息
function showError(message) {
    const angelNumberEl = document.getElementById('angelNumber');
    const angelMeaningEl = document.getElementById('angelMeaning');

    angelNumberEl.innerHTML = '⚠️';
    angelNumberEl.style.fontSize = '3rem';
    angelNumberEl.style.color = '#ef4444';
    angelNumberEl.style.marginBottom = '20px';

    angelMeaningEl.innerHTML = `<h3 style="color: #ef4444; margin-bottom: 15px;">輸入錯誤</h3><p style="color: #64748b;">${message}</p>`;
    angelMeaningEl.style.backgroundColor = 'transparent';
    angelMeaningEl.style.boxShadow = 'none';
    angelMeaningEl.style.padding = '0';
    
    const resultContainer = document.getElementById('resultContainer');
    resultContainer.style.textAlign = 'center';
    resultContainer.style.padding = '40px 20px';
    resultContainer.style.flexDirection = 'column';
    resultContainer.style.justifyContent = 'center';
    resultContainer.style.alignItems = 'center';
}

// 顯示未找到訊息
function showNotFound(number) {
    const angelNumberEl = document.getElementById('angelNumber');
    const angelMeaningEl = document.getElementById('angelMeaning');
    angelNumberEl.innerHTML = '🔍';
    angelNumberEl.style.fontSize = '3rem';
    angelNumberEl.style.color = '#f59e0b';
    angelNumberEl.style.marginBottom = '20px';
    
    angelMeaningEl.innerHTML = `
        <h3 style="color: #f59e0b; margin-bottom: 15px;">數字 ${number}</h3>
        <p style="color: #64748b; line-height: 1.6;">
            抱歉，我們的資料庫中沒有這個天使數字的資料。<br>
            你可以上傳自己的資料庫檔案來擴充內容。
        </p>
    `;
    angelMeaningEl.style.backgroundColor = 'transparent';
    angelMeaningEl.style.boxShadow = 'none';
    angelMeaningEl.style.padding = '0';

    const resultContainer = document.getElementById('resultContainer');
    resultContainer.style.textAlign = 'center';
    resultContainer.style.padding = '40px 20px';
    resultContainer.style.flexDirection = 'column';
    resultContainer.style.justifyContent = 'center';
    resultContainer.style.alignItems = 'center';
}

// 切換分頁
function switchTab(tabName) {
    // 更新導航按鈕狀態
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(tabName + '-nav').classList.add('active');
    
    // 切換內容顯示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // 如果切換到歷史記錄頁面，更新顯示
    if (tabName === 'history') {
        displayHistory();
    } else if (tabName === 'manage') { // 新增管理頁面處理
        updateManageDashboard();
        displayManageNumbers();
    }
}

// 儲存到歷史記錄 (改為儲存到 Firestore)
async function saveToHistory(number, meaning) {
    if (!isAuthReady || !userId) {
        console.warn('Firebase Auth 未準備好，無法儲存歷史記錄。');
        return;
    }

    const historyItem = {
        number: number,
        meaning: meaning,
        date: new Date().toLocaleString('zh-TW'),
        timestamp: Date.now() // 用於排序
    };
    
    try {
        const currentAppId = app.options.projectId;
        const historyCollectionRef = collection(db, `artifacts/${currentAppId}/users/${userId}/searchHistory`);
        await setDoc(doc(historyCollectionRef), historyItem); // Firestore 自動生成 ID
    } catch (error) {
        console.error('儲存歷史記錄到 Firestore 失敗:', error);
    }
}

// 從 Firestore 載入歷史記錄 (即時監聽)
function loadHistoryFromFirestore(appId, currentUserId) {
    if (!isAuthReady || !currentUserId) {
        console.warn('Firebase Auth 未準備好，無法載入歷史記錄。');
        return;
    }

    const historyCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/searchHistory`);
    const q = query(historyCollectionRef); 

    onSnapshot(q, (snapshot) => {
        const newSearchHistory = [];
        snapshot.forEach(doc => {
            newSearchHistory.push({ id: doc.id, ...doc.data() });
        });
        searchHistory = newSearchHistory.sort((a, b) => b.timestamp - a.timestamp); // 最新查詢排在前面
        displayHistory();
    }, (error) => {
        console.error('Firestore: 監聽歷史記錄失敗:', error);
    });
}


// 顯示歷史記錄 (不變)
function displayHistory() {
    const historyContainer = document.getElementById('historyContainer');
    
    if (searchHistory.length === 0) {
        historyContainer.innerHTML = '<div class="no-history">目前沒有查詢記錄</div>';
        return;
    }
    
    const historyHTML = searchHistory.map(item => `
        <div class="history-item">
            <div class="history-number">${item.number}</div>
            <div class="history-meaning">${item.meaning ? item.meaning.substring(0, 100) + (item.meaning.length > 100 ? '...' : '') : ''}</div>
            <div class="history-date">${item.date}</div>
        </div>
    `).join('');
    
    historyContainer.innerHTML = historyHTML;
}

// 清除歷史記錄 (改為從 Firestore 刪除)
function clearHistory() {
    if (searchHistory.length === 0) {
        showCustomAlert('目前沒有歷史記錄可清除');
        return;
    }
    
    showCustomConfirm(
        '確定要清除所有查詢記錄嗎？此操作無法復原。',
        async () => { // 用戶點擊確認
            if (!isAuthReady || !userId) {
                showCustomAlert('用戶未登入，無法清除歷史記錄。');
                return;
            }
            try {
                const currentAppId = app.options.projectId;
                const historyCollectionRef = collection(db, `artifacts/${currentAppId}/users/${userId}/searchHistory`);
                const snapshot = await getDocs(query(historyCollectionRef)); // 獲取所有文檔
                const batch = writeBatch(db); // 使用批次寫入
                snapshot.forEach((docItem) => {
                    batch.delete(doc(historyCollectionRef, docItem.id));
                });
                await batch.commit(); // 提交批次刪除
                searchHistory = []; // 清空本地數據
                showCustomAlert('歷史記錄已清除');
            } catch (error) {
                console.error('清除歷史記錄失敗:', error);
                showCustomAlert('清除歷史記錄失敗：' + error.message);
            }
        }
    );
}

// 匯出到 Excel (保留並從 Firestore 獲取數據)
function exportToExcel() {
    if (searchHistory.length === 0) {
        showCustomAlert('目前沒有記錄可以匯出');
        return;
    }
    
    let csvContent = '\uFEFF'; // BOM for UTF-8 (確保中文顯示正確)
    csvContent += '天使數字,意義,查詢時間\n';
    
    searchHistory.forEach(item => {
        const number = `"${item.number ? item.number.replace(/"/g, '""') : ''}"`;
        const meaning = `"${item.meaning ? item.meaning.replace(/"/g, '""') : ''}"`;
        const date = `"${item.date ? item.date.replace(/"/g, '""') : ''}"`;
        csvContent += `${number},${meaning},${date}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `天使數字查詢記錄_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/* --- 管理數字功能 --- */
let editingNumberId = null; // 追蹤正在編輯的數字 ID

// 更新管理儀表板 (數字數量)
function updateManageDashboard() {
    const manageDbCount = document.getElementById('manageDbCount');
    if (manageDbCount) {
        manageDbCount.textContent = `資料庫中共有 ${Object.keys(angelNumbers).length} 筆數字`;
    }
}

// 顯示管理頁面的數字列表
function displayManageNumbers() {
    const manageNumberList = document.getElementById('manageNumberList');
    manageNumberList.innerHTML = ''; // 清空現有列表
    
    const sortedNumbers = Object.keys(angelNumbers).sort((a, b) => parseInt(a) - parseInt(b)); // 按數字大小排序

    if (sortedNumbers.length === 0) {
        manageNumberList.innerHTML = '<div class="no-numbers">資料庫中目前沒有數字。</div>';
        return;
    }

    sortedNumbers.forEach(number => {
        const meaning = angelNumbers[number];
        const itemHtml = `
            <div class="manage-number-item" data-number="${number}">
                <div class="manage-item-content">
                    <div class="manage-item-number">${number}</div>
                    <div class="manage-item-meaning">${meaning}</div>
                </div>
                <div class="manage-item-actions">
                    <button class="btn btn-primary edit-btn">編輯</button>
                    <button class="btn btn-secondary delete-btn">刪除</button>
                </div>
            </div>
        `;
        manageNumberList.insertAdjacentHTML('beforeend', itemHtml);
    });

    // 為編輯和刪除按鈕綁定事件
    manageNumberList.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const numberToEdit = e.target.closest('.manage-number-item').dataset.number;
            editAngelNumber(numberToEdit);
        });
    });

    manageNumberList.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const numberToDelete = e.target.closest('.manage-number-item').dataset.number;
            deleteAngelNumber(numberToDelete);
        });
    });
}

// 處理儲存天使數字 (新增/編輯)
async function handleSaveAngelNumber(event) {
    event.preventDefault(); // 阻止表單預設提交行為

    if (!isAuthReady || !userId) {
        showCustomAlert('用戶未登入，無法儲存數字。');
        return;
    }

    const formNumber = document.getElementById('formNumber');
    const formMeaning = document.getElementById('formMeaning');
    
    const number = formNumber.value.trim();
    const meaning = formMeaning.value.trim();

    if (!number || !meaning) {
        showCustomAlert('數字和意義都不能為空。');
        return;
    }

    // 檢查數字是否已經存在 (如果不是編輯模式)
    if (editingNumberId === null && angelNumbers[number]) {
        showCustomAlert(`數字 ${number} 已經存在，請使用編輯功能或輸入不同數字。`);
        return;
    }

    showCustomAlert('正在儲存數字...', '儲存中', false); // 顯示不自動關閉的提示

    try {
        const currentAppId = app.options.projectId;
        const docRef = doc(db, `artifacts/${currentAppId}/users/${userId}/angelNumbers`, number);
        await setDoc(docRef, { meaning: meaning }); // setDoc 會自動覆蓋或新增

        showCustomAlert(`數字 ${number} 已成功儲存！`);
        clearManageForm(); // 清空表單
    } catch (error) {
        console.error('儲存天使數字到 Firestore 失敗:', error);
        showCustomAlert('儲存數字失敗：' + error.message);
    }
}

// 編輯天使數字
function editAngelNumber(number) {
    const meaning = angelNumbers[number];
    if (meaning) {
        document.getElementById('formNumber').value = number;
        document.getElementById('formMeaning').value = meaning;
        editingNumberId = number; // 設定為編輯模式
        document.getElementById('saveNumberBtn').textContent = '💾 更新數字';
        document.getElementById('cancelEditBtn').style.display = 'inline-flex'; // 顯示取消按鈕
        showCustomAlert(`正在編輯數字 ${number}。`);
    }
}

// 清空管理表單
function clearManageForm() {
    document.getElementById('formNumber').value = '';
    document.getElementById('formMeaning').value = '';
    editingNumberId = null; // 退出編輯模式
    document.getElementById('saveNumberBtn').textContent = '💾 儲存數字';
    document.getElementById('cancelEditBtn').style.display = 'none'; // 隱藏取消按鈕
}

// 刪除天使數字
async function deleteAngelNumber(number) {
    showCustomConfirm(
        `確定要刪除數字 ${number} 及其意義嗎？此操作無法復原。`,
        async () => {
            if (!isAuthReady || !userId) {
                showCustomAlert('用戶未登入，無法刪除數字。');
                return;
            }
            try {
                const currentAppId = app.options.projectId;
                const docRef = doc(db, `artifacts/${currentAppId}/users/${userId}/angelNumbers`, number);
                await deleteDoc(docRef);
                showCustomAlert(`數字 ${number} 已成功刪除。`);
            } catch (error) {
                console.error('刪除天使數字失敗:', error);
                showCustomAlert('刪除數字失敗：' + error.message);
            }
        }
    );
}

/* --- 自定義模態對話框邏輯 --- */
const customModal = document.getElementById('customModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalFooter = document.getElementById('modalFooter');

// 顯示通用模態對話框
function showModal(title, message, buttonsHTML) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalFooter.innerHTML = buttonsHTML;
    customModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; 
}

// 隱藏模態對話框
function hideModal() {
    customModal.style.display = 'none';
    document.body.style.overflow = '';
}

// 顯示自定義 Alert (單個確認按鈕)
// autoHide: true 則自動在一定時間後隱藏，或點擊確認按鈕才隱藏
function showCustomAlert(message, title = '提示', autoHide = true, callback = () => {}) {
    const buttonsHTML = autoHide ? `<button class="modal-btn confirm-btn" id="modalAlertConfirmBtn">確定</button>` : ``;
    showModal(title, message, buttonsHTML);

    if (autoHide) {
        const confirmBtn = document.getElementById('modalAlertConfirmBtn');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                hideModal();
                callback();
            };
        }
    } else {
        // 如果是長期提示，確保可以通過 X 關閉
        document.getElementById('modalCloseBtn').style.display = 'block';
    }
}

// 顯示自定義 Confirm (確認和取消按鈕)
function showCustomConfirm(message, onConfirm, onCancel) {
    const buttonsHTML = `
        <button class="modal-btn cancel-btn" id="modalConfirmCancelBtn">取消</button>
        <button class="modal-btn confirm-btn" id="modalConfirmConfirmBtn">確定</button>
    `;
    showModal('確認', message, buttonsHTML);

    document.getElementById('modalConfirmConfirmBtn').onclick = () => {
        hideModal();
        onConfirm();
    };
    document.getElementById('modalConfirmCancelBtn').onclick = () => {
        hideModal();
        if (onCancel) onCancel();
    };
}

// 解析 CSV 資料 (保持不變)
function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const database = {};
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const number = parts[0].trim();
                const meaning = parts.slice(1).join(',').trim();
                if (number && meaning) {
                    database[number] = meaning;
                }
            }
        }
    }
    return database;
}
