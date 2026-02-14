"use client";

import { useState } from "react";

export default function ClarificationStep({ question, options, onConfirm, onCancel }) {
    const [selectedOption, setSelectedOption] = useState("");
    const [customInput, setCustomInput] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        if (selectedOption === "Other (please specify)") {
            onConfirm(customInput);
        } else {
            onConfirm(selectedOption);
        }
    };

    return (
        <div className="clarification-container fade-in">
            <div className="clarification-card">
                <h2 className="clarification-title">Clarify Research Intent</h2>
                <p className="clarification-question">{question}</p>

                <form onSubmit={handleSubmit} className="clarification-form">
                    <div className="clarification-options">
                        {options.map((option, idx) => (
                            <label key={idx} className={`clarification-option ${selectedOption === option ? "selected" : ""}`}>
                                <input
                                    type="radio"
                                    name="clarification"
                                    value={option}
                                    checked={selectedOption === option}
                                    onChange={(e) => setSelectedOption(e.target.value)}
                                />
                                <span className="option-text">{option}</span>
                            </label>
                        ))}
                    </div>

                    {selectedOption === "Other (please specify)" && (
                        <input
                            type="text"
                            className="clarification-input"
                            placeholder="Please specify..."
                            value={customInput}
                            onChange={(e) => setCustomInput(e.target.value)}
                            autoFocus
                            required
                        />
                    )}

                    <div className="clarification-actions">
                        <button type="button" className="btn-secondary" onClick={onCancel}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={!selectedOption || (selectedOption === "Other (please specify)" && !customInput.trim())}
                        >
                            Start Research
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
