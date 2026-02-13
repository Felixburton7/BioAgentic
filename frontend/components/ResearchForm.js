"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/* ─── Resources for the @ mention popup ─── */
const RESOURCES = [
    // Databases
    { name: "PDB", desc: "Protein Data Bank — archive of 3D structural data for biological molecules", category: "Database", tag: "Structures" },
    { name: "AlphaFold DB", desc: "Database of protein structure predictions from AlphaFold", category: "Database", tag: "Structures" },
    { name: "UniProt", desc: "Universal Protein Resource — comprehensive protein sequence and functional information", category: "Database", tag: "Structures" },
    { name: "Ensembl", desc: "Genome browser for vertebrate genomes", category: "Database", tag: "Genomics" },
    { name: "NCBI Gene", desc: "Gene-specific information including nomenclature, chromosomal location, and more", category: "Database", tag: "Genomics" },
    { name: "NCBI Protein", desc: "Protein sequence database from NCBI", category: "Database", tag: "Proteomics" },
    { name: "NCBI Taxonomy", desc: "Taxonomic classification and nomenclature", category: "Database", tag: "Genomics" },
    { name: "GEO", desc: "Gene Expression Omnibus — functional genomics data repository", category: "Database", tag: "Omics" },
    { name: "dbSNP", desc: "Database of single nucleotide polymorphisms and other variations", category: "Database", tag: "Genomics" },
    { name: "ClinicalTrials.gov", desc: "Database of clinical studies conducted around the world", category: "Database", tag: "Clinical" },
    { name: "QuickGO", desc: "Gene Ontology browser from EBI", category: "Database", tag: "Annotation" },
    { name: "PubMed", desc: "Biomedical literature from MEDLINE, life science journals", category: "Database", tag: "Literature" },
    { name: "DrugBank", desc: "Comprehensive drug data with drug target information", category: "Database", tag: "Pharma" },
    // Tools
    { name: "minimap2", desc: "Versatile pairwise aligner for genomic and spliced nucleotide sequences", category: "Tools", tag: "Alignment" },
    { name: "HISAT2", desc: "Graph-based alignment of next-generation sequencing reads", category: "Tools", tag: "Alignment" },
    { name: "STAR", desc: "Spliced Transcripts Alignment to a Reference", category: "Tools", tag: "Alignment" },
    { name: "bowtie2", desc: "Fast and sensitive read alignment", category: "Tools", tag: "Alignment" },
    { name: "BLAST", desc: "Basic Local Alignment Search Tool", category: "Tools", tag: "Search" },
    { name: "Clustal Omega", desc: "Multiple sequence alignment tool", category: "Tools", tag: "MSA" },
    // Packages
    { name: "scanpy", desc: "Single-cell analysis in Python", category: "Package", tag: "scRNA" },
    { name: "anndata", desc: "Annotated multivariate data for single-cell", category: "Package", tag: "scRNA" },
    { name: "mudata", desc: "Multimodal annotated data", category: "Package", tag: "Multiomics" },
    { name: "muon", desc: "Multi-modal omics analysis framework", category: "Package", tag: "Multiomics" },
    { name: "DESeq2", desc: "Differential gene expression analysis based on negative binomial distribution", category: "Package", tag: "Bulk RNA" },
    { name: "Seurat", desc: "R toolkit for single-cell genomics", category: "Package", tag: "scRNA" },
    { name: "BioPython", desc: "Tools for biological computation in Python", category: "Package", tag: "General" },
];

const MENTION_CATEGORIES = ["All", "Database", "Tools", "Package"];

const CATEGORY_ICONS = {
    All: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
    ),
    Database: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
    ),
    Tools: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
    ),
    Package: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
    ),
};

export default function ResearchForm({ onSubmit, isStreaming }) {
    const [target, setTarget] = useState("");
    const [rounds, setRounds] = useState(2);
    const [showMentionPopup, setShowMentionPopup] = useState(false);
    const [mentionSearch, setMentionSearch] = useState("");
    const [mentionCategory, setMentionCategory] = useState("All");
    const [selectedResources, setSelectedResources] = useState([]);
    const [showRoundsDropdown, setShowRoundsDropdown] = useState(false);
    const textareaRef = useRef(null);
    const mentionPopupRef = useRef(null);
    const roundsRef = useRef(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!target.trim() || isStreaming) return;
        // Include selected resources in the target context
        const resourceContext = selectedResources.length > 0
            ? `[Resources: ${selectedResources.join(", ")}] `
            : "";
        onSubmit({ target: resourceContext + target.trim(), rounds });
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
        if (e.key === "@") {
            // Will be inserted naturally, then show popup
            setTimeout(() => {
                setShowMentionPopup(true);
                setMentionSearch("");
                setMentionCategory("All");
            }, 0);
        }
        if (e.key === "Escape") {
            setShowMentionPopup(false);
        }
    };

    const handleTextareaChange = (e) => {
        const val = e.target.value;
        setTarget(val);

        // Auto-resize textarea
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
        }

        // Check if user just typed @
        const lastAtIndex = val.lastIndexOf("@");
        if (lastAtIndex >= 0) {
            const afterAt = val.slice(lastAtIndex + 1);
            if (!afterAt.includes(" ") && afterAt.length < 30) {
                setShowMentionPopup(true);
                setMentionSearch(afterAt);
            } else {
                setShowMentionPopup(false);
            }
        } else {
            setShowMentionPopup(false);
        }
    };

    const selectResource = useCallback((resourceName) => {
        // Replace the @search with the selected resource
        const lastAtIndex = target.lastIndexOf("@");
        if (lastAtIndex >= 0) {
            const before = target.slice(0, lastAtIndex);
            setTarget(before);
        }
        if (!selectedResources.includes(resourceName)) {
            setSelectedResources((prev) => [...prev, resourceName]);
        }
        setShowMentionPopup(false);
        textareaRef.current?.focus();
    }, [target, selectedResources]);

    const removeResource = (name) => {
        setSelectedResources((prev) => prev.filter((r) => r !== name));
    };

    const openMentionPopup = () => {
        setShowMentionPopup(true);
        setMentionSearch("");
        setMentionCategory("All");
        // Add @ to input
        setTarget((prev) => prev + "@");
        textareaRef.current?.focus();
    };

    const filteredResources = RESOURCES.filter((r) => {
        const matchCategory = mentionCategory === "All" || r.category === mentionCategory;
        const matchSearch = !mentionSearch || r.name.toLowerCase().includes(mentionSearch.toLowerCase()) || r.desc.toLowerCase().includes(mentionSearch.toLowerCase());
        return matchCategory && matchSearch;
    });

    const getCategoryCounts = () => {
        const counts = { All: RESOURCES.length };
        RESOURCES.forEach((r) => {
            counts[r.category] = (counts[r.category] || 0) + 1;
        });
        return counts;
    };
    const categoryCounts = getCategoryCounts();

    // Close popup when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (mentionPopupRef.current && !mentionPopupRef.current.contains(e.target)) {
                setShowMentionPopup(false);
            }
            if (roundsRef.current && !roundsRef.current.contains(e.target)) {
                setShowRoundsDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="research-form-wrapper">
            <form className="research-form" onSubmit={handleSubmit}>
                {/* Machine specs bar */}
                <div className="form-specs-bar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span>1 machine per task</span>
                    <span className="specs-dot">·</span>
                    <span>16 cores</span>
                    <span className="specs-dot">·</span>
                    <span>Autoscaling memory</span>
                    <span className="specs-dot">·</span>
                    <span>10GB file limit</span>
                </div>

                {/* Main input area */}
                <div className="form-input-area">
                    {/* Selected resources tags */}
                    {selectedResources.length > 0 && (
                        <div className="selected-resources">
                            {selectedResources.map((name) => (
                                <span key={name} className="resource-tag">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                                    </svg>
                                    {name}
                                    <button type="button" className="resource-tag-remove" onClick={() => removeResource(name)}>×</button>
                                </span>
                            ))}
                        </div>
                    )}

                    <textarea
                        ref={textareaRef}
                        className="form-textarea"
                        placeholder="What biomedical task can I help you with today?"
                        value={target}
                        onChange={handleTextareaChange}
                        onKeyDown={handleKeyDown}
                        disabled={isStreaming}
                        rows={1}
                        autoComplete="off"
                    />

                    {/* @ Mention Popup */}
                    {showMentionPopup && (
                        <div className="mention-popup" ref={mentionPopupRef}>
                            <div className="mention-categories">
                                {MENTION_CATEGORIES.map((cat) => (
                                    <button
                                        key={cat}
                                        type="button"
                                        className={`mention-category-btn ${mentionCategory === cat ? "active" : ""}`}
                                        onClick={() => setMentionCategory(cat)}
                                    >
                                        {CATEGORY_ICONS[cat]}
                                        {cat}
                                        <span className="mention-category-count">({categoryCounts[cat] || 0})</span>
                                    </button>
                                ))}
                            </div>
                            <div className="mention-list">
                                {filteredResources.slice(0, 8).map((r) => (
                                    <button
                                        key={r.name}
                                        type="button"
                                        className="mention-item"
                                        onClick={() => selectResource(r.name)}
                                    >
                                        <span className="mention-item-icon">
                                            {r.category === "Database" ? (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                                                </svg>
                                            ) : r.category === "Tools" ? (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                                                </svg>
                                            ) : (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
                                                </svg>
                                            )}
                                        </span>
                                        <div className="mention-item-info">
                                            <span className="mention-item-name">{r.name}</span>
                                            <span className="mention-item-desc">{r.desc}</span>
                                        </div>
                                        <span className="mention-item-tag">{r.tag}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="mention-footer">
                                <span>Type to search</span>
                                <span className="mention-footer-shortcuts">
                                    <kbd>↑↓</kbd> navigate
                                    <kbd>Tab</kbd> to switch category
                                    <kbd>Esc</kbd> to close
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom toolbar */}
                <div className="form-toolbar">
                    <div className="form-toolbar-left">
                        <button type="button" className="toolbar-btn" title="Attach file" disabled={isStreaming}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49" />
                            </svg>
                        </button>
                        <button type="button" className="toolbar-btn toolbar-resource-btn" onClick={openMentionPopup} disabled={isStreaming}>
                            <span className="at-symbol">@</span>
                            Resource
                        </button>
                        <button type="button" className="toolbar-btn toolbar-workflow-btn" disabled={isStreaming}>
                            <span>+</span>
                            Workflow
                        </button>
                    </div>
                    <div className="form-toolbar-right">
                        <button type="button" className="toolbar-btn toolbar-settings-btn" disabled={isStreaming}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                            </svg>
                        </button>

                        {/* Rounds dropdown */}
                        <div className="rounds-dropdown-wrapper" ref={roundsRef}>
                            <button
                                type="button"
                                className="toolbar-btn rounds-dropdown-btn"
                                onClick={() => setShowRoundsDropdown(!showRoundsDropdown)}
                                disabled={isStreaming}
                            >
                                {rounds} {rounds === 1 ? "Round" : "Rounds"}
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>
                            {showRoundsDropdown && (
                                <div className="rounds-dropdown-menu">
                                    {[1, 2, 3, 4].map((r) => (
                                        <button
                                            key={r}
                                            type="button"
                                            className={`rounds-dropdown-item ${rounds === r ? "active" : ""}`}
                                            onClick={() => { setRounds(r); setShowRoundsDropdown(false); }}
                                        >
                                            {r} {r === 1 ? "Round" : "Rounds"}
                                            <span className="rounds-dropdown-desc">
                                                {r === 1 ? "Quick analysis" : r === 2 ? "Balanced" : r === 3 ? "Thorough" : "Deep dive"}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Submit button */}
                        <button
                            type="submit"
                            className="btn-submit"
                            disabled={!target.trim() || isStreaming}
                        >
                            {isStreaming ? (
                                <span className="spinner" />
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
