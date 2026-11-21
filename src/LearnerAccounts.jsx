import { useEffect, useState } from "react";
import { CheckCircle, GraduationCap, KeyRound, UserPlus } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { apiFetch } from "./AuthContext";

const initial = { role: "student", display_name: "", username: "", password: "", student_ids: [] };

async function readApiResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The school server returned an unexpected response (HTTP ${response.status}). Please try again or contact the administrator.`);
  }
}

function LearnerAccounts() {
  const [students, setStudents] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const [studentsResponse, accountsResponse] = await Promise.all([
      apiFetch("/api/admin/learner-students"),
      apiFetch("/api/admin/student-parent-accounts")
    ]);
    const studentsBody = await readApiResponse(studentsResponse);
    const accountsBody = await readApiResponse(accountsResponse);
    if (!studentsResponse.ok || !accountsResponse.ok) throw new Error(studentsBody.message || accountsBody.message || "Unable to load student account data.");
    setStudents(studentsBody.students || []);
    setAccounts(accountsBody.accounts || []);
  };

  useEffect(() => { load().catch((cause) => setError(cause.message)); }, []);

  const toggleStudent = (studentId) => setForm((current) => ({
    ...current,
    student_ids: current.student_ids.includes(studentId)
      ? current.student_ids.filter((id) => id !== studentId)
      : [...current.student_ids, studentId]
  }));

  const create = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch("/api/admin/provision-student-parent", { method: "POST", body: JSON.stringify(form) });
      const body = await readApiResponse(response);
      if (!response.ok) throw new Error(body.message || "Unable to issue account.");
      setMessage(`${form.role === "parent" ? "Parent" : "Student"} login created for ${form.display_name}. Share the temporary password privately.`);
      setForm(initial);
      await load();
    } catch (cause) {
      setError(cause.message || "Unable to issue account.");
    } finally {
      setLoading(false);
    }
  };

  const changeRole = (role) => setForm((current) => ({ ...current, role, student_ids: [] }));

  return <AdminLayout title="Student & Parent Access" breadcrumb="SKUL / Accounts & Access / Learners">
    <div className="module-header"><div><h2>Student & Parent Access</h2><p>Issue student logins and parent accounts linked only to their child profiles.</p></div></div>
    <div className="access-layout learner-access-layout">
      <section className="dashboard-card">
        <div className="card-header"><div className="card-title"><div className="card-icon"><UserPlus size={21}/></div><div><h3>Issue learner login</h3><p>Choose the student record this account is allowed to access.</p></div></div></div>
        <form className="settings-form" onSubmit={create}>
          <div className="account-role-tabs"><button type="button" className={`account-role-tab ${form.role === "student" ? "active" : ""}`} onClick={() => changeRole("student")}>Student</button><button type="button" className={`account-role-tab ${form.role === "parent" ? "active" : ""}`} onClick={() => changeRole("parent")}>Parent</button></div>
          <div className="form-grid"><label>Account holder name *<input name="display_name" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} required /></label><label>Login username *<input name="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required /></label><label className="form-group full">Temporary password *<input name="password" type="password" minLength="8" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 8 characters" required /></label></div>
          <fieldset className="student-choice-list"><legend>{form.role === "parent" ? "Linked child profiles" : "Student profile"}</legend>{students.length ? students.map((student) => <label className="student-choice" key={student.student_id}><input type={form.role === "parent" ? "checkbox" : "radio"} name="linked_student" checked={form.student_ids.includes(student.student_id)} onChange={() => form.role === "parent" ? toggleStudent(student.student_id) : setForm((current) => ({ ...current, student_ids: [student.student_id] }))}/><span><strong>{student.student_name}</strong><small>{student.student_id} · {student.class_name || "Class not set"}</small></span></label>) : <p className="student-choice-empty">Add student records before issuing learner accounts.</p>}</fieldset>
          {error && <div className="alert alert-danger">{error}</div>}{message && <div className="alert alert-success"><CheckCircle size={17}/>{message}</div>}
          <button className="primary-button" disabled={loading || !students.length}><KeyRound size={17}/>{loading ? "Issuing account..." : `Issue ${form.role} account`}</button>
        </form>
      </section>
      <section className="dashboard-card account-inventory"><div className="card-header"><div className="card-title"><div className="card-icon"><GraduationCap size={21}/></div><div><h3>Student and parent logins</h3><p>Existing accounts and linked child profiles.</p></div></div></div><div className="account-list">{accounts.map((account) => <div className="account-list-row" key={account.id}><div><strong>{account.display_name}</strong><small>{account.role === "parent" ? `Linked child: ${account.linked_students.map((student) => student.student_name).filter(Boolean).join(", ") || "No child linked"}` : `Student ID: ${account.student_id}`}</small></div><span>@{account.username}</span></div>)}{!accounts.length && <p className="student-choice-empty">No student or parent logins have been issued.</p>}</div></section>
    </div>
  </AdminLayout>;
}

export default LearnerAccounts;