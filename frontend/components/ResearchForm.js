"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/* ─── Actual backend data sources for @ mentions ─── */
const RESOURCES = [
    {
        name: "ClinicalTrials.gov",
        desc: "Search clinical trials — phases, sponsors, enrollment, status",
        icon: "clinical",
    },
    {
        name: "PubMed",
        desc: "Search biomedical literature — abstracts, authors, journals",
        icon: "pubmed",
    },
    {
        name: "Semantic Scholar",
        desc: "Search academic papers — citations, abstracts, full-text links",
        icon: "scholar",
    },
];

/* Allowed file formats for attachment */
const ALLOWED_EXTENSIONS = [".txt", ".csv", ".tsv", ".json", ".fasta", ".fa", ".pdb", ".pdf", ".md"];
const ALLOWED_MIME_HINT = ".txt,.csv,.tsv,.json,.fasta,.fa,.pdb,.pdf,.md";

export default function ResearchForm({ onSubmit, isStreaming, fillPrompt, onPromptFilled }) {
    const [target, setTarget] = useState("");
    const [rounds, setRounds] = useState(2);
    const [showMentionPopup, setShowMentionPopup] = useState(false);
    const [mentionSearch, setMentionSearch] = useState("");
    const [selectedResources, setSelectedResources] = useState([]);
    const [showRoundsDropdown, setShowRoundsDropdown] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState([]); // {name, content, size}
    const textareaRef = useRef(null);
    const mentionPopupRef = useRef(null);
    const roundsRef = useRef(null);
    const fileInputRef = useRef(null);

    // Fill target from sample prompt clicks
    useEffect(() => {
        if (fillPrompt) {
            setTarget(fillPrompt);
            if (onPromptFilled) onPromptFilled();
        }
    }, [fillPrompt, onPromptFilled]);

    // Auto-resize textarea when target changes
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
        }
    }, [target]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!target.trim() || isStreaming) return;
        // Build context from resources + attached files
        let context = "";
        if (selectedResources.length > 0) {
            context += `[Focus on: ${selectedResources.join(", ")}] `;
        }
        if (attachedFiles.length > 0) {
            context += `[Attached data: ${attachedFiles.map((f) => f.name).join(", ")}]\n`;
            attachedFiles.forEach((f) => {
                context += `--- ${f.name} ---\n${f.content}\n\n`;
            });
        }
        onSubmit({ target: context + target.trim(), rounds });
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
        if (e.key === "@") {
            setTimeout(() => {
                setShowMentionPopup(true);
                setMentionSearch("");
            }, 0);
        }
        if (e.key === "Escape") {
            setShowMentionPopup(false);
            setShowRoundsDropdown(false);
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

        // Detect @ trigger
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

    const selectResource = useCallback(
        (resourceName) => {
            // Remove the @search text from input
            const lastAtIndex = target.lastIndexOf("@");
            if (lastAtIndex >= 0) {
                setTarget(target.slice(0, lastAtIndex));
            }
            if (!selectedResources.includes(resourceName)) {
                setSelectedResources((prev) => [...prev, resourceName]);
            }
            setShowMentionPopup(false);
            textareaRef.current?.focus();
        },
        [target, selectedResources]
    );

    const removeResource = (name) => {
        setSelectedResources((prev) => prev.filter((r) => r !== name));
    };

    const openMentionPopup = () => {
        setShowMentionPopup(true);
        setMentionSearch("");
        setTarget((prev) => prev + "@");
        textareaRef.current?.focus();
    };

    const filteredResources = RESOURCES.filter((r) => {
        if (!mentionSearch) return true;
        return (
            r.name.toLowerCase().includes(mentionSearch.toLowerCase()) ||
            r.desc.toLowerCase().includes(mentionSearch.toLowerCase())
        );
    });

    // File attachment handler
    const handleFileAttach = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
            const ext = "." + file.name.split(".").pop().toLowerCase();
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                alert(`File type "${ext}" not supported.\nAllowed: ${ALLOWED_EXTENSIONS.join(", ")}`);
                continue;
            }
            if (file.size > 5 * 1024 * 1024) {
                alert(`File "${file.name}" is too large (max 5MB).`);
                continue;
            }
            try {
                const content = await file.text();
                setAttachedFiles((prev) => [
                    ...prev,
                    { name: file.name, content: content.slice(0, 10000), size: file.size },
                ]);
            } catch {
                alert(`Could not read file "${file.name}".`);
            }
        }
        // Reset so the same file can be selected again
        e.target.value = "";
    };

    const removeFile = (name) => {
        setAttachedFiles((prev) => prev.filter((f) => f.name !== name));
    };

    // Close popups on outside click
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
                {/* Main input area */}
                <div className="form-input-area">
                    {/* Selected resources tags */}
                    {selectedResources.length > 0 && (
                        <div className="selected-resources">
                            {selectedResources.map((name) => (
                                <span key={name} className="resource-tag">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                                    </svg>
                                    {name}
                                    <button type="button" className="resource-tag-remove" onClick={() => removeResource(name)}>
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Attached files */}
                    {attachedFiles.length > 0 && (
                        <div className="selected-resources">
                            {attachedFiles.map((f) => (
                                <span key={f.name} className="resource-tag file-tag">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                    {f.name}
                                    <span className="file-size">({(f.size / 1024).toFixed(1)}KB)</span>
                                    <button type="button" className="resource-tag-remove" onClick={() => removeFile(f.name)}>
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    <textarea
                        ref={textareaRef}
                        className="form-textarea"
                        placeholder="Search a target, gene, mutation, or disease…"
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
                            <div className="mention-header">
                                <span className="mention-header-title">Data Sources</span>
                                <span className="mention-header-hint">Select to focus search</span>
                            </div>
                            <div className="mention-list">
                                {filteredResources.map((r) => (
                                    <button
                                        key={r.name}
                                        type="button"
                                        className={`mention-item ${selectedResources.includes(r.name) ? "selected" : ""}`}
                                        onClick={() => selectResource(r.name)}
                                    >
                                        <span className="mention-item-icon">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <ellipse cx="12" cy="5" rx="9" ry="3" />
                                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                                            </svg>
                                        </span>
                                        <div className="mention-item-info">
                                            <span className="mention-item-name">{r.name}</span>
                                            <span className="mention-item-desc">{r.desc}</span>
                                        </div>
                                        {selectedResources.includes(r.name) && (
                                            <span className="mention-item-check">✓</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                            <div className="mention-footer">
                                <span>These are the live APIs queried during research</span>
                                <kbd>Esc</kbd>
                            </div>
                        </div>
                    )}
                </div>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_MIME_HINT}
                    multiple
                    style={{ display: "none" }}
                    onChange={handleFileSelected}
                />

                {/* Bottom toolbar */}
                <div className="form-toolbar">
                    <div className="form-toolbar-left">
                        <button
                            type="button"
                            className="toolbar-btn"
                            title={`Attach file (${ALLOWED_EXTENSIONS.join(", ")})`}
                            onClick={handleFileAttach}
                            disabled={isStreaming}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="toolbar-btn toolbar-resource-btn"
                            onClick={openMentionPopup}
                            disabled={isStreaming}
                        >
                            <span className="at-symbol">@</span>
                            Resource
                        </button>
                    </div>
                    <div className="form-toolbar-right">
                        {/* Rounds dropdown */}
                        <div className="rounds-dropdown-wrapper" ref={roundsRef}>
                            <button
                                type="button"
                                className="rounds-dropdown-btn"
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
                                            onClick={() => {
                                                setRounds(r);
                                                setShowRoundsDropdown(false);
                                            }}
                                        >
                                            {r} {r === 1 ? "Round" : "Rounds"}
                                            <span className="rounds-dropdown-desc">
                                                {r === 1
                                                    ? "Quick — 1 debate cycle"
                                                    : r === 2
                                                        ? "Balanced — 2 debate cycles"
                                                        : r === 3
                                                            ? "Thorough — 3 debate cycles"
                                                            : "Deep dive — 4 debate cycles"}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Submit */}
                        <button type="submit" className="btn-submit" disabled={!target.trim() || isStreaming}>
                            {isStreaming ? (
                                <span className="spinner" />
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                    <polyline points="12 5 19 12 12 19" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
