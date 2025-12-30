/**
 * 輕量級響應式狀態管理器 (The Reactive Core)
 * 使用 Proxy 攔截資料變更，並自動觸發訂閱的監聽器。
 */
export class ReactiveStore {
    constructor(initialState = {}) {
        this.listeners = new Set();
        
        // 建立 Proxy 來攔截寫入操作
        this.state = new Proxy(initialState, {
            set: (target, property, value) => {
                // 只有當值真的改變時才觸發 (避免無效渲染)
                if (target[property] !== value) {
                    target[property] = value;
                    this.notify(property, value);
                }
                return true;
            },
            // 攔截刪除操作
            deleteProperty: (target, property) => {
                delete target[property];
                this.notify(property, undefined);
                return true;
            }
        });
    }

    /**
     * 訂閱狀態變更
     * @param {Function} callback - 當狀態改變時執行的函式 (key, value) => {}
     */
    subscribe(callback) {
        this.listeners.add(callback);
        // 回傳取消訂閱的函式 (Unsubscribe)
        return () => this.listeners.delete(callback);
    }

    /**
     * 通知所有訂閱者
     */
    notify(key, value) {
        this.listeners.forEach(callback => callback(key, value, this.state));
    }

    /**
     * 取得原始狀態物件 (Proxy)
     */
    get() {
        return this.state;
    }
}
