import { createClient } from "@supabase/supabase-js";

export const CATEGORIES = [
  "Electronics",
  "Personal Items",
  "Documents",
  "Clothing",
  "Others",
];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length)
    throw new Error("Missing environment variable: " + missing.join(", "));
}

// Full-access client. Server side only, never expose this key to the browser.
export function getSupabase() {
  need("SUPABASE_URL", "SUPABASE_SERVICE_KEY");
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    opts,
  );
}

// Client used only to sign staff in (uses the publishable/anon key).
export function getAuthClient() {
  need("SUPABASE_URL", "SUPABASE_ANON_KEY");
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    opts,
  );
}

/* ---------- staff authorization ---------- */
// Optional allow-list: STAFF_EMAILS="a@x.com,b@y.com". If unset, any Supabase
// user may act as staff, so turn OFF public sign-ups in Supabase in that case.
export function isAllowedStaff(email) {
  const list = (process.env.STAFF_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !list.length || list.includes(String(email || "").toLowerCase());
}

export async function requireStaff(req, supabase) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Please sign in.");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data || !data.user)
    throw new HttpError(401, "Your session ended. Sign in again.");
  if (!isAllowedStaff(data.user.email)) {
    throw new HttpError(
      403,
      "This account is not allowed to use the staff area.",
    );
  }
  return data.user;
}

// Best-effort audit trail. Never blocks the action if the table is missing.
export async function audit(
  supabase,
  user,
  action,
  reportId = null,
  details = null,
) {
  try {
    await supabase.from("audit_log").insert({
      staff_email: user.email,
      action,
      report_id: reportId,
      details,
    });
  } catch (e) {
    console.warn("audit log failed:", e && e.message);
  }
}

/* ---------- report validation ---------- */
export function cleanReport(report) {
  const s = (v) => String(v ?? "").trim();
  const r = {
    report_type: s(report.report_type),
    category: s(report.category),
    color: s(report.color),
    description: s(report.description),
    location: s(report.location),
    report_date: s(report.report_date),
    reporter_name: s(report.reporter_name),
    reporter_contact: s(report.reporter_contact),
    is_test: report.is_test === true,
  };

  const problems = [];
  if (!["lost", "found"].includes(r.report_type))
    problems.push("report_type must be lost or found");
  if (!CATEGORIES.includes(r.category)) problems.push("category is not valid");
  if (!r.color || r.color.length > 50)
    problems.push("color is required (max 50 characters)");
  if (!r.description || r.description.length > 2000)
    problems.push("description is required (max 2000 characters)");
  if (!r.location || r.location.length > 100)
    problems.push("location is required (max 100 characters)");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(r.report_date) ||
    Number.isNaN(new Date(r.report_date).getTime())
  )
    problems.push("date is not valid");
  if (!r.reporter_name || r.reporter_name.length > 100)
    problems.push("name is required (max 100 characters)");
  if (!/^[0-9+\-\s()]{7,20}$/.test(r.reporter_contact))
    problems.push("contact number is not valid");

  return { r, problems };
}
