"use client";

export default function Navbar({ isStreaming }) {
    return (
        <nav className="navbar">
            <div className="navbar-left">
                <a href="/" className="navbar-brand">
                    <svg
                        width="18"
                        height="18"
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
                    </svg>
                    BioAgentic
                </a>
            </div>
            <div className="navbar-status">
                <span className={`status-dot ${isStreaming ? "" : "inactive"}`} />
                {isStreaming ? "Researching…" : "Ready"}
            </div>
        </nav>
    );
}
