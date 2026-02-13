"use client";

import { useState } from "react";

export default function ResearchForm({ onSubmit, isStreaming }) {
    const [target, setTarget] = useState("");
    const [rounds, setRounds] = useState(2);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!target.trim() || isStreaming) return;
        onSubmit({ target: target.trim(), rounds });
    };

    return (
        <form className="research-form" onSubmit={handleSubmit}>
            <div className="form-row">
                <div className="form-group">
                    <label htmlFor="target">Research Target</label>
                    <input
                        id="target"
                        className="form-input"
                        type="text"
                        placeholder="e.g. KRAS G12C, PD-L1, BRCA1…"
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                        disabled={isStreaming}
                        autoComplete="off"
                    />
                </div>
                <div className="form-group" style={{ maxWidth: 120 }}>
                    <label htmlFor="rounds">Rounds</label>
                    <select
                        id="rounds"
                        className="form-select"
                        value={rounds}
                        onChange={(e) => setRounds(Number(e.target.value))}
                        disabled={isStreaming}
                    >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
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
                            Running…
                        </>
                    ) : (
                        <>
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
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                            </svg>
                            Research
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}
