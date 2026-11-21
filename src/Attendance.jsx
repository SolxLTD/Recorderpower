import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Upload, Users } from "lucide-react";
import * as XLSX from "xlsx";
import AdminLayout from "./AdminLayout";
import { apiFetch } from "./AuthContext";

const normalize = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim().replace(/[ _-]+/g, " "), value]));

function Attendance() {
  const input = useRef(null); const [records, setRecords] = useState([]); const [search, setSearch] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [uploading, setUploading] = useState(false);
  const load = async () => { const response = await apiFetch("/api/admin/attendance"); const data = await response.json(); if (!response.ok) throw new Error(data.message || "Unable to load attendance records."); setRecords(data.records || []); };
  useEffect(() => { load().catch((cause) => setError(cause.message)); }, []);
  const upload = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false }).map(normalize);
      const response = await apiFetch("/api/admin/attendance/import", { method: "POST", body: JSON.stringify({ rows }) }); const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to import attendance.");
      setMessage(`${data.imported} attendance records imported.`); await load();
    } catch (cause) { setError(cause.message || "Unable to read that file."); }
    finally { setUploading(false); }
  };
  const filtered = useMemo(() => records.filter((row) => `${row.student_id} ${row.student_name || ""} ${row.class_name || ""} ${row.status}`.toLowerCase().includes(search.toLowerCase())), [records, search]);
  const today = new Date().toISOString().slice(0, 10); const todayRecords = records.filter((record) => String(record.attendance_date).slice(0, 10) === today);
  const presentToday = todayRecords.filter((record) => record.status.toLowerCase() === "present").length;
  return <AdminLayout title="Attendance" breadcrumb="SKUL / Attendance">
    <div className="module-header"><div><h2>Attendance</h2><p>Upload daily student attendance and review saved records.</p></div><div className="module-actions"><button className="primary-button" onClick={() => input.current?.click()} disabled={uploading}><Upload size={17}/>{uploading ? "Uploading..." : "Upload Attendance"}</button><input ref={input} type="file" accept=".csv,.xlsx,.xls" onChange={upload} hidden/></div></div>
    {error && <div className="alert alert-danger">{error}</div>}{message && <div className="alert alert-success">{message}</div>}
    <div className="module-stats"><div className="mini-stat"><span>Student records</span><strong>{records.length}</strong></div><div className="mini-stat"><span>Present today</span><strong>{presentToday}</strong></div><div className="mini-stat"><span>Today's attendance</span><strong>{todayRecords.length ? `${Math.round(presentToday / todayRecords.length * 100)}%` : "—"}</strong></div></div>
    <div className="table-card"><div className="table-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student or class..."/></div></div><div className="table-scroll"><table><thead><tr><th>Student ID</th><th>Name</th><th>Class</th><th>Date</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{filtered.length ? filtered.map((record) => <tr key={record.id}><td>{record.student_id}</td><td>{record.student_name || "—"}</td><td>{record.class_name || "—"}</td><td>{String(record.attendance_date).slice(0, 10)}</td><td>{record.status}</td><td>{record.remarks || "—"}</td></tr>) : <tr><td colSpan="6" className="empty-table">No attendance records available yet.</td></tr>}</tbody></table></div></div>
    <p className="form-hint"><Users size={14}/>Spreadsheet columns accepted: Student ID, Name, Class, Date, Status or Present, Remarks.</p>
  </AdminLayout>;
}

export default Attendance;