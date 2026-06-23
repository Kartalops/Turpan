// This file is never imported anywhere — it should be detected as orphaned
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
}

export function UnusedButton({ label, onClick }: ButtonProps) {
  return (
    <button onClick={onClick} className="unused-button">
      {label}
    </button>
  );
}

// TODO: this component is not used yet
export function LegacyButton({ label }: { label: string }) {
  return <button className="legacy-btn">{label}</button>;
}
