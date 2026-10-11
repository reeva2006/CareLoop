
import { useState } from "react";
import { Link } from "react-router-dom";

function Assessment() {
  const [form, setForm] = useState({
    age: "",
    concern: "",
    duration: "",
    notes: "",
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
        <span className="eyebrow">01 / ASSESSMENT</span>
      </div>

      <section className="inner-panel">
        <span className="eyebrow">YOUR HEALTH CHECK</span>
        <h1>Let's start with how you're feeling.</h1>
        <p>
          Complete the form below to create a basic assessment summary.
        </p>

        <form onSubmit={submit} className="form-grid">
          <label className="form-field">
            Age
            <input
              type="number"
              name="age"
              min="1"
              max="120"
              value={form.age}
              onChange={update}
              placeholder="Enter age"
              required
            />
          </label>

          <label className="form-field">
            Main concern
            <select
              name="concern"
              value={form.concern}
              onChange={update}
              required
            >
              <option value="">Choose an option</option>
              <option value="Fever">Fever</option>
              <option value="Cough or cold">Cough or cold</option>
              <option value="Pain">Pain</option>
              <option value="Digestive concern">Digestive concern</option>
              <option value="General check-up">General check-up</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label className="form-field">
            How long have you had this concern?
            <select
              name="duration"
              value={form.duration}
              onChange={update}
              required
            >
              <option value="">Choose duration</option>
              <option value="Today">Started today</option>
              <option value="A few days">A few days</option>
              <option value="A week or more">A week or more</option>
              <option value="Ongoing">Ongoing</option>
            </select>
          </label>

          <label className="form-field full-field">
            Additional notes
            <textarea
              name="notes"
              value={form.notes}
              onChange={update}
              placeholder="Add any other information you want to record..."
            />
          </label>

          <div className="full-field">
            <button className="primary-button" type="submit">
              Create assessment summary →
            </button>
          </div>
        </form>

        {saved && (
          <div className="notice" aria-live="polite">
            Assessment summary created for this session. This is not
            a medical diagnosis, and the information is not saved to a
            permanent database.
          </div>
        )}

        <div className="notice">
          If symptoms are severe or you think you may have an emergency,
          seek appropriate medical care rather than relying on this form.
        </div>
      </section>
    </main>
  );
}

export default Assessment;