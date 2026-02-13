"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Navbar from "@/components/Navbar";
import ResearchForm from "@/components/ResearchForm";
import ActivityTrace from "@/components/ActivityTrace";
import AgentStream from "@/components/AgentStream";
import ReportView from "@/components/ReportView";
import Sidebar from "@/components/Sidebar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/* ─── Category pills ─── */
const CATEGORIES = [
  "Omics",
  "Molecular Design",
  "Genome Engineering",
  "Human Genetics",
  "Small Molecule",
  "Proteomics",
  "Immunology",
];

/* ─── Sample prompts ─── */
const SAMPLE_PROMPTS = [
  "Analyze my single-cell RNA-seq data. Perform quality control, normalization, clustering, and cell type annotation using marker genes.",
  "Run differential expression analysis between treatment and control groups in my bulk RNA-seq dataset using DESeq2.",
  "Download and analyze dataset GSE123456 from GEO. Perform exploratory data analysis and identify key biological insights.",
];

/* ─── Workflows ─── */
const WORKFLOWS = [
  { title: "Bulk RNAseq differential expressio…", desc: "Perform differential expression analysis using DESeq2 on RNA-seq raw count…" },
  { title: "Weighted Gene Co-expression…", desc: "Build gene co-expression networks to identify modules and hub genes from…" },
  { title: "Single-Cell RNA-seq Core Analysis…", desc: "Complete single-cell RNA-seq analysis using Scanpy from raw data to cell typ…" },
];

/* ─── Databases & Tools chips ─── */
const DB_TOOLS = [
  { name: "Ensembl", icon: "🧬" },
  { name: "NCBI Gene", icon: "🧬" },
  { name: "NCBI Protein", icon: "🧬" },
  { name: "NCBI Taxonomy", icon: "🧬" },
  { name: "GEO", icon: "🧬" },
  { name: "dbSNP", icon: "🧬" },
  { name: "minimap2", icon: "🔧" },
  { name: "HISAT2", icon: "🔧" },
  { name: "STAR", icon: "🔧" },
  { name: "bowtie2", icon: "🔧" },
  { name: "scanpy", icon: "📦" },
  { name: "anndata", icon: "📦" },
  { name: "mudata", icon: "📦" },
  { name: "muon", icon: "📦" },
];

/* ─── Task history (mock data for sidebar) ─── */
const MOCK_TASKS = [
  { id: 1, title: "KRAS G12C Analysis", time: "12m ago" },
  { id: 2, title: "PD-L1 Literature Review", time: "2h ago" },
  { id: 3, title: "BRCA1 Mutation Study", time: "3h ago" },
  { id: 4, title: "Triple-Negative Breast Ca…", time: "5h ago" },
];

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
        <div className="password-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L12 22" /><path d="M5 7C5 7 8 4 12 4C16 4 19 7 19 7" /><path d="M5 17C5 17 8 20 12 20C16 20 19 17 19 17" />
          </svg>
        </div>
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState(null);
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
    <div className="app-layout">
      <Sidebar
        tasks={MOCK_TASKS}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        isStreaming={isStreaming}
      />

      <div className={`main-content ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <Navbar isStreaming={isStreaming} />

        <main className="page-container">
          {showEmptyState && (
            <>
              {/* Hero greeting */}
              <div className="hero">
                <div className="hero-greeting">
                  <div className="hero-logo-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L12 22" /><path d="M5 7C5 7 8 4 12 4C16 4 19 7 19 7" /><path d="M5 17C5 17 8 20 12 20C16 20 19 17 19 17" />
                    </svg>
                  </div>
                  <h1>Hi Felix,</h1>
                </div>
                <p className="hero-subtitle">
                  I&apos;m your virtual research collaborator—built to reason, compute, and iterate alongside you.
                </p>
              </div>
            </>
          )}

          <ResearchForm onSubmit={handleSubmit} isStreaming={isStreaming} />

          {/* Category pills */}
          {showEmptyState && (
            <div className="category-pills">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  className={`category-pill ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                >
                  {cat}
                </button>
              ))}
              <button className="category-pill category-pill-more" title="More categories">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          )}

          {/* Sample Prompts */}
          {showEmptyState && (
            <div className="home-section">
              <h3 className="home-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                Sample Prompts
              </h3>
              <div className="prompt-cards">
                {SAMPLE_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    className="prompt-card"
                    onClick={() => handleSubmit({ target: prompt, rounds: 2 })}
                  >
                    <span className="prompt-card-text">{prompt}</span>
                    <svg className="prompt-card-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Workflows */}
          {showEmptyState && (
            <div className="home-section">
              <h3 className="home-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                Workflows
              </h3>
              <div className="workflow-cards">
                {WORKFLOWS.map((wf, i) => (
                  <div key={i} className="workflow-card">
                    <div className="workflow-card-header">
                      <span className="workflow-title">{wf.title}</span>
                      <span className="workflow-visibility-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      </span>
                    </div>
                    <p className="workflow-desc">{wf.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Databases & Tools & Packages */}
          {showEmptyState && (
            <div className="home-section">
              <h3 className="home-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
                Databases & Tools & Packages
              </h3>
              <div className="db-tools-chips">
                {DB_TOOLS.map((item) => (
                  <span key={item.name} className="db-tool-chip">
                    <span className="db-tool-chip-icon">{item.icon}</span>
                    {item.name}
                  </span>
                ))}
                <span className="db-tool-chip db-tool-more">and more…</span>
              </div>
            </div>
          )}

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
            <div className="empty-state-hint">
              <p>Try a drug target, gene, mutation, or disease above.</p>
            </div>
          )}

          <footer className="footer">
            <p>Powered by Grok & LangGraph</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
