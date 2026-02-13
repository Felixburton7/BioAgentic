"use client";

import { useState } from "react";

/**
 * Perplexity-style "Show traces" section that displays
 * real-time pipeline activity with durations.
 */
export default function ActivityTrace({ traces }) {
    const [isOpen, setIsOpen] = useState(false);

    if (!traces || traces.length === 0) return null;

    return (
        <div className="activity-trace">
            <button
                className="trace-toggle"
                onClick={() => setIsOpen(!isOpen)}
            >
                <svg
                    className={`trace-chevron ${isOpen ? "open" : ""}`}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
                Show traces
            </button>

            {isOpen && (
                <div className="trace-list">
                    {traces.map((t, i) => (
                        <div key={i} className="trace-item">
                            <span className="trace-icon">
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
                            </span>
                            <span className="trace-message">{t.message}</span>
                            {t.duration != null && (
                                <span className="trace-duration">
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    {t.duration}s
                                </span>
                            )}
                            {!t.done && t.duration == null && (
                                <span className="trace-spinner-wrap">
                                    <span className="trace-spinner" />
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
