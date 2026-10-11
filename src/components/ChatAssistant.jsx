
import { useState } from "react";

function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      from: "bot",
      text: "Hi! 👋 Welcome to CareLoop. I can help you find features and organise your health information. What would you like help with?",
    },
  ]);

  function sendMessage(event) {
    event.preventDefault();

    const question = message.trim();
    if (!question) return;

    setMessages((old) => [
      ...old,
      { from: "user", text: question },
    ]);

    const q = question.toLowerCase();
    let reply =
      "I can help you navigate CareLoop. Try asking about health assessments, your health passport or follow-up reminders.";

    if (q.includes("assessment") || q.includes("symptom")) {
      reply =
        "You can open Health Assessment to record your symptoms and basic information. This demo does not diagnose illnesses.";
    } else if (
      q.includes("passport") ||
      q.includes("record") ||
      q.includes("allerg")
    ) {
      reply =
        "Open Health Passport to enter allergies, medicines and medical history. This prototype stores demo information only.";
    } else if (
      q.includes("follow") ||
      q.includes("appointment") ||
      q.includes("reminder")
    ) {
      reply =
        "Visit Follow-up Care to add an appointment date and notes. Remember to confirm appointments directly with your healthcare provider.";
    } else if (
      q.includes("dashboard") ||
      q.includes("home")
    ) {
      reply =
        "Your dashboard gives you a quick view of your health workspace. Use the navigation links to explore the available sections.";
    } else if (
      q.includes("emergency") ||
      q.includes("urgent") ||
      q.includes("chest pain") ||
      q.includes("can't breathe") ||
      q.includes("cannot breathe")
    ) {
      reply =
        "If you may be experiencing a medical emergency, contact your local emergency service or go to the nearest emergency department now. Do not rely on this chatbot for emergency care.";
    }

    setMessages((old) => [
      ...old,
      { from: "user", text: question },
      { from: "bot", text: reply },
    ]);

    setMessage("");
  }

  return (
    <>
      {open && (
        <section className="chat-panel" aria-label="CareLoop chat">
          <div className="chat-header">
            <div className="chat-avatar">✚</div>
            <div>
              <strong>CareLoop Assistant</strong>
              <small>Here to help · Demo mode</small>
            </div>
            <button
              className="chat-close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          <div className="chat-messages" aria-live="polite">
            {messages.map((item, index) => (
              <div
                key={index}
                className={`chat-message ${
                  item.from === "user" ? "user-message" : ""
                }`}
              >
                {item.text}
              </div>
            ))}
          </div>

          <form className="chat-form" onSubmit={sendMessage}>
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask CareLoop..."
              aria-label="Message the CareLoop assistant"
            />
            <button type="submit">Send</button>
          </form>

          <div className="chat-disclaimer">
            Demo assistant, not a medical professional.
          </div>
        </section>
      )}

      <button
        className="chat-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close CareLoop assistant" : "Open CareLoop assistant"}
        title="Chat with CareLoop"
      >
        {open ? "×" : "☏"}
      </button>
    </>
  );
}

export default ChatAssistant;