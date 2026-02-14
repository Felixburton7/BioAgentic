"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Perplexity-style "Show traces" section that displays
 * real-time pipeline activity with durations.
 *
 * - Auto-opens when streaming begins (isStreaming=true)
 * - Auto-collapses when the pipeline completes (isStreaming transitions to false)
 * - User can manually toggle at any time
 */
export default function ActivityTrace({ traces, isStreaming }) {
    const [isOpen, setIsOpen] = useState(false);
    const wasStreamingRef = useRef(false);

    // Auto-open when streaming starts, auto-collapse when it finishes
    useEffect(() => {
        if (isStreaming && !wasStreamingRef.current) {
            // Streaming just started — open the traces
            setIsOpen(true);
        } else if (!isStreaming && wasStreamingRef.current) {
            // Streaming just ended — collapse the traces
            setIsOpen(false);
        }
        wasStreamingRef.current = isStreaming;
    }, [isStreaming]);

    if (!traces || traces.length === 0) return null;

    const doneCount = traces.filter((t) => t.done).length;
    const totalCount = traces.length;

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
                {isStreaming ? (
                    <>
                        <span className="trace-spinner" />
                        <span>Searching… ({doneCount}/{totalCount} steps)</span>
                    </>
                ) : (
                    <span>Show traces ({totalCount} steps)</span>
                )}
            </button>

            {isOpen && (
                <div className="trace-list">
                    {traces.map((t, i) => (
                        <div key={i} className="trace-item">
                            <span className="trace-icon">
                                {t.done ? (
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="var(--accent)"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : (
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
                                )}
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
