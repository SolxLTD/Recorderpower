import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, Search, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import AdminLayout from "./AdminLayout";
import { apiFetch } from "./AuthContext";

const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "NGN", maximumFractionDigits: 2 });
const normalize = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim().replace(/[ _-]+/g, " "), value]));

function FeesPayments() {
  const input = useRef(null); const [records, setRecords] = useState([]); const [search, setSearch] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [uploading, setUploading] = useState(false);
  const load = async () => { const response = await apiFetch("/api/admin/fees"); const data = await response.json(); if (!response.ok) throw new Error(data.message || "Unable to load payment records."); setRecords(data.records || []); };
  useEffect(() => { load().catch((cause) => setError(cause.message)); }, []);
  const upload = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false }).map(normalize);
      const response = await apiFetch("/api/admin/fees/import", { method: "POST", body: JSON.stringify({ rows }) }); const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to import payment records.");
      setMessage(`${data.imported} fee/payment records imported.`); await load();
    } catch (cause) { setError(cause.message || "Unable to read that file."); }
    finally { setUploading(false); }
  };
  const filtered = useMemo(() => records.filter((row) => `${row.student_id} ${row.student_name || ""} ${row.class_name || ""} ${row.fee_type}`.toLowerCase().includes(search.toLowerCase())), [records, search]);
  const expected = records.reduce((sum, row) => sum + Number(row.amount_due || 0), 0); const paid = records.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
  return <AdminLayout title="Fees & Payments" breadcrumb="SKUL / Fees & Payments">
    <div className="module-header"><div><h2>Fees & Payments</h2><p>Upload and review student fee balances and payment history.</p></div><div className="module-actions"><button className="primary-button" onClick={() => input.current?.click()} disabled={uploading}><Upload size={17}/>{uploading ? "Uploading..." : "Upload Payment File"}</button><input ref={input} type="file" accept=".csv,.xlsx,.xls" onChange={upload} hidden/></div></div>
    {error && <div className="alert alert-danger">{error}</div>}{message && <div className="alert alert-success">{message}</div>}
    <div className="module-stats"><div className="mini-stat"><span>Total expected</span><strong>{currency.format(expected)}</strong></div><div className="mini-stat"><span>Total paid</span><strong>{currency.format(paid)}</strong></div><div className="mini-stat"><span>Outstanding</span><strong>{currency.format(Math.max(0, expected - paid))}</strong></div></div>
    <div className="table-card"><div className="table-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student or fee..."/></div></div><div className="table-scroll"><table><thead><tr><th>Student ID</th><th>Student</th><th>Class</th><th>Fee type</th><th>Amount due</th><th>Amount paid</th><th>Balance</th><th>Status</th><th>Payment date</th></tr></thead><tbody>{filtered.length ? filtered.map((record) => { const due = Number(record.amount_due || 0); const amountPaid = Number(record.amount_paid || 0); return <tr key={record.id}><td>{record.student_id}</td><td>{record.student_name || "—"}</td><td>{record.class_name || "—"}</td><td>{record.fee_type}</td><td>{currency.format(due)}</td><td>{currency.format(amountPaid)}</td><td>{currency.format(Math.max(0, due - amountPaid))}</td><td>{amountPaid >= due ? "Paid" : amountPaid > 0 ? "Part-paid" : "Unpaid"}</td><td>{record.payment_date ? String(record.payment_date).slice(0, 10) : "—"}</td></tr>; }) : <tr><td colSpan="9" className="empty-table">No payment records available yet.</td></tr>}</tbody></table></div></div>
    <p className="form-hint"><CreditCard size={14}/>Spreadsheet columns accepted: Student ID, Name, Class, Fee Type, Amount Due, Amount Paid, Academic Year, Payment Date.</p>
  </AdminLayout>;
}

export default FeesPayments;