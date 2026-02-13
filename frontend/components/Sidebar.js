"use client";

import { useState } from "react";

export default function Sidebar({ conversations, isOpen, onToggle, onSelectConversation, activeConversationId }) {
    return (
        <>
            {/* Toggle button — always visible */}
            <button
                className={`sidebar-toggle-btn ${isOpen ? "open" : ""}`}
                onClick={onToggle}
                title={isOpen ? "Close sidebar" : "Open sidebar"}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isOpen ? (
                        <>
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="9" y1="3" x2="9" y2="21" />
                        </>
                    ) : (
                        <>
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                        </>
                    )}
                </svg>
            </button>

            <aside className={`sidebar ${isOpen ? "open" : "closed"}`}>
                {/* Sidebar header */}
                <div className="sidebar-header">
                    <div className="sidebar-brand">
                        <span className="sidebar-project-label">RESEARCH HISTORY</span>
                        <div className="sidebar-project-name">
                            <span>Sessions</span>
                        </div>
                    </div>
                    <button
                        className="sidebar-icon-btn"
                        onClick={onToggle}
                        title="Close sidebar"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Task list — real conversations */}
                <div className="sidebar-task-list">
                    {conversations.length === 0 ? (
                        <div className="sidebar-empty">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="8" y1="15" x2="16" y2="15" />
                                <line x1="9" y1="9" x2="9.01" y2="9" />
                                <line x1="15" y1="9" x2="15.01" y2="9" />
                            </svg>
                            <p>No research sessions yet</p>
                            <p className="sidebar-empty-hint">Submit a query to start your first session</p>
                        </div>
                    ) : (
                        conversations.map((conv) => (
                            <button
                                key={conv.id}
                                className={`sidebar-task-item ${activeConversationId === conv.id ? "active" : ""}`}
                                onClick={() => onSelectConversation(conv.id)}
                            >
                                <span className={`sidebar-task-dot ${conv.status}`} />
                                <span className="sidebar-task-title">{conv.target}</span>
                                <span className="sidebar-task-time">{conv.timeAgo}</span>
                            </button>
                        ))
                    )}
                </div>

                {/* Sidebar footer */}
                <div className="sidebar-footer">
                    <a
                        href="https://github.com/Felixburton7/BioAgentic"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sidebar-footer-btn"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <span>Help & Docs</span>
                    </a>
                    <a
                        href="https://github.com/Felixburton7/BioAgentic#readme"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sidebar-footer-btn"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                            <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                        </svg>
                        <span>Resources</span>
                    </a>
                </div>
            </aside>
        </>
    );
}
