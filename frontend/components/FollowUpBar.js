"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AgentCard from "./AgentCard";

/**
 * FollowUpBar — input bar + conversation display for follow-up questions.
 * Appears below the research brief after the pipeline completes.
 *
 * Props:
 *   brief    – the completed research brief (string)
 *   target   – the research target (string)
 */
export default function FollowUpBar({ brief, target }) {
    const [question, setQuestion] = useState("");
    const [rounds, setRounds] = useState(1);
    const [followUps, setFollowUps] = useState([]); // [{question, answer, agents, isStreaming}]
    const [isLoading, setIsLoading] = useState(false);
    const bottomRef = useRef(null);

    // Auto-scroll to bottom when new follow-ups arrive
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [followUps]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!question.trim() || isLoading) return;

        const q = question.trim();
        setQuestion("");
        setIsLoading(true);

        // Add a new follow-up entry in streaming state
        const idx = followUps.length;
        setFollowUps((prev) => [
            ...prev,
            { question: q, answer: "", agents: [], isStreaming: true },
        ]);

        // Call the backend SSE endpoint directly (bypass Next.js proxy for streaming)
        const STREAM_API =
            process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

        try {
            const res = await fetch(`${STREAM_API}/research/followup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target, question: q, context: brief, rounds }),
            });

            const reader = res.body.getReader();
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
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.event === "done") {
                            setFollowUps((prev) =>
                                prev.map((fu, i) =>
                                    i === idx ? { ...fu, isStreaming: false } : fu
                                )
                            );
                        } else if (data.event === "error") {
                            setFollowUps((prev) =>
                                prev.map((fu, i) =>
                                    i === idx
                                        ? {
                                            ...fu,
                                            isStreaming: false,
                                            answer: `Error: ${data.detail}`,
                                        }
                                        : fu
                                )
                            );
                        } else if (data.agent) {
                            // Agent output — accumulate agents, use Synthesizer as the main answer
                            setFollowUps((prev) =>
                                prev.map((fu, i) => {
                                    if (i !== idx) return fu;
                                    const newAgents = [
                                        ...fu.agents,
                                        { agent: data.agent, content: data.content },
                                    ];
                                    // Use the Synthesizer response as the final answer
                                    const answer = data.agent.includes("Synthesizer")
                                        ? data.content
                                        : fu.answer;
                                    return { ...fu, agents: newAgents, answer };
                                })
                            );
                        }
                    } catch {
                        // skip malformed lines
                    }
                }
            }
        } catch (err) {
            setFollowUps((prev) =>
                prev.map((fu, i) =>
                    i === idx
                        ? {
                            ...fu,
                            isStreaming: false,
                            answer: `Connection error: ${err.message}`,
                        }
                        : fu
                )
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="follow-up-section">
            {/* Previous follow-up conversations */}
            {followUps.map((fu, i) => (
                <div key={i} className="follow-up-entry">
                    <div className="follow-up-question">
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
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <span>{fu.question}</span>
                    </div>

                    {/* Agent thought process (collapsed) */}
                    {fu.agents.length > 0 && (
                        <details className="agent-thoughts follow-up-thoughts">
                            <summary className="agent-thoughts-toggle">
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
                                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                </svg>
                                {fu.isStreaming
                                    ? `Thinking… (${fu.agents.length} steps)`
                                    : `View reasoning (${fu.agents.length} steps)`}
                            </summary>
                            <div className="agent-thoughts-content">
                                {fu.agents.map((a, j) => (
                                    <AgentCard
                                        key={j}
                                        agent={a.agent}
                                        content={a.content}
                                        timestamp=""
                                        defaultOpen={false}
                                    />
                                ))}
                            </div>
                        </details>
                    )}

                    {/* Synthesized answer */}
                    {fu.isStreaming && !fu.answer && (
                        <div className="streaming-indicator" style={{ marginTop: "12px" }}>
                            <span className="spinner" />
                            <span>Analyzing your question…</span>
                        </div>
                    )}

                    {fu.answer && (
                        <div className="follow-up-answer">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {fu.answer}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            ))}

            <div ref={bottomRef} />

            {/* Input bar */}
            <form className="follow-up-bar" onSubmit={handleSubmit}>
                <select
                    className="follow-up-rounds"
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))}
                    disabled={isLoading}
                >
                    {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                            {n} {n === 1 ? "round" : "rounds"}
                        </option>
                    ))}
                </select>
                <input
                    type="text"
                    className="follow-up-input"
                    placeholder="Ask a follow-up question about these results…"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    className="follow-up-submit"
                    disabled={isLoading || !question.trim()}
                >
                    {isLoading ? (
                        <span className="spinner" style={{ width: 16, height: 16 }} />
                    ) : (
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    )}
                </button>
            </form>
        </div>
    );
}
