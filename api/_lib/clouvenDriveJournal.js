const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_FIELDS = "id,operation_key,actor_id,item_id,operation_type,state,request_data";

export function apiError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

export function dbError(error, message = "Metadata Clouven Drive belum dapat diperbarui.") {
  if (error) throw apiError(503, message, "DRIVE_METADATA_UNAVAILABLE");
}

export function validateUuid(value, message = "ID tidak valid.") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw apiError(400, message, "INVALID_ID");
  return value;
}

export function readOperationKey(req) {
  const operationKey = String(req.headers?.["idempotency-key"] || "").trim();
  if (!UUID_PATTERN.test(operationKey)) {
    throw apiError(400, "Header Idempotency-Key wajib berupa UUID.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  return operationKey;
}

/** Deterministic JSON comparison so retried payloads may use any key order. */
export function stablePayload(value) {
  if (Array.isArray(value)) return value.map(stablePayload);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = stablePayload(value[key]);
    return sorted;
  }
  return value;
}

export function sameOperationPayload(operation, requestData) {
  try {
    return JSON.stringify(stablePayload(operation?.request_data || {})) === JSON.stringify(stablePayload(requestData || {}));
  } catch {
    return false;
  }
}

export async function loadDriveOperation(db, operationKey) {
  const { data, error } = await db
    .from("drive_operations")
    .select(OPERATION_FIELDS)
    .eq("operation_key", operationKey)
    .maybeSingle();
  dbError(error);
  return data;
}

/**
 * Returns `{ operation, replay }`. A replay has already been validated against
 * the actor, operation type, and request payload; the caller decides how to
 * answer it (return stored metadata or reconcile a interrupted operation).
 */
export async function beginDriveOperation(db, { actor, operationKey, operationType, requestData }) {
  const existing = await loadDriveOperation(db, operationKey);
  if (existing) {
    if (existing.actor_id !== actor.uid || existing.operation_type !== operationType) {
      throw apiError(409, "Idempotency-Key sudah digunakan untuk operasi lain.", "IDEMPOTENCY_KEY_CONFLICT");
    }
    if (!sameOperationPayload(existing, requestData)) {
      throw apiError(409, "Idempotency-Key sudah digunakan dengan isi permintaan yang berbeda.", "IDEMPOTENCY_PAYLOAD_CONFLICT");
    }
    return { operation: existing, replay: true };
  }

  const { data, error } = await db
    .from("drive_operations")
    .insert({
      operation_key: operationKey,
      actor_id: actor.uid,
      operation_type: operationType,
      state: "pending",
      request_data: requestData,
    })
    .select(OPERATION_FIELDS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      throw apiError(409, "Operasi dengan key ini sudah dibuat. Ulangi permintaan dengan key yang sama.", "IDEMPOTENCY_KEY_CONFLICT");
    }
    dbError(error);
  }
  if (!data) throw apiError(503, "Jurnal operasi tidak dapat dibuat.", "DRIVE_JOURNAL_FAILED");
  return { operation: data, replay: false };
}

export async function markDriveOperationRunning(db, operationId, itemId) {
  const { error } = await db
    .from("drive_operations")
    .update({ item_id: itemId, state: "running", updated_at: new Date().toISOString() })
    .eq("id", operationId);
  dbError(error);
}

export async function completeDriveOperation(db, operationId, extraRequestData) {
  const patch = {
    state: "succeeded",
    error_code: null,
    error_message: null,
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (extraRequestData) patch.request_data = extraRequestData;
  const { error } = await db.from("drive_operations").update(patch).eq("id", operationId);
  dbError(error);
}

export async function failDriveOperation(db, operationId, { code, message, reconciliation = false }) {
  const patch = {
    state: reconciliation ? "needs_reconciliation" : "failed",
    error_code: code || "DRIVE_OPERATION_FAILED",
    error_message: String(message || "Drive operation failed").slice(0, 500),
    updated_at: new Date().toISOString(),
  };
  if (!reconciliation) patch.finished_at = new Date().toISOString();
  try {
    await db.from("drive_operations").update(patch).eq("id", operationId);
  } catch {
    // Recovery metadata is best-effort; never mask the original API error.
  }
}
