// XlevelDb.js (CommonJS)
const { Level } = require('level');

/**
 * Lớp XlevelDb cung cấp một giao diện cấp cao để làm việc với LevelDB.
 * Phiên bản này được tái cấu trúc để ngắn gọn, dễ đọc, dễ bảo trì,
 * và vẫn đảm bảo an toàn tuyệt đối trong môi trường đa luồng (concurrent safe).
 */
class XlevelDb {
    constructor(dbPath) {
        if (!dbPath) throw new Error('Cần cung cấp đường dẫn cơ sở dữ liệu (dbPath).');
        this.db = new Level(dbPath, { valueEncoding: 'json' });
        this.locks = new Map();
        console.log(`Đã kết nối tới cơ sở dữ liệu tại: ${dbPath}`);
    }

    // --- CƠ CHẾ KHÓA ---
    _acquireLock(key) {
        if (this.locks.has(key)) {
            return new Promise(resolve => this.locks.get(key).push(resolve));
        }
        this.locks.set(key, []);
        return Promise.resolve();
    }

    _releaseLock(key) {
        const waiting = this.locks.get(key);
        if (waiting?.length > 0) waiting.shift()();
        else this.locks.delete(key);
    }

    // --- QUẢN LÝ KEY ---
    _prefixKey = (type, key) => `${type}:${key}`;
    _counterKey = (type) => `__count:${type}`;
    _queueLockKey = (type) => `__lock:queue:${type}`;

    // --- PHƯƠNG THỨC CỐT LÕI (Primitives) ---

    async put(type, key, value) {
        const fullKey = this._prefixKey(type, key);
        const counterKey = this._counterKey(type);

        const dataToStore = (typeof value === 'object' && value !== null && !Array.isArray(value))
            ? { ...value, createdAt: new Date().toISOString() }
            : { value, createdAt: new Date().toISOString() };

        await this._acquireLock(fullKey);
        try {
            const exists = (await this.get(type, key)) !== null;
            if (exists) {
                await this.db.put(fullKey, dataToStore);
            } else {
                await this._acquireLock(counterKey);
                try {
                    const count = await this.count(type);
                    await this.db.batch([
                        { type: 'put', key: fullKey, value: dataToStore },
                        { type: 'put', key: counterKey, value: count + 1 },
                    ]);
                } finally {
                    this._releaseLock(counterKey);
                }
            }
        } finally {
            this._releaseLock(fullKey);
        }
    }

    async del(type, key) {
        const fullKey = this._prefixKey(type, key);
        const counterKey = this._counterKey(type);
        
        await this._acquireLock(fullKey);
        try {
            const exists = (await this.get(type, key)) !== null;
            if (exists) {
                await this._acquireLock(counterKey);
                try {
                    const count = await this.count(type);
                    await this.db.batch([
                        { type: 'del', key: fullKey },
                        { type: 'put', key: counterKey, value: Math.max(0, count - 1) },
                    ]);
                } finally {
                    this._releaseLock(counterKey);
                }
            }
        } finally {
            this._releaseLock(fullKey);
        }
    }

    async move(type, key, newType) {
        if (type === newType) return false;

        const sourceKey = this._prefixKey(type, key);
        const destKey = this._prefixKey(newType, key);
        const sourceCounter = this._counterKey(type);
        const destCounter = this._counterKey(newType);

        await Promise.all([
            this._acquireLock(sourceKey), this._acquireLock(destKey),
            this._acquireLock(sourceCounter), this._acquireLock(destCounter)
        ]);
        
        try {
            const value = await this.get(type, key);
            if (value === null) return false;

            const valueToMove = { ...value, createdAt: new Date().toISOString() };
            const sourceCount = await this.count(type);
            const destCount = await this.count(newType);
            const destExists = (await this.get(newType, key)) !== null;

            const batchOps = [
                { type: 'del', key: sourceKey },
                { type: 'put', key: destKey, value: valueToMove },
                { type: 'put', key: sourceCounter, value: Math.max(0, sourceCount - 1) },
            ];
            if (!destExists) {
                batchOps.push({ type: 'put', key: destCounter, value: destCount + 1 });
            }
            
            await this.db.batch(batchOps);
            return true;
        } finally {
            this._releaseLock(destCounter);
            this._releaseLock(sourceCounter);
            this._releaseLock(destKey);
            this._releaseLock(sourceKey);
        }
    }

    // --- PHƯƠNG THỨC TIỆN ÍCH (Sử dụng Primitives) ---
    
    async get(type, key) {
        try {
            return await this.db.get(this._prefixKey(type, key));
        } catch (error) {
            if (error.code === 'LEVEL_NOT_FOUND') return null;
            throw error;
        }
    }

    async getMany(type, keys) {
        const fullKeys = keys.map(k => this._prefixKey(type, k));
        const values = await this.db.getMany(fullKeys);
        return values.map(v => v === undefined ? null : v);
    }
    
    async putMany(type, items) {
        for (const item of items) {
            await this.put(type, item.key, item.value);
        }
    }

    async delMany(type, keys) {
        for (const key of keys) {
            await this.del(type, key);
        }
    }

    async getAndDel(type, key) {
        const value = await this.get(type, key);
        if (value !== null) {
            await this.del(type, key);
        }
        return value;
    }

    async getAndDelMany(type, keys) {
        return Promise.all(keys.map(key => this.getAndDel(type, key)));
    }
    
    async shift(type, options = { action: 'delete' }) {
        const lockKey = this._queueLockKey(type);
        await this._acquireLock(lockKey);
        try {
            const iterator = this.db.iterator({ gte: `${type}:`, lt: `${type}:\xff`, limit: 1 });
            const firstItem = await iterator.next();
            if (!firstItem) return null;

            const [fullKey, value] = firstItem;
            const key = fullKey.substring(type.length + 1);

            if (options.action === 'move' && options.newType) {
                await this.move(type, key, options.newType);
            } else {
                await this.del(type, key);
            }
            return value;
        } finally {
            this._releaseLock(lockKey);
        }
    }
    
    async shiftMany(type, count, options = { action: 'delete' }) {
        if (!Number.isInteger(count) || count <= 0) return [];
        
        const lockKey = this._queueLockKey(type);
        await this._acquireLock(lockKey);
        try {
            const iterator = this.db.iterator({ gte: `${type}:`, lt: `${type}:\xff`, limit: count });
            const itemsToProcess = [];
            for await (const [fullKey, value] of iterator) {
                itemsToProcess.push({ key: fullKey.substring(type.length + 1), value });
            }

            if (itemsToProcess.length === 0) return [];

            const keys = itemsToProcess.map(item => item.key);
            if (options.action === 'move' && options.newType) {
                for (const key of keys) await this.move(type, key, options.newType);
            } else {
                await this.delMany(type, keys);
            }
            return itemsToProcess.map(item => item.value);
        } finally {
            this._releaseLock(lockKey);
        }
    }

    async cleanup(type, maxAgeInSeconds, options = {}) {
        const keysToProcess = [];
        const now = Date.now();
        await this.forEach(type, (key, value) => {
            if (value?.createdAt) {
                if ((now - new Date(value.createdAt).getTime()) / 1000 > maxAgeInSeconds) {
                    keysToProcess.push(key);
                }
            }
        });

        if (keysToProcess.length === 0) return 0;
        
        if (options.newType) {
            for (const key of keysToProcess) await this.move(type, key, options.newType);
        } else {
            await this.delMany(type, keysToProcess);
        }
        return keysToProcess.length;
    }
    
    async find(type) {
        const results = [];
        const prefix = `${type}:`;
        for await (const [key, value] of this.db.iterator({ gte: prefix, lt: `${prefix}\xff` })) {
            results.push({ key: key.substring(prefix.length), value });
        }
        return results;
    }
    
    async forEach(type, callback) {
        if (typeof callback !== 'function') throw new Error('Callback phải là một hàm.');
        const prefix = `${type}:`;
        for await (const [key, value] of this.db.iterator({ gte: prefix, lt: `${prefix}\xff` })) {
            await callback(key.substring(prefix.length), value);
        }
    }

    async count(type) {
        try {
            return await this.db.get(this._counterKey(type));
        } catch (error) {
            if (error.code === 'LEVEL_NOT_FOUND') return 0;
            throw error;
        }
    }

    async close() {
        await this.db.close();
        console.log('Đã đóng kết nối cơ sở dữ liệu.');
    }
}

module.exports = XlevelDb;
