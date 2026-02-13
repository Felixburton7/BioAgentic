"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Navbar from "@/components/Navbar";
import ResearchForm from "@/components/ResearchForm";
import ActivityTrace from "@/components/ActivityTrace";
import AgentStream from "@/components/AgentStream";
import ReportView from "@/components/ReportView";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/* ─── Password Gate ─── */
function PasswordGate({ onAuth }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      if (res.ok) {
        sessionStorage.setItem("bio_auth", "true");
        onAuth();
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="password-gate">
      <div className="password-card">
        <h1>BioAgentic</h1>
        <p>Enter the access password to continue.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="password-input"
            autoFocus
          />
          {error && <div className="password-error">{error}</div>}
          <button
            type="submit"
            className="password-btn"
            disabled={loading || !password.trim()}
          >
            {loading ? "Verifying…" : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Main App ─── */
export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [messages, setMessages] = useState([]);
  const [traces, setTraces] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [currentTarget, setCurrentTarget] = useState("");
  const eventSourceRef = useRef(null);

  // Restore auth from sessionStorage on mount
  useEffect(() => {
    if (sessionStorage.getItem("bio_auth") === "true") {
      setAuthed(true);
    }
  }, []);

  const handleSubmit = useCallback(
    ({ target, rounds }) => {
      setMessages([]);
      setTraces([]);
      setIsStreaming(true);
      setIsDone(false);
      setError(null);
      setBrief(null);
      setCurrentTarget(target);

      const controller = new AbortController();
      eventSourceRef.current = controller;

      fetch(`${API_BASE}/research/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, rounds }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

              try {
                const data = JSON.parse(jsonStr);

                if (data.event === "status") {
                  setTraces((prev) => [
                    ...prev,
                    {
                      node: data.node,
                      message: data.message,
                      duration: null,
                      done: false,
                    },
                  ]);
                  continue;
                }

                if (data.event === "node_complete") {
                  setTraces((prev) =>
                    prev.map((t) =>
                      t.node === data.node && !t.done
                        ? { ...t, duration: data.duration, done: true }
                        : t
                    )
                  );
                  continue;
                }

                if (data.event === "done") {
                  setIsDone(true);
                  setIsStreaming(false);

                  fetch(`${API_BASE}/research`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ target, rounds }),
                  })
                    .then((r) => r.json())
                    .then((result) => setBrief(result.brief))
                    .catch(() => { });

                  return;
                }

                if (data.event === "error") {
                  setError(data.detail || "Pipeline error");
                  setIsStreaming(false);
                  return;
                }

                if (data.content) {
                  setMessages((prev) => [...prev, data]);
                }
              } catch {
                // skip malformed JSON
              }
            }
          }

          setIsDone(true);
          setIsStreaming(false);
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setError(
            err.message || "Failed to connect. Is the backend running?"
          );
          setIsStreaming(false);
        });
    },
    []
  );

  const handleReset = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.abort();
    }
    setMessages([]);
    setTraces([]);
    setIsStreaming(false);
    setIsDone(false);
    setError(null);
    setBrief(null);
    setCurrentTarget("");
  };

  /* ─── Password gate ─── */
  if (!authed) {
    return <PasswordGate onAuth={() => setAuthed(true)} />;
  }

  /* ─── Authenticated view ─── */
  const showEmptyState = messages.length === 0 && !isStreaming && !error && !isDone;

  return (
    <>
      <Navbar isStreaming={isStreaming} />
      <main className="page-container">
        {showEmptyState && (
          <div className="hero">
            <h1>BioAgentic</h1>
            <p>
              Search clinical trials &amp; literature, generate
              hypotheses, and debate their merits.
            </p>
          </div>
        )}

        <ResearchForm onSubmit={handleSubmit} isStreaming={isStreaming} />

        {traces.length > 0 && <ActivityTrace traces={traces} />}

        {(messages.length > 0 || error) && (
          <AgentStream
            messages={messages}
            isDone={isDone}
            error={error}
          />
        )}

        {isDone && brief && (
          <ReportView brief={brief} target={currentTarget} />
        )}

        {isDone && (
          <div style={{ textAlign: "center", marginTop: "var(--space-lg)" }}>
            <button className="btn-secondary" onClick={handleReset}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              New Research
            </button>
          </div>
        )}

        {showEmptyState && (
          <div className="empty-state">
            <p>Try a drug target, gene, mutation, or disease above.</p>
          </div>
        )}

        <footer className="footer">
          <p>Powered by Grok &amp; LangGraph</p>
        </footer>
      </main>
    </>
  );
}
