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

/* ─── Build sources from structured citations (preferred) or fallback to extraction ─── */
function buildSourcesFromCitations(citationsList) {
    if (!citationsList || citationsList.length === 0) return [];

    return citationsList
        .filter((c) => c.title && c.title !== "Untitled") // skip empty entries
        .map((c) => {
            let typeLabel;
            let icon;
            switch (c.type) {
                case "clinical_trial":
                    typeLabel = "Clinical Trial";
                    icon = "🏥";
                    break;
                case "pubmed":
                    typeLabel = "PubMed";
                    icon = "📚";
                    break;
                case "semantic_scholar":
                    typeLabel = "Semantic Scholar";
                    icon = "🔬";
                    break;
                default:
                    typeLabel = "Source";
                    icon = "📄";
            }

            // Build a display label: "Author (Year)" or just title
            let label = c.title;
            if (label.length > 70) label = label.slice(0, 67) + "…";

            // Build context string
            let context = "";
            if (c.authors) context += c.authors;
            if (c.journal) context += context ? ` — ${c.journal}` : c.journal;
            if (c.year) context += context ? ` (${c.year})` : c.year;
            if (c.nct_id) context += context ? ` — ${c.nct_id}` : c.nct_id;

            return {
                type: c.type,
                typeLabel,
                icon,
                label,
                context: context || label,
                url: c.url || "",
                id: c.id,
                authors: c.authors || "",
                year: c.year || "",
                doi: c.doi || "",
                pmid: c.pmid || "",
                nct_id: c.nct_id || "",
            };
        });
}

/* ─── Fallback: extract sources from markdown (for backwards compatibility) ─── */
function extractSourcesFallback(markdown) {
    if (!markdown) return [];
    const sources = [];
    const seen = new Set();
    const lines = markdown.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("#") || line.startsWith("|--")) continue;

        // Look for NCT IDs
        const nctPattern = /NCT\d{7,8}/g;
        let nctMatch;
        while ((nctMatch = nctPattern.exec(line)) !== null) {
            const nctId = nctMatch[0];
            if (!seen.has(nctId)) {
                seen.add(nctId);
                sources.push({
                    type: "clinical_trial",
                    typeLabel: "Clinical Trial",
                    icon: "🏥",
                    label: nctId,
                    context: nctId,
                    url: `https://clinicaltrials.gov/study/${nctId}`,
                    id: `ct-fallback-${sources.length}`,
                });
            }
        }

        // Look for markdown links to papers [text](url)
        const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        let linkMatch;
        while ((linkMatch = linkPattern.exec(line)) !== null) {
            const text = linkMatch[1].trim();
            const url = linkMatch[2];
            // Skip database homepage links and NCT links (already captured)
            if (/^(clinicaltrials\.gov|pubmed|semantic\s*scholar)$/i.test(text)) continue;
            if (url.includes("clinicaltrials.gov/study/NCT") && seen.has(text)) continue;

            const key = url;
            if (!seen.has(key) && text.length > 3) {
                seen.add(key);
                let type = "literature";
                let icon = "📚";
                if (url.includes("clinicaltrials.gov")) { type = "clinical_trial"; icon = "🏥"; }
                else if (url.includes("arxiv.org")) { type = "semantic_scholar"; icon = "🔬"; }
                else if (url.includes("semanticscholar.org")) { type = "semantic_scholar"; icon = "🔬"; }

                sources.push({
                    type,
                    typeLabel: type === "clinical_trial" ? "Clinical Trial" : type === "semantic_scholar" ? "Semantic Scholar" : "Literature",
                    icon,
                    label: text.length > 70 ? text.slice(0, 67) + "…" : text,
                    context: text,
                    url,
                    id: `fb-${sources.length}`,
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
export default function ReportView({ brief, target, citations = [] }) {
    // Hooks must be called unconditionally
    const reportBodyRef = useRef(null);
    const [activeSection, setActiveSection] = useState("");
    const [expandedSources, setExpandedSources] = useState({});
    const [showSourcePanel, setShowSourcePanel] = useState(true);

    const headings = useMemo(() => parseHeadings(brief), [brief]);

    // Use structured citations from backend if available, otherwise extract from markdown
    const sources = useMemo(() => {
        const structured = buildSourcesFromCitations(citations);
        if (structured.length > 0) return structured;
        return extractSourcesFallback(brief);
    }, [citations, brief]);

    // Group sources by type
    const sourcesByType = useMemo(() => {
        const grouped = {};
        for (const src of sources) {
            const key = src.typeLabel || src.type;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(src);
        }
        return grouped;
    }, [sources]);

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

    /* ─── Custom components for ReactMarkdown ─── */
    const markdownComponents = useMemo(() => ({
        h2: ({ children }) => <HeadingRenderer level={2}>{children}</HeadingRenderer>,
        h3: ({ children }) => <HeadingRenderer level={3}>{children}</HeadingRenderer>,
        a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="report-link">
                {children}
            </a>
        ),
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
                        {Object.entries(sourcesByType).map(([typeLabel, typeSources]) => (
                            <div key={typeLabel} className="source-section-group">
                                <div className="source-section-label">{typeLabel}</div>
                                {typeSources.map((src, idx) => {
                                    const globalIdx = sources.indexOf(src);
                                    return (
                                        <div key={globalIdx} className="source-item">
                                            <button
                                                className="source-item-header"
                                                onClick={() => toggleSource(globalIdx)}
                                            >
                                                <span className="source-icon">{src.icon}</span>
                                                <span className="source-label">{src.label}</span>
                                                <svg className={`source-chevron ${expandedSources[globalIdx] ? "open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            </button>
                                            {expandedSources[globalIdx] && (
                                                <div className="source-item-detail">
                                                    <div className="source-context">
                                                        <span className="source-context-text">{src.context}</span>
                                                    </div>
                                                    {(src.doi || src.pmid || src.nct_id) && (
                                                        <div className="source-meta">
                                                            {src.pmid && (
                                                                <span className="source-meta-item">
                                                                    PMID: {src.pmid}
                                                                </span>
                                                            )}
                                                            {src.doi && (
                                                                <span className="source-meta-item">
                                                                    DOI: {src.doi}
                                                                </span>
                                                            )}
                                                            {src.nct_id && (
                                                                <span className="source-meta-item">
                                                                    {src.nct_id}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {src.url && (
                                                        <a className="source-link" href={src.url} target="_blank" rel="noopener noreferrer">
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                            View Paper
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
