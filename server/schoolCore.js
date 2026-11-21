import crypto from "node:crypto";
import express from "express";
import pool from "./db.js";

const router = express.Router();
const SESSION_SECRET = process.env.SESSION_SECRET || "local-development-secret-change-before-deploying";

function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function validPassword(password, stored) {
  const [salt, expected] = String(stored).split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function issueToken(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, session_version: user.session_version || 0, exp: Date.now() + 1000 * 60 * 60 * 12 })).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readToken(token) {
  try {
    const [payload, signature] = String(token || "").split(".");
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    return decoded.exp > Date.now() ? decoded : null;
  } catch { return null; }
}

async function getUser(id) {
  const result = await pool.query(`SELECT id, username, role, staff_id, student_id, display_name, must_change_password, session_version FROM school_users WHERE id = $1 AND active = true`, [id]);
  return result.rows[0] || null;
}

export async function initialiseSchoolCore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS school_users (
    id BIGSERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('principal','admin','teacher','student','parent')),
    display_name TEXT NOT NULL, staff_id TEXT, student_id TEXT, active BOOLEAN NOT NULL DEFAULT true,
    must_change_password BOOLEAN NOT NULL DEFAULT false, session_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query("ALTER TABLE school_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false");
  await pool.query("ALTER TABLE school_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0");
  await pool.query(`ALTER TABLE school_users DROP CONSTRAINT IF EXISTS school_users_role_check`);
  await pool.query(`ALTER TABLE school_users ADD CONSTRAINT school_users_role_check CHECK (role IN ('principal','admin','teacher','student','parent'))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_staff (
    id BIGSERIAL PRIMARY KEY, staff_id TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL,
    email TEXT, phone TEXT, department TEXT, position TEXT, staff_type TEXT NOT NULL DEFAULT 'Teaching',
    status TEXT NOT NULL DEFAULT 'Active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_classes (
    id BIGSERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, academic_year TEXT, class_teacher_id TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_subjects (
    id BIGSERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_teacher_assignments (
    id BIGSERIAL PRIMARY KEY, staff_id TEXT NOT NULL, class_id BIGINT REFERENCES school_classes(id) ON DELETE CASCADE,
    subject_id BIGINT REFERENCES school_subjects(id) ON DELETE CASCADE, academic_year TEXT, periods_per_week INTEGER NOT NULL DEFAULT 0,
    UNIQUE(staff_id, class_id, subject_id, academic_year)
  )`);
  await pool.query("ALTER TABLE school_teacher_assignments ADD COLUMN IF NOT EXISTS periods_per_week INTEGER NOT NULL DEFAULT 0");
  const standardClasses = ["Kindergarten 1", "Kindergarten 2", "Kindergarten 3", ...Array.from({ length: 5 }, (_, index) => `Primary ${index + 1}`), ...Array.from({ length: 3 }, (_, index) => `JHS ${index + 1}`), ...Array.from({ length: 3 }, (_, index) => `SSS ${index + 1}`)];
  for (const className of standardClasses) await pool.query("INSERT INTO school_classes (name) VALUES ($1) ON CONFLICT(name) DO NOTHING", [className]);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_curriculum_documents (
    id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, filename TEXT NOT NULL, class_id BIGINT REFERENCES school_classes(id) ON DELETE CASCADE,
    subject_id BIGINT REFERENCES school_subjects(id) ON DELETE CASCADE, term TEXT NOT NULL, academic_year TEXT,
    content_type TEXT NOT NULL DEFAULT 'application/pdf', content BYTEA NOT NULL, uploaded_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_attendance_records (
    id BIGSERIAL PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT, class_name TEXT, attendance_date DATE NOT NULL,
    status TEXT NOT NULL, remarks TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(student_id, attendance_date)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_fee_records (
    id BIGSERIAL PRIMARY KEY, student_id TEXT NOT NULL, student_name TEXT, class_name TEXT, fee_type TEXT NOT NULL,
    academic_year TEXT, amount_due NUMERIC(12,2) NOT NULL DEFAULT 0, amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(student_id, fee_type, academic_year)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_fee_payments (
    id BIGSERIAL PRIMARY KEY, reference TEXT UNIQUE NOT NULL, fee_record_id BIGINT NOT NULL REFERENCES school_fee_records(id),
    parent_user_id BIGINT NOT NULL REFERENCES school_users(id), amount_kobo BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), verified_at TIMESTAMPTZ
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_announcements (
    id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, audience TEXT NOT NULL CHECK (audience IN ('all','teacher','student','parent','admin')),
    created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_student_profiles (
    student_id TEXT PRIMARY KEY, guardian_name TEXT, guardian_phone TEXT, interests TEXT,
    curriculum_notes TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_parent_student_links (
    id BIGSERIAL PRIMARY KEY, parent_user_id BIGINT NOT NULL REFERENCES school_users(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL, relation TEXT NOT NULL DEFAULT 'Parent', active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(parent_user_id, student_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_student_activities (
    id BIGSERIAL PRIMARY KEY, student_id TEXT NOT NULL, title TEXT NOT NULL, category TEXT,
    activity_date DATE, description TEXT, recorded_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS school_password_reset_requests (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES school_users(id) ON DELETE CASCADE,
    requested_username TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const existing = await pool.query("SELECT id FROM school_users LIMIT 1");
  if (!existing.rows.length) {
    const initialPassword = process.env.INITIAL_PRINCIPAL_PASSWORD;
    if (!initialPassword || initialPassword.length < 12) {
      throw new Error("Set INITIAL_PRINCIPAL_PASSWORD to a unique password of at least 12 characters before creating the first principal account.");
    }
    await pool.query(`INSERT INTO school_users (username, password_hash, role, display_name, must_change_password) VALUES ($1,$2,'principal','School Principal',true)`, ["principal", passwordHash(initialPassword)]);
    console.info("Created the initial principal account. Change the configured initial password at first sign-in.");
  }
  const principals = await pool.query("SELECT id, password_hash FROM school_users WHERE role='principal' AND must_change_password=false");
  for (const principal of principals.rows) {
    if (validPassword("ChangeMe123!", principal.password_hash)) {
      await pool.query("UPDATE school_users SET must_change_password=true WHERE id=$1", [principal.id]);
    }
  }
}

async function requireUser(req, res, next) {
  const token = readToken(req.headers.authorization?.replace(/^Bearer\s+/i, ""));
  const user = token && await getUser(token.id);
  if (!user || Number(token.session_version || 0) !== Number(user.session_version)) return res.status(401).json({ success: false, message: "Please sign in to continue." });
  if (user.must_change_password && !["/auth/me", "/auth/change-password"].includes(req.path)) {
    return res.status(403).json({ success: false, code: "PASSWORD_CHANGE_REQUIRED", message: "Change your password to continue." });
  }
  req.user = user;
  next();
}

const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ success: false, message: "You do not have permission for this action." });

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, message: "Username and password are required." });
  const result = await pool.query("SELECT * FROM school_users WHERE LOWER(username) = LOWER($1) AND active = true", [username.trim()]);
  const user = result.rows[0];
  if (!user || !validPassword(password, user.password_hash)) return res.status(401).json({ success: false, message: "Incorrect username or password." });
  const safeUser = await getUser(user.id);
  res.json({ success: true, token: issueToken(safeUser), user: safeUser });
});

router.post("/auth/signup", async (req, res) => {
  const { username, password, display_name, role, staff_id, student_id } = req.body || {};
  if (!username || !password || !display_name || role !== "teacher") return res.status(400).json({ success: false, message: "Public registration is available to verified staff only. Ask the principal for a student or parent login." });
  if (password.length < 8) return res.status(400).json({ success: false, message: "Use a password with at least 8 characters." });
  if (role === "teacher") {
    if (!staff_id) return res.status(400).json({ success: false, message: "Your school staff ID is required." });
    const staff = await pool.query("SELECT staff_id, full_name FROM school_staff WHERE staff_id=$1 AND status='Active'", [staff_id.trim()]);
    if (!staff.rows.length) return res.status(400).json({ success: false, message: "That staff ID was not found. Ask the principal to add your staff record first." });
    const account = await pool.query("SELECT id FROM school_users WHERE staff_id=$1", [staff_id.trim()]);
    if (account.rows.length) return res.status(409).json({ success: false, message: "A login account already exists for this staff ID." });
  }
  if (role === "student") {
    if (!student_id) return res.status(400).json({ success: false, message: "Your school student ID is required." });
    const student = await pool.query("SELECT student_id FROM students WHERE student_id=$1", [student_id.trim()]);
    if (!student.rows.length) return res.status(400).json({ success: false, message: "That student ID was not found. Use the ID on your school record." });
    const account = await pool.query("SELECT id FROM school_users WHERE student_id=$1", [student_id.trim()]);
    if (account.rows.length) return res.status(409).json({ success: false, message: "A login account already exists for this student ID." });
  }
  if (role === "parent") {
    if (!student_id) return res.status(400).json({ success: false, message: "The student ID for your child is required to create a parent account." });
    const student = await pool.query("SELECT student_id, student_name FROM students WHERE student_id=$1", [student_id.trim()]);
    if (!student.rows.length) return res.status(400).json({ success: false, message: "That student ID was not found. Ask the school to add the child record first." });
    const account = await pool.query("SELECT id FROM school_users WHERE student_id=$1 AND role='parent'", [student_id.trim()]);
    if (account.rows.length) return res.status(409).json({ success: false, message: "A parent account is already linked to this student record." });
  }
  try {
    const created = await pool.query(`INSERT INTO school_users (username,password_hash,role,display_name,staff_id,student_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,username,role,display_name,staff_id,student_id`, [username.trim(), passwordHash(password), role, display_name.trim(), staff_id?.trim() || null, student_id?.trim() || null]);
    const user = created.rows[0];
    if (role === "parent") {
      await pool.query(`INSERT INTO school_parent_student_links (parent_user_id, student_id, relation) VALUES ($1,$2,'Parent') ON CONFLICT(parent_user_id, student_id) DO NOTHING`, [user.id, student_id.trim()]);
    }
    res.status(201).json({ success: true, token: issueToken(user), user });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ success: false, message: "That username already exists. Please choose another." });
    throw error;
  }
});

router.post("/auth/password-reset-request", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  if (!username) return res.status(400).json({ success: false, message: "Enter your username." });
  const user = await pool.query("SELECT id FROM school_users WHERE LOWER(username)=LOWER($1)", [username]);
  if (user.rows[0]) await pool.query("INSERT INTO school_password_reset_requests (user_id, requested_username) VALUES ($1,$2)", [user.rows[0].id, username]);
  res.json({ success: true, message: "If the account exists, the request has been recorded. Contact your school administrator through the usual channel for help." });
});

router.get("/auth/me", requireUser, (req, res) => res.json({ success: true, user: req.user }));

router.post("/auth/change-password", requireUser, async (req, res) => {
  const currentPassword = typeof req.body?.current_password === "string" ? req.body.current_password : "";
  const newPassword = typeof req.body?.new_password === "string" ? req.body.new_password : "";
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: "Current and new passwords are required." });
  }
  if (newPassword.length < 12 || newPassword.length > 128) {
    return res.status(400).json({ success: false, message: "Use a new password between 12 and 128 characters." });
  }
  const stored = await pool.query("SELECT password_hash FROM school_users WHERE id=$1", [req.user.id]);
  if (!stored.rows[0] || !validPassword(currentPassword, stored.rows[0].password_hash)) {
    return res.status(400).json({ success: false, message: "The current password is incorrect." });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ success: false, message: "Choose a new password different from your current password." });
  }
  const updated = await pool.query(`UPDATE school_users SET password_hash=$1, must_change_password=false, session_version=session_version+1 WHERE id=$2 RETURNING id`, [passwordHash(newPassword), req.user.id]);
  const user = await getUser(updated.rows[0].id);
  res.json({ success: true, token: issueToken(user), user });
});

router.get("/portal/overview", requireUser, async (req, res) => {
  if (req.user.role === "teacher") {
    const assignments = await pool.query(`SELECT c.name AS class_name, s.name AS subject_name, a.academic_year, a.periods_per_week FROM school_teacher_assignments a JOIN school_classes c ON c.id=a.class_id JOIN school_subjects s ON s.id=a.subject_id WHERE a.staff_id=$1 ORDER BY c.name,s.name`, [req.user.staff_id]);
    const profile = await pool.query("SELECT * FROM school_staff WHERE staff_id=$1", [req.user.staff_id]);
    return res.json({ success: true, profile: profile.rows[0] || req.user, assignments: assignments.rows });
  }
  if (req.user.role === "student") {
    const profile = await pool.query("SELECT * FROM school_student_profiles WHERE student_id=$1", [req.user.student_id]);
    const activities = await pool.query("SELECT * FROM school_student_activities WHERE student_id=$1 ORDER BY activity_date DESC NULLS LAST, id DESC LIMIT 20", [req.user.student_id]);
    const student = await pool.query("SELECT student_name, class_name, academic_year, attendance_percentage, average_score, overall_grade, result_status FROM students WHERE student_id=$1 LIMIT 1", [req.user.student_id]);
    const results = await pool.query(`SELECT id, academic_year, term, class_name, subject, test_score, exam_score, total_score, average_score, grade, result_status FROM academic_records WHERE student_id=$1 ORDER BY academic_year DESC NULLS LAST, term DESC NULLS LAST, id DESC`, [req.user.student_id]);
    const className = student.rows[0]?.class_name;
    const assignments = className ? await pool.query(`SELECT DISTINCT c.name AS class_name, s.name AS subject_name, a.academic_year FROM school_teacher_assignments a JOIN school_classes c ON c.id=a.class_id JOIN school_subjects s ON s.id=a.subject_id WHERE c.name=$1 ORDER BY s.name`, [className]) : { rows: [] };
    const documents = className ? await pool.query(`SELECT d.id,d.title,d.filename,d.term,d.academic_year,c.name AS class_name,s.name AS subject_name FROM school_curriculum_documents d JOIN school_classes c ON c.id=d.class_id JOIN school_subjects s ON s.id=d.subject_id WHERE c.name=$1 ORDER BY d.created_at DESC`, [className]) : { rows: [] };
    const subjects = [...new Set([...assignments.rows.map((assignment) => assignment.subject_name), ...results.rows.map((result) => result.subject)].filter(Boolean))];
    return res.json({ success: true, profile: profile.rows[0] || {}, student: student.rows[0] || {}, activities: activities.rows, results: results.rows, subjects, documents: documents.rows });
  }
  if (req.user.role === "parent") {
    const links = await pool.query(`SELECT l.student_id, l.relation, s.student_name, s.class_name, s.academic_year, s.attendance_percentage, s.average_score, s.overall_grade, s.result_status,
      p.guardian_name, p.guardian_phone, p.interests, p.curriculum_notes
      FROM school_parent_student_links l
      JOIN students s ON s.student_id = l.student_id
      LEFT JOIN school_student_profiles p ON p.student_id = s.student_id
      WHERE l.parent_user_id = $1 AND l.active = true
      ORDER BY s.student_name`, [req.user.id]);

    const children = await Promise.all(links.rows.map(async (child) => {
      const recentResults = await pool.query(`SELECT id, academic_year, term, class_name, subject, test_score, exam_score, total_score, average_score, grade, result_status FROM academic_records WHERE student_id=$1 ORDER BY academic_year DESC NULLS LAST, term DESC NULLS LAST, id DESC`, [child.student_id]);
      const recentActivities = await pool.query(`SELECT * FROM school_student_activities WHERE student_id=$1 ORDER BY activity_date DESC NULLS LAST, id DESC LIMIT 5`, [child.student_id]);
      const latestAttendance = await pool.query(`SELECT attendance_percentage, remarks FROM attendance_records WHERE student_id=$1 ORDER BY academic_year DESC NULLS LAST, id DESC LIMIT 1`, [child.student_id]);
      const fees = await pool.query(`SELECT id, student_id, fee_type, academic_year, amount_due, amount_paid, payment_date FROM school_fee_records WHERE student_id=$1 ORDER BY academic_year DESC NULLS LAST, fee_type`, [child.student_id]);
      const documents = await pool.query(`SELECT d.id,d.title,d.filename,d.term,d.academic_year,c.name AS class_name,s.name AS subject_name FROM school_curriculum_documents d JOIN school_classes c ON c.id=d.class_id JOIN school_subjects s ON s.id=d.subject_id WHERE c.name=$1 ORDER BY d.created_at DESC`, [child.class_name]);
      const assignments = await pool.query(`SELECT DISTINCT s.name AS subject_name FROM school_teacher_assignments a JOIN school_classes c ON c.id=a.class_id JOIN school_subjects s ON s.id=a.subject_id WHERE c.name=$1 ORDER BY s.name`, [child.class_name]);
      const summary = {
        student_id: child.student_id,
        student_name: child.student_name,
        class_name: child.class_name,
        academic_year: child.academic_year,
        attendance_percentage: Number(child.attendance_percentage || latestAttendance.rows[0]?.attendance_percentage || 0),
        average_score: Number(child.average_score || recentResults.rows[0]?.average_score || 0),
        overall_grade: child.overall_grade || recentResults.rows[0]?.grade || "—",
        result_status: child.result_status || recentResults.rows[0]?.result_status || "Active",
        subjects: [...new Set([...assignments.rows.map((assignment) => assignment.subject_name), ...recentResults.rows.map((result) => result.subject)].filter(Boolean))],
        guardian_name: child.guardian_name || "School contact",
        interests: child.interests || "—",
        curriculum_notes: child.curriculum_notes || "No curriculum notes available yet.",
        recent_results: recentResults.rows,
        recent_activities: recentActivities.rows,
        fees: fees.rows,
        documents: documents.rows,
        insights: {
          is_at_risk: Number(child.attendance_percentage || latestAttendance.rows[0]?.attendance_percentage || 0) < 75 || Number(child.average_score || recentResults.rows[0]?.average_score || 0) < 50,
          summary: Number(child.attendance_percentage || latestAttendance.rows[0]?.attendance_percentage || 0) < 75 ? "Attendance or performance needs attention." : "Performance is tracking well this term."
        }
      };
      return summary;
    }));

    const averageAttendance = children.length ? children.reduce((total, child) => total + Number(child.attendance_percentage || 0), 0) / children.length : 0;
    const averageScore = children.length ? children.reduce((total, child) => total + Number(child.average_score || 0), 0) / children.length : 0;

    return res.json({
      success: true,
      children,
      summary: {
        total_children: children.length,
        average_attendance: Number(averageAttendance.toFixed(1)),
        average_score: Number(averageScore.toFixed(1)),
        watchlist: children.filter((child) => child.insights?.is_at_risk).length
      }
    });
  }
  const counts = await Promise.all(["school_users", "school_staff", "school_classes", "school_subjects"].map(async (table) => Number((await pool.query(`SELECT COUNT(*) FROM ${table}`)).rows[0].count)));
  res.json({ success: true, counts: { users: counts[0], staff: counts[1], classes: counts[2], subjects: counts[3] } });
});

router.post("/admin/accounts", requireUser, allow("principal", "admin"), async (req, res) => {
  const { username, password, role, display_name, staff_id, student_id } = req.body || {};
  if (!username || !password || !display_name || !["admin", "teacher", "student", "parent"].includes(role)) return res.status(400).json({ success: false, message: "Username, password, name, and a valid role are required." });
  if (role === "teacher" && !staff_id) return res.status(400).json({ success: false, message: "A staff ID is required for a teacher account." });
  if (role === "student" && !student_id) return res.status(400).json({ success: false, message: "A student ID is required for a student account." });
  if (role === "parent" && !student_id) return res.status(400).json({ success: false, message: "A child student ID is required for a parent account." });
  const created = await pool.query(`INSERT INTO school_users (username,password_hash,role,display_name,staff_id,student_id,must_change_password) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id,username,role,display_name,staff_id,student_id,must_change_password`, [username.trim(), passwordHash(password), role, display_name.trim(), staff_id || null, student_id || null]);
  const user = created.rows[0];
  if (role === "parent") {
    await pool.query(`INSERT INTO school_parent_student_links (parent_user_id, student_id, relation) VALUES ($1,$2,'Parent') ON CONFLICT(parent_user_id, student_id) DO NOTHING`, [user.id, student_id.trim()]);
  }
  res.status(201).json({ success: true, user });
});

router.get("/admin/student-parent-accounts", requireUser, allow("principal", "admin"), async (_req, res) => {
  const result = await pool.query(`SELECT u.id,u.username,u.role,u.display_name,u.student_id,
    COALESCE(json_agg(json_build_object('student_id',l.student_id,'student_name',s.student_name) ORDER BY s.student_name) FILTER (WHERE l.id IS NOT NULL), '[]'::json) AS linked_students
    FROM school_users u
    LEFT JOIN school_parent_student_links l ON l.parent_user_id=u.id AND l.active=true
    LEFT JOIN students s ON s.student_id=l.student_id
    WHERE u.role IN ('student','parent')
    GROUP BY u.id
    ORDER BY u.role,u.display_name`);
  res.json({ success: true, accounts: result.rows });
});

router.get("/admin/learner-students", requireUser, allow("principal", "admin"), async (_req, res) => {
  const result = await pool.query("SELECT student_id,student_name,class_name FROM students ORDER BY student_name");
  res.json({ success: true, students: result.rows });
});

router.post("/admin/provision-student-parent", requireUser, allow("principal", "admin"), async (req, res) => {
  const { username, password, role, display_name, student_ids } = req.body || {};
  const linkedStudentIds = [...new Set((Array.isArray(student_ids) ? student_ids : [req.body?.student_id]).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!username?.trim() || !password || password.length < 8 || !display_name?.trim() || !["student", "parent"].includes(role)) {
    return res.status(400).json({ success: false, message: "Name, username, role, linked student, and a password with at least 8 characters are required." });
  }
  if (!linkedStudentIds.length || (role === "student" && linkedStudentIds.length !== 1)) {
    return res.status(400).json({ success: false, message: "Choose one student for a student account, or at least one child for a parent account." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const students = await client.query("SELECT student_id FROM students WHERE student_id = ANY($1::text[])", [linkedStudentIds]);
    if (students.rows.length !== linkedStudentIds.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "One or more selected student records could not be found." });
    }
    if (role === "student") {
      const existing = await client.query("SELECT id FROM school_users WHERE student_id=$1 AND role='student'", [linkedStudentIds[0]]);
      if (existing.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: "A student login already exists for this student ID." });
      }
    }
    const account = await client.query(`INSERT INTO school_users (username,password_hash,role,display_name,student_id,must_change_password)
      VALUES ($1,$2,$3,$4,$5,true) RETURNING id,username,role,display_name,student_id,must_change_password`, [username.trim(), passwordHash(password), role, display_name.trim(), linkedStudentIds[0]]);
    if (role === "parent") {
      for (const studentId of linkedStudentIds) {
        await client.query(`INSERT INTO school_parent_student_links (parent_user_id,student_id,relation) VALUES ($1,$2,'Parent')`, [account.rows[0].id, studentId]);
      }
    }
    await client.query("COMMIT");
    res.status(201).json({ success: true, user: account.rows[0], linked_student_ids: linkedStudentIds });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ success: false, message: "That username already exists. Please choose another." });
    throw error;
  } finally {
    client.release();
  }
});

router.post("/admin/parent-links", requireUser, allow("principal", "admin"), async (req, res) => {
  const { parent_user_id, student_id, relation = "Parent" } = req.body || {};
  if (!parent_user_id || !student_id) return res.status(400).json({ success: false, message: "Parent account and student ID are required." });
  const parent = await pool.query("SELECT id FROM school_users WHERE id = $1 AND role = 'parent'", [Number(parent_user_id)]);
  if (!parent.rows.length) return res.status(404).json({ success: false, message: "Parent account not found." });
  const student = await pool.query("SELECT student_id FROM students WHERE student_id = $1", [student_id.trim()]);
  if (!student.rows.length) return res.status(404).json({ success: false, message: "Student record not found." });
  const link = await pool.query(`INSERT INTO school_parent_student_links (parent_user_id, student_id, relation) VALUES ($1,$2,$3) ON CONFLICT(parent_user_id, student_id) DO NOTHING RETURNING *`, [Number(parent_user_id), student_id.trim(), relation]);
  res.status(201).json({ success: true, link: link.rows[0] || { parent_user_id: Number(parent_user_id), student_id: student_id.trim(), relation } });
});

router.post("/admin/staff", requireUser, allow("principal", "admin"), async (req, res) => {
  const { staff_id, full_name, email, phone, department, position, staff_type } = req.body || {};
  if (!staff_id || !full_name) return res.status(400).json({ success: false, message: "Staff ID and full name are required." });
  const created = await pool.query(`INSERT INTO school_staff (staff_id,full_name,email,phone,department,position,staff_type) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [staff_id, full_name, email || null, phone || null, department || null, position || null, staff_type || "Teaching"]);
  res.status(201).json({ success: true, staff: created.rows[0] });
});

router.post("/admin/staff/import", requireUser, allow("principal", "admin"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ success: false, message: "The upload contains no staff rows." });
  let imported = 0;
  for (const row of rows) {
    const values = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim().replace(/[ _-]+/g, " "), String(value ?? "").trim()]));
    const staffId = values["staff id"] || values["employee id"] || values.id;
    const fullName = values["full name"] || values.name || values["staff name"];
    if (!staffId || !fullName) continue;
    await pool.query(`INSERT INTO school_staff (staff_id,full_name,email,phone,department,position,staff_type,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(staff_id) DO UPDATE SET full_name=EXCLUDED.full_name,email=EXCLUDED.email,phone=EXCLUDED.phone,department=EXCLUDED.department,position=EXCLUDED.position,staff_type=EXCLUDED.staff_type,status=EXCLUDED.status`, [staffId, fullName, values.email || null, values.phone || null, values.department || null, values.position || null, values["staff type"] || "Teaching", values.status || "Active"]);
    imported++;
  }
  res.json({ success: true, imported });
});

router.get("/admin/staff", requireUser, allow("principal", "admin"), async (req, res) => {
  const staff = await pool.query(`SELECT s.*, u.username AS login_username, u.id AS user_account_id
    FROM school_staff s LEFT JOIN school_users u ON u.staff_id = s.staff_id
    ORDER BY s.full_name`);
  res.json({ success: true, staff: staff.rows });
});

router.post("/admin/provision-staff", requireUser, allow("principal", "admin"), async (req, res) => {
  const { staff_id, full_name, email, phone, department, position, staff_type, username, password } = req.body || {};
  if (!staff_id || !full_name || !username || !password || password.length < 8) return res.status(400).json({ success: false, message: "Staff ID, full name, username, and a password with at least 8 characters are required." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const staff = await client.query(`INSERT INTO school_staff (staff_id,full_name,email,phone,department,position,staff_type) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [staff_id.trim(), full_name.trim(), email || null, phone || null, department || null, position || null, staff_type || "Teaching"]);
    const account = await client.query(`INSERT INTO school_users (username,password_hash,role,display_name,staff_id,must_change_password) VALUES ($1,$2,'teacher',$3,$4,true) RETURNING id,username,role,display_name,staff_id,must_change_password`, [username.trim(), passwordHash(password), full_name.trim(), staff_id.trim()]);
    await client.query("COMMIT");
    res.status(201).json({ success: true, staff: staff.rows[0], user: account.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ success: false, message: "That staff ID or username already exists." });
    throw error;
  } finally { client.release(); }
});

router.get("/admin/classes-subjects", requireUser, allow("principal", "admin"), async (_req, res) => {
  const [classes, subjects, assignments] = await Promise.all([
    pool.query("SELECT * FROM school_classes ORDER BY name"),
    pool.query("SELECT * FROM school_subjects ORDER BY name"),
    pool.query(`SELECT a.*, c.name AS class_name, s.name AS subject_name, st.full_name AS teacher_name FROM school_teacher_assignments a JOIN school_classes c ON c.id=a.class_id JOIN school_subjects s ON s.id=a.subject_id LEFT JOIN school_staff st ON st.staff_id=a.staff_id ORDER BY c.name,s.name`),
  ]);
  res.json({ success: true, classes: classes.rows, subjects: subjects.rows, assignments: assignments.rows });
});

router.post("/admin/classes", requireUser, allow("principal", "admin"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ success: false, message: "Class name is required." });
  const result = await pool.query("INSERT INTO school_classes (name,academic_year) VALUES ($1,$2) ON CONFLICT(name) DO UPDATE SET academic_year=COALESCE(EXCLUDED.academic_year,school_classes.academic_year) RETURNING *", [name, req.body?.academic_year || null]);
  res.status(201).json({ success: true, class: result.rows[0] });
});

router.post("/admin/subjects", requireUser, allow("principal", "admin"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ success: false, message: "Subject name is required." });
  const result = await pool.query("INSERT INTO school_subjects (name,description) VALUES ($1,$2) ON CONFLICT(name) DO UPDATE SET description=COALESCE(EXCLUDED.description,school_subjects.description) RETURNING *", [name, req.body?.description || null]);
  res.status(201).json({ success: true, subject: result.rows[0] });
});

router.post("/admin/classes-subjects/import", requireUser, allow("principal", "admin"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ success: false, message: "The upload contains no rows." });
  let imported = 0;
  for (const row of rows) {
    const values = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim().replace(/[ _-]+/g, " "), String(value ?? "").trim()]));
    const className = values.class || values["class name"] || values.grade;
    const subjectName = values.subject || values["subject name"];
    if (!className && !subjectName) continue;
    const year = values["academic year"] || values.year || null;
    const term = values.term || "";
    const classRow = className ? await pool.query("INSERT INTO school_classes (name,academic_year) VALUES ($1,$2) ON CONFLICT(name) DO UPDATE SET academic_year=COALESCE(EXCLUDED.academic_year,school_classes.academic_year) RETURNING id", [className, year]) : null;
    const subjectRow = subjectName ? await pool.query("INSERT INTO school_subjects (name) VALUES ($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id", [subjectName]) : null;
    const staffId = values["teacher id"] || values["staff id"] || "";
    const teacherName = values.teacher || values["teacher name"] || "";
    if (classRow && subjectRow && (staffId || teacherName)) {
      const staff = staffId ? await pool.query("SELECT staff_id FROM school_staff WHERE staff_id=$1", [staffId]) : await pool.query("SELECT staff_id FROM school_staff WHERE LOWER(full_name)=LOWER($1) LIMIT 1", [teacherName]);
      if (staff.rows[0]) await pool.query("INSERT INTO school_teacher_assignments (staff_id,class_id,subject_id,academic_year,periods_per_week) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (staff_id,class_id,subject_id,academic_year) DO UPDATE SET periods_per_week=EXCLUDED.periods_per_week", [staff.rows[0].staff_id, classRow.rows[0].id, subjectRow.rows[0].id, year, Math.max(0, Number(values["periods per week"] || values.hours || 0) || 0)]);
    }
    if (classRow && subjectRow && (values.curriculum || values.syllabus)) {
      const text = [values.curriculum ? `Curriculum: ${values.curriculum}` : "", values.syllabus ? `Syllabus: ${values.syllabus}` : ""].filter(Boolean).join("\n");
      await pool.query("INSERT INTO school_curriculum_documents (title,filename,class_id,subject_id,term,academic_year,content_type,content,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,'text/plain',$7,$8)", [`${subjectName} ${term} curriculum`, "uploaded-curriculum.txt", classRow.rows[0].id, subjectRow.rows[0].id, term || "All terms", year, Buffer.from(text), req.user.display_name]);
    }
    imported++;
  }
  res.json({ success: true, imported });
});

router.post("/admin/assignments", requireUser, allow("principal", "admin"), async (req, res) => {
  const { staff_id, class_id, subject_id, academic_year, periods_per_week = 0 } = req.body || {};
  if (!staff_id || !class_id || !subject_id) return res.status(400).json({ success: false, message: "Staff, class, and subject are required." });
  const created = await pool.query(`INSERT INTO school_teacher_assignments (staff_id,class_id,subject_id,academic_year,periods_per_week) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (staff_id,class_id,subject_id,academic_year) DO UPDATE SET periods_per_week=EXCLUDED.periods_per_week RETURNING *`, [staff_id, class_id, subject_id, academic_year || null, Math.max(0, Number(periods_per_week) || 0)]);
  res.status(201).json({ success: true, assignment: created.rows[0] || null });
});

router.post("/admin/curriculum-documents", requireUser, allow("principal", "admin"), async (req, res) => {
  const { title, filename, class_id, subject_id, term, academic_year, content_base64, content_type } = req.body || {};
  if (!title || !filename || !class_id || !subject_id || !term || !content_base64) return res.status(400).json({ success: false, message: "Title, class, subject, term, and a file are required." });
  if (Buffer.byteLength(content_base64, "base64") > 15 * 1024 * 1024) return res.status(413).json({ success: false, message: "PDF files must be 15 MB or smaller." });
  const result = await pool.query("INSERT INTO school_curriculum_documents (title,filename,class_id,subject_id,term,academic_year,content_type,content,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,title,filename,class_id,subject_id,term,academic_year,uploaded_by,created_at", [title, filename, class_id, subject_id, term, academic_year || null, content_type || "application/pdf", Buffer.from(content_base64, "base64"), req.user.display_name]);
  res.status(201).json({ success: true, document: result.rows[0] });
});

router.get("/curriculum-documents", requireUser, allow("principal", "admin", "teacher", "student", "parent"), async (req, res) => {
  const select = `SELECT DISTINCT d.id,d.title,d.filename,d.class_id,d.subject_id,d.term,d.academic_year,d.created_at,c.name AS class_name,s.name AS subject_name FROM school_curriculum_documents d JOIN school_classes c ON c.id=d.class_id JOIN school_subjects s ON s.id=d.subject_id`;
  const result = req.user.role === "teacher"
    ? await pool.query(`${select} JOIN school_teacher_assignments a ON a.class_id=d.class_id AND a.subject_id=d.subject_id AND a.staff_id=$1 AND (a.academic_year IS NULL OR d.academic_year IS NULL OR a.academic_year=d.academic_year) ORDER BY d.created_at DESC`, [req.user.staff_id])
    : req.user.role === "student"
      ? await pool.query(`${select} WHERE EXISTS (SELECT 1 FROM students st WHERE st.student_id=$1 AND st.class_name=c.name) ORDER BY d.created_at DESC`, [req.user.student_id])
      : req.user.role === "parent"
        ? await pool.query(`${select} WHERE EXISTS (SELECT 1 FROM school_parent_student_links l JOIN students st ON st.student_id=l.student_id WHERE l.parent_user_id=$1 AND l.active=true AND st.class_name=c.name) ORDER BY d.created_at DESC`, [req.user.id])
        : await pool.query(`${select} ORDER BY d.created_at DESC`);
  res.json({ success: true, documents: result.rows });
});

router.get("/curriculum-documents/:id/download", requireUser, allow("principal", "admin", "teacher", "student", "parent"), async (req, res) => {
  const access = req.user.role === "teacher"
    ? "AND EXISTS (SELECT 1 FROM school_teacher_assignments a WHERE a.staff_id=$2 AND a.class_id=d.class_id AND a.subject_id=d.subject_id AND (a.academic_year IS NULL OR d.academic_year IS NULL OR a.academic_year=d.academic_year))"
    : req.user.role === "student"
      ? "AND EXISTS (SELECT 1 FROM students st JOIN school_classes c ON c.name=st.class_name WHERE st.student_id=$2 AND c.id=d.class_id)"
      : req.user.role === "parent"
        ? "AND EXISTS (SELECT 1 FROM school_parent_student_links l JOIN students st ON st.student_id=l.student_id JOIN school_classes c ON c.name=st.class_name WHERE l.parent_user_id=$2 AND l.active=true AND c.id=d.class_id)"
        : "";
  const params = req.user.role === "teacher" ? [req.params.id, req.user.staff_id] : [req.params.id, req.user.role === "student" ? req.user.student_id : req.user.id];
  const result = await pool.query(`SELECT d.filename,d.content_type,d.content FROM school_curriculum_documents d WHERE d.id=$1 ${access}`, params);
  if (!result.rows.length) return res.status(404).json({ success: false, message: "Document not found or not assigned to you." });
  res.setHeader("Content-Type", result.rows[0].content_type);
  res.setHeader("Content-Disposition", `attachment; filename="${String(result.rows[0].filename).replace(/[\r\n"]/g, "")}"`);
  res.send(result.rows[0].content);
});

router.get("/admin/attendance", requireUser, allow("principal", "admin"), async (_req, res) => {
  const result = await pool.query("SELECT * FROM school_attendance_records ORDER BY attendance_date DESC, student_name");
  res.json({ success: true, records: result.rows });
});

router.post("/admin/attendance/import", requireUser, allow("principal", "admin"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  let imported = 0;
  for (const row of rows) {
    const values = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim().replace(/[ _-]+/g, " "), String(value ?? "").trim()]));
    const studentId = values["student id"] || values.student_id || values.id;
    const date = toDateOnly(values.date || values["attendance date"]) || new Date().toISOString().slice(0, 10);
    const present = (values.present || "").toLowerCase();
    const status = values.status || values.attendance || (present ? (present === "yes" || present === "true" ? "Present" : "Absent") : "");
    if (!studentId || !status) continue;
    await pool.query("INSERT INTO school_attendance_records (student_id,student_name,class_name,attendance_date,status,remarks) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(student_id,attendance_date) DO UPDATE SET student_name=EXCLUDED.student_name,class_name=EXCLUDED.class_name,status=EXCLUDED.status,remarks=EXCLUDED.remarks", [studentId, values.name || values["student name"] || null, values.class || values["class name"] || null, date, status, values.remarks || null]);
    imported++;
  }
  res.json({ success: true, imported });
});

router.get("/admin/fees", requireUser, allow("principal", "admin"), async (_req, res) => {
  const result = await pool.query("SELECT * FROM school_fee_records ORDER BY created_at DESC");
  res.json({ success: true, records: result.rows });
});

router.post("/parent/fees/initialize", requireUser, allow("parent"), async (req, res) => {
  const feeRecordId = Number(req.body?.fee_record_id);
  const email = String(req.body?.email || "").trim();
  if (!Number.isSafeInteger(feeRecordId) || feeRecordId < 1) return res.status(400).json({ success: false, message: "Choose a valid fee record." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: "Enter a valid payer email for the payment receipt." });
  if (!process.env.PAYSTACK_SECRET_KEY) return res.status(503).json({ success: false, message: "Online payments are not configured yet. Contact the school administrator." });
  const fee = await pool.query(`SELECT f.id, f.student_id, f.fee_type, f.amount_due, f.amount_paid
    FROM school_fee_records f
    WHERE f.id=$1 AND EXISTS (SELECT 1 FROM school_parent_student_links l WHERE l.parent_user_id=$2 AND l.student_id=f.student_id AND l.active=true)`, [feeRecordId, req.user.id]);
  if (!fee.rows.length) return res.status(404).json({ success: false, message: "That fee record is not available to this parent account." });
  const balance = Math.max(0, Number(fee.rows[0].amount_due) - Number(fee.rows[0].amount_paid));
  const amountKobo = Math.round(balance * 100);
  if (!amountKobo) return res.status(409).json({ success: false, message: "This fee record has no outstanding balance." });
  const reference = `SKUL-${crypto.randomUUID()}`;
  await pool.query("INSERT INTO school_fee_payments (reference,fee_record_id,parent_user_id,amount_kobo) VALUES ($1,$2,$3,$4)", [reference, feeRecordId, req.user.id, amountKobo]);
  try {
    const gatewayResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, amount: amountKobo, currency: "NGN", reference, callback_url: `${process.env.APP_URL || "http://localhost:5173"}/portal?reference=${encodeURIComponent(reference)}`, metadata: { fee_record_id: feeRecordId, student_id: fee.rows[0].student_id, fee_type: fee.rows[0].fee_type } })
    });
    const gatewayBody = await gatewayResponse.json();
    if (!gatewayResponse.ok || !gatewayBody.status || !gatewayBody.data?.authorization_url) throw new Error(gatewayBody.message || "Payment provider could not start checkout.");
    return res.json({ success: true, authorization_url: gatewayBody.data.authorization_url, reference });
  } catch (error) {
    await pool.query("UPDATE school_fee_payments SET status='failed' WHERE reference=$1", [reference]);
    return res.status(502).json({ success: false, message: error.message || "Unable to start checkout with the payment provider." });
  }
});

router.post("/parent/fees/verify", requireUser, allow("parent"), async (req, res) => {
  const reference = String(req.body?.reference || "").trim();
  if (!reference) return res.status(400).json({ success: false, message: "Payment reference is required." });
  if (!process.env.PAYSTACK_SECRET_KEY) return res.status(503).json({ success: false, message: "Online payments are not configured yet. Contact the school administrator." });
  const payment = await pool.query(`SELECT p.id,p.fee_record_id,p.parent_user_id,p.amount_kobo,p.status
    FROM school_fee_payments p WHERE p.reference=$1 AND p.parent_user_id=$2`, [reference, req.user.id]);
  if (!payment.rows.length) return res.status(404).json({ success: false, message: "Payment reference was not found for this parent account." });
  if (payment.rows[0].status === "paid") return res.json({ success: true, already_verified: true });
  const gatewayResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });
  const gatewayBody = await gatewayResponse.json();
  const transaction = gatewayBody.data;
  if (!gatewayResponse.ok || !gatewayBody.status || transaction?.status !== "success" || Number(transaction.amount) !== Number(payment.rows[0].amount_kobo) || transaction.currency !== "NGN" || transaction.reference !== reference) {
    return res.status(400).json({ success: false, message: "Payment is not confirmed. The fee balance has not been changed." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query("SELECT status,fee_record_id,amount_kobo FROM school_fee_payments WHERE id=$1 AND parent_user_id=$2 FOR UPDATE", [payment.rows[0].id, req.user.id]);
    if (locked.rows[0].status !== "paid") {
      const linked = await client.query(`SELECT f.id FROM school_fee_records f JOIN school_parent_student_links l ON l.student_id=f.student_id AND l.parent_user_id=$2 AND l.active=true WHERE f.id=$1 FOR UPDATE OF f`, [locked.rows[0].fee_record_id, req.user.id]);
      if (!linked.rows.length) throw new Error("This fee record is no longer linked to your account.");
      await client.query("UPDATE school_fee_records SET amount_paid=amount_paid+$2, payment_date=COALESCE(payment_date,CURRENT_DATE) WHERE id=$1", [locked.rows[0].fee_record_id, Number(locked.rows[0].amount_kobo) / 100]);
      await client.query("UPDATE school_fee_payments SET status='paid',verified_at=NOW() WHERE id=$1", [payment.rows[0].id]);
    }
    await client.query("COMMIT");
    return res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(409).json({ success: false, message: error.message || "Unable to apply verified payment." });
  } finally {
    client.release();
  }
});

router.post("/admin/fees/import", requireUser, allow("principal", "admin"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  let imported = 0;
  for (const row of rows) {
    const values = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim().replace(/[ _-]+/g, " "), String(value ?? "").trim()]));
    const studentId = values["student id"] || values.student_id || values.id;
    const feeType = values["fee type"] || values.fee || "School Fees";
    if (!studentId) continue;
    const amountDue = Number((values["amount due"] || values["fee amount"] || values.amount || "0").replace(/[^0-9.-]/g, "")) || 0;
    const amountPaid = Number((values["amount paid"] || values.paid || "0").replace(/[^0-9.-]/g, "")) || 0;
    await pool.query("INSERT INTO school_fee_records (student_id,student_name,class_name,fee_type,academic_year,amount_due,amount_paid,payment_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(student_id,fee_type,academic_year) DO UPDATE SET student_name=EXCLUDED.student_name,class_name=EXCLUDED.class_name,amount_due=EXCLUDED.amount_due,amount_paid=EXCLUDED.amount_paid,payment_date=EXCLUDED.payment_date", [studentId, values.name || values["student name"] || null, values.class || values["class name"] || null, feeType, values["academic year"] || values.year || "Current", amountDue, amountPaid, toDateOnly(values["payment date"])]);
    imported++;
  }
  res.json({ success: true, imported });
});

router.get("/admin/announcements", requireUser, allow("principal", "admin"), async (_req, res) => {
  const result = await pool.query("SELECT id,title,message,audience,created_by,created_at FROM school_announcements ORDER BY created_at DESC");
  res.json({ success: true, announcements: result.rows });
});

router.get("/announcements", requireUser, async (req, res) => {
  const role = req.user.role === "principal" ? "admin" : req.user.role;
  const result = await pool.query("SELECT id,title,message,audience,created_by,created_at FROM school_announcements WHERE audience IN ('all',$1) ORDER BY created_at DESC", [role]);
  res.json({ success: true, announcements: result.rows });
});

router.post("/admin/announcements", requireUser, allow("principal", "admin"), async (req, res) => {
  const { title, message, audience } = req.body || {};
  if (!String(title || "").trim() || !String(message || "").trim() || !["all", "teacher", "student", "parent", "admin"].includes(audience)) return res.status(400).json({ success: false, message: "Title, message, and a valid audience are required." });
  const result = await pool.query("INSERT INTO school_announcements (title,message,audience,created_by) VALUES ($1,$2,$3,$4) RETURNING *", [title.trim(), message.trim(), audience, req.user.display_name]);
  res.status(201).json({ success: true, announcement: result.rows[0] });
});

router.put("/admin/staff/:staffId", requireUser, allow("principal", "admin"), async (req, res) => {
  const { full_name, email, phone, department, position, staff_type, status } = req.body || {};
  const updated = await pool.query(`UPDATE school_staff
    SET full_name=COALESCE($1, full_name), email=$2, phone=$3, department=$4, position=$5,
      staff_type=COALESCE($6, staff_type), status=COALESCE($7, status)
    WHERE staff_id=$8 RETURNING *`, [full_name || null, email || null, phone || null, department || null, position || null, staff_type || null, status || null, req.params.staffId]);
  if (!updated.rows.length) return res.status(404).json({ success: false, message: "Staff profile not found." });
  res.json({ success: true, staff: updated.rows[0] });
});

router.post("/admin/student-activities", requireUser, allow("principal", "admin", "teacher"), async (req, res) => {
  const { student_id, title, category, activity_date, description } = req.body || {};
  if (!student_id || !title) return res.status(400).json({ success: false, message: "Student ID and activity title are required." });
  const created = await pool.query(`INSERT INTO school_student_activities (student_id,title,category,activity_date,description,recorded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [student_id, title, category || null, activity_date || null, description || null, req.user.display_name]);
  res.status(201).json({ success: true, activity: created.rows[0] });
});

export default router;
