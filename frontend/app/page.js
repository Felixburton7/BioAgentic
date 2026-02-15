"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import ResearchForm from "@/components/ResearchForm";
import ActivityTrace from "@/components/ActivityTrace";
import AgentStream from "@/components/AgentStream";
import ReportView from "@/components/ReportView";
import ClarificationStep from "@/components/ClarificationStep";

/* ─── Prompts that match what the pipeline actually does ─── */
const SAMPLE_PROMPTS = [
  "Investigate KRAS G12C resistance mechanisms and combination therapy strategies",
  "Analyze PD-L1 checkpoint inhibitors in non-small cell lung cancer clinical trials",
  "Search for recent CRISPR-Cas9 delivery methods in solid tumor gene therapy",
  "Review BRCA1/2 mutation landscape and PARP inhibitor clinical outcomes",
  "Explore GLP-1 receptor agonist pipeline for type 2 diabetes and obesity",
  "Investigate CAR-T cell therapy safety signals and cytokine release syndrome data",
];

const DATA_SOURCES = [
  {
    id: "ct",
    name: "ClinicalTrials.gov",
    icon: "🏥",
    desc: "The primary database of privately and publicly funded clinical studies conducted around the world. We query this for trial status, interventions, eligibility criteria, and outcomes.",
  },
  {
    id: "pm",
    name: "PubMed",
    icon: "📚",
    desc: "A free search engine accessing primarily the MEDLINE database of references and abstracts on life sciences and biomedical topics. We use it to find relevant peer-reviewed literature.",
  },
  {
    id: "ss",
    name: "Semantic Scholar",
    icon: "🔬",
    desc: "A free, AI-powered research tool for scientific literature. We utilize its citation graph to find influential papers and understand the connectivity between research topics.",
  },
];

/* ─── Time-ago helper ─── */
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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
      const r = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/auth`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        }
      );
      const data = await r.json();
      if (data.valid) {
        sessionStorage.setItem("bio_auth", "true");
        onAuth();
      } else {
        setError("Invalid password.");
      }
    } catch {
      setError("Cannot reach server.");
    }
    setLoading(false);
  };

  return (
    <div className="password-gate">
      <form className="password-card" onSubmit={handleSubmit}>
        <div className="password-logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L12 22" />
            <path d="M5 7C5 7 8 4 12 4C16 4 19 7 19 7" />
            <path d="M5 17C5 17 8 20 12 20C16 20 19 17 19 17" />
          </svg>
        </div>
        <h1>BioAgentic</h1>
        <p>Agentic biotech research pipeline</p>
        <input
          type="password"
          className="password-input"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="password-error">{error}</p>}
        <button className="password-btn" disabled={loading || !password.trim()}>
          {loading ? "Connecting…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

/* ================================================================
   Main Home Component
   ================================================================ */
export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState([]);
  const [traces, setTraces] = useState([]);
  const [brief, setBrief] = useState("");
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [researchActive, setResearchActive] = useState(false);

  // Clarification state
  const [clarificationData, setClarificationData] = useState(null); // { focus_question, focus_options, target_question, target, rounds }
  const [isClarifying, setIsClarifying] = useState(false);

  // Conversation history — stored in state, persists within session
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [activeTarget, setActiveTarget] = useState("");
  const [expandedSource, setExpandedSource] = useState(null);

  const eventSourceRef = useRef(null);

  // Check saved auth
  useEffect(() => {
    if (sessionStorage.getItem("bio_auth") === "true") {
      setAuthed(true);
    }
    // Load conversations from sessionStorage
    try {
      const saved = sessionStorage.getItem("bio_conversations");
      if (saved) setConversations(JSON.parse(saved));
    } catch { }
  }, []);

  // Save conversations to sessionStorage when they change
  useEffect(() => {
    if (conversations.length > 0) {
      sessionStorage.setItem("bio_conversations", JSON.stringify(conversations));
    }
  }, [conversations]);

  /* ─── Reset for new research ─── */
  const handleReset = useCallback(() => {
    setMessages([]);
    setTraces([]);
    setBrief("");
    setError("");
    setIsStreaming(false);
    setActiveConversationId(null);
    setResearchActive(false);
    setClarificationData(null);
    setIsClarifying(false);
    setActiveTarget("");
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  /* ─── Select a past conversation ─── */
  const handleSelectConversation = useCallback(
    (id) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;
      setMessages(conv.messages || []);
      setTraces(conv.traces || []);
      setBrief(conv.brief || "");
      setError("");
      setIsStreaming(false);
      setActiveConversationId(id);
      setActiveTarget(conv.target || "");
      // Always show the research view when clicking a session
      setResearchActive(true);
    },
    [conversations]
  );

  /* ─── Start Research Stream (Actual Pipeline) ─── */
  const startResearchStream = useCallback(
    ({ target, rounds, clarification }) => {
      setIsStreaming(true);

      // Create new conversation entry
      const convId = Date.now().toString();
      const displayTarget = target.replace(/\[.*?\]\s*/g, "").slice(0, 80);
      const newConv = {
        id: convId,
        target: displayTarget || target.slice(0, 80),
        timestamp: Date.now(),
        timeAgo: "just now",
        status: "running",
        messages: [],
        traces: [],
        brief: "",
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(convId);

      // SSE streams must bypass the Next.js rewrite proxy (it buffers the
      // entire response).  Use the public API URL if set, otherwise call the
      // backend directly on localhost.
      const STREAM_API =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      fetch(`${STREAM_API}/research/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, rounds, clarification }),
      })
        .then((resp) => {
          if (!resp.ok) throw new Error(`Server error ${resp.status}`);
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          const read = () => {
            reader
              .read()
              .then(({ done, value }) => {
                if (done) {
                  setIsStreaming(false);
                  // Update conversation status
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.id === convId ? { ...c, status: "done" } : c
                    )
                  );
                  return;
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (!line.startsWith("data: ")) continue;
                  try {
                    const payload = JSON.parse(line.slice(6));

                    if (payload.event === "status") {
                      // Backend: {event:"status", node:"...", message:"..."}
                      setTraces((prev) => {
                        const updated = [...prev, { message: payload.message || `Processing ${payload.node}…`, node: payload.node }];
                        setConversations((c) =>
                          c.map((x) =>
                            x.id === convId ? { ...x, traces: updated } : x
                          )
                        );
                        return updated;
                      });
                    } else if (payload.event === "node_complete") {
                      // Backend: {event:"node_complete", node:"...", duration: 2.3}
                      setTraces((prev) => {
                        // Update the last trace for this node with its duration
                        const updated = prev.map((t) =>
                          t.node === payload.node && !t.done
                            ? { ...t, duration: payload.duration, done: true }
                            : t
                        );
                        setConversations((c) =>
                          c.map((x) =>
                            x.id === convId ? { ...x, traces: updated } : x
                          )
                        );
                        return updated;
                      });
                    } else if (payload.event === "done") {
                      // Pipeline complete
                      setIsStreaming(false);
                      setConversations((prev) =>
                        prev.map((c) =>
                          c.id === convId ? { ...c, status: "done" } : c
                        )
                      );
                    } else if (payload.event === "error") {
                      // Backend: {event:"error", detail:"..."}
                      setError(payload.detail || "Pipeline error.");
                      setIsStreaming(false);
                      setConversations((prev) =>
                        prev.map((c) =>
                          c.id === convId ? { ...c, status: "error" } : c
                        )
                      );
                    } else if (payload.agent && payload.content) {
                      // Agent message — no "event" field
                      // Backend: {node:"...", agent:"...", content:"...", timestamp:"..."}
                      const agentMsg = {
                        agent: payload.agent,
                        content: payload.content,
                        timestamp: payload.timestamp,
                        node: payload.node,
                      };
                      setMessages((prev) => {
                        const updated = [...prev, agentMsg];
                        setConversations((c) =>
                          c.map((x) =>
                            x.id === convId ? { ...x, messages: updated } : x
                          )
                        );
                        return updated;
                      });

                      // If this is the synthesizer, use its content as the brief
                      if (payload.node === "synthesizer" || payload.agent?.toLowerCase().includes("synthesiz")) {
                        setBrief(payload.content);
                        setConversations((c) =>
                          c.map((x) =>
                            x.id === convId ? { ...x, brief: payload.content } : x
                          )
                        );
                      }
                    }
                  } catch { }
                }
                read();
              })
              .catch((err) => {
                setError(err.message);
                setIsStreaming(false);
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === convId ? { ...c, status: "error" } : c
                  )
                );
              });
          };
          read();
        })
        .catch((err) => {
          setError(err.message || "Connection failed.");
          setIsStreaming(false);
        });
    },
    []
  );
  const handleSubmit = useCallback(
    async ({ target, rounds }) => {
      // 1. Reset previous state
      handleReset();
      setResearchActive(true); // Switch to "active" view immediately
      setActiveTarget(target);
      setError("");

      // 2. Start Clarification Phase
      setIsStreaming(true); // Show loading spinner on form temporarily

      const API = process.env.NEXT_PUBLIC_API_URL || "";
      try {
        const res = await fetch(`${API}/research/clarify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, rounds }),
        });
        if (!res.ok) throw new Error("Failed to get clarification");
        const data = await res.json();

        // 3. Show Clarification Step
        setClarificationData({
          focusQuestion: data.focus_question,
          focusOptions: data.focus_options,
          targetQuestion: data.target_question,
          disambiguation: data.disambiguation,
          target,
          rounds
        });
        setIsClarifying(true);
        setIsStreaming(false); // Stop spinner, show modal

      } catch (err) {
        // Fallback: start research directly if clarification fails
        console.error("Clarification failed, skipping:", err);
        startResearchStream({ target, rounds, clarification: "" });
      }
    },
    [handleReset, startResearchStream]
  );

  /* ─── Confirm Clarification & Start Stream ─── */
  const handleClarificationConfirm = useCallback((clarificationResponse) => {
    if (!clarificationData) return;
    const { target, rounds } = clarificationData;

    // Hide modal
    setIsClarifying(false);
    setClarificationData(null);

    // Start actual research
    startResearchStream({ target, rounds, clarification: clarificationResponse });
  }, [clarificationData, startResearchStream]);

  const handleClarificationBack = useCallback(() => {
    // If going back, pre-fill with the original prompt so user can edit
    if (clarificationData?.target) {
      setPendingPrompt(clarificationData.target);
    }
    setIsClarifying(false);
    setClarificationData(null);
    setResearchActive(false); // Go back to home
    setIsStreaming(false);
  }, [clarificationData]);




  // Update timeAgo every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setConversations((prev) =>
        prev.map((c) => ({ ...c, timeAgo: timeAgo(c.timestamp) }))
      );
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!authed) {
    return <PasswordGate onAuth={() => setAuthed(true)} />;
  }

  const showHome = !researchActive;

  return (
    <div className="app-layout">
      <Sidebar
        conversations={conversations}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onSelectConversation={handleSelectConversation}
        activeConversationId={activeConversationId}
      />

      <div className={`main-content ${!sidebarOpen ? "sidebar-collapsed" : ""}`}>
        {isClarifying && clarificationData && (
          <div className="clarification-overlay">
            <ClarificationStep
              focusQuestion={clarificationData.focusQuestion}
              focusOptions={clarificationData.focusOptions}
              targetQuestion={clarificationData.targetQuestion}
              disambiguation={clarificationData.disambiguation}
              onConfirm={handleClarificationConfirm}
              onBack={handleClarificationBack}
            />
          </div>
        )}

        <Navbar isStreaming={isStreaming} />

        <main className={`page-container ${brief ? "page-container-wide" : ""}`}>
          {showHome ? (
            <>
              {/* Greeting */}
              <div className="home-form-section">
                <h1 className="home-greeting">Open Source Agentic Bio Research</h1>
                <p className="home-subtitle">
                  Query clinical trials, literature, and biomedical databases with AI-powered agents. Open-source, no queries or searches saved and directly plugged into database API's
                </p>
                <ResearchForm onSubmit={handleSubmit} isStreaming={isStreaming} fillPrompt={pendingPrompt} onPromptFilled={() => setPendingPrompt("")} />


              </div>

              {/* Sample prompts */}
              <div className="home-section">
                <h3 className="home-section-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  Try a research query
                </h3>
                <div className="prompt-cards">
                  {SAMPLE_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      className="prompt-card"
                      onClick={() => setPendingPrompt(prompt)}
                    >
                      <span className="prompt-card-text">{prompt}</span>
                      <span className="prompt-card-arrow">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Data sources info */}
              <div className="home-section">
                <h3 className="home-section-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  </svg>
                  Data sources queried
                </h3>
                <div className="db-tools-chips">
                  {DATA_SOURCES.map((source) => (
                    <button
                      key={source.id}
                      className={`db-tool-chip ${expandedSource === source.id ? "active" : ""}`}
                      onClick={() => setExpandedSource(expandedSource === source.id ? null : source.id)}
                      style={{
                        cursor: "pointer",
                        borderColor: expandedSource === source.id ? "var(--border-strong)" : "",
                        backgroundColor: expandedSource === source.id ? "var(--bg-tertiary)" : "",
                      }}
                    >
                      <span className="db-tool-chip-icon">{source.icon}</span> {source.name}
                    </button>
                  ))}
                </div>
                {expandedSource && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "16px",
                      background: "var(--bg-secondary)",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border)",
                      fontSize: "14px",
                      color: "var(--text-secondary)",
                      animation: "fadeIn 0.3s ease",
                      lineHeight: "1.6",
                    }}
                  >
                    <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: "4px" }}>
                      {DATA_SOURCES.find((s) => s.id === expandedSource)?.name}
                    </strong>
                    {DATA_SOURCES.find((s) => s.id === expandedSource)?.desc}
                  </div>
                )}
              </div>

              <div className="features-grid">
                <div className="feature-card">
                  <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  <h3>Open Source</h3>
                  <p>Transparent code you can inspect. Verify exactly how your research is processed.</p>
                </div>
                <div className="feature-card">
                  <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <h3>100% Private</h3>
                  <p>Zero data tracking. Your research queries and results are never stored or shared.</p>
                </div>
                <div className="feature-card">
                  <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <h3>Agentic Debate</h3>
                  <p>Agents with unique personalities debate and fact-check to ensure high-quality, verified answers.</p>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Active research view */}
              <div className="active-research-header">
                <button className="btn-secondary" onClick={handleReset}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                  New Research
                </button>
              </div>

              <ResearchForm onSubmit={handleSubmit} isStreaming={isStreaming} fillPrompt={activeTarget} />

              {/* Error display */}
              {error && (
                <div className="error-banner">
                  <p>⚠️ {error}</p>
                </div>
              )}

              <ActivityTrace traces={traces} isStreaming={isStreaming} />

              {/* Loading indicator when streaming but no data yet */}
              {isStreaming && messages.length === 0 && !error && (
                <div className="streaming-indicator">
                  <span className="spinner" />
                  <span>Connecting to research pipeline…</span>
                </div>
              )}

              <AgentStream messages={messages} isDone={!isStreaming && messages.length > 0} error={""} />
              {brief && <ReportView brief={brief} />}

              {/* Empty state for past sessions that had no data */}
              {!isStreaming && messages.length === 0 && !brief && !error && (
                <div className="empty-research">
                  <p>No results available for this session.</p>
                </div>
              )}
            </>
          )}
        </main>

        <footer className="footer">
          <p>BioAgentic — ClinicalTrials.gov · PubMed · Semantic Scholar · Grok LLM</p>
        </footer>
      </div>
    </div>
  );
}
