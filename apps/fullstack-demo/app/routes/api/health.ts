import { createRoute } from "hibana/factory";

// JSON 返却の API route の例。 c.render は使わず c.json で直接 Response。
// = `app/routes/api/health.ts` → URL `/api/health` (nested directory も file-based)
export default createRoute((c) => c.json({ ok: true, ts: Date.now() }));
