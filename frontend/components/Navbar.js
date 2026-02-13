"use client";

export default function Navbar({ isStreaming }) {
    return (
        <nav className="navbar">
            <a href="/" className="navbar-brand">
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M12 2L12 22" />
                    <path d="M5 7C5 7 8 4 12 4C16 4 19 7 19 7" />
                    <path d="M5 17C5 17 8 20 12 20C16 20 19 17 19 17" />
                    <path d="M5 12C5 12 8 9 12 9C16 9 19 12 19 12" />
                    <circle cx="12" cy="4" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none" />
                </svg>
                BioAgentic
            </a>
            <div className="navbar-status">
                <span className={`status-dot ${isStreaming ? "" : "inactive"}`} />
                {isStreaming ? "Pipeline running…" : "Ready"}
            </div>
        </nav>
    );
}
