"use client";

import AgentCard from "./AgentCard";

const PIPELINE_STEPS = [
    { key: "analyzer", label: "Analyze" },
    { key: "trials_scout", label: "Trials" },
    { key: "literature_miner", label: "Literature" },
    { key: "hypothesis_generator", label: "Hypotheses" },
    { key: "debate", label: "Debate" },
    { key: "synthesizer", label: "Synthesize" },
];

function getCurrentStepIndex(messages) {
    if (messages.length === 0) return -1;
    const lastNode = messages[messages.length - 1]?.node;
    const idx = PIPELINE_STEPS.findIndex((s) => s.key === lastNode);
    return idx >= 0 ? idx : -1;
}

export default function AgentStream({ messages, isDone, error }) {
    const currentIdx = getCurrentStepIndex(messages);

    return (
        <div>
            {/* Pipeline progress bar */}
            {messages.length > 0 && (
                <div className="pipeline-progress">
                    {PIPELINE_STEPS.map((step, i) => (
                        <div key={step.key} style={{ display: "flex", alignItems: "center" }}>
                            <div
                                className={`pipeline-step ${i < currentIdx || isDone
                                    ? "completed"
                                    : i === currentIdx && !isDone
                                        ? "active"
                                        : ""
                                    }`}
                            >
                                <span className="pipeline-step-dot" />
                                <span>{step.label}</span>
                            </div>
                            {i < PIPELINE_STEPS.length - 1 && (
                                <div
                                    className={`pipeline-step-line ${i < currentIdx || isDone ? "completed" : ""
                                        }`}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div className="error-banner">
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                    </svg>
                    <p>{error}</p>
                </div>
            )}

            {/* Agent cards - collapsed by default when pipeline is done */}
            {messages.length > 0 && (
                <div className="agent-stream">
                    {isDone ? (
                        /* --- Final output: collapsible "thought process" section --- */
                        <details className="agent-thoughts">
                            <summary className="agent-thoughts-toggle">
                                <svg
                                    className="agent-thoughts-icon"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                                </svg>
                                View agent thought process ({messages.length} steps)
                            </summary>
                            <div className="agent-thoughts-content">
                                {messages.map((msg, i) => (
                                    <AgentCard
                                        key={i}
                                        agent={msg.agent}
                                        content={msg.content}
                                        timestamp={msg.timestamp}
                                        defaultOpen={false}
                                    />
                                ))}
                            </div>
                        </details>
                    ) : (
                        /* --- Streaming: show cards live, most recent open --- */
                        <>
                            {messages.map((msg, i) => (
                                <AgentCard
                                    key={i}
                                    agent={msg.agent}
                                    content={msg.content}
                                    timestamp={msg.timestamp}
                                    defaultOpen={false}
                                />
                            ))}
                        </>
                    )}
                </div>
            )}

            {/* Loading skeleton while streaming */}
            {!isDone && !error && messages.length > 0 && (
                <div className="loading-skeleton">
                    <div className="skeleton-card">
                        <div className="skeleton-line short" />
                        <div className="skeleton-line long" />
                        <div className="skeleton-line medium" />
                    </div>
                </div>
            )}
        </div>
    );
}
