
import { useState } from "react";
import { Link } from "react-router-dom";

function HealthPassport() {
  const [form, setForm] = useState({
    bloodGroup: "",
    allergies: "",
    medicines: "",
    history: "",
    emergencyContact: "",
  });

  const [saved, setSaved] = useState(false);

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
    setSaved(false);
  }

  function submit(event) {
    event.preventDefault();
    setSaved(true);
  }

  return (
    <main className="inner-page">
      <div className="inner-topbar">
        <Link to="/dashboard" className="back-link">
          ← Back to Dashboard
        </Link>
        <span className="eyebrow">02 / RECORDS</span>
      </div>

      <section className="inner-panel">
        <span className="eyebrow">PERSONAL HEALTH INFORMATION</span>
        <h1>Your Health Passport 📁</h1>
        <p>
          Record important details that you may want to discuss
          with your healthcare professional.
        </p>

        <form onSubmit={submit} className="form-grid">
          <label className="form-field">
            Blood group
            <select
              name="bloodGroup"
              value={form.bloodGroup}
              onChange={update}
            >
              <option value="">Select if known</option>
              <option>A+</option>
              <option>A-</option>
              <option>B+</option>
              <option>B-</option>
              <option>AB+</option>
              <option>AB-</option>
              <option>O+</option>
              <option>O-</option>
              <option>Unknown</option>
            </select>
          </label>

          <label className="form-field">
            Emergency contact
            <input
              name="emergencyContact"
              value={form.emergencyContact}
              onChange={update}
              placeholder="Contact name or phone"
            />
          </label>

          <label className="form-field full-field">
            Allergies
            <textarea
              name="allergies"
              value={form.allergies}
              onChange={update}
              placeholder="List known allergies, or write 'Unknown'"
            />
          </label>

          <label className="form-field full-field">
            Current medicines
            <textarea
              name="medicines"
              value={form.medicines}
              onChange={update}
              placeholder="Medicine names and prescribed instructions"
            />
          </label>

          <label className="form-field full-field">
            Medical history
            <textarea
              name="history"
              value={form.history}
              onChange={update}
              placeholder="Relevant medical history, if known"
            />
          </label>

          <div className="full-field">
            <button className="primary-button" type="submit">
              Save demo record →
            </button>
          </div>
        </form>

        {saved && (
          <div className="notice" aria-live="polite">
            Your record has been prepared for this session.
            It is not permanently stored yet.
          </div>
        )}

        <div className="notice">
          This prototype is not a substitute for official medical records.
          Keep your actual records securely with your healthcare provider.
        </div>
      </section>
    </main>
  );
}

export default HealthPassport;