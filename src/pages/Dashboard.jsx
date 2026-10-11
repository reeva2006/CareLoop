
import { Link } from "react-router-dom";

function Dashboard() {
  return (
    <main className="inner-page">
      <div className="inner-topbar">
        <Link to="/" className="brand">
          <span className="brand-icon">✚</span>
          CareLoop
        </Link>
        <Link to="/login" className="back-link">Sign in page</Link>
      </div>

      <section className="inner-panel">
        <span className="eyebrow">YOUR HEALTH SPACE</span>
        <h1>Welcome to CareLoop 👋</h1>
        <p>Your health information, organised in one place.</p>

        <div className="data-grid">
          <article className="data-card sky">
            <div className="service-icon">🩺</div>
            <h3>Health Assessment</h3>
            <p>Record basic symptoms and health information.</p>
            <Link className="tile-link" to="/assessment">
              Start health check →
            </Link>
          </article>

          <article className="data-card mint">
            <div className="service-icon">📁</div>
            <h3>Health Passport</h3>
            <p>Organise your allergies, medicines and history.</p>
            <Link className="tile-link" to="/passport">
              View passport →
            </Link>
          </article>

          <article className="data-card lavender">
            <div className="service-icon">📅</div>
            <h3>Follow-up Care</h3>
            <p>Record upcoming appointments and notes.</p>
            <Link className="tile-link" to="/follow-ups">
              Manage follow-ups →
            </Link>
          </article>

          <article className="data-card peach">
            <div className="service-icon">💙</div>
            <h3>Recent Activity</h3>
            <p>Your recent activity will appear here as you use the prototype.</p>
          </article>
        </div>

        <div className="notice">
          CareLoop is a prototype. Your information is not yet
          connected to a secure healthcare database.
        </div>
      </section>
    </main>
  );
}

export default Dashboard;