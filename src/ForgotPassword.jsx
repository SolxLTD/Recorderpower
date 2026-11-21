import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";

function ForgotPassword() {
  const [username, setUsername] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const submit = async (event) => { event.preventDefault(); setError(""); try { const response = await fetch("http://localhost:5000/api/auth/password-reset-request", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username}) }); const data = await response.json(); if (!response.ok) throw new Error(data.message); setMessage(data.message); } catch (cause) { setError(cause.message || "Unable to request a reset."); } };
  return <main className="login-page"><section className="login-panel"><div className="login-brand"><GraduationCap size={30}/><div><strong>SKUL</strong><span>School Intelligence</span></div></div><h1>Reset your password</h1><p>Submit your username, then contact your school administrator through the usual channel for help.</p><form onSubmit={submit} className="login-form"><label><span>Username</span><input value={username} onChange={(event)=>setUsername(event.target.value)} required /></label>{error && <div className="alert alert-danger">{error}</div>}{message && <div className="alert alert-success">{message}</div>}<button className="primary-button login-button">Request password reset</button></form><p className="auth-switch"><Link to="/login">Back to sign in</Link></p></section></main>;
}
export default ForgotPassword;
