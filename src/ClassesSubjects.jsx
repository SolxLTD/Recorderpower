import { useEffect, useRef, useState } from "react";
import { BookOpen, FileUp, Plus, School, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import AdminLayout from "./AdminLayout";
import { apiFetch } from "./AuthContext";

const tidy = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim().replace(/[ _-]+/g, " "), String(value ?? "").trim()]));

function ClassesSubjects() {
  const sheetInput = useRef(null); const pdfInput = useRef(null);
  const [data, setData] = useState({ classes: [], subjects: [], assignments: [] });
  const [documents, setDocuments] = useState([]); const [staff, setStaff] = useState([]);
  const [className, setClassName] = useState(""); const [subjectName, setSubjectName] = useState("");
  const [assignment, setAssignment] = useState({ class_id: "", subject_id: "", staff_id: "", academic_year: "", periods_per_week: 0 });
  const [document, setDocument] = useState({ title: "", class_id: "", subject_id: "", term: "Term 1", academic_year: "" });
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const refresh = async () => {
    const [catalog, docs, people] = await Promise.all([apiFetch("/api/admin/classes-subjects"), apiFetch("/api/curriculum-documents"), apiFetch("/api/admin/staff")]);
    const [catalogData, docsData, peopleData] = await Promise.all([catalog.json(), docs.json(), people.json()]);
    if (!catalog.ok || !docs.ok || !people.ok) throw new Error(catalogData.message || docsData.message || peopleData.message || "Unable to load academic records.");
    setData(catalogData); setDocuments(docsData.documents || []); setStaff(peopleData.staff || []);
  };
  useEffect(() => { refresh().catch((cause) => setError(cause.message)); }, []);
  const add = async (path, body) => {
    const response = await apiFetch(path, { method: "POST", body: JSON.stringify(body) }); const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to save this record.");
    await refresh(); setError(""); setMessage("Saved successfully.");
  };
  const uploadCatalog = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" }); const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: "" }).map(tidy);
      const response = await apiFetch("/api/admin/classes-subjects/import", { method: "POST", body: JSON.stringify({ rows }) }); const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to import the file.");
      setMessage(`${result.imported} class and subject rows imported.`); setError(""); await refresh();
    } catch (cause) { setError(cause.message || "Unable to read that spreadsheet."); }
  };
  const uploadDocument = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setError("Curriculum and syllabus files must be PDF documents."); return; }
    try {
      const contentBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      const response = await apiFetch("/api/admin/curriculum-documents", { method: "POST", body: JSON.stringify({ ...document, title: document.title || file.name.replace(/\.pdf$/i, ""), filename: file.name, content_type: "application/pdf", content_base64: contentBase64 }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "Unable to upload this PDF.");
      setMessage("PDF uploaded and assigned to the selected class and subject."); setError(""); await refresh();
    } catch (cause) { setError(cause.message || "Unable to upload this PDF."); }
  };
  const groups = ["Kindergarten", "Primary", "JHS", "SHS", "Other"].map((title) => ({ title, classes: data.classes.filter(({ name }) => title === "Kindergarten" ? /kindergarten|kg/i.test(name) : title === "Primary" ? /primary/i.test(name) : title === "JHS" ? /jhs|jss|junior/i.test(name) : title === "SHS" ? /shs|ss [123]|senior/i.test(name) : !/kindergarten|kg|primary|jhs|jss|junior|shs|ss [123]|senior/i.test(name)) })).filter((group) => group.classes.length);
  return <AdminLayout title="Classes & Subjects" breadcrumb="SKUL / Classes & Subjects">
    <div className="module-header"><div><h2>Classes & Subjects</h2><p>Manage class structure, teaching assignments, term curriculum and syllabus files.</p></div><div className="module-actions"><button className="secondary-button" onClick={() => sheetInput.current?.click()}><Upload size={17}/>Upload Class/Subject File</button><input ref={sheetInput} type="file" accept=".csv,.xlsx,.xls" onChange={uploadCatalog} hidden/></div></div>
    {error && <div className="alert alert-danger">{error}</div>}{message && <div className="alert alert-success">{message}</div>}
    <div className="access-layout">
      <section className="dashboard-card"><div className="card-header"><div className="card-title"><div className="card-icon"><School size={21}/></div><div><h3>School Classes</h3><p>Kindergarten, Primary 1-5, JHS and SHS classes.</p></div></div></div><form className="inline-form" onSubmit={(event) => { event.preventDefault(); add("/api/admin/classes", { name: className }); setClassName(""); }}><input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="e.g. Primary 1" required/><button className="primary-button"><Plus size={16}/>Add Class</button></form><div className="curriculum-grid">{groups.map((group) => <div className="curriculum-card" key={group.title}><div className="curriculum-header"><h3>{group.title}</h3><span>{group.classes.length} classes</span></div><div className="class-list">{group.classes.map((item) => <div className="class-row" key={item.id}>{item.name}</div>)}</div></div>)}</div></section>
      <section className="dashboard-card"><div className="card-header"><div className="card-title"><div className="card-icon"><BookOpen size={21}/></div><div><h3>Subjects & Teachers</h3><p>Assign each subject to a teacher and class.</p></div></div></div><form className="settings-form" onSubmit={(event) => { event.preventDefault(); add("/api/admin/subjects", { name: subjectName }); setSubjectName(""); }}><label>Add Subject<input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} placeholder="Subject name" required/></label><button className="secondary-button"><Plus size={16}/>Add Subject</button></form><form className="settings-form" onSubmit={(event) => { event.preventDefault(); add("/api/admin/assignments", assignment); }}><div className="form-grid"><label>Class<select required value={assignment.class_id} onChange={(event) => setAssignment({ ...assignment, class_id: event.target.value })}><option value="">Select class</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Subject<select required value={assignment.subject_id} onChange={(event) => setAssignment({ ...assignment, subject_id: event.target.value })}><option value="">Select subject</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Teacher<select required value={assignment.staff_id} onChange={(event) => setAssignment({ ...assignment, staff_id: event.target.value })}><option value="">Select teacher</option>{staff.filter((person) => person.staff_type === "Teaching").map((person) => <option key={person.staff_id} value={person.staff_id}>{person.full_name} ({person.staff_id})</option>)}</select></label><label>Periods per week<input type="number" min="0" max="40" value={assignment.periods_per_week} onChange={(event) => setAssignment({ ...assignment, periods_per_week: Number(event.target.value) })}/></label><label>Academic year<input value={assignment.academic_year} onChange={(event) => setAssignment({ ...assignment, academic_year: event.target.value })} placeholder="2026/2027"/></label></div><button className="primary-button"><Plus size={16}/>Assign Subject</button></form><div className="assignment-list">{data.assignments.map((item) => <div className="class-row" key={item.id}>{item.class_name} · {item.subject_name}<span>{item.teacher_name || item.staff_id}{item.periods_per_week ? ` · ${item.periods_per_week} periods/week` : ""}</span></div>)}</div></section>
    </div>
    <section className="dashboard-card curriculum-documents"><div className="card-header"><div className="card-title"><div className="card-icon"><FileUp size={21}/></div><div><h3>Term Curriculum & Teaching Syllabus</h3><p>Upload PDFs against a class, subject, term and academic year.</p></div></div></div><div className="form-grid"><label>Title<input value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} placeholder="Optional title"/></label><label>Class<select value={document.class_id} onChange={(event) => setDocument({ ...document, class_id: event.target.value })}><option value="">Select class</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Subject<select value={document.subject_id} onChange={(event) => setDocument({ ...document, subject_id: event.target.value })}><option value="">Select subject</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Term<select value={document.term} onChange={(event) => setDocument({ ...document, term: event.target.value })}><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></label><label>Academic year<input value={document.academic_year} onChange={(event) => setDocument({ ...document, academic_year: event.target.value })} placeholder="2026/2027"/></label></div><button className="secondary-button" onClick={() => pdfInput.current?.click()} disabled={!document.class_id || !document.subject_id}><Upload size={16}/>Upload PDF</button><input ref={pdfInput} type="file" accept="application/pdf,.pdf" onChange={uploadDocument} hidden/><div className="assignment-list">{documents.map((item) => <div className="class-row" key={item.id}>{item.class_name} · {item.subject_name} · {item.term}<span>{item.filename}</span></div>)}</div></section>
  </AdminLayout>;
}

export default ClassesSubjects;