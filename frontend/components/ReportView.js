"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* ─── Parse headings from markdown for TOC ─── */
function parseHeadings(markdown) {
    if (!markdown) return [];
    const lines = markdown.split("\n");
    const headings = [];
    for (const line of lines) {
        const m2 = line.match(/^## (.+)/);
        const m3 = line.match(/^### (.+)/);
        if (m2) {
            const text = m2[1].trim();
            const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
            headings.push({ level: 2, text, id });
        } else if (m3) {
            const text = m3[1].trim();
            const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
            headings.push({ level: 3, text, id });
        }
    }
    return headings;
}

/* ─── Extract source citations from the brief ─── */
function extractSources(markdown) {
    if (!markdown) return [];
    const sources = [];
    const seen = new Set();

    // Pattern 1: Bold text that looks like journal/source names
    const boldPattern = /\*\*([^*]+)\*\*/g;
    let match;
    const lines = markdown.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip heading lines and table headers
        if (line.startsWith("#") || line.startsWith("|--")) continue;

        // Look for NCT IDs
        const nctPattern = /NCT\d{7,8}/g;
        let nctMatch;
        while ((nctMatch = nctPattern.exec(line)) !== null) {
            const nctId = nctMatch[0];
            if (!seen.has(nctId)) {
                seen.add(nctId);
                // Get some context around the NCT ID
                const contextStart = Math.max(0, nctMatch.index - 40);
                const contextEnd = Math.min(line.length, nctMatch.index + nctId.length + 60);
                let context = line.substring(contextStart, contextEnd).replace(/\*\*/g, "").replace(/\|/g, "").trim();
                if (contextStart > 0) context = "…" + context;
                if (contextEnd < line.length) context = context + "…";
                sources.push({
                    type: "clinical_trial",
                    label: nctId,
                    context: context,
                    line: i + 1,
                    section: findSection(lines, i),
                    url: `https://clinicaltrials.gov/study/${nctId}`
                });
            }
        }

        // Look for bold references that seem like sources (journals, papers, databases)
        while ((match = boldPattern.exec(line)) !== null) {
            const text = match[1].trim();
            // Filter: only items that look like source references
            const isSource =
                /journal|lancet|nature|science|cell|oncology|nejm|bmc|plos|cancer|research|review|annals|clinical|medicine|therapeutics|pharmacology|biochem/i.test(text) ||
                /pubmed|clinicaltrials|semantic scholar/i.test(text) ||
                (text.length > 10 && text.length < 80 && /[A-Z]/.test(text[0]) && !/^(Strong|Moderate|Weak|Phase|Total|Active|Recruiting|Completed|High|Low|Yes|No|Hypothesis|Key|NCT)/i.test(text));

            if (isSource && !seen.has(text) && text.length > 3) {
                seen.add(text);
                // Get surrounding context
                const idx = match.index;
                const contextStart = Math.max(0, idx - 30);
                const contextEnd = Math.min(line.length, idx + text.length + 60);
                let context = line.substring(contextStart, contextEnd).replace(/\*\*/g, "").replace(/\|/g, "").trim();
                if (contextStart > 0) context = "…" + context;
                if (contextEnd < line.length) context = context + "…";
                sources.push({
                    type: "literature",
                    label: text,
                    context: context,
                    line: i + 1,
                    section: findSection(lines, i),
                    url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(text)}`
                });
            }
        }
    }

    // Also parse the References section explicitly
    let inReferences = false;
    for (let i = 0; i < lines.length; i++) {
        if (/^## References/i.test(lines[i])) {
            inReferences = true;
            continue;
        }
        if (inReferences && /^## /.test(lines[i])) break;
        if (inReferences && lines[i].trim()) {
            const refText = lines[i].replace(/^\d+\.\s*/, "").replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim();
            if (refText && !seen.has(refText) && refText.length > 3) {
                seen.add(refText);
                sources.push({
                    type: "reference",
                    label: refText.length > 60 ? refText.slice(0, 57) + "…" : refText,
                    context: refText,
                    line: i + 1,
                    section: "References",
                    url: `https://scholar.google.com/scholar?q=${encodeURIComponent(refText.slice(0, 100))}`
                });
            }
        }
    }

    return sources;
}

function findSection(lines, lineIdx) {
    for (let i = lineIdx; i >= 0; i--) {
        const m = lines[i].match(/^##\s+(.+)/);
        if (m) return m[1].trim();
    }
    return "Introduction";
}

/* ─── Custom heading renderer with IDs for scroll targeting ─── */
function HeadingRenderer({ level, children }) {
    const text = typeof children === "string" ? children : (Array.isArray(children) ? children.map(c => (typeof c === "string" ? c : c?.props?.children || "")).join("") : String(children || ""));
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const Tag = `h${level}`;
    return <Tag id={id}>{children}</Tag>;
}

/* ================================================================
   ReportView Component
   ================================================================ */
export default function ReportView({ brief, target }) {
    // Hooks must be called unconditionally
    const reportBodyRef = useRef(null);
    const [activeSection, setActiveSection] = useState("");
    const [expandedSources, setExpandedSources] = useState({});
    const [showSourcePanel, setShowSourcePanel] = useState(true);

    const headings = useMemo(() => parseHeadings(brief), [brief]);
    const sources = useMemo(() => extractSources(brief), [brief]);

    // Group sources by section
    const sourcesBySection = useMemo(() => {
        const grouped = {};
        for (const src of sources) {
            if (!grouped[src.section]) grouped[src.section] = [];
            grouped[src.section].push(src);
        }
        return grouped;
    }, [sources]);

    // ... rest of hooks ...

    /* ─── Track active section on scroll ─── */
    useEffect(() => {
        const container = reportBodyRef.current;
        if (!container || headings.length === 0) return;

        const handleScroll = () => {
            const headingEls = headings.map(h => document.getElementById(h.id)).filter(Boolean);
            let current = headings[0]?.id || "";
            for (const el of headingEls) {
                const rect = el.getBoundingClientRect();
                if (rect.top <= 160) {
                    current = el.id;
                }
            }
            setActiveSection(current);
        };

        // Use window scroll since reporting is in the page flow
        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener("scroll", handleScroll);
    }, [headings]);

    /* ─── Scroll to section ─── */
    const scrollToSection = useCallback((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, []);

    /* ─── Toggle source expansion ─── */
    const toggleSource = useCallback((idx) => {
        setExpandedSources(prev => ({ ...prev, [idx]: !prev[idx] }));
    }, []);

    /* ─── PDF Download ─── */
    const handleDownloadPDF = useCallback(async () => {
        const el = reportBodyRef.current;
        if (!el) return;

        // Dynamic import for client-side only
        const html2pdf = (await import("html2pdf.js")).default;

        const opt = {
            margin: [10, 12, 10, 12],
            filename: `research-brief${target ? "-" + target.replace(/\s+/g, "-").slice(0, 40) : ""}.pdf`,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        };

        html2pdf().set(opt).from(el).save();
    }, [target]);

    /* ─── Source type icon/color ─── */
    const sourceIcon = (type) => {
        switch (type) {
            case "clinical_trial": return "🏥";
            case "literature": return "📚";
            case "reference": return "📎";
            default: return "📄";
        }
    };

    /* ─── Custom components for ReactMarkdown ─── */
    const markdownComponents = useMemo(() => ({
        h2: ({ children }) => <HeadingRenderer level={2}>{children}</HeadingRenderer>,
        h3: ({ children }) => <HeadingRenderer level={3}>{children}</HeadingRenderer>,
    }), []);

    if (!brief) return null;

    return (
        <div className="report-layout">
            {/* ─── Left: Table of Contents ─── */}
            <aside className="report-toc">
                <div className="report-toc-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                    Contents
                </div>
                <nav className="report-toc-nav">
                    {headings.map((h, i) => (
                        <button
                            key={i}
                            className={`report-toc-item ${h.level === 3 ? "indent" : ""} ${activeSection === h.id ? "active" : ""}`}
                            onClick={() => scrollToSection(h.id)}
                        >
                            <span className="toc-indicator" />
                            <span className="toc-text">{h.text}</span>
                        </button>
                    ))}
                </nav>
            </aside>

            {/* ─── Center: Report ─── */}
            <div className="report-container">
                <div className="report-header">
                    <div className="report-header-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        Research Brief {target ? `— ${target}` : ""}
                    </div>
                    <button className="report-download-btn" onClick={handleDownloadPDF} title="Download as PDF">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>PDF</span>
                    </button>
                </div>
                <div className="report-body" ref={reportBodyRef}>
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                    >
                        {brief}
                    </ReactMarkdown>
                </div>
            </div>

            {/* ─── Right: Source Citations ─── */}
            <aside className={`report-sources ${showSourcePanel ? "open" : ""}`}>
                <button
                    className="report-sources-toggle"
                    onClick={() => setShowSourcePanel(!showSourcePanel)}
                    title={showSourcePanel ? "Collapse sources" : "Expand sources"}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    Sources
                    <span className="sources-count">{sources.length}</span>
                    <svg className={`sources-chevron ${showSourcePanel ? "open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>

                {showSourcePanel && (
                    <div className="report-sources-list">
                        {Object.entries(sourcesBySection).map(([section, sectionSources]) => (
                            <div key={section} className="source-section-group">
                                <div className="source-section-label">{section}</div>
                                {sectionSources.map((src, idx) => {
                                    const globalIdx = sources.indexOf(src);
                                    return (
                                        <div key={globalIdx} className="source-item">
                                            <button
                                                className="source-item-header"
                                                onClick={() => toggleSource(globalIdx)}
                                            >
                                                <span className="source-icon">{sourceIcon(src.type)}</span>
                                                <span className="source-label">{src.label}</span>
                                                <svg className={`source-chevron ${expandedSources[globalIdx] ? "open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            </button>
                                            {expandedSources[globalIdx] && (
                                                <div className="source-item-detail">
                                                    <div className="source-context">
                                                        <span className="source-context-label">Context:</span>
                                                        <span className="source-context-text">{src.context}</span>
                                                    </div>
                                                    <div className="source-meta">
                                                        <span className="source-meta-item">
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20" /></svg>
                                                            Line {src.line}
                                                        </span>
                                                        <span className="source-meta-item">
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                                                            {src.section}
                                                        </span>
                                                    </div>
                                                    {src.url && (
                                                        <a className="source-link" href={src.url} target="_blank" rel="noopener noreferrer">
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                            {src.type === "clinical_trial" ? "View on ClinicalTrials.gov" :
                                                                src.type === "literature" ? "Search on PubMed" :
                                                                    "Search on Google Scholar"}
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                        {sources.length === 0 && (
                            <div className="sources-empty">
                                <p>No sources extracted yet.</p>
                                <p className="sources-empty-hint">Sources will appear as the research brief references journals, trials, and databases.</p>
                            </div>
                        )}
                    </div>
                )}
            </aside>
        </div>
    );
}
