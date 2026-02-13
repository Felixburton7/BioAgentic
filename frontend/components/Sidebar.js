"use client";

import { useState } from "react";

export default function Sidebar({ tasks, isOpen, onToggle, isStreaming }) {
    const [activeTab, setActiveTab] = useState("tasks");

    return (
        <aside className={`sidebar ${isOpen ? "open" : "closed"}`}>
            {/* Sidebar header */}
            <div className="sidebar-header">
                <div className="sidebar-brand">
                    <span className="sidebar-project-label">PROJECT</span>
                    <div className="sidebar-project-name">
                        <span>Quick Tasks</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </div>
                </div>
                <div className="sidebar-header-actions">
                    <button className="sidebar-icon-btn" title="Settings">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                        </svg>
                    </button>
                    <button className="sidebar-icon-btn" title="Split view">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="3" x2="12" y2="21" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="sidebar-tabs">
                <button
                    className={`sidebar-tab ${activeTab === "tasks" ? "active" : ""}`}
                    onClick={() => setActiveTab("tasks")}
                >
                    Tasks
                </button>
                <button
                    className={`sidebar-tab ${activeTab === "files" ? "active" : ""}`}
                    onClick={() => setActiveTab("files")}
                >
                    Files
                </button>
                <div className="sidebar-tab-actions">
                    <button className="sidebar-icon-btn" title="Search">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                        </svg>
                    </button>
                    <button className="sidebar-new-task-btn">
                        + New Task
                    </button>
                </div>
            </div>

            {/* Task list */}
            <div className="sidebar-task-list">
                {tasks.map((task) => (
                    <div key={task.id} className="sidebar-task-item">
                        <span className="sidebar-task-dot" />
                        <span className="sidebar-task-title">{task.title}</span>
                        <span className="sidebar-task-time">{task.time}</span>
                    </div>
                ))}
            </div>

            {/* Sidebar footer */}
            <div className="sidebar-footer">
                <button className="sidebar-footer-btn" title="Help">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>Help</span>
                </button>
                <button className="sidebar-footer-btn sidebar-footer-resources" title="Resources">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    </svg>
                    <span>Resources</span>
                </button>
                <div className="sidebar-user-avatar" title="Felix">
                    FB
                </div>
            </div>
        </aside>
    );
}
