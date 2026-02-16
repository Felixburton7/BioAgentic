"use client";

import { useState, useCallback } from "react";

export default function ClarificationStep({
    focusQuestion,
    focusOptions,
    targetQuestion,
    disambiguation,
    onConfirm,
    onBack,
}) {
    const [selectedFocusIds, setSelectedFocusIds] = useState([]);
    const [customFocus, setCustomFocus] = useState("");
    const [targetAnswer, setTargetAnswer] = useState("");

    const hasOther = selectedFocusIds.includes("other");
    const canSubmit = selectedFocusIds.length > 0 && (!hasOther || customFocus.trim());

    const toggleFocus = useCallback((id) => {
        setSelectedFocusIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!canSubmit) return;

        // Build focus descriptions from all selected options
        const focusParts = selectedFocusIds.map((id) => {
            if (id === "other") {
                return `Custom Focus: ${customFocus.trim()}`;
            }
            const opt = focusOptions.find((o) => o.id === id);
            return opt ? `${opt.label} (${opt.description})` : id;
        });

        const clarification = `Research Focus: ${focusParts.join("; ")}\nSpecific Target Details: ${targetAnswer || "None provided"}`;

        onConfirm(clarification);
    };

    return (
        <div className="clarification-document fade-in">
            <div className="clarification-header">
                <p>Before I proceed, I&apos;d like to clarify a few things:</p>
            </div>

            <form onSubmit={handleSubmit} className="clarification-form-body">

                {/* Section 1: Research Focus */}
                <div className="clarification-section">
                    <h3 className="clarification-section-title">1. Research Focus</h3>
                    <p className="clarification-question-text">{focusQuestion}</p>
                    <p className="clarification-hint">Select one or more areas of focus</p>

                    <div className="clarification-options-list">
                        {focusOptions.map((option) => {
                            const isSelected = selectedFocusIds.includes(option.id);
                            return (
                                <label
                                    key={option.id}
                                    className={`clarification-radio-item ${isSelected ? "selected" : ""}`}
                                >
                                    <div className="checkbox-square">
                                        {isSelected && (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        )}
                                    </div>
                                    <input
                                        type="checkbox"
                                        value={option.id}
                                        checked={isSelected}
                                        onChange={() => toggleFocus(option.id)}
                                        className="hidden-radio"
                                    />
                                    <div className="radio-content">
                                        <span className="radio-label">{option.label}</span>
                                        <span className="radio-desc">{option.description}</span>
                                    </div>
                                </label>
                            );
                        })}

                        {/* "Other" option with custom text input */}
                        <label className={`clarification-radio-item ${hasOther ? "selected" : ""}`}>
                            <div className="checkbox-square">
                                {hasOther && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </div>
                            <input
                                type="checkbox"
                                value="other"
                                checked={hasOther}
                                onChange={() => toggleFocus("other")}
                                className="hidden-radio"
                            />
                            <div className="radio-content">
                                <span className="radio-label">Other</span>
                                <span className="radio-desc">Describe your own research focus</span>
                            </div>
                        </label>

                        {/* Custom focus text input — visible when "Other" is selected */}
                        {hasOther && (
                            <div className="clarification-custom-input-wrapper">
                                <textarea
                                    className="clarification-text-input clarification-custom-textarea"
                                    placeholder="Describe your specific research focus…"
                                    value={customFocus}
                                    onChange={(e) => setCustomFocus(e.target.value)}
                                    rows={2}
                                    autoFocus
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Section 2: Specific Target */}
                <div className="clarification-section">
                    <h3 className="clarification-section-title">2. Specific Target</h3>
                    <p className="clarification-question-text">{targetQuestion}</p>

                    <input
                        type="text"
                        className="clarification-text-input"
                        placeholder="Type your answer..."
                        value={targetAnswer}
                        onChange={(e) => setTargetAnswer(e.target.value)}
                    />
                </div>

                {/* Section 3: Disambiguation (Conditional) */}
                {disambiguation && (
                    <div className="clarification-section">
                        <h3 className="clarification-section-title" style={{ fontSize: '18px', color: '#b5762a' }}>
                            Did you mean?
                        </h3>
                        <div className="clarification-note-box">
                            <p>{disambiguation}</p>
                        </div>
                    </div>
                )}

                {/* Submit Action */}
                <div className="clarification-submit-wrapper">
                    {onBack && (
                        <button
                            type="button"
                            className="btn-bio-back"
                            onClick={onBack}
                        >
                            Back
                        </button>
                    )}
                    <button
                        type="submit"
                        className="btn-bio-submit"
                        disabled={!canSubmit}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                        Submit
                    </button>
                </div>

            </form>
        </div>
    );
}

