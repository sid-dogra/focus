/**
 * Focus bridge — private HTTPS API so Muse can read and manage Focus tasks.
 * Runs as a Vercel serverless function (free Hobby tier; no Firebase Blaze needed).
 *
 * Deploy: import this repo in Vercel with Root Directory = `bridge`, then set
 * the env vars below and deploy. Endpoint: https://<project>.vercel.app/api/focus
 *
 * Env vars (Vercel project settings — never commit these):
 *   FIREBASE_SERVICE_ACCOUNT — full JSON of a Firebase service-account key
 *                                (or its base64). Gives the function admin
 *                                access to Firestore, bypassing client rules.
 *   FOCUS_API_KEY              — shared secret. Every request must carry it in
 *                                the `x-focus-key` header.
 *
 * Actions (GET: ?action=list or ?action=get&id=... ; POST with JSON body for the rest):
 *   list    -> { ok, tasks[] }   (active tasks; pass includeDone: true for everything)
 *   get     {id}                -> { ok, task }
 *   create  {title, notes?, category?, effort?, importance?, deadline?, link?,
 *             assignedDate?, scheduledStart?, scheduledEnd?, scheduledDate?, customMinutes?}
 *                                -> { ok, task }
 *   update  {id, ...fields}     -> { ok, task }
 *   complete {id}               -> { ok, task }   (status done, active false)
 *   reopen  {id}                -> { ok, task }   (status todo, active true)
 *   delete  {id}                -> { ok: true }   (soft delete, keeps the deletion marker)
 *
 * Field semantics match src/lib/tasks.js: importance is clamped 1-3, every
 * mutation bumps updatedAt (ms) and updatedAtServer, and deletes are
 * soft (active:false, deleted:true) so offline devices can't resurrect tasks.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { randomUUID, timingSafeEqual } from "node:crypto";

function getDb() {
  if (getApps().length === 0) {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(raw);
    } catch {
      serviceAccount = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    }
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

const CATEGORIES = new Set(["research", "admin", "startup", "personal"]);
const EFFORTS = new Set(["quick", "medium", "deep"]);

function isAuthorized(req) {
  const provided = req.headers["x-focus-key"] ?? "";
  const expected = process.env.FOCUS_API_KEY ?? "";
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided), "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function resolveUserId(db) {
  if (process.env.FOCUS_UID) return process.env.FOCUS_UID;
  const snap = await db.collection("users").limit(1).get();
  if (snap.empty) throw new Error("no user documents found");
  return snap.docs[0].id;
}

const withId = (doc) => ({ id: doc.id, ...doc.data() });

function cleanFields(input = {}) {
  const out = {};
  if (input.title !== undefined) out.title = String(input.title).trim();
  if (input.notes !== undefined) out.notes = String(input.notes ?? "");
  if (input.category !== undefined && CATEGORIES.has(input.category)) out.category = input.category;
  if (input.effort !== undefined && EFFORTS.has(input.effort)) out.effort = input.effort;
  if (input.importance !== undefined) {
    const n = Number(input.importance);
    if (Number.isFinite(n)) out.importance = Math.max(1, Math.min(3, Math.round(n)));
  }
  for (const key of ["deadline", "link", "assignedDate", "scheduledDate"]) {
    if (input[key] !== undefined) out[key] = input[key] || null;
  }
  for (const key of ["scheduledStart", "scheduledEnd", "customMinutes"]) {
    if (input[key] !== undefined) {
      const n = Number(input[key]);
      out[key] = Number.isFinite(n) ? n : null;
    }
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "x-focus-key, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  try {
    const db = getDb();
    const userId = await resolveUserId(db);
    const tasks = db.collection("users").doc(userId).collection("tasks");
    const params = req.method === "GET" ? req.query : (req.body ?? {});
    const action = params.action || "list";

    if (action === "list") {
      const includeDone = params.includeDone === true || params.includeDone === "1";
      let query = tasks;
      if (!includeDone) query = query.where("active", "==", true);
      const snap = await query.get();
      const items = snap.docs
        .map(withId)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      res.json({ ok: true, tasks: items });
      return;
    }

    if (action === "get") {
      const id = String(params.id || "");
      if (!id) { res.status(400).json({ ok: false, error: "id is required" }); return; }
      const doc = await tasks.doc(id).get();
      if (!doc.exists) { res.status(404).json({ ok: false, error: "not found" }); return; }
      res.json({ ok: true, task: withId(doc) });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "use POST for this action" });
      return;
    }

    if (action === "create") {
      const fields = cleanFields(params);
      if (!fields.title) { res.status(400).json({ ok: false, error: "title is required" }); return; }
      const now = Date.now();
      const ref = tasks.doc(randomUUID());
      await ref.set({
        ...fields,
        status: "todo",
        deleted: false,
        deletedAt: null,
        active: true,
        schemaVersion: 1,
        createdAt: new Date(now).toISOString(),
        updatedAt: now,
        createdAtServer: FieldValue.serverTimestamp(),
        updatedAtServer: FieldValue.serverTimestamp(),
      });
      res.json({ ok: true, task: withId(await ref.get()) });
      return;
    }

    if (action === "update" || action === "complete" || action === "reopen" || action === "delete") {
      const id = String(params.id || "");
      if (!id) { res.status(400).json({ ok: false, error: "id is required" }); return; }
      const ref = tasks.doc(id);
      const existing = await ref.get();
      if (!existing.exists) { res.status(404).json({ ok: false, error: "not found" }); return; }

      const now = Date.now();
      let patch;
      if (action === "delete") {
        patch = { active: false, deleted: true, deletedAt: now };
      } else {
        patch = cleanFields(params);
        if (action === "complete") patch.status = "done";
        if (action === "reopen") patch.status = "todo";
        if (patch.status !== undefined) {
          patch.active = patch.status !== "done" && existing.data().deleted !== true;
        }
      }
      patch.updatedAt = now;
      patch.updatedAtServer = FieldValue.serverTimestamp();
      await ref.set(patch, { merge: true });
      if (action === "delete") { res.json({ ok: true }); return; }
      res.json({ ok: true, task: withId(await ref.get()) });
      return;
    }

    res.status(400).json({ ok: false, error: `unknown action: ${action}` });
  } catch (err) {
    console.error("focus bridge error", err);
    res.status(500).json({ ok: false, error: "internal error" });
  }
}
