"use client";

import { useState } from "react";

export default function ClarificationStep({
    focusQuestion,
    focusOptions,
    targetQuestion,
    disambiguation,
    onConfirm,
    onBack,
}) {
    const [selectedFocusId, setSelectedFocusId] = useState("");
    const [customFocus, setCustomFocus] = useState("");
    const [targetAnswer, setTargetAnswer] = useState("");

    const canSubmit = selectedFocusId && (selectedFocusId !== "other" || customFocus.trim());

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!canSubmit) return;

        // Combine into a single clarification string for the agent
        let focusLabel, focusDesc;

        if (selectedFocusId === "other") {
            focusLabel = "Custom Focus";
            focusDesc = customFocus.trim();
        } else {
            const selectedOption = focusOptions.find(o => o.id === selectedFocusId);
            // Guard against potential data sync issues
            if (!selectedOption) return;
            focusLabel = selectedOption.label;
            focusDesc = selectedOption.description;
        }

        const clarification = `Research Focus: ${focusLabel} (${focusDesc})\nSpecific Target Details: ${targetAnswer || "None provided"}`;

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

                    <div className="clarification-options-list">
                        {focusOptions.map((option) => (
                            <label
                                key={option.id}
                                className={`clarification-radio-item ${selectedFocusId === option.id ? "selected" : ""}`}
                            >
                                <div className="radio-circle">
                                    {selectedFocusId === option.id && <div className="radio-dot" />}
                                </div>
                                <input
                                    type="radio"
                                    name="focus"
                                    value={option.id}
                                    checked={selectedFocusId === option.id}
                                    onChange={(e) => setSelectedFocusId(e.target.value)}
                                    className="hidden-radio"
                                />
                                <div className="radio-content">
                                    <span className="radio-label">{option.label}</span>
                                    <span className="radio-desc">{option.description}</span>
                                </div>
                            </label>
                        ))}

                        {/* "Other" option with custom text input */}
                        <label className={`clarification-radio-item ${selectedFocusId === "other" ? "selected" : ""}`}>
                            <div className="radio-circle">
                                {selectedFocusId === "other" && <div className="radio-dot" />}
                            </div>
                            <input
                                type="radio"
                                name="focus"
                                value="other"
                                checked={selectedFocusId === "other"}
                                onChange={(e) => setSelectedFocusId(e.target.value)}
                                className="hidden-radio"
                            />
                            <div className="radio-content">
                                <span className="radio-label">Other</span>
                                <span className="radio-desc">Describe your own research focus</span>
                            </div>
                        </label>

                        {/* Custom focus text input — visible when "Other" is selected */}
                        {selectedFocusId === "other" && (
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
