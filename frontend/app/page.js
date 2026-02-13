"use client";

import { useState, useRef, useCallback } from "react";
import Navbar from "@/components/Navbar";
import ResearchForm from "@/components/ResearchForm";
import AgentStream from "@/components/AgentStream";
import ReportView from "@/components/ReportView";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);
  const [currentTarget, setCurrentTarget] = useState("");
  const eventSourceRef = useRef(null);

  const handleSubmit = useCallback(
    ({ target, rounds }) => {
      // Reset state
      setMessages([]);
      setIsStreaming(true);
      setIsDone(false);
      setError(null);
      setBrief(null);
      setCurrentTarget(target);

      // SSE via fetch for POST support
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

                if (data.event === "done") {
                  setIsDone(true);
                  setIsStreaming(false);

                  // Fetch the full report
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
                // Skip malformed JSON
              }
            }
          }

          // If stream ended without a done event
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
    setIsStreaming(false);
    setIsDone(false);
    setError(null);
    setBrief(null);
    setCurrentTarget("");
  };

  return (
    <>
      <Navbar isStreaming={isStreaming} />
      <main className="page-container">
        {/* Hero */}
        <div className="hero">
          <div className="hero-label">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L12 22" />
              <path d="M5 7C5 7 8 4 12 4C16 4 19 7 19 7" />
              <path d="M5 17C5 17 8 20 12 20C16 20 19 17 19 17" />
            </svg>
            Multi-Agent Research Pipeline
          </div>
          <h1>BioAgentic</h1>
          <p>
            Search clinical trials &amp; literature, generate hypotheses, and
            debate their merits — all powered by a multi-agent pipeline.
          </p>
        </div>

        {/* Research Form */}
        <ResearchForm onSubmit={handleSubmit} isStreaming={isStreaming} />

        {/* Streaming Output */}
        {(messages.length > 0 || error) && (
          <AgentStream
            messages={messages}
            isDone={isDone}
            error={error}
          />
        )}

        {/* Final Report */}
        {isDone && brief && (
          <ReportView brief={brief} target={currentTarget} />
        )}

        {/* New Research button */}
        {isDone && (
          <div style={{ textAlign: "center", marginTop: "var(--space-xl)" }}>
            <button className="btn-secondary" onClick={handleReset}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              New Research
            </button>
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && !isStreaming && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">🧬</div>
            <h3>Enter a research target to begin</h3>
            <p>
              Try a drug target like &quot;KRAS G12C&quot;, a gene like
              &quot;BRCA1&quot;, or a disease like &quot;Triple-negative breast
              cancer&quot;.
            </p>
          </div>
        )}

        {/* Footer */}
        <footer className="footer">
          <p>
            BioAgentic — Powered by Grok &amp; LangGraph
          </p>
        </footer>
      </main>
    </>
  );
}
