"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const AGENT_STYLES = {
    analyzer: { label: "Target Analyzer", className: "analyzer" },
    target_analyzer: { label: "Target Analyzer", className: "analyzer" },
    trials_scout: { label: "Trials Scout", className: "trials" },
    literature_miner: { label: "Literature Miner", className: "literature" },
    hypothesis_generator: { label: "Hypothesis Generator", className: "hypothesis" },
    hypothesis: { label: "Hypothesis Generator", className: "hypothesis" },
    advocate: { label: "Advocate", className: "advocate" },
    skeptic: { label: "Skeptic", className: "skeptic" },
    mediator: { label: "Mediator", className: "mediator" },
    synthesizer: { label: "Synthesizer", className: "synthesizer" },
    debate: { label: "Debate", className: "mediator" },
};

function getAgentStyle(agentName) {
    // Try exact match first, then normalised key
    const key = agentName?.toLowerCase().replace(/\s*\(r\d+\)/g, "").replace(/\s+/g, "_").trim();
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

const Chevron = ({ open }) => (
    <svg
        className={`chevron ${open ? "open" : ""}`}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

export default function AgentCard({ agent, content, timestamp, defaultOpen = true }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const style = getAgentStyle(agent);

    return (
        <div className="agent-card">
            <div className="agent-card-header" onClick={() => setIsOpen(!isOpen)}>
                <Chevron open={isOpen} />
                <span className="agent-badge">
                    <span className={`agent-badge-dot ${style.className}`} />
                    {agent || style.label}
                </span>
                <span className="agent-timestamp">{formatTime(timestamp)}</span>
            </div>
            <div className={`agent-card-content ${isOpen ? "" : "collapsed"}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
        </div>
    );
}
