"use client";

import { useState, useRef, useCallback } from "react";
import Navbar from "@/components/Navbar";
import ResearchForm from "@/components/ResearchForm";
import ActivityTrace from "@/components/ActivityTrace";
import AgentStream from "@/components/AgentStream";
import ReportView from "@/components/ReportView";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [traces, setTraces] = useState([]);
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
      setTraces([]);
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

                // --- Status event: agent is starting ---
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

                // --- Node complete: update trace with duration ---
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

                // --- Done event ---
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

                // --- Error event ---
                if (data.event === "error") {
                  setError(data.detail || "Pipeline error");
                  setIsStreaming(false);
                  return;
                }

                // --- Agent content message ---
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
    setTraces([]);
    setIsStreaming(false);
    setIsDone(false);
    setError(null);
    setBrief(null);
    setCurrentTarget("");
  };

  const showEmptyState = messages.length === 0 && !isStreaming && !error && !isDone;
  const showResults = messages.length > 0 || error || traces.length > 0;

  return (
    <>
      <Navbar isStreaming={isStreaming} />
      <main className="page-container">
        {/* Hero — only on empty state */}
        {showEmptyState && (
          <div className="hero">
            <h1>BioAgentic</h1>
            <p>
              Search clinical trials &amp; literature, generate
              hypotheses, and debate their merits.
            </p>
          </div>
        )}

        {/* Research Form */}
        <ResearchForm onSubmit={handleSubmit} isStreaming={isStreaming} />

        {/* Activity Traces — Perplexity-style "Show traces" */}
        {traces.length > 0 && (
          <ActivityTrace traces={traces} />
        )}

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
          <div style={{ textAlign: "center", marginTop: "var(--space-lg)" }}>
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

        {/* Empty state hint */}
        {showEmptyState && (
          <div className="empty-state">
            <p>
              Try a drug target, gene, mutation, or disease above.
            </p>
          </div>
        )}

        {/* Footer */}
        <footer className="footer">
          <p>Powered by Grok &amp; LangGraph</p>
        </footer>
      </main>
    </>
  );
}
