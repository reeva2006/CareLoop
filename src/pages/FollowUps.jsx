
import { useState } from "react";
import { Link } from "react-router-dom";

function FollowUps() {
  const [form, setForm] = useState({
    title: "",
    date: "",
    notes: "",
  });

  const [appointments, setAppointments] = useState([]);

  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function submit(event) {
    event.preventDefault();

    setAppointments((old) => [
      ...old,
      { ...form, id: `${Date.now()}-${old.length}` },
    ]);

    setForm({ title: "", date: "", notes: "" });
  }

  function removeAppointment(id) {
    setAppointments((old) => old.filter((item) => item.id !== id));
  }

  return (
    <main className="inner-page">
      <div className="inner-topbar">
        <Link to="/dashboard" className="back-link">
          ← Back to Dashboard
        </Link>
        <span className="eyebrow">03 / FOLLOW-UP CARE</span>
      </div>

      <section className="inner-panel">
        <span className="eyebrow">KEEP TRACK OF YOUR CARE</span>
        <h1>Your follow-ups, organised. 📅</h1>
        <p>
          Add an appointment or a reminder to help you stay organised.
        </p>

        <form onSubmit={submit} className="form-grid">
          <label className="form-field">
            Appointment or reminder
            <input
              name="title"
              value={form.title}
              onChange={update}
              placeholder="e.g. Doctor follow-up"
              required
            />
          </label>

          <label className="form-field">
            Date
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={update}
              required
            />
          </label>

          <label className="form-field full-field">
            Notes
            <textarea
              name="notes"
              value={form.notes}
              onChange={update}
              placeholder="Add details to remember..."
            />
          </label>

          <div className="full-field">
            <button type="submit" className="primary-button">
              Add follow-up +
            </button>
          </div>
        </form>

        <div style={{ marginTop: 35 }}>
          <h2>Upcoming follow-ups</h2>

          {appointments.length === 0 ? (
            <div className="data-card" style={{ marginTop: 18 }}>
              <div className="service-icon">🗓️</div>
              <h3>Nothing added yet</h3>
              <p>
                Your appointments and reminders will appear here.
              </p>
            </div>
          ) : (
            <div className="data-grid">
              {appointments.map((item) => (
                <article className="data-card sky" key={item.id}>
                  <span className="eyebrow">{item.date}</span>
                  <h3>{item.title}</h3>
                  <p>{item.notes || "No extra notes."}</p>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => removeAppointment(item.id)}
                  >
                    Remove
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="notice">
          These are personal demo reminders, not confirmed medical
          appointments. Confirm bookings with the healthcare provider.
        </div>
      </section>
    </main>
  );
}

export default FollowUps;