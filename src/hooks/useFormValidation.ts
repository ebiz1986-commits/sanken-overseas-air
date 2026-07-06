import React, { useState } from 'react';

export function useFormValidation() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    const { name, validity, validationMessage, required, value } = element;
    if (!name) return;

    let error = '';
    if (!validity.valid) {
      error = validationMessage || 'Invalid value';
      if (validity.valueMissing) {
        error = 'This field is required';
      } else if (validity.typeMismatch) {
        error = 'Invalid format';
      }
    } else if (required && !value.trim() && element.type !== 'number') {
      error = 'This field is required';
    }

    setErrors(prev => ({
      ...prev,
      [name]: error
    }));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    validateField(e.target);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    // Only validate on change if the field already has an error, to clear it or update it interactively
    if (errors[e.target.name] !== undefined) {
      validateField(e.target);
    }
  };

  const validateForm = (formElement: HTMLFormElement) => {
    const newErrors: Record<string, string> = {};
    let isValid = true;
    Array.from(formElement.elements).forEach((element: any) => {
      if (element.name && 'validity' in element) {
        let error = '';
        if (!element.validity.valid) {
          error = element.validationMessage || 'Invalid value';
          if (element.validity.valueMissing) {
            error = 'This field is required';
          }
        } else if (element.required && !element.value.trim() && element.type !== 'number') {
          error = 'This field is required';
        }

        if (error) {
          newErrors[element.name] = error;
          isValid = false;
        }
      }
    });
    setErrors(newErrors);
    return isValid;
  };

  const clearErrors = () => setErrors({});

  return { errors, handleBlur, handleChange, validateForm, clearErrors };
}
