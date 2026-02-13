"use client";

import { useState } from "react";

const QUICK_PICKS = [
    { label: "KRAS G12C", icon: "🧬" },
    { label: "PD-L1", icon: "🛡️" },
    { label: "BRCA1", icon: "🔬" },
    { label: "Triple-negative breast cancer", icon: "📋" },
];

export default function ResearchForm({ onSubmit, isStreaming }) {
    const [target, setTarget] = useState("");
    const [rounds, setRounds] = useState(2);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!target.trim() || isStreaming) return;
        onSubmit({ target: target.trim(), rounds });
    };

    const handleQuickPick = (label) => {
        if (isStreaming) return;
        setTarget(label);
        onSubmit({ target: label, rounds });
    };

    return (
        <div>
            <form className="research-form" onSubmit={handleSubmit}>
                <div className="form-row">
                    <div className="form-group">
                        <label htmlFor="target">Research Target</label>
                        <input
                            id="target"
                            className="form-input"
                            type="text"
                            placeholder="Search a target, gene, or disease…"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            disabled={isStreaming}
                            autoComplete="off"
                        />
                    </div>
                    <div className="form-group" style={{ maxWidth: 80, flex: "0 0 80px" }}>
                        <label htmlFor="rounds">Rounds</label>
                        <select
                            id="rounds"
                            className="form-select"
                            value={rounds}
                            onChange={(e) => setRounds(Number(e.target.value))}
                            disabled={isStreaming}
                        >
                            <option value={1}>1 rnd</option>
                            <option value={2}>2 rnd</option>
                            <option value={3}>3 rnd</option>
                            <option value={4}>4 rnd</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={!target.trim() || isStreaming}
                    >
                        {isStreaming ? (
                            <>
                                <span className="spinner" />
                            </>
                        ) : (
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        )}
                    </button>
                </div>
            </form>

            {/* Quick picks — shown when not streaming and no target entered */}
            {!isStreaming && !target.trim() && (
                <div className="quick-picks">
                    {QUICK_PICKS.map((qp) => (
                        <button
                            key={qp.label}
                            type="button"
                            className="quick-pick"
                            onClick={() => handleQuickPick(qp.label)}
                        >
                            <span className="quick-pick-icon">{qp.icon}</span>
                            {qp.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
