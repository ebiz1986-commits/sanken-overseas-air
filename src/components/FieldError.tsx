import React from 'react';

interface FieldErrorProps {
  error?: string;
}

export default function FieldError({ error }: FieldErrorProps) {
  if (!error) return null;
  return (
    <div className="text-red-500 text-xs mt-1 font-medium select-none animate-in fade-in slide-in-from-top-1">
      {error}
    </div>
  );
}
