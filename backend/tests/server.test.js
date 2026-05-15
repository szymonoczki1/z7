'use strict';

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// ---------------------------------------------------------------------------
// In-memory fakes — injected before server.js loads so pg/redis never connect
// ---------------------------------------------------------------------------

const db = {
    rows: [],
    async query(sql, params) {
        if (sql.includes('CREATE TABLE'))  return {};
        if (sql.includes('SELECT * FROM')) return { rows: db.rows };
        if (sql.includes('COUNT(*)'))      return { rows: [{ count: String(db.rows.length) }] };
        if (sql.includes('INSERT INTO')) {
            const [name, price] = params;
            const row = { id: db.rows.length + 1, name, price };
            db.rows.push(row);
            return { rows: [row] };
        }
        return { rows: [] };
    },
};

const redisStore = {
    store: {},
    async connect()            {},
    async get(key)             { return this.store[key] ?? null; },
    async set(key, val, _opts) { this.store[key] = val; },
    async del(key)             { delete this.store[key]; },
};

function injectMock(moduleName, exports) {
    const resolved = require.resolve(moduleName);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

injectMock('pg',    { Pool: function () { return db; } });
injectMock('redis', { createClient: () => redisStore });

// require.main !== module inside server.js → startup block is skipped
const { app, _resetForTesting } = require('../server');

// ---------------------------------------------------------------------------
// One-shot HTTP helper — random port, tears down after each call
// ---------------------------------------------------------------------------

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.listen(0, () => {
            const { port } = server.address();
            const payload = body ? JSON.stringify(body) : undefined;
            const req = http.request(
                {
                    hostname: 'localhost', port, path,
                    method: method.toUpperCase(),
                    headers: {
                        'Content-Type': 'application/json',
                        ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
                    },
                },
                (res) => {
                    let raw = '';
                    res.on('data', chunk => (raw += chunk));
                    res.on('end', () => {
                        server.close();
                        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                        catch { resolve({ status: res.statusCode, body: null }); }
                    });
                }
            );
            req.on('error', err => { server.close(); reject(err); });
            if (payload) req.write(payload);
            req.end();
        });
    });
}

beforeEach(() => {
    db.rows          = [];
    redisStore.store = {};
    _resetForTesting();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /health', () => {
    test('returns status ok', async () => {
        const res = await request('GET', '/health');
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'ok');
    });
});

describe('POST /items — validation', () => {
    test('rejects missing name → 400', async () => {
        const res = await request('POST', '/items', { price: 9.99 });
        assert.equal(res.status, 400);
    });

    test('rejects missing price → 400', async () => {
        const res = await request('POST', '/items', { name: 'Widget' });
        assert.equal(res.status, 400);
    });

    test('accepts valid product → 201 with inserted row', async () => {
        const res = await request('POST', '/items', { name: 'Widget', price: 9.99 });
        assert.equal(res.status, 201);
        assert.equal(res.body.name, 'Widget');
        assert.equal(res.body.price, 9.99);
    });

    test('accepts string price → parses to float', async () => {
        const res = await request('POST', '/items', { name: 'Gadget', price: '24.99' });
        assert.equal(res.status, 201);
        assert.equal(res.body.price, 24.99);
    });
});

describe('GET /items — cache logic', () => {
    test('cache miss → returns rows from db and populates Redis', async () => {
        db.rows = [{ id: 1, name: 'Widget', price: 9.99 }];

        const res = await request('GET', '/items');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, db.rows);
        assert.ok(redisStore.store['items'], 'Redis should be populated after miss');
    });

    test('cache hit → returns Redis data without touching db', async () => {
        const cached = [{ id: 99, name: 'From cache', price: 1 }];
        redisStore.store['items'] = JSON.stringify(cached);
        db.rows = [];

        const res = await request('GET', '/items');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, cached);
    });

    test('cache hit → increments cacheHits counter', async () => {
        redisStore.store['items'] = JSON.stringify([{ id: 1, name: 'X', price: 1 }]);

        await request('GET', '/items'); // hit 1
        await request('GET', '/items'); // hit 2

        const stats = await request('GET', '/stats');
        assert.equal(stats.body.cache_hits, 2);
    });
});

describe('POST /items — cache invalidation', () => {
    test('adding a product clears the items cache key', async () => {
        redisStore.store['items'] = JSON.stringify([{ id: 1, name: 'Old', price: 1 }]);

        await request('POST', '/items', { name: 'New', price: 50 });

        assert.equal(redisStore.store['items'], undefined);
    });
});

describe('GET /stats', () => {
    test('returns correct totalProducts count', async () => {
        db.rows = [
            { id: 1, name: 'A', price: 10 },
            { id: 2, name: 'B', price: 20 },
        ];

        const res = await request('GET', '/stats');

        assert.equal(res.status, 200);
        assert.equal(res.body.totalProducts, 2);
    });

    test('empty db → totalProducts is 0', async () => {
        const res = await request('GET', '/stats');
        assert.equal(res.body.totalProducts, 0);
    });

    test('cache_hits reflects actual hit count', async () => {
        redisStore.store['items'] = JSON.stringify([{ id: 1, name: 'X', price: 9 }]);

        await request('GET', '/items'); // hit #1

        const res = await request('GET', '/stats');
        assert.equal(res.body.cache_hits, 1);
    });
});

describe('POST /subtract', () => {
    test('subtracts two numbers correctly', async () => {
        const res = await request('POST', '/subtract', { a: 10, b: 3 });
        assert.equal(res.status, 200);
        assert.equal(res.body.result, 7);
    });

    test('works with negative numbers', async () => {
        const res = await request('POST', '/subtract', { a: -5, b: -3 });
        assert.equal(res.status, 200);
        assert.equal(res.body.result, -2);
    });

    test('returns 400 when a is not a number', async () => {
        const res = await request('POST', '/subtract', { a: 'abc', b: 5 });
        assert.equal(res.status, 400);
        assert.ok(res.body.error);
    });

    test('returns 400 when b is not a number', async () => {
        const res = await request('POST', '/subtract', { a: 10, b: 'xyz' });
        assert.equal(res.status, 400);
        assert.ok(res.body.error);
    });
});
