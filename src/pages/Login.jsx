
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";

function Login() {
  const navigate = useNavigate();

  const [role, setRole] = useState("Patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (event) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      alert("Please enter your email and password.");
      return;
    }

    // Demo login only — real authentication will be added later.
    localStorage.setItem("careloopRole", role);
    navigate("/dashboard");
  };

  return (
    <main className="login-page">
      <div className="login-card">
        <Link to="/" className="login-logo">
          <span>+</span>
          CareLoop
        </Link>

        <h1>Welcome back</h1>

        <p className="login-subtitle">
          Sign in to continue to your CareLoop account.
        </p>

        <form onSubmit={handleLogin}>
          <label>
            I am a
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="Patient">Patient</option>
              <option value="Health Worker">Health Worker</option>
              <option value="Doctor">Doctor</option>
            </select>
          </label>

          <label>
            Email
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <button type="submit" className="login-submit">
            Sign In →
          </button>
        </form>

        <p className="back-home">
          <Link to="/">← Back to CareLoop</Link>
        </p>

        <p className="login-demo-note">
          CareLoop prototype · Demo login
        </p>
      </div>
    </main>
  );
}

export default Login;