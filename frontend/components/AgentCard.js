"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const AGENT_STYLES = {
    analyzer: { label: "Analyzer", className: "analyzer" },
    target_analyzer: { label: "Analyzer", className: "analyzer" },
    trials_scout: { label: "Trials Scout", className: "trials" },
    literature_miner: { label: "Literature", className: "literature" },
    hypothesis_generator: { label: "Hypothesis", className: "hypothesis" },
    hypothesis: { label: "Hypothesis", className: "hypothesis" },
    advocate: { label: "Advocate", className: "advocate" },
    skeptic: { label: "Skeptic", className: "skeptic" },
    mediator: { label: "Mediator", className: "mediator" },
    synthesizer: { label: "Synthesizer", className: "synthesizer" },
    debate: { label: "Debate", className: "mediator" },
};

function getAgentStyle(agentName) {
    const key = agentName?.toLowerCase().replace(/\s+/g, "_");
    return AGENT_STYLES[key] || { label: agentName || "Agent", className: "analyzer" };
}

function formatTime(timestamp) {
    if (!timestamp) return "";
    try {
        const d = new Date(timestamp);
        return d.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    } catch {
        return "";
    }
}

export default function AgentCard({ agent, content, timestamp }) {
    const style = getAgentStyle(agent);

    return (
        <div className="agent-card">
            <div className="agent-card-header">
                <span className={`agent-badge ${style.className}`}>{style.label}</span>
                <span className="agent-timestamp">{formatTime(timestamp)}</span>
            </div>
            <div className="agent-card-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
        </div>
    );
}
