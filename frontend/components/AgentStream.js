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

            {/* Agent cards */}
            <div className="agent-stream">
                {messages.map((msg, i) => (
                    <AgentCard
                        key={i}
                        agent={msg.agent}
                        content={msg.content}
                        timestamp={msg.timestamp}
                    />
                ))}
            </div>

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
