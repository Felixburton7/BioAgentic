"use client";

import {
    Children,
    cloneElement,
    isValidElement,
    useState,
    useRef,
    useEffect,
    useMemo,
    useCallback,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

function getFigureNumberFromText(text) {
    if (!text) return null;
    const match = text.match(/\b(?:figure|fig\.?)\s*\[?(\d{1,3})\]?/i);
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isFinite(number) ? number : null;
}

function normalizeFigureCaption(text) {
    if (!text) return "";
    return text.replace(/^(?:figure|fig\.?)\s*\[?\d{1,3}\]?[:.\-\s]*/i, "").trim();
}

function extractFigures(markdown) {
    if (!markdown) return [];

    const figures = [];
    const seen = new Set();
    const imagePattern = /!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)/g;
    let autoNumber = 1;
    let match;

    while ((match = imagePattern.exec(markdown)) !== null) {
        const alt = (match[1] || "").trim();
        const src = (match[2] || "").trim();
        const title = (match[3] || "").trim();
        if (!src) continue;

        let number = getFigureNumberFromText(alt) || getFigureNumberFromText(title);
        while (!number && figures.some((figure) => figure.number === autoNumber)) {
            autoNumber += 1;
        }
        if (!number) {
            number = autoNumber;
            autoNumber += 1;
        }

        const dedupeKey = `${number}|${src}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const rawCaption = title || alt || "";
        const caption = normalizeFigureCaption(rawCaption);

        figures.push({
            id: `figure-${number}`,
            number,
            src,
            alt: alt || `Figure ${number}`,
            title,
            caption,
        });
    }

    return figures.sort((a, b) => a.number - b.number);
}

function renderFigureReferenceText(text, figuresByNumber, onFigureReferenceClick, keyPrefix) {
    const figureRefPattern = /(\b(?:Figure|Fig\.?)\s*\[?(\d{1,3})\]?)/gi;
    const parts = [];
    let foundMatch = false;
    let lastIndex = 0;
    let match;

    while ((match = figureRefPattern.exec(text)) !== null) {
        const fullMatch = match[1];
        const figureNumber = Number(match[2]);
        if (!figuresByNumber[figureNumber]) continue;

        foundMatch = true;

        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        parts.push(
            <button
                key={`${keyPrefix}-${match.index}-${figureNumber}`}
                type="button"
                className="figure-reference-link"
                onClick={() => onFigureReferenceClick(figureNumber)}
                title={`Open Figure ${figureNumber}`}
            >
                {fullMatch}
            </button>
        );

        lastIndex = figureRefPattern.lastIndex;
    }

    if (!foundMatch) return text;
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts;
}

function renderChildrenWithFigureReferences(children, figuresByNumber, onFigureReferenceClick, keyPrefix = "node") {
    return Children.map(children, (child, idx) => {
        const childKey = `${keyPrefix}-${idx}`;

        if (typeof child === "string") {
            return renderFigureReferenceText(child, figuresByNumber, onFigureReferenceClick, childKey);
        }

        if (isValidElement(child) && child.props?.children) {
            return cloneElement(child, {
                ...child.props,
                children: renderChildrenWithFigureReferences(
                    child.props.children,
                    figuresByNumber,
                    onFigureReferenceClick,
                    childKey
                ),
            });
        }

        return child;
    });
}

function buildSourcesFromCitations(citationsList) {
    if (!citationsList || citationsList.length === 0) return [];

    return citationsList
        .filter((c) => c.title && c.title !== "Untitled")
        .map((c) => {
            let typeLabel = "Source";
            let icon = "📄";
            if (c.type === "clinical_trial") {
                typeLabel = "Clinical Trial";
                icon = "🏥";
            } else if (c.type === "pubmed") {
                typeLabel = "PubMed";
                icon = "📚";
            } else if (c.type === "semantic_scholar") {
                typeLabel = "Semantic Scholar";
                icon = "🔬";
            } else if (c.type === "literature") {
                typeLabel = "Literature";
                icon = "📚";
            }

            let label = c.title || "Source";
            if (label.length > 70) label = label.slice(0, 67) + "…";

            let context = "";
            if (c.authors) context += c.authors;
            if (c.journal) context += context ? ` — ${c.journal}` : c.journal;
            if (c.year) context += context ? ` (${c.year})` : c.year;
            if (c.nct_id) context += context ? ` — ${c.nct_id}` : c.nct_id;

            return {
                type: c.type || "source",
                typeLabel,
                icon,
                label,
                context: context || label,
                url: c.url || "",
                id: c.id || `citation-${label}`,
                authors: c.authors || "",
                year: c.year || "",
                doi: c.doi || "",
                pmid: c.pmid || "",
                nct_id: c.nct_id || "",
                section: typeLabel,
            };
        });
}

function extractSources(markdown) {
    if (!markdown) return [];
    const sources = [];
    const seen = new Set();

    const boldPattern = /\*\*([^*]+)\*\*/g;
    let match;
    const lines = markdown.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith("#") || line.startsWith("|--")) continue;

        const nctPattern = /NCT\d{7,8}/g;
        let nctMatch;
        while ((nctMatch = nctPattern.exec(line)) !== null) {
            const nctId = nctMatch[0];
            if (!seen.has(nctId)) {
                seen.add(nctId);
                const contextStart = Math.max(0, nctMatch.index - 40);
                const contextEnd = Math.min(line.length, nctMatch.index + nctId.length + 60);
                let context = line.substring(contextStart, contextEnd).replace(/\*\*/g, "").replace(/\|/g, "").trim();
                if (contextStart > 0) context = "…" + context;
                if (contextEnd < line.length) context = context + "…";
                sources.push({
                    type: "clinical_trial",
                    label: nctId,
                    context,
                    line: i + 1,
                    section: findSection(lines, i),
                    url: `https://clinicaltrials.gov/study/${nctId}`,
                });
            }
        }

        while ((match = boldPattern.exec(line)) !== null) {
            const text = match[1].trim();
            const isSource =
                /journal|lancet|nature|science|cell|oncology|nejm|bmc|plos|cancer|research|review|annals|clinical|medicine|therapeutics|pharmacology|biochem/i.test(text) ||
                /pubmed|clinicaltrials|semantic scholar/i.test(text) ||
                (text.length > 10 && text.length < 80 && /[A-Z]/.test(text[0]) && !/^(Strong|Moderate|Weak|Phase|Total|Active|Recruiting|Completed|High|Low|Yes|No|Hypothesis|Key|NCT)/i.test(text));

            if (isSource && !seen.has(text) && text.length > 3) {
                seen.add(text);
                const idx = match.index;
                const contextStart = Math.max(0, idx - 30);
                const contextEnd = Math.min(line.length, idx + text.length + 60);
                let context = line.substring(contextStart, contextEnd).replace(/\*\*/g, "").replace(/\|/g, "").trim();
                if (contextStart > 0) context = "…" + context;
                if (contextEnd < line.length) context = context + "…";
                sources.push({
                    type: "literature",
                    label: text,
                    context,
                    line: i + 1,
                    section: findSection(lines, i),
                    url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(text)}`,
                });
            }
        }
    }

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
                    url: `https://scholar.google.com/scholar?q=${encodeURIComponent(refText.slice(0, 100))}`,
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

function HeadingRenderer({ level, children }) {
    const text = typeof children === "string"
        ? children
        : Array.isArray(children)
            ? children.map((c) => (typeof c === "string" ? c : c?.props?.children || "")).join("")
            : String(children || "");
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const Tag = `h${level}`;
    return <Tag id={id}>{children}</Tag>;
}

export default function ReportView({ brief, target, citations = [] }) {
    const reportBodyRef = useRef(null);
    const [activeSection, setActiveSection] = useState("");
    const [expandedSources, setExpandedSources] = useState({});
    const [showSourcePanel, setShowSourcePanel] = useState(true);
    const [activeFigure, setActiveFigure] = useState(null);

    const headings = useMemo(() => parseHeadings(brief), [brief]);
    const figures = useMemo(() => extractFigures(brief), [brief]);
    const sources = useMemo(() => {
        const structured = buildSourcesFromCitations(citations);
        if (structured.length > 0) return structured;
        return extractSources(brief);
    }, [citations, brief]);

    const figuresByNumber = useMemo(() => {
        const map = {};
        for (const figure of figures) {
            if (!map[figure.number]) map[figure.number] = figure;
        }
        return map;
    }, [figures]);

    const figuresBySrc = useMemo(() => {
        const map = {};
        for (const figure of figures) {
            if (!map[figure.src]) map[figure.src] = figure;
        }
        return map;
    }, [figures]);

    const sourcesBySection = useMemo(() => {
        const grouped = {};
        for (const src of sources) {
            const key = src.section || src.typeLabel || src.type || "Sources";
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(src);
        }
        return grouped;
    }, [sources]);

    useEffect(() => {
        const container = reportBodyRef.current;
        if (!container || headings.length === 0) return;

        const handleScroll = () => {
            const headingEls = headings.map((h) => document.getElementById(h.id)).filter(Boolean);
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

    useEffect(() => {
        if (!activeFigure) return;

        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                setActiveFigure(null);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [activeFigure]);

    useEffect(() => {
        setActiveFigure(null);
    }, [brief]);

    const scrollToSection = useCallback((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, []);

    const toggleSource = useCallback((idx) => {
        setExpandedSources((prev) => ({ ...prev, [idx]: !prev[idx] }));
    }, []);

    const openFigure = useCallback((figure) => {
        if (figure?.src) {
            setActiveFigure(figure);
        }
    }, []);

    const closeFigure = useCallback(() => {
        setActiveFigure(null);
    }, []);

    const handleFigureReferenceClick = useCallback((figureNumber) => {
        const figure = figuresByNumber[figureNumber];
        if (!figure) return;

        const figureElement = document.getElementById(figure.id);
        if (figureElement) {
            figureElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        setActiveFigure(figure);
    }, [figuresByNumber]);

    const enhanceFigureReferences = useCallback(
        (children, keyPrefix) => renderChildrenWithFigureReferences(
            children,
            figuresByNumber,
            handleFigureReferenceClick,
            keyPrefix
        ),
        [figuresByNumber, handleFigureReferenceClick]
    );

    const handleDownloadPDF = useCallback(async () => {
        const el = reportBodyRef.current;
        if (!el) return;

        const html2pdf = (await import("html2pdf.js")).default;

        const opt = {
            margin: [10, 12, 10, 12],
            filename: `research-brief${target ? "-" + target.replace(/\s+/g, "-").slice(0, 40) : ""}.pdf`,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        };

        html2pdf().set(opt).from(el).save();
    }, [target]);

    const sourceIcon = (type) => {
        switch (type) {
            case "clinical_trial": return "🏥";
            case "pubmed": return "📚";
            case "semantic_scholar": return "🔬";
            case "literature": return "📚";
            case "reference": return "📎";
            default: return "📄";
        }
    };

    const markdownComponents = useMemo(() => ({
        h2: ({ children }) => <HeadingRenderer level={2}>{children}</HeadingRenderer>,
        h3: ({ children }) => <HeadingRenderer level={3}>{children}</HeadingRenderer>,
        p: ({ children }) => <p>{enhanceFigureReferences(children, "p")}</p>,
        li: ({ children }) => <li>{enhanceFigureReferences(children, "li")}</li>,
        td: ({ children }) => <td>{enhanceFigureReferences(children, "td")}</td>,
        th: ({ children }) => <th>{enhanceFigureReferences(children, "th")}</th>,
        a: ({ href, children }) => {
            if (typeof href === "string" && href.startsWith("#figure-")) {
                const figureNumber = Number(href.replace("#figure-", ""));
                if (figuresByNumber[figureNumber]) {
                    return (
                        <button
                            type="button"
                            className="figure-reference-link"
                            onClick={() => handleFigureReferenceClick(figureNumber)}
                            title={`Open Figure ${figureNumber}`}
                        >
                            {children}
                        </button>
                    );
                }
            }

            const isExternal = typeof href === "string" && /^https?:\/\//i.test(href);
            return (
                <a
                    href={href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                >
                    {children}
                </a>
            );
        },
        img: ({ src, alt, title }) => {
            if (!src) return null;

            const numberFromText = getFigureNumberFromText(alt) || getFigureNumberFromText(title);
            const mappedFigure =
                (numberFromText ? figuresByNumber[numberFromText] : null) ||
                figuresBySrc[src] ||
                figures.find((figure) => figure.src === src) ||
                null;

            const fallbackNumber = numberFromText || mappedFigure?.number || null;
            const figure = mappedFigure || {
                id: fallbackNumber ? `figure-${fallbackNumber}` : undefined,
                number: fallbackNumber,
                src,
                alt: alt || (fallbackNumber ? `Figure ${fallbackNumber}` : "Figure"),
                title: title || "",
                caption: normalizeFigureCaption(title || alt || ""),
            };

            return (
                <figure id={figure.id} className="report-figure-block">
                    <button
                        type="button"
                        className="report-figure-trigger"
                        onClick={() => openFigure(figure)}
                        title={figure.number ? `Expand Figure ${figure.number}` : "Expand figure"}
                    >
                        <img
                            className="report-figure-image"
                            src={src}
                            alt={alt || figure.alt}
                            title={title || undefined}
                            loading="lazy"
                        />
                    </button>
                    <figcaption className="report-figure-caption">
                        <span className="report-figure-caption-main">
                            {figure.number ? `Figure ${figure.number}` : "Figure"}
                        </span>
                        {figure.caption ? (
                            <span className="report-figure-caption-text">{figure.caption}</span>
                        ) : (
                            <span className="report-figure-caption-text" />
                        )}
                        <span className="report-figure-caption-hint">Click image to expand</span>
                    </figcaption>
                </figure>
            );
        },
    }), [
        enhanceFigureReferences,
        figures,
        figuresByNumber,
        figuresBySrc,
        handleFigureReferenceClick,
        openFigure,
    ]);

    if (!brief) return null;

    return (
        <>
            <div className="report-layout">
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
                                    {sectionSources.map((src) => {
                                        const globalIdx = sources.indexOf(src);
                                        return (
                                            <div key={globalIdx} className="source-item">
                                                <button
                                                    className="source-item-header"
                                                    onClick={() => toggleSource(globalIdx)}
                                                >
                                                    <span className="source-icon">{src.icon || sourceIcon(src.type)}</span>
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
                                                        {(src.line || src.section || src.pmid || src.doi || src.nct_id) && (
                                                            <div className="source-meta">
                                                                {src.line && (
                                                                    <span className="source-meta-item">
                                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20" /></svg>
                                                                        Line {src.line}
                                                                    </span>
                                                                )}
                                                                {src.section && (
                                                                    <span className="source-meta-item">
                                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                                                                        {src.section}
                                                                    </span>
                                                                )}
                                                                {src.pmid && <span className="source-meta-item">PMID: {src.pmid}</span>}
                                                                {src.doi && <span className="source-meta-item">DOI: {src.doi}</span>}
                                                                {src.nct_id && <span className="source-meta-item">{src.nct_id}</span>}
                                                            </div>
                                                        )}
                                                        {src.url && (
                                                            <a className="source-link" href={src.url} target="_blank" rel="noopener noreferrer">
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                                                {src.type === "clinical_trial" ? "View on ClinicalTrials.gov" :
                                                                    src.type === "pubmed" ? "Open PubMed source" :
                                                                        src.type === "semantic_scholar" ? "Open Semantic Scholar source" :
                                                                            src.type === "literature" ? "Search on PubMed" :
                                                                                "Open source"}
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

            {activeFigure && (
                <div
                    className="figure-lightbox"
                    role="dialog"
                    aria-modal="true"
                    aria-label={activeFigure.number ? `Figure ${activeFigure.number}` : "Figure"}
                    onClick={closeFigure}
                >
                    <div className="figure-lightbox-content" onClick={(event) => event.stopPropagation()}>
                        <div className="figure-lightbox-toolbar">
                            <div className="figure-lightbox-title">
                                {activeFigure.number ? `Figure ${activeFigure.number}` : "Figure"}
                            </div>
                            <button
                                type="button"
                                className="figure-lightbox-close"
                                onClick={closeFigure}
                                aria-label="Close expanded figure"
                            >
                                Close
                            </button>
                        </div>
                        <div className="figure-lightbox-image-wrap">
                            <img
                                className="figure-lightbox-image"
                                src={activeFigure.src}
                                alt={activeFigure.alt || "Expanded figure"}
                            />
                        </div>
                        <p className="figure-lightbox-caption">
                            {activeFigure.caption || (activeFigure.number ? `Figure ${activeFigure.number}` : "Figure")}
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
