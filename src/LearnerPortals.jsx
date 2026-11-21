import { useEffect, useState } from "react";
import { BookOpen, CalendarCheck, CreditCard, GraduationCap, LockKeyhole, LogOut, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "./AuthContext";

const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "NGN", maximumFractionDigits: 2 });

function useAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  useEffect(() => {
    apiFetch("/api/announcements").then((response) => response.json()).then((body) => setAnnouncements(body.announcements || [])).catch(() => {});
  }, []);
  return announcements;
}

function PortalFrame({ user, label, signOut, children }) {
  return <main className="portal-page"><header className="portal-header"><div className="portal-brand"><GraduationCap size={26}/><strong>SKUL</strong><span>{label}</span></div><div className="portal-user"><div className="admin-avatar">{user.display_name?.[0] || "U"}</div><div><strong>{user.display_name}</strong><small>{label}</small></div><Link className="icon-button" to="/change-password" aria-label="Change password" title="Change password"><LockKeyhole size={18}/></Link><button className="icon-button" onClick={signOut} title="Sign out"><LogOut size={18}/></button></div></header><section className="portal-content">{children}</section></main>;
}

function AnnouncementList({ announcements }) {
  return <section className="portal-section"><div className="section-heading"><CalendarCheck size={21}/><div><h2>School Updates</h2><p>Announcements for your school community.</p></div></div>{announcements.length ? <div className="portal-announcement-list">{announcements.map((item) => <article key={item.id}><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleDateString()}</small></article>)}</div> : <div className="empty-module-small">No new announcements.</div>}</section>;
}

function ResultsTable({ results }) {
  return <div className="portal-table-wrap"><table className="portal-results-table"><thead><tr><th>Year / Term</th><th>Subject</th><th>Test</th><th>Exam</th><th>Total</th><th>Grade</th><th>Status</th></tr></thead><tbody>{results?.length ? results.map((result) => <tr key={result.id}><td>{[result.academic_year, result.term].filter(Boolean).join(" · ") || "—"}</td><td>{result.subject || "—"}</td><td>{result.test_score ?? "—"}</td><td>{result.exam_score ?? "—"}</td><td>{result.total_score ?? result.average_score ?? "—"}</td><td>{result.grade || "—"}</td><td>{result.result_status || "—"}</td></tr>) : <tr><td colSpan="7" className="empty-table">No published results are available yet.</td></tr>}</tbody></table></div>;
}

function Curriculum({ documents = [], notes }) {
  return <section className="portal-section"><div className="section-heading"><BookOpen size={21}/><div><h2>Curriculum & Courses</h2><p>Current subjects and learning resources.</p></div></div>{notes && <p className="curriculum-notes">{notes}</p>}{documents.length ? <div className="assignment-list">{documents.map((document) => <div className="class-row" key={document.id}><span>{document.class_name} · {document.subject_name} · {document.term}</span><button className="secondary-button" onClick={() => downloadDocument(document)}>Download</button></div>)}</div> : <div className="empty-module-small">No curriculum resources have been added for this class yet.</div>}</section>;
}

async function downloadDocument(resource) {
  const response = await apiFetch(`/api/curriculum-documents/${resource.id}/download`);
  if (!response.ok) return;
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement("a");
  link.href = url;
  link.download = resource.filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function StudentDashboard({ user, signOut }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const announcements = useAnnouncements();
  useEffect(() => {
    apiFetch("/api/portal/overview").then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to load your student profile.");
      setData(body);
    }).catch((cause) => setError(cause.message));
  }, []);
  return <PortalFrame user={user} label="Student Portal" signOut={signOut}>{error && <div className="alert alert-danger">{error}</div>}{!data ? <div className="loading-state">Loading your learning profile...</div> : <><div className="portal-intro"><div><span className="eyebrow">MY LEARNING PROFILE</span><h1>Hello, {user.display_name}</h1><p>Your classes, curriculum, results and school updates.</p></div></div><div className="detail-grid"><div className="detail-item"><span className="detail-item-label">Student ID</span><span className="detail-item-value">{user.student_id || "—"}</span></div><div className="detail-item"><span className="detail-item-label">Class</span><span className="detail-item-value">{data.student?.class_name || "—"}</span></div><div className="detail-item"><span className="detail-item-label">Average</span><span className="detail-item-value">{data.student?.average_score ?? "—"}</span></div><div className="detail-item"><span className="detail-item-label">Promotion / Status</span><span className="detail-item-value">{data.student?.result_status || "—"}</span></div></div><section className="portal-section"><div className="section-heading"><GraduationCap size={21}/><div><h2>Performance & Results</h2><p>Test scores, exam scores, grades and promotion status.</p></div></div><ResultsTable results={data.results}/></section><Curriculum documents={data.documents} notes={data.profile?.curriculum_notes}/><section className="portal-section"><div className="section-heading"><CalendarCheck size={21}/><div><h2>My Activities</h2><p>Activities recorded by your school.</p></div></div>{data.activities?.length ? <div className="activity-list">{data.activities.map((activity) => <article className="activity-card" key={activity.id}><CalendarCheck size={18}/><div><h3>{activity.title}</h3><p>{activity.category || "School activity"}{activity.activity_date ? ` · ${new Date(activity.activity_date).toLocaleDateString()}` : ""}</p><small>{activity.description}</small></div></article>)}</div> : <div className="empty-module-small">No activities have been recorded yet.</div>}</section><AnnouncementList announcements={announcements}/></>}</PortalFrame>;
}

export function ParentDashboard({ user, signOut }) {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [paying, setPaying] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const announcements = useAnnouncements();
  const load = async () => {
    const response = await apiFetch("/api/portal/overview");
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Unable to load linked student profiles.");
    setData(body);
    setSelectedId((current) => body.children?.some((child) => child.student_id === current) ? current : body.children?.[0]?.student_id || "");
  };
  useEffect(() => { load().catch((cause) => setError(cause.message)); }, []);
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference");
    if (!reference) return;
    setMessage("Confirming your payment with the payment provider...");
    apiFetch("/api/parent/fees/verify", { method: "POST", body: JSON.stringify({ reference }) }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Payment could not be confirmed.");
      setMessage("Payment confirmed. The school fee balance has been updated.");
      await load();
    }).catch((cause) => setError(cause.message)).finally(() => window.history.replaceState({}, "", window.location.pathname));
  }, []);
  const child = data?.children?.find((item) => item.student_id === selectedId);
  const pay = async (fee) => {
    setPaying(String(fee.id)); setError(""); setMessage("");
    try {
      const response = await apiFetch("/api/parent/fees/initialize", { method: "POST", body: JSON.stringify({ fee_record_id: fee.id, email: payerEmail }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Unable to start payment.");
      window.location.assign(body.authorization_url);
    } catch (cause) { setError(cause.message); setPaying(""); }
  };
  return <PortalFrame user={user} label="Parent Portal" signOut={signOut}>{error && <div className="alert alert-danger">{error}</div>}{message && <div className="alert alert-success">{message}</div>}{!data ? <div className="loading-state">Loading your family dashboard...</div> : <><div className="portal-intro"><div><span className="eyebrow">FAMILY DASHBOARD</span><h1>Welcome, {user.display_name}</h1><p>School progress and fee payments for your linked child profiles.</p></div></div>{data.children?.length ? <><div className="parent-child-picker"><label htmlFor="child-profile">Child profile</label><select id="child-profile" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{data.children.map((item) => <option key={item.student_id} value={item.student_id}>{item.student_name} · {item.class_name || "Class not set"}</option>)}</select></div>{child ? <><div className="detail-grid"><div className="detail-item"><span className="detail-item-label">Student ID</span><span className="detail-item-value">{child.student_id}</span></div><div className="detail-item"><span className="detail-item-label">Class</span><span className="detail-item-value">{child.class_name || "—"}</span></div><div className="detail-item"><span className="detail-item-label">Attendance</span><span className="detail-item-value">{child.attendance_percentage}%</span></div><div className="detail-item"><span className="detail-item-label">Average / Grade</span><span className="detail-item-value">{child.average_score} · {child.overall_grade}</span></div><div className="detail-item"><span className="detail-item-label">Promotion / Status</span><span className="detail-item-value">{child.result_status}</span></div></div><section className="portal-section"><div className="section-heading"><GraduationCap size={21}/><div><h2>{child.student_name}: Performance & Results</h2><p>Published tests, exams, grades and term results.</p></div></div><ResultsTable results={child.recent_results}/></section><Curriculum documents={child.documents} notes={child.curriculum_notes}/><section className="portal-section"><div className="section-heading"><CreditCard size={21}/><div><h2>School Fees & Payments</h2><p>Outstanding balances for {child.student_name}.</p></div></div><label className="payer-email-field">Receipt email<input type="email" autoComplete="email" value={payerEmail} onChange={(event) => setPayerEmail(event.target.value)} placeholder="parent@example.com" required /></label>{child.fees?.length ? <div className="portal-fee-list">{child.fees.map((fee) => { const balance = Math.max(0, Number(fee.amount_due || 0) - Number(fee.amount_paid || 0)); return <article className="portal-fee-row" key={fee.id}><div><strong>{fee.fee_type}</strong><small>{fee.academic_year || "Current year"} · Due {currency.format(Number(fee.amount_due || 0))} · Paid {currency.format(Number(fee.amount_paid || 0))}</small></div><strong>{currency.format(balance)}</strong>{balance > 0 && <button className="primary-button" disabled={paying === String(fee.id) || !payerEmail} onClick={() => pay(fee)}><CreditCard size={16}/>{paying === String(fee.id) ? "Starting..." : "Pay balance"}</button>}</article>; })}</div> : <div className="empty-module-small">No fee records are available for this student yet.</div>}</section><AnnouncementList announcements={announcements}/></> : null}</> : <section className="portal-section"><div className="section-heading"><UserRound size={21}/><div><h2>No linked student profile</h2><p>Contact the school principal to connect your account to your child.</p></div></div></section>}</>}</PortalFrame>;
}