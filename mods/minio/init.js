const Path = require('path');
const Minio = require('minio');
const mysql = require('mysql2/promise');

module.exports = function initMinio(server) {
    const { util, handler } = server;
    const {
        MINIO_ENDPOINT = 'minio',
        MINIO_PORT = '9000',
        MINIO_USE_SSL = 'false',
        MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER,
        MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD,
        MINIO_BUCKET = 'kiri',
        MINIO_REGION,
        DB_HOST = 'mariadb',
        DB_PORT = '3306',
        DB_USER = 'kiri',
        DB_PASSWORD = 'kiripass',
        DB_NAME = 'kiri'
    } = process.env;

    if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
        util.log('minio module disabled: MINIO_ACCESS_KEY or MINIO_SECRET_KEY missing');
        return;
    }

    let client;
    try {
        client = new Minio.Client({
            endPoint: MINIO_ENDPOINT,
            port: parseInt(MINIO_PORT, 10),
            useSSL: MINIO_USE_SSL === 'true',
            accessKey: MINIO_ACCESS_KEY,
            secretKey: MINIO_SECRET_KEY,
            region: MINIO_REGION
        });
    } catch (error) {
        util.log({ minio_client_error: error.message });
        return;
    }

    let bucketReady = false;
    let pool;
    let hasMetaColumn = false;
    const ready = ensureBucket();
    const dbReady = initDB();

    function sendJSON(res, code, payload) {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
    }

    async function ensureBucket() {
        try {
            const exists = await client.bucketExists(MINIO_BUCKET);
            if (!exists) {
                await client.makeBucket(MINIO_BUCKET);
                util.log({ minio_bucket_created: MINIO_BUCKET });
            }
            bucketReady = true;
        } catch (error) {
            util.log({ minio_bucket_error: error.message });
            bucketReady = false;
        }
        return bucketReady;
    }

    async function ensureColumn(table, column, type) {
        if (!pool) {
            return false;
        }
        try {
            const [rows] = await pool.query(`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = ?
                  AND TABLE_NAME = ?
                  AND COLUMN_NAME = ?
            `, [DB_NAME, table, column]);
            if (rows.length) {
                return true;
            }
            await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
            util.log({ mariadb_alter: `${table}.${column}`, type });
            return true;
        } catch (error) {
            util.log({ mariadb_alter_error: error.message, column, table });
            return false;
        }
    }

    async function initDB() {
        try {
            pool = await mysql.createPool({
                host: DB_HOST,
                port: parseInt(DB_PORT, 10),
                user: DB_USER,
                password: DB_PASSWORD,
                database: DB_NAME,
                waitForConnections: true,
                connectionLimit: 5
            });
            await pool.query(`
                CREATE TABLE IF NOT EXISTS kiri_slices (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(128),
                    file_key VARCHAR(512),
                    file_name VARCHAR(255),
                    file_size BIGINT,
                    file_type VARCHAR(32),
                    mode VARCHAR(32),
                    slice_ts DATETIME,
                    meta TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            hasMetaColumn = await ensureColumn('kiri_slices', 'meta', 'TEXT');
            util.log({ mariadb: 'ready', host: DB_HOST, db: DB_NAME });
            return true;
        } catch (error) {
            util.log({ mariadb_error: error.message });
            pool = null;
            return false;
        }
    }

    async function requireDB(res) {
        if (pool || await dbReady) {
            return true;
        }
        sendJSON(res, 503, { ok: false, error: 'database not ready' });
        return false;
    }

    async function requireReady(res) {
        if (bucketReady || await ready) {
            return true;
        }
        sendJSON(res, 503, { ok: false, error: 'minio not ready' });
        return false;
    }

    function normalizeMeta(meta) {
        if (!meta) {
            return {};
        }
        try {
            const parsed = typeof meta === 'string' ? JSON.parse(meta) : meta;
            const clean = JSON.parse(JSON.stringify(parsed));
            return clean && typeof clean === 'object' ? clean : {};
        } catch (error) {
            util.log({ slice_meta_parse_error: error.message });
            return {};
        }
    }

    server.api['minio/ping'] = async (req, res) => {
        const readyState = bucketReady || await ready;
        sendJSON(res, 200, {
            ok: readyState,
            bucket: MINIO_BUCKET,
            endpoint: MINIO_ENDPOINT,
            port: parseInt(MINIO_PORT, 10),
            useSSL: MINIO_USE_SSL === 'true'
        });
    };

    server.api['minio/list'] = async (req, res) => {
        if (!await requireReady(res)) return;

        const url = new URL(req.url, `http://${req.headers.host}`);
        const prefix = url.searchParams.get('prefix') || '';
        const items = [];
        const stream = client.listObjectsV2(MINIO_BUCKET, prefix, false);

        stream.on('data', (obj) => {
            items.push({
                name: obj.name,
                size: obj.size,
                lastModified: obj.lastModified
            });
        });

        stream.on('end', () => sendJSON(res, 200, { ok: true, bucket: MINIO_BUCKET, items }));
        stream.on('error', (error) => sendJSON(res, 500, { ok: false, error: error.message }));
    };

    server.api['minio/upload'] = (req, res) => {
        if (req.method !== 'POST') {
            return sendJSON(res, 405, { ok: false, error: 'POST required' });
        }
        handler.decodePost(req, res, async () => {
            if (!await requireReady(res)) return;
            let payload;
            try {
                payload = JSON.parse(req.app.post || '{}');
            } catch (error) {
                return sendJSON(res, 400, { ok: false, error: 'invalid json' });
            }

            const { key, data, contentType } = payload || {};
            if (!key || !data) {
                return sendJSON(res, 400, { ok: false, error: 'missing key or data' });
            }

            try {
                const buffer = Buffer.from(data, 'base64');
                await client.putObject(MINIO_BUCKET, key, buffer, {
                    'Content-Type': contentType || 'application/octet-stream'
                });
                sendJSON(res, 200, { ok: true, key });
            } catch (error) {
                util.log({ minio_upload_error: error.message });
                sendJSON(res, 500, { ok: false, error: error.message });
            }
        });
    };

    server.api['minio/delete'] = (req, res) => {
        if (req.method !== 'POST') {
            return sendJSON(res, 405, { ok: false, error: 'POST required' });
        }
        handler.decodePost(req, res, async () => {
            if (!await requireReady(res)) return;
            let payload;
            try {
                payload = JSON.parse(req.app.post || '{}');
            } catch (error) {
                return sendJSON(res, 400, { ok: false, error: 'invalid json' });
            }
            const { key } = payload || {};
            if (!key) {
                return sendJSON(res, 400, { ok: false, error: 'missing key' });
            }
            try {
                await client.removeObject(MINIO_BUCKET, key);
                sendJSON(res, 200, { ok: true, key });
            } catch (error) {
                util.log({ minio_delete_error: error.message });
                sendJSON(res, 500, { ok: false, error: error.message });
            }
        });
    };

    server.api['minio/object'] = async (req, res) => {
        if (!await requireReady(res)) return;
        const url = new URL(req.url, `http://${req.headers.host}`);
        const key = url.searchParams.get('key');
        if (!key) {
            return sendJSON(res, 400, { ok: false, error: 'missing key' });
        }
        try {
            const stream = await client.getObject(MINIO_BUCKET, key);
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${Path.basename(key)}"`
            });
            stream.on('error', (error) => {
                util.log({ minio_stream_error: error.message });
                if (!res.headersSent) {
                    sendJSON(res, 500, { ok: false, error: error.message });
                } else {
                    res.destroy(error);
                }
            });
            stream.pipe(res);
        } catch (error) {
            sendJSON(res, 404, { ok: false, error: error.message });
        }
    };

    server.api['minio/log-slice'] = (req, res) => {
        if (req.method !== 'POST') {
            return sendJSON(res, 405, { ok: false, error: 'POST required' });
        }
        handler.decodePost(req, res, async () => {
            if (!await requireDB(res)) return;
            let payload;
            try {
                payload = JSON.parse(req.app.post || '{}');
            } catch (error) {
                return sendJSON(res, 400, { ok: false, error: 'invalid json' });
            }
            const { userId, files = [], mode, timestamp, meta } = payload || {};
            if (!userId || !Array.isArray(files) || files.length === 0) {
                return sendJSON(res, 400, { ok: false, error: 'missing userId or files' });
            }
            const slice_ts = timestamp ? new Date(Number(timestamp)) : new Date();
            const safeMeta = normalizeMeta(meta);
            const metaJSON = hasMetaColumn ? JSON.stringify(safeMeta) : null;
            try {
                const rows = files.map(file => {
                    const base = [
                        userId,
                        file.key,
                        file.name,
                        file.size || 0,
                        file.type || 'stl',
                        mode || '',
                        slice_ts
                    ];
                    return hasMetaColumn ? [...base, metaJSON] : base;
                });
                const cols = hasMetaColumn
                    ? '(user_id, file_key, file_name, file_size, file_type, mode, slice_ts, meta)'
                    : '(user_id, file_key, file_name, file_size, file_type, mode, slice_ts)';
                await pool.query(`
                    INSERT INTO kiri_slices
                        ${cols}
                    VALUES ?
                `, [rows]);
                sendJSON(res, 200, { ok: true, count: rows.length });
            } catch (error) {
                util.log({ mariadb_insert_error: error.message });
                sendJSON(res, 500, { ok: false, error: error.message });
            }
        });
    };
};
