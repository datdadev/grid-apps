#!/usr/bin/env node

/**
 * MinIO portal static server + lightweight API proxy.
 * Serves the React app and exposes /api/storage/* endpoints
 * so the UI can list and download MinIO objects without exposing
 * credentials to the browser.
 */

const http = require('http');
const path = require('path');
const { URL } = require('url');
const connect = require('connect');
const serveStatic = require('serve-static');

const log = (...args) => console.log('[minio-portal]', ...args);
const warn = (...args) => console.warn('[minio-portal]', ...args);

const ROOT = path.join(__dirname, '..', 'web', 'minio');
const PORT =
  parseInt(
    process.env.MINIO_PORTAL_PORT ||
      process.env.MINIO_PORT ||
      process.env.PORT ||
      '9123',
    10
  ) || 9123;

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || '127.0.0.1';
const MINIO_S3_PORT =
  parseInt(
    process.env.MINIO_S3_PORT ||
      process.env.MINIO_API_PORT ||
      process.env.MINIO_STORAGE_PORT ||
      process.env.MINIO_SERVICE_PORT ||
      process.env.MINIO_INTERNAL_PORT ||
      '9000',
    10
  ) || 9000;
const MINIO_USE_SSL =
  (process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true';
const MINIO_ACCESS_KEY =
  process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER;
const MINIO_SECRET_KEY =
  process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD;
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'storage1';
const MINIO_REGION = process.env.MINIO_REGION;

const loadMinioModule = () => {
  try {
    return require('minio');
  } catch (primaryError) {
    try {
      return require('../mods/node_modules/minio');
    } catch (secondaryError) {
      warn('Unable to load MinIO client library:', secondaryError.message);
      return null;
    }
  }
};

const MinioLib = loadMinioModule();
let minioClient = null;
let bucketReady = false;

if (MinioLib && MINIO_ACCESS_KEY && MINIO_SECRET_KEY) {
  try {
    minioClient = new MinioLib.Client({
      endPoint: MINIO_ENDPOINT,
      port: MINIO_S3_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
      region: MINIO_REGION,
    });
  } catch (error) {
    warn('Failed to initialize MinIO client:', error.message);
  }
} else if (!MinioLib) {
  warn('MinIO client not available; storage API disabled.');
} else {
  warn('Missing MinIO credentials; storage API disabled.');
}

const ensureBucket = async () => {
  if (!minioClient) {
    bucketReady = false;
    return false;
  }
  try {
    bucketReady = await minioClient.bucketExists(MINIO_BUCKET);
    if (!bucketReady) {
      warn(`MinIO bucket "${MINIO_BUCKET}" is not accessible`);
    }
  } catch (error) {
    bucketReady = false;
    warn('MinIO bucket check failed:', error.message);
  }
  return bucketReady;
};

if (minioClient) {
  ensureBucket().catch((error) =>
    warn('Initial bucket check failed:', error.message)
  );
}

const sendJSON = (res, code, payload) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const normalizeFolderKey = (key) => {
  if (!key) return '';
  return key.endsWith('/') ? key : `${key}/`;
};

const listObjects = (prefix, res) =>
  new Promise((resolve) => {
    const items = [];
    const folders = new Set();
    const normalizedPrefix = prefix || '';
    let finished = false;

    const done = (payload, code = 200) => {
      if (finished) return;
      finished = true;
      sendJSON(res, code, payload);
      resolve();
    };

    const stream = minioClient.listObjectsV2(
      MINIO_BUCKET,
      normalizedPrefix,
      true
    );

    stream.on('data', (obj) => {
      if (!obj || !obj.name) {
        return;
      }
      const key = obj.name;
      if (key === normalizedPrefix) {
        return;
      }
      const relative = normalizedPrefix
        ? key.slice(normalizedPrefix.length)
        : key;
      const slashIndex = relative.indexOf('/');

      if (slashIndex !== -1) {
        const folderKey =
          normalizedPrefix + relative.slice(0, slashIndex + 1);
        folders.add(normalizeFolderKey(folderKey));
        return;
      }

      if (key.endsWith('/') && obj.size === 0) {
        folders.add(normalizeFolderKey(key));
        return;
      }

      items.push({
        key,
        isFolder: false,
        size: obj.size,
        lastModified: obj.lastModified
          ? new Date(obj.lastModified).toISOString()
          : null,
      });
    });

    stream.on('end', () => {
      const folderItems = Array.from(folders).map((folderKey) => ({
        key: normalizeFolderKey(folderKey),
        isFolder: true,
        size: 0,
        lastModified: null,
      }));
      const payload = {
        ok: true,
        bucket: MINIO_BUCKET,
        prefix: normalizedPrefix,
        items: [...folderItems, ...items],
      };
      done(payload);
    });

    stream.on('error', (error) => {
      warn('MinIO listObjects error:', error.message);
      done({ ok: false, error: error.message }, 500);
    });
  });

const listAllObjects = ({ extension }, res) =>
  new Promise((resolve) => {
    const items = [];
    const normalizedExt = extension ? `.${extension.toLowerCase()}` : null;
    let finished = false;

    const done = (payload, code = 200) => {
      if (finished) return;
      finished = true;
      sendJSON(res, code, payload);
      resolve();
    };

    const stream = minioClient.listObjectsV2(MINIO_BUCKET, '', true);

    stream.on('data', (obj) => {
      if (!obj || !obj.name || obj.name.endsWith('/')) {
        return;
      }
      if (
        normalizedExt &&
        !obj.name.toLowerCase().endsWith(normalizedExt)
      ) {
        return;
      }
      items.push({
        key: obj.name,
        isFolder: false,
        size: obj.size,
        lastModified: obj.lastModified
          ? new Date(obj.lastModified).toISOString()
          : null,
      });
    });

    stream.on('end', () =>
      done({
        ok: true,
        bucket: MINIO_BUCKET,
        items,
        flattened: true,
      })
    );
    stream.on('error', (error) => {
      warn('MinIO flatten error:', error.message);
      done({ ok: false, error: error.message }, 500);
    });
  });

const streamObject = async (key, mode, res) => {
  try {
    const stat = await minioClient.statObject(MINIO_BUCKET, key).catch(() => ({
      size: undefined,
      metaData: {},
    }));
    const objectStream = await minioClient.getObject(MINIO_BUCKET, key);
    const headers = {
      'Content-Type':
        (stat.metaData && stat.metaData['content-type']) ||
        (stat.metaData && stat.metaData['Content-Type']) ||
        'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'Content-Disposition': `${mode}; filename="${path
        .basename(key)
        .replace(/"/g, '')}"`,
    };
    Object.entries(headers).forEach(([header, value]) => {
      if (value !== undefined) {
        res.setHeader(header, value);
      }
    });
    objectStream.on('error', (error) => {
      warn('MinIO stream error:', error.message);
      if (!res.headersSent) {
        sendJSON(res, 500, { ok: false, error: error.message });
      } else {
        res.destroy(error);
      }
    });
    objectStream.pipe(res);
  } catch (error) {
    sendJSON(res, 404, { ok: false, error: error.message });
  }
};

const getStatusPayload = () => ({
  ok: bucketReady,
  bucket: MINIO_BUCKET,
  endpoint: MINIO_ENDPOINT,
  port: MINIO_S3_PORT,
  useSSL: MINIO_USE_SSL,
  hasClient: !!minioClient,
});

const app = connect();

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  log(req.method, req.url);
  next();
});

app.use((req, res, next) => {
  if (!req.url.startsWith('/api/storage')) {
    return next();
  }

  (async () => {
    if (!minioClient) {
      return sendJSON(res, 503, {
        ok: false,
        error: 'MinIO client unavailable',
      });
    }

    if (!bucketReady) {
      await ensureBucket();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === '/api/storage/status') {
      return sendJSON(res, 200, getStatusPayload());
    }

    if (!bucketReady) {
      return sendJSON(res, 503, {
        ok: false,
        error: 'MinIO bucket not ready',
      });
    }

    if (pathname === '/api/storage/list') {
      const prefix = url.searchParams.get('prefix') || '';
      return listObjects(prefix, res);
    }

    if (pathname === '/api/storage/flatten') {
      const ext = url.searchParams.get('ext') || '';
      return listAllObjects({ extension: ext }, res);
    }

    if (pathname === '/api/storage/file') {
      const key = url.searchParams.get('key');
      if (!key) {
        return sendJSON(res, 400, { ok: false, error: 'missing key' });
      }
      const download = url.searchParams.get('download') === '1';
      const inline = url.searchParams.get('inline') === '1';
      const mode = download || !inline ? 'attachment' : 'inline';
      return streamObject(key, mode, res);
    }

    return sendJSON(res, 404, { ok: false, error: 'not found' });
  })().catch((error) => {
    warn('Storage API error:', error.message);
    if (!res.headersSent) {
      sendJSON(res, 500, { ok: false, error: 'internal error' });
    } else {
      res.end();
    }
  });
});

app.use(
  serveStatic(ROOT, {
    index: ['index.html'],
  })
);

app.use((req, res) => {
  res.statusCode = 404;
  res.end('Not found');
});

http
  .createServer(app)
  .listen(PORT, () => {
    log(`Kiri MinIO portal available at http://localhost:${PORT}`);
    log(`Serving static files from ${ROOT}`);
  })
  .on('error', (err) => {
    console.error('Failed to start MinIO portal server:', err.message);
    process.exit(1);
  });
