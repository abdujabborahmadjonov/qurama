"use strict";
/* A stand-in for Supabase, good enough to drive the real supabase-js client.

   It speaks the parts of PostgREST, GoTrue and Storage that Qurama actually
   uses, over plain HTTP and in memory. The point is to exercise the real query
   construction and error handling in server/lib/*, not to reimplement Postgres.

   Not used in production. `node test/run.js` starts it. */

const http = require("http");
const crypto = require("crypto");

function create() {
  const db = { submissions: [], entries: [] };
  const storage = new Map();          // "bucket/path" -> Buffer
  const users = new Map();            // email -> { id, password }
  const tokens = new Map();           // access token -> email
  const calls = [];                   // every request, for assertions

  function addUser(email, password) {
    const id = crypto.randomUUID();
    users.set(email.toLowerCase(), { id: id, password: password, email: email.toLowerCase() });
    return id;
  }

  function body(req) {
    return new Promise(function (resolve) {
      const chunks = [];
      req.on("data", function (c) { chunks.push(c); });
      req.on("end", function () { resolve(Buffer.concat(chunks)); });
    });
  }

  function json(res, code, payload) {
    const text = JSON.stringify(payload);
    res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
    res.end(text);
  }

  // "eq.3" / "like.foo*" applied to a row
  function matches(row, column, expr) {
    const dot = expr.indexOf(".");
    const op = expr.slice(0, dot);
    // URLSearchParams has already decoded the value; decoding again breaks on
    // a literal % inside a LIKE pattern.
    const raw = expr.slice(dot + 1);
    const value = row[column];
    if (op === "eq") return String(value) === raw;
    if (op === "neq") return String(value) !== raw;
    if (op === "like" || op === "ilike") {
      const rx = new RegExp("^" + raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, ".*").replace(/%/g, ".*") + "$", op === "ilike" ? "i" : "");
      return rx.test(String(value));
    }
    return true;
  }

  function project(row, select) {
    if (!select || select === "*") return Object.assign({}, row);
    const out = {};
    select.split(",").forEach(function (c) {
      const name = c.trim();
      if (name === "*") Object.assign(out, row);
      else out[name] = row[name];
    });
    return out;
  }

  const server = http.createServer(async function (req, res) {
    // Real Supabase is browser-callable, so the fake has to be too, otherwise
    // the front end can never be exercised against it.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "apikey,authorization,content-type,prefer,accept,x-client-info");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "content-range");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, "http://localhost");
    const raw = await body(req);
    calls.push({ method: req.method, path: url.pathname, query: url.search });

    const wantsObject = (req.headers.accept || "").indexOf("pgrst.object") !== -1;
    const send = function (rows) {
      if (!wantsObject) return json(res, 200, rows);
      if (rows.length !== 1) {
        return json(res, 406, {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: "Results contain " + rows.length + " rows",
        });
      }
      return json(res, 200, rows[0]);
    };

    /* ---------------- auth ---------------- */

    if (url.pathname === "/auth/v1/token") {
      const creds = JSON.parse(raw.toString() || "{}");
      const user = users.get(String(creds.email || "").toLowerCase());
      if (!user || user.password !== creds.password) {
        return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      }
      const token = crypto.randomBytes(24).toString("hex");
      tokens.set(token, user.email);
      return json(res, 200, {
        access_token: token, token_type: "bearer", expires_in: 3600,
        refresh_token: crypto.randomBytes(12).toString("hex"),
        user: { id: user.id, email: user.email },
      });
    }

    if (url.pathname === "/auth/v1/user") {
      const header = req.headers.authorization || "";
      const token = header.replace(/^Bearer /i, "");
      const email = tokens.get(token);
      if (!email) return json(res, 401, { message: "invalid claim: missing sub claim" });
      const user = users.get(email);
      return json(res, 200, { id: user.id, email: user.email, aud: "authenticated", role: "authenticated" });
    }

    /* ---------------- storage ---------------- */

    if (url.pathname.startsWith("/storage/v1/object/sign/")) {
      const key = url.pathname.slice("/storage/v1/object/sign/".length);
      if (!storage.has(key)) return json(res, 404, { message: "Object not found" });
      return json(res, 200, { signedURL: "/object/sign/" + key + "?token=" + crypto.randomBytes(8).toString("hex") });
    }

    if (url.pathname.startsWith("/storage/v1/object/")) {
      const key = url.pathname.slice("/storage/v1/object/".length);
      if (req.method === "POST" || req.method === "PUT") {
        if (storage.has(key)) return json(res, 409, { message: "The resource already exists" });
        storage.set(key, raw);
        return json(res, 200, { Key: key });
      }
      if (req.method === "DELETE") {
        // supabase-js .remove(paths) sends the bucket in the path and the
        // object names in the body
        const parsed = JSON.parse(raw.toString() || "{}");
        const bucket = key;
        (parsed.prefixes || []).forEach(function (p) { storage.delete(bucket + "/" + p); });
        return json(res, 200, []);
      }
      if (req.method === "GET") {
        const buf = storage.get(key);
        if (!buf) return json(res, 404, { message: "Object not found" });
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        return res.end(buf);
      }
    }

    /* ---------------- postgrest ---------------- */

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      if (!db[table]) return json(res, 404, { message: "relation does not exist" });
      const select = url.searchParams.get("select");

      const filtered = function () {
        let rows = db[table].slice();
        url.searchParams.forEach(function (value, key) {
          if (["select", "order", "limit", "offset"].indexOf(key) !== -1) return;
          rows = rows.filter(function (r) { return matches(r, key, value); });
        });
        const order = url.searchParams.get("order");
        if (order) {
          const [col, dir] = order.split(".");
          rows.sort(function (a, b) {
            const x = a[col], y = b[col];
            if (x === y) return 0;
            return (x > y ? 1 : -1) * (dir === "desc" ? -1 : 1);
          });
        }
        const limit = url.searchParams.get("limit");
        if (limit) rows = rows.slice(0, Number(limit));
        return rows;
      };

      if (req.method === "GET") {
        return send(filtered().map(function (r) { return project(r, select); }));
      }

      if (req.method === "POST") {
        const payload = JSON.parse(raw.toString() || "{}");
        const incoming = Array.isArray(payload) ? payload : [payload];
        const prefer = req.headers.prefer || "";
        const upsert = prefer.indexOf("merge-duplicates") !== -1;
        const written = incoming.map(function (row) {
          const record = Object.assign({}, row);
          if (!record.id) record.id = crypto.randomUUID();
          if (table === "submissions" && !record.created_at) record.created_at = new Date().toISOString();
          const existing = db[table].findIndex(function (r) { return r.id === record.id; });
          if (existing !== -1) {
            if (!upsert) { json(res, 409, { code: "23505", message: "duplicate key value" }); return null; }
            db[table][existing] = Object.assign({}, db[table][existing], record);
            return db[table][existing];
          }
          // reject an entries row whose submission is gone (the real FK)
          if (table === "entries" && !db.submissions.some(function (s) { return s.id === record.id; })) {
            json(res, 409, { code: "23503", message: "foreign key violation" });
            return null;
          }
          db[table].push(record);
          return record;
        });
        if (written.indexOf(null) !== -1) return;
        if (prefer.indexOf("return=representation") === -1) { res.writeHead(201); return res.end(); }
        return send(written.map(function (r) { return project(r, select); }));
      }

      if (req.method === "PATCH") {
        const patch = JSON.parse(raw.toString() || "{}");
        const rows = filtered();
        rows.forEach(function (r) { Object.assign(r, patch); });
        if ((req.headers.prefer || "").indexOf("return=representation") === -1) { res.writeHead(204); return res.end(); }
        return send(rows.map(function (r) { return project(r, select); }));
      }

      if (req.method === "DELETE") {
        const doomed = new Set(filtered().map(function (r) { return r.id; }));
        db[table] = db[table].filter(function (r) { return !doomed.has(r.id); });
        // ON DELETE CASCADE from submissions to entries
        if (table === "submissions") {
          db.entries = db.entries.filter(function (e) { return !doomed.has(e.id); });
        }
        if ((req.headers.prefer || "").indexOf("return=representation") === -1) { res.writeHead(204); return res.end(); }
        return send([]);
      }
    }

    json(res, 404, { message: "no route: " + req.method + " " + url.pathname });
  });

  return { server, db, storage, users, addUser, calls };
}

module.exports = { create };
