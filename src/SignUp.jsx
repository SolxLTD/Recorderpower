import { useState } from "react";
import { GraduationCap, UserPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

function SignUp() {
  const { signUp } = useAuth(); const navigate = useNavigate();
  const [form, setForm] = useState({ display_name:"", username:"", password:"", role:"teacher", staff_id:"" }); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => { event.preventDefault(); setLoading(true); setError(""); try { await signUp(form); navigate("/portal", { replace:true }); } catch (cause) { setError(cause.message); } finally { setLoading(false); } };
  return <main className="login-page"><section className="login-panel"><div className="login-brand"><GraduationCap size={30}/><div><strong>SKUL</strong><span>School Intelligence</span></div></div><h1>Create staff account</h1><p>Staff can register with a school-issued Staff ID. Ask the principal to create student or parent access.</p><form onSubmit={submit} className="login-form"><label><span>Full name</span><input name="display_name" value={form.display_name} onChange={update} required /></label><label><span>Staff ID</span><input name="staff_id" value={form.staff_id} onChange={update} required /></label><label><span>Username</span><input name="username" value={form.username} onChange={update} required /></label><label><span>Password</span><input name="password" type="password" minLength="8" value={form.password} onChange={update} required /></label>{error && <div className="alert alert-danger">{error}</div>}<button className="primary-button login-button" disabled={loading}><UserPlus size={17}/>{loading ? "Creating..." : "Create staff account"}</button></form><p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p></section></main>;
}
export default SignUp;
